// niri's center-column and center-visible-columns
tests.register("Center column (niri)", 5, () => {
    const config = getDefaultConfig();
    const { qtMock, workspaceMock, world } = init(config);

    const [client0, client1, client2] = workspaceMock.createClientsWithWidths(300, 152, 300);
    Assert.assert(workspaceMock.activeWindow === client2);
    Assert.columnsFillTilingArea([client0, client1, client2]);

    // center client2, even though that pushes the others off screen
    qtMock.fireShortcut("grid-scroll-focused");
    Assert.centered(config, tilingArea, client2);

    // pressing it again changes nothing, there is no toggling back
    qtMock.fireShortcut("grid-scroll-focused");
    Assert.centered(config, tilingArea, client2);

    // focusing client1 doesn't scroll as it is visible; centering it does
    qtMock.fireShortcut("focus-left");
    Assert.centered(config, tilingArea, client2, { message: "No scrolling should have occured" });
    qtMock.fireShortcut("grid-scroll-focused");
    Assert.centered(config, tilingArea, client1);
});

tests.register("Center visible columns (niri)", 5, () => {
    const config = getDefaultConfig();
    config.centerGridWhenFits = false;
    const { qtMock, workspaceMock, world } = init(config);

    const [client0, client1, client2, client3] = workspaceMock.createClientsWithWidths(200, 200, 200, 200);
    // client3 is focused: the view shows client1..client3 aligned to the right edge
    qtMock.fireShortcut("focus-right"); // no-op
    const before = [client1, client2, client3].map(c => c.getActualFrameGeometry().x);
    qtMock.fireShortcut("column-center-visible");
    const left = client1.getActualFrameGeometry().x;
    const right = rectRight(client3.getActualFrameGeometry());
    Assert.assert(Math.abs((left - tilingArea.x) - (rectRight(tilingArea) - right)) <= 1, { message: "the visible columns are centered as a group" });
    Assert.assert(client1.getActualFrameGeometry().x !== before[0] || before[0] === left);
});
