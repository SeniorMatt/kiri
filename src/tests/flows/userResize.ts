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

// niri sends the new sizes of all the windows of a column in one go and layouts the other columns from what the
// windows have committed: the neighbours below must not wait for the resized client, the columns beside must not
// run ahead of it (that opens gaps)
tests.register("Resize: the column follows the pointer's step, the other columns the commit", 14, () => {
    const config = getDefaultConfig();
    config.centerGridWhenFits = false;
    const { qtMock, workspaceMock } = init(config);
    const [left, top, bottom] = workspaceMock.createClientsWithWidths(300, 300, 200);
    qtMock.fireShortcut("window-move-left");
    const [far] = workspaceMock.createClientsWithWidths(250);
    const topStart = top.getFrameGeometryCopy();
    const bottomStart = bottom.getFrameGeometryCopy();
    const farStart = far.getFrameGeometryCopy();
    Assert.equal(bottomStart.x, topStart.x);

    top.slowClient = true;
    bottom.slowClient = true;
    workspaceMock.cursorPos = new MockQmlPoint(rectRight(topStart), rectBottom(topStart));
    top.resize = true;
    top.interactiveMoveResizeStarted.fire();

    const request = (dw: number, dh: number) => {
        const requested = new MockQmlRect(topStart.x, topStart.y, topStart.width + dw, topStart.height + dh);
        top.interactiveMoveResizeStepped.fire(requested);
        top.frameGeometry = requested; // the slow client has not committed it
        return requested;
    };

    const requested = request(30, 20);
    // the dragged window still has its old size, but the one below already has the new width and its new place
    Assert.equal(top.getActualFrameGeometry().width, topStart.width);
    Assert.rect(bottom.requestedGeometries[bottom.requestedGeometries.length - 1], topStart.x, topStart.y + requested.height + gapV, requested.width, tilingArea.y + tilingArea.height - (topStart.y + requested.height + gapV));
    // the columns beside wait for the commit
    Assert.equal(far.getActualFrameGeometry().x, farStart.x, { message: "the column on the right has not moved yet" });
    Assert.equal(left.getActualFrameGeometry().x, left.getActualFrameGeometry().x);

    // more steps while the one below has not committed: it is not sent a queue of sizes
    request(50, 30);
    request(70, 40);
    Assert.equal(bottom.requestedGeometries.length, 1, { message: "a client that has not committed is not sent another size" });

    // the resized client commits: the column on the right follows, and the one below gets the newest size
    top.commitRequestedGeometry();
    Assert.equal(rectRight(top.getActualFrameGeometry()), rectRight(topStart) + 70);
    Assert.equal(far.getActualFrameGeometry().x, farStart.x + 70, { message: "the column on the right follows the commit" });
    bottom.commitRequestedGeometry();
    Assert.equal(bottom.requestedGeometries.length, 1, { message: "the newest size is sent as soon as the previous one is committed" });
    Assert.equal(bottom.requestedGeometries[0].width, topStart.width + 70);
    Assert.equal(bottom.requestedGeometries[0].y, topStart.y + topStart.height + 40 + gapV);

    // let go: everything ends up where the last step said
    top.resize = false;
    top.interactiveMoveResizeFinished.fire();
    bottom.commitRequestedGeometry();
    const t = top.getActualFrameGeometry();
    const b = bottom.getActualFrameGeometry();
    Assert.equal(t.height, topStart.height + 40);
    Assert.equal(b.width, t.width);
    Assert.equal(b.y, t.y + t.height + gapV);
    Assert.equal(rectBottom(b), tilingArea.y + tilingArea.height);
});

tests.register("Resize from the left edge: the right edge stays and the window below follows the step", 6, () => {
    const config = getDefaultConfig();
    config.centerGridWhenFits = false; // niri keeps the view where it is
    const { qtMock, workspaceMock } = init(config);
    const [, top, bottom] = workspaceMock.createClientsWithWidths(300, 300, 200);
    qtMock.fireShortcut("window-move-left");
    workspaceMock.activeWindow = top;
    const topStart = top.getFrameGeometryCopy();
    top.slowClient = true;
    workspaceMock.cursorPos = new MockQmlPoint(topStart.x, rectBottom(topStart));
    top.resize = true;
    top.interactiveMoveResizeStarted.fire();
    const requested = new MockQmlRect(topStart.x - 40, topStart.y, topStart.width + 40, topStart.height);
    top.interactiveMoveResizeStepped.fire(requested);
    top.frameGeometry = requested;
    const b = bottom.getActualFrameGeometry();
    Assert.equal(b.x, topStart.x - 40, { message: "the window below follows the left edge" });
    Assert.equal(b.width, topStart.width + 40);
    top.commitRequestedGeometry();
    top.resize = false;
    top.interactiveMoveResizeFinished.fire();
    Assert.equal(rectRight(top.getActualFrameGeometry()), rectRight(topStart), { message: "the right edge stayed" });
    Assert.equal(rectRight(bottom.getActualFrameGeometry()), rectRight(topStart), { message: "the right edge of the window below stayed too" });
});
