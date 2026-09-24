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
