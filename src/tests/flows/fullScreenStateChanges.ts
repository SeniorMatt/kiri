// issue 56: a tiled window that goes full-screen untiled itself when it changed state (a new title, a new minimum
// size, a short leave and re-enter of full-screen mode) while it was full-screen
for (const tileFullScreen of [true, false]) {
    tests.register("A full-screen window stays tiled when it changes state (tileFullScreen " + tileFullScreen + ")", 5, () => {
        const config = getDefaultConfig();
        config.tileFullScreen = tileFullScreen;
        const { workspaceMock, world } = init(config);
        const [other, client] = workspaceMock.createClientsWithWidths(300, 300);
        workspaceMock.activeWindow = client;

        const assertTiled = (message: string) => world.do(clientManager => {
            Assert.tiledClient(clientManager, client, { message: message });
            Assert.tiledClient(clientManager, other, { message: message + " (the neighbour)" });
        });
        client.fullScreen = true;
        assertTiled("entered full-screen");

        client.caption = "Downloads";
        client.captionChanged.fire(); // `cd Downloads/`, the next video, a new directory
        assertTiled("the title changed");

        client.minSize = new MockQmlSize(250, 200);
        const frame = client.getFrameGeometryCopy();
        client.frameGeometry = new MockQmlRect(frame.x, frame.y, frame.width, frame.height - 1);
        client.frameGeometry = frame;
        assertTiled("the client changed its own frame");

        client.fullScreen = false; // the video changes: the browser leaves and enters full-screen mode again
        client.fullScreen = true;
        assertTiled("left and entered full-screen");
        client.fullScreen = false;
        assertTiled("left full-screen");
        Assert.assert(Math.round(client.getActualFrameGeometry().width) <= tilingArea.width, { message: "it is a column again" });
    });
}
