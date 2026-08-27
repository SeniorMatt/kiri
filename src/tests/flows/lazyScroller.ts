tests.register("LazyScroller", 20, () => {
    const config = getDefaultConfig();
    config.scrollingLazy = true;
    config.scrollingCentered = false;
    config.scrollingGrouped = false;
    const { qtMock, workspaceMock, world } = init(config);

    const [client1] = workspaceMock.createClientsWithWidths(300);
    Assert.grid(config, tilingArea, 300, [[client1]], true);

    const [client2] = workspaceMock.createClientsWithWidths(300);
    Assert.grid(config, tilingArea, 300, [[client1], [client2]], true);

    const [client3] = workspaceMock.createClientsWithWidths(300);
    Assert.grid(config, tilingArea, 300, [[client1], [client2], [client3]], false);
    Assert.equal(rectRight(client3.getActualFrameGeometry()), rectRight(tilingArea));

    runOneOf(
        () => { workspaceMock.activeWindow = client2; },
        () => { qtMock.fireShortcut("kniri-focus-2"); },
        () => { qtMock.fireShortcut("kniri-focus-left"); },
    );
    Assert.grid(config, tilingArea, 300, [[client1], [client2], [client3]], false);
    Assert.equal(rectRight(client3.getActualFrameGeometry()), rectRight(tilingArea));

    runOneOf(
        () => { workspaceMock.activeWindow = client1; },
        () => { qtMock.fireShortcut("kniri-focus-1"); },
        () => { qtMock.fireShortcut("kniri-focus-left"); },
        () => { qtMock.fireShortcut("kniri-focus-start"); },
    );
    workspaceMock.activeWindow = client1;
    Assert.grid(config, tilingArea, 300, [[client1], [client2], [client3]], false);
    Assert.equal(client1.getActualFrameGeometry().x, tilingArea.x);

    qtMock.fireShortcut("kniri-grid-scroll-focused");
    Assert.grid(config, tilingArea, 300, [[client1], [client2], [client3]], false);
    Assert.grid(config, tilingArea, 300, [[client1]], true);

    runOneOf(
        () => { workspaceMock.activeWindow = client2; },
        () => { qtMock.fireShortcut("kniri-focus-2"); },
        () => { qtMock.fireShortcut("kniri-focus-right"); },
    );
    Assert.grid(config, tilingArea, 300, [[client1], [client2], [client3]], false);
    Assert.equal(client1.getActualFrameGeometry().x, tilingArea.x);
});
