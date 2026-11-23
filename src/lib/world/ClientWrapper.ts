namespace ClientWrapper {
    export interface Answer {
        askedWidth: number;
        askedHeight: number;
        width: number;
        height: number;
    }
}

class ClientWrapper {
    public readonly stateManager: ClientState.Manager;
    private readonly transients: ClientWrapper[];
    private readonly signalManager: SignalManager;
    public preferredWidth: number;
    private maximizedMode: MaximizedMode | undefined;
    private readonly manipulatingGeometry: Doer;
    private lastPlacement: QmlRect | null; // workaround for issue #19
    public ownNoBorder: boolean | null = null; // the window's own noBorder while Kiri hides its title bar (see Tiled)
    public keepTitlebarHidden = false; // set while a dragged window passes through the floating state
    public readonly createdAt = Date.now();
    public x11 = false; // an Xwayland window (known a moment after it is created, see ClientManager.addClient)
    // niri's toggle-windowed-fullscreen: the client is told it is full-screen but stays a tile of its column
    public windowedFullScreen = false;
    public fullScreenSeen: boolean; // has been full-screen at some point (or is)
    public maximizedSeen = false; // has been maximized at some point (or is)
    public hadSlot = false; // the layout has placed it at a slot of its column (not full-screen or maximized)
    private lastPlacementTime = 0;
    private parked = false; // see park
    public userResizeIgnored = false; // KWin's interactive resize runs but the layout does not follow it (a double resize-click)
    private awaitingCommit = false; // a size was requested and the client has not committed anything since
    private answeredSizeRequest = false; // the last frame change came after Kiri had asked for a size
    private static readonly maxConfigureWaitMs = 100;
    // what the client committed in answer to the last size it was sent, and how long it took
    private askedSize: { width: number, height: number } | null = null; // the size the layout last asked of the client
    // what the client committed in answer to the last size it was sent, when that was another size
    private lastAnswer: ClientWrapper.Answer | null = null;
    private static readonly maxAnswerDelayMs = 1500; // a client may take a while (a round trip, a busy event loop)
    // the same answer to the same size twice: the client does not take that size (a terminal that snaps to whole cells)
    private refusal: ClientWrapper.Answer | null = null;
    // A refusal that is far off (a fixed aspect ratio, a window that ignores configures: scrcpy, wine) is not a snap to cells:
    // the height the client keeps becomes a bound of the window, so the column shares the rest with the others (until the
    // user sets a height). Set when `refusal` is recorded, taken by the layout (see takeLearnedHeight).
    private learnedMinHeight = 0;
    private learnedMaxHeight = Infinity;
    private learnedHeightPending = false;
    private static readonly snapToleranceHeight = 48;

    constructor(
        public readonly kwinClient: KwinClient,
        constructInitialState: (client: ClientWrapper) => ClientState.State,
        public transientFor: ClientWrapper | null,
        private readonly rulesSignalManager: SignalManager | null,
    ) {
        this.kwinClient = kwinClient;
        this.transientFor = transientFor;
        this.transients = [];
        if (transientFor !== null) {
            transientFor.addTransient(this);
        }
        this.fullScreenSeen = kwinClient.fullScreen;
        this.signalManager = ClientWrapper.initSignalManager(this);
        this.rulesSignalManager = rulesSignalManager;
        this.preferredWidth = kwinClient.frameGeometry.width.round();
        this.manipulatingGeometry = new Doer();
        this.lastPlacement = null;
        this.stateManager = new ClientState.Manager(constructInitialState(this));
    }

    // niri's min-width, min-height, max-width and max-height window rules on top of the limits the client states
    // (niri's apply_min_size and apply_max_size: a rule can only tighten the limits, a max of 0 is no limit)
    public ruleLimits = { minWidth: 0, minHeight: 0, maxWidth: 0, maxHeight: 0 };
    public rulesKey = ""; // what the rules gave the window the last time they were applied

    public getMinWidth() {
        return Math.max(this.kwinClient.minSize.width.ceil(), this.ruleLimits.minWidth);
    }

    public getMinHeight() {
        return Math.max(this.kwinClient.minSize.height.ceil(), this.ruleLimits.minHeight, this.learnedMinHeight);
    }

    // the largest width; 0 when the client has none (the size KWin reports for no limit is huge)
    public getMaxWidth() {
        return ClientWrapper.limit(this.kwinClient.maxSize.width.floor(), this.ruleLimits.maxWidth);
    }

    public getMaxHeight() {
        const max = ClientWrapper.limit(this.kwinClient.maxSize.height.floor(), this.ruleLimits.maxHeight);
        return this.learnedMaxHeight === Infinity ? max : max > 0 ? Math.min(max, this.learnedMaxHeight) : this.learnedMaxHeight;
    }

    private learnHeight(answer: ClientWrapper.Answer) {
        if (this.kwinClient.fullScreen || this.windowedFullScreen || this.maximizedSeen ||
            Math.abs(answer.height - answer.askedHeight) <= ClientWrapper.snapToleranceHeight) {
            return;
        }
        if (answer.height < answer.askedHeight) {
            this.learnedMaxHeight = Math.round(answer.height);
        } else {
            this.learnedMinHeight = Math.round(answer.height);
        }
        this.learnedHeightPending = true;
    }

    // True once after a refusal made the client's height a bound: the column has to share its height again
    public takeLearnedHeight() {
        const pending = this.learnedHeightPending;
        this.learnedHeightPending = false;
        return pending;
    }

    // the user chose a height: whatever the client did before does not count, it is asked again
    public forgetLearnedHeight() {
        this.learnedMinHeight = 0;
        this.learnedMaxHeight = Infinity;
        this.learnedHeightPending = false;
        this.refusal = null;
        this.lastAnswer = null;
    }

    private static limit(clientMax: number, ruleMax: number) {
        if (ruleMax <= 0) {
            return clientMax;
        }
        return clientMax <= 0 ? ruleMax : Math.min(clientMax, ruleMax);
    }

    // niri's opacity window rule (null: none) and toggle-window-rule-opacity, which turns the rule off for the window
    private ruleOpacity: number | null = null;
    private ignoreRuleOpacity = false;
    private baseOpacity = 1; // the opacity Kiri itself wants (off-screen windows)

    public setRuleOpacity(opacity: number | null) {
        if (opacity === this.ruleOpacity) {
            return;
        }
        this.ruleOpacity = opacity;
        if (opacity === null || opacity >= 1) {
            this.ignoreRuleOpacity = false; // niri resets the toggle when the rule no longer makes the window translucent
        }
        this.applyOpacity();
    }

    public toggleRuleOpacity() {
        this.ignoreRuleOpacity = !this.ignoreRuleOpacity;
        this.applyOpacity();
    }

    public hasRuleOpacity() {
        return this.ruleOpacity !== null && this.ruleOpacity < 1;
    }

    public setBaseOpacity(opacity: number) {
        this.baseOpacity = opacity;
        this.applyOpacity();
    }

    private applyOpacity() {
        const rule = this.ruleOpacity === null || this.ignoreRuleOpacity ? 1 : Math.min(Math.max(this.ruleOpacity, 0), 1);
        const opacity = this.baseOpacity * rule;
        if (this.kwinClient.opacity !== opacity) {
            this.kwinClient.opacity = opacity;
        }
    }

    // where Kiri last put the window (its frame, before the client has committed the size), null before the first placement
    public getPlacement() {
        return this.lastPlacement;
    }

    // `throttle`: like niri's configure throttling while a window is resized by the user, a client that has not yet
    // committed the size it was last given is not sent another one; it gets the latest when it has committed
    // (otherwise a slow client builds up a queue of sizes and keeps changing size long after the pointer stopped)
    public place(x: number, y: number, width: number, height: number, throttle = false) {
        this.manipulatingGeometry.do(() => {
            if (this.kwinClient.resize && !this.userResizeIgnored) {
                // The window is being manually resized: KWin recomputes its geometry from the pointer at every
                // step, so moving it would fight with the user. Only tell the effect where to paint it.
                // The view only ever moves sideways, and the window below the pointer should stay where KWin has it
                // vertically (the neighbours already have their new sizes, this window's height is still being committed).
                const frame = this.kwinClient.frameGeometry;
                const moved = frame.x.round() !== x;
                setVisualPosition(String(this.kwinClient.internalId), moved ? [x, frame.y.round()] : null);
                return;
            }
            setVisualPosition(String(this.kwinClient.internalId), null);
            [x, y] = this.park(x, y);
            const current = this.kwinClient.frameGeometry;
            if (throttle && this.awaitingCommit && Date.now() - this.lastPlacementTime < ClientWrapper.maxConfigureWaitMs) {
                return; // still waiting for the commit of the previous size
            }
            // A client that does not take a size (it answers the same size with the same other one, as a terminal that
            // snaps to whole cells does) is not asked again, it would only answer the same and the window would flip
            // between the two sizes for ever; it keeps its place with the size it chose, in the corner of its slot (niri:
            // the tile has the slot's size, the window sits at its top-left). The same for a maximized or full-screen window
            // that answers with a size of its own (a game): it keeps that size in its tile, and the resize loop ends.
            let frameWidth = width;
            let frameHeight = height;
            const refusal = this.refusal;
            if (refusal !== null && refusal.askedWidth === width && refusal.askedHeight === height &&
                Math.round(refusal.width) === Math.round(current.width) && Math.round(refusal.height) === Math.round(current.height)) {
                frameWidth = current.width;
                frameHeight = current.height;
            }
            this.lastPlacement = Qt.rect(x, y, width, height);
            if (current.x === x && current.y === y && current.width === frameWidth && current.height === frameHeight) {
                // nothing to do; a repeated set makes some Xwayland clients redraw (black flashes)
                return;
            }
            this.lastPlacementTime = Date.now();
            this.awaitingCommit = current.width !== frameWidth || current.height !== frameHeight;
            if (this.awaitingCommit) {
                this.askedSize = { width: frameWidth, height: frameHeight };
            }
            const frame = frameWidth === width && frameHeight === height ? this.lastPlacement : Qt.rect(x, y, frameWidth, frameHeight);
            this.kwinClient.frameGeometry = frame; // a commit that happens at once clears awaitingCommit
            if (this.kwinClient.frameGeometry !== frame) {
                // frameGeometry assignment failed. This sometimes happens on Wayland
                // when a window is off-screen, effectively making it stuck there.
                this.kwinClient.frameGeometry.x = x; // This makes it unstuck.
                this.kwinClient.frameGeometry = frame;
            }
        });
    }

    // puts the frame where the user's resize should have left it (see Column.onUserResizeRequested)
    public setFrame(rect: QmlRect) {
        this.manipulatingGeometry.do(() => {
            this.kwinClient.frameGeometry = rect;
        });
    }

    // A full-screen X11 window (Stardew Valley, SDL2) drops full-screen mode when its top-left corner is moved out of the
    // screen, and every move of niri's strip puts it there. Like xwayland-satellite, which never lets an X11 client see
    // its position, Kiri keeps the window's real place in the bottom-right corner of the screen, where it is content
    // and gets no input, and the compiled effect paints it at its place in the strip. Back at the origin of the
    // screen (focused, scrolled into view) it is a normal window.
    private park(x: number, y: number): [number, number] {
        const kwinClient = this.kwinClient;
        const id = String(kwinClient.internalId);
        if (this.x11 && kwinClient.fullScreen && !this.windowedFullScreen && canParkWindows()) {
            const area = Workspace.clientArea(ClientAreaOption.FullScreenArea, kwinClient.output, Clients.getKwinDesktopApprox(kwinClient));
            const originX = area.x.round();
            const originY = area.y.round();
            if (x !== originX || y !== originY) {
                this.parked = true;
                setParkedPosition(id, [x, y]);
                return [originX + area.width.round() - 1, originY + area.height.round() - 1];
            }
        }
        this.parked = false;
        setParkedPosition(id, null);
        return [x, y];
    }

    // the window leaves the layout (floating, closing): it goes back to where KWin thinks a full-screen window is
    public unpark() {
        if (!this.parked) {
            return;
        }
        const kwinClient = this.kwinClient;
        this.parked = false;
        setParkedPosition(String(kwinClient.internalId), null);
        const area = Workspace.clientArea(ClientAreaOption.FullScreenArea, kwinClient.output, Clients.getKwinDesktopApprox(kwinClient));
        this.manipulatingGeometry.do(() => {
            kwinClient.frameGeometry = Qt.rect(area.x.round(), area.y.round(), kwinClient.frameGeometry.width.round(), kwinClient.frameGeometry.height.round());
        });
    }

    private moveTransient(dx: number, dy: number, kwinDesktops: KwinDesktop[]) {
        if (this.stateManager.getState() instanceof ClientState.Floating) {
            if (Clients.isOnOneOfVirtualDesktops(this.kwinClient, kwinDesktops)) {
                const frame = this.kwinClient.frameGeometry;
                this.kwinClient.frameGeometry = Qt.rect(
                    frame.x.round() + dx,
                    frame.y.round() + dy,
                    frame.width.round(),
                    frame.height.round(),
                );
            }

            for (const transient of this.transients) {
                transient.moveTransient(dx, dy, kwinDesktops);
            }
        }
    }

    public moveTransients(dx: number, dy: number) {
        for (const transient of this.transients) {
            transient.moveTransient(dx, dy, this.kwinClient.desktops);
        }
    }

    // A window that was closed a moment ago may still be in the layout until KWin reports the removal; raising or
    // activating it only makes KWin complain ("closed window cannot be restacked") and can leave nothing focused.
    public isGone() {
        return !Workspace.windows.includes(this.kwinClient);
    }

    public focus() {
        if (this.isGone()) {
            return;
        }
        KiriFocus.mark(this.kwinClient);
        activateWindow(this.kwinClient, "focus");
    }

    public isFocused() {
        return Workspace.activeWindow === this.kwinClient;
    }

    public raise() {
        if (this.isGone()) {
            return;
        }
        Workspace.raiseWindow(this.kwinClient);
    }

    public setMaximize(horizontally: boolean, vertically: boolean) {
        if (!this.kwinClient.maximizable) {
            this.maximizedMode = MaximizedMode.Unmaximized;
            return;
        }

        if (this.maximizedMode === undefined) {
            if (horizontally && vertically) {
                this.maximizedMode = MaximizedMode.Maximized;
            } else if (horizontally) {
                this.maximizedMode = MaximizedMode.Horizontally;
            } else if (vertically) {
                this.maximizedMode = MaximizedMode.Vertically;
            } else {
                this.maximizedMode = MaximizedMode.Unmaximized;
            }
        }

        if (horizontally || vertically) {
            this.maximizedSeen = true;
        }
        this.manipulatingGeometry.do(() => {
            this.kwinClient.setMaximize(vertically, horizontally);
        });
    }

    public setFullScreen(fullScreen: boolean) {
        if (!this.kwinClient.fullScreenable) {
            return;
        }

        this.manipulatingGeometry.do(() => {
            this.kwinClient.fullScreen = fullScreen;
        });
    }

    // The frame geometry is what Kiri places, so a window without a title bar gets exactly the size of its slot
    // (the client area then equals the frame). KWin ignores the change while the window is full-screen.
    public setNoBorder(noBorder: boolean) {
        if (this.kwinClient.noBorder === noBorder) {
            return;
        }
        this.manipulatingGeometry.do(() => {
            this.kwinClient.noBorder = noBorder;
        });
    }

    // gives the window its own title bar setting back (after a drag that did not end in the grid)
    public restoreTitlebar() {
        if (this.ownNoBorder !== null) {
            this.setNoBorder(this.ownNoBorder);
            this.ownNoBorder = null;
        }
    }

    public getMaximizedMode() {
        return this.maximizedMode;
    }

    // Where Kiri last put the window, if KWin moved it somewhere else, e.g. KWin pulls windows that are far off screen
    // back to the screen edge when the desktop changes; null in every other case. `rect` has the window's own size.
    // `onlyMoved` is false when the window has a size that Kiri did not ask for and the layout has not seen yet.
    // KWin keeps 100 px of a window on the screen whenever the window commits an answer to a configure, so a window
    // that answers with another size than it was given (a terminal that snaps to whole cells) is pulled in, and
    // the layout asking for the size again only makes it commit and be pulled again: the window goes back to its
    // slot with the size it has.
    public getMovedByKwinFrom(newGeometry: QmlRect, oldGeometry: QmlRect): { rect: QmlRect, onlyMoved: boolean } | null {
        const placed = this.lastPlacement;
        if (placed === null || (placed.x === newGeometry.x && placed.y === newGeometry.y)) {
            return null;
        }
        const keptSize = placed.width === newGeometry.width && placed.height === newGeometry.height;
        const sameSize = oldGeometry.width === newGeometry.width && oldGeometry.height === newGeometry.height;
        if (!keptSize && !sameSize && !this.answeredSizeRequest) {
            return null; // the client moved and resized itself
        }
        return {
            rect: Qt.rect(placed.x, placed.y, newGeometry.width, newGeometry.height),
            onlyMoved: keptSize || sameSize,
        };
    }

    public isManipulatingGeometry(newGeometry: QmlRect | null) {
        if (newGeometry !== null && newGeometry === this.lastPlacement) {
            return true;
        }
        return this.manipulatingGeometry.isDoing();
    }

    private addTransient(transient: ClientWrapper) {
        this.transients.push(transient);
    }

    private removeTransient(transient: ClientWrapper) {
        const i = this.transients.indexOf(transient);
        if (i >= 0) {
            this.transients.splice(i, 1);
        }
    }

    public ensureTransientsVisible(screenSize: QmlRect) {
        for (const transient of this.transients) {
            if (transient.stateManager.getState() instanceof ClientState.Floating) {
                transient.ensureVisible(screenSize);
                transient.ensureTransientsVisible(screenSize);
            }
        }
    }

    public ensureVisible(screenSize: QmlRect) {
        if (!Clients.isOnVirtualDesktop(this.kwinClient, Workspace.currentDesktop)) {
            return;
        }
        const frame = roundQtRect(this.kwinClient.frameGeometry);
        if (frame.x < screenSize.x) {
            this.place(screenSize.x, frame.y, frame.width, frame.height);
        } else if (rectRight(frame) > rectRight(screenSize)) {
            this.place(rectRight(screenSize) - frame.width, frame.y, frame.width, frame.height);
        }
    }

    public destroy(passFocus: FocusPassing.Type) {
        setParkedPosition(String(this.kwinClient.internalId), null);
        setWindowUrgent(String(this.kwinClient.internalId), false);
        setWindowDecorations(String(this.kwinClient.internalId), null);
        this.stateManager.destroy(passFocus);
        this.signalManager.destroy();
        if (this.rulesSignalManager !== null) {
            this.rulesSignalManager.destroy();
        }
        if (this.transientFor !== null) {
            this.transientFor.removeTransient(this);
        }
        for (const transient of this.transients) {
            transient.transientFor = null;
        }
    }

    private static initSignalManager(client: ClientWrapper) {
        const manager = new SignalManager();

        manager.connect(client.kwinClient.fullScreenChanged, () => {
            client.lastAnswer = null;
            client.refusal = null;
            if (client.kwinClient.fullScreen) {
                client.fullScreenSeen = true;
            } else {
                client.windowedFullScreen = false; // the client left full-screen mode (niri: unset-fullscreen ends the windowed one too)
            }
        });

        // niri's urgent colours: the compiled effect paints the ring, border and tab indicator of a window that asks for attention
        const noteUrgent = () => setWindowUrgent(String(client.kwinClient.internalId), client.kwinClient.demandsAttention === true);
        manager.connect(client.kwinClient.demandsAttentionChanged, noteUrgent);
        noteUrgent();

        manager.connect(client.kwinClient.maximizedAboutToChange, (mode: MaximizedMode) => {
            client.lastAnswer = null; // what the client answered to the size of the other mode says nothing about this one
            client.refusal = null;
            if (mode !== MaximizedMode.Unmaximized) {
                client.maximizedSeen = true;
            }
        });

        manager.connect(client.kwinClient.frameGeometryChanged, () => {
            client.answeredSizeRequest = client.awaitingCommit;
            // (KWin may show the asked size for a moment before the client's own comes: only another size counts, and only
            // right after the ask)
            if (client.askedSize !== null && Date.now() - client.lastPlacementTime < ClientWrapper.maxAnswerDelayMs) {
                const frame = { width: client.kwinClient.frameGeometry.width.round(), height: client.kwinClient.frameGeometry.height.round() };
                if (frame.width !== client.askedSize.width || frame.height !== client.askedSize.height) {
                    const answer = { askedWidth: client.askedSize.width, askedHeight: client.askedSize.height, width: frame.width, height: frame.height };
                    const last = client.lastAnswer;
                    if (last !== null && last.askedWidth === answer.askedWidth && last.askedHeight === answer.askedHeight && last.width === answer.width && last.height === answer.height) {
                        client.refusal = answer;
                        client.learnHeight(answer);
                    }
                    client.lastAnswer = answer;
                }
            }
            client.awaitingCommit = false;
        });
        manager.connect(client.kwinClient.maximizedAboutToChange, (maximizedMode: MaximizedMode) => {
            if (maximizedMode !== MaximizedMode.Unmaximized && client.kwinClient.tile !== null) {
                client.kwinClient.tile = null;
            }
            client.maximizedMode = maximizedMode;
        });

        return manager;
    }
}
