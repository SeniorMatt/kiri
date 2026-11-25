class World {
    private readonly desktopManager: DesktopManager;
    private readonly clientManager: ClientManager;
    private readonly pinManager: PinManager;
    private readonly workspaceSignalManager: SignalManager;
    private readonly focusPasser: FocusPassing.Passer;
    private readonly keyBindings: KeyBindings;
    private readonly actions: Actions;
    private keyBindingsReleased = false;
    private readonly screenResizedDelayer: Delayer;
    private readonly gestureEndDelayer: Delayer;
    private readonly gestureAnimationTimer: QmlTimer;
    private readonly minSizeTimer: QmlTimer;
    private gestureDesktop: Desktop|null = null;
    private gestureRawId: number|undefined = undefined;
    private gestureVisualId: number|undefined = undefined;
    private gestureAnimation: { from: number, to: number, start: number, spring: NiriAnimation|null, visual?: boolean } | null = null;
    private readonly gestureSettleDuration: number;
    private readonly gestureDesktopSwitch: boolean;
    private readonly closeRelayoutDelayer: Delayer;
    private readonly closeRelayoutDelay: number;
    private arrangeHeld = false;
    public readonly dynamicDesktops: DynamicDesktops;
    public readonly desktopAutoBackAndForth: boolean;
    public readonly desktopBindNames: string[];
    // the desktop each output showed at the last change, and the one before it (niri's back-and-forth, per monitor)
    private readonly shownDesktops = new Map<string, KwinDesktop>();
    private readonly previousDesktops = new Map<string, KwinDesktop>();
    // set once two outputs show different desktops: the per-screen setting is on (a script cannot read the setting)
    private perScreenSeen = false;
    private overview!: Overview;
    private readonly shortcutKeys: Record<string, string[]>;
    private readonly layoutProfiles: LayoutProfiles;

    private readonly viewAnimationConfig: { animHorizontalViewMovement: string, animationsOff: boolean, animationsSlowdown: number };

    constructor(config: Config, keyBindings: KeyBindings | null = null, layout: World.Layout | null = null) {
        setCursorWarpConfig(config);
        this.viewAnimationConfig = config;
        this.shortcutKeys = config.shortcutKeys;
        const focusPasser = new FocusPassing.Passer();
        this.focusPasser = focusPasser;
        this.workspaceSignalManager = initWorkspaceSignalHandlers(this, focusPasser);

        this.layoutProfiles = new LayoutProfiles(config, layoutConfig => World.buildProfile(layoutConfig));

        // niri's floating layer takes the presets relative to the work area
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
            verticalResizeStep: config.verticalResizeStep,
            clampDesktopIndex: (index: number) => this.dynamicDesktops.clampIndex(index),
            emptyDesktopNextToCurrent: (below: boolean) => this.dynamicDesktops.emptyDesktopNextToCurrent(below),
            releaseNewDesktop: () => this.dynamicDesktops.releaseReserved(),
            columnWidthChanges: SizeChange.parseList(config.columnWidthSet),
            windowHeightChanges: SizeChange.parseList(config.windowHeightSet),
        };
        this.actions = new Actions(actionsConfig);
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
        this.gestureEndDelayer = new Delayer(40, () => this.gestureRelease());
        this.gestureAnimationTimer = initQmlTimer()!;
        this.gestureAnimationTimer.interval = 16;
        this.gestureAnimationTimer.repeat = true;
        this.gestureAnimationTimer.triggered.connect(() => this.gestureAnimationStep());

        // KWin has no signal for a change of a client's minimum size: look twice a second
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

        this.desktopManager = new DesktopManager(
            this.pinManager,
            this.layoutProfiles,
            focusPasser,
            new DesktopFilter(config.tiledDesktops),
            () => this.getFocusedTileOutput(),
        );
        this.clientManager = new ClientManager(config, this, this.desktopManager, this.pinManager);
        warpFrame.provider = kwinClient => this.clientManager.getWarpFrame(kwinClient);
        this.dynamicDesktops = new DynamicDesktops(
            {
                enabled: config.dynamicDesktops,
                emptyAbove: config.emptyDesktopAboveFirst,
                names: DynamicDesktops.parseNames(config.namedDesktops),
            },
            desktop => this.clientManager.isDesktopOccupied(desktop),
            layout?.namedDesktops ?? [],
            (oldDesktop, newDesktop) => {
                for (const [name, desktop] of this.previousDesktops) {
                    if (desktop === oldDesktop) {
                        this.previousDesktops.set(name, newDesktop);
                    }
                }
            },
        );
        this.desktopAutoBackAndForth = config.desktopAutoBackAndForth;
        this.desktopBindNames = DynamicDesktops.parseNames(config.desktopBindNames);
        if (layout?.previousDesktop !== undefined) {
            const previous = Workspace.desktops.find(desktop => desktop.id === layout.previousDesktop);
            if (previous !== undefined) {
                for (const output of Workspace.screens) {
                    this.previousDesktops.set(output.name, previous);
                }
            }
        }
        this.overview = new Overview(this, this.clientManager, this.desktopManager);
        if (layout !== null) {
            this.clientManager.prepareRestore(layout.floating, layout.manual, layout.floatingFrames);
        }
        this.addExistingClients(layout);
        if (layout !== null) {
            this.restoreLayout(layout);
        }
        // the focused window keeps the focus (KWin does not say it again)
        const active = Workspace.activeWindow;
        if (active !== null && this.clientManager.hasClient(active)) {
            this.clientManager.onClientFocused(active);
        }
        if (layout !== null) {
            this.restoreViews(layout);
        }
        this.rememberShownDesktops();
        this.update();
        this.clientManager.armStartupTimer();
    }

    private static buildProfile(config: Config): LayoutProfile {
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

        let defaultColumnWidth: ((tilingAreaWidth: number) => number) | null = null;
        if (config.defaultColumnWidth.trim() !== "") {
            try {
                defaultColumnWidth = PresetWidths.parseWidth(config.defaultColumnWidth, config.gapsInnerHorizontal);
            } catch (error: any) {
                log("invalid defaultColumnWidth:", config.defaultColumnWidth, error);
            }
        }

        const layout: LayoutConfig = {
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
            tabIndicatorPlaceWithinColumn: config.tabIndicatorPlaceWithinColumn,
            tabIndicatorGapsBetweenTabs: config.tabIndicatorGapsBetweenTabs,
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
        return {
            desktop: {
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
            layout: layout,
            presetWidths: presetWidths,
            presetHeights: presetHeights,
            columnResizer: config.scrollingCentered ? new RawResizer(presetWidths) : new ContextualResizer(presetWidths),
            defaultColumnWidth: defaultColumnWidth,
            look: null,
            fullscreenBackdropColor: undefined,
            backgroundColor: undefined,
        };
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
        const outputs = new Map<string, string>();
        if (layout !== null) {
            for (const column of layout.columns) {
                for (const window of column.windows) {
                    if (column.output !== undefined) {
                        outputs.set(window.id, column.output);
                    }
                }
            }
        }
        for (const kwinClient of kwinClients) {
            this.clientManager.addClient(kwinClient, true, outputs.get(String(kwinClient.internalId)));
        }
    }

    // the state that is not in the windows themselves, to rebuild the world after a reload
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
                    output: desktop.outputName,
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
        const previousDesktop = this.getPreviousDesktop(this.getFocusedOutput());
        return {
            columns, views, floating: floating.floating, manual: floating.manual, floatingFrames: floating.floatingFrames,
            namedDesktops: this.dynamicDesktops.captureNamed(),
            previousDesktop: previousDesktop !== null && Workspace.desktops.includes(previousDesktop) ? previousDesktop.id : undefined,
        };
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
                    continue;
                }
                windows.push(window);
                savedWindows.push(saved);
                if (saved.fullScreen) {
                    window.client.windowedFullScreen = saved.windowedFullScreen === true;
                    window.client.setFullScreen(true);
                    if (window.client.windowedFullScreen) {
                        window.onFullScreenChanged(true);
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
                window.column.onWindowFocused(window);
            }
            desktop.setScroll(view.scrollX, true);
            // the focused window may be a tiled one that was not in the saved layout: keep it in view
            const focusedColumn = desktop.grid.getLastFocusedColumn();
            if (focusedColumn !== null && focusedColumn.getWidth() <= desktop.tilingArea.width && !Range.contains(desktop.getCurrentVisibleRange(), focusedColumn)) {
                desktop.fitColumnInView(focusedColumn);
            }
        }
    }

    private getFocusedTileOutput() {
        const active = Workspace.activeWindow;
        if (active === null || this.clientManager === undefined) {
            return null;
        }
        const window = this.clientManager.findTiledWindow(active);
        return window === null ? null : window.column.grid.desktop.outputName;
    }

    private update() {
        this.dynamicDesktops.update();
        if (this.clientManager.hasDynamicRules() || this.layoutProfiles.hasLooks()) {
            // is-focused, is-active, is-floating ... may have changed; a window may be on another desktop or output with
            // another look
            this.clientManager.refreshRules();
        }
        this.updateOutputBackgrounds();
        if (this.arrangeHeld) {
            return;
        }
        const currentDesktop = this.desktopManager.getCurrentDesktop();
        if (currentDesktop !== undefined) {
            currentDesktop.arrange();
        }
        // like niri, every desktop stays laid out
        for (const desktop of this.desktopManager.getAllDesktops()) {
            if (desktop !== currentDesktop) {
                desktop.arrange();
            }
        }
        flushCursorWarp();
    }

    // niri's layout.background-color of every output, with the layout {} of the desktop on it merged over
    private updateOutputBackgrounds() {
        if (this.layoutProfiles.isEmpty()) {
            return;
        }
        const colors: Record<string, string> = {};
        for (const output of Workspace.screens) {
            const desktop = this.desktopManager.getDesktopInCurrentActivity(currentDesktopOn(output), output.name);
            const color = desktop?.profile.backgroundColor;
            if (color !== undefined) {
                colors[output.name] = color;
            }
        }
        setOutputBackgrounds(colors);
    }

    // niri's double resize-click on an edge: the column width toggles (left, right) or the window height resets (top,
    // bottom)
    public doResizeEdgeDoubleClick(window: Window, horizontal: boolean, vertical: boolean) {
        this.do((clientManager, desktopManager) => {
            window.client.focus();
            const column = window.column;
            const grid = column.grid;
            if (horizontal) {
                this.actions.columnWidthMaximize(clientManager, desktopManager, window, column, grid);
            }
            if (vertical) {
                this.actions.windowHeightReset(clientManager, desktopManager, window, column, grid);
            }
        });
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
        if (Workspace.activeWindow === null || Workspace.activeWindow.desktopWindow) {
            // niri always has a focused window: the actions work on the one that had it last
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

    // niri's two layers: with a floating window focused the focus keys act on the floating layer only
    public doFocusLayered(
        f: (clientManager: ClientManager, desktopManager: DesktopManager, window: Window, column: Column, grid: Grid) => void,
        floating: (clientManager: ClientManager, active: KwinClient) => void,
    ) {
        const active = Workspace.activeWindow;
        if (active !== null && this.clientManager.isUserFloating(active) && !active.fullScreen) {
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

    // like `doIfTiledFocused`, but the focus moves into the grid when no tiled window has it
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

    // runs `f` for a tiled focused window, `floating` for a floating one
    public doIfTiledFocusedOrFloating(
        f: (clientManager: ClientManager, desktopManager: DesktopManager, window: Window, column: Column, grid: Grid) => void,
        floating: (clientManager: ClientManager, active: KwinClient) => void,
    ) {
        const active = Workspace.activeWindow;
        if (active !== null && this.clientManager.isUserFloating(active)) {
            this.do(clientManager => floating(clientManager, active));
            return;
        }
        this.doIfTiledFocused(f);
    }

    // runs `f` for a tiled focused window; a floating one moves by (dx, dy)
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

    public holdArrangeForClose() {
        if (this.closeRelayoutDelay === 0) {
            return;
        }
        this.arrangeHeld = true;
        this.closeRelayoutDelayer.run();
    }

    public holdArrange() {
        this.arrangeHeld = true;
    }

    public releaseArrangeHold() {
        this.arrangeHeld = false;
    }

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

    // raw swipe from kiri_swipe: the uncapped finger travel of a 3-finger horizontal swipe
    public gestureRaw(json: string) {
        let swipe: { id?: number, phase: string, end: boolean, ev: number[][], f?: number, d0?: number, ptr?: boolean };
        try {
            swipe = JSON.parse(json);
        } catch (error: any) {
            return;
        }
        if (swipe.f === 4) {
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
                // a swipe never continues the position or velocity of the one before it
                this.gestureRawId = swipe.id;
                this.cutGestureSettle();
            }
            this.stopGestureAnimation();
            this.do((clientManager, desktopManager) => {
                const currentDesktop = this.getGestureDesktop();
                if (currentDesktop !== undefined) {
                    this.gestureDesktop = currentDesktop;
                    for (const event of swipe.ev) {
                        currentDesktop.gestureRawUpdate(event[1], event[0], swipe.d0 === undefined ? 0 : swipe.d0, swipe.ptr === true);
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

    // a new swipe starts on the view where it is now, as niri's does
    private cutGestureSettle() {
        const desktop = this.gestureDesktop;
        if (desktop === null || !desktop.isGestureScrolling()) {
            return;
        }
        const x = desktop.getScrollX();
        this.stopGestureAnimation();
        this.gestureAnimationDone();
        this.do(() => desktop.setScroll(x, true));
    }

    public startPointerViewScroll() {
        if (typeof qmlBase !== "undefined") {
            (qmlBase as any).startSwipePoll();
        }
    }

    public toggleDragFloating() {
        this.do((clientManager, desktopManager) => clientManager.toggleDragFloating());
    }

    public toggleOverview() {
        if (!this.overview.toggle()) {
            kglobalaccel.call("/component/kwin", "org.kde.kglobalaccel.Component", "invokeShortcut", ["s"], ["Overview"], () => {});
        }
    }

    public openOverview() {
        if (!this.overview.isOpen()) {
            this.toggleOverview();
        }
    }

    public closeOverview() {
        if (this.overview.isOpen()) {
            this.toggleOverview();
        }
    }

    public overviewWarm() {
        this.overview.warm();
    }

    public overviewPoll(json: string) {
        this.overview.poll(json);
    }

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
            swipeCall("release", { from: from, to: to, v: raw.velocity });
            this.do(() => desktop.setScroll(to, true));
            // niri moves the focus when the fingers are lifted
            this.gestureFocusTarget(desktop);
        }
        this.gestureAnimation = { from: from, to: to, start: Date.now(), spring: raw !== null ? niriViewAnimation(this.viewAnimationConfig, from, to, raw.velocity) : null, visual: visual };
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
                // the focus does not follow a swipe on a desktop that is not the current one
                currentDesktop.gestureScrollFinish(focusedWindow, Workspace.activeWindow !== null && focusedWindow === null, currentDesktop === desktopManager.getCurrentDesktop());
            }
        });
    }

    public gestureSwitchDesktop(offset: number) {
        if (!this.gestureDesktopSwitch) {
            return;
        }
        const index = Workspace.desktops.indexOf(this.getFocusedKwinDesktop()) + offset;
        if (index >= 0 && index < Workspace.desktops.length) {
            gotoDesktop(Workspace.desktops[index], "swipe", this.getFocusedOutput());
        }
    }

    public releaseKeyBindings() {
        this.keyBindingsReleased = true;
        return this.keyBindings;
    }

    public destroy() {
        this.overview.close();
        this.dynamicDesktops.destroy();
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
        this.rememberShownDesktops();
        this.dynamicDesktops.onDesktopChanged();
    }

    public isPerScreenDesktops() {
        if (!this.perScreenSeen && Workspace.screens.length > 1) {
            const first = currentDesktopOn(Workspace.screens[0]);
            this.perScreenSeen = Workspace.screens.some(output => currentDesktopOn(output) !== first);
        }
        return this.perScreenSeen;
    }

    private rememberShownDesktops() {
        this.isPerScreenDesktops();
        for (const output of Workspace.screens) {
            const now = currentDesktopOn(output);
            const before = this.shownDesktops.get(output.name);
            if (before !== undefined && before !== now) {
                this.previousDesktops.set(output.name, before);
            }
            this.shownDesktops.set(output.name, now);
        }
    }

    public getPreviousDesktop(output: Output) {
        return this.previousDesktops.get(output.name) ?? null;
    }

    public getFocusedOutput() {
        return this.desktopManager.getFocusedOutput();
    }

    // the desktop shown on the focused output
    public getFocusedKwinDesktop() {
        return this.desktopManager.getCurrentKwinDesktop();
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
    export interface Layout {
        columns: {
            output?: string;
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
        floating: string[];
        manual: string[];
        floatingFrames: { id: string, x: number, y: number, width: number, height: number }[];
        views: { desktop: string, scrollX: number, focused: string | null }[];
        namedDesktops?: string[];
        previousDesktop?: string;
    }
}
