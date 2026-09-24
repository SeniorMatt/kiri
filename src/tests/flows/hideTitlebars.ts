tests.register("Tiled windows lose their title bar and get it back (hideTitlebars)", 20, () => {
    const config = getDefaultConfig();
    config.hideTitlebars = true;
    config.tileFullScreen = true;
    const { qtMock, workspaceMock, world } = init(config);
    const [a, b] = workspaceMock.createClients(2);
    Assert.equal(a.noBorder, true);
    Assert.equal(b.noBorder, true);
    // frame == client area: the tiled sizes are exact
    Assert.equalRects(roundQtRect(a.clientGeometry), a.getActualFrameGeometry());
    Assert.equalRects(roundQtRect(b.clientGeometry), b.getActualFrameGeometry());
    Assert.equal(a.getActualFrameGeometry().y, tilingArea.y);
    Assert.equal(a.getActualFrameGeometry().height, tilingArea.height);

    // floating restores the window's own value
    workspaceMock.activeWindow = b;
    qtMock.fireShortcut("window-toggle-floating");
    Assert.equal(b.noBorder, false);
    Assert.equal(a.noBorder, true);
    qtMock.fireShortcut("window-toggle-floating");
    Assert.equal(b.noBorder, true);

    // full-screen: KWin ignores noBorder meanwhile, so it is set again afterwards
    workspaceMock.activeWindow = a;
    a.fullScreen = true;
    a.fullScreen = false;
    Assert.equal(a.noBorder, true);
    Assert.equalRects(roundQtRect(a.clientGeometry), a.getActualFrameGeometry());

    // a window that was full-screen when it was tiled
    const game = new MockKwinClient(new MockQmlRect(0, 0, 300, 300));
    game.fullScreen = true;
    workspaceMock.createWindows(game);
    game.fullScreen = false;
    Assert.equal(game.noBorder, true);

    // the script stopping gives every window its own value back
    world.destroy();
    for (const client of [a, b, game]) {
        Assert.equal(client.noBorder, false);
    }
});

tests.register("A window's own noBorder value is restored", 1, () => {
    const config = getDefaultConfig();
    config.hideTitlebars = true;
    const { qtMock, workspaceMock } = init(config);
    const borderless = new MockKwinClient(new MockQmlRect(0, 0, 200, 200));
    borderless.noBorder = true;
    workspaceMock.createWindows(borderless);
    workspaceMock.activeWindow = borderless;
    qtMock.fireShortcut("window-toggle-floating");
    Assert.equal(borderless.noBorder, true);
});

tests.register("hideTitlebars off leaves the title bars alone", 1, () => {
    const config = getDefaultConfig();
    config.hideTitlebars = false;
    const { workspaceMock } = init(config);
    const [a] = workspaceMock.createClients(1);
    Assert.equal(a.noBorder, false);
});

tests.register("Without title bars, a window that leaves full-screen mode goes back to its slot", 100, () => {
    for (const startFullScreen of [true, false]) {
        const config = getDefaultConfig();
        config.hideTitlebars = true;
        config.tileFullScreen = true;
        const { workspaceMock } = init(config);
        const [a] = workspaceMock.createClients(1);
        const game = new MockKwinClient(new MockQmlRect(100, 100, 300, 300));
        if (startFullScreen) {
            game.fullScreen = true;
        }
        workspaceMock.createWindows(game);
        if (!startFullScreen) {
            game.fullScreen = true;
        }
        Assert.equalRects(game.getActualFrameGeometry(), screen);
        game.fullScreen = false;
        const fa = a.getActualFrameGeometry();
        const fg = game.getActualFrameGeometry();
        Assert.assert(fg.x >= rectRight(fa), { message: `startFullScreen=${startFullScreen}: not back in the grid` });
        Assert.equal(fg.height, tilingArea.height);
        Assert.equal(game.noBorder, true);
    }
});
