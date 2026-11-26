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
    public ownNoBorder: boolean | null = null;
    public keepTitlebarHidden = false;
    public readonly createdAt = Date.now();
    public x11 = false;
    public windowedFullScreen = false;
    public fullScreenSeen: boolean;
    public maximizedSeen = false;
    public hadSlot = false;
    private lastPlacementTime = 0;
    private parked = false;
    public userResizeIgnored = false;
    private awaitingCommit = false;
    private answeredSizeRequest = false;
    private static readonly maxConfigureWaitMs = 100;
    private askedSize: { width: number, height: number } | null = null;
    private sizeBeforeAsk: { width: number, height: number } | null = null;
    // a window that commits the new position at its old size first (Chromium) is not refusing; one that stays at its
    // old size (a fixed-size window) is, once this has passed without another answer
    private static readonly partialCommitWaitMs = 500;
    private readonly partialCommitDelayer: Delayer;
    private lastAnswer: ClientWrapper.Answer | null = null;
    private static readonly maxAnswerDelayMs = 1500;
    private refusal: ClientWrapper.Answer | null = null;
    // a refusal that is far off (a fixed aspect ratio, scrcpy, wine) becomes a bound of the window's height; see
    // takeLearnedHeight
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
        this.partialCommitDelayer = new Delayer(ClientWrapper.partialCommitWaitMs, () => this.onPartialCommitWaitOver());
        this.lastPlacement = null;
        this.stateManager = new ClientState.Manager(constructInitialState(this));
    }

    // niri's min-width, min-height, max-width and max-height window rules; a rule can only tighten the limits
    public ruleLimits = { minWidth: 0, minHeight: 0, maxWidth: 0, maxHeight: 0 };
    public rulesKey = "";

    public getMinWidth() {
        return Math.max(this.kwinClient.minSize.width.ceil(), this.ruleLimits.minWidth);
    }

    public getMinHeight() {
        return Math.max(this.kwinClient.minSize.height.ceil(), this.ruleLimits.minHeight, this.learnedMinHeight);
    }

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

    public takeLearnedHeight() {
        const pending = this.learnedHeightPending;
        this.learnedHeightPending = false;
        return pending;
    }

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

    private ruleOpacity: number | null = null;
    private ignoreRuleOpacity = false;
    private baseOpacity = 1;

    public setRuleOpacity(opacity: number | null) {
        if (opacity === this.ruleOpacity) {
            return;
        }
        this.ruleOpacity = opacity;
        if (opacity === null || opacity >= 1) {
            this.ignoreRuleOpacity = false;
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

    public getPlacement() {
        return this.lastPlacement;
    }

    // like niri's configure throttling during a resize: a client that has not committed its last size is not sent
    // another one
    public place(x: number, y: number, width: number, height: number, throttle = false) {
        this.manipulatingGeometry.do(() => {
            if (this.kwinClient.resize && !this.userResizeIgnored) {
                // the window is being resized by the user: only tell the effect where to paint it
                const frame = this.kwinClient.frameGeometry;
                const moved = frame.x.round() !== x;
                setVisualPosition(String(this.kwinClient.internalId), moved ? [x, frame.y.round()] : null);
                return;
            }
            setVisualPosition(String(this.kwinClient.internalId), null);
            [x, y] = this.park(x, y);
            const current = this.kwinClient.frameGeometry;
            if (throttle && this.awaitingCommit && Date.now() - this.lastPlacementTime < ClientWrapper.maxConfigureWaitMs) {
                return;
            }
            // a client that does not take a size (a terminal that snaps to whole cells) is not asked again; it keeps its
            // place with its own size in the corner of its slot, like niri
            let frameWidth = width;
            let frameHeight = height;
            const refusal = this.refusal;
            if (refusal !== null && refusal.askedWidth === width && refusal.askedHeight === height &&
                Math.round(refusal.width) === Math.round(current.width) && Math.round(refusal.height) === Math.round(current.height)) {
                frameWidth = refusal.width; // the answer, not the read size, so fractions don't add up
                frameHeight = refusal.height;
            }
            this.lastPlacement = Qt.rect(x, y, width, height);
            if (current.x === x && current.y === y && current.width === frameWidth && current.height === frameHeight) {
                // a repeated set makes some Xwayland clients redraw
                return;
            }
            this.lastPlacementTime = Date.now();
            this.awaitingCommit = current.width !== frameWidth || current.height !== frameHeight;
            if (this.awaitingCommit) {
                this.askedSize = { width: frameWidth, height: frameHeight };
                this.sizeBeforeAsk = { width: Math.round(current.width), height: Math.round(current.height) };
                this.partialCommitDelayer.run();
            } else {
                this.partialCommitDelayer.stop();
            }
            const frame = frameWidth === width && frameHeight === height ? this.lastPlacement : Qt.rect(x, y, frameWidth, frameHeight);
            this.kwinClient.frameGeometry = frame;
            if (this.kwinClient.frameGeometry !== frame) {
                // frameGeometry assignment failed. This sometimes happens on Wayland
                // when a window is off-screen, effectively making it stuck there.
                this.kwinClient.frameGeometry.x = x; // This makes it unstuck.
                this.kwinClient.frameGeometry = frame;
            }
        });
    }

    private isPartialCommit(frame: { width: number, height: number }) {
        const before = this.sizeBeforeAsk;
        const asked = this.askedSize;
        const placed = this.lastPlacement;
        if (before === null || asked === null || placed === null) {
            return false;
        }
        const position = this.kwinClient.frameGeometry;
        return frame.width === before.width && frame.height === before.height &&
            (before.width !== asked.width || before.height !== asked.height) &&
            Math.round(position.x) === Math.round(placed.x) && Math.round(position.y) === Math.round(placed.y);
    }

    private recordAnswer(frame: { width: number, height: number }) {
        const asked = this.askedSize;
        if (asked === null || (frame.width === asked.width && frame.height === asked.height)) {
            return;
        }
        const answer = { askedWidth: asked.width, askedHeight: asked.height, width: frame.width, height: frame.height };
        const last = this.lastAnswer;
        if (last !== null && last.askedWidth === answer.askedWidth && last.askedHeight === answer.askedHeight && last.width === answer.width && last.height === answer.height) {
            this.refusal = answer;
            this.learnHeight(answer);
        }
        this.lastAnswer = answer;
    }

    private onPartialCommitWaitOver() {
        if (!this.awaitingCommit || this.askedSize === null || this.sizeBeforeAsk === null ||
            Date.now() - this.lastPlacementTime < ClientWrapper.partialCommitWaitMs) {
            return;
        }
        const frame = { width: this.kwinClient.frameGeometry.width.round(), height: this.kwinClient.frameGeometry.height.round() };
        if (frame.width === this.sizeBeforeAsk.width && frame.height === this.sizeBeforeAsk.height) {
            this.awaitingCommit = false;
            this.recordAnswer(frame);
        }
    }

    public setFrame(rect: QmlRect) {
        this.manipulatingGeometry.do(() => {
            this.kwinClient.frameGeometry = rect;
        });
    }

    // a full-screen X11 window drops full-screen mode when its corner is moved off the screen, so its real place stays
    // at the bottom-right corner and the effect paints it in the strip
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

    // the frame is what Kiri places; KWin ignores the change while the window is full-screen
    public setNoBorder(noBorder: boolean) {
        if (this.kwinClient.noBorder === noBorder) {
            return;
        }
        this.manipulatingGeometry.do(() => {
            this.kwinClient.noBorder = noBorder;
        });
    }

    public restoreTitlebar() {
        if (this.ownNoBorder !== null) {
            this.setNoBorder(this.ownNoBorder);
            this.ownNoBorder = null;
        }
    }

    public getMaximizedMode() {
        return this.maximizedMode;
    }

    // where Kiri last put the window, if KWin moved it elsewhere (KWin keeps 100 px of a window on the screen);
    // `onlyMoved` is false for a size Kiri did not ask for
    public getMovedByKwinFrom(newGeometry: QmlRect, oldGeometry: QmlRect): { rect: QmlRect, onlyMoved: boolean } | null {
        const placed = this.lastPlacement;
        if (placed === null || (placed.x === newGeometry.x && placed.y === newGeometry.y)) {
            return null;
        }
        const keptSize = placed.width === newGeometry.width && placed.height === newGeometry.height;
        const sameSize = oldGeometry.width === newGeometry.width && oldGeometry.height === newGeometry.height;
        if (!keptSize && !sameSize && !this.answeredSizeRequest) {
            return null;
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
        if (!isOnShownDesktop(this.kwinClient)) {
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
        this.partialCommitDelayer.destroy();
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
                client.windowedFullScreen = false;
            }
        });

        const noteUrgent = () => setWindowUrgent(String(client.kwinClient.internalId), client.kwinClient.demandsAttention === true);
        manager.connect(client.kwinClient.demandsAttentionChanged, noteUrgent);
        noteUrgent();

        manager.connect(client.kwinClient.maximizedAboutToChange, (mode: MaximizedMode) => {
            client.lastAnswer = null;
            client.refusal = null;
            if (mode !== MaximizedMode.Unmaximized) {
                client.maximizedSeen = true;
            }
        });

        manager.connect(client.kwinClient.interactiveMoveResizeStarted, () => {
            // the sizes the user drags the window to are not answers to Kiri's last ask
            client.askedSize = null;
            client.awaitingCommit = false;
            client.lastAnswer = null;
            client.refusal = null;
        });

        manager.connect(client.kwinClient.frameGeometryChanged, () => {
            client.answeredSizeRequest = client.awaitingCommit;
            // KWin may show the asked size for a moment: only another size right after the ask counts
            if (client.askedSize !== null && Date.now() - client.lastPlacementTime < ClientWrapper.maxAnswerDelayMs) {
                const frame = { width: client.kwinClient.frameGeometry.width.round(), height: client.kwinClient.frameGeometry.height.round() };
                if (client.awaitingCommit && client.isPartialCommit(frame)) {
                    return; // the position came first and the size follows
                }
                client.recordAnswer(frame);
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
