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
