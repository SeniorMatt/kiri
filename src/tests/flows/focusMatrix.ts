// "The focused window stays focused, and in sight, whatever you do with it and whatever settings are on."
// Every action runs on the focused window under a cross product of the settings that touch focus; afterwards the
// window must still be the active one, Kiri's own idea of the focus (last focused client and column) must agree, and
// the window must be where the user can see it. Failures are collected per action and setting, so one run lists them all.
{
    interface Variant {
        scroll: "lazy" | "centered" | "grouped" | "overflow";
        ffm: boolean;
        cursorFollowsFocus: boolean;
        hideTitlebars: boolean;
        tileFullScreen: boolean;
        tileMaximized: boolean;
        // not part of the cross product, picked at random on every run
        extras: { tabbedColumnsByDefault: boolean, untileOnDrag: boolean, dropToTile: boolean, reMaximize: boolean, dynamicDesktops: boolean };
    }

    interface Ctx {
        variant: Variant;
        config: Config;
        qtMock: MockQt;
        workspaceMock: MockWorkspace;
        world: World;
        clients: MockKwinClient[];
        w: MockKwinClient; // the focused window
        setHeld: (held: number) => void;
        ffm: FocusFollowsMouse | null;
    }

    // what an action leaves: the window that must have the focus, and what has to be true of its place
    interface Expect {
        focus: MockKwinClient;
        place?: "tiled" | "floating" | "tiledOrFloating" | "fullScreen" | "any";
        dragged?: boolean; // the user put it anywhere on purpose
        desktop?: KwinDesktop; // the desktop it must be visible on (default: the current one)
    }

    const failures = new Map<string, { count: number, first: string }>();
    const actions: { name: string, run: (ctx: Ctx) => Expect | Expect[], x11?: boolean, needsColumnMates?: boolean }[] = [];

    function variantName(v: Variant) {
        return `scroll=${v.scroll} ffm=${v.ffm} cff=${v.cursorFollowsFocus} titlebars=${v.hideTitlebars} tileFS=${v.tileFullScreen} tileMax=${v.tileMaximized} ` + JSON.stringify(v.extras);
    }

    function makeVariants() {
        const result: Variant[] = [];
        for (const scroll of ["lazy", "centered", "grouped", "overflow"] as const) {
            for (const ffm of [false, true]) {
                for (const cursorFollowsFocus of [false, true]) {
                    for (const hideTitlebars of [false, true]) {
                        for (const tileFullScreen of [false, true]) {
                            for (const tileMaximized of [false, true]) {
                                result.push({
                                    scroll, ffm, cursorFollowsFocus, hideTitlebars, tileFullScreen, tileMaximized,
                                    extras: { tabbedColumnsByDefault: false, untileOnDrag: false, dropToTile: false, reMaximize: false, dynamicDesktops: false },
                                });
                            }
                        }
                    }
                }
            }
        }
        return result;
    }

    function coin() {
        return Math.random() < 0.5;
    }

    function setup(variant: Variant): Ctx {
        const config = getDefaultConfig();
        config.scrollingLazy = variant.scroll === "lazy";
        config.scrollingCentered = variant.scroll === "centered";
        config.scrollingGrouped = variant.scroll === "grouped";
        config.scrollingOnOverflow = variant.scroll === "overflow";
        config.focusFollowsMouse = variant.ffm;
        config.cursorFollowsFocus = variant.cursorFollowsFocus;
        config.hideTitlebars = variant.hideTitlebars;
        config.tileFullScreen = variant.tileFullScreen;
        config.tileMaximized = variant.tileMaximized;
        Object.assign(config, variant.extras);

        const { qtMock, workspaceMock, world } = init(config);
        MockQmlTimer.deferIntervals.add(300);
        const clients = workspaceMock.createClientsWithWidths(300, 300, 300, 300, 300);
        clients.forEach((client, index) => {
            client.pid = 100 + index;
            workspaceMock.stackingOrder.push(client);
        });
        const w = clients[2];
        workspaceMock.activeWindow = w;

        // a warp of the cursor is a pointer event for KWin
        const warp = moveCursorToFocus.call;
        moveCursorToFocus = { __brand: "QmlObject", call: () => { warp(); workspaceMock.cursorPosChanged.fire(); } } as any;

        let held = 0;
        let ffm: FocusFollowsMouse | null = null;
        if (variant.ffm) {
            ffm = new FocusFollowsMouse(() => world.isScrollBusy(), 100);
            // the pointer rests on the focused window
            const frame = w.getActualFrameGeometry();
            workspaceMock.cursorPos = new MockQmlPoint(Math.floor(frame.x + frame.width / 2), Math.floor(frame.y + frame.height / 2));
            workspaceMock.cursorPosChanged.fire();
        }
        return { variant, config, qtMock, workspaceMock, world, clients, w, setHeld: h => { held = h; }, ffm };
    }

    function cleanup(ctx: Ctx) {
        ctx.ffm?.destroy();
        MockQmlTimer.deferIntervals.clear();
        MockQmlTimer.flush();
    }

    function inScreen(rect: QmlRect) {
        return rect.x < rectRight(screen) && rectRight(rect) > screen.x && rect.y < rectBottom(screen) && rectBottom(rect) > screen.y;
    }

    function check(ctx: Ctx, actionName: string, expects: Expect[]) {
        const problems: string[] = [];
        const wsm = ctx.workspaceMock;
        for (const expect of expects) {
            const kwin = expect.focus;
            if (Workspace.activeWindow !== kwin) {
                problems.push(`active window is ${Workspace.activeWindow} instead of ${kwin}`);
                continue;
            }
            let cm: ClientManager | null = null;
            ctx.world.do(clientManager => { cm = clientManager; });
            const manager = cm as unknown as ClientManager;
            if ((manager as any).lastFocusedClient !== kwin) {
                problems.push(`Kiri's last focused client is ${(manager as any).lastFocusedClient}`);
            }
            const tiled = manager.findTiledWindow(kwin);
            const frame = kwin.getActualFrameGeometry();
            const desktop = expect.desktop ?? wsm.currentDesktop;
            const onDesktop = kwin.desktops.length === 0 || kwin.desktops.includes(desktop);
            if (!onDesktop) {
                problems.push("not on the desktop that is shown");
            }
            const place = expect.place ?? "any";
            if (tiled !== null) {
                if (place === "floating") {
                    problems.push("is tiled, expected floating");
                }
                const grid = tiled.column.grid;
                if (grid.getLastFocusedWindow() !== tiled && !tiled.column.isTabbed()) {
                    problems.push("the grid's last focused window is another one");
                }
                if (grid.getLastFocusedColumn() !== tiled.column) {
                    problems.push("the grid's last focused column is another one");
                }
                if (kwin.fullScreen || (kwin.maximizedHorizontally && kwin.maximizedVertically)) {
                    if (!rectEquals(frame, screen) && !(frame.x >= tilingArea.x && rectRight(frame) <= rectRight(tilingArea))) {
                        problems.push(`full-screen/maximized but frame is ${frame}`);
                    }
                } else if (!(frame.x >= tilingArea.x - 0.5 && rectRight(frame) <= rectRight(tilingArea) + 0.5)) {
                    problems.push(`out of sight: ${frame}`);
                }
            } else {
                if (place === "tiled" || place === "fullScreen" && false) {
                    problems.push("is not tiled");
                }
                if (!expect.dragged && !inScreen(frame)) {
                    problems.push(`off screen: ${frame}`);
                }
            }
            if (place === "fullScreen" && !(kwin.fullScreen && rectEquals(frame, screen))) {
                problems.push(`should be full-screen, frame ${frame}`);
            }
        }
        if (problems.length > 0) {
            const key = `${actionName}: ${problems[0].replace(/\[.*?\]|MockKwinClient\(.*?\)|[-0-9.]+/g, "#")}`;
            const entry = failures.get(key);
            if (entry === undefined) {
                failures.set(key, { count: 1, first: `${problems.join("; ")} @ ${variantName(ctx.variant)}` });
            } else {
                entry.count++;
            }
        }
    }

    function rectEquals(a: QmlRect, b: QmlRect) {
        return Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1 && Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1;
    }

    // a window of the same process and class as `old` is mapped again (SDL on X11 going full-screen)
    function mapAgain(workspaceMock: MockWorkspace, old: MockKwinClient) {
        const client = new MockKwinClient(new MockQmlRect(50, 50, 300, 400));
        client.pid = old.pid;
        client.resourceClass = old.resourceClass;
        client.caption = old.caption;
        workspaceMock.windows.push(client);
        workspaceMock.stackingOrder.push(client);
        workspaceMock.windowAdded.fire(client);
        return client;
    }

    // KWin keeps the focus when another window closes
    function closeNeighbour(ctx: Ctx, victim: MockKwinClient) {
        const wsm = ctx.workspaceMock;
        wsm.windows.splice(wsm.windows.indexOf(victim), 1);
        wsm.windowRemoved.fire(victim);
    }

    function press(ctx: Ctx, name: string) {
        ctx.qtMock.fireShortcut(name);
    }

    // a mouse drag with the pointer moving: the pointer events reach focus follows mouse, which ignores them while a button is held
    function drag(ctx: Ctx, window: MockKwinClient, dx: number, dy: number, steps: number) {
        const wsm = ctx.workspaceMock;
        const originalQmlBase = qmlBase;
        const bridge: any = { queryPointerButtons: (callback: (buttons: number) => void) => callback(held), queryX11Window: (id: string, callback: (x11: boolean) => void) => callback(true) };
        let held = 1;
        qmlBase = new Proxy(bridge, { get: (target, property) => property in target ? target[property] : () => {} });
        try {
            const deltas: QmlPoint[] = [];
            for (let i = 0; i < steps; i++) {
                deltas.push(new MockQmlPoint(dx / steps, dy / steps));
            }
            const fire = wsm.cursorPosChanged;
            const cursorStep = wsm.moveWindow.bind(wsm);
            const originalFire = window.frameGeometryChanged.fire.bind(window.frameGeometryChanged);
            void originalFire;
            // the pointer events come with every step of the move
            window.frameGeometryChanged.connect(() => fire.fire());
            cursorStep(window, ...deltas);
            held = 0; // released: the focus follows only when the pointer moves on
        } finally {
            qmlBase = originalQmlBase;
        }
    }

    function register(name: string, run: (ctx: Ctx) => Expect | Expect[], options: { x11?: boolean, needsColumnMates?: boolean } = {}) {
        actions.push({ name, run, ...options });
    }

    // ---- fullscreen -----------------------------------------------------------------------------------------------

    register("fullscreen on and off (Wayland)", ctx => {
        ctx.w.x11 = false;
        ctx.w.fullScreen = true;
        check(ctx, "fullscreen on (Wayland)", [{ focus: ctx.w, place: ctx.variant.tileFullScreen ? "fullScreen" : "any" }]);
        ctx.w.fullScreen = false;
        return { focus: ctx.w, place: "tiledOrFloating" };
    });

    register("fullscreen on and off, then a neighbour closes", ctx => {
        ctx.w.fullScreen = true;
        closeNeighbour(ctx, ctx.clients[3]);
        check(ctx, "neighbour closes while fullscreen", [{ focus: ctx.w }]);
        ctx.w.fullScreen = false;
        return { focus: ctx.w };
    });

    register("fullscreen on, move column away and back (focus keys)", ctx => {
        ctx.w.fullScreen = true;
        press(ctx, "focus-right");
        press(ctx, "focus-left");
        check(ctx, "fullscreen focus-right then left", [{ focus: ctx.w }]);
        ctx.w.fullScreen = false;
        return { focus: ctx.w };
    });

    for (const kwinPicks of [false, true]) {
        register(`X11 remap on fullscreen (new window ${kwinPicks ? "activated by KWin" : "not activated"})`, ctx => {
            const wsm = ctx.workspaceMock;
            ctx.w.fullScreen = true;
            wsm.removeWindow(ctx.w); // KWin gives the focus to some other window
            const w2 = mapAgain(wsm, ctx.w);
            if (kwinPicks) {
                wsm.activeWindow = w2;
            }
            check(ctx, `X11 remap (${kwinPicks ? "activated" : "not activated"}) fullscreen`, [{ focus: w2 }]);
            w2.fullScreen = false;
            return { focus: w2 };
        });
    }

    register("X11 remap on leaving fullscreen", ctx => {
        const wsm = ctx.workspaceMock;
        ctx.w.fullScreen = true;
        const w2 = ctx.w;
        w2.fullScreen = false;
        wsm.removeWindow(w2);
        const w3 = mapAgain(wsm, w2);
        w3.fullScreen = true;
        w3.fullScreen = false;
        return { focus: w3 };
    });

    // ---- maximize --------------------------------------------------------------------------------------------------

    register("maximize and unmaximize (window state)", ctx => {
        ctx.w.setMaximize(true, true);
        check(ctx, "maximize", [{ focus: ctx.w }]);
        ctx.w.setMaximize(false, false);
        return { focus: ctx.w };
    });

    register("maximize-to-edges key twice", ctx => {
        press(ctx, "window-maximize-to-edges");
        check(ctx, "window-maximize-to-edges", [{ focus: ctx.w }]);
        press(ctx, "window-maximize-to-edges");
        return { focus: ctx.w };
    });

    register("maximize-column key twice", ctx => {
        press(ctx, "column-width-maximize");
        check(ctx, "column-width-maximize", [{ focus: ctx.w }]);
        press(ctx, "column-width-maximize");
        return { focus: ctx.w };
    });

    register("maximize, neighbour focus away and back", ctx => {
        ctx.w.setMaximize(true, true);
        press(ctx, "focus-left");
        press(ctx, "focus-right");
        check(ctx, "maximized focus left and right", [{ focus: ctx.w }]);
        ctx.w.setMaximize(false, false);
        return { focus: ctx.w };
    });

    // ---- floating --------------------------------------------------------------------------------------------------

    register("toggle floating twice", ctx => {
        press(ctx, "window-toggle-floating");
        check(ctx, "toggle floating (to floating)", [{ focus: ctx.w, place: "floating" }]);
        press(ctx, "window-toggle-floating");
        return { focus: ctx.w, place: "tiled" };
    });

    register("move to floating and to tiling", ctx => {
        press(ctx, "window-move-to-floating");
        check(ctx, "window-move-to-floating", [{ focus: ctx.w, place: "floating" }]);
        press(ctx, "window-move-to-tiling");
        return { focus: ctx.w, place: "tiled" };
    });

    register("floating window: neighbours move, focus stays", ctx => {
        press(ctx, "window-toggle-floating");
        press(ctx, "focus-tiling");
        press(ctx, "window-move-right");
        press(ctx, "focus-floating");
        check(ctx, "floating focus, tiled neighbour moved", [{ focus: ctx.w, place: "floating" }]);
        press(ctx, "window-toggle-floating");
        return { focus: ctx.w, place: "tiled" };
    });

    register("floating window fullscreen and back", ctx => {
        press(ctx, "window-toggle-floating");
        ctx.w.fullScreen = true;
        ctx.w.fullScreen = false;
        check(ctx, "floating fullscreen toggle", [{ focus: ctx.w }]);
        press(ctx, "window-toggle-floating");
        return { focus: ctx.w, place: "tiled" };
    });

    // ---- mouse -----------------------------------------------------------------------------------------------------

    for (const [label, dx, dy] of [["small drag", 40, 20], ["long drag right", 450, 0], ["long drag left", -450, 30], ["drag down out of the grid", 0, 300]] as const) {
        register(`mouse move: ${label}`, ctx => {
            drag(ctx, ctx.w, dx, dy, 6);
            return { focus: ctx.w, place: "tiledOrFloating", dragged: true };
        });
    }

    register("mouse resize by the edge and from the middle", ctx => {
        ctx.workspaceMock.resizeWindow(ctx.w, true, false, false, new MockQmlSize(40, 0), new MockQmlSize(0, 0));
        check(ctx, "mouse resize edge", [{ focus: ctx.w }]);
        ctx.workspaceMock.resizeWindow(ctx.w, true, true, false, new MockQmlSize(-30, 0));
        check(ctx, "mouse resize left edge", [{ focus: ctx.w }]);
        ctx.workspaceMock.resizeWindow(ctx.w, false, false, false, new MockQmlSize(20, 0));
        return { focus: ctx.w };
    });

    // ---- keyboard moves ----------------------------------------------------------------------------------------------

    for (const key of [
        "window-move-left", "window-move-right", "window-swap-left", "window-swap-right",
        "column-move-left", "column-move-right", "column-move-start", "column-move-end",
        "window-move-start", "window-move-end", "window-move-next", "window-move-previous",
        "window-consume-or-expel-left", "window-consume-or-expel-right", "window-consume-into-column", "window-expel-from-column",
        "column-toggle-tabbed", "column-display-tabbed", "column-display-normal", "column-center-visible",
        "column-width-increase", "column-width-decrease", "column-width-fit-increase", "cycle-preset-widths", "cycle-preset-widths-reverse",
        "column-width-expand", "columns-width-equalize", "columns-squeeze-left", "columns-squeeze-right",
        "window-height-increase", "window-height-reset", "window-height-cycle-presets",
    ]) {
        register(`key ${key} twice`, ctx => {
            press(ctx, key);
            check(ctx, `key ${key}`, [{ focus: ctx.w, place: "tiledOrFloating" }]);
            press(ctx, key);
            return { focus: ctx.w };
        });
    }

    register("consume then window-move-up/down inside a column", ctx => {
        press(ctx, "window-consume-or-expel-left");
        for (const key of ["window-move-up", "window-move-down", "window-move-up", "window-expel-from-column"]) {
            press(ctx, key);
            check(ctx, `key ${key} in a column`, [{ focus: ctx.w }]);
        }
        return { focus: ctx.w };
    });

    register("tabbed column: move and expel", ctx => {
        press(ctx, "window-consume-or-expel-left");
        check(ctx, "tab: consume", [{ focus: ctx.w }]);
        press(ctx, "column-display-tabbed");
        check(ctx, "tab: display tabbed", [{ focus: ctx.w }]);
        press(ctx, "column-move-right");
        check(ctx, "tab: column move right", [{ focus: ctx.w }]);
        press(ctx, "window-consume-or-expel-right"); // (expel-from-column takes the bottom window out and, like niri, the focus goes to the one above)
        return { focus: ctx.w };
    });

    // ---- desktops ---------------------------------------------------------------------------------------------------

    register("move window to desktop and follow it", ctx => {
        const wsm = ctx.workspaceMock;
        const target = wsm.desktops[1];
        ctx.w.moveAndFollowToDesktop(target, wsm);
        check(ctx, "move and follow to desktop", [{ focus: ctx.w, desktop: target }]);
        // back again
        ctx.w.desktops = [wsm.desktops[0]];
        wsm.currentDesktop = wsm.desktops[0];
        wsm.activeWindow = ctx.w;
        return { focus: ctx.w };
    });

    register("desktop away and back", ctx => {
        const wsm = ctx.workspaceMock;
        wsm.currentDesktop = wsm.desktops[1];
        wsm.activeWindow = null;
        wsm.currentDesktop = wsm.desktops[0];
        wsm.activeWindow = ctx.w; // KWin restores the last active window of the desktop
        return { focus: ctx.w };
    });

    register("desktop away and back with a key", ctx => {
        const wsm = ctx.workspaceMock;
        press(ctx, "desktop-next");
        wsm.activeWindow = null;
        press(ctx, "desktop-previous");
        wsm.activeWindow = ctx.w;
        return { focus: ctx.w };
    });

    register("window moved to the next desktop and back with keys", ctx => {
        const wsm = ctx.workspaceMock;
        press(ctx, "window-move-to-next-desktop");
        const other = Workspace.activeWindow;
        check(ctx, "window left to the next desktop: another window has the focus", other === null ? [] : [{ focus: other as MockKwinClient }]);
        press(ctx, "desktop-next");
        wsm.activeWindow = ctx.w;
        return { focus: ctx.w, desktop: wsm.desktops[1] };
    });

    // ---- minimize ------------------------------------------------------------------------------------------------------

    register("minimize and restore", ctx => {
        ctx.w.minimized = true;
        ctx.w.minimized = false;
        ctx.workspaceMock.activeWindow = ctx.w; // restoring activates it
        return { focus: ctx.w, place: "tiledOrFloating" };
    });

    register("minimize a neighbour and restore it", ctx => {
        const n = ctx.clients[3];
        n.minimized = true;
        check(ctx, "neighbour minimized", [{ focus: ctx.w }]);
        n.minimized = false;
        return { focus: ctx.w };
    });

    // ---- other windows ------------------------------------------------------------------------------------------------

    register("close a neighbour (left, right)", ctx => {
        closeNeighbour(ctx, ctx.clients[3]);
        check(ctx, "right neighbour closed", [{ focus: ctx.w }]);
        closeNeighbour(ctx, ctx.clients[1]);
        return { focus: ctx.w };
    });

    register("open a window that is not activated", ctx => {
        const wsm = ctx.workspaceMock;
        const n = new MockKwinClient(new MockQmlRect(5, 5, 300, 300));
        wsm.windows.push(n);
        wsm.stackingOrder.push(n);
        wsm.windowAdded.fire(n);
        return { focus: ctx.w };
    });

    register("open a window that is activated", ctx => {
        const wsm = ctx.workspaceMock;
        const n = new MockKwinClient(new MockQmlRect(5, 5, 300, 300));
        wsm.windows.push(n);
        wsm.stackingOrder.push(n);
        wsm.windowAdded.fire(n);
        wsm.activeWindow = n;
        return { focus: n, place: "tiledOrFloating" };
    });

    register("dialog opens and closes", ctx => {
        const wsm = ctx.workspaceMock;
        const dialog = new MockKwinClient(new MockQmlRect(100, 100, 200, 150), ctx.w);
        wsm.windows.push(dialog);
        wsm.stackingOrder.push(dialog);
        wsm.windowAdded.fire(dialog);
        wsm.activeWindow = dialog;
        check(ctx, "dialog open", [{ focus: dialog }]);
        wsm.windows.splice(wsm.windows.indexOf(dialog), 1);
        wsm.activeWindow = ctx.w; // KWin gives the focus back to the parent
        wsm.windowRemoved.fire(dialog);
        return { focus: ctx.w };
    });

    register("dialog opens, parent moves, dialog closes", ctx => {
        const wsm = ctx.workspaceMock;
        const dialog = new MockKwinClient(new MockQmlRect(100, 100, 200, 150), ctx.w);
        wsm.windows.push(dialog);
        wsm.stackingOrder.push(dialog);
        wsm.windowAdded.fire(dialog);
        wsm.activeWindow = dialog;
        press(ctx, "window-move-right"); // the focus is on the dialog: nothing of the grid moves, or its parent does
        wsm.activeWindow = ctx.w;
        wsm.windows.splice(wsm.windows.indexOf(dialog), 1);
        wsm.windowRemoved.fire(dialog);
        return { focus: ctx.w };
    });

    register("overview key twice", ctx => {
        press(ctx, "overview");
        press(ctx, "overview");
        return { focus: ctx.w };
    });

    register("screen changes", ctx => {
        ctx.workspaceMock.screensChanged.fire();
        ctx.workspaceMock.virtualScreenSizeChanged.fire();
        MockQmlTimer.flush();
        return { focus: ctx.w };
    });

    register("script reload", ctx => {
        const layout = ctx.world.captureLayout();
        const keyBindings = ctx.world.releaseKeyBindings();
        ctx.world.destroy();
        ctx.world = new World(ctx.config, keyBindings, layout);
        return { focus: ctx.w, place: "tiledOrFloating" };
    });

    register("script reload while fullscreen", ctx => {
        ctx.w.fullScreen = true;
        const layout = ctx.world.captureLayout();
        const keyBindings = ctx.world.releaseKeyBindings();
        ctx.world.destroy();
        ctx.world = new World(ctx.config, keyBindings, layout);
        check(ctx, "reload while fullscreen", [{ focus: ctx.w }]);
        ctx.w.fullScreen = false;
        return { focus: ctx.w };
    });

    // ---- the pointer: windows moving under a resting pointer must not take the focus --------------------------------------

    register("pointer rests while the grid moves under it", ctx => {
        for (const key of ["window-move-right", "window-move-left", "column-width-increase", "window-toggle-floating", "window-toggle-floating"]) {
            press(ctx, key);
        }
        ctx.w.fullScreen = true;
        ctx.w.fullScreen = false;
        return { focus: ctx.w };
    });

    // ---- the runner --------------------------------------------------------------------------------------------------------

    tests.register("Focus stays on the focused window through every action and setting", 1, () => {
        const variants = makeVariants();
        for (const action of actions) {
            for (const variant of variants) {
                variant.extras = { tabbedColumnsByDefault: coin(), untileOnDrag: coin(), dropToTile: coin(), reMaximize: coin(), dynamicDesktops: coin() };
                const ctx = setup(variant);
                try {
                    const result = action.run(ctx);
                    const expects = Array.isArray(result) ? result : [result];
                    check(ctx, action.name, expects);
                } catch (error: any) {
                    const key = `${action.name}: threw ${String(error.message).slice(0, 60)}`;
                    const entry = failures.get(key);
                    if (entry === undefined) {
                        failures.set(key, { count: 1, first: `${error.stack} @ ${variantName(variant)}` });
                    } else {
                        entry.count++;
                    }
                } finally {
                    cleanup(ctx);
                }
            }
        }
        if (failures.size > 0) {
            for (const [key, entry] of failures) {
                console.log(`FAIL x${entry.count}  ${key}\n      e.g. ${entry.first}`);
            }
        }
        Assert.assert(failures.size === 0, { message: `${failures.size} focus problems, see above` });
    });

    // The focus ring and the borders (package/contents/ui/Ring.qml and the kiri_decorations effect) are hidden while
    // the window's frame covers its whole output, like niri's full-screen and maximize-window-to-edges, and are back
    // when it shrinks. Both go by the frame geometry, which has to be exact in every state, with and without title bars.
    tests.register("Ring rule: maximized and full-screen frames cover the screen, windowed ones do not", 5, () => {
        const covers = (client: MockKwinClient) => {
            const frame = client.getActualFrameGeometry();
            return frame.width >= screen.width - 0.5 && frame.height >= screen.height - 0.5;
        };
        for (const hideTitlebars of [false, true]) {
            for (const tileFullScreen of [false, true]) {
                for (const tileMaximized of [false, true]) {
                    const variant = makeVariants().find(v => v.hideTitlebars === hideTitlebars && v.tileFullScreen === tileFullScreen && v.tileMaximized === tileMaximized && v.scroll === "lazy" && !v.ffm && !v.cursorFollowsFocus)!;
                    const ctx = setup(variant);
                    const w = ctx.w;
                    const before = w.getActualFrameGeometry();
                    const message = `titlebars=${hideTitlebars} tileFS=${tileFullScreen} tileMax=${tileMaximized}`;
                    Assert.assert(!covers(w), { message: "windowed " + message });
                    press(ctx, "window-maximize-to-edges");
                    Assert.assert(covers(w), { message: "maximized " + message });
                    Assert.equal(Workspace.activeWindow, w);
                    press(ctx, "window-maximize-to-edges");
                    Assert.assert(!covers(w), { message: "unmaximized " + message });
                    w.fullScreen = true;
                    Assert.assert(covers(w), { message: "full-screen " + message });
                    Assert.equal(Workspace.activeWindow, w);
                    w.fullScreen = false;
                    Assert.assert(!covers(w), { message: "windowed again " + message });
                    Assert.assert(before.width === w.getActualFrameGeometry().width && before.height === w.getActualFrameGeometry().height, { message: "same size again " + message });
                    // the title bar going away and coming back with the floating toggle moves neither the focus nor the window out of its slot
                    press(ctx, "window-toggle-floating");
                    Assert.equal(Workspace.activeWindow, w, { message: message });
                    press(ctx, "window-toggle-floating");
                    Assert.equal(Workspace.activeWindow, w, { message: message });
                    Assert.equal(w.getActualFrameGeometry().height, before.height, { message: "slot height again " + message });
                    cleanup(ctx);
                }
            }
        }
    });
}
