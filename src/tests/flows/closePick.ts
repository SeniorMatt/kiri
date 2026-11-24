// KWin's pick of a window just before a close is reported does not decide the focus; the right neighbour does

function closeAfterKwinPick(workspaceMock: MockWorkspace, closed: MockKwinClient, pick: MockKwinClient) {
    workspaceMock.activeWindow = pick;
    workspaceMock.windows.splice(workspaceMock.windows.indexOf(closed), 1);
    workspaceMock.windowRemoved.fire(closed);
}

tests.register("Close: the right neighbour gets the focus, not KWin's pick", 5, () => {
    const { qtMock, workspaceMock, world } = init(getDefaultConfig());
    const [a, b, c] = workspaceMock.createClients(3);
    workspaceMock.activeWindow = b;
    closeAfterKwinPick(workspaceMock, b, a);
    Assert.equal(workspaceMock.activeWindow, c);
});

tests.register("Close: a panel that KWin focuses does not keep the focus", 5, () => {
    const { qtMock, workspaceMock, world } = init(getDefaultConfig());
    const [a, b, c] = workspaceMock.createClients(3);
    const panel = new MockKwinClient(new MockQmlRect(0, 0, 48, 900));
    (panel as any).dock = true;
    workspaceMock.windows.push(panel);
    workspaceMock.windowAdded.fire(panel);
    workspaceMock.activeWindow = b;
    closeAfterKwinPick(workspaceMock, b, panel);
    Assert.equal(workspaceMock.activeWindow, c);
});

tests.register("Close: a window the user focused stays focused when another one closes", 5, () => {
    const { qtMock, workspaceMock, world } = init(getDefaultConfig());
    const [a, b, c] = workspaceMock.createClients(3);
    workspaceMock.activeWindow = b;
    qtMock.fireShortcut("focus-left");
    Assert.equal(workspaceMock.activeWindow, a);
    workspaceMock.windows.splice(workspaceMock.windows.indexOf(b), 1);
    workspaceMock.windowRemoved.fire(b);
    Assert.equal(workspaceMock.activeWindow, a, { message: "a was focused by Kiri, so it is the user's choice" });
});
