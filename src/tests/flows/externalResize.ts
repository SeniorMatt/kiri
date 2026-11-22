tests.register("External resize", 1, () => {
    const config = getDefaultConfig();
    const { qtMock, workspaceMock, world } = init(config);

    function getClientDesiredFrame(width: number) {
        return new MockQmlRect(10, 10, width, 200);
    }

    function getTiledFrame(width: number) {
        return new MockQmlRect(
            tilingArea.x + Math.round((tilingArea.width - width) / 2),
            tilingArea.y,
            width,
            tilingArea.height,
        );
    }

    const [client] = workspaceMock.createClientsWithFrames(getClientDesiredFrame(100));
    Assert.equalRects(client.getActualFrameGeometry(), getTiledFrame(100), { message: "We should tile the window, respecting its desired width" });

    function testExternalResizing() {
        client.frameGeometry = getClientDesiredFrame(110);
        Assert.equalRects(client.getActualFrameGeometry(), getTiledFrame(110), { message: "We should re-arrange the window, respecting its new desired width" });

        client.frameGeometry = getClientDesiredFrame(120);
        Assert.equalRects(client.getActualFrameGeometry(), getTiledFrame(120), { message: "We should re-arrange the window, respecting its new desired width" });

        client.frameGeometry = getClientDesiredFrame(130);
        Assert.equalRects(client.getActualFrameGeometry(), getTiledFrame(130), { message: "We should re-arrange the window, respecting its new desired width" });

        client.frameGeometry = getClientDesiredFrame(140);
        Assert.equalRects(client.getActualFrameGeometry(), getTiledFrame(140), { message: "We should re-arrange the window, respecting its new desired width" });

        client.frameGeometry = getClientDesiredFrame(200);
        Assert.equalRects(client.getActualFrameGeometry(), getClientDesiredFrame(200), { message: "We should give up and let the client have its desired frame" });
    }

    MockQmlTimer.deferred = true; // the relayout that follows a rate limited burst waits
    try {
        timeControl(addTime => {
            testExternalResizing();
            addTime(1000);
            // the concession has expired, let's test again
            testExternalResizing();
        });
    } finally {
        MockQmlTimer.deferred = false;
    }
});

tests.register("A rate limited external resize gets one relayout afterwards", 1, () => {
    const { workspaceMock } = init(getDefaultConfig());
    const [client] = workspaceMock.createClientsWithFrames(new MockQmlRect(10, 10, 100, 200));
    const tiled = client.getActualFrameGeometry();
    MockQmlTimer.deferred = true;
    try {
        timeControl(() => {
            for (const width of [110, 120, 130, 140, 200]) {
                client.frameGeometry = new MockQmlRect(10, 10, width, 200);
            }
            Assert.equal(client.getActualFrameGeometry().width, 200); // the last event was dropped
            MockQmlTimer.flush();
            Assert.equal(client.getActualFrameGeometry().x, Math.round((tilingArea.width - 140) / 2) + tilingArea.x);
        });
    } finally {
        MockQmlTimer.deferred = false;
    }
    Assert.equal(tiled.width, 100);
});

tests.register("Windows that KWin pulls back to the screen edge are put back at once, however many", 1, () => {
    const { workspaceMock } = init(getDefaultConfig());
    const clients = workspaceMock.createClientsWithFrames(...[0, 1, 2, 3, 4, 5, 6, 7].map(() => new MockQmlRect(10, 10, 100, 200)));
    const slots = clients.map(client => client.getActualFrameGeometry());
    // KWin moves every window to the edge in one burst after the desktop changed: same size, other place
    MockQmlTimer.deferred = true; // the rate limited relayout would only come later
    try {
        for (const client of clients) {
            const frame = client.getActualFrameGeometry();
            client.frameGeometry = new MockQmlRect(-frame.width + 100, frame.y, frame.width, frame.height);
        }
    } finally {
        MockQmlTimer.deferred = false;
    }
    clients.forEach((client, i) => {
        Assert.equalRects(client.getActualFrameGeometry(), slots[i], { message: "window " + i + " should be back in its slot" });
    });
});

tests.register("A window that snaps to its own height is not pulled in from beyond the right edge", 1, () => {
    const config = getDefaultConfig();
    const { qtMock, workspaceMock } = init(config);
    // KWin keeps 100 px of a window on the screen when the window commits an answer to a configure, and a CSD
    // terminal commits a height other than the asked one every time: its slot must still be where the layout puts it
    const wide = () => new MockQmlRect(0, 0, tilingArea.width - 20, 200);
    const terminal = new MockKwinClient(wide());
    terminal.slowClient = true; // the commit comes later, outside of Kiri's own assignment
    terminal.heightStep = 37;
    terminal.keepsVisible = true;
    const others = workspaceMock.createClientsWithFrames(wide(), wide());
    workspaceMock.createWindows(terminal);
    const expectedX = () => {
        const previous = others[1].getActualFrameGeometry();
        return previous.x + previous.width + config.gapsInnerHorizontal;
    };
    for (const key of ["focus-start", "focus-end", "focus-start", "focus-right", "focus-start"]) {
        qtMock.fireShortcut(key);
        terminal.commitRequestedGeometry();
        terminal.commitRequestedGeometry();
        Assert.equal(terminal.getActualFrameGeometry().x, expectedX(), { message: "after " + key });
    }
    Assert.assert(terminal.getActualFrameGeometry().x >= screen.width, { message: "the window is meant to be off screen" });
});

// niri gives a tile the slot's size and leaves a window that has another size at the slot's top-left; it does not ask
// again for a size the window has answered with another one (Kiri did, and a terminal that snaps to whole cells then
// flipped between the two sizes for ever, drifting from the column's x)
tests.register("A window that snaps to its own height is not asked for the same size again", 1, () => {
    const config = getDefaultConfig();
    const { qtMock, workspaceMock } = init(config);
    const [first, terminal] = workspaceMock.createClientsWithWidths(300, 300);
    terminal.heightStep = 37;
    qtMock.fireShortcut("window-move-left"); // both in one column: the terminal is the lower window
    const column = terminal.getFrameGeometryCopy();
    Assert.equal(column.x, first.getFrameGeometryCopy().x);
    for (let i = 0; i < 6; i++) {
        qtMock.fireShortcut(i % 2 === 0 ? "focus-up" : "focus-down");
    }
    const asked = terminal.assignedGeometries.length;
    for (let i = 0; i < 6; i++) {
        qtMock.fireShortcut(i % 2 === 0 ? "focus-up" : "focus-down");
    }
    Assert.equal(terminal.assignedGeometries.length, asked, { message: "the layout passes do not ask the terminal for its size again" });
    const t = terminal.getActualFrameGeometry();
    Assert.equal(t.height % 37, 0, { message: "the terminal has its own size" });
    Assert.equal(t.x, first.getActualFrameGeometry().x, { message: "and stays aligned with the window above" });
});
