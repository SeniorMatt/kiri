tests.register("Column move to desktop", 10, () => {
    const config = getDefaultConfig();
    const { qtMock, workspaceMock, world } = init(config);

    function assertDesktop(desktop: KwinDesktop, clients: MockKwinClient[]) {
        for (const client of clients) {
            Assert.equalArrays(client.desktops, [desktop]);
        }
    }

    const desktop0 = workspaceMock.desktops[0];
    const desktop1 = workspaceMock.desktops[1];

    const [client0, client1a, client1b, client1c, client4, client5, client6] = workspaceMock.createClients(7);
    workspaceMock.activeWindow = client1b;
    qtMock.fireShortcut("window-move-left");
    workspaceMock.activeWindow = client1c;
    qtMock.fireShortcut("window-move-left");
    workspaceMock.activeWindow = client1b;
    // W1: 0, [1,*2*,3], 4, 5, 6; W2: -
    assertDesktop(desktop0, [client0, client1a, client1b, client1c, client4, client5, client6]);

    qtMock.fireShortcut("column-move-to-desktop-2");
    // like niri: the desktop follows, the moved column stays focused
    // W1: 0, 4, 5, 6; W2: [1,*2*,3]
    Assert.equal(workspaceMock.currentDesktop, desktop1);
    Assert.equal(workspaceMock.activeWindow, client1b);
    assertDesktop(desktop0, [client0, client4, client5, client6]);
    assertDesktop(desktop1, [client1a, client1b, client1c]);

    qtMock.fireShortcut("column-move-to-next-desktop"); // no-op
    Assert.equal(workspaceMock.activeWindow, client1b);
    assertDesktop(desktop1, [client1a, client1b, client1c]);

    qtMock.fireShortcut("column-move-to-previous-desktop");
    Assert.equal(workspaceMock.currentDesktop, desktop0);
    Assert.equal(workspaceMock.activeWindow, client1b);
    assertDesktop(desktop0, [client0, client4, client5, client6, client1a, client1b, client1c]);

    workspaceMock.currentDesktop = workspaceMock.desktops[0];
    qtMock.fireShortcut("focus-end");
    qtMock.fireShortcut("focus-left");
    qtMock.fireShortcut("focus-left");
    // W1: 0, [1,2,3], 4, *5*, 6
    Assert.equal(workspaceMock.activeWindow, client4);
    qtMock.fireShortcut("focus-right");
    Assert.equal(workspaceMock.activeWindow, client5);
    qtMock.fireShortcut("tail-move-to-previous-desktop"); // no-op
    assertDesktop(desktop0, [client0, client1a, client1b, client1c, client4, client5, client6]);

    qtMock.fireShortcut("tail-move-to-next-desktop");
    assertDesktop(desktop1, [client5, client6]);
    assertDesktop(desktop0, [client0, client1a, client1b, client1c, client4]);
    Assert.assert(workspaceMock.activeWindow !== null);
});
