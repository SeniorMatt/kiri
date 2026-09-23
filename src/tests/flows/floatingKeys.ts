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

tests.register("Focus keys move between floating windows like niri", 1, () => {
    const { qtMock, workspaceMock } = init(getDefaultConfig());
    const [tiled, left, right] = workspaceMock.createClients(3);
    for (const client of [left, right]) {
        workspaceMock.activeWindow = client;
        qtMock.fireShortcut("window-toggle-floating");
    }
    left.frameGeometry = new MockQmlRect(100, 300, 200, 200);
    right.frameGeometry = new MockQmlRect(500, 320, 200, 200);

    workspaceMock.activeWindow = left;
    qtMock.fireShortcut("focus-right");
    Assert.equal(workspaceMock.activeWindow, right);
    qtMock.fireShortcut("focus-right"); // nothing further right: stays in the floating layer
    Assert.equal(workspaceMock.activeWindow, right);
    qtMock.fireShortcut("focus-down"); // the other window is higher up
    Assert.equal(workspaceMock.activeWindow, right);
    qtMock.fireShortcut("focus-left");
    Assert.equal(workspaceMock.activeWindow, left);

    // switching to the tiled layer still works
    qtMock.fireShortcut("window-switch-focus-floating-tiling");
    Assert.equal(workspaceMock.activeWindow, tiled);
});

tests.register("A held key repeats move keys but not toggles", 1, () => {
    const { qtMock, workspaceMock } = init(getDefaultConfig());
    const accel = kglobalaccel as MockKGlobalAccel;
    const [tiled, floating] = workspaceMock.createClientsWithFrames(
        new MockQmlRect(0, 0, 100, 100), new MockQmlRect(500, 300, 100, 100));
    workspaceMock.activeWindow = floating;
    qtMock.fireShortcut("window-toggle-floating");
    workspaceMock.activeWindow = floating;
    const x = () => Math.round(floating.getFrameGeometryCopy().x);
    const start = x();
    for (let i = 0; i < 3; i++) {
        accel.repeat("column-move-left");
    }
    Assert.equal(x(), start - 150);
    accel.repeat("window-toggle-floating"); // does not repeat
    Assert.equal(x(), start - 150);
    accel.repeat("window-toggle-floating");
    workspaceMock.activeWindow = floating;
    accel.repeat("column-move-right");
    Assert.equal(x(), start - 100, { message: "still floating" });
});

tests.register("Focus keys stay in their layer (niri)", 1, () => {
    const { qtMock, workspaceMock } = init(getDefaultConfig());
    const [tiledA, tiledB, floatA, floatB] = workspaceMock.createClientsWithFrames(
        new MockQmlRect(0, 0, 100, 100), new MockQmlRect(0, 0, 100, 100),
        new MockQmlRect(100, 300, 100, 100), new MockQmlRect(400, 300, 100, 100));
    for (const client of [floatA, floatB]) {
        workspaceMock.activeWindow = client;
        qtMock.fireShortcut("window-toggle-floating");
    }
    const fire = (name: string) => qtMock.fireShortcut(name);
    floatA.frameGeometry = new MockQmlRect(100, 300, 100, 100);
    floatB.frameGeometry = new MockQmlRect(400, 300, 100, 100);

    // from a floating window: only floating windows, nothing happens when there is none that way
    workspaceMock.activeWindow = floatA;
    fire("focus-left");
    Assert.equal(workspaceMock.activeWindow, floatA);
    fire("focus-right");
    Assert.equal(workspaceMock.activeWindow, floatB);
    fire("focus-right");
    Assert.equal(workspaceMock.activeWindow, floatB, { message: "does not jump into the grid" });
    fire("focus-start");
    Assert.equal(workspaceMock.activeWindow, floatA);
    fire("focus-column-left-or-last");
    Assert.equal(workspaceMock.activeWindow, floatB, { message: "left of the first wraps to the last" });
    fire("focus-window-in-column-1");
    Assert.equal(workspaceMock.activeWindow, floatB, { message: "no-op in the floating layer" });
    fire("focus-next");
    Assert.equal(workspaceMock.activeWindow, floatB);

    // from a tiled window the floating ones are never reached
    workspaceMock.activeWindow = tiledA;
    for (const name of ["focus-right", "focus-right", "focus-left", "focus-down", "focus-up", "focus-end", "focus-start",
        "focus-column-right-or-first", "focus-column-left-or-last", "focus-next", "focus-previous"]) {
        fire(name);
        Assert.assert(workspaceMock.activeWindow === tiledA || workspaceMock.activeWindow === tiledB, { message: name + " reached a floating window" });
    }

    // the switch keys cross the layers
    fire("window-switch-focus-floating-tiling");
    Assert.assert(workspaceMock.activeWindow === floatA || workspaceMock.activeWindow === floatB);
    fire("window-switch-focus-floating-tiling");
    Assert.assert(workspaceMock.activeWindow === tiledA || workspaceMock.activeWindow === tiledB);
});

tests.register("A lone floating window is not left with the focus keys", 1, () => {
    const { qtMock, workspaceMock } = init(getDefaultConfig());
    const [tiled, floating] = workspaceMock.createClients(2);
    workspaceMock.activeWindow = floating;
    qtMock.fireShortcut("window-toggle-floating");
    workspaceMock.activeWindow = floating;
    for (const name of ["focus-left", "focus-right", "focus-up", "focus-down", "focus-start", "focus-end"]) {
        qtMock.fireShortcut(name);
        Assert.equal(workspaceMock.activeWindow, floating, { message: name });
    }
    qtMock.fireShortcut("window-switch-focus-floating-tiling");
    Assert.equal(workspaceMock.activeWindow, tiled);
});

tests.register("Size keys resize floating windows like niri", 1, () => {
    const config = getDefaultConfig();
    config.presetWidths = "25%, 50%, 100%";
    config.presetHeights = "25%, 50%";
    const { qtMock, workspaceMock } = init(config);
    const [tiled, floating] = workspaceMock.createClients(2);
    workspaceMock.activeWindow = floating;
    qtMock.fireShortcut("window-toggle-floating");
    workspaceMock.activeWindow = floating;
    floating.frameGeometry = new MockQmlRect(200, 100, 300, 200);
    const size = () => {
        const f = floating.getFrameGeometryCopy();
        return [Math.round(f.x), Math.round(f.y), Math.round(f.width), Math.round(f.height)];
    };
    const tiledBefore = tiled.getFrameGeometryCopy();

    // presets are shares of the work area (no gaps), the top-left corner stays
    qtMock.fireShortcut("cycle-preset-widths"); // 300 is taller than 25% of 1600? depends on the screen: first preset above it
    const first = size();
    Assert.equal(first[0], 200);
    Assert.equal(first[1], 100);
    Assert.equal(first[3], 200);
    const w1 = first[2];
    qtMock.fireShortcut("cycle-preset-widths");
    Assert.assert(size()[2] !== w1, { message: "next preset" });
    qtMock.fireShortcut("cycle-preset-widths-reverse");
    Assert.equal(size()[2], w1, { message: "back to the same preset" });

    // set-column-width / set-window-height +-10% of the work area
    const [, , w, h] = size();
    qtMock.fireShortcut("column-width-increase");
    Assert.assert(size()[2] > w);
    qtMock.fireShortcut("window-height-decrease");
    Assert.assert(size()[3] < h);
    qtMock.fireShortcut("window-height-increase");
    Assert.equal(size()[3], h);
    qtMock.fireShortcut("window-height-cycle-presets");
    const h1 = size()[3];
    qtMock.fireShortcut("window-height-cycle-presets");
    Assert.assert(size()[3] !== h1);
    // reset-window-height does nothing for floating windows in niri
    qtMock.fireShortcut("window-height-reset");
    Assert.assert(size()[3] !== h);

    // the tiled layout is left alone
    Assert.equalRects(tiled.getFrameGeometryCopy(), tiledBefore);
});
