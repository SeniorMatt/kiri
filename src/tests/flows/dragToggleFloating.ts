// niri's move grab: the other mouse button toggles floating while a window is dragged (input/move_grab.rs on_toggle_floating)

function dragToggleConfig() {
    const config = getDefaultConfig();
    config.untileOnDrag = true;
    config.dropToTile = true;
    config.centerGridWhenFits = false;
    return config;
}

tests.register("Drag toggle: tiled window dragged as floating stays floating on the drop (niri)", 10, () => {
    const config = dragToggleConfig();
    const { qtMock, workspaceMock, world } = init(config);
    const clientManager = getClientManager(world);
    const [a, b, c] = workspaceMock.createClientsWithWidths(200, 200, 200);

    workspaceMock.cursorPos = new MockQmlPoint(700, 300);
    workspaceMock.moveWindow(a, new MockQmlPoint(300, 0), () => world.toggleDragFloating(), new MockQmlPoint(-300, 0));
    Assert.notTiledClient(clientManager, a);
    Assert.tiledClient(clientManager, b);
    Assert.tiledClient(clientManager, c);
});

tests.register("Drag toggle: toggling twice drops to the tile again (niri)", 10, () => {
    const config = dragToggleConfig();
    const { qtMock, workspaceMock, world } = init(config);
    const clientManager = getClientManager(world);
    const [a, b, c] = workspaceMock.createClientsWithWidths(200, 200, 200);

    workspaceMock.cursorPos = new MockQmlPoint(700, 300);
    workspaceMock.moveWindow(a, new MockQmlPoint(300, 0), () => world.toggleDragFloating(), () => world.toggleDragFloating(), new MockQmlPoint(-300, 0));
    Assert.tiledClient(clientManager, a);
});

tests.register("Drag toggle: before the 256 px the window leaves the grid at once (niri)", 10, () => {
    const config = dragToggleConfig();
    const { qtMock, workspaceMock, world } = init(config);
    const clientManager = getClientManager(world);
    const [a, b] = workspaceMock.createClientsWithWidths(200, 200);

    workspaceMock.cursorPos = new MockQmlPoint(700, 300);
    workspaceMock.moveWindow(a, new MockQmlPoint(20, 0), () => world.toggleDragFloating());
    // the drag is going on as a floating one: the window left the grid although it moved only 20 px
    Assert.notTiledClient(clientManager, a);
    Assert.tiledClient(clientManager, b);
});

tests.register("Drag toggle: a floating window dragged and toggled is dropped into the grid (niri)", 10, () => {
    const config = dragToggleConfig();
    const { qtMock, workspaceMock, world } = init(config);
    const clientManager = getClientManager(world);
    const [a, b] = workspaceMock.createClientsWithWidths(200, 200);
    clientManager.floatKwinClient(a);
    Assert.notTiledClient(clientManager, a);

    // without the toggle a floating window stays floating
    workspaceMock.cursorPos = new MockQmlPoint(700, 300);
    workspaceMock.moveWindow(a, new MockQmlPoint(30, 30));
    Assert.notTiledClient(clientManager, a);

    workspaceMock.moveWindow(a, new MockQmlPoint(30, 30), () => world.toggleDragFloating(), new MockQmlPoint(10, 0));
    Assert.tiledClient(clientManager, a);
});

tests.register("Drag toggle: nothing to toggle when no window is dragged", 5, () => {
    const config = dragToggleConfig();
    const { qtMock, workspaceMock, world } = init(config);
    const clientManager = getClientManager(world);
    const [a, b] = workspaceMock.createClientsWithWidths(200, 200);
    world.toggleDragFloating();
    Assert.tiledClient(clientManager, a);
    Assert.tiledClient(clientManager, b);
});
