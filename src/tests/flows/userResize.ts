tests.register("User resize", 10, () => {
    const config = getDefaultConfig();
    config.resizeNeighborColumn = true;

    const h = getWindowHeight(2);
    let clientLeft: MockKwinClient, clientRightTop: MockKwinClient, clientRightBottom: MockKwinClient;
    function assertSizes(leftWidth: number, rightWidth: number, topHeight: number, bottomHeight: number) {
        const { left, right } = getGridBounds(clientLeft, clientRightTop);
        Assert.rect(clientLeft.getActualFrameGeometry(), left, tilingArea.y, leftWidth, tilingArea.height);
        Assert.rect(clientRightTop.getActualFrameGeometry(), left+leftWidth+gapH, tilingArea.y, rightWidth, topHeight);
        Assert.rect(clientRightBottom.getActualFrameGeometry(), left+leftWidth+gapH, tilingArea.y+topHeight+gapV, rightWidth, bottomHeight);
    }

    {
        const { qtMock, workspaceMock, world } = init(config);
        [clientLeft, clientRightTop, clientRightBottom] = workspaceMock.createClientsWithWidths(300, 300, 200);
        qtMock.fireShortcut("window-move-left");
        assertSizes(300, 300, h, h);

        workspaceMock.resizeWindow(clientLeft, false, false, false, new MockQmlSize(10, 20));
        assertSizes(310, 300, h, h);

        workspaceMock.resizeWindow(clientLeft, true, false, false, new MockQmlSize(10, 0), new MockQmlSize(-10, 0));
        assertSizes(310, 300, h, h);

        workspaceMock.resizeWindow(clientRightTop, false, false, false, new MockQmlSize(-5, -10), new MockQmlSize(-5, -10));
        assertSizes(310, 290, h-20, h+20);

        workspaceMock.resizeWindow(clientRightBottom, false, false, false, new MockQmlSize(-10, 20));
        assertSizes(310, 280, h-40, h+40);

        workspaceMock.resizeWindow(clientRightBottom, false, false, true, new MockQmlSize(0, 20));
        assertSizes(310, 280, h-60, h+60);
    }

    {
        const { qtMock, workspaceMock, world } = init(config);
        [clientLeft, clientRightTop, clientRightBottom] = workspaceMock.createClientsWithWidths(300, 300, 200);
        qtMock.fireShortcut("window-move-left");
        assertSizes(300, 300, h, h);

        workspaceMock.resizeWindow(clientLeft, true, false, false, new MockQmlSize(10, 20));
        assertSizes(310, 290, h, h);

        workspaceMock.resizeWindow(clientLeft, true, false, false, new MockQmlSize(10, 0), new MockQmlSize(-10, 0));
        assertSizes(310, 290, h, h);

        workspaceMock.resizeWindow(clientRightTop, true, false, false, new MockQmlSize(-5, -10), new MockQmlSize(-5, -10));
        assertSizes(310, 280, h-20, h+20);

        workspaceMock.resizeWindow(clientRightBottom, true, true, false, new MockQmlSize(-10, 20));
        assertSizes(320, 270, h-40, h+40);

        workspaceMock.resizeWindow(clientRightBottom, true, false, true, new MockQmlSize(0, 20));
        assertSizes(320, 270, h-60, h+60);
    }

    {
        const { qtMock, workspaceMock, world } = init(config);
        [clientLeft, clientRightTop, clientRightBottom] = workspaceMock.createClientsWithWidths(300, 300, 200);
        clientRightBottom.minSize = new MockQmlSize(295, h-20);
        qtMock.fireShortcut("window-move-left");
        assertSizes(300, 300, h, h);

        workspaceMock.resizeWindow(clientLeft, true, false, false, new MockQmlSize(10, 20));
        assertSizes(310, 295, h, h);

        workspaceMock.resizeWindow(clientLeft, true, false, false, new MockQmlSize(10, 0), new MockQmlSize(-10, 0));
        assertSizes(310, 295, h, h);

        workspaceMock.resizeWindow(clientRightTop, true, false, false, new MockQmlSize(-5, -10), new MockQmlSize(-5, -10));
        assertSizes(310, 295, h-20, h+20);

        workspaceMock.resizeWindow(clientRightBottom, true, true, false, new MockQmlSize(-10, 20));
        assertSizes(310, 295, h-40, h+40);

        workspaceMock.resizeWindow(clientRightTop, true, true, false, new MockQmlSize(-10, 0));
        assertSizes(310, 295, h-40, h+40);

        // TODO
        // workspaceMock.resizeWindow(clientRightBottom, true, false, true, new MockQmlSize(0, -80));
        // assertSizes(310, 295, h+60, h-20);
    }

    {
        const { qtMock, workspaceMock, world } = init(config);
        const [clientLeftTop, clientLeftBottom, clientRight] = workspaceMock.createClientsWithWidths(300, 200, 300);
        clientLeftBottom.minSize = new MockQmlSize(295, h-20);

        function assertSizes(leftWidth: number, rightWidth: number, topHeight: number, bottomHeight: number) {
            const { left, right } = getGridBounds(clientLeftTop, clientRight);
            Assert.rect(clientLeftTop.getActualFrameGeometry(), left, tilingArea.y, leftWidth, topHeight);
            Assert.rect(clientLeftBottom.getActualFrameGeometry(), left, tilingArea.y+topHeight+gapV, leftWidth, bottomHeight);
            Assert.rect(clientRight.getActualFrameGeometry(), left+leftWidth+gapH, tilingArea.y, rightWidth, tilingArea.height);
        }

        workspaceMock.activeWindow = clientLeftBottom;
        qtMock.fireShortcut("window-move-left");
        assertSizes(300, 300, h, h);

        workspaceMock.resizeWindow(clientLeftTop, true, false, false, new MockQmlSize(-10, 0));
        assertSizes(295, 305, h, h);

        workspaceMock.resizeWindow(clientLeftTop, true, false, false, new MockQmlSize(10, 0));
        assertSizes(305, 295, h, h);

        workspaceMock.resizeWindow(clientLeftTop, true, false, false, new MockQmlSize(-20, 0), new MockQmlSize(20, 0));
        assertSizes(305, 295, h, h);
    }
});

tests.register("User resize keeps the column centered", 1, () => {
    const config = getDefaultConfig();
    config.scrollingCentered = true;
    config.scrollingLazy = false;
    config.scrollingGrouped = false;
    const { qtMock, workspaceMock, world } = init(config);
    const [c1, c2, c3] = workspaceMock.createClientsWithWidths(300, 300, 300);
    workspaceMock.activeWindow = c1;
    workspaceMock.activeWindow = c2;
    const center = (c: MockKwinClient) => {
        const f = c.getActualFrameGeometry();
        return f.x + f.width/2;
    };
    const areaCenter = tilingArea.x + tilingArea.width/2;
    Assert.equal(center(c2), areaCenter);

    // still dragging: the column must already be centered
    const frame = c2.getFrameGeometryCopy();
    c2.resize = true;
    c2.interactiveMoveResizeStarted.fire();
    frame.width += 100;
    c2.frameGeometry = frame;
    // the dragged window is left alone, the neighbours show where the column sits: it is 400 wide now
    Assert.equal(rectRight(c1.getActualFrameGeometry()) + gapH, areaCenter - 200);
    c2.resize = false;
    c2.interactiveMoveResizeFinished.fire();
    Assert.equal(center(c2), areaCenter);
});

tests.register("Resizing a floating window leaves the tiled layout alone", 3, () => {
    for (const edgeResize of [false, true]) {
        for (const leftEdge of [false, true]) {
            const { qtMock, workspaceMock } = init(getDefaultConfig());
            const [a, b, c, floating] = workspaceMock.createClients(4);
            workspaceMock.activeWindow = floating;
            qtMock.fireShortcut("window-toggle-floating");
            const before = [a, b, c].map(client => client.getActualFrameGeometry().clone());
            const floatingBefore = floating.getFrameGeometryCopy();

            workspaceMock.resizeWindow(floating, edgeResize, leftEdge, false, new MockQmlSize(40, 30), new MockQmlSize(20, 10));

            const floatingAfter = floating.getActualFrameGeometry();
            Assert.equal(floatingAfter.width, floatingBefore.width + 60);
            Assert.equal(floatingAfter.height, floatingBefore.height + 40);
            [a, b, c].forEach((client, i) => Assert.rect(
                client.getActualFrameGeometry(), before[i].x, before[i].y, before[i].width, before[i].height,
            ));
        }
    }
});

tests.register("Column width is kept after leaving full-screen mode", 5, () => {
    const { workspaceMock } = init(getDefaultConfig());
    const [a, b] = workspaceMock.createClientsWithWidths(300, 400);
    workspaceMock.activeWindow = b;
    b.fullScreen = true;
    b.fullScreen = false;
    Assert.equal(b.getActualFrameGeometry().width, 400);
    Assert.equal(a.getActualFrameGeometry().width, 300);
});
