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
        this.activeWindow = null;
        runReorder(
            () => this.windows.splice(this.windows.indexOf(window), 1),
            () => this.windowRemoved.fire(window),
        );
        if (this.activeWindow === null) {
            activateRandomWindowOnDesktop(this.currentDesktop);
        };
    }

    public moveWindow(window: MockKwinClient, ...deltas: QmlPoint[]) {
        const frame = window.getFrameGeometryCopy();
        window.move = true;
        window.interactiveMoveResizeStarted.fire();

        for (const delta of deltas) {
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
            if (delta.width !== 0) {
                frame.width += delta.width;
                if (leftEdge) {
                    frame.x -= delta.width;
                }
            }
            if (delta.height !== 0) {
                frame.height += delta.height;
                if (topEdge) {
                    frame.y -= delta.height;
                }
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
        this._activeWindow = activeWindow;
        this.windowActivated.fire(activeWindow);
    }
}
