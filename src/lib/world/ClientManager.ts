const ringCaption = "kiri-ring";

class ClientManager {
    private readonly config: ClientManager.Config;
    private readonly clientMap: Map<KwinClient, ClientWrapper>;
    private lastFocusedClient: KwinClient|null;
    private floatingFocusOrder: KwinClient[] = []; // most recently focused last
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

    public onClientFocused(kwinClient: KwinClient) {
        this.lastFocusedClient = kwinClient;
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
            moveCursorToFocus.call();
        }
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
            if (!this.isFloating(kwinClient)) {
                continue;
            }
            if (
                kwinClient.minimized ||
                !kwinClient.desktops.includes(Workspace.currentDesktop) ||
                (kwinClient.activities.length > 0 && !kwinClient.activities.includes(Workspace.currentActivity)) ||
                kwinClient.output !== Workspace.activeScreen
            ) {
                continue;
            }
            return kwinClient;
        }
        return null;
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
    }
}
