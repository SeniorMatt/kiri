// issues 84: column-width-maximize on a Plasma-maximized window and on a full-width column with nothing remembered
tests.register("Maximize column: a Plasma-maximized window goes back to its column width first", 10, () => {
    const config = getDefaultConfig();
    config.tileMaximized = true;
    const { qtMock, workspaceMock } = init(config);
    const [left, middle, right] = workspaceMock.createClientsWithWidths(300, 300, 300);
    workspaceMock.activeWindow = middle;

    qtMock.fireShortcut("window-maximize-to-edges");
    Assert.assert(middle.maximizedHorizontally);
    qtMock.fireShortcut("column-width-maximize");
    Assert.assert(!middle.maximizedHorizontally && !middle.maximizedVertically, { message: "un-maximized" });
    Assert.equal(middle.getActualFrameGeometry().width, 300);
    Assert.grid(config, tilingArea, 300, [[left], [middle], [right]], false);

    qtMock.fireShortcut("column-width-maximize");
    Assert.equal(middle.getActualFrameGeometry().width, tilingArea.width);
    qtMock.fireShortcut("column-width-maximize");
    Assert.equal(middle.getActualFrameGeometry().width, 300);
});

tests.register("Maximize column: a maximized window in a full-width column ends at the default width", 10, () => {
    const config = getDefaultConfig();
    config.tileMaximized = true;
    config.defaultColumnWidth = "400px";
    const { qtMock, workspaceMock } = init(config);
    const [left, middle] = workspaceMock.createClientsWithWidths(300, tilingArea.width);
    workspaceMock.activeWindow = middle;
    qtMock.fireShortcut("window-maximize-to-edges");
    qtMock.fireShortcut("column-width-maximize");
    Assert.assert(!middle.maximizedHorizontally);
    Assert.equal(middle.getActualFrameGeometry().width, 400);
});

tests.register("Maximize column: no default width falls back to half", 10, () => {
    const config = getDefaultConfig();
    config.defaultColumnWidth = "";
    const { qtMock, workspaceMock } = init(config);
    const [left, middle] = workspaceMock.createClientsWithWidths(300, tilingArea.width);
    workspaceMock.activeWindow = middle;
    qtMock.fireShortcut("column-width-maximize");
    Assert.equal(middle.getActualFrameGeometry().width, Math.floor((tilingArea.width - config.gapsInnerHorizontal) / 2));
});

tests.register("Maximize column: tileMaximized off leaves a maximized window alone", 10, () => {
    const config = getDefaultConfig();
    config.tileMaximized = false;
    const { qtMock, workspaceMock } = init(config);
    const [left, middle, right] = workspaceMock.createClientsWithWidths(300, 300, 300);
    workspaceMock.activeWindow = middle;
    middle.setMaximize(true, true);
    qtMock.fireShortcut("column-width-maximize");
    Assert.assert(middle.maximizedHorizontally, { message: "still maximized" });
});

tests.register("Maximize column: tabbed column with a maximized window", 10, () => {
    const config = getDefaultConfig();
    config.tileMaximized = true;
    const { qtMock, workspaceMock } = init(config);
    const [a, b, c] = workspaceMock.createClientsWithWidths(300, 300, 300);
    workspaceMock.activeWindow = b;
    qtMock.fireShortcut("window-move-left");
    qtMock.fireShortcut("column-toggle-tabbed");
    qtMock.fireShortcut("window-maximize-to-edges");
    qtMock.fireShortcut("column-width-maximize");
    Assert.assert(!b.maximizedHorizontally);
    Assert.equal(b.getActualFrameGeometry().width, 300);
    qtMock.fireShortcut("column-width-maximize");
    Assert.equal(b.getActualFrameGeometry().width, tilingArea.width);
});

tests.register("Maximize column: a column dragged to full width goes to the default width", 10, () => {
    timeControl(addTime => {
        const config = getDefaultConfig();
        config.defaultColumnWidth = "400px";
        const { qtMock, workspaceMock } = init(config);
        const [left, middle] = workspaceMock.createClientsWithWidths(300, 300);
        workspaceMock.activeWindow = middle;
        workspaceMock.resizeWindow(middle, true, false, false, new MockQmlSize(tilingArea.width - middle.getActualFrameGeometry().width, 0));
        addTime(100);
        Assert.equal(middle.getActualFrameGeometry().width, tilingArea.width, { message: "dragged to full width" });

        // the sizes of the drag are not the window refusing the width Kiri asked for before it
        qtMock.fireShortcut("column-width-maximize");
        addTime(100);
        Assert.equal(middle.getActualFrameGeometry().width, 400, { message: "the default width" });
    });
});
