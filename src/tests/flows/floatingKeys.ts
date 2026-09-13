tests.register("Switch focus between floating and tiled", 1, () => {
    const { qtMock, workspaceMock } = init(getDefaultConfig());
    const [tiledA, tiledB, floatA, floatB] = workspaceMock.createClients(4);
    for (const client of [floatA, floatB]) {
        workspaceMock.activeWindow = client;
        qtMock.fireShortcut("window-toggle-floating");
    }

    // no floating window focused before: nothing happens when none exists on the desktop
    workspaceMock.activeWindow = floatA;
    workspaceMock.activeWindow = floatB;
    workspaceMock.activeWindow = tiledA;
    qtMock.fireShortcut("window-switch-focus-floating-tiling");
    Assert.equal(workspaceMock.activeWindow, floatB);
    qtMock.fireShortcut("window-switch-focus-floating-tiling");
    Assert.equal(workspaceMock.activeWindow, tiledA);

    workspaceMock.activeWindow = floatA;
    workspaceMock.activeWindow = tiledB;
    qtMock.fireShortcut("window-switch-focus-floating-tiling");
    Assert.equal(workspaceMock.activeWindow, floatA);
    qtMock.fireShortcut("window-switch-focus-floating-tiling");
    Assert.equal(workspaceMock.activeWindow, tiledB);
});

tests.register("Switch focus without floating windows", 1, () => {
    const { qtMock, workspaceMock } = init(getDefaultConfig());
    const [a, b] = workspaceMock.createClients(2);
    workspaceMock.activeWindow = a;
    qtMock.fireShortcut("window-switch-focus-floating-tiling");
    Assert.equal(workspaceMock.activeWindow, a);
});

tests.register("Move keys move floating windows", 1, () => {
    const { qtMock, workspaceMock } = init(getDefaultConfig());
    const [tiled, floating] = workspaceMock.createClientsWithFrames(
        new MockQmlRect(0, 0, 100, 100), new MockQmlRect(300, 300, 100, 100));
    workspaceMock.activeWindow = floating;
    qtMock.fireShortcut("window-toggle-floating");
    workspaceMock.activeWindow = floating;
    const frame = () => {
        const f = floating.getFrameGeometryCopy();
        return [Math.round(f.x), Math.round(f.y)];
    };
    const start = frame();
    qtMock.fireShortcut("column-move-right");
    Assert.equalArrays(frame(), [start[0] + 50, start[1]]);
    qtMock.fireShortcut("column-move-left");
    Assert.equalArrays(frame(), start);
    qtMock.fireShortcut("window-move-down");
    Assert.equalArrays(frame(), [start[0], start[1] + 50]);
    qtMock.fireShortcut("window-move-up");
    Assert.equalArrays(frame(), start);

    // stays inside the work area
    for (let i = 0; i < 30; i++) {
        qtMock.fireShortcut("column-move-left");
        qtMock.fireShortcut("window-move-up");
    }
    Assert.equalArrays(frame(), [screen.x, screen.y]);
    for (let i = 0; i < 30; i++) {
        qtMock.fireShortcut("column-move-right");
        qtMock.fireShortcut("window-move-down");
    }
    Assert.equalArrays(frame(), [rectRight(screen) - 100, rectBottom(screen) - Math.round(floating.getFrameGeometryCopy().height)]);
});

tests.register("Closing a full-screen window focuses a neighbour", 5, () => {
    const { qtMock, workspaceMock } = init(getDefaultConfig());
    const [a, b, c] = workspaceMock.createClientsWithWidths(200, 200, 200);
    workspaceMock.activeWindow = b;
    b.fullScreen = true;
    // KWin lost the focus before the window is gone (focus follows mouse over empty space), and the
    // focus did not go to the closed window
    workspaceMock.activeWindow = c; // focus-follows-mouse moved the focus, then nothing is under the mouse
    workspaceMock.activeWindow = null;
    workspaceMock.windows.splice(workspaceMock.windows.indexOf(b), 1);
    workspaceMock.windowRemoved.fire(b);
    Assert.assert(workspaceMock.activeWindow !== null);
});

tests.register("Move column and window to another desktop like niri", 3, () => {
    const { qtMock, workspaceMock } = init(getDefaultConfig());
    const [a, b, c, d] = workspaceMock.createClientsWithWidths(200, 200, 200, 200);
    // b and c share a column
    workspaceMock.activeWindow = c;
    qtMock.fireShortcut("window-move-left");
    const desktop1 = workspaceMock.desktops[1];
    qtMock.fireShortcut("window-move-to-next-desktop");
    // c moved alone, desktop follows, c stays focused
    Assert.equal(workspaceMock.currentDesktop, desktop1);
    Assert.equal(workspaceMock.activeWindow, c);
    Assert.equal(c.desktops[0], desktop1);
    // the source keeps a focused neighbour
    qtMock.fireShortcut("desktop-previous");
    workspaceMock.activeWindow = d;
    qtMock.fireShortcut("column-move-to-next-desktop");
    Assert.equal(workspaceMock.currentDesktop, desktop1);
    Assert.equal(workspaceMock.activeWindow, d);
    // inserted to the right of the active column (c), so c is left of d
    Assert.assert(c.getActualFrameGeometry().x < d.getActualFrameGeometry().x);
});

tests.register("Window that starts full-screen is tiled after leaving full-screen", 3, () => {
    for (const tileFullScreen of [true, false]) {
        const config = getDefaultConfig();
        config.tileFullScreen = tileFullScreen;
        const { qtMock, workspaceMock, world } = init(config);
        const [a] = workspaceMock.createClients(1);
        const game = new MockKwinClient(new MockQmlRect(100, 100, 300, 300));
        game.fullScreen = true;
        workspaceMock.createWindows(game);
        game.fullScreen = false;
        // in the grid next to a: the right of a's column
        const fa = a.getActualFrameGeometry();
        const fg = game.getActualFrameGeometry();
        Assert.assert(fg.x >= rectRight(fa), { message: `tileFullScreen=${tileFullScreen}: not tiled after leaving full-screen` });
        // move keys act on it
        workspaceMock.activeWindow = game;
        qtMock.fireShortcut("column-move-left");
        Assert.assert(game.getActualFrameGeometry().x < a.getActualFrameGeometry().x);
    }
});

tests.register("Switch focus to floating moves the cursor", 1, () => {
    // with focus follows mouse, a cursor left on the tiled window would take the focus straight back
    const config = getDefaultConfig();
    config.cursorFollowsFocus = true;
    const { qtMock, workspaceMock } = init(config);
    const [tiled, floating] = workspaceMock.createClients(2);
    workspaceMock.activeWindow = floating;
    qtMock.fireShortcut("window-toggle-floating");
    floating.frameGeometry = new MockQmlRect(1200, 600, 300, 200);
    qtMock.fireShortcut("focus-1");
    Assert.assert(rectContainsPoint(tiled.getActualFrameGeometry(), Workspace.cursorPos), { message: "invalid test setup" });
    Assert.assert(!rectContainsPoint(floating.getActualFrameGeometry(), Workspace.cursorPos), { message: "invalid test setup" });

    qtMock.fireShortcut("window-switch-focus-floating-tiling");
    Assert.equal(workspaceMock.activeWindow, floating);
    Assert.assert(rectContainsPoint(floating.getActualFrameGeometry(), Workspace.cursorPos));
    qtMock.fireShortcut("window-switch-focus-floating-tiling");
    Assert.equal(workspaceMock.activeWindow, tiled);
    Assert.assert(rectContainsPoint(tiled.getActualFrameGeometry(), Workspace.cursorPos));
});
