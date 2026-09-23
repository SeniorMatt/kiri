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
    const rightAligned = [client0, client1, client2].some(c => c.getActualFrameGeometry().x + c.getActualFrameGeometry().width === tilingArea.x + tilingArea.width);
    Assert.assert(x1 === tilingArea.x || client0.getActualFrameGeometry().x === tilingArea.x || rightAligned, { message: "should snap to a column edge" });

    // nothing happens without an ongoing gesture
    const before = client2.getActualFrameGeometry().clone();
    world.gestureScrollFinish(false);
    Assert.equalRects(client2.getActualFrameGeometry(), before);
});

tests.register("Gesture scroll: swipe switches between columns that all fit", 1, () => {
    const config = getDefaultConfig();
    config.gestureScroll = true;
    config.gestureScrollStep = 600;
    config.gestureSettleDuration = 0;
    const { qtMock, workspaceMock, world } = init(config);

    const [client0, client1] = workspaceMock.createClientsWithWidths(300, 300);
    workspaceMock.activeWindow = client0;
    const x0 = client0.getActualFrameGeometry().x;

    // swipe towards the right column: it gets focus, the view does not move
    world.gestureScroll(0.1);
    world.gestureScroll(0.3);
    world.gestureScrollFinish(false);
    Assert.equal(workspaceMock.activeWindow, client1);
    Assert.equal(client0.getActualFrameGeometry().x, x0);

    // and back
    world.gestureScroll(-0.1);
    world.gestureScroll(-0.3);
    world.gestureScrollFinish(false);
    Assert.equal(workspaceMock.activeWindow, client0);
    Assert.equal(client0.getActualFrameGeometry().x, x0);
});

tests.register("Gesture scroll: the view follows past the end and snaps back", 1, () => {
    const config = getDefaultConfig();
    config.gestureScroll = true;
    config.gestureScrollStep = 600;
    config.gestureSettleDuration = 0;
    const { qtMock, workspaceMock, world } = init(config);

    const [client0, client1, client2] = workspaceMock.createClientsWithWidths(600, 600, 600);
    workspaceMock.activeWindow = client0;
    const x0 = client0.getActualFrameGeometry().x;

    world.gestureScroll(-0.5);
    Assert.assert(client0.getActualFrameGeometry().x > x0, { message: "the view should follow the fingers past the first column" });
    world.gestureScrollFinish(false);
    Assert.equal(client0.getActualFrameGeometry().x, x0);
    Assert.equal(workspaceMock.activeWindow, client0);
});

tests.register("Gesture scroll: a few units of an axis guess are not a swipe", 1, () => {
    const config = getDefaultConfig();
    config.gestureScroll = true;
    config.gestureScrollStep = 600;
    config.gestureSettleDuration = 0;
    const { qtMock, workspaceMock, world } = init(config);

    const [client0, client1, client2] = workspaceMock.createClientsWithWidths(600, 600, 600);
    workspaceMock.activeWindow = client1;
    const x1 = client1.getActualFrameGeometry().x;

    // KWin started the horizontal handler (progress 0.01 = 2 units), then the swipe turned out vertical: cancelled
    world.gestureScroll(0.01);
    world.gestureScrollFinish(true);
    // the focus stays and the view does not move
    Assert.equal(workspaceMock.activeWindow, client1);
    Assert.equal(client1.getActualFrameGeometry().x, x1);
});

tests.register("Gesture scroll: niri parity, a swipe back and forth continues from the start", 1, () => {
    const config = getDefaultConfig();
    config.gestureScroll = true;
    config.gestureScrollStep = 600;
    config.gestureSettleDuration = 0;
    const { qtMock, workspaceMock, world } = init(config);

    const [client0, client1, client2] = workspaceMock.createClientsWithWidths(600, 600, 600);
    workspaceMock.activeWindow = client0;
    const x0 = client0.getActualFrameGeometry().x;
    // right 0.5 (300 px), then back through zero to the left (the handlers swap, progress counts from the start)
    world.gestureScroll(0.5);
    const xr = client0.getActualFrameGeometry().x;
    Assert.assert(xr < x0, { message: "view follows the fingers 1:1" });
    Assert.equal(x0 - xr, 300);
    world.gestureScroll(-0.25);        // the left handler: the view is past the start by 150 px (niri: no limit)
    Assert.equal(client0.getActualFrameGeometry().x - x0, 150);
    world.gestureScrollFinish(false);
    Assert.equal(client0.getActualFrameGeometry().x, x0);
});

tests.register("Gesture scroll: a column's right edge is a snap point too", 1, () => {
    const config = getDefaultConfig();
    config.gestureScroll = true;
    config.gestureScrollStep = 1000;
    config.gestureSettleDuration = 0;
    const { qtMock, workspaceMock, world } = init(config);

    // columns of 700 on a ~1000 wide area: the last column's right edge, then the one before it, align with the screen
    const clients = workspaceMock.createClientsWithWidths(700, 700, 700, 700);
    workspaceMock.activeWindow = clients[0];
    world.gestureScroll(0.0);
    world.gestureScroll(0.55);
    world.gestureScrollFinish(false);
    const area = tilingArea;
    const rightEdges = clients.map(c => c.getActualFrameGeometry().x + c.getActualFrameGeometry().width);
    const aligned = rightEdges.some(r => r === area.x + area.width);
    const leftAligned = clients.some(c => c.getActualFrameGeometry().x === area.x);
    Assert.assert(aligned || leftAligned, { message: "settles on an edge-aligned view" });
});
