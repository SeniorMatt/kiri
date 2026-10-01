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
    // the desktop a swipe started on: it keeps the swipe if the current desktop changes while the fingers are down
    private gestureDesktop: Desktop|null = null;
    private gestureRawId: number|undefined = undefined;
    private gestureAnimation: { from: number, to: number, start: number, spring: NiriSpring|null } | null = null;
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
        this.dynamicDesktops.update();
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
        let swipe: { id?: number, phase: string, end: boolean, ev: number[][], f?: number };
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
                        currentDesktop.gestureRawUpdate(event[1], event[0]);
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
        if ((raw === null && from === to) || this.gestureSettleDuration === 0) {
            this.do((clientManager, desktopManager) => {
                desktop.setScroll(to, raw !== null);
            });
            this.gestureAnimationDone();
            return;
        }
        this.gestureAnimation = { from: from, to: to, start: Date.now(), spring: raw !== null ? niriViewSpring(from, to, raw.velocity) : null };
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
        this.do(() => desktop.setScroll(x, spring !== null));
        if (t >= 1 || (spring !== null && spring.duration === 0)) {
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
            Workspace.currentDesktop = Workspace.desktops[index];
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
    export interface Layout {
        columns: {
            windows: { client: KwinClient, fullScreen: boolean, maximizedMode: MaximizedMode }[];
            heightRatios: number[];
            tabbed: boolean;
        }[];
    }
}
