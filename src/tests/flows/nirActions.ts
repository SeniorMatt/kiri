// niri's focus and move actions that Kiri added later
tests.register("niri focus actions", 10, () => {
    const config = getDefaultConfig();
    const { qtMock, workspaceMock, world } = init(config);

    const [a, b, c, d] = workspaceMock.createClients(4);
    workspaceMock.activeWindow = c;
    qtMock.fireShortcut("window-consume-or-expel-left"); // a b+c d: c joins b
    // columns: [a] [b c] [d]
    workspaceMock.activeWindow = d;
    qtMock.fireShortcut("focus-column-right-or-first");
    Assert.equal(workspaceMock.activeWindow, a);
    qtMock.fireShortcut("focus-column-left-or-last");
    Assert.equal(workspaceMock.activeWindow, d);

    workspaceMock.activeWindow = b;
    qtMock.fireShortcut("focus-window-down-or-column-right");
    Assert.equal(workspaceMock.activeWindow, c);
    qtMock.fireShortcut("focus-window-down-or-column-right");
    Assert.equal(workspaceMock.activeWindow, d);
    workspaceMock.activeWindow = c;
    qtMock.fireShortcut("focus-window-up-or-column-left");
    Assert.equal(workspaceMock.activeWindow, b);
    qtMock.fireShortcut("focus-window-up-or-column-left");
    Assert.equal(workspaceMock.activeWindow, a);

    workspaceMock.activeWindow = b;
    qtMock.fireShortcut("focus-window-bottom");
    Assert.equal(workspaceMock.activeWindow, c);
    qtMock.fireShortcut("focus-window-down-or-top");
    Assert.equal(workspaceMock.activeWindow, b);
    qtMock.fireShortcut("focus-window-up-or-bottom");
    Assert.equal(workspaceMock.activeWindow, c);
    qtMock.fireShortcut("focus-window-top");
    Assert.equal(workspaceMock.activeWindow, b);
    qtMock.fireShortcut("focus-window-in-column-2");
    Assert.equal(workspaceMock.activeWindow, c);
    qtMock.fireShortcut("focus-window-in-column-9");
    Assert.equal(workspaceMock.activeWindow, c, { message: "too big a number means the last window" });

    qtMock.fireShortcut("focus-9");
    Assert.equal(workspaceMock.activeWindow, d, { message: "too big a number means the last column" });
    qtMock.fireShortcut("focus-1");
    Assert.equal(workspaceMock.activeWindow, a);
});

tests.register("niri window-or-desktop actions", 5, () => {
    const config = getDefaultConfig();
    const { qtMock, workspaceMock, world } = init(config);

    const [a, b] = workspaceMock.createClients(2);
    qtMock.fireShortcut("window-consume-or-expel-left"); // b joins a: [a b]
    workspaceMock.activeWindow = a;
    qtMock.fireShortcut("focus-window-or-desktop-down");
    Assert.equal(workspaceMock.activeWindow, b);
    qtMock.fireShortcut("focus-window-or-desktop-down");
    Assert.equal(workspaceMock.currentDesktop, workspaceMock.desktops[1]);
    qtMock.fireShortcut("desktop-previous-used");
    Assert.equal(workspaceMock.currentDesktop, workspaceMock.desktops[0]);
    workspaceMock.activeWindow = a;
    qtMock.fireShortcut("focus-window-or-desktop-up");
    Assert.equal(workspaceMock.currentDesktop, workspaceMock.desktops[0], { message: "there is no desktop above" });

    // move-window-down-or-to-desktop-down: first down inside the column, then to the next desktop
    workspaceMock.activeWindow = a;
    qtMock.fireShortcut("window-move-down-or-to-desktop-down");
    Assert.equal(workspaceMock.currentDesktop, workspaceMock.desktops[0]);
    qtMock.fireShortcut("window-move-down-or-to-desktop-down");
    Assert.equal(workspaceMock.currentDesktop, workspaceMock.desktops[1]);
    Assert.equalArrays(a.desktops, [workspaceMock.desktops[1]]);
    Assert.equal(workspaceMock.activeWindow, a);
});

tests.register("niri swap-window", 10, () => {
    const config = getDefaultConfig();
    const { qtMock, workspaceMock, world } = init(config);

    const [a, b, c, d] = workspaceMock.createClients(4);
    workspaceMock.activeWindow = c;
    qtMock.fireShortcut("window-consume-or-expel-left"); // [a] [b c] [d]
    workspaceMock.activeWindow = c;
    qtMock.fireShortcut("window-swap-left");
    // c changes places with the active window of the column on the left, a
    Assert.equal(workspaceMock.activeWindow, c);
    Assert.assert(c.getActualFrameGeometry().x < b.getActualFrameGeometry().x + 1);
    Assert.assert(a.getActualFrameGeometry().x > c.getActualFrameGeometry().x, { message: "a is in the second column now" });
    Assert.assert(Math.abs(a.getActualFrameGeometry().x - b.getActualFrameGeometry().x) < 1, { message: "a joined b's column" });
    Assert.assert(a.getActualFrameGeometry().y > b.getActualFrameGeometry().y - 1 || a.getActualFrameGeometry().y < b.getActualFrameGeometry().y, {});

    // two single-window columns just trade places like move-column
    workspaceMock.activeWindow = d;
    qtMock.fireShortcut("window-swap-left");
    Assert.assert(d.getActualFrameGeometry().x < a.getActualFrameGeometry().x);
    Assert.equal(workspaceMock.activeWindow, d);
});

tests.register("niri set-column-width steps and display", 10, () => {
    const config = getDefaultConfig();
    config.scrollingLazy = true;
    const { qtMock, workspaceMock, world } = init(config);

    const [a] = workspaceMock.createClientsWithWidths(300);
    const full = tilingArea.width + gapH;
    qtMock.fireShortcut("column-width-increase");
    Assert.equal(a.getActualFrameGeometry().width, 300 + Math.round(full * 0.1));
    qtMock.fireShortcut("column-width-decrease");
    qtMock.fireShortcut("column-width-decrease");
    Assert.equal(a.getActualFrameGeometry().width, 300 - Math.round(full * 0.1));

    qtMock.fireShortcut("column-display-tabbed");
    const [b] = workspaceMock.createClientsWithWidths(300);
    qtMock.fireShortcut("window-consume-or-expel-left");
    Assert.equal(a.getActualFrameGeometry().height, tilingArea.height, { message: "tabbed windows fill the column" });
    qtMock.fireShortcut("column-display-normal");
    Assert.assert(a.getActualFrameGeometry().height < tilingArea.height);
});

tests.register("Full-screen in a tabbed column keeps the tabs (niri)", 5, () => {
    const config = getDefaultConfig();
    const { qtMock, workspaceMock, world } = init(config);

    const [a, b] = workspaceMock.createClientsWithWidths(300, 300);
    qtMock.fireShortcut("window-consume-or-expel-left"); // [a b]
    qtMock.fireShortcut("column-toggle-tabbed");
    workspaceMock.activeWindow = b;
    b.fullScreen = true;
    world.do((clientManager, desktopManager) => {
        Assert.equal(desktopManager.getCurrentDesktop()!.grid.getColumns().length, 1, { message: "the window stays in its tabbed column" });
    });
    Assert.equalRects(b.getActualFrameGeometry(), screen);
    b.fullScreen = false;
    world.do((clientManager, desktopManager) => {
        Assert.equal(desktopManager.getCurrentDesktop()!.grid.getColumns().length, 1);
    });
});

tests.register("focus-window-previous (niri)", 10, () => {
    const config = getDefaultConfig();
    const { qtMock, workspaceMock, world } = init(config);
    const [a, b, c] = workspaceMock.createClients(3);
    workspaceMock.activeWindow = a;
    workspaceMock.activeWindow = c;
    qtMock.fireShortcut("focus-window-previous");
    Assert.equal(workspaceMock.activeWindow, a);
    qtMock.fireShortcut("focus-window-previous");
    Assert.equal(workspaceMock.activeWindow, c, { message: "pressing it again goes back" });
    workspaceMock.activeWindow = b;
    workspaceMock.removeWindow(c);
    workspaceMock.activeWindow = b;
    qtMock.fireShortcut("focus-window-previous");
    Assert.equal(workspaceMock.activeWindow, a, { message: "closed windows are skipped" });
});
