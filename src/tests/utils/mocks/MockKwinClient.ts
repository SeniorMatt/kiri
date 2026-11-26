function fixedByRefusal(asked: MockQmlRect, old: MockQmlRect) {
    return Math.round(asked.width) === Math.round(old.width) && Math.round(asked.height) === Math.round(old.height);
}

class MockKwinClient {
    public readonly __brand = "KwinClient";

    private static readonly borderThickness = 10;

    public readonly internalId = `{${Math.random().toString(16).slice(2)}}`;
    public caption = "App";
    public minSize: Readonly<QmlSize> = new MockQmlSize(randomJitter(), randomJitter());
    public maxSize: Readonly<QmlSize> = new MockQmlSize(9999, 9999);
    public readonly transient: boolean;
    public move = false;
    public resize = false;
    public readonly fullScreenable: boolean = true;
    public readonly maximizable: boolean = true;
    private readonly firstOutput: Output = Workspace.activeScreen;

    // like KWin: the output that has the center of the frame (with several outputs)
    public get output(): Output {
        const workspace = Workspace as MockWorkspace;
        if (workspace.outputRects.size === 0) {
            return this.firstOutput;
        }
        return workspace.outputAt(this._frameGeometry.x + this._frameGeometry.width / 2, this._frameGeometry.y + this._frameGeometry.height / 2);
    }
    public resourceClass = "app";
    public resourceName = "app";
    public readonly dock: boolean = false;
    public readonly normalWindow: boolean = true;
    public desktopWindow = false;
    public hidden = false;
    public readonly managed: boolean = true;
    public readonly popupWindow: boolean = false;
    public readonly appletPopup: boolean = false;
    public readonly dialog: boolean = false;
    public readonly modal: boolean = false;
    public pid = 1;
    public x11 = true; // Kiri asks the compiled effect; tests answer from here

    private _maximizedVertically = false;
    private _maximizedHorizontally = false;
    private _fullScreen = false;
    public activities: string[] = [];
    public skipSwitcher = false;
    public keepAbove = false;
    public keepBelow = false;
    private _minimized = false;
    private _desktops: KwinDesktop[] = [];
    private _tile: Tile|null = null;
    public opacity = 1.0;

    public readonly fullScreenChanged = new MockQSignal<[]>();
    public readonly demandsAttentionChanged = new MockQSignal<[]>();
    private _demandsAttention = false;
    public get demandsAttention() {
        return this._demandsAttention;
    }
    public set demandsAttention(value: boolean) {
        this._demandsAttention = value;
        this.demandsAttentionChanged.fire();
    }
    public readonly desktopsChanged = new MockQSignal<[]>();
    public readonly activitiesChanged = new MockQSignal<[]>();
    public readonly minimizedChanged = new MockQSignal<[]>();
    public readonly maximizedAboutToChange = new MockQSignal<[MaximizedMode]>();
    public readonly captionChanged = new MockQSignal<[]>();
    public readonly windowClassChanged = new MockQSignal<[]>();
    public readonly tileChanged = new MockQSignal<[]>();
    public readonly interactiveMoveResizeStarted = new MockQSignal<[]>();
    public readonly interactiveMoveResizeStepped = new MockQSignal<[geometry: QmlRect]>();
    public readonly interactiveMoveResizeFinished = new MockQSignal<[]>();
    public readonly frameGeometryChanged = new MockQSignal<[oldGeometry: QmlRect]>();

    private windowedFrameGeometry: MockQmlRect;
    private windowed = true;
    private hasBorder = true;
    private _noBorder = false;

    constructor(
        private _frameGeometry: MockQmlRect = new MockQmlRect(10, 10, 100, 200),
        public readonly transientFor: MockKwinClient|null = null,
    ) {
        this.windowedFrameGeometry = _frameGeometry.clone();
        this.transient = transientFor !== null;
        this._desktops = [(Workspace as MockWorkspace).currentDesktopForScreen(this.output)];
        this.activities = [Workspace.currentActivity];
    }

    get maximizedVertically() { return this._maximizedVertically; }
    get maximizedHorizontally() { return this._maximizedHorizontally; }

    setMaximize(vertically: boolean, horizontally: boolean) {
        this.windowed = !(vertically || horizontally);

        if (vertically === this._maximizedVertically && horizontally === this._maximizedHorizontally) {
            return;
        }
        this._maximizedVertically = vertically;
        this._maximizedHorizontally = horizontally;

        this.maximizedAboutToChange.fire(
            vertically ? (
                horizontally ? MaximizedMode.Maximized : MaximizedMode.Vertically
            ) : (
                horizontally ? MaximizedMode.Horizontally : MaximizedMode.Unmaximized
            ),
        );

        const area = Workspace.clientArea(ClientAreaOption.MaximizeArea, this.output, (Workspace as MockWorkspace).currentDesktopForScreen(this.output));
        this.frameGeometry = new MockQmlRect(
            horizontally ? area.x        : this.windowedFrameGeometry.x,
            vertically   ? area.y        : this.windowedFrameGeometry.y,
            horizontally ? area.width    : this.windowedFrameGeometry.width,
            vertically   ? area.height   : this.windowedFrameGeometry.height,
        );
    }

    public get noBorder() {
        return this._noBorder;
    }

    // like KWin: the request is ignored while the window is full-screen, and the frame geometry stays as it is
    public set noBorder(noBorder: boolean) {
        if (!this._fullScreen) {
            this._noBorder = noBorder;
        }
    }

    private get outputRect(): MockQmlRect {
        return (Workspace as MockWorkspace).getOutputRect(this.output);
    }

    public get clientGeometry() {
        if (this.hasBorder && this._noBorder) {
            return this.frameGeometry;
        } else if (this.hasBorder) {
            return new MockQmlRect(
                this.frameGeometry.x + MockKwinClient.borderThickness,
                this.frameGeometry.y + MockKwinClient.borderThickness,
                this.frameGeometry.width - 2 * MockKwinClient.borderThickness,
                this.frameGeometry.height - 2 * MockKwinClient.borderThickness,
            );
        } else {
            return runOneOf(
                () => this.frameGeometry,
                () => new MockQmlRect(
                    this.frameGeometry.x - 20,
                    this.frameGeometry.y - 20,
                    this.frameGeometry.width + 40,
                    this.frameGeometry.height + 40,
                ), // some full-screen windows that manage their own window decorations can temporarily have a client geometry bigger than the screen
            );
        }
    }

    public get moveable() {
        return !this._fullScreen;
    }

    public fixedSize = false; // like a game window whose min and max size are the same

    public get resizeable() {
        return !this._fullScreen && !this.fixedSize;
    }

    public frameFirst = false; // the frame of a window that enters or leaves full-screen mode changes before the flag does

    public get fullScreen() {
        return this._fullScreen;
    }

    public set fullScreen(fullScreen: boolean) {
        const oldFullScreen = this._fullScreen;
        if (fullScreen === oldFullScreen) {
            return; // like KWin: nothing changes, the window keeps its frame
        }
        this.hasBorder = !fullScreen;
        const screen = this.outputRect; // the output the window is on
        const targetFrameGeometry = fullScreen ? screen : this.windowedFrameGeometry;
        if (fullScreen) {
            // Kwin remembers the windowed geometry before entering full-screen mode,
            // so moving the full-screen window doesn't change the geometry it's restored to
            this.windowed = false;
        }

        // On Wayland KWin sets the full-screen flag when the client acknowledges the request, before the frame of the
        // new size arrives: without a title bar (where a screen-sized frame looks like full-screen geometry) the
        // flag comes first when a window enters full-screen mode
        // (KWin on Wayland changes the frame first: `frameFirst`)
        const run = this.frameFirst ? (...fs: (() => void)[]) => { fs[2](); fs[0](); } :
            fullScreen && this._noBorder ? (...fs: (() => void)[]) => fs.forEach(f => f()) : runReorder;
        run(
            () => {
                this._fullScreen = fullScreen;
                if (fullScreen !== oldFullScreen) {
                    this.fullScreenChanged.fire();
                }
            },
            () => {
                if (oldFullScreen && !fullScreen) {
                    // when switching from full-screen to windowed, Kwin sometimes first adds the frame before changing
                    // the frameGeometry to the final value
                    if (!rectEquals(this.frameGeometry, screen)) {
                        // already has windowed frame geometry, don't undo that
                        return;
                    }
                    runOneOf(
                        () => {
                            this.setFrameByKwin(new MockQmlRect(
                                0,
                                0,
                                screen.width + 2 * MockKwinClient.borderThickness,
                                screen.height + 2 * MockKwinClient.borderThickness,
                            ));
                        },
                        () => {
                            this.setFrameByKwin(new MockQmlRect(
                                -MockKwinClient.borderThickness,
                                -MockKwinClient.borderThickness,
                                screen.width + 2 * MockKwinClient.borderThickness,
                                screen.height + 2 * MockKwinClient.borderThickness,
                            ));
                        },
                        () => {},
                    );
                }
            },
            () => {
                this.windowed = !fullScreen;
                this.setFrameByKwin(targetFrameGeometry);
            },
        );
    }

    // for assertions
    // where the window is seen: a full-screen X11 window that Kiri has parked is painted elsewhere by the compiled effect
    public getActualFrameGeometry() {
        const painted = parkedPositions.get(String(this.internalId));
        if (painted !== undefined) {
            return new MockQmlRect(painted[0], painted[1], this._frameGeometry.width, this._frameGeometry.height);
        }
        return this._frameGeometry;
    }

    // where KWin and the client think the window is
    public getRealFrameGeometry() {
        return this._frameGeometry;
    }

    // a slow client: a new size only takes effect when it commits it (commitRequestedGeometry), a plain move at once
    public slowClient = false;
    public requestedGeometries: MockQmlRect[] = []; // every size that was asked for and has not been committed

    public commitRequestedGeometry() {
        const requested = this.requestedGeometries.pop();
        this.requestedGeometries = [];
        if (requested !== undefined) {
            this.committing = true;
            this.frameGeometry = requested;
        }
    }

    private committing = false;

    // like Chromium: a new size is committed in two steps, the position at the old size first, then the size
    public twoStep = false;
    // like a fixed-size window that is moved but keeps its size
    public refusesSize = false;

    // a client that commits a height other than the asked one (a terminal that snaps to whole cells)
    public heightStep: number | null = null;
    // like KWin, which keeps 100 px of a window on the screen whenever it commits an answer to a configure
    public keepsVisible = false;

    // a client that keeps its own height whatever it is asked for (scrcpy with its aspect ratio, wine): each call is
    // one answer to the requests so far, like a commit; returns false when there was nothing to answer
    public stubbornHeight: number | null = null;

    public answerStubborn() {
        const frame = this._frameGeometry;
        const height = this.stubbornHeight;
        if (height === null || Math.round(frame.height) === height) {
            return false;
        }
        // KWin keeps the window's center when the client commits another size
        this.setFrameByKwin(new MockQmlRect(frame.x, frame.y + Math.round((frame.height - height) / 2), frame.width, height));
        return true;
    }

    // every geometry the script assigned (KWin's own changes are not in it)
    public assignedGeometries: MockQmlRect[] = [];
    private kwinChange = false;

    // for Karousel
    public get frameGeometry() {
        return new MockQmlRect(
            this._frameGeometry.x + randomJitter(),
            this._frameGeometry.y + randomJitter(),
            this._frameGeometry.width + randomJitter(),
            this._frameGeometry.height + randomJitter(),
            // a slow client's change waits for its commit
            this.slowClient ? () => {} : this.frameGeometryChanged.fire.bind(this.frameGeometryChanged),
        );
    }

    public set frameGeometry(frameGeometry: MockQmlRect) {
        const byKwin = this.kwinChange;
        this.kwinChange = false; // what the change makes the script assign is the script's
        if (!byKwin && !this.committing) {
            this.assignedGeometries.push(new MockQmlRect(frameGeometry.x, frameGeometry.y, frameGeometry.width, frameGeometry.height));
        }
        const commit = this.committing;
        this.committing = false; // only this assignment is the commit, whatever the signal makes Kiri ask for next waits again
        if (this.slowClient && !commit && (Math.round(frameGeometry.width) !== Math.round(this._frameGeometry.width) || Math.round(frameGeometry.height) !== Math.round(this._frameGeometry.height))) {
            const last = this.requestedGeometries[this.requestedGeometries.length - 1];
            if (last === undefined || !rectEquals(last, frameGeometry)) {
                this.requestedGeometries.push(new MockQmlRect(frameGeometry.x, frameGeometry.y, frameGeometry.width, frameGeometry.height));
            }
            return;
        }
        if (this.refusesSize && !byKwin && !fixedByRefusal(frameGeometry, this._frameGeometry)) {
            frameGeometry = new MockQmlRect(frameGeometry.x, frameGeometry.y, this._frameGeometry.width, this._frameGeometry.height);
        }
        if (this.twoStep && !byKwin) {
            const old = this._frameGeometry;
            const resized = Math.round(frameGeometry.width) !== Math.round(old.width) || Math.round(frameGeometry.height) !== Math.round(old.height);
            const moved = Math.round(frameGeometry.x) !== Math.round(old.x) || Math.round(frameGeometry.y) !== Math.round(old.y);
            if (resized && moved) {
                this._frameGeometry = new MockQmlRect(frameGeometry.x, frameGeometry.y, old.width, old.height, this.frameGeometryChanged.fire.bind(this.frameGeometryChanged));
                this.frameGeometryChanged.fire(old);
            }
        }
        const oldFrameGeometry = this._frameGeometry;
        if (!byKwin && (this.heightStep !== null || this.keepsVisible)) {
            const resized = Math.round(frameGeometry.width) !== Math.round(oldFrameGeometry.width) || Math.round(frameGeometry.height) !== Math.round(oldFrameGeometry.height);
            if (resized) {
                const height = this.heightStep === null ? frameGeometry.height : Math.floor(frameGeometry.height / this.heightStep) * this.heightStep;
                let x = frameGeometry.x;
                if (this.keepsVisible) {
                    x = Math.max(100 - frameGeometry.width, Math.min(screen.width - 100, x));
                }
                frameGeometry = new MockQmlRect(x, frameGeometry.y, frameGeometry.width, height);
            }
        }
        this._frameGeometry = new MockQmlRect(
            frameGeometry.x,
            frameGeometry.y,
            frameGeometry.width,
            frameGeometry.height,
            this.frameGeometryChanged.fire.bind(this.frameGeometryChanged),
        );
        if (this.windowed) {
            this.windowedFrameGeometry = this._frameGeometry.clone();
        }
        if (!rectEquals(frameGeometry, oldFrameGeometry)) {
            this.frameGeometryChanged.fire(oldFrameGeometry);
        }
    }

    private setFrameByKwin(frameGeometry: MockQmlRect) {
        this.kwinChange = true;
        this.frameGeometry = frameGeometry;
    }

    public get minimized() {
        return this._minimized;
    }

    public set minimized(minimized: boolean) {
        this._minimized = minimized;
        this.minimizedChanged.fire();
    }

    public get desktops() {
        return this._desktops;
    }

    public set desktops(desktops: KwinDesktop[]) {
        this._desktops = desktops;
        this.desktopsChanged.fire();
        if (Workspace.activeWindow === this && !desktops.includes(Workspace.currentDesktop)) {
            Workspace.activeWindow = null;
            runMaybe(() => Workspace.activeWindow = null); // fired again for some reason
            if (Workspace.activeWindow === null) {
                activateRandomWindowOnDesktop(Workspace.currentDesktop);
            }
        };
    }

    public moveAndFollowToDesktop(desktop: KwinDesktop, workspaceMock: MockWorkspace) {
        Assert.assert(workspaceMock.activeWindow === this);
        this._desktops = [desktop];
        this.desktopsChanged.fire();
        workspaceMock.currentDesktop = desktop;
    }

    public get tile() {
        return this._tile;
    }

    public set tile(tile: Tile|null) {
        this._tile = tile;
        this.tileChanged.fire();
    }

    public pin(geometry: MockQmlRect) {
        runMaybe(() => this.frameGeometry = geometry);
        this.tile = { __brand: "Tile" };
        this.frameGeometry = geometry;
    }

    public unpin() {
        this.tile = null;
    }

    public closeWindow() {}

    public getFrameGeometryCopy() {
        return this._frameGeometry.clone();
    }

    public toString() {
        return `MockKwinClient("${this.caption}")`;
    }
}
