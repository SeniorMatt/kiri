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

tests.register("Resize from the left edge: the right edge stays, the window below follows", 6, () => {
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

// niri's Mod+right-drag in the top third of the lower window takes its top edge: the window gets taller, the one
// above gives up the height, and the top edge of the first window of a column does nothing
tests.register("Resize by the top edge of the lower window of a column", 7, () => {
    const config = getDefaultConfig();
    config.centerGridWhenFits = false;
    const { qtMock, workspaceMock } = init(config);
    const [, top, bottom] = workspaceMock.createClientsWithWidths(300, 300, 200);
    qtMock.fireShortcut("window-move-left");
    workspaceMock.activeWindow = bottom;
    const topStart = top.getFrameGeometryCopy();
    const bottomStart = bottom.getFrameGeometryCopy();

    workspaceMock.cursorPos = new MockQmlPoint(bottomStart.x + bottomStart.width / 2, bottomStart.y + 10);
    bottom.resize = true;
    bottom.interactiveMoveResizeStarted.fire();
    const requested = new MockQmlRect(bottomStart.x, bottomStart.y - 40, bottomStart.width, bottomStart.height + 40);
    bottom.interactiveMoveResizeStepped.fire(requested);
    bottom.frameGeometry = requested;
    bottom.resize = false;
    bottom.interactiveMoveResizeFinished.fire();
    const t = top.getActualFrameGeometry();
    const b = bottom.getActualFrameGeometry();
    Assert.equal(b.height, bottomStart.height + 40, { message: "the dragged window is taller" });
    Assert.equal(t.height, topStart.height - 40, { message: "the window above gave up the height" });
    Assert.equal(b.y, t.y + t.height + gapV);
    Assert.equal(rectBottom(b), tilingArea.y + tilingArea.height);

    // the top edge of the first window of the column does nothing
    top.resize = true;
    top.interactiveMoveResizeStarted.fire();
    const grab = new MockQmlRect(t.x, t.y - 30, t.width, t.height + 30);
    top.interactiveMoveResizeStepped.fire(grab);
    top.frameGeometry = grab;
    top.resize = false;
    top.interactiveMoveResizeFinished.fire();
    Assert.equal(top.getActualFrameGeometry().height, t.height);
    Assert.equal(bottom.getActualFrameGeometry().height, b.height);
    Assert.equal(top.getActualFrameGeometry().y, t.y);
});

tests.register("Closing a window in the middle of a resize ends the resize", 10, () => {
    const config = getDefaultConfig();
    const { qtMock, workspaceMock, world } = init(config);
    const [a, b] = workspaceMock.createClients(2);
    const resizing = () => {
        let result = false;
        world.do((clientManager, desktopManager) => {
            result = desktopManager.getCurrentDesktop()!.grid.isUserResizing();
        });
        return result;
    };
    workspaceMock.cursorPos = new MockQmlPoint(rectRight(b.frameGeometry), rectBottom(b.frameGeometry));
    b.resize = true;
    b.interactiveMoveResizeStarted.fire();
    Assert.assert(resizing(), { message: "the resize holds the grid" });
    workspaceMock.removeWindow(b);
    Assert.assert(!resizing(), { message: "the window is gone, so is its resize" });
});

// niri's double resize-click (input/mod.rs): pressing the resize button again on the same edge within 400 ms does not
// resize, it toggles the column's full width (left or right edge) or resets the window's height (top or bottom edge)
tests.register("Double resize-click on an edge", 3, () => {
    const config = getDefaultConfig();
    config.centerGridWhenFits = false;
    const { qtMock, workspaceMock } = init(config);
    const [, top, bottom] = workspaceMock.createClientsWithWidths(300, 300, 200);
    qtMock.fireShortcut("window-move-left");
    workspaceMock.activeWindow = top;
    let now = 5000;
    const realNow = Date.now;
    Date.now = () => now;
    try {
        const press = (client: MockKwinClient, fx: number, fy: number) => {
            const f = client.getFrameGeometryCopy();
            workspaceMock.cursorPos = new MockQmlPoint(f.x + f.width * fx, f.y + f.height * fy);
            client.resize = true;
            client.interactiveMoveResizeStarted.fire();
        };
        const release = (client: MockKwinClient) => {
            client.resize = false;
            client.interactiveMoveResizeFinished.fire();
        };

        // right edge: the first press resizes as usual, the second one toggles the full width
        const start = top.getFrameGeometryCopy();
        press(top, 0.95, 0.5);
        release(top);
        now += 200;
        press(top, 0.9, 0.5);
        release(top);
        Assert.equal(top.getActualFrameGeometry().width, tilingArea.width, { message: "the column has the full width" });
        Assert.equal(bottom.getActualFrameGeometry().width, tilingArea.width, { message: "the whole column has it" });
        // a double click again restores the width
        now += 1000;
        press(top, 0.95, 0.5);
        release(top);
        now += 100;
        press(top, 0.95, 0.5);
        release(top);
        Assert.equal(top.getActualFrameGeometry().width, start.width, { message: "the old width is back" });

        // too slow, or another edge: no double click (niri still does not start a resize for a second press so soon)
        now += 1000;
        press(top, 0.95, 0.5);
        release(top);
        now += 500;
        press(top, 0.95, 0.5);
        release(top);
        Assert.equal(top.getActualFrameGeometry().width, start.width, { message: "500 ms apart is no double click" });
        now += 100;
        press(top, 0.05, 0.5); // the left edge after a right one
        release(top);
        Assert.equal(top.getActualFrameGeometry().width, start.width, { message: "another edge is no double click" });

        // a triple click: the third press resizes again (a resize is started, so the layout follows the pointer)
        now += 1000;
        press(top, 0.95, 0.5);
        release(top);
        now += 100;
        press(top, 0.95, 0.5);
        release(top);
        now += 100;
        press(top, 0.95, 0.5);
        const stepped = new MockQmlRect(start.x, start.y, 250, start.height);
        top.interactiveMoveResizeStepped.fire(stepped);
        top.frameGeometry = stepped;
        release(top);
        Assert.equal(top.getActualFrameGeometry().width, 250, { message: "the third press resizes" });

        // the bottom edge: the height of the window is reset to auto
        now += 1000;
        const t0 = top.getFrameGeometryCopy();
        workspaceMock.cursorPos = new MockQmlPoint(t0.x + t0.width / 2, t0.y + t0.height - 5);
        top.resize = true;
        top.interactiveMoveResizeStarted.fire();
        const taller = new MockQmlRect(t0.x, t0.y, t0.width, t0.height + 60);
        top.interactiveMoveResizeStepped.fire(taller);
        top.frameGeometry = taller;
        release(top);
        const h = top.getActualFrameGeometry().height;
        Assert.equal(h, t0.height + 60, { message: "the window is taller" });
        now += 1000;
        press(top, 0.5, 0.95);
        release(top);
        now += 100;
        press(top, 0.5, 0.95);
        release(top);
        Assert.equal(top.getActualFrameGeometry().height, bottom.getActualFrameGeometry().height, { message: "equal heights again" });
        Assert.equal(top.getActualFrameGeometry().width, 250, { message: "the height reset left the width alone" });
    } finally {
        Date.now = realNow;
    }
});

// The windows of a column stay aligned while one of them is resized: they all start at the column's edge, whatever the
// view does meanwhile (niri's tile_offsets: a tile is at the column's x, a narrower one on the left, or on the right while
// the left edge is dragged), and what the pointer asks for beyond what the column can give is not given to the window.
tests.register("Resize keeps the windows of a column aligned", 6, () => {
    const config = getDefaultConfig();
    config.centerGridWhenFits = true; // the view moves while the column grows
    const { qtMock, workspaceMock } = init(config);
    const [, top, bottom] = workspaceMock.createClientsWithWidths(300, 300, 300);
    qtMock.fireShortcut("window-move-left");
    workspaceMock.activeWindow = bottom;
    const start = bottom.getFrameGeometryCopy();
    const topStart = top.getFrameGeometryCopy();
    Assert.equal(start.x, topStart.x);

    const realNow = Date.now;
    let now = 100000;
    Date.now = () => now;
    const dragEdge = (leftEdge: boolean) => {
        now += 1000; // not a double click
        workspaceMock.cursorPos = new MockQmlPoint(leftEdge ? start.x : rectRight(start), start.y + start.height / 2);
        bottom.resize = true;
        bottom.interactiveMoveResizeStarted.fire();
    };
    const step = (leftEdge: boolean, grow: number) => {
        const requested = leftEdge ?
            new MockQmlRect(start.x - grow, start.y, start.width + grow, start.height) :
            new MockQmlRect(start.x, start.y, start.width + grow, start.height);
        bottom.interactiveMoveResizeStepped.fire(requested);
        bottom.frameGeometry = requested;
        const t = top.getActualFrameGeometry();
        const b = bottom.getActualFrameGeometry();
        // where the dragged window is painted: KWin owns its frame, Kiri tells the effect where the layout has it
        const painted = visualPositions.get(String(bottom.internalId));
        const bx = painted !== undefined ? painted[0] : b.x;
        Assert.equal(t.width, b.width, { message: "the windows of the column are as wide as each other" });
        if (!leftEdge) {
            Assert.equal(t.x, bx, { message: "and start at the same place" });
        } else {
            Assert.equal(rectRight(t), bx + b.width, { message: "and end at the same place when the left edge is dragged" });
        }
    };

    dragEdge(false);
    step(false, 20);
    step(false, 60);
    step(false, 100);
    bottom.resize = false;
    bottom.interactiveMoveResizeFinished.fire();
    Assert.equal(top.getActualFrameGeometry().x, bottom.getActualFrameGeometry().x);

    const b1 = bottom.getFrameGeometryCopy();
    start.x = b1.x;
    start.width = b1.width;
    dragEdge(true);
    step(true, 20);
    step(true, 50);
    bottom.resize = false;
    bottom.interactiveMoveResizeFinished.fire();
    Assert.equal(rectRight(top.getActualFrameGeometry()), rectRight(bottom.getActualFrameGeometry()));
    Date.now = realNow;
});

// niri's column heights: the dragged window gets the height under the pointer but never more than what is left after the
// minimum heights of the others; KWin lets the dragged window go on growing over them, so its frame is held at what fits
tests.register("Resize by the top edge stops at the height of the others' minimum", 3, () => {
    const config = getDefaultConfig();
    config.centerGridWhenFits = false;
    const { qtMock, workspaceMock } = init(config);
    const [, top, bottom] = workspaceMock.createClientsWithWidths(300, 300, 300);
    qtMock.fireShortcut("window-move-left");
    workspaceMock.activeWindow = bottom;
    top.minSize = new MockQmlSize(100, 100);
    const topStart = top.getFrameGeometryCopy();
    const start = bottom.getFrameGeometryCopy();
    workspaceMock.cursorPos = new MockQmlPoint(start.x + start.width / 2, start.y + 5);
    bottom.resize = true;
    bottom.interactiveMoveResizeStarted.fire();
    const grab = (up: number) => {
        const requested = new MockQmlRect(start.x, start.y - up, start.width, start.height + up);
        bottom.frameGeometry = requested; // KWin moves the window with the pointer, then tells the step
        bottom.interactiveMoveResizeStepped.fire(requested);
    };
    grab(40);
    Assert.equal(top.getActualFrameGeometry().height, topStart.height - 40);
    grab(10000); // the pointer is far above the window
    const t = top.getActualFrameGeometry();
    const b = bottom.getActualFrameGeometry();
    Assert.equal(t.height, 100, { message: "the window above keeps its minimum height" });
    Assert.equal(b.y, t.y + t.height + gapV, { message: "the dragged window starts right below it, without overlap" });
    Assert.equal(rectBottom(b), tilingArea.y + tilingArea.height);
    bottom.resize = false;
    bottom.interactiveMoveResizeFinished.fire();
    Assert.equal(top.getActualFrameGeometry().height, 100);
    Assert.rect(bottom.getActualFrameGeometry(), start.x, t.y + t.height + gapV, start.width, tilingArea.y + tilingArea.height - (t.y + t.height + gapV));
});
