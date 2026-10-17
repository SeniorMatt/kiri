const ringCaption = "kiri-ring";

// A tiled X11 window that is closed and mapped again right away by the same process is the same window to the user: SDL
// on X11 unmaps and maps its window when a game goes full-screen, and KWin deletes the old window and makes a new one.
// The place, the full-screen state and the focus of the closed window wait this long for such a window.
const remapHoldMs = 300;
// only windows that are, were or just became full-screen are expected to come back
const remapRecentMs = 2000;

interface ClosedSlot {
    pid: number;
    resourceClass: string;
    time: number;
    placement: ClientState.Tiled.Placement;
    preferredWidth: number;
    fullScreen: boolean;
    maximizedMode: MaximizedMode;
    viewRestoreOffset: number|null;
    focused: boolean; // had the focus, or lost it to KWin's pick a moment before the close was reported
    grid: Grid;
    scrollX: number; // where the view was while the window had the focus
    focusCounter: number;
}

class ClientManager {
    private readonly config: ClientManager.Config;
    private readonly clientMap: Map<KwinClient, ClientWrapper>;
    private lastFocusedClient: KwinClient|null;
    // the window that had the focus before the current one, and when and how the current one got it: KWin picks the
    // next window itself just before it reports a closed one, which must not pass for the user's choice
    private focusedBefore: KwinClient|null = null;
    private lastActivationTime = 0;
    private lastActivationByKiri = false;
    private floatingFocusOrder: KwinClient[] = []; // most recently focused last
    private focusStamps = new Map<KwinClient, number>(); // for focus-window-previous
    private focusCounter = 0;
    private readonly floatingFrames = new Map<KwinClient, { x: number, y: number, width: number, height: number }>();
    private readonly windowRuleEnforcer: WindowRuleEnforcer;
    private closedSlot: ClosedSlot|null = null;
    private readonly remapTimer: Delayer;
    private static readonly kwinPickMs = 150;

    constructor(
        config: Config,
        private readonly world: World,
        private readonly desktopManager: DesktopManager,
        private readonly pinManager: PinManager,
    ) {
        this.world = world;
        this.config = config;
        this.desktopManager = desktopManager;
        this.pinManager = pinManager;
        this.clientMap = new Map();
        this.lastFocusedClient = null;

        let parsedWindowRules: WindowRule[] = [];
        try {
            parsedWindowRules = JSON.parse(config.windowRules);
        } catch (error: any) {
            notificationInvalidWindowRules.sendEvent();
            log("failed to parse windowRules:", error);
        }
        this.remapTimer = new Delayer(remapHoldMs, () => this.world.do(() => this.expireClosedSlot()));
        this.windowRuleEnforcer = new WindowRuleEnforcer(
            [...getSimpleWindowRules(config.floatClasses, config.tileClasses, config.columnWidthRules), ...parsedWindowRules],
            config.tileFullScreen, config.defaultColumnWidth, config.gapsInnerHorizontal,
            {
                isFloating: kwinClient => this.isFloating(kwinClient),
                isFocused: kwinClient => Workspace.activeWindow === kwinClient,
                isActive: kwinClient => this.isActiveWindow(kwinClient),
            },
            config.gapsInnerVertical);
    }

    // niri's is-active: the window that is active on its desktop (the one that has the focus there, or got it last)
    private isActiveWindow(kwinClient: KwinClient) {
        if (Workspace.activeWindow === kwinClient) {
            return true;
        }
        const desktop = this.desktopManager.getDesktopForClient(kwinClient);
        const column = desktop?.grid.getLastFocusedColumn() ?? null;
        return column !== null && column.getWindowToFocus().client.kwinClient === kwinClient;
    }

    // `existing` is for windows that were already open when Kiri started, they keep their width
    public addClient(kwinClient: KwinClient, existing = false) {
        if (kwinClient.caption.startsWith(ringCaption)) {
            return; // our own focus ring window
        }
        console.assert(!this.hasClient(kwinClient));

        const slot = this.takeClosedSlot(kwinClient);
        let constructState: (client: ClientWrapper) => ClientState.State;
        let desktop: Desktop | undefined;
        if (kwinClient.dock) {
            constructState = () => new ClientState.Docked(this.world, kwinClient);
        } else if (
            Clients.canTileEver(kwinClient) &&
            this.windowRuleEnforcer.shouldTile(kwinClient) &&
            (desktop = this.desktopManager.getDesktopForClient(kwinClient)) !== undefined
        ) {
            Clients.makeTileable(kwinClient);
            console.assert(Clients.canTileNow(kwinClient));
            constructState = (client: ClientWrapper) => {
                if (slot !== null) {
                    client.preferredWidth = slot.preferredWidth;
                } else if (!existing) {
                    const width = this.windowRuleEnforcer.getColumnWidth(kwinClient, desktop!.tilingArea.width);
                    if (width !== null) {
                        client.preferredWidth = width;
                    }
                }
                const state = new ClientState.Tiled(this.world, client, desktop!.grid, slot !== null && slot.grid === desktop!.grid ? slot.placement : undefined);
                if (!existing) {
                    // niri's default-window-height
                    const height = this.windowRuleEnforcer.getWindowHeight(kwinClient, desktop!.tilingArea.height);
                    if (height !== null) {
                        state.window.column.setFixedHeight(state.window, height, null);
                    }
                }
                return state;
            };
        } else {
            log("window not tiled:", JSON.stringify({
                caption: kwinClient.caption,
                resourceClass: kwinClient.resourceClass,
                pid: kwinClient.pid,
                fullScreen: kwinClient.fullScreen,
                reason: this.windowRuleEnforcer.whyNotTiled(kwinClient) || (desktop === undefined ? "no tiled desktop for it" : "unknown"),
            }));
            constructState = (client: ClientWrapper) => new ClientState.Floating(this.world, client, this.config, false, true);
        }

        const client = new ClientWrapper(
            kwinClient,
            constructState,
            this.findTransientFor(kwinClient),
            this.windowRuleEnforcer.initClientSignalManager(this.world, kwinClient),
        );
        this.clientMap.set(kwinClient, client);
        if (slot !== null) {
            client.x11 = true; // the same X11 window again
        } else {
            queryX11Window(kwinClient, x11 => { client.x11 = x11; });
        }

        if (!existing) {
            this.applyOpenRules(client);
            if (!kwinClient.dock) {
                // niri warps the cursor to a newly opened window that it activates (warp-mouse-to-focus)
                KiriFocus.mark(kwinClient);
            }
        }
        if (slot !== null) {
            this.fillClosedSlot(slot, kwinClient, client);
        }
    }

    // niri's open-fullscreen, and the size and the centering of a new window that a float rule (open-floating) matches
    private applyOpenRules(client: ClientWrapper) {
        const kwinClient = client.kwinClient;
        const state = client.stateManager.getState();
        if (state instanceof ClientState.Floating && !Clients.placesItself(kwinClient)) {
            const area = Workspace.clientArea(ClientAreaOption.PlacementArea, kwinClient.output, Clients.getKwinDesktopApprox(kwinClient));
            const size = this.windowRuleEnforcer.getFloatingSize(kwinClient, area);
            if (size !== null) {
                const frame = kwinClient.frameGeometry;
                const min = kwinClient.minSize;
                const max = kwinClient.maxSize;
                const fit = (value: number, minimum: number, maximum: number) => {
                    value = Math.max(1, Math.round(value));
                    return Math.max(maximum > 0 ? Math.min(value, Math.floor(maximum)) : value, Math.ceil(minimum));
                };
                const width = size.width === undefined ? frame.width.round() : fit(size.width, min.width, max.width);
                const height = size.height === undefined ? frame.height.round() : fit(size.height, min.height, max.height);
                const { x, y } = ClientManager.centerInArea(area, width, height);
                client.place(x, y, width, height);
            }
        }
        if (state instanceof ClientState.Tiled && this.windowRuleEnforcer.shouldOpenFullScreen(kwinClient)) {
            client.setFullScreen(true);
        }
    }

    // niri's center_preferring_top_left_in_area: centered, but a window larger than the area keeps its top-left corner
    public static centerInArea(area: QmlRect, width: number, height: number) {
        return {
            x: Math.round(area.x + Math.max((area.width - width) / 2, 0)),
            y: Math.round(area.y + Math.max((area.height - height) / 2, 0)),
        };
    }

    // niri's center-window / center-column on the floating layer
    public centerFloatingClient(kwinClient: KwinClient) {
        const client = this.clientMap.get(kwinClient);
        if (client === undefined || !this.isFloating(kwinClient)) {
            return;
        }
        const area = Workspace.clientArea(ClientAreaOption.PlacementArea, kwinClient.output, Clients.getKwinDesktopApprox(kwinClient));
        const frame = kwinClient.frameGeometry;
        const width = frame.width.round();
        const height = frame.height.round();
        const { x, y } = ClientManager.centerInArea(area, width, height);
        client.place(x, y, width, height);
    }

    // The window just came back: it takes the state and the focus of the one that was closed, and the view stays
    private fillClosedSlot(slot: ClosedSlot, kwinClient: KwinClient, client: ClientWrapper) {
        this.remapTimer.stop();
        this.world.releaseArrangeHold();
        const window = this.findTiledWindow(kwinClient);
        if (window === null) {
            return;
        }
        if (slot.fullScreen) {
            client.setFullScreen(true);
        } else if (slot.maximizedMode !== MaximizedMode.Unmaximized) {
            client.setMaximize(
                slot.maximizedMode === MaximizedMode.Horizontally || slot.maximizedMode === MaximizedMode.Maximized,
                slot.maximizedMode === MaximizedMode.Vertically || slot.maximizedMode === MaximizedMode.Maximized,
            );
        }
        if (slot.viewRestoreOffset !== null) {
            window.column.grid.setViewRestoreOffset(window.column, slot.viewRestoreOffset); // the view before the window went full-screen
        }
        if (slot.focused) {
            window.focus();
            window.column.grid.desktop.setScroll(slot.scrollX, true);
        }
    }

    private takeClosedSlot(kwinClient: KwinClient) {
        const slot = this.closedSlot;
        if (slot === null) {
            return null;
        }
        if (Date.now() - slot.time > remapHoldMs) {
            this.expireClosedSlot();
            return null;
        }
        if (slot.pid !== kwinClient.pid || slot.resourceClass !== kwinClient.resourceClass) {
            return null;
        }
        this.closedSlot = null;
        return slot;
    }

    public hasClosedSlot() {
        return this.closedSlot !== null;
    }

    // No window came back: the focus goes where it would have gone when the window was closed
    private expireClosedSlot() {
        const slot = this.closedSlot;
        this.closedSlot = null;
        this.remapTimer.stop();
        this.world.releaseArrangeHold();
        if (slot === null) {
            return;
        }
        const grid = slot.grid;
        if (slot.focused && this.focusCounter === slot.focusCounter) {
            const target = grid.getLastFocusedWindow(); // the grid has picked the window that takes the place
            if (target !== null) {
                target.focus();
            }
        }
        grid.desktop.autoAdjustScroll();
    }

    // Remembers the place of a window that is being closed and that may come back. Returns false for any other window.
    private rememberClosed(kwinClient: KwinClient, client: ClientWrapper, kwinPicked: boolean) {
        const window = this.findTiledWindow(kwinClient);
        const now = Date.now();
        if (window === null || !client.x11 || kwinClient.pid <= 0 || kwinClient.resourceClass === "" ||
            !(kwinClient.fullScreen || client.fullScreenSeen || (client.getMaximizedMode() ?? MaximizedMode.Unmaximized) !== MaximizedMode.Unmaximized ||
                client.maximizedSeen || now - client.createdAt < remapRecentMs)) {
            return false;
        }
        if (this.closedSlot !== null) {
            this.expireClosedSlot();
        }
        const column = window.column;
        const grid = column.grid;
        const desktop = grid.desktop;
        const scrollBefore = grid.getScrollBeforeFocusLeft(column);
        const focused = kwinClient === this.lastFocusedClient || kwinPicked || scrollBefore !== null;
        this.closedSlot = {
            pid: kwinClient.pid,
            resourceClass: kwinClient.resourceClass,
            time: now,
            placement: {
                column: column.getWindowCount() > 1 ? column : null,
                after: column.getAboveWindow(window),
                leftColumn: grid.getLeftColumn(column),
            },
            preferredWidth: client.preferredWidth,
            fullScreen: kwinClient.fullScreen,
            maximizedMode: client.getMaximizedMode() ?? MaximizedMode.Unmaximized,
            viewRestoreOffset: grid.getViewRestoreOffset(column),
            focused: focused,
            grid: grid,
            scrollX: scrollBefore ?? desktop.getScrollX(),
            focusCounter: this.focusCounter,
        };
        return true;
    }

    // `mayReturn`: the window was closed by KWin, and a window of the same process may be mapped right away
    public removeClient(kwinClient: KwinClient, passFocus: FocusPassing.Type, mayReturn = false) {
        if (!this.hasClient(kwinClient)) {
            return;
        }
        const client = this.clientMap.get(kwinClient);
        if (client === undefined) {
            return;
        }
        // KWin may already have dropped the focus (e.g. a closing full-screen window with focus-follows-mouse
        // over empty space): then a neighbour must get it as well
        const focusLost = Workspace.activeWindow === null || Workspace.activeWindow === kwinClient;
        // KWin's own pick of a window (a panel, the desktop, anything from its focus history) right before the close
        // is reported does not count: niri's rule decides. Only a pick the user made (a click) stays.
        const kwinPicked = this.focusedBefore === kwinClient && !this.lastActivationByKiri && Date.now() - this.lastActivationTime < ClientManager.kwinPickMs;
        if (kwinClient !== this.lastFocusedClient && !focusLost && !kwinPicked) {
            passFocus = FocusPassing.Type.None;
        }
        if (kwinPicked) {
            // the grid goes by the window that was focused when it closed, not by KWin's pick
            const window = this.findTiledWindow(kwinClient);
            if (window !== null) {
                window.column.onWindowFocused(window);
            }
        }
        const held = mayReturn && this.rememberClosed(kwinClient, client, kwinPicked);
        client.destroy(held ? FocusPassing.Type.None : passFocus);
        this.clientMap.delete(kwinClient);
        this.toggledManually.delete(kwinClient);
        this.focusStamps.delete(kwinClient);
        this.floatingFrames.delete(kwinClient);
        this.floatingFocusOrder = this.floatingFocusOrder.filter(c => c !== kwinClient);
        setVisualPosition(String(kwinClient.internalId), null); // a window that closes in the middle of a resize
        if (held) {
            const slot = this.closedSlot!;
            // like the window being still there: the focus stays, the view stays and nothing moves
            slot.grid.desktop.setScroll(slot.scrollX, true);
            this.world.holdArrange();
            this.remapTimer.run();
        }
    }

    private findTransientFor(kwinClient: KwinClient) {
        if (!kwinClient.transient || kwinClient.transientFor === null) {
            return null;
        }

        const transientFor = this.clientMap.get(kwinClient.transientFor);
        if (transientFor === undefined) {
            return null;
        }

        return transientFor;
    }

    public minimizeClient(kwinClient: KwinClient) {
        const client = this.clientMap.get(kwinClient);
        if (client === undefined) {
            return;
        }
        if (client.stateManager.getState() instanceof ClientState.Tiled) {
            const passFocus = kwinClient === this.lastFocusedClient ? FocusPassing.Type.Immediate : FocusPassing.Type.None;
            // restoring the window from the task bar puts it back in its old place if the neighbours are still there
            const window = this.findTiledWindow(kwinClient);
            const slot = window === null ? null : {
                grid: window.column.grid,
                placement: {
                    column: window.column.getWindowCount() > 1 ? window.column : null,
                    after: window.column.getAboveWindow(window),
                    leftColumn: window.column.grid.getLeftColumn(window.column),
                    atStart: window.column.grid.getLeftColumn(window.column) === null,
                },
            };
            client.stateManager.setState(
                () => new ClientState.TiledMinimized(this.world, client, slot),
                passFocus,
            );
        }
    }

    // niri's interactive move: the window leaves the grid after INTERACTIVE_MOVE_START_THRESHOLD (256 px) of pointer
    // travel (floating windows move at once), keeps its size and follows the pointer; the insert hint shows where it
    // lands and it is tiled again there on release.
    public static readonly dragStartDistance = 256;
    public static readonly dragOpacity = 0.75;

    public floatForDrag(client: ClientWrapper) {
        this.floatDragged(client);
    }

    public floatDragged(client: ClientWrapper) {
        const kwinClient = client.kwinClient;
        const opacityBefore = kwinClient.opacity;
        kwinClient.opacity = ClientManager.dragOpacity; // niri's INTERACTIVE_MOVE_ALPHA
        setVisualPosition(String(kwinClient.internalId), null); // the rubber band is over
        // no limitHeight: the dragged window keeps the size it had in the grid, like niri's moving tile
        if (!(client.stateManager.getState() instanceof ClientState.Floating)) {
            // niri never shows a title bar, so the dragged window keeps it hidden; only a drop as floating brings it back
            client.keepTitlebarHidden = true;
            try {
                client.stateManager.setState(() => new ClientState.Floating(this.world, client, this.config, false), FocusPassing.Type.None);
            } finally {
                client.keepTitlebarHidden = false;
            }
        }
        if (!this.config.dropToTile) {
            const done = new SignalManager();
            done.connect(kwinClient.interactiveMoveResizeFinished, () => {
                done.destroy();
                kwinClient.opacity = opacityBefore;
                client.restoreTitlebar();
            });
            return;
        }
        const manager = new SignalManager();
        const update = () => this.world.do(() => this.updateInsertHint(kwinClient));
        manager.connect(kwinClient.frameGeometryChanged, update);
        manager.connect(kwinClient.interactiveMoveResizeFinished, () => {
            manager.destroy();
            kwinClient.opacity = opacityBefore;
            setInsertHint(null);
            this.world.do(() => this.dropTile(kwinClient));
            if (!(client.stateManager.getState() instanceof ClientState.Tiled)) {
                client.restoreTitlebar(); // dropped as a floating window
            }
        });
        update();
    }

    // niri's scrolling insert_position: the closest gap between columns, or between the windows of the column
    // under the pointer, whichever is nearer. Coordinates are screen coordinates.
    private insertTarget(desktop: Desktop, columns: Column[], cursor: { x: number, y: number }): InsertTarget | null {
        if (columns.length === 0) {
            return { column: 0, tile: null, rect: null };
        }
        const grid = desktop.grid;
        const gap = grid.config.gapsInnerHorizontal;
        const gapV = grid.config.gapsInnerVertical;
        const area = desktop.tilingArea;
        const offsetX = area.x - desktop.getScrollX();
        const xs = columns.map(column => column.getLeft() + offsetX - gap / 2);
        xs.push(columns[columns.length - 1].getRight() + offsetX + gap / 2);
        let closest = 0;
        for (let i = 1; i < xs.length; i++) {
            if (Math.abs(xs[i] - cursor.x) < Math.abs(xs[closest] - cursor.x)) {
                closest = i;
            }
        }
        let columnIndex = -1; // the column the cursor is over
        for (let i = 0; i < columns.length; i++) {
            if (cursor.x >= xs[i]) {
                columnIndex = i;
            }
        }
        let tileGap: { windowIndex: number, distance: number, y: number } | null = null;
        if (columnIndex >= 0 && cursor.x < xs[columns.length]) {
            const windows = columns[columnIndex].getWindows();
            if (columns[columnIndex].isTabbed()) {
                const active = columns[columnIndex].getWindowToFocus();
                const index = windows.indexOf(active);
                const top = active.client.kwinClient.frameGeometry.y - gapV / 2;
                const bottom = top + active.height + gapV;
                tileGap = Math.abs(top - cursor.y) <= Math.abs(bottom - cursor.y) ?
                    { windowIndex: index, distance: Math.abs(top - cursor.y), y: top + gapV / 2 } :
                    { windowIndex: index + 1, distance: Math.abs(bottom - cursor.y), y: bottom - gapV / 2 };
            } else {
                let y = area.y - gapV / 2;
                for (let j = 0; j <= windows.length; j++) {
                    const distance = Math.abs(y - cursor.y);
                    if (tileGap === null || distance < tileGap.distance) {
                        tileGap = { windowIndex: j, distance: distance, y: y + gapV / 2 };
                    }
                    if (j < windows.length) {
                        y += windows[j].height + gapV;
                    }
                }
            }
        }
        const columnDistance = Math.abs(xs[closest] - cursor.x);
        if (tileGap !== null && columnDistance > tileGap.distance) {
            // InColumn hint (niri insert_hint_area): 150 px tall at the top or bottom of the column, 300 px between windows
            const column = columns[columnIndex];
            const count = column.getWindows().length;
            const x = column.getLeft() + offsetX;
            const w = column.getWidth();
            let h = 150, y = tileGap.y;
            if (tileGap.windowIndex === 0) {
                // 150 at the top
            } else if (tileGap.windowIndex === count) {
                y = tileGap.y - 150 - gapV;
                if (column.isTabbed()) {
                    y = tileGap.y + gapV / 2 - 150;
                }
            } else {
                h = 300;
                y = tileGap.y - gapV / 2 - 150;
            }
            return { column: columnIndex, tile: tileGap.windowIndex, rect: { x: x, y: y, width: w, height: h } };
        }
        // NewColumn hint: 300 px wide, centred on the gap, inset by the gap at the top and bottom
        const gapsOuter = gapV;
        let hx = xs[closest] + gap / 2 - 150 - gap / 2;
        if (closest === 0) {
            hx = xs[0] + gap / 2 - 300 - gap;
        } else if (closest === columns.length) {
            hx = xs[closest] + gap / 2;
        }
        return { column: closest, tile: null, rect: { x: hx, y: area.y + gapsOuter, width: 300, height: area.height - gapsOuter * 2 } };
    }

    private updateInsertHint(kwinClient: KwinClient) {
        const client = this.clientMap.get(kwinClient);
        if (client === undefined || !(client.stateManager.getState() instanceof ClientState.Floating)) {
            setInsertHint(null);
            return;
        }
        const desktop = this.desktopManager.getDesktopForClient(kwinClient);
        if (desktop === undefined) {
            setInsertHint(null);
            return;
        }
        const target = this.insertTarget(desktop, desktop.grid.getColumns(), Workspace.cursorPos);
        setInsertHint(target === null ? null : target.rect, String(kwinClient.internalId));
    }

    private dropTile(kwinClient: KwinClient) {
        const client = this.clientMap.get(kwinClient);
        if (client === undefined || !(client.stateManager.getState() instanceof ClientState.Floating) || !Clients.canTileEver(kwinClient)) {
            return;
        }
        const desktop = this.desktopManager.getDesktopForClient(kwinClient);
        if (desktop === undefined) {
            return;
        }
        const grid = desktop.grid;
        const columns = grid.getColumns();
        const target = this.insertTarget(desktop, columns, Workspace.cursorPos); // before the window joins the grid
        this.tileClient(client, grid);
        const window = this.findTiledWindow(kwinClient);
        if (window === null || target === null || columns.length === 0) {
            return;
        }
        if (target.tile !== null) {
            const column = columns[target.column];
            const above = column.getWindows()[target.tile - 1] ?? null;
            window.moveToColumn(column, true, FocusPassing.Type.None, above);
        } else {
            grid.moveColumn(window.column, target.column === 0 ? null : columns[target.column - 1]);
        }
        window.focus();
    }

    public tileClient(client: ClientWrapper, grid: Grid, placement?: ClientState.Tiled.Placement) {
        if (client.stateManager.getState() instanceof ClientState.Tiled) {
            return;
        }
        client.stateManager.setState(() => new ClientState.Tiled(this.world, client, grid, placement), FocusPassing.Type.None);
    }

    // `recoverTiling`: the window is only floated because it is on no single desktop right now; it goes back to the grid
    public floatClient(client: ClientWrapper, recoverTiling = false) {
        if (client.stateManager.getState() instanceof ClientState.Floating) {
            return;
        }
        client.unpark();
        client.stateManager.setState(() => new ClientState.Floating(this.world, client, this.config, !recoverTiling, false, recoverTiling), FocusPassing.Type.None);
    }

    public tileKwinClient(kwinClient: KwinClient, grid: Grid) {
        const client = this.clientMap.get(kwinClient);
        if (client === undefined) {
            return;
        }
        this.tileClient(client, grid);
    }

    public floatKwinClient(kwinClient: KwinClient) {
        const client = this.clientMap.get(kwinClient);
        if (client === undefined) {
            return;
        }
        this.floatClient(client);
    }

    public pinClient(kwinClient: KwinClient) {
        const client = this.clientMap.get(kwinClient);
        if (client === undefined) {
            return;
        }
        if (client.getMaximizedMode() !== MaximizedMode.Unmaximized) {
            // the client is not really kwin-tiled, just maximized
            kwinClient.tile = null;
            return;
        }
        client.stateManager.setState(() => new ClientState.Pinned(this.world, this.pinManager, this.desktopManager, kwinClient, this.config), FocusPassing.Type.None);
        this.pinManager.addClient(kwinClient);
        for (const desktop of this.desktopManager.getDesktopsForClient(kwinClient)) {
            desktop.onPinsChanged();
        }
    }

    public unpinClient(kwinClient: KwinClient) {
        const client = this.clientMap.get(kwinClient);
        if (client === undefined) {
            return;
        }
        console.assert(client.stateManager.getState() instanceof ClientState.Pinned);
        client.stateManager.setState(() => new ClientState.Floating(this.world, client, this.config, false), FocusPassing.Type.None);
        this.pinManager.removeClient(kwinClient);
        for (const desktop of this.desktopManager.getDesktopsForClient(kwinClient)) {
            desktop.onPinsChanged();
        }
    }

    public tileClientIfPossible(kwinClient: KwinClient) {
        const client = this.clientMap.get(kwinClient);
        if (client === undefined || !(client.stateManager.getState() instanceof ClientState.Floating)) {
            return;
        }
        if (!Clients.canTileEver(kwinClient) || !this.windowRuleEnforcer.shouldTile(kwinClient)) {
            return;
        }
        Clients.makeTileable(kwinClient);
        const desktop = this.desktopManager.getDesktopForClient(kwinClient);
        if (desktop === undefined) {
            return;
        }
        client.stateManager.setState(() => new ClientState.Tiled(this.world, client, desktop.grid), FocusPassing.Type.None);
    }

    private readonly toggledManually = new Set<KwinClient>();

    // the user floated or tiled this window with the toggle: caption rules leave it alone
    public wasToggledManually(kwinClient: KwinClient) {
        return this.toggledManually.has(kwinClient);
    }

    public toggleFloatingClient(kwinClient: KwinClient) {
        const client = this.clientMap.get(kwinClient);
        if (client === undefined) {
            return;
        }
        this.toggledManually.add(kwinClient);

        const clientState = client.stateManager.getState();
        if ((clientState instanceof ClientState.Floating || clientState instanceof ClientState.Pinned) && Clients.canTileEver(kwinClient)) {
            Clients.makeTileable(kwinClient);
            const desktop = this.desktopManager.getDesktopForClient(kwinClient);
            if (desktop === undefined) {
                return;
            }
            // niri remembers the floating size and position of a window that goes to the tiling layout
            const frame = kwinClient.frameGeometry;
            this.floatingFrames.set(kwinClient, { x: frame.x.round(), y: frame.y.round(), width: frame.width.round(), height: frame.height.round() });
            client.stateManager.setState(() => new ClientState.Tiled(this.world, client, desktop.grid), FocusPassing.Type.None);
        } else if (clientState instanceof ClientState.Tiled) {
            const saved = this.floatingFrames.get(kwinClient);
            client.stateManager.setState(() => new ClientState.Floating(this.world, client, this.config, saved === undefined), FocusPassing.Type.None);
            if (saved !== undefined) {
                const area = Workspace.clientArea(ClientAreaOption.PlacementArea, kwinClient.output, Clients.getKwinDesktopApprox(kwinClient));
                const { x, y } = ClientManager.clampFloatingPosition(area, saved.x, saved.y, saved.width, saved.height);
                client.place(x, y, saved.width, saved.height);
            }
        }
    }

    public hasClient(kwinClient: KwinClient) {
        return this.clientMap.has(kwinClient);
    }

    // Kiri warped the cursor to this tiled window just now (see onClientFocused)
    private warpedToTiled: { client: KwinClient, time: number }|null = null;

    public onClientFocused(kwinClient: KwinClient) {
        // With focus follows mouse, the warp to a tiled window that sits under a floating window (which is always on
        // top) makes KWin focus the floating one. Floating and tiled windows only swap focus with the switch key
        // (niri's layers), so a floating window that gets the focus right after the warp, not from Kiri, gives it back.
        const warped = this.warpedToTiled;
        this.warpedToTiled = null;
        if (warped !== null && warped.client !== kwinClient && Date.now() - warped.time < 800 &&
            this.isFloating(kwinClient) && !KiriFocus.peek(kwinClient) && this.clientMap.has(warped.client)) {
            KiriFocus.mark(warped.client);
            Workspace.activeWindow = warped.client;
            return;
        }
        if (kwinClient !== this.lastFocusedClient) {
            this.focusedBefore = this.lastFocusedClient;
        }
        this.lastActivationTime = Date.now();
        this.lastActivationByKiri = KiriFocus.peek(kwinClient);
        this.lastFocusedClient = kwinClient;
        this.focusStamps.set(kwinClient, ++this.focusCounter);
        // Like niri, only focus changes made by Kiri move the cursor, never pointer focus or an app activating
        // itself; the cursor position is checked before onFocused scrolls the window away from it. Floating
        // windows too: with focus follows mouse, a cursor left on the tiled window would take the focus back.
        const cursorWasOnWindow = rectContainsPoint(roundQtRect(kwinClient.frameGeometry), Workspace.cursorPos);
        const focusedByKiri = KiriFocus.take(kwinClient);
        const warp = this.config.cursorFollowsFocus && focusedByKiri && !cursorWasOnWindow;
        if (this.isFloating(kwinClient)) {
            this.floatingFocusOrder = this.floatingFocusOrder.filter(c => c !== kwinClient);
            this.floatingFocusOrder.push(kwinClient);
        }
        const window = this.findTiledWindow(kwinClient);
        if (window !== null) {
            // a window that may come back keeps the view; KWin's pick of a neighbour must not scroll to it
            const held = this.closedSlot !== null ? window.column.grid.desktop.getScrollX() : null;
            window.onFocused();
            if (held !== null) {
                window.column.grid.desktop.setScroll(held, true);
            }
        }
        if (warp && (window !== null || this.isFloating(kwinClient))) {
            if (window !== null) {
                this.warpedToTiled = { client: kwinClient, time: Date.now() };
            }
            warpCursorToFocus();
        }
    }

    // niri's focus-window-previous: the window that had the focus before the current one
    public findPreviousFocused(): KwinClient|null {
        let best: KwinClient|null = null;
        let bestStamp = -1;
        for (const [kwinClient, stamp] of this.focusStamps) {
            if (kwinClient !== Workspace.activeWindow && !kwinClient.minimized && stamp > bestStamp && this.clientMap.has(kwinClient)) {
                best = kwinClient;
                bestStamp = stamp;
            }
        }
        return best;
    }

    // whether a window lives on the desktop (niri's workspaces are empty when they have no windows)
    public isDesktopOccupied(kwinDesktop: KwinDesktop) {
        for (const kwinClient of this.clientMap.keys()) {
            if (kwinClient.normalWindow && kwinClient.desktops.includes(kwinDesktop)) {
                return true;
            }
        }
        return false;
    }

    public isFloating(kwinClient: KwinClient) {
        const client = this.clientMap.get(kwinClient);
        return client !== undefined && client.stateManager.getState() instanceof ClientState.Floating;
    }

    // The floating window that was focused last on the current desktop and screen; like niri's floating layer,
    // which always has an active window when it isn't empty, any floating window there if none was focused yet
    public findLastFocusedFloating(): KwinClient|null {
        const candidates = [
            ...this.floatingFocusOrder.slice().reverse(),
            ...Array.from(this.clientMap.keys()).filter(c => !this.floatingFocusOrder.includes(c)).reverse(),
        ];
        for (const kwinClient of candidates) {
            if (this.isFloatingOnCurrentDesktop(kwinClient)) {
                return kwinClient;
            }
        }
        return null;
    }

    private isFloatingOnCurrentDesktop(kwinClient: KwinClient) {
        return this.isFloating(kwinClient) &&
            !kwinClient.minimized &&
            kwinClient.desktops.includes(Workspace.currentDesktop) &&
            (kwinClient.activities.length === 0 || kwinClient.activities.includes(Workspace.currentActivity)) &&
            kwinClient.output === Workspace.activeScreen;
    }

    // niri's focus-left/right/up/down in the floating layer: the nearest other floating window in that direction
    // (by the distance between window centers); nothing happens if there is none, the focus doesn't leave the layer
    // (only the floating/tiling switch keys cross the layers). Returns whether the focus moved.
    public focusFloatingDirectional(active: KwinClient, dx: number, dy: number) {
        let others = 0;
        const center = (c: KwinClient) => {
            const frame = c.frameGeometry;
            return { x: frame.x + frame.width/2, y: frame.y + frame.height/2 };
        };
        const from = center(active);
        let best: KwinClient|null = null;
        let bestDistance = Infinity;
        for (const kwinClient of this.clientMap.keys()) {
            if (kwinClient === active || !this.isFloatingOnCurrentDesktop(kwinClient)) {
                continue;
            }
            others++;
            const to = center(kwinClient);
            const distance = dx * (to.x - from.x) + dy * (to.y - from.y);
            if (distance > 0 && distance < bestDistance) {
                best = kwinClient;
                bestDistance = distance;
            }
        }
        if (best !== null) {
            KiriFocus.mark(best);
            Workspace.activeWindow = best;
        }
        return best !== null;
    }

    // niri's focus_leftmost/rightmost/topmost/bottommost of the floating layer (by the windows' top-left corners)
    public focusFloatingExtreme(active: KwinClient, edge: "left"|"right"|"top"|"bottom") {
        let best: KwinClient|null = null;
        let bestValue = Infinity;
        for (const kwinClient of this.clientMap.keys()) {
            if (!this.isFloatingOnCurrentDesktop(kwinClient)) {
                continue;
            }
            const frame = kwinClient.frameGeometry;
            const value = edge === "left" ? frame.x : edge === "right" ? -frame.x : edge === "top" ? frame.y : -frame.y;
            if (value < bestValue) {
                best = kwinClient;
                bestValue = value;
            }
        }
        if (best !== null && best !== active) {
            KiriFocus.mark(best);
            Workspace.activeWindow = best;
        }
    }

    // niri's Data::recompute_logical_pos: a floating window may go partly off-screen, but at least a quarter of it
    // (10 to 75 px) stays inside the work area, on every side
    private static clampFloatingPosition(area: QmlRect, x: number, y: number, width: number, height: number) {
        const minOnScreenX = Math.min(Math.max(width / 4, 10), 75);
        const minOnScreenY = Math.min(Math.max(height / 4, 10), 75);
        return {
            x: Math.min(Math.max(x, area.x - (width - minOnScreenX)), rectRight(area) - minOnScreenX),
            y: Math.min(Math.max(y, area.y - (height - minOnScreenY)), rectBottom(area) - minOnScreenY),
        };
    }

    // niri moves floating windows by a fixed step (move-window-* on the floating layer)
    public moveFloatingClient(kwinClient: KwinClient, dx: number, dy: number) {
        const client = this.clientMap.get(kwinClient);
        if (client === undefined || !this.isFloating(kwinClient)) {
            return false;
        }
        const area = Workspace.clientArea(ClientAreaOption.PlacementArea, kwinClient.output, Clients.getKwinDesktopApprox(kwinClient));
        const frame = kwinClient.frameGeometry;
        const width = frame.width.round();
        const height = frame.height.round();
        const pos = ClientManager.clampFloatingPosition(area, frame.x.round() + dx, frame.y.round() + dy, width, height);
        client.place(pos.x, pos.y, width, height);
        return true;
    }

    // niri's floating layer resizes a window by size changes relative to the work area; the top-left corner stays
    // (the position is only pulled back so that at least a part of the window is on screen, like niri does)
    private resizeFloatingClient(kwinClient: KwinClient, horizontal: boolean, size: number) {
        const client = this.clientMap.get(kwinClient);
        if (client === undefined) {
            return;
        }
        const area = Workspace.clientArea(ClientAreaOption.PlacementArea, kwinClient.output, Clients.getKwinDesktopApprox(kwinClient));
        const frame = kwinClient.frameGeometry;
        const min = horizontal ? kwinClient.minSize.width.ceil() : kwinClient.minSize.height.ceil();
        const max = horizontal ? kwinClient.maxSize.width.floor() : kwinClient.maxSize.height.floor();
        size = Math.max(1, Math.round(size));
        if (max > 0) {
            size = Math.min(size, max);
        }
        size = Math.max(size, min);
        const width = horizontal ? size : frame.width.round();
        const height = horizontal ? frame.height.round() : size;
        const { x, y } = ClientManager.clampFloatingPosition(area, frame.x.round(), frame.y.round(), width, height);
        client.place(x, y, width, height);
    }

    private floatingAreaSize(kwinClient: KwinClient, horizontal: boolean) {
        const area = Workspace.clientArea(ClientAreaOption.PlacementArea, kwinClient.output, Clients.getKwinDesktopApprox(kwinClient));
        return horizontal ? area.width : area.height;
    }

    private readonly floatingPresetIndex = { width: new Map<KwinClient, number>(), height: new Map<KwinClient, number>() };

    // niri's set-column-width / set-window-height "+10%" on a floating window: the size changes by a share of the work area
    public adjustFloatingSize(kwinClient: KwinClient, horizontal: boolean, percent: number) {
        const available = this.floatingAreaSize(kwinClient, horizontal);
        const frame = kwinClient.frameGeometry;
        const current = horizontal ? frame.width : frame.height;
        (horizontal ? this.floatingPresetIndex.width : this.floatingPresetIndex.height).delete(kwinClient);
        this.resizeFloatingClient(kwinClient, horizontal, current + available * percent / 100);
    }

    // niri's switch-preset-column-width / switch-preset-window-height on a floating window (Floating::toggle_window_width):
    // a window that was set to a preset goes to the next one, otherwise to the first preset larger than it
    // (the last smaller one when going back). `presets` are the sizes in pixels in the configured order.
    public cycleFloatingSizePreset(kwinClient: KwinClient, horizontal: boolean, forwards: boolean, presets: number[]) {
        const len = presets.length;
        if (len === 0) {
            return;
        }
        const indices = horizontal ? this.floatingPresetIndex.width : this.floatingPresetIndex.height;
        const frame = kwinClient.frameGeometry;
        const current = horizontal ? frame.width : frame.height;
        let index = indices.get(kwinClient);
        if (index !== undefined && index < len) {
            index = (index + (forwards ? 1 : len - 1)) % len;
        } else if (forwards) {
            index = presets.findIndex(preset => current + 1 < preset);
            if (index < 0) {
                index = 0;
            }
        } else {
            index = len - 1;
            for (let i = len - 1; i >= 0; i--) {
                if (presets[i] + 1 < current) {
                    index = i;
                    break;
                }
            }
        }
        this.resizeFloatingClient(kwinClient, horizontal, presets[index]);
        indices.set(kwinClient, index);
    }

    public findClientById(id: string): KwinClient | undefined {
        for (const kwinClient of this.clientMap.keys()) {
            if (String(kwinClient.internalId) === id) {
                return kwinClient;
            }
        }
        return undefined;
    }

    // the floating windows to show for a desktop in the overview; a window on every desktop is shown on the current one
    public getFloatingOnDesktop(kwinDesktop: KwinDesktop) {
        const result: KwinClient[] = [];
        for (const kwinClient of this.clientMap.keys()) {
            if (!this.isFloating(kwinClient) || kwinClient.minimized || !(kwinClient.normalWindow || kwinClient.dialog)) {
                continue;
            }
            const there = kwinClient.desktops.length === 0 ? kwinDesktop === Workspace.currentDesktop : kwinClient.desktops.includes(kwinDesktop);
            if (there) {
                result.push(kwinClient);
            }
        }
        return result;
    }

    // A tiled window dropped in the overview. `columnIndex` and `tile` count the target desktop's columns without
    // the dragged window (a column it leaves alone is gone): `tile` >= 0 is a gap inside that column, -1 a new
    // column to the left of the column at `columnIndex`. The window may come from another desktop.
    public overviewDrop(kwinClient: KwinClient, kwinDesktop: KwinDesktop, columnIndex: number, tile: number) {
        const window = this.findTiledWindow(kwinClient);
        const desktop = this.desktopManager.getDesktopInCurrentActivity(kwinDesktop);
        if (window === null || desktop === undefined) {
            return;
        }
        const grid = desktop.grid;
        const oldColumn = window.column;
        const others = grid.getColumns().filter(column => !(column === oldColumn && column.getWindowCount() === 1));
        const wasFocused = window.isFocused();
        const pass = wasFocused ? FocusPassing.Type.Immediate : FocusPassing.Type.None;
        if (tile >= 0 && others.length > 0) {
            const column = others[Math.max(0, Math.min(columnIndex, others.length - 1))];
            const windows = column.getWindows().filter(w => w !== window);
            const index = Math.max(0, Math.min(tile, windows.length));
            if (column === oldColumn) {
                const current = column.getWindows().indexOf(window);
                for (let i = current; i > index; i--) {
                    column.moveWindowUp(window);
                }
                for (let i = current; i < index; i++) {
                    column.moveWindowDown(window);
                }
            } else {
                window.moveToColumn(column, true, pass, index === 0 ? null : windows[index - 1]);
            }
        } else {
            const left = columnIndex <= 0 || others.length === 0 ? null : others[Math.min(columnIndex, others.length) - 1];
            if (oldColumn.getWindowCount() === 1) {
                // the column itself moves: an empty new column next to it would be the one to take the focus when the
                // old one is removed, and the window would end up in no column at all
                oldColumn.moveToGrid(grid, left);
            } else {
                window.moveToColumn(new Column(grid, left), true, FocusPassing.Type.None);
            }
        }
        if (kwinClient.desktops.length !== 1 || kwinClient.desktops[0] !== kwinDesktop) {
            kwinClient.desktops = [kwinDesktop];
        }
        window.focus();
    }

    public findTiledWindow(kwinClient: KwinClient) {
        const client = this.clientMap.get(kwinClient);
        if (client === undefined) {
            return null;
        }

        return this.findTiledWindowOfClient(client);
    }

    private findTiledWindowOfClient(client: ClientWrapper): Window|null {
        const clientState = client.stateManager.getState();
        if (clientState instanceof ClientState.Tiled) {
            return clientState.window;
        } else if (client.transientFor !== null) {
            return this.findTiledWindowOfClient(client.transientFor);
        } else {
            return null;
        }
    }

    private removeAllClients() {
        for (const kwinClient of Array.from(this.clientMap.keys())) {
            this.removeClient(kwinClient, FocusPassing.Type.None);
        }
    }

    public destroy() {
        this.remapTimer.destroy();
        this.removeAllClients();
    }
}

namespace ClientManager {
    export interface Config {
        floatingKeepAbove: boolean;
        cursorFollowsFocus: boolean;
        defaultColumnWidth: string;
        gapsInnerHorizontal: number;
        dropToTile: boolean;
    }
}

interface InsertTarget {
    column: number;
    tile: number | null; // index of the gap inside the column, or null for a new column
    rect: { x: number, y: number, width: number, height: number } | null;
}
