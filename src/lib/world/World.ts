class World {
    private readonly desktopManager: DesktopManager;
    private readonly clientManager: ClientManager;
    private readonly pinManager: PinManager;
    private readonly workspaceSignalManager: SignalManager;
    private readonly focusPasser: FocusPassing.Passer;
    private readonly keyBindings: KeyBindings;
    private keyBindingsReleased = false;
    private readonly screenResizedDelayer: Delayer;
    private readonly gestureEndDelayer: Delayer;
    private readonly gestureAnimationTimer: QmlTimer;
    private readonly minSizeTimer: QmlTimer;
    // the desktop a swipe started on: it keeps the swipe if the current desktop changes while the fingers are down
    private gestureDesktop: Desktop|null = null;
    private gestureRawId: number|undefined = undefined;
    private gestureVisualId: number|undefined = undefined;
    private gestureAnimation: { from: number, to: number, start: number, spring: NiriSpring|null, visual?: boolean } | null = null;
    private readonly gestureSettleDuration: number;
    private readonly gestureDesktopSwitch: boolean;
    private readonly closeRelayoutDelayer: Delayer;
    private readonly closeRelayoutDelay: number;
    private arrangeHeld = false;
    public readonly dynamicDesktops: DynamicDesktops;
    private currentDesktop: KwinDesktop|null = null;
    private overview!: Overview;
    public previousDesktop: KwinDesktop|null = null; // niri's focus-workspace-previous

    // `keyBindings` and `layout` are given when Kiri reloads its settings: the shortcuts stay registered
    // and the windows are put back into the columns they were in.
    constructor(config: Config, keyBindings: KeyBindings | null = null, layout: World.Layout | null = null) {
        const focusPasser = new FocusPassing.Passer();
        this.focusPasser = focusPasser;
        this.workspaceSignalManager = initWorkspaceSignalHandlers(this, focusPasser);

        let presetWidths = {
            cycle: (column: Column, forwards: boolean) => {},
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

        // niri's floating layer takes the presets relative to the work area, without the gaps of the grid
        let floatingPresetWidths = { getOrdered: (size: number): number[] => [] };
        let floatingPresetHeights = { getOrdered: (size: number): number[] => [] };
        try {
            floatingPresetWidths = new PresetWidths(config.presetWidths, 0);
            floatingPresetHeights = new PresetWidths(config.presetHeights, 0);
        } catch (error: any) {
            log("failed to parse the floating presets:", error);
        }

        const actionsConfig = {
            floatingPresetWidths: floatingPresetWidths,
            floatingPresetHeights: floatingPresetHeights,
            manualScrollStep: config.manualScrollStep,
            columnWidthStep: config.columnWidthStep,
            windowHeightStep: config.windowHeightStep,
            presetWidths: presetWidths,
            presetHeights: presetHeights,
            verticalResizeStep: config.verticalResizeStep,
            columnResizer: config.scrollingCentered ? new RawResizer(presetWidths) : new ContextualResizer(presetWidths),
            clampDesktopIndex: (index: number) => this.dynamicDesktops.clampIndex(index),
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
        this.gestureAnimationTimer = initQmlTimer()!;
        this.gestureAnimationTimer.interval = 16;
        this.gestureAnimationTimer.repeat = true;
        this.gestureAnimationTimer.triggered.connect(() => this.gestureAnimationStep());

        // KWin has no signal for a client that changes its minimum size: look twice a second, lay out only on a change
        this.minSizeTimer = initQmlTimer()!;
        this.minSizeTimer.interval = 500;
        this.minSizeTimer.repeat = true;
        this.minSizeTimer.triggered.connect(() => {
            if (this.desktopManager.getCurrentDesktop()?.grid.minHeightsChanged()) {
                this.update();
            }
        });
        this.minSizeTimer.start();

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
            hideTitlebars: config.hideTitlebars,
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
        this.dynamicDesktops = new DynamicDesktops(config.dynamicDesktops, desktop => this.clientManager.isDesktopOccupied(desktop));
        this.overview = new Overview(this, this.clientManager, this.desktopManager);
        if (layout !== null) {
            this.clientManager.prepareRestore(layout.floating, layout.manual, layout.floatingFrames);
        }
        this.addExistingClients(layout);
        if (layout !== null) {
            this.restoreLayout(layout);
        }
        // the window that has the focus keeps it (KWin does not say it again), and Kiri has to know it as the focused
        // one: closing it passes the focus on, and the view keeps it in sight
        const active = Workspace.activeWindow;
        if (active !== null && this.clientManager.hasClient(active)) {
            this.clientManager.onClientFocused(active);
        }
        if (layout !== null) {
            this.restoreViews(layout);
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
            const order = new Map<string, number>();
            for (const column of layout.columns) {
                for (const window of column.windows) {
                    order.set(window.id, order.size);
                }
            }
            kwinClients = kwinClients.slice().sort((a, b) => (order.get(String(a.internalId)) ?? Infinity) - (order.get(String(b.internalId)) ?? Infinity));
        }
        for (const kwinClient of kwinClients) {
            this.clientManager.addClient(kwinClient, true);
        }
    }

    // remembers the whole state that is not in the windows themselves (columns and their order, heights, floating
    // windows, the focus and the view of every desktop), to rebuild the world as it was. Windows are named by their
    // internal id, so it survives a reload of the script too (see Kiri.saveState)
    public captureLayout(): World.Layout {
        const columns: World.Layout["columns"] = [];
        const views: World.Layout["views"] = [];
        for (const [key, desktop] of this.desktopManager.getKeyedDesktops()) {
            for (const column of desktop.grid.getColumns()) {
                columns.push({
                    windows: column.getWindows().map(window => ({
                        id: String(window.client.kwinClient.internalId),
                        fullScreen: window.client.kwinClient.fullScreen,
                        windowedFullScreen: window.client.windowedFullScreen,
                        maximizedMode: window.client.getMaximizedMode() ?? MaximizedMode.Unmaximized,
                        fixedHeight: window.fixedHeight,
                        presetHeightIndex: window.presetHeightIndex,
                        heightWeight: window.heightWeight,
                    })),
                    heightRatios: column.getHeightRatios(),
                    tabbed: column.isTabbed(),
                });
            }
            const focused = desktop.grid.getLastFocusedWindow();
            views.push({
                desktop: key,
                scrollX: desktop.getScrollX(),
                focused: focused === null ? null : String(focused.client.kwinClient.internalId),
            });
        }
        const floating = this.clientManager.captureFloating();
        return { columns, views, floating: floating.floating, manual: floating.manual, floatingFrames: floating.floatingFrames };
    }

    private restoreLayout(layout: World.Layout) {
        const byId = new Map<string, KwinClient>();
        for (const kwinClient of Workspace.windows) {
            byId.set(String(kwinClient.internalId), kwinClient);
        }
        const lastColumns = new Map<Grid, Column | null>();
        for (const savedColumn of layout.columns) {
            const windows: Window[] = [];
            const savedWindows: typeof savedColumn.windows = [];
            for (const saved of savedColumn.windows) {
                const kwinClient = byId.get(saved.id);
                const window = kwinClient === undefined ? null : this.clientManager.findTiledWindow(kwinClient);
                if (window === null || window.client.kwinClient !== kwinClient) {
                    continue; // the window is no longer tiled
                }
                windows.push(window);
                savedWindows.push(saved);
                if (saved.fullScreen) {
                    window.client.windowedFullScreen = saved.windowedFullScreen === true;
                    window.client.setFullScreen(true);
                    if (window.client.windowedFullScreen) {
                        window.onFullScreenChanged(true); // the window was added as a real full-screen one
                    }
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
            if (column.getWindowCount() === savedWindows.length) {
                // the heights as they were set: fixed ones (resized by hand or by a preset) and the weights of the auto ones
                savedWindows.forEach((saved, i) => {
                    if (saved.fixedHeight !== undefined) {
                        windows[i].heightWeight = saved.heightWeight ?? 1;
                        windows[i].fixedHeight = saved.fixedHeight ?? null;
                        windows[i].presetHeightIndex = saved.presetHeightIndex ?? null;
                    }
                });
                column.resizeWindows();
            }
            column.setTabbed(savedColumn.tabbed);
        }
    }

    // the focused window and the scroll position of every desktop
    private restoreViews(layout: World.Layout) {
        const byId = new Map<string, KwinClient>();
        for (const kwinClient of Workspace.windows) {
            byId.set(String(kwinClient.internalId), kwinClient);
        }
        for (const view of layout.views) {
            const desktop = this.desktopManager.getDesktopByKey(view.desktop);
            if (desktop === undefined) {
                continue;
            }
            const kwinClient = view.focused === null ? undefined : byId.get(view.focused);
            const window = kwinClient === undefined ? null : this.clientManager.findTiledWindow(kwinClient);
            const active = Workspace.activeWindow === null ? null : this.clientManager.findTiledWindow(Workspace.activeWindow);
            if (window !== null && window.column.grid === desktop.grid && (active === null || active.column.grid !== desktop.grid)) {
                window.column.onWindowFocused(window); // the window that has the focus now keeps it
            }
            desktop.setScroll(view.scrollX, true);
            // the focused window may be a tiled one that was not in the saved layout (it was floating, minimized): keep it in view
            const focusedColumn = desktop.grid.getLastFocusedColumn();
            if (focusedColumn !== null && focusedColumn.getWidth() <= desktop.tilingArea.width && !Range.contains(desktop.getCurrentVisibleRange(), focusedColumn)) {
                desktop.fitColumnInView(focusedColumn);
            }
        }
    }

    private update() {
        this.dynamicDesktops.update();
        if (this.arrangeHeld) {
            return;
        }
        const currentDesktop = this.desktopManager.getCurrentDesktop();
        if (currentDesktop !== undefined) {
            currentDesktop.arrange();
        }
        // like niri, every workspace stays laid out: a window opened, closed or resized on another desktop, a
        // screen or panel change, a config reload show up there before it is visited (arrange does nothing when clean)
        for (const desktop of this.desktopManager.getAllDesktops()) {
            if (desktop !== currentDesktop) {
                desktop.arrange();
            }
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
            // niri always has a focused window: when KWin left none, the actions work on the one that had it last
            const window = this.getCurrentGridWindowToFocus();
            if (window === null) {
                return;
            }
            window.focus();
        }
        const active = Workspace.activeWindow;
        if (active !== null) {
            this.doIfTiled(active, f);
        }
    }

    private getCurrentGridWindowToFocus() {
        let window: Window|null = null;
        this.do((clientManager, desktopManager) => {
            window = desktopManager.getCurrentDesktop()?.grid.getLastFocusedWindow() ?? null;
        });
        return window as Window|null;
    }

    // niri's two layers: when a floating window has the focus, the focus keys act on the floating layer only (`floating`
    // runs, and if nothing is in that direction nothing happens), they never jump into the grid. Anything else
    // runs `f` on the grid like `doIfTiledFocusedOrEnterGrid`. Only the floating/tiling switch keys cross the layers.
    public doFocusLayered(
        f: (clientManager: ClientManager, desktopManager: DesktopManager, window: Window, column: Column, grid: Grid) => void,
        floating: (clientManager: ClientManager, active: KwinClient) => void,
    ) {
        const active = Workspace.activeWindow;
        // a full-screen window that is only floating because it could not be tiled (a game) can still be left
        if (active !== null && this.clientManager.isFloating(active) && !active.fullScreen) {
            this.do(clientManager => floating(clientManager, active));
            return;
        }
        this.doIfTiledFocusedOrEnterGrid(f);
    }

    public doFocusInDirection(
        f: (clientManager: ClientManager, desktopManager: DesktopManager, window: Window, column: Column, grid: Grid) => void,
        dx: number,
        dy: number,
    ) {
        this.doFocusLayered(f, (cm, active) => cm.focusFloatingDirectional(active, dx, dy));
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

    // Runs `f` for a tiled focused window; for a floating one `floating` runs instead (niri's floating layer
    // answers the size keys too)
    public doIfTiledFocusedOrFloating(
        f: (clientManager: ClientManager, desktopManager: DesktopManager, window: Window, column: Column, grid: Grid) => void,
        floating: (clientManager: ClientManager, active: KwinClient) => void,
    ) {
        const active = Workspace.activeWindow;
        if (active !== null && this.clientManager.isFloating(active)) {
            this.do(clientManager => floating(clientManager, active));
            return;
        }
        this.doIfTiledFocused(f);
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

    // A closed window may come back at once (see ClientManager.rememberClosed): nothing moves meanwhile
    public holdArrange() {
        this.arrangeHeld = true;
    }

    public releaseArrangeHold() {
        this.arrangeHeld = false;
    }

    // a swipe is in progress or settling: niri's focus-follows-mouse does not switch windows then
    public isScrollBusy() {
        if (this.gestureAnimation !== null) {
            return true;
        }
        const desktop = this.getGestureDesktop();
        return desktop !== undefined && desktop.isGestureScrolling();
    }

    private getGestureDesktop() {
        return this.gestureDesktop !== null ? this.gestureDesktop : this.desktopManager.getCurrentDesktop();
    }

    // a swipe that settles on a desktop which is not the current one any more ends there, a new swipe starts on the current one
    private endGestureOnOtherDesktop() {
        if (this.gestureDesktop !== null && this.gestureAnimation !== null && this.gestureDesktop !== this.desktopManager.getCurrentDesktop()) {
            const desktop = this.gestureDesktop;
            const animation = this.gestureAnimation;
            this.stopGestureAnimation();
            this.do(() => desktop.setScroll(animation.to, animation.spring !== null));
            this.gestureAnimationDone();
        }
    }

    public gestureScroll(amount: number) {
        this.gestureEndDelayer.stop();
        this.endGestureOnOtherDesktop();
        this.stopGestureAnimation();
        this.do((clientManager, desktopManager) => {
            const currentDesktop = this.getGestureDesktop();
            if (currentDesktop !== undefined) {
                this.gestureDesktop = currentDesktop;
                currentDesktop.gestureScroll(amount, Date.now());
            }
        });
    }

    // Raw swipe from the compiled effect kiri_swipe (the JSON of its poll()): the uncapped finger travel of a
    // 3-finger horizontal swipe, with timestamps. KWin's own progress (capped at 200 units) is ignored then.
    public gestureRaw(json: string) {
        let swipe: { id?: number, phase: string, end: boolean, ev: number[][], f?: number, d0?: number };
        try {
            swipe = JSON.parse(json);
        } catch (error: any) {
            return;
        }
        if (swipe.f === 4) {
            // 4 fingers: niri's overview gesture (vertical)
            if (overviewEffectLoaded()) {
                if (swipe.phase === "v") {
                    this.overview.gestureUpdate(swipe.ev);
                }
                if (swipe.end) {
                    this.overview.gestureEnd();
                }
            }
            return;
        }
        if (swipe.phase === "h" && swipe.ev.length > 0) {
            this.gestureEndDelayer.stop();
            this.endGestureOnOtherDesktop();
            if (swipe.id !== this.gestureRawId) {
                // the fingers came down again: a swipe never continues the position or the velocity of the one before
                // it, not even when it lands while that one is still settling
                this.gestureRawId = swipe.id;
                this.cutGestureSettle();
            }
            this.stopGestureAnimation();
            this.do((clientManager, desktopManager) => {
                const currentDesktop = this.getGestureDesktop();
                if (currentDesktop !== undefined) {
                    this.gestureDesktop = currentDesktop;
                    for (const event of swipe.ev) {
                        currentDesktop.gestureRawUpdate(event[1], event[0], swipe.d0 === undefined ? 0 : swipe.d0);
                    }
                    if (this.gestureVisualId !== swipe.id && currentDesktop.isRawGesture()) {
                        this.gestureVisualId = swipe.id;
                        swipeCall("begin", currentDesktop.getRawVisual());
                    }
                }
            });
        }
        if (swipe.end) {
            this.gestureEndDelayer.stop();
            this.gestureRelease();
        }
    }

    // A new swipe starts on the view where it is right now, as niri's does: the one before it ends there (it
    // gets its focus change, the view stays where it is), and none of its state is carried over.
    private cutGestureSettle() {
        const desktop = this.gestureDesktop;
        if (desktop === null || !desktop.isGestureScrolling()) {
            return;
        }
        const x = desktop.getScrollX();
        this.stopGestureAnimation();
        this.gestureAnimationDone();
        // focusing the column the old swipe chose must not scroll the view away from the fingers
        this.do(() => desktop.setScroll(x, true));
    }

    // niri's toggle-overview: the compiled effect draws it, without the effect Plasma's own Overview opens
    public toggleOverview() {
        if (!this.overview.toggle()) {
            kglobalaccel.call("/component/kwin", "org.kde.kglobalaccel.Component", "invokeShortcut", ["s"], ["Overview"], () => {});
        }
    }

    public overviewWarm() {
        this.overview.warm();
    }

    public overviewPoll(json: string) {
        this.overview.poll(json);
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
        const desktop = this.getGestureDesktop();
        if (desktop === undefined || !desktop.isGestureScrolling()) {
            this.gestureDesktop = null;
            return;
        }
        let accidental = false;
        this.do(() => { accidental = desktop.gestureScrollAbortIfAccidental(); });
        if (accidental) {
            this.gestureDesktop = null;
            return;
        }
        // a raw swipe (kiri_swipe) settles like niri: a spring from the release position with the release velocity
        const raw = desktop.isRawGesture() ? desktop.getRawRelease() : null;
        const from = desktop.getScrollX();
        const to = raw !== null ? raw.to : desktop.getGestureSettleTarget(Date.now());
        const visual = raw !== null && swipeVisualActive();
        if ((raw === null && from === to) || this.gestureSettleDuration === 0) {
            this.do((clientManager, desktopManager) => {
                desktop.setScroll(to, raw !== null);
            });
            if (visual) {
                swipeCall("cancel", {});
            }
            this.gestureAnimationDone();
            return;
        }
        if (visual && raw !== null) {
            // the effect paints the settle at frame rate, from where the fingers left the view; the layout is already where it ends
            swipeCall("release", { from: from, to: to, v: raw.velocity });
            this.do(() => desktop.setScroll(to, true));
            // niri moves the focus when the fingers are lifted, not when the settle ends
            this.gestureFocusTarget(desktop);
        }
        this.gestureAnimation = { from: from, to: to, start: Date.now(), spring: raw !== null ? niriViewSpring(from, to, raw.velocity) : null, visual: visual };
        this.gestureAnimationTimer.start();
    }

    private gestureAnimationStep() {
        const animation = this.gestureAnimation;
        const desktop = this.getGestureDesktop();
        if (animation === null || desktop === undefined) {
            this.stopGestureAnimation();
            return;
        }
        const spring = animation.spring;
        const t = spring !== null ? (Date.now() - animation.start) / 1000 / spring.duration : (Date.now() - animation.start) / this.gestureSettleDuration;
        const x = spring !== null ? spring.value((Date.now() - animation.start) / 1000) : animation.from + (animation.to - animation.from) * easeOutCubic(t);
        // a raw swipe's target may be outside of what the clamper allows (niri's snaps do not ask it)
        if (animation.visual !== true) {
            this.do(() => desktop.setScroll(x, spring !== null));
        }
        if (t >= 1 || (spring !== null && spring.duration === 0)) {
            this.stopGestureAnimation();
            this.gestureAnimationDone();
        }
    }

    private stopGestureAnimation() {
        this.gestureAnimation = null;
        this.gestureAnimationTimer.stop();
    }

    private gestureFocusTarget(desktop: Desktop) {
        this.do((clientManager, desktopManager) => {
            const focusedWindow = Workspace.activeWindow === null ? null : clientManager.findTiledWindow(Workspace.activeWindow);
            desktop.gestureScrollFinish(focusedWindow, Workspace.activeWindow !== null && focusedWindow === null, desktop === desktopManager.getCurrentDesktop());
        });
    }

    private gestureAnimationDone() {
        this.do((clientManager, desktopManager) => {
            const focusedWindow = Workspace.activeWindow === null ? null : clientManager.findTiledWindow(Workspace.activeWindow);
            const currentDesktop = this.getGestureDesktop();
            this.gestureDesktop = null;
            if (currentDesktop !== undefined) {
                // an untiled focused window (a full-screen game) is left by the gesture as well; the focus does not
                // follow a swipe on a desktop that is no longer the current one, that would switch back to it
                currentDesktop.gestureScrollFinish(focusedWindow, Workspace.activeWindow !== null && focusedWindow === null, currentDesktop === desktopManager.getCurrentDesktop());
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
            gotoDesktop(Workspace.desktops[index], "swipe");
        }
    }

    // the shortcuts stay registered, for a new world to take over
    public releaseKeyBindings() {
        this.keyBindingsReleased = true;
        return this.keyBindings;
    }

    public destroy() {
        this.overview.close();
        this.gestureEndDelayer.destroy();
        this.gestureAnimationTimer.destroy();
        this.minSizeTimer.destroy();
        this.focusPasser.destroy();
        this.closeRelayoutDelayer.destroy();
        this.screenResizedDelayer.destroy();
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

    public onScreenResized(outputChanged = false) {
        if (outputChanged) {
            for (const desktop of this.desktopManager.getAllDesktops()) {
                desktop.onScreenChanged();
            }
        }
        this.screenResizedDelayer.run();
    }
}

namespace World {
    // plain data (windows are named by their internal id), so it can be stored as JSON
    export interface Layout {
        columns: {
            windows: {
                id: string;
                fullScreen: boolean;
                windowedFullScreen?: boolean;
                maximizedMode: MaximizedMode;
                fixedHeight?: number | null;
                presetHeightIndex?: number | null;
                heightWeight?: number;
            }[];
            heightRatios: number[];
            tabbed: boolean;
        }[];
        floating: string[]; // windows the user floated that are floating now
        manual: string[]; // windows the user floated or tiled by hand (rules leave them alone)
        floatingFrames: { id: string, x: number, y: number, width: number, height: number }[];
        views: { desktop: string, scrollX: number, focused: string | null }[];
    }
}
