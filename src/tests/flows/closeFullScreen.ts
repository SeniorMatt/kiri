// KWin may leave nothing focused after a full-screen or maximized window closes without a signal that arrives in time:
// the focus request is retried on a timer, and the actions meanwhile work on the window that had the focus last
tests.register("Close a full-screen window: a focus KWin dropped is passed on", 10, () => {
    const { qtMock, workspaceMock, world } = init(getDefaultConfig());
    const b = new MockKwinClient(new MockQmlRect(10, 10, 300, 400));
    b.x11 = false; // an X11 window that may come back is held for a moment instead
    workspaceMock.createWindows(b);
    const [c] = workspaceMock.createClients(1);
    workspaceMock.activeWindow = b;
    b.fullScreen = true;
    MockQmlTimer.deferIntervals.add(50);
    try {
        workspaceMock.removeWindow(b);
        (workspaceMock as any)._activeWindow = null; // KWin takes the focus away again, no windowActivated
        MockQmlTimer.deferIntervals.clear();
        MockQmlTimer.flush();
    } finally {
        MockQmlTimer.deferIntervals.clear();
    }
    Assert.equal(workspaceMock.activeWindow, c, { message: "the right neighbour gets the focus" });
});

tests.register("Actions work when KWin left no window focused", 10, () => {
    const { qtMock, workspaceMock, world } = init(getDefaultConfig());
    const [a, b, c] = workspaceMock.createClients(3);
    workspaceMock.activeWindow = b;
    (workspaceMock as any)._activeWindow = null; // nothing focused, no signal
    qtMock.fireShortcut("window-move-to-next-desktop");
    Assert.equalArrays(b.desktops, [workspaceMock.desktops[1]]);
    Assert.equal(workspaceMock.activeWindow, b, { message: "the moved window has the focus on its new desktop" });
    Assert.equal(workspaceMock.currentDesktop, workspaceMock.desktops[1]);
});
