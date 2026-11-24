// niri's set-column-width, set-window-height and the explicit set/unset actions, the focus=false moves, focus-window-
// previous props

tests.register("niri set-column-width and set-window-height by size", 10, () => {
    const config = getDefaultConfig();
    config.columnWidthSet = "50%, 400, +100, -50, 25%, bogus";
    config.windowHeightSet = "50%, 200, +40";
    const { qtMock, workspaceMock, world } = init(config);

    const [a, b] = workspaceMock.createClientsWithWidths(300, 300);
    workspaceMock.activeWindow = a;
    qtMock.fireShortcut("column-width-set-1");
    Assert.equal(a.getActualFrameGeometry().width, Math.floor((tilingArea.width + gapH) * 0.5 - gapH), { message: "50%" });
    qtMock.fireShortcut("column-width-set-2");
    Assert.equal(a.getActualFrameGeometry().width, 400, { message: "absolute pixels" });
    qtMock.fireShortcut("column-width-set-3");
    Assert.equal(a.getActualFrameGeometry().width, 500, { message: "+100 pixels" });
    qtMock.fireShortcut("column-width-set-4");
    Assert.equal(a.getActualFrameGeometry().width, 450, { message: "-50 pixels" });
    qtMock.fireShortcut("column-width-set-6");
    Assert.equal(a.getActualFrameGeometry().width, 450, { message: "an entry that is not a size does nothing" });
    qtMock.fireShortcut("column-width-set-9");
    Assert.equal(a.getActualFrameGeometry().width, 450, { message: "an entry past the list does nothing" });
    Assert.equal(b.getActualFrameGeometry().width, 300);

    workspaceMock.activeWindow = b;
    qtMock.fireShortcut("window-consume-or-expel-left"); // a and b in one column
    workspaceMock.activeWindow = b;
    const total = tilingArea.height - gapV;
    qtMock.fireShortcut("window-height-set-1");
    Assert.equal(b.getActualFrameGeometry().height, Math.floor((tilingArea.height + gapV) * 0.5 - gapV), { message: "50% of the height" });
    qtMock.fireShortcut("window-height-set-2");
    Assert.equal(b.getActualFrameGeometry().height, 200);
    qtMock.fireShortcut("window-height-set-3");
    Assert.equal(b.getActualFrameGeometry().height, 240, { message: "+40 pixels" });
    Assert.equal(a.getActualFrameGeometry().height, total - 240);
});

tests.register("niri set-column-width on a floating window", 5, () => {
    const config = getDefaultConfig();
    config.columnWidthSet = "50%, +20";
    const { qtMock, workspaceMock, world } = init(config);
    const [a] = workspaceMock.createClientsWithWidths(300);
    qtMock.fireShortcut("window-toggle-floating");
    qtMock.fireShortcut("column-width-set-1");
    Assert.equal(a.getActualFrameGeometry().width, screen.width / 2, { message: "half of the work area" });
    qtMock.fireShortcut("column-width-set-2");
    Assert.equal(a.getActualFrameGeometry().width, screen.width / 2 + 20);
});

tests.register("niri set/unset full-screen, windowed full-screen and maximized-to-edges", 5, () => {
    const config = getDefaultConfig();
    config.tileMaximized = true;
    const { qtMock, workspaceMock, world } = init(config);
    const [a, b, c] = workspaceMock.createClientsWithWidths(300, 300, 300);
    workspaceMock.activeWindow = b;

    qtMock.fireShortcut("window-set-fullscreen");
    Assert.assert(b.fullScreen);
    qtMock.fireShortcut("window-set-fullscreen");
    Assert.assert(b.fullScreen, { message: "set does not toggle" });
    qtMock.fireShortcut("window-unset-fullscreen");
    Assert.assert(!b.fullScreen);
    qtMock.fireShortcut("window-unset-fullscreen");
    Assert.assert(!b.fullScreen, { message: "unset does not toggle" });

    const before = [a, b, c].map(client => client.getActualFrameGeometry().clone());
    qtMock.fireShortcut("window-set-windowed-fullscreen");
    Assert.assert(b.fullScreen, { message: "the client is full-screen" });
    qtMock.fireShortcut("window-set-windowed-fullscreen");
    Assert.assert(b.fullScreen);
    Assert.equal(b.getActualFrameGeometry().height, tilingArea.height);
    Assert.equal(a.getActualFrameGeometry().width, before[0].width, { message: "the tile stays" });
    qtMock.fireShortcut("window-unset-windowed-fullscreen");
    Assert.assert(!b.fullScreen);
    qtMock.fireShortcut("window-unset-windowed-fullscreen");
    Assert.assert(!b.fullScreen, { message: "unset does not toggle" });

    // set-fullscreen on a windowed full-screen window makes it real; unset-fullscreen ends the windowed state
    qtMock.fireShortcut("window-set-windowed-fullscreen");
    qtMock.fireShortcut("window-set-fullscreen");
    Assert.assert(b.fullScreen);
    Assert.equalRects(b.getActualFrameGeometry(), screen);
    qtMock.fireShortcut("window-unset-fullscreen");
    Assert.assert(!b.fullScreen);
    qtMock.fireShortcut("window-set-windowed-fullscreen");
    qtMock.fireShortcut("window-unset-fullscreen");
    Assert.assert(!b.fullScreen, { message: "unset-fullscreen also ends windowed full-screen" });

    qtMock.fireShortcut("window-unset-maximized-to-edges");
    Assert.assert(!b.maximizedVertically && !b.maximizedHorizontally);
    qtMock.fireShortcut("window-set-maximized-to-edges");
    Assert.assert(b.maximizedVertically && b.maximizedHorizontally);
    Assert.equalRects(b.getActualFrameGeometry(), screen);
    qtMock.fireShortcut("window-set-maximized-to-edges");
    Assert.assert(b.maximizedVertically && b.maximizedHorizontally, { message: "set does not toggle" });
    qtMock.fireShortcut("window-unset-maximized-to-edges");
    Assert.assert(!b.maximizedVertically && !b.maximizedHorizontally);
});

tests.register("niri open-overview and close-overview", 5, () => {
    const config = getDefaultConfig();
    const { qtMock, workspaceMock, world } = init(config);
    overviewCalls.length = 0;
    workspaceMock.createClients(2);
    const toggles = () => overviewCalls.filter(call => call.member === "toggle").length;
    qtMock.fireShortcut("overview-close");
    Assert.equal(toggles(), 0, { message: "closing a closed overview does nothing" });
    qtMock.fireShortcut("overview-open");
    Assert.equal(toggles(), 1);
    qtMock.fireShortcut("overview-open");
    Assert.equal(toggles(), 1, { message: "opening an open overview does nothing" });
    qtMock.fireShortcut("overview-close");
    Assert.equal(toggles(), 2);
});

tests.register("niri move actions with focus=false", 10, () => {
    const config = getDefaultConfig();
    const { qtMock, workspaceMock, world } = init(config);
    const [a, b, c, d] = workspaceMock.createClientsWithWidths(100, 100, 100, 100);
    const order = () => [a, b, c, d].sort((p, q) => p.getActualFrameGeometry().x - q.getActualFrameGeometry().x);

    // move-column-right focus=false: b goes right, c took its place and has the focus
    workspaceMock.activeWindow = b;
    qtMock.fireShortcut("column-move-right-no-focus");
    Assert.equalArrays(order(), [a, c, b, d]);
    Assert.equal(workspaceMock.activeWindow, c);
    // move-column-left focus=false: c goes left, a is in its place now
    qtMock.fireShortcut("column-move-left-no-focus");
    Assert.equalArrays(order(), [c, a, b, d]);
    Assert.equal(workspaceMock.activeWindow, a);
    // at the edge nothing moves and the focus stays
    workspaceMock.activeWindow = c;
    qtMock.fireShortcut("column-move-left-no-focus");
    Assert.equalArrays(order(), [c, a, b, d]);
    Assert.equal(workspaceMock.activeWindow, c);
    // to first / last
    workspaceMock.activeWindow = b;
    qtMock.fireShortcut("column-move-start-no-focus");
    Assert.equalArrays(order(), [b, c, a, d]);
    Assert.equal(workspaceMock.activeWindow, a, { message: "the column that was left of b is at b's old index" });
    qtMock.fireShortcut("column-move-end-no-focus");
    Assert.equalArrays(order(), [b, c, d, a]);
    Assert.equal(workspaceMock.activeWindow, d);
    // to an index
    workspaceMock.activeWindow = b;
    qtMock.fireShortcut("column-move-to-column-no-focus-3");
    Assert.equalArrays(order(), [c, d, b, a]);
    Assert.equal(workspaceMock.activeWindow, c, { message: "the column that came to index 1 has the focus" });
});

tests.register("niri window moves, swaps and desktop moves with focus=false", 10, () => {
    const config = getDefaultConfig();
    const { qtMock, workspaceMock, world } = init(config);
    const [a, b, c, d] = workspaceMock.createClientsWithWidths(300, 300, 300, 300);
    workspaceMock.activeWindow = b;
    qtMock.fireShortcut("window-consume-or-expel-left"); // [a b] c d
    workspaceMock.activeWindow = a;
    const above = (x: MockKwinClient, y: MockKwinClient) => x.getActualFrameGeometry().y < y.getActualFrameGeometry().y;

    qtMock.fireShortcut("window-move-down-no-focus");
    Assert.assert(above(b, a), { message: "a is below b now" });
    Assert.equal(workspaceMock.activeWindow, b, { message: "b took a's place and has the focus" });
    qtMock.fireShortcut("window-move-up-no-focus");
    Assert.assert(above(b, a), { message: "b is at the top already: nothing moves" });
    Assert.equal(workspaceMock.activeWindow, b);

    // swap-window-right focus=false: the other window comes here and has the focus
    workspaceMock.activeWindow = b;
    qtMock.fireShortcut("window-swap-right-no-focus");
    Assert.assert(b.getActualFrameGeometry().x > c.getActualFrameGeometry().x - 1, { message: "b went to the next column" });
    Assert.equal(workspaceMock.activeWindow, c);

    // a window or column that goes to another desktop leaves the view where it is
    const desktop0 = workspaceMock.desktops[0];
    const desktop1 = workspaceMock.desktops[1];
    workspaceMock.activeWindow = d;
    qtMock.fireShortcut("column-move-to-next-desktop-no-focus");
    Assert.equal(workspaceMock.currentDesktop, desktop0);
    Assert.equalArrays(d.desktops, [desktop1]);
    Assert.assert(workspaceMock.activeWindow !== d, { message: "the focus stays on this desktop" });
    workspaceMock.activeWindow = c;
    qtMock.fireShortcut("window-move-to-desktop-no-focus-2");
    Assert.equal(workspaceMock.currentDesktop, desktop0);
    Assert.equalArrays(c.desktops, [desktop1]);
    workspaceMock.activeWindow = a;
    qtMock.fireShortcut("column-move-to-desktop-no-focus-2");
    Assert.equal(workspaceMock.currentDesktop, desktop0);
    Assert.equalArrays(a.desktops, [desktop1]);
});

tests.register("niri focus-window-previous scope and filter", 10, () => {
    const config = getDefaultConfig();
    const { qtMock, workspaceMock, world } = init(config);
    const [a, b, c, d] = workspaceMock.createClients(4);
    a.resourceClass = "term";
    b.resourceClass = "web";
    c.resourceClass = "term";
    d.resourceClass = "web";
    for (const client of [a, b, c, d]) {
        workspaceMock.activeWindow = client; // focus order a, b, c, d
    }
    qtMock.fireShortcut("focus-window-previous");
    Assert.equal(workspaceMock.activeWindow, c);
    workspaceMock.activeWindow = d;
    qtMock.fireShortcut("focus-window-previous-app");
    Assert.equal(workspaceMock.activeWindow, b, { message: "the last window of the same application" });
    for (const client of [a, b, c, d]) {
        workspaceMock.activeWindow = client;
    }
    c.desktops = [workspaceMock.desktops[1]]; // c is on another desktop now
    qtMock.fireShortcut("focus-window-previous-workspace");
    Assert.equal(workspaceMock.activeWindow, b, { message: "c is not on this desktop" });
    workspaceMock.activeWindow = d;
    qtMock.fireShortcut("focus-window-previous-workspace-app");
    Assert.equal(workspaceMock.activeWindow, b, { message: "the last window of the same application on this desktop" });
});
