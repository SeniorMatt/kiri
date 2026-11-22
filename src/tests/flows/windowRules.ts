function createClassClient(resourceClass: string, frame = new MockQmlRect(50, 50, 200, 200)) {
    const client = new MockKwinClient(frame);
    client.resourceClass = resourceClass;
    return client;
}

tests.register("open-fullscreen rule", 5, () => {
    const config = getDefaultConfig();
    config.tileFullScreen = true;
    config.windowRules = '[{ "class": "fl64\\\\.exe", "fullscreen": true }]';
    const { workspaceMock, world } = init(config);
    const [other] = workspaceMock.createClients(1);
    const game = createClassClient("fl64.exe");
    workspaceMock.createWindows(game);
    Assert.equal(game.fullScreen, true);
    Assert.equal(other.fullScreen, false);
    Assert.equalRects(game.getActualFrameGeometry(), screen);
    world.do((clientManager, desktopManager) => {
        Assert.tiledClient(clientManager, game);
    });
    workspaceMock.createWindows(createClassClient("other"));
    Assert.equal(other.fullScreen, false);
});

tests.register("A later rule can turn open-fullscreen off", 1, () => {
    const config = getDefaultConfig();
    config.windowRules = '[{ "class": "game", "fullscreen": true }, { "class": "game", "caption": "Launcher", "fullscreen": false }]';
    const { workspaceMock } = init(config);
    const launcher = createClassClient("game");
    launcher.caption = "Launcher";
    workspaceMock.createWindows(launcher);
    Assert.equal(launcher.fullScreen, false);
});

tests.register("Float rule sizes and centers a new window (default-window-height, default-column-width)", 3, () => {
    const config = getDefaultConfig();
    config.windowRules = '[{ "class": "settings", "tile": false, "width": "600px", "height": "50%" }, { "class": "plain", "tile": false }]';
    const { workspaceMock, world } = init(config);
    const settings = createClassClient("settings", new MockQmlRect(5, 5, 100, 100));
    workspaceMock.createWindows(settings);
    world.do((clientManager, desktopManager) => {
        Assert.notTiledClient(clientManager, settings);
    });
    Assert.equalRects(settings.getActualFrameGeometry(), new MockQmlRect(100, 150, 600, 300));

    // without a size the window keeps its own and is centered
    const plain = createClassClient("plain", new MockQmlRect(5, 5, 200, 100));
    workspaceMock.createWindows(plain);
    Assert.equalRects(plain.getActualFrameGeometry(), new MockQmlRect(300, 250, 200, 100));

    // a window larger than the work area keeps its top-left corner
    config.windowRules = '[{ "class": "huge", "tile": false, "width": "1000px" }]';
    const second = init(config);
    const hugeClient = createClassClient("huge", new MockQmlRect(5, 5, 100, 100));
    second.workspaceMock.createWindows(hugeClient);
    Assert.equal(hugeClient.getActualFrameGeometry().x, 0);
    Assert.equal(hugeClient.getActualFrameGeometry().width, 1000);
});

tests.register("Plasma's own windows keep the place plasmashell gives them", 3, () => {
    const { workspaceMock, world } = init(getDefaultConfig());
    for (const resourceClass of ["org.kde.plasmashell", "plasmashell", "krunner", "org.kde.krunner"]) {
        const frame = new MockQmlRect(1200, 700, 300, 90); // a notification at the bottom right
        const client = createClassClient(resourceClass, frame);
        workspaceMock.createWindows(client);
        world.do((clientManager, desktopManager) => {
            Assert.notTiledClient(clientManager, client);
        });
        Assert.equalRects(client.getActualFrameGeometry(), frame);
    }
});

tests.register("default-window-height for a tiled window", 3, () => {
    const config = getDefaultConfig();
    config.windowRules = '[{ "class": "short", "height": "50%" }]';
    const { workspaceMock } = init(config);
    const short = createClassClient("short");
    workspaceMock.createWindows(short);
    Assert.equal(short.getActualFrameGeometry().height, Math.floor((tilingArea.height + gapV) * 0.5 - gapV));
    const normal = createClassClient("normal");
    workspaceMock.createWindows(normal);
    Assert.equal(normal.getActualFrameGeometry().height, tilingArea.height);
});

tests.register("center-window centers a floating window like niri", 3, () => {
    const { qtMock, workspaceMock } = init(getDefaultConfig());
    const [tiled, floating] = workspaceMock.createClientsWithFrames(new MockQmlRect(0, 0, 100, 100), new MockQmlRect(10, 10, 200, 100));
    workspaceMock.activeWindow = floating;
    qtMock.fireShortcut("window-toggle-floating");
    workspaceMock.activeWindow = floating;
    qtMock.fireShortcut("grid-scroll-focused");
    const frame = floating.getActualFrameGeometry();
    Assert.equal(frame.width, 200);
    Assert.equal(frame.x, 300);
    Assert.equal(frame.y, Math.round((screen.height - frame.height) / 2));
});

tests.register("A rule on resourceName matches", 3, () => {
    const config = getDefaultConfig();
    config.windowRules = '[{ "class": "konsolefloat", "tile": false }]';
    const { workspaceMock, world } = init(config);
    const client = createClassClient("konsole");
    client.resourceName = "konsolefloat";
    const normal = createClassClient("konsole");
    normal.resourceName = "konsole";
    workspaceMock.createWindows(client, normal);
    world.do((clientManager, desktopManager) => {
        Assert.notTiledClient(clientManager, client);
        Assert.tiledClient(clientManager, normal);
    });
    Assert.equal(client.resourceClass, "konsole");
});

tests.register("A caption change keeps a manual float toggle", 3, () => {
    const config = getDefaultConfig();
    config.windowRules = '[{ "class": "browser", "caption": "Video", "tile": false }]';
    const { qtMock, workspaceMock, world } = init(config);
    const client = createClassClient("browser");
    workspaceMock.createWindows(client);
    workspaceMock.activeWindow = client;
    qtMock.fireShortcut("window-toggle-floating");
    world.do(clientManager => Assert.notTiledClient(clientManager, client));
    client.caption = "Other page";
    client.captionChanged.fire();
    world.do(clientManager => Assert.notTiledClient(clientManager, client));

    // a window that was not toggled still follows its caption rule
    const second = createClassClient("browser");
    workspaceMock.createWindows(second);
    second.caption = "Video";
    second.captionChanged.fire();
    world.do(clientManager => Assert.notTiledClient(clientManager, second));
    second.caption = "Home";
    second.captionChanged.fire();
    world.do(clientManager => Assert.tiledClient(clientManager, second));
});

// like KWin: the new window is activated before the script hears that it was added
function openWindow(client: MockKwinClient) {
    Workspace.windows.push(client);
    Workspace.activeWindow = client;
    (Workspace as MockWorkspace).windowAdded.fire(client);
    return client;
}

function windowOf(world: World, client: MockKwinClient) {
    let window: Window|null = null;
    world.do(clientManager => { window = clientManager.findTiledWindow(client); });
    return window as Window|null;
}

tests.register("open-maximized: the column opens at the full width, maximize-column goes back to the default", 4, () => {
    const config = getDefaultConfig();
    config.windowRules = '[{ "appId": "big", "maximized": true, "width": "25%" }]';
    const { qtMock, workspaceMock } = init(config);
    const other = createClassClient("other");
    workspaceMock.createWindows(other);
    const big = createClassClient("big");
    workspaceMock.createWindows(big);
    Assert.equal(big.getActualFrameGeometry().width, tilingArea.width);
    Assert.equal(other.getActualFrameGeometry().width, 200);
    workspaceMock.activeWindow = big;
    qtMock.fireShortcut("column-width-maximize");
    Assert.equal(big.getActualFrameGeometry().width, Math.floor((tilingArea.width + gapH) * 0.25 - gapH));
});

tests.register("open-maximized-to-edges maximizes the new window", 2, () => {
    const config = getDefaultConfig();
    config.windowRules = '[{ "appId": "edge", "maximizedToEdges": true }]';
    const { workspaceMock } = init(config);
    const edge = createClassClient("edge");
    workspaceMock.createWindows(edge);
    Assert.equal(edge.maximizedVertically && edge.maximizedHorizontally, true);
    const plain = createClassClient("plain");
    workspaceMock.createWindows(plain);
    Assert.equal(plain.maximizedVertically || plain.maximizedHorizontally, false);
});

tests.register("open-focused false keeps the focus where it was, true takes it", 4, () => {
    const config = getDefaultConfig();
    config.windowRules = '[{ "appId": "quiet", "focused": false }, { "appId": "loud", "focused": true }]';
    const { workspaceMock, world } = init(config);
    const [first] = workspaceMock.createClients(1);
    workspaceMock.activeWindow = first;
    const quiet = openWindow(createClassClient("quiet"));
    Assert.equal(Workspace.activeWindow, first);
    world.do(clientManager => Assert.tiledClient(clientManager, quiet));
    // the view stays where it was: the focused window is fully visible
    Assert.fullyVisible(first.getActualFrameGeometry());
    // a window without the rule takes the focus as always
    const normal = openWindow(createClassClient("normal"));
    Assert.equal(Workspace.activeWindow, normal);
    // open-focused true also when the window did not get the focus from KWin
    const loud = createClassClient("loud");
    workspaceMock.windows.push(loud);
    workspaceMock.windowAdded.fire(loud);
    Assert.equal(Workspace.activeWindow, loud);
});

tests.register("open-on-workspace puts the window on the desktop with that name and leaves the focus", 6, () => {
    const config = getDefaultConfig();
    config.windowRules = '[{ "appId": "chat", "workspace": "Desktop 2" }, { "appId": "mail", "workspace": "Desktop 2", "focused": true }, { "appId": "ghost", "workspace": "nowhere" }]';
    const { workspaceMock, world } = init(config);
    const [first] = workspaceMock.createClients(1);
    workspaceMock.activeWindow = first;
    const chat = openWindow(createClassClient("chat"));
    Assert.equal(chat.desktops.length, 1);
    Assert.equal(chat.desktops[0].name, "Desktop 2");
    Assert.equal(Workspace.activeWindow, first);
    world.do(clientManager => Assert.tiledClient(clientManager, chat));
    const mail = openWindow(createClassClient("mail"));
    Assert.equal(mail.desktops[0].name, "Desktop 2");
    Assert.equal(Workspace.activeWindow, mail);
    // a name that no desktop has: the window stays where it opened
    const ghost = openWindow(createClassClient("ghost"));
    Assert.equal(ghost.desktops[0].name, "Desktop 1");
});

tests.register("open-on-workspace finds a named desktop, the named one first", 3, () => {
    const config = getDefaultConfig();
    config.windowRules = '[{ "appId": "web", "workspace": "web" }]';
    const { workspaceMock } = init(config);
    workspaceMock.desktops[1].name = "web";
    const web = openWindow(createClassClient("web"));
    Assert.equal(web.desktops[0], workspaceMock.desktops[1]);
    const other = openWindow(createClassClient("other"));
    Assert.equal(other.desktops[0], workspaceMock.desktops[0]);
    Assert.equal(workspaceMock.desktops.length, 2);
});

tests.register("default-column-display opens a new column tabbed", 3, () => {
    const config = getDefaultConfig();
    config.windowRules = '[{ "appId": "tabs", "columnDisplay": "tabbed" }, { "appId": "plain", "columnDisplay": "normal" }]';
    const { workspaceMock, world } = init(config);
    const tabs = createClassClient("tabs");
    workspaceMock.createWindows(tabs);
    Assert.equal(windowOf(world, tabs)!.column.isTabbed(), true);
    const plain = createClassClient("plain");
    workspaceMock.createWindows(plain);
    Assert.equal(windowOf(world, plain)!.column.isTabbed(), false);
    const other = createClassClient("other");
    workspaceMock.createWindows(other);
    Assert.equal(windowOf(world, other)!.column.isTabbed(), false);
});

tests.register("default-floating-position places a floating window like niri", 4, () => {
    const config = getDefaultConfig();
    config.windowRules = JSON.stringify([
        { appId: "a", tile: false, width: "200px", height: "100px", floatingPosition: { x: 10, y: 20 } },
        { appId: "b", tile: false, width: "200px", height: "100px", floatingPosition: { x: 10, y: 20, relativeTo: "bottom-right" } },
        { appId: "c", tile: false, width: "200px", height: "100px", floatingPosition: { x: 10, y: 20, relativeTo: "top" } },
        { appId: "d", tile: false, width: "200px", height: "100px", floatingPosition: { x: 10, y: 20, relativeTo: "left" } },
    ]);
    const { workspaceMock } = init(config);
    const place = (name: string) => {
        const client = createClassClient(name, new MockQmlRect(1, 1, 50, 50));
        workspaceMock.createWindows(client);
        return client.getActualFrameGeometry();
    };
    Assert.equalRects(place("a"), new MockQmlRect(10, 20, 200, 100));
    Assert.equalRects(place("b"), new MockQmlRect(800 - 200 - 10, 600 - 100 - 20, 200, 100));
    Assert.equalRects(place("c"), new MockQmlRect(10 + 300, 20, 200, 100));
    Assert.equalRects(place("d"), new MockQmlRect(10, 20 + 250, 200, 100));
});

tests.register("min-width and max-width rules limit a tiled column", 4, () => {
    const config = getDefaultConfig();
    config.windowRules = JSON.stringify([
        { appId: "wide", width: "100px", minWidth: 300 },
        { appId: "narrow", width: "600px", maxWidth: 350 },
    ]);
    const { qtMock, workspaceMock } = init(config);
    const wide = createClassClient("wide");
    wide.minSize = new MockQmlSize(0, 0);
    workspaceMock.createWindows(wide);
    Assert.equal(wide.getActualFrameGeometry().width, 300);
    const narrow = createClassClient("narrow");
    narrow.minSize = new MockQmlSize(0, 0);
    workspaceMock.createWindows(narrow);
    Assert.equal(narrow.getActualFrameGeometry().width, 350);
    // the limits hold for the width keys too
    workspaceMock.activeWindow = narrow;
    qtMock.fireShortcut("column-width-maximize");
    Assert.equal(narrow.getActualFrameGeometry().width, 350);
    workspaceMock.activeWindow = wide;
    qtMock.fireShortcut("column-width-minimize");
    Assert.equal(wide.getActualFrameGeometry().width >= 300, true);
});

tests.register("A fixed-height window floats, a rule can tile it, min and max height rules keep its height", 5, () => {
    const config = getDefaultConfig();
    config.windowRules = '[{ "appId": "short", "tile": true, "maxHeight": 250, "minHeight": 250 }, { "appId": "pinned", "maxHeight": 200, "minHeight": 200 }]';
    const { qtMock, workspaceMock, world } = init(config);
    const short = createClassClient("short");
    short.minSize = new MockQmlSize(0, 0);
    workspaceMock.createWindows(short);
    world.do(clientManager => Assert.tiledClient(clientManager, short));
    Assert.equal(short.getActualFrameGeometry().height, 250);
    const below = createClassClient("below");
    below.minSize = new MockQmlSize(0, 0);
    workspaceMock.createWindows(below);
    workspaceMock.activeWindow = below;
    qtMock.fireShortcut("window-consume-or-expel-left");
    Assert.equal(short.getActualFrameGeometry().height, 250);
    Assert.equal(below.getActualFrameGeometry().height, tilingArea.height - 250 - gapV);
    // min and max height of the same size from rules make a window fixed in height: it floats like in niri
    const pinned = createClassClient("pinned");
    pinned.minSize = new MockQmlSize(0, 0);
    workspaceMock.createWindows(pinned);
    world.do(clientManager => Assert.notTiledClient(clientManager, pinned));
    // a window the client itself fixes in height floats too, though its width could change
    const fixed = createClassClient("fixedheight");
    fixed.minSize = new MockQmlSize(100, 300);
    fixed.maxSize = new MockQmlSize(9999, 300);
    workspaceMock.createWindows(fixed);
    world.do(clientManager => Assert.notTiledClient(clientManager, fixed));
});

tests.register("A floating window opens within the limits of min and max rules", 2, () => {
    const config = getDefaultConfig();
    config.windowRules = '[{ "appId": "pop", "tile": false, "width": "100px", "height": "900px", "minWidth": 300, "maxHeight": 400 }]';
    const { workspaceMock } = init(config);
    const pop = createClassClient("pop", new MockQmlRect(5, 5, 50, 50));
    pop.minSize = new MockQmlSize(0, 0);
    workspaceMock.createWindows(pop);
    Assert.equal(pop.getActualFrameGeometry().width, 300);
    Assert.equal(pop.getActualFrameGeometry().height, 400);
});

tests.register("opacity rule, and toggle-window-rule-opacity switches it off for the focused window", 6, () => {
    const config = getDefaultConfig();
    config.windowRules = '[{ "appId": "glass", "opacity": 0.5 }]';
    const { qtMock, workspaceMock } = init(config);
    const glass = createClassClient("glass");
    const solid = createClassClient("solid");
    workspaceMock.createWindows(glass, solid);
    Assert.equal(glass.opacity, 0.5);
    Assert.equal(solid.opacity, 1);
    workspaceMock.activeWindow = glass;
    qtMock.fireShortcut("window-toggle-rule-opacity");
    Assert.equal(glass.opacity, 1);
    qtMock.fireShortcut("window-toggle-rule-opacity");
    Assert.equal(glass.opacity, 0.5);
    workspaceMock.activeWindow = solid;
    qtMock.fireShortcut("window-toggle-rule-opacity");
    Assert.equal(solid.opacity, 1);
    Assert.equal(glass.opacity, 0.5);
});

tests.register("The rule opacity combines with the off-screen opacity", 2, () => {
    const config = getDefaultConfig();
    config.offScreenOpacity = 50;
    config.windowRules = '[{ "appId": "glass", "opacity": 0.5 }]';
    const { workspaceMock } = init(config);
    const glass = createClassClient("glass");
    workspaceMock.createWindows(glass);
    Assert.equal(glass.opacity, 0.5);
    workspaceMock.createClients(6); // glass scrolls out of view
    Assert.equal(glass.opacity, 0.25);
});

tests.register("Rules with dynamic matchers are evaluated again when the state changes", 8, () => {
    const config = getDefaultConfig();
    config.windowRules = JSON.stringify([
        { opacity: 0.9, isFocused: false },
        { opacity: 0.4, isUrgent: true },
        { appId: "app", title: "Mail", opacity: 0.6 },
    ]);
    const { workspaceMock } = init(config);
    const [a, b] = workspaceMock.createClients(2);
    workspaceMock.activeWindow = a;
    Assert.equal(a.opacity, 1);
    Assert.equal(b.opacity, 0.9);
    workspaceMock.activeWindow = b;
    Assert.equal(a.opacity, 0.9);
    Assert.equal(b.opacity, 1);
    // urgency (KWin's demandsAttention)
    a.demandsAttention = true;
    a.demandsAttentionChanged.fire();
    Assert.equal(a.opacity, 0.4);
    a.demandsAttention = false;
    a.demandsAttentionChanged.fire();
    Assert.equal(a.opacity, 0.9);
    // a title change
    const app = createClassClient("app");
    workspaceMock.createWindows(app);
    Assert.equal(app.opacity, 1);
    workspaceMock.activeWindow = b;
    app.caption = "Mail - inbox";
    app.captionChanged.fire();
    Assert.equal(app.opacity, 0.6);
});

tests.register("is-active-in-column: the rule holds for the windows of a column that are not its active one", 3, () => {
    const config = getDefaultConfig();
    config.windowRules = '[{ "maxWidth": 150, "isActiveInColumn": false }]';
    const { qtMock, workspaceMock, world } = init(config);
    const [a, b] = workspaceMock.createClientsWithWidths(400, 400);
    workspaceMock.activeWindow = b;
    qtMock.fireShortcut("window-consume-or-expel-left");
    Assert.equal(windowOf(world, a)!.column, windowOf(world, b)!.column);
    Assert.equal(a.getActualFrameGeometry().width, 150); // b is the active one of the column, a is limited
    workspaceMock.activeWindow = a;
    Assert.equal(b.getActualFrameGeometry().width, 150); // now b is limited
});

tests.register("at-startup rules apply for the first 60 seconds", 4, () => {
    const config = getDefaultConfig();
    config.windowRules = '[{ "appId": "early", "atStartup": true, "opacity": 0.5 }]';
    const realNow = Date.now;
    try {
        Date.now = () => kiriStartedAt + 1000;
        const { workspaceMock, world } = init(config);
        const early = createClassClient("early");
        workspaceMock.createWindows(early);
        Assert.equal(early.opacity, 0.5);
        Date.now = () => kiriStartedAt + 61000;
        world.do(() => {}); // niri evaluates the rules again when the 60 s are over
        Assert.equal(early.opacity, 1);
        const late = createClassClient("early");
        workspaceMock.createWindows(late);
        Assert.equal(late.opacity, 1);
        Assert.equal(early.opacity, 1);
    } finally {
        Date.now = realNow;
    }
});

tests.register("The look rules go to the effect per window", 7, () => {
    const config = getDefaultConfig();
    config.windowRules = JSON.stringify([
        { appId: "round", cornerRadius: 12, shadow: { enabled: true, softness: 40, color: "#00000064" }, border: { activeGradient: "from=#f00 to=#00f angle=45" } },
        { appId: "round", border: { activeColor: "#ff0000", width: 6 } }, // a colour replaces a gradient of an earlier rule
        { appId: "round", title: "Active", focusRing: { activeColor: "#ff0000" } },
    ]);
    const { workspaceMock } = init(config);
    const round = createClassClient("round");
    const plain = createClassClient("plain");
    workspaceMock.createWindows(round, plain);
    const id = String(round.internalId);
    const rule = windowDecorations.get(id)!;
    Assert.equal(rule.cornerRadius, 12);
    Assert.equal(rule.shadow!.softness, 40);
    Assert.equal(rule.border!.width, 6);
    Assert.equal(rule.border!.activeColor, "#ff0000");
    Assert.equal(rule.border!.activeGradient, undefined);
    Assert.equal(rule.focusRing, undefined);
    Assert.equal(windowDecorations.get(String(plain.internalId)), undefined);
    round.caption = "Active window";
    round.captionChanged.fire();
    Assert.equal(windowDecorations.get(id)!.focusRing!.activeColor, "#ff0000");
    workspaceMock.windows.splice(workspaceMock.windows.indexOf(round), 1);
    workspaceMock.windowRemoved.fire(round);
    Assert.equal(windowDecorations.get(id), undefined);
});

tests.register("A dialog with a parent floats, open-floating false tiles it", 2, () => {
    const config = getDefaultConfig();
    config.windowRules = '[{ "appId": "forcetile", "tile": true }]';
    const { workspaceMock, world } = init(config);
    const [parent] = workspaceMock.createClients(1);
    const dialog = new MockKwinClient(new MockQmlRect(10, 10, 200, 100), parent);
    workspaceMock.createWindows(dialog);
    world.do(clientManager => Assert.equal(clientManager.isFloating(dialog), true));
    const forced = new MockKwinClient(new MockQmlRect(10, 10, 200, 100), parent);
    forced.resourceClass = "forcetile";
    workspaceMock.createWindows(forced);
    world.do(clientManager => Assert.equal(clientManager.isFloating(forced), false));
});
// issue 62 (niri's min-width, max-width, min-height and max-height rules)
tests.register("min/max size rules force the dimensions of a window", 3, () => {
    const config = getDefaultConfig();
    config.windowRules = '[{ "appId": "forced", "tile": true, "minWidth": 400, "maxWidth": 400, "minHeight": 300, "maxHeight": 300 }]';
    const { qtMock, workspaceMock, world } = init(config);
    const [plain] = workspaceMock.createClients(1);
    const forced = createClassClient("forced", new MockQmlRect(5, 5, 700, 500));
    workspaceMock.createWindows(forced);
    world.do(clientManager => Assert.tiledClient(clientManager, forced));

    const check = (message: string) => {
        const frame = forced.getActualFrameGeometry();
        Assert.equal(Math.round(frame.width), 400, { message: message + ": width" });
        Assert.equal(Math.round(frame.height), 300, { message: message + ": height" });
        Assert.equal(Math.round(frame.y), tilingArea.y, { message: message + ": it keeps the top of the column, the space below stays empty" });
    };
    check("at open");
    qtMock.fireShortcut("cycle-preset-widths");
    check("after a preset width");
    qtMock.fireShortcut("column-width-maximize");
    check("after maximizing the column");
    qtMock.fireShortcut("window-height-increase");
    check("after a height step");

    // the other windows are not touched
    Assert.assert(Math.round(plain.getActualFrameGeometry().height) > 300, { message: "a window without a rule has the whole height" });
});

tests.register("A max-height rule leaves the rest of the slot empty, the other windows keep theirs", 3, () => {
    const config = getDefaultConfig();
    config.windowRules = '[{ "appId": "small", "maxHeight": 150 }]';
    const { qtMock, workspaceMock } = init(config);
    const small = createClassClient("small", new MockQmlRect(5, 5, 300, 400));
    const other = createClassClient("other", new MockQmlRect(5, 5, 300, 400));
    workspaceMock.createWindows(other, small);
    workspaceMock.activeWindow = small;
    qtMock.fireShortcut("window-move-left"); // into the column of `other`: the column has two windows now
    const slot = (tilingArea.height - gapV) / 2;
    Assert.equal(Math.round(small.getActualFrameGeometry().height), 150);
    Assert.equal(Math.round(other.getActualFrameGeometry().height), Math.round(slot));
    Assert.equal(Math.round(small.getActualFrameGeometry().y), Math.round(other.getActualFrameGeometry().y + slot + gapV));
});

