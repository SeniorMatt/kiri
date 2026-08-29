tests.register("Stacked", 5, () => {
    const config = getDefaultConfig();
    const { qtMock, workspaceMock, world } = init(config);

    const [leftTop, leftBottom, rightTop, rightBottom] = workspaceMock.createClients(4);
    const grid = [[leftTop, leftBottom], [rightTop, rightBottom]];
    workspaceMock.activeWindow = rightBottom;
    qtMock.fireShortcut("window-move-left");
    workspaceMock.activeWindow = leftBottom;
    qtMock.fireShortcut("window-move-left");
    Assert.grid(config, tilingArea, 100, grid, true);

    qtMock.fireShortcut("column-toggle-stacked");
    Assert.grid(config, tilingArea, 100, grid, true, [0]);

    qtMock.fireShortcut("focus-up");
    Assert.grid(config, tilingArea, 100, grid, true, [0]);

    qtMock.fireShortcut("focus-down");
    Assert.grid(config, tilingArea, 100, grid, true, [0]);

    qtMock.fireShortcut("window-move-up");
    Assert.grid(config, tilingArea, 100, [[leftBottom, leftTop], [rightTop, rightBottom]], true, [0]);

    qtMock.fireShortcut("window-move-down");
    Assert.grid(config, tilingArea, 100, grid, true, [0]);

    qtMock.fireShortcut("column-toggle-stacked");
    Assert.grid(config, tilingArea, 100, grid, true);
});
