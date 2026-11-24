tests.register("Drag tiled window, untile", 20, () => {
    const config = getDefaultConfig();
    config.untileOnDrag = true;
    const { qtMock, workspaceMock, world } = init(config);
    const clientManager = getClientManager(world);

    const [client0, client1] = workspaceMock.createClients(2);
    Assert.tiledClient(clientManager, client0);
    Assert.tiledClient(clientManager, client1);
    Assert.grid(config, tilingArea, 100, [[client0], [client1]], true);

    workspaceMock.moveWindow(client0, new MockQmlPoint(300, 0), new MockQmlPoint(-300, 0)); // niri: 256 px before the window leaves the grid
    Assert.notTiledClient(clientManager, client0);
    Assert.tiledClient(clientManager, client1);
    Assert.grid(config, tilingArea, 100, [[client1]], true);
});

tests.register("Drag tiled window, keep tiled", 20, () => {
    const config = getDefaultConfig();
    config.untileOnDrag = false;
    const { qtMock, workspaceMock, world } = init(config);
    const clientManager = getClientManager(world);

    const [client0, client1] = workspaceMock.createClients(2);
    Assert.tiledClient(clientManager, client0);
    Assert.tiledClient(clientManager, client1);
    Assert.grid(config, tilingArea, 100, [[client0], [client1]], true);

    const move = new MockQmlPoint(10, 10);
    // many moves in order to trigger externalFrameGeometryChangedRateLimiter
    workspaceMock.moveWindow(client0, move, move, move, move, move, move, move, move, move);
    Assert.tiledClient(clientManager, client0);
    Assert.tiledClient(clientManager, client1);
    Assert.grid(config, tilingArea, 100, [[client0], [client1]], true);
});

tests.register("Drag tiled window, drop to tile (niri)", 10, () => {
    const config = getDefaultConfig();
    config.untileOnDrag = true;
    config.dropToTile = true;
    config.centerGridWhenFits = false;
    const { qtMock, workspaceMock, world } = init(config);
    const clientManager = getClientManager(world);

    function layout() {
        const [a, b, c] = clients;
        return [a, b, c].map(client => Math.round(client.getActualFrameGeometry().x)).join();
    }
    const clients = workspaceMock.createClientsWithWidths(200, 200, 200);
    const [a, b, c] = clients;
    const startX = a.getActualFrameGeometry().x;

    // dropped past the last column: the window becomes the last column
    workspaceMock.cursorPos = new MockQmlPoint(700, 300);
    workspaceMock.moveWindow(a, new MockQmlPoint(300, 0), new MockQmlPoint(-300, 0));
    Assert.tiledClient(clientManager, a);
    Assert.assert(a.getActualFrameGeometry().x > c.getActualFrameGeometry().x, { message: "a is the last column" });
    Assert.assert(b.getActualFrameGeometry().x === startX, { message: "b moved to the front: " + layout() });

    // dropped at the top of a column: it goes into the column, above its window
    const bx = b.getActualFrameGeometry().x;
    workspaceMock.cursorPos = new MockQmlPoint(bx + 100, tilingArea.y + 2);
    workspaceMock.moveWindow(c, new MockQmlPoint(300, 0), new MockQmlPoint(-300, 0));
    Assert.tiledClient(clientManager, c);
    Assert.assert(Math.abs(c.getActualFrameGeometry().x - b.getActualFrameGeometry().x) < 1, { message: "c joined b's column" });
    Assert.assert(c.getActualFrameGeometry().y < b.getActualFrameGeometry().y, { message: "c is above b" });
});

tests.register("Drag tiled window out past the screen edge, no jump (niri)", 10, () => {
    const config = getDefaultConfig();
    config.untileOnDrag = true;
    config.dropToTile = false;
    const { qtMock, workspaceMock, world } = init(config);
    const clientManager = getClientManager(world);

    const [client0, client1] = workspaceMock.createClients(2);
    const width = client0.getActualFrameGeometry().width;
    // once the pointer takes the window over the right edge of the screen, it stays where the pointer puts it
    const target = screen.width - width / 2;
    const dx = target - client0.getActualFrameGeometry().x;
    workspaceMock.moveWindow(client0, new MockQmlPoint(dx, 0));
    Assert.notTiledClient(clientManager, client0);
    Assert.equal(Math.round(client0.getActualFrameGeometry().x), Math.round(target), { message: "the dragged window is not moved back into the screen" });
});
