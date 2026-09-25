tests.register("Column widths come back after the screen was smaller for a while", 1, () => {
    const config = getDefaultConfig();
    const { qtMock, workspaceMock } = init(config);
    const fullScreen = screen;

    const clients = workspaceMock.createClientsWithWidths(400, 300);
    const widths = () => clients.map(client => Math.round(client.getActualFrameGeometry().width));
    Assert.equalArrays(widths(), [400, 300]);

    timeControl(addTime => {
        // the output goes away: the screen shrinks and KWin squeezes the windows into it
        screen = new MockQmlRect(0, 0, 300, 600);
        workspaceMock.virtualScreenSizeChanged.fire();
        for (const client of clients) {
            const frame = client.getFrameGeometryCopy();
            client.frameGeometry = new MockQmlRect(frame.x, frame.y, Math.min(frame.width, 200), frame.height);
        }
        addTime(500);
        Assert.assert(widths().every(width => width <= 300), { message: "the columns fit the small screen" });

        // the output comes back, KWin sets the windows to their old size or not
        addTime(500);
        screen = fullScreen;
        workspaceMock.virtualScreenSizeChanged.fire();
        const frame = clients[0].getFrameGeometryCopy();
        clients[0].frameGeometry = new MockQmlRect(frame.x, frame.y, 200, frame.height);
        addTime(5000);
        workspaceMock.virtualScreenSizeChanged.fire();

        Assert.equalArrays(widths(), [400, 300]);
    });
});

tests.register("A client resizing itself is still adopted when the screen is stable", 1, () => {
    const config = getDefaultConfig();
    const { workspaceMock } = init(config);
    const [client] = workspaceMock.createClientsWithWidths(400);
    timeControl(addTime => {
        workspaceMock.virtualScreenSizeChanged.fire();
        addTime(10000);
        const frame = client.getFrameGeometryCopy();
        client.frameGeometry = new MockQmlRect(frame.x, frame.y, 450, frame.height);
        Assert.equal(Math.round(client.getActualFrameGeometry().width), 450);
    });
});
