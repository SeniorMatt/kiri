tests.register("Focus follows mouse ignores the pointer while a button is held", 1, () => {
    const config = getDefaultConfig();
    const { workspaceMock } = init(config);
    const [client1, client2, client3] = workspaceMock.createClients(3);
    workspaceMock.stackingOrder.push(client1, client2, client3);
    const ffm = new FocusFollowsMouse(() => false, 100);

    let held = 0;
    const originalQmlBase = qmlBase;
    qmlBase = { queryPointerButtons: (callback: (buttons: number) => void) => callback(held) } as any;
    try {
        function hover(client: MockKwinClient) {
            const frame = client.getActualFrameGeometry();
            workspaceMock.cursorPos = new MockQmlPoint(Math.floor(frame.x + frame.width / 2), Math.floor(frame.y + frame.height / 2));
            workspaceMock.cursorPosChanged.fire();
        }

        workspaceMock.activeWindow = client1;
        hover(client2);
        Assert.assert(workspaceMock.activeWindow === client2, { message: "hovering a window focuses it" });

        held = 1; // a drag (or a drag and drop) is going on
        hover(client3);
        Assert.assert(workspaceMock.activeWindow === client2, { message: "no focus change while a button is held" });
        hover(client1);
        Assert.assert(workspaceMock.activeWindow === client2, { message: "no focus change while a button is held" });

        held = 0; // dropped over client1, then the pointer moves on
        hover(client3);
        Assert.assert(workspaceMock.activeWindow === client3, { message: "focus follows the pointer again after the release" });
    } finally {
        qmlBase = originalQmlBase;
        ffm.destroy();
    }
});
