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
    // Plasma 6.7's "switch desktops independently for each screen": every output has its own current desktop
    private perScreenDesktops = false;
    private readonly outputDesktops = new Map<string, KwinDesktop>();
    private _activeWindow: KwinClient|null = null;

    public readonly currentDesktopChanged = new MockQSignal<[KwinDesktop|undefined, KwinDesktop|undefined, Output|undefined]>();
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

    // where each output is, for tests with more than one (see setOutputs); without any, every output is `screen`
    public readonly outputRects = new Map<string, MockQmlRect>();

    // the outputs in a row or any other layout: [name, rect] each; the first one is the active screen
    public setOutputs(...outputs: [string, MockQmlRect][]) {
        this.outputRects.clear();
        const old = this.screens;
        this.screens = outputs.map(([name, rect]) => {
            this.outputRects.set(name, rect);
            return old.find(output => output.name === name) ?? { __brand: "Output", name: name } as Output;
        });
        this.activeScreen = this.screens[0];
        this.screensChanged.fire();
    }

    // an output is unplugged (its windows are squeezed into the others by KWin: the tests do that) or plugged in again
    public removeOutput(name: string) {
        const rect = this.outputRects.get(name);
        this.outputRects.delete(name);
        this.screens = this.screens.filter(output => output.name !== name);
        if (this.activeScreen.name === name) {
            this.activeScreen = this.screens[0];
        }
        return rect;
    }

    public addOutput(name: string, rect: MockQmlRect) {
        this.outputRects.set(name, rect);
        this.screens = [...this.screens, { __brand: "Output", name: name } as Output];
    }

    public getOutputRect(output: Output) {
        return this.outputRects.get(output.name) ?? screen;
    }

    // KWin puts a window on the output that has the center of its frame, or the nearest one
    public outputAt(x: number, y: number): Output {
        let best = this.screens[0];
        let bestDistance = Infinity;
        for (const output of this.screens) {
            const rect = this.getOutputRect(output);
            const dx = Math.max(rect.x - x, 0, x - rectRight(rect));
            const dy = Math.max(rect.y - y, 0, y - rectBottom(rect));
            const distance = dx * dx + dy * dy;
            if (distance < bestDistance) {
                best = output;
                bestDistance = distance;
            }
        }
        return best;
    }

    public clientArea(option: ClientAreaOption, output: Output, kwinDesktop: KwinDesktop) {
        let rect = output === undefined ? screen : this.getOutputRect(output);
        if (option === ClientAreaOption.FullArea && this.outputRects.size > 0) {
            const rects = Array.from(this.outputRects.values());
            const left = Math.min(...rects.map(r => r.x));
            const top = Math.min(...rects.map(r => r.y));
            rect = new MockQmlRect(left, top, Math.max(...rects.map(r => rectRight(r))) - left, Math.max(...rects.map(r => rectBottom(r))) - top);
        }
        if (this.panelLeft > 0 && option !== ClientAreaOption.FullScreenArea && option !== ClientAreaOption.ScreenArea && option !== ClientAreaOption.FullArea) {
            return new MockQmlRect(rect.x + this.panelLeft, rect.y, rect.width - this.panelLeft, rect.height);
        }
        return rect;
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
        if (this.perScreenDesktops) {
            for (const output of this.screens) {
                if (this.currentDesktopForScreen(output) === desktop) {
                    const next = this.desktops[Math.max(0, index - 1)];
                    this.outputDesktops.set(output.name, next);
                    this.currentDesktopChanged.fire(desktop, next, output);
                }
            }
        } else if (this._currentDesktop === desktop) {
            this._currentDesktop = this.desktops[Math.max(0, index - 1)];
            this.fireDesktopChanged(desktop, this._currentDesktop);
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

    private static pressClock = 0;

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
        // a press that soon after another is niri's double resize-click: every resize here is a press of its own
        const now = Date.now;
        MockWorkspace.pressClock += 1000;
        Date.now = () => now() + MockWorkspace.pressClock;
        try {
            window.interactiveMoveResizeStarted.fire();
        } finally {
            Date.now = now;
        }

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

    // turn the per-screen desktops on (every output starts on the current desktop) or off again
    public setPerScreenDesktops(enabled: boolean) {
        if (enabled === this.perScreenDesktops) {
            return;
        }
        this.perScreenDesktops = enabled;
        this.outputDesktops.clear();
        if (!enabled) {
            this._currentDesktop = this.currentDesktopForScreen(this.activeOutput());
        }
    }

    // like KWin: the output of the active window, or the one the pointer was last on
    private activeOutput() {
        return this.perScreenDesktops && this._activeWindow !== null ? this._activeWindow.output : this.activeScreen;
    }

    public currentDesktopForScreen(output: Output) {
        return this.perScreenDesktops ? this.outputDesktops.get(output.name) ?? this._currentDesktop : this._currentDesktop;
    }

    // switches that output only; without the per-screen setting it switches them all, like KWin
    public setCurrentDesktopForScreen(desktop: KwinDesktop, output: Output) {
        if (this.perScreenDesktops) {
            const old = this.currentDesktopForScreen(output);
            if (old !== desktop) {
                this.outputDesktops.set(output.name, desktop);
                this.currentDesktopChanged.fire(old, desktop, output);
            }
            return;
        }
        const old = this._currentDesktop;
        this._currentDesktop = desktop;
        this.fireDesktopChanged(old, desktop);
    }

    private fireDesktopChanged(old: KwinDesktop, desktop: KwinDesktop) {
        for (const output of this.screens) {
            this.currentDesktopChanged.fire(old, desktop, output);
        }
    }

    public get currentDesktop() {
        return this.currentDesktopForScreen(this.activeOutput());
    }

    public set currentDesktop(currentDesktop: KwinDesktop) {
        this.setCurrentDesktopForScreen(currentDesktop, this.activeOutput());
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
