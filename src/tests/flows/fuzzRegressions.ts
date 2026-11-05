// Bugs the random stress test (fuzz.ts) found, each as the smallest sequence that shows it
{
    function assertFocusedColumnInView(world: World, workspaceMock: MockWorkspace) {
        world.do((clientManager, desktopManager) => {
            const desktop = desktopManager.getCurrentDesktop()!;
            const window = clientManager.findTiledWindow(workspaceMock.activeWindow!)!;
            Assert.assert(Range.contains(desktop.getCurrentVisibleRange(), window.column), {
                message: `the focused column [${window.column.getLeft()}, ${window.column.getRight()}] is in the view [${desktop.getCurrentVisibleRange().getLeft()}, ${desktop.getCurrentVisibleRange().getRight()}]`,
            });
        });
    }

    tests.register("Swapping a maximized window into a narrower column keeps the focused column in view", 1, () => {
        const config = getDefaultConfig();
        const { qtMock, workspaceMock, world } = init(config);
        const [a, b, c] = workspaceMock.createClientsWithWidths(300, 300, 300);
        workspaceMock.activeWindow = c;
        qtMock.fireShortcut("window-consume-or-expel-left"); // b c in one column
        a.setMaximize(true, true);
        workspaceMock.activeWindow = b;
        workspaceMock.activeWindow = a;
        qtMock.fireShortcut("window-swap-right");
        Assert.assert(workspaceMock.activeWindow === a);
        assertFocusedColumnInView(world, workspaceMock);
    });

    tests.register("A script reload keeps the focused window in view when it was not in the saved layout", 1, () => {
        const config = getDefaultConfig();
        const { workspaceMock, world } = init(config);
        const [a, b, c] = workspaceMock.createClientsWithWidths(400, 400, 400);
        workspaceMock.activeWindow = a;
        workspaceMock.activeWindow = c;
        workspaceMock.moveWindow(c, new MockQmlPoint(300, 0), new MockQmlPoint(-300, 0)); // dragged out of the grid: floating, still focused
        workspaceMock.activeWindow = a; // the view is at the left end
        workspaceMock.activeWindow = c;
        world.do((clientManager) => Assert.assert(clientManager.isFloating(c), { message: "invalid test setup: the dragged window floats" }));
        const json = JSON.stringify(world.captureLayout());
        world.destroy();
        const reloaded = new World(config, null, Kiri.parseState(json)); // the dragged window is tiled again
        assertFocusedColumnInView(reloaded, workspaceMock);
        reloaded.destroy();
    });
}
