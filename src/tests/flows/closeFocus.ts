// niri focuses the column that takes the place of a closed one (the right neighbour, the left one for the last column);
// a window that was just opened gives the focus back to the column it was opened from
tests.register("Close focus (niri)", 20, () => {
    const config = getDefaultConfig();
    const { qtMock, workspaceMock, world } = init(config);

    const [a, b, c, d] = workspaceMock.createClients(4);
    workspaceMock.activeWindow = b;
    const [e] = workspaceMock.createClients(1); // opened to the right of b: a b e c d
    qtMock.fireShortcut("focus-left");
    qtMock.fireShortcut("focus-right");
    Assert.equal(workspaceMock.activeWindow, e);
    workspaceMock.removeWindow(e);
    Assert.equal(workspaceMock.activeWindow, c, { message: "e was focused by hand, so closing it goes right" });

    workspaceMock.activeWindow = b;
    const [f] = workspaceMock.createClients(1); // a b f c d
    workspaceMock.removeWindow(f);
    Assert.equal(workspaceMock.activeWindow, b, { message: "a new window returns to the column it came from" });

    workspaceMock.removeWindow(b);
    Assert.equal(workspaceMock.activeWindow, c, { message: "closing a focused column goes to the right neighbour" });

    workspaceMock.activeWindow = d;
    workspaceMock.removeWindow(d);
    Assert.equal(workspaceMock.activeWindow, c, { message: "the last column goes left" });

    workspaceMock.removeWindow(c);
    Assert.equal(workspaceMock.activeWindow, a);
});

tests.register("Close focus in a column (niri)", 20, () => {
    const config = getDefaultConfig();
    const { qtMock, workspaceMock, world } = init(config);

    const [a, b, c] = workspaceMock.createClients(3);
    workspaceMock.activeWindow = b;
    qtMock.fireShortcut("window-consume-or-expel-left"); // a b | c
    workspaceMock.activeWindow = c;
    qtMock.fireShortcut("window-consume-or-expel-left"); // a b c in one column
    workspaceMock.activeWindow = b;
    workspaceMock.removeWindow(b);
    Assert.equal(workspaceMock.activeWindow, c, { message: "the window below takes the place" });
    workspaceMock.removeWindow(c);
    Assert.equal(workspaceMock.activeWindow, a, { message: "the bottom window goes up" });
});

tests.register("Close the new window returns the view to where it was", 10, () => {
    const config = getDefaultConfig();
    config.presetWidths = "40%";
    const { qtMock, workspaceMock, world } = init(config);

    const clients = workspaceMock.createClientsWithWidths(300, 300, 300, 300, 300, 300);
    workspaceMock.activeWindow = clients[2];
    const before = clients.map(c => c.getActualFrameGeometry().x);
    const [extra] = workspaceMock.createClientsWithWidths(300);
    workspaceMock.removeWindow(extra);
    Assert.equal(workspaceMock.activeWindow, clients[2]);
    Assert.equal(clients[2].getActualFrameGeometry().x, before[2]);
    Assert.equal(clients[4].getActualFrameGeometry().x, before[4]);
});
