// The script is unloaded and loaded again when Kiri mode is left and entered (kiri-mode): the windows stay, and the
// layout state that is not in them comes back from the saved JSON.
{
    function reload(config: Config, world: World) {
        const json = JSON.stringify(world.captureLayout());
        world.destroy();
        return new World(config, null, Kiri.parseState(json));
    }

    tests.register("State reload keeps a floated window floating", 5, () => {
        const config = getDefaultConfig();
        const { qtMock, workspaceMock, world } = init(config);
        const [a, b, c] = workspaceMock.createClientsWithWidths(300, 300, 300);
        workspaceMock.activeWindow = b;
        qtMock.fireShortcut("window-toggle-floating");
        b.fullScreen = true;
        const frame = b.getActualFrameGeometry();
        const others = [a.getActualFrameGeometry().x, c.getActualFrameGeometry().x];
        reload(config, world);
        Assert.assert(b.fullScreen, { message: "still full-screen" });
        Assert.equalRects(b.getActualFrameGeometry(), frame);
        // it is floating: the others fill the strip without it
        Assert.equalArrays([a.getActualFrameGeometry().x, c.getActualFrameGeometry().x], others);
        Assert.equalRects(b.getActualFrameGeometry(), frame);
    });

    tests.register("State reload keeps a resized height", 5, () => {
        const config = getDefaultConfig();
        config.presetHeights = "25%, 50%, 75%";
        const { qtMock, workspaceMock, world } = init(config);
        const [a, b] = workspaceMock.createClientsWithWidths(300, 300);
        workspaceMock.activeWindow = b;
        qtMock.fireShortcut("window-consume-or-expel-left"); // a b in one column
        qtMock.fireShortcut("window-height-cycle-presets");
        const heights = [a.getActualFrameGeometry().height, b.getActualFrameGeometry().height];
        Assert.assert(heights[0] !== heights[1], { message: "different heights" });
        reload(config, world);
        Assert.equal(a.getActualFrameGeometry().height, heights[0]);
        Assert.equal(b.getActualFrameGeometry().height, heights[1]);
    });

    tests.register("State reload keeps the scroll and the focused window", 5, () => {
        const config = getDefaultConfig();
        const { qtMock, workspaceMock, world } = init(config);
        const clients = workspaceMock.createClientsWithWidths(300, 300, 300, 300, 300, 300, 300, 300);
        workspaceMock.activeWindow = clients[0];
        workspaceMock.activeWindow = clients[5];
        const xs = clients.map(client => client.getActualFrameGeometry().x);
        reload(config, world);
        Assert.assert(Workspace.activeWindow === clients[5]);
        Assert.equalArrays(clients.map(client => client.getActualFrameGeometry().x), xs, { message: "the view is where it was" });
    });
}
