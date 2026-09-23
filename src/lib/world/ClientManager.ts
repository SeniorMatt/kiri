const ringCaption = "kiri-ring";

class ClientManager {
    private readonly config: ClientManager.Config;
    private readonly clientMap: Map<KwinClient, ClientWrapper>;
    private lastFocusedClient: KwinClient|null;
    private floatingFocusOrder: KwinClient[] = []; // most recently focused last
    private focusStamps = new Map<KwinClient, number>(); // for focus-window-previous
    private focusCounter = 0;
    private readonly windowRuleEnforcer: WindowRuleEnforcer;

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
        this.windowRuleEnforcer = new WindowRuleEnforcer(
            [...getSimpleWindowRules(config.floatClasses, config.tileClasses, config.columnWidthRules), ...parsedWindowRules],
            config.tileFullScreen, config.defaultColumnWidth, config.gapsInnerHorizontal);
    }

    // `existing` is for windows that were already open when Kiri started, they keep their width
    public addClient(kwinClient: KwinClient, existing = false) {
        if (kwinClient.caption.startsWith(ringCaption)) {
            return; // our own focus ring window
        }
        console.assert(!this.hasClient(kwinClient));

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
                if (!existing) {
                    const width = this.windowRuleEnforcer.getColumnWidth(kwinClient, desktop!.tilingArea.width);
                    if (width !== null) {
                        client.preferredWidth = width;
                    }
                }
                return new ClientState.Tiled(this.world, client, desktop!.grid);
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
    }

    public removeClient(kwinClient: KwinClient, passFocus: FocusPassing.Type) {
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
        if (kwinClient !== this.lastFocusedClient && !focusLost) {
            passFocus = FocusPassing.Type.None;
        }
        client.destroy(passFocus);
        this.clientMap.delete(kwinClient);
        this.focusStamps.delete(kwinClient);
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
            client.stateManager.setState(
                () => new ClientState.TiledMinimized(this.world, client),
                passFocus,
            );
        }
    }

    // The window was dragged out of the grid. Like niri it is tiled again where it is dropped.
    public floatForDrag(client: ClientWrapper) {
        this.floatClient(client);
        if (!this.config.dropToTile) {
            return;
        }
        const kwinClient = client.kwinClient;
        const manager = new SignalManager();
        manager.connect(kwinClient.interactiveMoveResizeFinished, () => {
            manager.destroy();
            this.world.do(() => this.dropTile(kwinClient));
        });
    }

    // niri's insert_position (scrolling.rs): the closest gap between columns or between windows to the cursor
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
        this.tileClient(client, grid);
        const window = this.findTiledWindow(kwinClient);
        if (window === null || columns.length === 0) {
            return;
        }

        const gap = grid.config.gapsInnerHorizontal;
        const cursor = Workspace.cursorPos;
        const offsetX = desktop.tilingArea.x - desktop.getScrollX();
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
        let tileGap: { windowIndex: number, distance: number } | null = null;
        if (columnIndex >= 0 && cursor.x < xs[columns.length]) {
            const column = columns[columnIndex];
            const windows = column.getWindows();
            const gapV = grid.config.gapsInnerVertical;
            if (column.isTabbed()) {
                const active = column.getWindowToFocus();
                const index = windows.indexOf(active);
                const top = active.client.kwinClient.frameGeometry.y - gapV / 2;
                const bottom = top + active.height + gapV;
                tileGap = Math.abs(top - cursor.y) <= Math.abs(bottom - cursor.y) ?
                    { windowIndex: index, distance: Math.abs(top - cursor.y) } :
                    { windowIndex: index + 1, distance: Math.abs(bottom - cursor.y) };
            } else {
                let y = desktop.tilingArea.y - gapV / 2;
                for (let j = 0; j <= windows.length; j++) {
                    const distance = Math.abs(y - cursor.y);
                    if (tileGap === null || distance < tileGap.distance) {
                        tileGap = { windowIndex: j, distance: distance };
                    }
                    if (j < windows.length) {
                        y += windows[j].height + gapV;
                    }
                }
            }
        }
        const columnDistance = Math.abs(xs[closest] - cursor.x);
        if (tileGap !== null && columnDistance > tileGap.distance) {
            const column = columns[columnIndex];
            const above = column.getWindows()[tileGap.windowIndex - 1] ?? null;
            window.moveToColumn(column, true, FocusPassing.Type.None, above);
        } else {
            grid.moveColumn(window.column, closest === 0 ? null : columns[closest - 1]);
        }
        window.focus();
    }

    public tileClient(client: ClientWrapper, grid: Grid) {
        if (client.stateManager.getState() instanceof ClientState.Tiled) {
            return;
        }
        client.stateManager.setState(() => new ClientState.Tiled(this.world, client, grid), FocusPassing.Type.None);
    }

    public floatClient(client: ClientWrapper) {
        if (client.stateManager.getState() instanceof ClientState.Floating) {
            return;
        }
        client.stateManager.setState(() => new ClientState.Floating(this.world, client, this.config, true), FocusPassing.Type.None);
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

    public toggleFloatingClient(kwinClient: KwinClient) {
        const client = this.clientMap.get(kwinClient);
        if (client === undefined) {
            return;
        }

        const clientState = client.stateManager.getState();
        if ((clientState instanceof ClientState.Floating || clientState instanceof ClientState.Pinned) && Clients.canTileEver(kwinClient)) {
            Clients.makeTileable(kwinClient);
            const desktop = this.desktopManager.getDesktopForClient(kwinClient);
            if (desktop === undefined) {
                return;
            }
            client.stateManager.setState(() => new ClientState.Tiled(this.world, client, desktop.grid), FocusPassing.Type.None);
        } else if (clientState instanceof ClientState.Tiled) {
            client.stateManager.setState(() => new ClientState.Floating(this.world, client, this.config, true), FocusPassing.Type.None);
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
            window.onFocused();
        }
        if (warp && (window !== null || this.isFloating(kwinClient))) {
            if (window !== null) {
                this.warpedToTiled = { client: kwinClient, time: Date.now() };
            }
            moveCursorToFocus.call();
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

    // niri moves floating windows by a fixed step, the window stays inside the work area
    public moveFloatingClient(kwinClient: KwinClient, dx: number, dy: number) {
        const client = this.clientMap.get(kwinClient);
        if (client === undefined || !this.isFloating(kwinClient)) {
            return false;
        }
        const area = Workspace.clientArea(ClientAreaOption.PlacementArea, kwinClient.output, Clients.getKwinDesktopApprox(kwinClient));
        const frame = kwinClient.frameGeometry;
        const width = frame.width.round();
        const height = frame.height.round();
        const x = Math.max(area.x, Math.min(frame.x.round() + dx, rectRight(area) - width));
        const y = Math.max(area.y, Math.min(frame.y.round() + dy, rectBottom(area) - height));
        client.place(x, y, width, height);
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
        // niri's Data::recompute_logical_pos: at least a quarter of the window (10..75 px) stays on screen
        const minOnScreenX = Math.min(Math.max(width / 4, 10), 75);
        const minOnScreenY = Math.min(Math.max(height / 4, 10), 75);
        const x = Math.min(Math.max(frame.x.round(), area.x - (width - minOnScreenX)), rectRight(area) - minOnScreenX);
        const y = Math.min(Math.max(frame.y.round(), area.y - (height - minOnScreenY)), rectBottom(area) - minOnScreenY);
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
