tests.register("Maximize column toggles (niri maximize-column)", 20, () => {
    const config = getDefaultConfig();
    const { qtMock, workspaceMock, world } = init(config);

    const [left, middle, right] = workspaceMock.createClientsWithWidths(300, 300, 300);
    workspaceMock.activeWindow = middle;

    qtMock.fireShortcut("column-width-maximize");
    Assert.equal(middle.getActualFrameGeometry().width, tilingArea.width);
    Assert.equal(middle.getActualFrameGeometry().x, tilingArea.x, { message: "gaps are kept" });
    Assert.equal(Workspace.activeWindow, middle);

    qtMock.fireShortcut("column-width-maximize");
    Assert.equal(middle.getActualFrameGeometry().width, 300);
    Assert.equal(left.getActualFrameGeometry().width, 300);
    Assert.equal(right.getActualFrameGeometry().width, 300);
    Assert.equal(Workspace.activeWindow, middle);
    Assert.grid(config, tilingArea, 300, [[left], [middle], [right]], false);
});

tests.register("Maximize window to edges toggles (niri maximize-window-to-edges)", 20, () => {
    const config = getDefaultConfig();
    config.tileMaximized = true;
    const { qtMock, workspaceMock, world } = init(config);

    const [left, middle, right] = workspaceMock.createClientsWithWidths(300, 300, 300);
    workspaceMock.activeWindow = middle;

    qtMock.fireShortcut("window-maximize-to-edges");
    Assert.assert(middle.maximizedVertically && middle.maximizedHorizontally, { message: "KWin maximized state is set" });
    Assert.equalRects(middle.getActualFrameGeometry(), screen);
    Assert.equal(Workspace.activeWindow, middle);
    world.do((clientManager, desktopManager) => {
        Assert.tiledClient(clientManager, middle);
    });
    Assert.equal(rectRight(left.getActualFrameGeometry()) + config.gapsInnerHorizontal, middle.getActualFrameGeometry().x);
    Assert.equal(rectRight(middle.getActualFrameGeometry()) + config.gapsInnerHorizontal, right.getActualFrameGeometry().x);

    qtMock.fireShortcut("window-maximize-to-edges");
    Assert.assert(!middle.maximizedVertically && !middle.maximizedHorizontally);
    Assert.equal(Workspace.activeWindow, middle);
    Assert.grid(config, tilingArea, 300, [[left], [middle], [right]], false);
});

tests.register("Maximize window to edges keeps the column width and preset (niri)", 20, () => {
    const config = getDefaultConfig();
    config.tileMaximized = true;
    const { qtMock, workspaceMock, world } = init(config);

    const [left, middle, right] = workspaceMock.createClientsWithWidths(300, 300, 300);
    workspaceMock.activeWindow = middle;
    qtMock.fireShortcut("cycle-preset-widths");
    const presetWidth = middle.getActualFrameGeometry().width;

    qtMock.fireShortcut("window-maximize-to-edges");
    Assert.equalRects(middle.getActualFrameGeometry(), screen, { message: "no gaps while maximized" });
    qtMock.fireShortcut("window-maximize-to-edges");
    Assert.equal(middle.getActualFrameGeometry().width, presetWidth, { message: "previous width is back" });
    Assert.equal(left.getActualFrameGeometry().width, 300);
    Assert.equal(right.getActualFrameGeometry().width, 300);

    qtMock.fireShortcut("cycle-preset-widths");
    Assert.assert(middle.getActualFrameGeometry().width !== presetWidth, { message: "preset cycling continues from the stored index" });
});

tests.register("Maximized window to edges stays maximized when focus leaves and returns (niri)", 20, () => {
    const config = getDefaultConfig();
    config.tileMaximized = true;
    const { qtMock, workspaceMock, world } = init(config);

    const [left, middle, right] = workspaceMock.createClientsWithWidths(300, 300, 300);
    workspaceMock.activeWindow = middle;

    qtMock.fireShortcut("window-maximize-to-edges");
    qtMock.fireShortcut("focus-left");
    Assert.equal(Workspace.activeWindow, left);
    Assert.assert(middle.maximizedVertically && middle.maximizedHorizontally, { message: "the column stays maximized" });
    qtMock.fireShortcut("focus-right");
    Assert.equal(Workspace.activeWindow, middle);
    Assert.equalRects(middle.getActualFrameGeometry(), screen, { message: "still no gaps" });

    qtMock.fireShortcut("window-maximize-to-edges");
    Assert.assert(!middle.maximizedVertically && !middle.maximizedHorizontally);
    Assert.equal(left.getActualFrameGeometry().width, 300);
});
