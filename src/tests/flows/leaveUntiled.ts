tests.register("Focus keys leave a window that is not in the grid", 6, () => {
    for (const key of ["focus-left", "focus-right", "focus-up", "focus-down", "focus-next", "focus-previous"]) {
        const { qtMock, workspaceMock } = init(getDefaultConfig());
        const [a, b, game] = workspaceMock.createClients(3);
        workspaceMock.activeWindow = game;
        qtMock.fireShortcut("window-toggle-floating");
        workspaceMock.activeWindow = b;
        workspaceMock.activeWindow = game;
        qtMock.fireShortcut(key);
        Assert.equal(workspaceMock.activeWindow, b, { message: key });
    }
});

tests.register("Full-screen window that cannot be resized is tiled once it is full-screen", 1, () => {
    const { qtMock, workspaceMock } = init(getDefaultConfig());
    const [a] = workspaceMock.createClients(1);
    const game = new MockKwinClient(new MockQmlRect(100, 100, 400, 300));
    game.fixedSize = true;
    workspaceMock.createWindows(game);
    // not tileable while it is a fixed-size window, but the focus keys still lead out of it
    qtMock.fireShortcut("focus-left");
    Assert.equal(workspaceMock.activeWindow, a);
    qtMock.fireShortcut("focus-right");
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
