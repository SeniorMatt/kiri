tests.register("Pass focus", 100, () => {
    const config = getDefaultConfig();
    const { qtMock, workspaceMock, world } = init(config);

    const [client0, client1a, client1b, client1c, client4, client5, client6] = workspaceMock.createClients(7);
    workspaceMock.activeWindow = client1b;
    qtMock.fireShortcut("window-move-left");
    workspaceMock.activeWindow = client1c;
    qtMock.fireShortcut("window-move-left");
    workspaceMock.activeWindow = client1b;
    workspaceMock.activeWindow = client5;

    function removeWindow(client: MockKwinClient) {
        runOneOf(
            () => workspaceMock.removeWindow(client),
            () => client.desktops = [workspaceMock.desktops[1]],
        );
    }

    // like niri: the window or column that takes the place of the closed one gets the focus, the one before it if
    // there is none after it
    removeWindow(client5);
    Assert.equal(workspaceMock.activeWindow, client6);

    workspaceMock.activeWindow = client4;
    qtMock.fireShortcut("column-move-to-desktop-2");
    Assert.equal(workspaceMock.activeWindow, client4); // the moved column keeps the focus on desktop 2
    workspaceMock.currentDesktop = workspaceMock.desktops[0];
    workspaceMock.activeWindow = client1b;

    removeWindow(client1b);
    Assert.equal(workspaceMock.activeWindow, client1c);

    removeWindow(client1c);
    Assert.equal(workspaceMock.activeWindow, client1a);

    removeWindow(client1a);
    Assert.equal(workspaceMock.activeWindow, client6);

    removeWindow(client6);
    Assert.equal(workspaceMock.activeWindow, client0);
});
