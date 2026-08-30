tests.register("Gesture scroll", 1, () => {
    const config = getDefaultConfig();
    config.gestureScroll = true;
    config.gestureScrollStep = 600;
    config.gestureSettleDuration = 0;
    const { qtMock, workspaceMock, world } = init(config);

    const [client0, client1, client2] = workspaceMock.createClientsWithWidths(600, 600, 600);
    workspaceMock.activeWindow = client0;
    Assert.equal(client0.getActualFrameGeometry().x, tilingArea.x);

    // a short swipe left of the way: settles on a column edge, not in between
    world.gestureScroll(0.2);
    world.gestureScroll(0.4);
    world.gestureScrollFinish(false);
    const x1 = client1.getActualFrameGeometry().x;
    Assert.assert(x1 === tilingArea.x || client0.getActualFrameGeometry().x === tilingArea.x, { message: "should snap to a column" });

    // nothing happens without an ongoing gesture
    const before = client2.getActualFrameGeometry().clone();
    world.gestureScrollFinish(false);
    Assert.equalRects(client2.getActualFrameGeometry(), before);
});
