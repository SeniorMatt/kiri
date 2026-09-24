tests.register("Focus keys do not leave the floating layer (niri); the switch key does", 6, () => {
    for (const key of ["focus-left", "focus-right", "focus-up", "focus-down", "focus-next", "focus-previous"]) {
        const { qtMock, workspaceMock } = init(getDefaultConfig());
        const [a, b, game] = workspaceMock.createClients(3);
        workspaceMock.activeWindow = game;
        qtMock.fireShortcut("window-toggle-floating");
        workspaceMock.activeWindow = b;
        workspaceMock.activeWindow = game;
        qtMock.fireShortcut(key);
        Assert.equal(workspaceMock.activeWindow, game, { message: key });
        qtMock.fireShortcut("window-switch-focus-floating-tiling");
        Assert.equal(workspaceMock.activeWindow, b, { message: key });
    }
});

tests.register("Full-screen window that cannot be resized is tiled once it is full-screen", 1, () => {
    const { qtMock, workspaceMock } = init(getDefaultConfig());
    const [a] = workspaceMock.createClients(1);
    const game = new MockKwinClient(new MockQmlRect(100, 100, 400, 300));
    game.fixedSize = true;
    workspaceMock.createWindows(game);
    // not tileable while it is a fixed-size window: like any floating window, only the switch key leads out of it
    qtMock.fireShortcut("focus-left");
    Assert.equal(workspaceMock.activeWindow, game);
    qtMock.fireShortcut("window-switch-focus-floating-tiling");
    Assert.equal(workspaceMock.activeWindow, a);

    workspaceMock.activeWindow = game;
    game.fullScreen = true;
    workspaceMock.activeWindow = a;
    qtMock.fireShortcut("focus-right");
    Assert.equal(workspaceMock.activeWindow, game);
    qtMock.fireShortcut("focus-left");
    Assert.equal(workspaceMock.activeWindow, a);
});

tests.register("Window with full-screen geometry but no full-screen flag is tiled", 1, () => {
    const { qtMock, workspaceMock } = init(getDefaultConfig());
    const [a] = workspaceMock.createClients(1);
    const game = new MockKwinClient(screen.clone());
    workspaceMock.createWindows(game);
    workspaceMock.activeWindow = a;
    qtMock.fireShortcut("focus-right");
    Assert.equal(workspaceMock.activeWindow, game);
});

tests.register("A window on two desktops for a moment is tiled again afterwards", 2, () => {
    const { workspaceMock, world } = init(getDefaultConfig());
    const [client] = workspaceMock.createClients(1);
    const desktop = client.desktops[0];
    const other = workspaceMock.desktops.find(d => d !== desktop)!;
    MockQmlTimer.deferred = true;
    try {
        client.desktops = [desktop, other]; // the Pager drags the window to another desktop
        world.do(clientManager => Assert.notTiledClient(clientManager, client));
        client.desktops = [other];
        world.do(clientManager => Assert.notTiledClient(clientManager, client)); // debounced
        MockQmlTimer.flush();
        world.do(clientManager => Assert.tiledClient(clientManager, client));
    } finally {
        MockQmlTimer.deferred = false;
    }
});
