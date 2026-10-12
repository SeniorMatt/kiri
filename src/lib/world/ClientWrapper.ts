class ClientWrapper {
    private static readonly stateFlipWindowMs = 2000;
    private static readonly fightHoldMs = 5000;
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
    public fullScreenSeen: boolean; // has been full-screen at some point (or is)
    public maximizedSeen = false; // has been maximized at some point (or is)
    // Some games (Stardew Valley on X11) set full-screen or maximized again by themselves whenever Kiri moves or
    // resizes them while they are not focused, and drop it again a moment later, forever. Three such changes within
    // stateFlipWindowMs mean the window fights the layout: Kiri then leaves its geometry alone until it is focused.
    private stateFlips: number[] = [];
    private fightingUntil = 0;
    private lastPlacementTime = 0;
    // Stardew Valley (SDL2 on X11) leaves full-screen mode by itself a moment after its full-screen window has been
    // moved away from the screen (an unfocused full-screen window sits in its column, partly off screen), then asks for
    // full-screen again, and every move starts it over. Once a window has done that, Kiri does not move it while it is
    // full-screen and unfocused: it stays covering the screen below the other windows, which keeps it still.
    private lastFullScreenMoveTime = 0;
    private static readonly fullScreenEscapeMs = 1500;
    public escapesFullScreenMove = false;
    private awaitingCommit = false; // a size was requested and the client has not committed anything since
    private static readonly maxConfigureWaitMs = 100;

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

    // `throttle`: like niri's configure throttling while a window is resized by the user, a client that has not yet
    // committed the size it was last given is not sent another one; it gets the latest when it has committed
    // (otherwise a slow client builds up a queue of sizes and keeps changing size long after the pointer stopped)
    public place(x: number, y: number, width: number, height: number, throttle = false) {
        this.manipulatingGeometry.do(() => {
            if (this.kwinClient.resize) {
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
            const current = this.kwinClient.frameGeometry;
            if (throttle && this.awaitingCommit && Date.now() - this.lastPlacementTime < ClientWrapper.maxConfigureWaitMs) {
                return; // still waiting for the commit of the previous size
            }
            this.lastPlacement = Qt.rect(x, y, width, height);
            if (current.x === x && current.y === y && current.width === width && current.height === height) {
                // nothing to do; a repeated set makes some Xwayland clients redraw (black flashes)
                return;
            }
            this.lastPlacementTime = Date.now();
            if (this.kwinClient.fullScreen && (current.x !== x || current.y !== y)) {
                this.lastFullScreenMoveTime = this.lastPlacementTime;
            }
            this.awaitingCommit = current.width !== width || current.height !== height;
            this.kwinClient.frameGeometry = this.lastPlacement; // a commit that happens at once clears awaitingCommit
            if (this.kwinClient.frameGeometry !== this.lastPlacement) {
                // frameGeometry assignment failed. This sometimes happens on Wayland
                // when a window is off-screen, effectively making it stuck there.
                this.kwinClient.frameGeometry.x = x; // This makes it unstuck.
                this.kwinClient.frameGeometry = this.lastPlacement;
            }
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

    public focus() {
        KiriFocus.mark(this.kwinClient);
        Workspace.activeWindow = this.kwinClient;
    }

    public isFocused() {
        return Workspace.activeWindow === this.kwinClient;
    }

    public raise() {
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

    private noteStateFlip() {
        if (this.isFocused()) {
            this.stateFlips = [];
            return;
        }
        const now = Date.now();
        this.stateFlips = this.stateFlips.filter(time => now - time < ClientWrapper.stateFlipWindowMs);
        this.stateFlips.push(now);
        if (this.stateFlips.length >= 3) {
            this.fightingUntil = now + ClientWrapper.fightHoldMs;
        }
    }

    // the window fights the layout (see stateFlips) and is not focused: Kiri does not move or resize it
    public isFightingLayout() {
        if (this.fightingUntil === 0) {
            return false;
        }
        if (this.isFocused()) {
            this.fightingUntil = 0;
            this.stateFlips = [];
            return false;
        }
        if (Date.now() < this.fightingUntil) {
            return true;
        }
        this.fightingUntil = 0;
        return false;
    }

    public getMaximizedMode() {
        return this.maximizedMode;
    }

    // Where Kiri last put the window, if KWin moved it somewhere else without changing its size, e.g. KWin pulls
    // windows that are far off screen back to the screen edge when the desktop changes; null in every other case
    public getMovedByKwinFrom(newGeometry: QmlRect): QmlRect | null {
        const placed = this.lastPlacement;
        if (placed === null || placed.width !== newGeometry.width || placed.height !== newGeometry.height ||
            (placed.x === newGeometry.x && placed.y === newGeometry.y)) {
            return null;
        }
        return placed;
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
        this.transients.splice(i, 1);
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
            if (client.kwinClient.fullScreen) {
                client.fullScreenSeen = true;
            }
            if (!client.kwinClient.fullScreen && !client.isFocused() && Date.now() - client.lastFullScreenMoveTime < ClientWrapper.fullScreenEscapeMs) {
                client.escapesFullScreenMove = true;
            }
            client.noteStateFlip();
        });

        manager.connect(client.kwinClient.maximizedAboutToChange, (mode: MaximizedMode) => {
            if (mode !== MaximizedMode.Unmaximized) {
                client.maximizedSeen = true;
            }
            client.noteStateFlip();
        });

        manager.connect(client.kwinClient.frameGeometryChanged, () => {
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
