class World {
    private readonly desktopManager: DesktopManager;
    private readonly clientManager: ClientManager;
    private readonly pinManager: PinManager;
    private readonly workspaceSignalManager: SignalManager;
    private readonly keyBindings: KeyBindings;
    private keyBindingsReleased = false;
    private readonly screenResizedDelayer: Delayer;
    private readonly gestureEndDelayer: Delayer;
    private readonly gestureAnimationTimer: QmlTimer;
    private gestureAnimation: { from: number, to: number, start: number } | null = null;
    private readonly gestureSettleDuration: number;
    private readonly gestureDesktopSwitch: boolean;
    private readonly closeRelayoutDelayer: Delayer;
    private readonly closeRelayoutDelay: number;
    private arrangeHeld = false;
    private currentDesktop: KwinDesktop|null = null;
    public previousDesktop: KwinDesktop|null = null; // niri's focus-workspace-previous

    // `keyBindings` and `layout` are given when Kiri reloads its settings: the shortcuts stay registered
    // and the windows are put back into the columns they were in.
    constructor(config: Config, keyBindings: KeyBindings | null = null, layout: World.Layout | null = null) {
        const focusPasser = new FocusPassing.Passer();
        this.workspaceSignalManager = initWorkspaceSignalHandlers(this, focusPasser);

        let presetWidths = {
            next: (currentWidth: number, minWidth: number, maxWidth: number, tilingAreaWidth: number) => currentWidth,
            prev: (currentWidth: number, minWidth: number, maxWidth: number, tilingAreaWidth: number) => currentWidth,
            getWidths: (minWidth: number, maxWidth: number, tilingAreaWidth: number): number[] => [],
        };
        try {
            presetWidths = new PresetWidths(config.presetWidths, config.gapsInnerHorizontal);
        } catch (error: any) {
            notificationInvalidPresetWidths.sendEvent();
            log("failed to parse presetWidths:", error);
        }

        let presetHeights = {
            getOrdered: (tilingAreaHeight: number): number[] => [],
        };
        try {
            presetHeights = new PresetWidths(config.presetHeights, config.gapsInnerVertical);
        } catch (error: any) {
            log("failed to parse presetHeights:", error);
        }

        const actionsConfig = {
            manualScrollStep: config.manualScrollStep,
            columnWidthStep: config.columnWidthStep,
            windowHeightStep: config.windowHeightStep,
            presetWidths: presetWidths,
            presetHeights: presetHeights,
            verticalResizeStep: config.verticalResizeStep,
            columnResizer: config.scrollingCentered ? new RawResizer(presetWidths) : new ContextualResizer(presetWidths),
        };
        if (keyBindings === null) {
            this.keyBindings = new KeyBindings(this, actionsConfig, config.shortcutKeys);
        } else {
            this.keyBindings = keyBindings;
            keyBindings.setActions(this, actionsConfig);
        }

        this.screenResizedDelayer = new Delayer(1000, () => {
            // this delay ensures that docks are taken into account by `Workspace.clientArea`
            for (const desktop of this.desktopManager.getAllDesktops()) {
                desktop.onLayoutChanged();
            }
            this.update();
        });

        this.gestureSettleDuration = config.gestureSettleDuration;
        this.gestureDesktopSwitch = config.gestureDesktopSwitch;
        // a gesture that is cancelled by KWin because the swipe changed direction continues right after
        this.gestureEndDelayer = new Delayer(40, () => this.gestureRelease());
        this.gestureAnimationTimer = initQmlTimer();
        this.gestureAnimationTimer.interval = 16;
        this.gestureAnimationTimer.repeat = true;
        this.gestureAnimationTimer.triggered.connect(() => this.gestureAnimationStep());

        this.closeRelayoutDelay = config.closeRelayoutDelay;
        this.closeRelayoutDelayer = new Delayer(config.closeRelayoutDelay, () => {
            this.arrangeHeld = false;
            this.update();
        });

        this.pinManager = new PinManager();

        const layoutConfig = {
            gapsInnerHorizontal: config.gapsInnerHorizontal,
            gapsInnerVertical: config.gapsInnerVertical,
            offScreenOpacity: config.offScreenOpacity / 100.0,
            tabbedColumnsByDefault: config.tabbedColumnsByDefault,
            tabIndicatorEnabled: config.tabIndicatorEnabled,
            tabIndicatorWidth: config.tabIndicatorWidth,
            tabIndicatorGap: config.tabIndicatorGap,
            tabIndicatorLength: config.tabIndicatorLength,
            tabIndicatorPosition: config.tabIndicatorPosition,
            tabIndicatorHideWhenSingleTab: config.tabIndicatorHideWhenSingleTab,
            resizeNeighborColumn: config.resizeNeighborColumn,
            reMaximize: config.reMaximize,
            tileMaximized: config.tileMaximized,
            tileFullScreen: config.tileFullScreen,
            skipSwitcher: config.skipSwitcher,
            tiledKeepBelow: config.tiledKeepBelow,
            maximizedKeepAbove: config.floatingKeepAbove,
            untileOnDrag: config.untileOnDrag,
        };

        this.desktopManager = new DesktopManager(
            this.pinManager,
            {
                marginTop: config.gapsOuterTop,
                marginBottom: config.gapsOuterBottom,
                marginLeft: config.gapsOuterLeft,
                marginRight: config.gapsOuterRight,
                scroller: World.createScroller(config),
                clamper: (config.scrollingLazy || config.scrollingOnOverflow) ? new EdgeClamper(config.centerGridWhenFits) : new CenterClamper(),
                alwaysCenterSingleColumn: config.alwaysCenterSingleColumn,
                gestureScroll: config.gestureScroll,
                gestureScrollInvert: config.gestureScrollInvert,
                gestureScrollStep: config.gestureScrollStep,
            },
            layoutConfig,
            focusPasser,
            new DesktopFilter(config.tiledDesktops),
        );
        this.clientManager = new ClientManager(config, this, this.desktopManager, this.pinManager);
        this.addExistingClients(layout);
        if (layout !== null) {
            this.restoreLayout(layout);
        }
        this.currentDesktop = Workspace.currentDesktop;
        this.update();
    }

    private static createScroller(config: Config) {
        if (config.scrollingOnOverflow) {
            return new OnOverflowScroller();
        } else if (config.scrollingLazy) {
            return new LazyScroller();
        } else if (config.scrollingCentered) {
            return new CenteredScroller();
        } else if (config.scrollingGrouped) {
            return new GroupedScroller();
        } else {
            log("No scrolling mode selected, using default");
            return new LazyScroller();
        }
    }

    private addExistingClients(layout: World.Layout | null) {
        let kwinClients = Workspace.windows;
        if (layout !== null) {
            const order = new Map<KwinClient, number>();
            for (const column of layout.columns) {
                for (const window of column.windows) {
                    order.set(window.client, order.size);
                }
            }
            kwinClients = kwinClients.slice().sort((a, b) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity));
        }
        for (const kwinClient of kwinClients) {
            this.clientManager.addClient(kwinClient, true);
        }
    }

    // remembers which windows are in which columns, in which order, to rebuild the world with the same layout
    public captureLayout(): World.Layout {
        const columns: World.Layout["columns"] = [];
        for (const desktop of this.desktopManager.getAllDesktops()) {
            for (const column of desktop.grid.getColumns()) {
                columns.push({
                    windows: column.getWindows().map(window => ({
                        client: window.client.kwinClient,
                        fullScreen: window.client.kwinClient.fullScreen,
                        maximizedMode: window.client.getMaximizedMode() ?? MaximizedMode.Unmaximized,
                    })),
                    heightRatios: column.getHeightRatios(),
                    tabbed: column.isTabbed(),
                });
            }
        }
        return { columns };
    }

    private restoreLayout(layout: World.Layout) {
        const lastColumns = new Map<Grid, Column | null>();
        for (const savedColumn of layout.columns) {
            const windows: Window[] = [];
            for (const saved of savedColumn.windows) {
                const window = this.clientManager.findTiledWindow(saved.client);
                if (window === null || window.client.kwinClient !== saved.client) {
                    continue; // the window is no longer tiled
                }
                windows.push(window);
                if (saved.fullScreen) {
                    window.client.setFullScreen(true);
                } else if (saved.maximizedMode !== MaximizedMode.Unmaximized) {
                    window.client.setMaximize(
                        saved.maximizedMode === MaximizedMode.Horizontally || saved.maximizedMode === MaximizedMode.Maximized,
                        saved.maximizedMode === MaximizedMode.Vertically || saved.maximizedMode === MaximizedMode.Maximized,
                    );
                }
            }
            if (windows.length === 0) {
                continue;
            }

            const column = windows[0].column;
            for (const window of windows) {
                if (window.column !== column && window.column.grid === column.grid) {
                    window.moveToColumn(column, true, FocusPassing.Type.None);
                }
            }
            const grid = column.grid;
            grid.moveColumn(column, lastColumns.get(grid) ?? null);
            lastColumns.set(grid, column);

            if (column.getWindowCount() === savedColumn.heightRatios.length) {
                column.setHeightRatios(savedColumn.heightRatios);
            }
            column.setTabbed(savedColumn.tabbed);
        }
    }

    private update() {
        if (this.arrangeHeld) {
            return;
        }
        const currentDesktop = this.desktopManager.getCurrentDesktop();
        if (currentDesktop !== undefined) {
            currentDesktop.arrange();
        }
    }

    public do(f: (clientManager: ClientManager, desktopManager: DesktopManager) => void) {
        f(this.clientManager, this.desktopManager);
        this.update();
    }

    public doIfTiled(
        kwinClient: KwinClient,
        f: (clientManager: ClientManager, desktopManager: DesktopManager, window: Window, column: Column, grid: Grid) => void,
    ) {
        const window = this.clientManager.findTiledWindow(kwinClient);
        if (window === null) {
            return;
        }
        const column = window.column;
        const grid = column.grid;
        f(this.clientManager, this.desktopManager, window, column, grid);
        this.update();
    }

    public doIfTiledFocused(
        f: (clientManager: ClientManager, desktopManager: DesktopManager, window: Window, column: Column, grid: Grid) => void,
    ) {
        if (Workspace.activeWindow === null) {
            return;
        }
        this.doIfTiled(Workspace.activeWindow, f);
    }

    // Like `doIfTiledFocused`, but when the focused window is not in the grid (floating, a full-screen game that
    // was not tiled, nothing focused) the focus moves into the grid instead, so such a window can always be left
    public doIfTiledFocusedOrEnterGrid(
        f: (clientManager: ClientManager, desktopManager: DesktopManager, window: Window, column: Column, grid: Grid) => void,
    ) {
        const active = Workspace.activeWindow;
        if (active === null || this.clientManager.findTiledWindow(active) === null) {
            this.do((clientManager, desktopManager) => {
                const desktop = desktopManager.getCurrentDesktop();
                const window = desktop === undefined ? null : desktop.grid.getLastFocusedWindow();
                if (window !== null) {
                    window.focus();
                }
            });
            return;
        }
        this.doIfTiled(active, f);
    }

    // niri: when a floating window is active the focus keys move between the floating windows; with none in
    // that direction (niri stays put) the focus enters the grid, so a window Kiri can't tile never traps it
    public doIfTiledFocusedOrFocusFloating(
        f: (clientManager: ClientManager, desktopManager: DesktopManager, window: Window, column: Column, grid: Grid) => void,
        dx: number,
        dy: number,
    ) {
        const active = Workspace.activeWindow;
        if (active !== null && this.clientManager.isFloating(active)) {
            const moved = dx === 0 && dy === 0 ?
                this.clientManager.focusFloatingExtreme(false) :
                this.clientManager.focusFloatingInDirection(active, dx, dy);
            if (moved) {
                return;
            }
        }
        this.doIfTiledFocusedOrEnterGrid(f);
    }

    // Runs `f` for a tiled focused window; a floating focused window is moved by (dx, dy) instead
    public doIfTiledFocusedOrMoveFloating(
        f: (clientManager: ClientManager, desktopManager: DesktopManager, window: Window, column: Column, grid: Grid) => void,
        dx: number,
        dy: number,
    ) {
        const active = Workspace.activeWindow;
        if (active !== null && this.clientManager.moveFloatingClient(active, dx, dy)) {
            return;
        }
        this.doIfTiledFocused(f);
    }

    // Called when a tiled window was closed: the others keep their place until the close animation is over
    public holdArrangeForClose() {
        if (this.closeRelayoutDelay === 0) {
            return;
        }
        this.arrangeHeld = true;
        this.closeRelayoutDelayer.run();
    }

    public gestureScroll(amount: number) {
        this.gestureEndDelayer.stop();
        this.stopGestureAnimation();
        this.do((clientManager, desktopManager) => {
            const currentDesktop = desktopManager.getCurrentDesktop();
            if (currentDesktop !== undefined) {
                currentDesktop.gestureScroll(amount, Date.now());
            }
        });
    }

    // `activated` means the fingers were lifted, `cancelled` may also be just a change of swipe direction
    public gestureScrollFinish(delayed: boolean) {
        if (delayed) {
            this.gestureEndDelayer.run();
        } else {
            this.gestureEndDelayer.stop();
            this.gestureRelease();
        }
    }

    private gestureRelease() {
        const desktop = this.desktopManager.getCurrentDesktop();
        if (desktop === undefined || !desktop.isGestureScrolling()) {
            return;
        }
        const from = desktop.getScrollX();
        const to = desktop.getGestureSettleTarget(Date.now());
        if (from === to || this.gestureSettleDuration === 0) {
            this.do((clientManager, desktopManager) => {
                desktop.setScroll(to, false);
            });
            this.gestureAnimationDone();
            return;
        }
        this.gestureAnimation = { from: from, to: to, start: Date.now() };
        this.gestureAnimationTimer.start();
    }

    private gestureAnimationStep() {
        const animation = this.gestureAnimation;
        const desktop = this.desktopManager.getCurrentDesktop();
        if (animation === null || desktop === undefined) {
            this.stopGestureAnimation();
            return;
        }
        const t = (Date.now() - animation.start) / this.gestureSettleDuration;
        const x = animation.from + (animation.to - animation.from) * easeOutCubic(t);
        this.do(() => desktop.setScroll(x, false));
        if (t >= 1) {
            this.stopGestureAnimation();
            this.gestureAnimationDone();
        }
    }

    private stopGestureAnimation() {
        this.gestureAnimation = null;
        this.gestureAnimationTimer.stop();
    }

    private gestureAnimationDone() {
        this.do((clientManager, desktopManager) => {
            const focusedWindow = Workspace.activeWindow === null ? null : clientManager.findTiledWindow(Workspace.activeWindow);
            const currentDesktop = desktopManager.getCurrentDesktop();
            if (currentDesktop !== undefined) {
                // an untiled focused window (a full-screen game) is left by the gesture as well
                currentDesktop.gestureScrollFinish(focusedWindow, Workspace.activeWindow !== null && focusedWindow === null);
            }
        });
    }

    // 3-finger vertical swipe: switch to the next (down) or previous (up) desktop
    public gestureSwitchDesktop(offset: number) {
        if (!this.gestureDesktopSwitch) {
            return;
        }
        const index = Workspace.desktops.indexOf(Workspace.currentDesktop) + offset;
        if (index >= 0 && index < Workspace.desktops.length) {
            Workspace.currentDesktop = Workspace.desktops[index];
        }
    }

    // the shortcuts stay registered, for a new world to take over
    public releaseKeyBindings() {
        this.keyBindingsReleased = true;
        return this.keyBindings;
    }

    public destroy() {
        this.gestureEndDelayer.destroy();
        this.gestureAnimationTimer.destroy();
        this.closeRelayoutDelayer.destroy();
        this.workspaceSignalManager.destroy();
        if (!this.keyBindingsReleased) {
            this.keyBindings.destroy();
        }
        this.clientManager.destroy();
        this.desktopManager.destroy();
    }

    public onDesktopChanged() {
        if (this.currentDesktop !== Workspace.currentDesktop) {
            this.previousDesktop = this.currentDesktop;
            this.currentDesktop = Workspace.currentDesktop;
        }
    }

    public onScreenResized() {
        this.screenResizedDelayer.run();
    }
}

namespace World {
    export interface Layout {
        columns: {
            windows: { client: KwinClient, fullScreen: boolean, maximizedMode: MaximizedMode }[];
            heightRatios: number[];
            tabbed: boolean;
        }[];
    }
}
