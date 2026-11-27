const ringCaption = "kiri-ring";

// a closed tiled X11 window that is mapped again right away (SDL full-screen) keeps its place, full-screen state and focus
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
    windowedFullScreen: boolean;
    maximizedMode: MaximizedMode;
    viewRestoreOffset: number|null;
    focused: boolean;
    grid: Grid;
    scrollX: number;
    focusCounter: number;
}

class ClientManager {
    private readonly config: ClientManager.Config;
    private readonly clientMap: Map<KwinClient, ClientWrapper>;
    private lastFocusedClient: KwinClient|null;
    // the window that had the focus before the current one, and when the current one got it
    private focusedBefore: KwinClient|null = null;
    private lastActivationTime = 0;
    private lastActivationByKiri = false;
    // the shell window (KRunner, a panel popup) that had the focus last
    private lastShellFocused: KwinClient|null = null;
    private shellReturnUntil = 0;
    private floatingFocusOrder: KwinClient[] = [];
    private focusStamps = new Map<KwinClient, number>(); // for focus-window-previous
    private focusCounter = 0;
    private readonly floatingFrames = new Map<KwinClient, { x: number, y: number, width: number, height: number }>();
    private drag: ClientManager.Drag | null = null;
    private dragPending: { client: ClientWrapper, start: () => void } | null = null;
    private overviewDragSlot: { client: ClientWrapper, grid: Grid, placement: ClientState.Tiled.Placement } | null = null;
    private readonly windowRuleEnforcer: WindowRuleEnforcer;
    private closedSlot: ClosedSlot|null = null;
    private readonly remapTimer: Delayer;
    private startupTimer: Delayer|null = null;
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
            const parsed = JSON.parse(config.windowRules);
            if (!Array.isArray(parsed)) {
                throw new Error("the rules are not a list");
            }
            parsedWindowRules = parsed;
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
                isActiveInColumn: kwinClient => this.isActiveInColumn(kwinClient),
                isUrgent: kwinClient => kwinClient.demandsAttention === true,
            },
            config.gapsInnerVertical);
    }

    // niri's at-startup matcher stops matching 60 s after the start
    public armStartupTimer() {
        const startupLeft = WindowRuleEnforcer.startupRemainingMs();
        if (this.startupTimer === null && this.windowRuleEnforcer.hasStartupRules() && startupLeft > 0) {
            this.startupTimer = new Delayer(startupLeft + 50, () => this.world.do(() => this.refreshRules()));
            this.startupTimer.run();
        }
    }

    // niri's is-active-in-column
    private isActiveInColumn(kwinClient: KwinClient) {
        if (this.isFloating(kwinClient)) {
            return true;
        }
        const window = this.findTiledWindow(kwinClient);
        return window === null || window.column.getWindowToFocus() === window;
    }

    // niri's is-active
    private isActiveWindow(kwinClient: KwinClient) {
        if (Workspace.activeWindow === kwinClient) {
            return true;
        }
        const desktop = this.findTiledWindow(kwinClient)?.column.grid.desktop ?? this.desktopManager.getDesktopForClient(kwinClient);
        const column = desktop?.grid.getLastFocusedColumn() ?? null;
        return column !== null && column.getWindowToFocus().client.kwinClient === kwinClient;
    }

    public addClient(kwinClient: KwinClient, existing = false, outputName?: string) {
        if (kwinClient.caption.startsWith(ringCaption)) {
            return;
        }
        console.assert(!this.hasClient(kwinClient));

        const open = this.windowRuleEnforcer.resolve(kwinClient, true);
        let wantedDesktop: KwinDesktop|undefined;
        if (!existing && !kwinClient.dock && open.workspace !== undefined) {
            wantedDesktop = this.world.dynamicDesktops.findByName(open.workspace);
            if (wantedDesktop !== undefined && !(kwinClient.desktops.length === 1 && kwinClient.desktops[0] === wantedDesktop)) {
                kwinClient.desktops = [wantedDesktop];
            }
        }
        const slot = this.takeClosedSlot(kwinClient);
        let constructState: (client: ClientWrapper) => ClientState.State;
        let desktop: Desktop | undefined;
        let widthBeforeMaximize: number | undefined;
        if (kwinClient.dock) {
            constructState = () => new ClientState.Docked(this.world, kwinClient);
        } else if (existing && this.restoredFloating.has(String(kwinClient.internalId))) {
            constructState = (client: ClientWrapper) => new ClientState.Floating(this.world, client, this.config, false);
        } else if (
            Clients.canTileEver(kwinClient) &&
            this.windowRuleEnforcer.shouldTile(kwinClient, open) &&
            (desktop = this.desktopManager.getDesktopForClient(kwinClient, outputName)) !== undefined
        ) {
            Clients.makeTileable(kwinClient);
            console.assert(Clients.canTileNow(kwinClient));
            constructState = (client: ClientWrapper) => {
                if (slot !== null) {
                    client.preferredWidth = slot.preferredWidth;
                } else if (!existing) {
                    const width = this.windowRuleEnforcer.getColumnWidth(kwinClient, desktop!.tilingArea.width, open, desktop!.profile);
                    if (open.maximized === true) {
                        // niri's open-maximized
                        widthBeforeMaximize = width ?? client.preferredWidth;
                        client.preferredWidth = desktop!.tilingArea.width;
                    } else if (width !== null) {
                        client.preferredWidth = width;
                    }
                }
                const state = new ClientState.Tiled(this.world, client, desktop!.grid, slot !== null && slot.grid === desktop!.grid ? slot.placement : undefined);
                if (widthBeforeMaximize !== undefined) {
                    state.window.column.widthBeforeMaximize = widthBeforeMaximize;
                }
                if (!existing && open.columnDisplay !== undefined && state.window.column.getWindowCount() === 1) {
                    state.window.column.setTabbed(open.columnDisplay === "tabbed");
                }
                if (!existing) {
                    const height = this.windowRuleEnforcer.getWindowHeight(kwinClient, desktop!.tilingArea.height, open, desktop!.profile);
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
                reason: this.windowRuleEnforcer.whyNotTiled(kwinClient, open) || (desktop === undefined ? "no tiled desktop for it" : "unknown"),
            }));
            constructState = (client: ClientWrapper) => new ClientState.Floating(this.world, client, this.config, false, true);
        }

        const stateOfRules = constructState;
        constructState = (client: ClientWrapper) => {
            client.ruleLimits = ClientManager.limitsOf(open); // before the layout reads them
            return stateOfRules(client);
        };
        const client = new ClientWrapper(
            kwinClient,
            constructState,
            this.findTransientFor(kwinClient),
            this.windowRuleEnforcer.initClientSignalManager(this.world, kwinClient),
        );
        this.clientMap.set(kwinClient, client);
        if (existing) {
            const id = String(kwinClient.internalId);
            if (this.restoredManual.has(id)) {
                this.toggledManually.add(kwinClient);
            }
            const frame = this.restoredFrames.get(id);
            if (frame !== undefined) {
                this.floatingFrames.set(kwinClient, frame);
            }
        }
        if (slot !== null) {
            client.x11 = true;
        } else {
            queryX11Window(kwinClient, x11 => { client.x11 = x11; });
        }

        this.applyContinuousRules(client, this.windowRuleEnforcer.resolve(kwinClient));
        if (!existing) {
            this.applyOpenRules(client, open, wantedDesktop);
            if (!Clients.isShellUi(kwinClient)) {
                KiriFocus.mark(kwinClient);
                if (Workspace.activeWindow === kwinClient) {
                    // KWin activates a new window before the script knows it, so the pointer goes to it now
                    KiriFocus.take(kwinClient);
                    requestCursorWarp();
                }
            }
        }
        if (slot !== null) {
            this.fillClosedSlot(slot, kwinClient, client);
        }
    }

    // niri's open-fullscreen, open-maximized-to-edges, open-focused and default-floating-position
    private applyOpenRules(client: ClientWrapper, open: ResolvedRules, wantedDesktop: KwinDesktop|undefined) {
        const kwinClient = client.kwinClient;
        const state = client.stateManager.getState();
        if (state instanceof ClientState.Floating && !Clients.placesItself(kwinClient)) {
            const area = Workspace.clientArea(ClientAreaOption.PlacementArea, kwinClient.output, Clients.getKwinDesktopApprox(kwinClient));
            const size = this.windowRuleEnforcer.getFloatingSize(kwinClient, area, open);
            const limits = client.ruleLimits;
            const limited = limits.minWidth > 0 || limits.minHeight > 0 || limits.maxWidth > 0 || limits.maxHeight > 0;
            if (size !== null || open.floatingPosition !== undefined || limited) {
                const frame = kwinClient.frameGeometry;
                const fit = (value: number, minimum: number, maximum: number) => {
                    value = Math.max(1, Math.round(value));
                    return Math.max(maximum > 0 ? Math.min(value, Math.floor(maximum)) : value, Math.ceil(minimum));
                };
                const width = fit(size?.width ?? frame.width.round(), client.getMinWidth(), client.getMaxWidth());
                const height = fit(size?.height ?? frame.height.round(), client.getMinHeight(), client.getMaxHeight());
                let place: { x: number, y: number };
                if (open.floatingPosition !== undefined) {
                    place = ClientManager.floatingPositionIn(area, open.floatingPosition, width, height);
                } else if (size !== null) {
                    place = ClientManager.centerInArea(area, width, height);
                } else {
                    place = { x: frame.x.round(), y: frame.y.round() };
                }
                client.place(place.x, place.y, width, height);
            }
        }
        if (state instanceof ClientState.Tiled) {
            if (open.fullscreen === true) {
                client.setFullScreen(true);
            } else if (open.fullscreen === false && kwinClient.fullScreen) {
                client.setFullScreen(false);
            } else if (open.maximizedToEdges === true) {
                client.setMaximize(true, true);
            }
        }
        this.applyOpenFocus(kwinClient, open, wantedDesktop);
    }

    // niri's open-focused; a window that opens on another desktop does not take the focus either
    private applyOpenFocus(kwinClient: KwinClient, open: ResolvedRules, wantedDesktop: KwinDesktop|undefined) {
        if (kwinClient.dock) {
            return;
        }
        const elsewhere = wantedDesktop !== undefined && wantedDesktop !== currentDesktopOn(kwinClient.output);
        if (open.focused === true) {
            if (Workspace.activeWindow !== kwinClient) {
                KiriFocus.mark(kwinClient);
                activateWindow(kwinClient, "open-focused");
            }
        } else if (open.focused === false || elsewhere) {
            const previous = kwinClient === this.lastFocusedClient ? this.focusedBefore : this.lastFocusedClient;
            if (previous !== null && previous !== kwinClient && this.clientMap.has(previous) && !previous.minimized &&
                isOnShownDesktop(previous) && Workspace.activeWindow === kwinClient) {
                KiriFocus.mark(previous);
                activateWindow(previous, "open-focused false");
            }
        }
    }

    // niri's default-floating-position
    public static floatingPositionIn(area: QmlRect, position: FloatingPositionRule, width: number, height: number) {
        const relativeTo = position.relativeTo ?? "top-left";
        let x = position.x;
        let y = position.y;
        if (relativeTo === "top-right" || relativeTo === "bottom-right" || relativeTo === "right") {
            x = area.width - width - x;
        }
        if (relativeTo === "bottom-left" || relativeTo === "bottom-right" || relativeTo === "bottom") {
            y = area.height - height - y;
        }
        if (relativeTo === "top" || relativeTo === "bottom") {
            x += area.width / 2 - width / 2;
        }
        if (relativeTo === "left" || relativeTo === "right") {
            y += area.height / 2 - height / 2;
        }
        return { x: Math.round(area.x + x), y: Math.round(area.y + y) };
    }

    private static limitsOf(rules: ResolvedRules) {
        return {
            minWidth: rules.minWidth ?? 0,
            minHeight: rules.minHeight ?? 0,
            maxWidth: rules.maxWidth ?? 0,
            maxHeight: rules.maxHeight ?? 0,
        };
    }

    public hasDynamicRules() {
        return this.windowRuleEnforcer.hasDynamicRules();
    }

    // niri's recompute_window_rules
    public refreshRules(kwinClient?: KwinClient) {
        if (kwinClient !== undefined) {
            const client = this.clientMap.get(kwinClient);
            if (client !== undefined) {
                this.applyContinuousRules(client, this.windowRuleEnforcer.resolve(kwinClient));
            }
            return;
        }
        for (const [key, client] of this.clientMap) {
            this.applyContinuousRules(client, this.windowRuleEnforcer.resolve(key));
        }
    }

    private applyContinuousRules(client: ClientWrapper, rules: ResolvedRules) {
        const limits = ClientManager.limitsOf(rules);
        const opacity = rules.opacity ?? null;
        const style = ClientManager.mergeLooks(this.layoutLookOf(client.kwinClient), rules.style);
        const key = JSON.stringify([limits, opacity, style]);
        if (key === client.rulesKey) {
            return;
        }
        client.rulesKey = key;
        const limitsChanged = JSON.stringify(limits) !== JSON.stringify(client.ruleLimits);
        client.ruleLimits = limits;
        client.setRuleOpacity(opacity);
        setWindowDecorations(String(client.kwinClient.internalId), style);
        if (limitsChanged) {
            const window = this.findTiledWindow(client.kwinClient);
            if (window !== null) {
                window.column.setWidth(window.column.getRegularWidth(), false, true);
                window.column.resizeWindows();
            }
        }
    }

    private layoutLookOf(kwinClient: KwinClient): WindowDecorationRule | null {
        const desktop = this.findTiledWindow(kwinClient)?.column.grid.desktop ?? this.desktopManager.getDesktopForClient(kwinClient);
        return desktop === undefined ? null : desktop.profile.look;
    }

    private static mergeLooks(layout: WindowDecorationRule | null, rule: WindowDecorationRule | null | undefined): WindowDecorationRule | null {
        if (layout === null) {
            return rule ?? null;
        }
        if (rule === null || rule === undefined) {
            return layout;
        }
        const merged: Record<string, any> = Object.assign({}, layout);
        for (const [key, value] of Object.entries(rule)) {
            const base = merged[key];
            merged[key] = typeof value === "object" && value !== null && typeof base === "object" ? Object.assign({}, base, value) : value;
        }
        return merged as WindowDecorationRule;
    }

    public toggleRuleOpacity(kwinClient: KwinClient) {
        this.clientMap.get(kwinClient)?.toggleRuleOpacity();
    }

    // niri's center_preferring_top_left_in_area
    public static centerInArea(area: QmlRect, width: number, height: number) {
        return {
            x: Math.round(area.x + Math.max((area.width - width) / 2, 0)),
            y: Math.round(area.y + Math.max((area.height - height) / 2, 0)),
        };
    }

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

    private fillClosedSlot(slot: ClosedSlot, kwinClient: KwinClient, client: ClientWrapper) {
        this.remapTimer.stop();
        this.world.releaseArrangeHold();
        const window = this.findTiledWindow(kwinClient);
        if (window === null) {
            return;
        }
        if (slot.fullScreen) {
            client.windowedFullScreen = slot.windowedFullScreen;
            client.setFullScreen(true);
        } else if (slot.maximizedMode !== MaximizedMode.Unmaximized) {
            client.setMaximize(
                slot.maximizedMode === MaximizedMode.Horizontally || slot.maximizedMode === MaximizedMode.Maximized,
                slot.maximizedMode === MaximizedMode.Vertically || slot.maximizedMode === MaximizedMode.Maximized,
            );
        }
        if (slot.viewRestoreOffset !== null) {
            window.column.grid.setViewRestoreOffset(window.column, slot.viewRestoreOffset);
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
            const target = grid.getLastFocusedWindow();
            if (target !== null) {
                target.focus();
            }
        }
        grid.desktop.autoAdjustScroll();
    }

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
            windowedFullScreen: client.windowedFullScreen,
            maximizedMode: client.getMaximizedMode() ?? MaximizedMode.Unmaximized,
            viewRestoreOffset: grid.getViewRestoreOffset(column),
            focused: focused,
            grid: grid,
            scrollX: scrollBefore ?? desktop.getScrollX(),
            focusCounter: this.focusCounter,
        };
        return true;
    }

    public removeClient(kwinClient: KwinClient, passFocus: FocusPassing.Type, mayReturn = false) {
        if (!this.hasClient(kwinClient)) {
            return;
        }
        const client = this.clientMap.get(kwinClient);
        if (client === undefined) {
            return;
        }
        // KWin may have dropped the focus already; a neighbour must get it
        const focusLost = Workspace.activeWindow === null || Workspace.activeWindow === kwinClient;
        // KWin's own pick right before the close is reported does not count, only a click does
        const kwinPicked = this.focusedBefore === kwinClient && !this.lastActivationByKiri && Date.now() - this.lastActivationTime < ClientManager.kwinPickMs;
        if (kwinClient !== this.lastFocusedClient && !focusLost && !kwinPicked) {
            passFocus = FocusPassing.Type.None;
        }
        if (kwinPicked) {
            const window = this.findTiledWindow(kwinClient);
            if (window !== null) {
                window.column.onWindowFocused(window);
            }
        }
        // like niri, the topmost floating window that is left gets the focus, else the tiling layer's active window
        const floatingFocusLost = this.isUserFloating(kwinClient) && (kwinClient === this.lastFocusedClient || kwinPicked);
        const closedStamp = this.focusStamps.get(kwinClient) ?? Infinity;
        const floatingDesktop = floatingFocusLost ? this.desktopManager.getDesktopForClient(kwinClient) : undefined;
        const shellClosed = this.lastShellFocused === kwinClient;
        if (shellClosed) {
            this.lastShellFocused = null;
        }
        const held = mayReturn && this.rememberClosed(kwinClient, client, kwinPicked);
        client.destroy(held ? FocusPassing.Type.None : passFocus);
        this.clientMap.delete(kwinClient);
        this.toggledManually.delete(kwinClient);
        this.focusStamps.delete(kwinClient);
        this.floatingFrames.delete(kwinClient);
        this.floatingFocusOrder = this.floatingFocusOrder.filter(c => c !== kwinClient);
        setVisualPosition(String(kwinClient.internalId), null);
        if (shellClosed) {
            this.returnFocusFromShell();
        }
        if (floatingFocusLost) {
            this.focusAfterFloatingClose(kwinClient, floatingDesktop, kwinPicked, closedStamp);
        }
        if (held) {
            const slot = this.closedSlot!;
            slot.grid.desktop.setScroll(slot.scrollX, true);
            this.world.holdArrange();
            this.remapTimer.run();
        }
    }

    // KRunner or a panel popup is gone: the focus goes back to the app window that had it, never a warp
    private returnFocusFromShell() {
        const active = Workspace.activeWindow;
        const now = Date.now();
        if (active === null) {
            this.shellReturnUntil = now + ClientManager.kwinPickMs;
        } else if (!Clients.isShellUi(active) && active === this.lastFocusedClient && !this.lastActivationByKiri &&
            now - this.lastActivationTime < ClientManager.kwinPickMs && !this.isNewClient(active)) {
            this.shellReturnUntil = now + ClientManager.kwinPickMs;
        } else {
            return;
        }
        this.activateShellReturn(active);
    }

    private isNewClient(kwinClient: KwinClient) {
        const client = this.clientMap.get(kwinClient);
        return client === undefined || Date.now() - client.createdAt < 1000;
    }

    private activateShellReturn(active: KwinClient|null) {
        if (overviewActive()) {
            return;
        }
        // like niri, the focus goes back to the layout's active window
        const previous = this.lastFocusedClient;
        const target = previous !== null && this.clientMap.has(previous) && !previous.minimized &&
            isOnShownDesktop(previous) ? previous : null;
        if (target !== null && target !== active) {
            activateWindow(target, "shell-return");
        }
    }

    private focusAfterFloatingClose(kwinClient: KwinClient, desktop: Desktop|undefined, kwinPicked: boolean, closedStamp: number) {
        const parent = kwinClient.transientFor;
        if (parent !== null && this.clientMap.has(parent) && !parent.minimized) {
            KiriFocus.mark(parent);
            activateWindow(parent, "client-manager");
            requestCursorWarp();
            return;
        }
        const stack = Workspace.stackingOrder;
        let topmost: KwinClient|null = null;
        let topIndex = -1;
        for (const other of this.clientMap.keys()) {
            const index = stack.indexOf(other);
            if (index > topIndex && this.isFloatingOnCurrentDesktop(other)) {
                topmost = other;
                topIndex = index;
            }
        }
        if (topmost !== null) {
            KiriFocus.mark(topmost);
            activateWindow(topmost, "client-manager");
        } else {
            let window = desktop === undefined ? null : desktop.grid.getLastFocusedWindow();
            if (kwinPicked && desktop !== undefined) {
                // KWin's pick already moved the grid's focus: the window focused before the floating one goes back
                let bestStamp = -1;
                for (const [other, stamp] of this.focusStamps) {
                    const candidate = this.findTiledWindow(other);
                    if (candidate !== null && candidate.column.grid === desktop.grid && stamp < closedStamp && stamp > bestStamp) {
                        window = candidate;
                        bestStamp = stamp;
                    }
                }
            }
            if (window === null) {
                return;
            }
            window.client.focus();
        }
        requestCursorWarp();
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

    // niri's interactive move: the window leaves the grid after 256 px of pointer travel and is tiled again on release
    public static readonly dragStartDistance = 256;
    public static readonly dragOpacity = 0.75;

    // `floating` is niri's move_.is_floating: the window stays opaque, shows no insert hint and drops as floating
    public floatForDrag(client: ClientWrapper, floating = false) {
        this.floatDragged(client, floating);
    }

    // a tiled window that has not yet travelled 256 px: `start` takes it out of the grid right away
    public setDragPending(client: ClientWrapper, start: (() => void) | null) {
        this.dragPending = start === null ? null : { client: client, start: start };
    }

    // niri's move grab: the other mouse button toggles floating during a drag
    public toggleDragFloating() {
        const pending = this.dragPending;
        if (pending !== null) {
            if (this.config.untileOnDrag) {
                pending.start();
            }
            return;
        }
        const drag = this.drag;
        if (drag === null || !this.config.dropToTile || !this.config.untileOnDrag) {
            return;
        }
        if (drag.floating && !Clients.canTileEver(drag.client.kwinClient)) {
            return;
        }
        drag.floating = !drag.floating;
        drag.apply();
    }

    public floatingDragStarted(client: ClientWrapper) {
        if (this.drag !== null || !this.config.dropToTile) {
            return;
        }
        this.startDrag(client, true);
    }

    public floatDragged(client: ClientWrapper, floating = false) {
        const kwinClient = client.kwinClient;
        setVisualPosition(String(kwinClient.internalId), null);
        setInsertHint(null, String(kwinClient.internalId));
        if (!(client.stateManager.getState() instanceof ClientState.Floating)) {
            // niri never shows a title bar while dragging
            client.keepTitlebarHidden = true;
            try {
                client.stateManager.setState(() => new ClientState.Floating(this.world, client, this.config, false), FocusPassing.Type.None);
            } finally {
                client.keepTitlebarHidden = false;
            }
        }
        this.startDrag(client, floating);
    }

    private startDrag(client: ClientWrapper, floating: boolean) {
        const kwinClient = client.kwinClient;
        const opacityBefore = kwinClient.opacity;
        const fadedByEffect = canParkWindows();
        const id = String(kwinClient.internalId);
        const manager = new SignalManager();
        let edgeScroll: DndEdgeScroll | null = null;
        const drag: ClientManager.Drag = { client: client, floating: floating, apply: () => {} };
        const update = () => this.world.do(() => this.updateInsertHint(kwinClient));
        const stopEdgeScroll = () => {
            edgeScroll?.stop();
            edgeScroll = null;
        };
        drag.apply = () => {
            if (drag.floating) {
                stopEdgeScroll();
                setInsertHint(null);
                if (!fadedByEffect) {
                    kwinClient.opacity = opacityBefore;
                }
                this.restoreFloatingSize(client);
                return;
            }
            if (!fadedByEffect) {
                kwinClient.opacity = ClientManager.dragOpacity;
            }
            if (edgeScroll === null && this.config.dropToTile) {
                // niri's dnd-edge-view-scroll
                edgeScroll = new DndEdgeScroll(
                    this.config,
                    () => Workspace.cursorPos,
                    () => this.desktopManager.getDesktopForClient(kwinClient),
                    update,
                );
                edgeScroll.start();
            }
            setInsertHint(null, id);
            if (this.config.dropToTile) {
                update();
            }
        };
        this.drag = drag;
        if (!floating) {
            drag.apply();
        }
        manager.connect(kwinClient.frameGeometryChanged, () => {
            if (this.config.dropToTile && !drag.floating) {
                update();
            }
        });
        manager.connect(kwinClient.interactiveMoveResizeFinished, () => {
            stopEdgeScroll();
            manager.destroy();
            if (this.drag === drag) {
                this.drag = null;
            }
            if (!fadedByEffect) {
                kwinClient.opacity = opacityBefore;
            }
            setInsertHint(null);
            if (this.config.dropToTile && !drag.floating) {
                this.world.do(() => this.dropTile(kwinClient));
            }
            if (!(client.stateManager.getState() instanceof ClientState.Tiled)) {
                client.restoreTitlebar();
            }
        });
    }

    private restoreFloatingSize(client: ClientWrapper) {
        const kwinClient = client.kwinClient;
        const saved = this.floatingFrames.get(kwinClient);
        if (saved === undefined) {
            return;
        }
        const frame = kwinClient.frameGeometry;
        const cursor = Workspace.cursorPos;
        const ratioX = frame.width > 0 ? (cursor.x - frame.x) / frame.width : 0.5;
        const ratioY = frame.height > 0 ? (cursor.y - frame.y) / frame.height : 0.5;
        client.place(Math.round(cursor.x - ratioX * saved.width), Math.round(cursor.y - ratioY * saved.height), saved.width, saved.height);
    }

    // niri's insert_position: the closest gap between columns or between the windows of the column under the pointer
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
        let columnIndex = -1;
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
            // like niri's insert_hint_area: 150 px tall at the top or bottom of a column, 300 px between windows
            const column = columns[columnIndex];
            const count = column.getWindows().length;
            const x = column.getLeft() + offsetX;
            const w = column.getWidth();
            let h = 150, y = tileGap.y;
            if (tileGap.windowIndex === 0) {
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
            setInsertHint(null, String(kwinClient.internalId));
            return;
        }
        const desktop = this.desktopManager.getDesktopForClient(kwinClient);
        if (desktop === undefined) {
            setInsertHint(null, String(kwinClient.internalId));
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
        const target = this.insertTarget(desktop, columns, Workspace.cursorPos);
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
    private restoredFloating = new Set<string>();
    private restoredManual = new Set<string>();
    private restoredFrames = new Map<string, { x: number, y: number, width: number, height: number }>();

    public prepareRestore(floating: string[], manual: string[], frames: { id: string, x: number, y: number, width: number, height: number }[]) {
        this.restoredFloating = new Set(floating);
        this.restoredManual = new Set(manual);
        this.restoredFrames = new Map(frames.map(f => [f.id, { x: f.x, y: f.y, width: f.width, height: f.height }]));
    }

    public captureFloating() {
        const floating: string[] = [];
        const manual: string[] = [];
        const floatingFrames: { id: string, x: number, y: number, width: number, height: number }[] = [];
        this.toggledManually.forEach(kwinClient => {
            const id = String(kwinClient.internalId);
            manual.push(id);
            if (this.isFloating(kwinClient)) {
                floating.push(id);
            }
        });
        this.floatingFrames.forEach((frame, kwinClient) => {
            floatingFrames.push({ id: String(kwinClient.internalId), x: frame.x, y: frame.y, width: frame.width, height: frame.height });
        });
        return { floating, manual, floatingFrames };
    }

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

    // where a tiled window ends up (niri warps to it), null while Kiri has not placed it yet
    public getWarpFrame(kwinClient: KwinClient) {
        const window = this.findTiledWindow(kwinClient);
        return window === null ? undefined : window.client.getPlacement();
    }

    private warpedToTiled: { client: KwinClient, time: number }|null = null;

    public onClientFocused(kwinClient: KwinClient) {
        this.desktopManager.setForcedOutput(null);
        if (Clients.isShellUi(kwinClient)) {
            // KRunner, panels and their popups are no focus change for the layout: no scroll, no warp
            this.lastShellFocused = this.clientMap.has(kwinClient) ? kwinClient : null;
            return;
        }
        if (this.shellReturnUntil > 0) {
            const armed = Date.now() <= this.shellReturnUntil;
            this.shellReturnUntil = 0;
            if (armed && !KiriFocus.peek(kwinClient) && !this.isNewClient(kwinClient)) {
                const before = Workspace.activeWindow;
                this.activateShellReturn(kwinClient);
                if (Workspace.activeWindow !== before) {
                    return;
                }
            }
        }
        // a floating window that gets the focus right after a warp to a tiled window under it gives it back
        const warped = this.warpedToTiled;
        this.warpedToTiled = null;
        if (warped !== null && warped.client !== kwinClient && Date.now() - warped.time < 800 &&
            // not after a switch to another desktop or a minimize, where KWin's pick is the user's
            isOnShownDesktop(warped.client) && !warped.client.minimized &&

            this.isFloating(kwinClient) && !KiriFocus.peek(kwinClient) && this.clientMap.has(warped.client)) {
            KiriFocus.mark(warped.client);
            activateWindow(warped.client, "client-manager");
            return;
        }
        if (kwinClient !== this.lastFocusedClient) {
            this.focusedBefore = this.lastFocusedClient;
        }
        this.lastActivationTime = Date.now();
        this.lastActivationByKiri = KiriFocus.peek(kwinClient);
        this.lastFocusedClient = kwinClient;
        this.focusStamps.set(kwinClient, ++this.focusCounter);
        // like niri, only focus changes made by Kiri move the cursor
        const focusedByKiri = KiriFocus.take(kwinClient);
        const warp = this.config.cursorFollowsFocus && focusedByKiri;
        if (this.isFloating(kwinClient)) {
            this.floatingFocusOrder = this.floatingFocusOrder.filter(c => c !== kwinClient);
            this.floatingFocusOrder.push(kwinClient);
        }
        const window = this.findTiledWindow(kwinClient);
        if (window !== null) {
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
            requestCursorWarp();
        }
    }

    // niri's focus-window-previous (`scope`, `appOnly` filters)
    public findPreviousFocused(scope: "all"|"output"|"workspace" = "all", appOnly = false): KwinClient|null {
        const active = Workspace.activeWindow;
        const activeApp = appOnly && active !== null ? active.resourceClass : null;
        let best: KwinClient|null = null;
        let bestStamp = -1;
        for (const [kwinClient, stamp] of this.focusStamps) {
            if (kwinClient === active || kwinClient.minimized || stamp <= bestStamp || !this.clientMap.has(kwinClient)) {
                continue;
            }
            if (scope === "workspace" && kwinClient.desktops.length > 0 && !kwinClient.desktops.includes(Workspace.currentDesktop)) {
                continue;
            }
            if (scope === "output" && kwinClient.output !== (active !== null ? active.output : Workspace.activeScreen)) {
                continue;
            }
            if (activeApp !== null && kwinClient.resourceClass !== activeApp) {
                continue;
            }
            best = kwinClient;
            bestStamp = stamp;
        }
        return best;
    }

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

    // a floating window the user's keys may move, resize and focus; not the desktop, panels or popups
    public isUserFloating(kwinClient: KwinClient) {
        return this.isFloating(kwinClient) && !Clients.placesItself(kwinClient);
    }

    // the floating window that was focused last on the current desktop and screen (niri's active window)
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
        return this.isUserFloating(kwinClient) &&
            !kwinClient.minimized &&
            kwinClient.desktops.includes(currentDesktopOn(kwinClient.output)) &&
            (kwinClient.activities.length === 0 || kwinClient.activities.includes(Workspace.currentActivity)) &&
            kwinClient.output === Workspace.activeScreen;
    }

    // niri's focus-left/right/up/down in the floating layer: the nearest window in that direction
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
            activateWindow(best, "client-manager");
        }
        return best !== null;
    }

    public getTopFloatingOnOutput(output: Output) {
        for (const kwinClient of this.floatingFocusOrder.slice().reverse()) {
            if (this.isFloatingOnCurrentDesktop(kwinClient) && kwinClient.output.name === output.name && !kwinClient.minimized) {
                return kwinClient;
            }
        }
        return null;
    }

    public moveFloatingToOutput(kwinClient: KwinClient, target: Output) {
        const client = this.clientMap.get(kwinClient);
        if (client === undefined || !this.isFloating(kwinClient)) {
            return;
        }
        const kwinDesktop = Clients.getKwinDesktopApprox(kwinClient);
        // it follows the target output to the desktop that output shows
        const targetDesktop = kwinClient.desktops.length === 1 ? currentDesktopOn(target) : kwinDesktop;
        const from = Workspace.clientArea(ClientAreaOption.PlacementArea, kwinClient.output, kwinDesktop);
        const to = Workspace.clientArea(ClientAreaOption.PlacementArea, target, targetDesktop);
        const frame = kwinClient.frameGeometry;
        const width = Math.min(frame.width.round(), Math.round(to.width));
        const height = Math.min(frame.height.round(), Math.round(to.height));
        const x = to.x + (frame.x - from.x) / Math.max(1, from.width) * to.width;
        const y = to.y + (frame.y - from.y) / Math.max(1, from.height) * to.height;
        const pos = ClientManager.clampFloatingPosition(to, Math.round(x), Math.round(y), width, height);
        if (kwinClient.desktops.length === 1 && kwinClient.desktops[0] !== targetDesktop) {
            kwinClient.desktops = [targetDesktop];
        }
        client.place(pos.x, pos.y, width, height);
        activateWindow(kwinClient, "move-to-monitor");
    }

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
            activateWindow(best, "client-manager");
        }
    }

    // niri's recompute_logical_pos: at least a quarter of the window (10 to 75 px) stays in the work area
    private static clampFloatingPosition(area: QmlRect, x: number, y: number, width: number, height: number) {
        const minOnScreenX = Math.min(Math.max(width / 4, 10), 75);
        const minOnScreenY = Math.min(Math.max(height / 4, 10), 75);
        return {
            x: Math.min(Math.max(x, area.x - (width - minOnScreenX)), rectRight(area) - minOnScreenX),
            y: Math.min(Math.max(y, area.y - (height - minOnScreenY)), rectBottom(area) - minOnScreenY),
        };
    }

    public moveFloatingClient(kwinClient: KwinClient, dx: number, dy: number) {
        const client = this.clientMap.get(kwinClient);
        if (client === undefined || !this.isUserFloating(kwinClient)) {
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

    // niri resizes a floating window relative to the work area; the top-left corner stays
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

    public adjustFloatingSize(kwinClient: KwinClient, horizontal: boolean, percent: number) {
        const available = this.floatingAreaSize(kwinClient, horizontal);
        const frame = kwinClient.frameGeometry;
        const current = horizontal ? frame.width : frame.height;
        (horizontal ? this.floatingPresetIndex.width : this.floatingPresetIndex.height).delete(kwinClient);
        this.resizeFloatingClient(kwinClient, horizontal, current + available * percent / 100);
    }

    public setFloatingSize(kwinClient: KwinClient, horizontal: boolean, change: SizeChange) {
        const frame = kwinClient.frameGeometry;
        const current = horizontal ? frame.width : frame.height;
        (horizontal ? this.floatingPresetIndex.width : this.floatingPresetIndex.height).delete(kwinClient);
        this.resizeFloatingClient(kwinClient, horizontal, change.resolve(current, this.floatingAreaSize(kwinClient, horizontal), 0));
    }

    // niri's toggle_window_width: next preset, else the first preset larger than the window (`presets` are in pixels)
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

    public getFloatingOnDesktop(kwinDesktop: KwinDesktop, output?: Output) {
        const result: KwinClient[] = [];
        for (const kwinClient of this.clientMap.keys()) {
            if (!this.isFloating(kwinClient) || kwinClient.minimized || !(kwinClient.normalWindow || kwinClient.dialog)) {
                continue;
            }
            if (output !== undefined && kwinClient.output.name !== output.name) {
                continue;
            }
            const there = kwinClient.desktops.length === 0 ? kwinDesktop === currentDesktopOn(kwinClient.output) : kwinClient.desktops.includes(kwinDesktop);
            if (there) {
                result.push(kwinClient);
            }
        }
        return result;
    }

    // a window picked up in the overview leaves its column, so the others fill the column as in niri's interactive move;
    // a window alone in its column stays (nothing else to resize)
    public overviewDragStart(kwinClient: KwinClient) {
        this.overviewDragEnd();
        const client = this.clientMap.get(kwinClient);
        const window = this.findTiledWindow(kwinClient);
        if (client === undefined || window === null || window.column.getWindowCount() < 2) {
            return false;
        }
        const column = window.column;
        this.overviewDragSlot = {
            client: client,
            grid: column.grid,
            placement: {
                column: column,
                after: column.getAboveWindow(window),
                leftColumn: column.grid.getLeftColumn(column),
            },
        };
        client.stateManager.setState(() => new ClientState.Floating(this.world, client, this.config, false), FocusPassing.Type.None);
        return true;
    }

    // the overview drag ended (cancelled or dropped): the window goes back to its place in the column
    public overviewDragEnd() {
        const slot = this.overviewDragSlot;
        if (slot === null) {
            return;
        }
        this.overviewDragSlot = null;
        if (slot.client.stateManager.getState() instanceof ClientState.Floating) {
            this.tileClient(slot.client, slot.grid, slot.placement);
        }
    }

    // a tiled window dropped in the overview: `columnIndex` and `tile` count the target's columns without the dragged window
    public overviewDrop(kwinClient: KwinClient, kwinDesktop: KwinDesktop, columnIndex: number, tile: number, outputName?: string) {
        const window = this.findTiledWindow(kwinClient);
        const desktop = this.desktopManager.getDesktopInCurrentActivity(kwinDesktop, outputName);
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
                // the column itself moves; an empty new column would take the focus when the old one is removed
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

    // niri's InsertPosition::Floating: it stays floating on the desktop under the pointer and takes the focus
    public overviewDropFloating(kwinClient: KwinClient, kwinDesktop: KwinDesktop, x: number, y: number) {
        const client = this.clientMap.get(kwinClient);
        if (client === undefined || !this.isFloating(kwinClient) || !Number.isFinite(x) || !Number.isFinite(y)) {
            return;
        }
        const area = Workspace.clientArea(ClientAreaOption.PlacementArea, kwinClient.output, kwinDesktop);
        const g = kwinClient.frameGeometry;
        const nx = Math.max(area.x, Math.min(x, area.x + area.width - g.width));
        const ny = Math.max(area.y, Math.min(y, area.y + area.height - g.height));
        if (kwinClient.desktops.length !== 1 || kwinClient.desktops[0] !== kwinDesktop) {
            kwinClient.desktops = [kwinDesktop];
        }
        client.place(Math.round(nx), Math.round(ny), g.width, g.height);
        activateWindow(kwinClient, "client-manager");
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
        this.startupTimer?.destroy();
        this.removeAllClients();
    }
}

namespace ClientManager {
    export interface Drag {
        client: ClientWrapper;
        floating: boolean;
        apply: () => void;
    }

    export interface Config {
        untileOnDrag: boolean;
        floatingKeepAbove: boolean;
        cursorFollowsFocus: boolean;
        defaultColumnWidth: string;
        gapsInnerHorizontal: number;
        dropToTile: boolean;
        dndEdgeViewScrollTriggerWidth: number;
        dndEdgeViewScrollDelay: number;
        dndEdgeViewScrollMaxSpeed: number;
    }
}

interface InsertTarget {
    column: number;
    tile: number | null;
    rect: { x: number, y: number, width: number, height: number } | null;
}
