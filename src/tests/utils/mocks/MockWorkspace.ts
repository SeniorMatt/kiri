class MockWorkspace {
    public readonly __brand = "Workspace";

    public activities = ["test-activity"];
    public desktops: KwinDesktop[] = [
        { __brand: "KwinDesktop", id: "desktop1", name: "Desktop 1" },
        { __brand: "KwinDesktop", id: "desktop2", name: "Desktop 2" },
    ];
    public currentActivity = this.activities[0];
    public activeScreen: Output = { __brand: "Output", name: "DP-1" };
    public screens: Output[] = [this.activeScreen];
    public readonly windows: MockKwinClient[] = [];
    public cursorPos = new MockQmlPoint(0, 0);

    private _currentDesktop = this.desktops[0];
    private _activeWindow: KwinClient|null = null;

    public readonly currentDesktopChanged = new MockQSignal<[]>();
    public readonly windowAdded = new MockQSignal<[KwinClient]>();
    public readonly windowRemoved = new MockQSignal<[KwinClient]>();
    public readonly windowActivated = new MockQSignal<[KwinClient|null]>();
    public readonly cursorPosChanged = new MockQSignal<[]>();
    public readonly stackingOrder: KwinClient[] = [];
    public readonly screensChanged = new MockQSignal<[]>();
    public readonly activitiesChanged = new MockQSignal<[]>();
    public readonly desktopsChanged = new MockQSignal<[]>();
    public readonly currentActivityChanged = new MockQSignal<[]>();
    public readonly virtualScreenSizeChanged = new MockQSignal<[]>();

    public panelLeft = 0; // width of a panel reserved on the left screen edge

    public clientArea(option: ClientAreaOption, output: Output, kwinDesktop: KwinDesktop) {
        if (this.panelLeft > 0 && option !== ClientAreaOption.FullScreenArea && option !== ClientAreaOption.ScreenArea && option !== ClientAreaOption.FullArea) {
            return new MockQmlRect(screen.x + this.panelLeft, screen.y, screen.width - this.panelLeft, screen.height);
        }
        return screen;
    }

    public raiseWindow(kwinClient: KwinClient) {}

    // the compiled effect's pointer warp (see warpPointerTo); like KWin, the move is announced
    public readonly warps: { x: number, y: number }[] = [];
    public warpPointerTo(x: number, y: number) {
        this.warps.push({ x, y });
        this.cursorPos = new MockQmlPoint(x, y);
        this.cursorPosChanged.fire();
    }

    // Real KWin does not announce the activation of the window that is the active one already
    public ignoreSameActivation = false;

    private desktopCounter = 100;

    public createDesktop(position: number, name: string) {
        this.desktops.splice(position, 0, { __brand: "KwinDesktop", id: "desktop" + (this.desktopCounter++), name: name });
        this.desktopsChanged.fire();
    }

    public removeDesktop(desktop: KwinDesktop) {
        const index = this.desktops.indexOf(desktop);
        if (index < 0) {
            return;
        }
        this.desktops.splice(index, 1);
        for (const window of this.windows) {
            if (window.desktops.includes(desktop)) {
                window.desktops = window.desktops.filter(d => d !== desktop);
                if (window.desktops.length === 0) {
                    window.desktops = [this.desktops[Math.max(0, index - 1)]];
                }
            }
        }
        if (this._currentDesktop === desktop) {
            this._currentDesktop = this.desktops[Math.max(0, index - 1)];
            this.currentDesktopChanged.fire();
        }
        this.desktopsChanged.fire();
    }

    public createWindows(...kwinClients: MockKwinClient[]) {
        for (const kwinClient of kwinClients) {
            this.windows.push(kwinClient);
            this.windowAdded.fire(kwinClient);
            this.activeWindow = kwinClient;
        }
    }

    // like KWin: the new window is activated before the script hears that it was added
    public createWindowActivatedFirst(frame: MockQmlRect) {
        const client = new MockKwinClient(frame);
        this.windows.push(client);
        this.activeWindow = client;
        this.windowAdded.fire(client);
        return client;
    }

    // a window that does not take the focus
    public createWindowInBackground(frame: MockQmlRect) {
        const client = new MockKwinClient(frame);
        this.windows.push(client);
        this.windowAdded.fire(client);
        return client;
    }

    public createClients(n: number) {
        return this.createClientsWithWidths(...Array(n).fill(100));
    }

    public createClientsWithFrames(...frames: MockQmlRect[]) {
        const clients = frames.map(rect => new MockKwinClient(rect));
        clients.forEach((client, index) => client.caption = `Client ${index}`);
        this.createWindows(...clients);
        return clients;
    }

    public createClientsWithWidths(...widths: number[]) {
        return this.createClientsWithFrames(...widths.map(width => new MockQmlRect(randomInt(100), randomInt(100), width, 100+randomInt(400))));
    }

    public removeWindow(window: MockKwinClient) {
        if (this.activeWindow === window) {
            this.activeWindow = null; // like KWin: closing another window leaves the focus where it is
        }
        runReorder(
            () => this.windows.splice(this.windows.indexOf(window), 1),
            () => this.windowRemoved.fire(window),
        );
        if (this.activeWindow === null) {
            activateRandomWindowOnDesktop(this.currentDesktop);
        };
    }

    // a step is a pointer move, or a function that runs between two moves (the other mouse button, for example)
    public moveWindow(window: MockKwinClient, ...deltas: (QmlPoint | (() => void))[]) {
        const frame = window.getFrameGeometryCopy();
        window.move = true;
        window.interactiveMoveResizeStarted.fire();

        for (const delta of deltas) {
            if (typeof delta === "function") {
                delta();
                continue;
            }
            if (delta.x !== 0) {
                frame.x += delta.x;
            }
            if (delta.y !== 0) {
                frame.y += delta.y;
            }
            this.cursorPos = new MockQmlPoint(this.cursorPos.x + delta.x, this.cursorPos.y + delta.y); // the pointer drags the window
            runOneOf(
                () => window.getActualFrameGeometry().set(frame),
                () => window.frameGeometry = frame,
            );
        }

        window.move = false;
        window.interactiveMoveResizeFinished.fire();
    }

    public resizeWindow(window: MockKwinClient, edgeResize: boolean, leftEdge: boolean, topEdge: boolean, ...deltas: QmlSize[]) {
        const frame = window.getFrameGeometryCopy();
        if (edgeResize) {
            this.cursorPos = new MockQmlPoint(
                leftEdge ? frame.x : rectRight(frame),
                topEdge ? frame.y : rectBottom(frame),
            );
        } else {
            this.cursorPos = new MockQmlPoint(
                Math.round(frame.x + frame.width/2),
                Math.round(frame.y + frame.height/2),
            );
        }
        window.resize = true;
        window.interactiveMoveResizeStarted.fire();

        for (const delta of deltas) {
            // like KWin, an interactive resize stops at the window's minimum size (and never goes below 1 px)
            if (delta.width !== 0) {
                const width = Math.max(frame.width + delta.width, window.minSize.width, 1);
                if (leftEdge) {
                    frame.x -= width - frame.width;
                }
                frame.width = width;
            }
            if (delta.height !== 0) {
                const height = Math.max(frame.height + delta.height, window.minSize.height, 1);
                if (topEdge) {
                    frame.y -= height - frame.height;
                }
                frame.height = height;
            }
            window.interactiveMoveResizeStepped.fire(frame.clone()); // KWin tells the geometry the pointer asks for, before the client commits it
            runOneOf(
                () => window.getActualFrameGeometry().set(frame),
                () => window.frameGeometry = frame,
            );
        }

        window.resize = false;
        window.interactiveMoveResizeFinished.fire();
    }

    public get currentDesktop() {
        return this._currentDesktop;
    }

    public set currentDesktop(currentDesktop: KwinDesktop) {
        this._currentDesktop = currentDesktop;
        this.currentDesktopChanged.fire();
    }

    public get activeWindow() {
        return this._activeWindow;
    }

    public set activeWindow(activeWindow: KwinClient|null) {
        if (this.ignoreSameActivation && activeWindow !== null && activeWindow === this._activeWindow) {
            return;
        }
        this._activeWindow = activeWindow;
        this.windowActivated.fire(activeWindow);
    }
}
