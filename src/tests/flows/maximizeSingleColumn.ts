// issue 78: maximizeSingleColumn makes a lone column full width and gives it back its own width when a neighbour comes
function widthOf(client: MockKwinClient) {
    return client.getActualFrameGeometry().width;
}

tests.register("Maximize single column: off by default", 5, () => {
    const config = getDefaultConfig();
    Assert.equal(config.maximizeSingleColumn, false);
    config.defaultColumnWidth = "400px";
    const { qtMock, workspaceMock, world } = init(config);
    const [a] = workspaceMock.createClientsWithWidths(300);
    Assert.equal(widthOf(a), 400);
    const [b] = workspaceMock.createClientsWithWidths(300);
    Assert.equal(widthOf(a), 400);
    workspaceMock.removeWindow(b);
    Assert.equal(widthOf(a), 400);
});

tests.register("Maximize single column: a lone column is full width", 5, () => {
    const config = getDefaultConfig();
    config.maximizeSingleColumn = true;
    config.defaultColumnWidth = "400px";
    const { qtMock, workspaceMock, world } = init(config);
    const [a] = workspaceMock.createClientsWithWidths(300);
    Assert.equal(widthOf(a), tilingArea.width);
    Assert.equal(a.getActualFrameGeometry().x, tilingArea.x);
});

tests.register("Maximize single column: a second column gives the first one its own width back", 5, () => {
    const config = getDefaultConfig();
    config.maximizeSingleColumn = true;
    config.defaultColumnWidth = "400px";
    const { qtMock, workspaceMock, world } = init(config);
    const [a] = workspaceMock.createClientsWithWidths(300);
    Assert.equal(widthOf(a), tilingArea.width);
    const [b] = workspaceMock.createClientsWithWidths(300);
    Assert.equal(widthOf(a), 400);
    Assert.equal(widthOf(b), 400);
    Assert.equal(b.getActualFrameGeometry().x - a.getActualFrameGeometry().x, 400 + config.gapsInnerHorizontal);

    const [c] = workspaceMock.createClientsWithWidths(300);
    Assert.equal(widthOf(a), 400);
    Assert.equal(widthOf(b), 400);
    Assert.equal(widthOf(c), 400);
});

tests.register("Maximize single column: closing columns until one is left makes it full width again", 5, () => {
    const config = getDefaultConfig();
    config.maximizeSingleColumn = true;
    config.defaultColumnWidth = "400px";
    const { qtMock, workspaceMock, world } = init(config);
    const [a] = workspaceMock.createClientsWithWidths(300);
    const [b] = workspaceMock.createClientsWithWidths(300);
    const [c] = workspaceMock.createClientsWithWidths(300);
    workspaceMock.removeWindow(c);
    Assert.equal(widthOf(a), 400);
    Assert.equal(widthOf(b), 400);
    workspaceMock.removeWindow(b);
    Assert.equal(widthOf(a), tilingArea.width);
    const [d] = workspaceMock.createClientsWithWidths(300);
    Assert.equal(widthOf(a), 400);
    workspaceMock.removeWindow(a);
    Assert.equal(widthOf(d), tilingArea.width);
});

tests.register("Maximize single column: the first column of two can be the one that is left", 5, () => {
    const config = getDefaultConfig();
    config.maximizeSingleColumn = true;
    config.defaultColumnWidth = "400px";
    const { qtMock, workspaceMock, world } = init(config);
    const [a] = workspaceMock.createClientsWithWidths(300);
    const [b] = workspaceMock.createClientsWithWidths(300);
    workspaceMock.activeWindow = a;
    workspaceMock.removeWindow(a);
    Assert.equal(widthOf(b), tilingArea.width);
    Assert.equal(b.getActualFrameGeometry().x, tilingArea.x);
});

tests.register("Maximize single column: two windows in one column are still one column", 5, () => {
    const config = getDefaultConfig();
    config.maximizeSingleColumn = true;
    config.defaultColumnWidth = "400px";
    const { qtMock, workspaceMock, world } = init(config);
    const [a, b] = workspaceMock.createClientsWithWidths(300, 300);
    workspaceMock.activeWindow = b;
    qtMock.fireShortcut("window-move-left");
    Assert.equal(widthOf(a), tilingArea.width);
    Assert.equal(widthOf(b), tilingArea.width);
    // expelling gives the new column the column's own width, not the full one
    qtMock.fireShortcut("window-move-right");
    Assert.equal(widthOf(a), 400);
    Assert.equal(widthOf(b), 400);
});

tests.register("Maximize single column: a floating window is not a column", 5, () => {
    const config = getDefaultConfig();
    config.maximizeSingleColumn = true;
    config.defaultColumnWidth = "400px";
    const { qtMock, workspaceMock, world } = init(config);
    const [a, b] = workspaceMock.createClientsWithWidths(300, 300);
    Assert.equal(widthOf(a), 400);
    workspaceMock.activeWindow = b;
    qtMock.fireShortcut("window-toggle-floating");
    Assert.equal(widthOf(a), tilingArea.width);
    qtMock.fireShortcut("window-toggle-floating");
    Assert.equal(widthOf(a), 400);
});

tests.register("Maximize single column: the max width of a window is respected", 5, () => {
    const config = getDefaultConfig();
    config.maximizeSingleColumn = true;
    config.defaultColumnWidth = "";
    const { qtMock, workspaceMock, world } = init(config);
    const a = new MockKwinClient(new MockQmlRect(0, 0, 300, 300));
    a.maxSize = new MockQmlSize(500, 9999);
    workspaceMock.createWindows(a);
    Assert.equal(widthOf(a), 500);
    const [b] = workspaceMock.createClientsWithWidths(300);
    Assert.equal(widthOf(a), 300);
    workspaceMock.removeWindow(b);
    Assert.equal(widthOf(a), 500);
});

tests.register("Maximize single column: a width set by the user is left alone", 5, () => {
    for (const shortcut of ["column-width-decrease", "cycle-preset-widths"]) {
        const config = getDefaultConfig();
        config.maximizeSingleColumn = true;
        config.defaultColumnWidth = "400px";
        const { qtMock, workspaceMock, world } = init(config);
        const [a] = workspaceMock.createClientsWithWidths(300);
        Assert.equal(widthOf(a), tilingArea.width);
        qtMock.fireShortcut(shortcut);
        const userWidth = widthOf(a);
        Assert.assert(userWidth < tilingArea.width, { message: shortcut + ": the width changed" });
        const [b] = workspaceMock.createClientsWithWidths(300);
        Assert.equal(widthOf(a), userWidth, { message: shortcut });
        workspaceMock.removeWindow(b);
        Assert.equal(widthOf(a), userWidth, { message: shortcut + ": after the neighbour closed" });
    }
});

tests.register("Maximize single column: the maximize shortcut on a lone full-width column goes to its own width", 5, () => {
    const config = getDefaultConfig();
    config.maximizeSingleColumn = true;
    config.defaultColumnWidth = "400px";
    const { qtMock, workspaceMock, world } = init(config);
    const [a] = workspaceMock.createClientsWithWidths(300);
    Assert.equal(widthOf(a), tilingArea.width);
    qtMock.fireShortcut("column-width-maximize");
    Assert.equal(widthOf(a), 400);
    // it is the user's width now: it stays
    const [b] = workspaceMock.createClientsWithWidths(300);
    workspaceMock.removeWindow(b);
    Assert.equal(widthOf(a), 400);
    qtMock.fireShortcut("column-width-maximize");
    Assert.equal(widthOf(a), tilingArea.width);
});

tests.register("Maximize single column: moving a column to another desktop updates both desktops", 8, () => {
    const config = getDefaultConfig();
    config.maximizeSingleColumn = true;
    config.defaultColumnWidth = "400px";
    const { qtMock, workspaceMock, world } = init(config);
    const [a, b] = workspaceMock.createClientsWithWidths(300, 300);
    Assert.equal(widthOf(a), 400);
    workspaceMock.activeWindow = b;
    qtMock.fireShortcut("column-move-to-desktop-2");
    // the source desktop is left with one column, and so is the destination
    Assert.equal(widthOf(a), tilingArea.width);
    Assert.equal(widthOf(b), tilingArea.width);

    qtMock.fireShortcut("column-move-to-previous-desktop");
    // both are on the first desktop again
    Assert.equal(widthOf(a), 400);
    Assert.equal(widthOf(b), 400);
});

tests.register("Maximize single column: the destination's lone column shrinks when a column arrives", 8, () => {
    const config = getDefaultConfig();
    config.maximizeSingleColumn = true;
    config.defaultColumnWidth = "400px";
    const { qtMock, workspaceMock, world } = init(config);
    const [a, b] = workspaceMock.createClientsWithWidths(300, 300);
    workspaceMock.activeWindow = b;
    qtMock.fireShortcut("column-move-to-desktop-2");
    // b is alone on desktop 2; a is alone on desktop 1
    workspaceMock.currentDesktop = workspaceMock.desktops[0];
    workspaceMock.activeWindow = a;
    qtMock.fireShortcut("column-move-to-desktop-2");
    Assert.equal(widthOf(a), 400);
    Assert.equal(widthOf(b), 400);
});
