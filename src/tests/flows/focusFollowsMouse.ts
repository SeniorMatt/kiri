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

function ffmTestHover(workspaceMock: MockWorkspace, x: number, y: number) {
    workspaceMock.cursorPos = new MockQmlPoint(x, y);
    workspaceMock.cursorPosChanged.fire();
}

tests.register("Focus follows mouse: a window that slid under a still pointer is not entered by a small move", 1, () => {
    // niri recomputes the window under the previous pointer position with the current layout; remembering the last
    // hovered window instead made the first nudge after a scroll focus the window that moved under the pointer
    const { workspaceMock } = init(getDefaultConfig());
    const [client1, client2, client3] = workspaceMock.createClientsWithWidths(600, 600, 600);
    workspaceMock.stackingOrder.push(client1, client2, client3);
    const ffm = new FocusFollowsMouse(() => false, 100);
    try {
        workspaceMock.activeWindow = client1;
        const f1 = client1.getActualFrameGeometry();
        const x = f1.x + 50;
        const y = f1.y + 50;
        ffmTestHover(workspaceMock, x, y);
        Assert.assert(workspaceMock.activeWindow === client1);
        // the view scrolls (the focus is moved by something else, the pointer does not move)
        workspaceMock.activeWindow = client3;
        const under = [client1, client2, client3].filter(c => rectContainsPoint(c.getActualFrameGeometry(), new MockQmlPoint(x + 1, y)));
        Assert.assert(under.length === 1 && under[0] !== client3, { message: "invalid test setup: another window slid under the pointer" });
        ffmTestHover(workspaceMock, x + 1, y);
        Assert.assert(workspaceMock.activeWindow === client3, { message: "a nudge inside a window that slid under the pointer keeps the focus" });
        // leaving it and coming back is an entry
        ffmTestHover(workspaceMock, x + 1, y - 3000);
        ffmTestHover(workspaceMock, x + 2, y);
        Assert.assert(workspaceMock.activeWindow === under[0], { message: "entering it from outside focuses it" });
    } finally {
        ffm.destroy();
    }
});

tests.register("Focus follows mouse: a cursor warp does not focus what is above the focused window", 1, () => {
    // niri's warp-mouse-to-focus moves the pointer without running focus-follows-mouse
    const config = getDefaultConfig();
    config.cursorFollowsFocus = true;
    const { qtMock, workspaceMock } = init(config);
    const [client1, client2] = workspaceMock.createClients(2);
    const edge = client1.getActualFrameGeometry().x + client1.getActualFrameGeometry().width + 1;
    const overlay = new MockKwinClient(new MockQmlRect(edge, -10000, 30000, 30000)); // above the second window only
    workspaceMock.stackingOrder.push(client1, client2, overlay);
    const warp = moveCursorToFocus.call;
    moveCursorToFocus = { __brand: "QmlObject", call: () => { warp(); workspaceMock.cursorPosChanged.fire(); } } as any;
    const ffm = new FocusFollowsMouse(() => false, 100);
    try {
        qtMock.fireShortcut("focus-1");
        qtMock.fireShortcut("focus-2");
        Assert.assert(rectContainsPoint(client2.frameGeometry, workspaceMock.cursorPos), { message: "invalid test setup: the cursor was warped" });
        Assert.assert(workspaceMock.activeWindow === client2, { message: "the warp echo must not hand the focus to the window above" });
    } finally {
        ffm.destroy();
    }
});

tests.register("Focus follows mouse: the pointer leaving before the button check finishes cancels the focus", 1, () => {
    const { workspaceMock } = init(getDefaultConfig());
    const [client1, client2, client3] = workspaceMock.createClients(3);
    workspaceMock.stackingOrder.push(client1, client2, client3);
    const ffm = new FocusFollowsMouse(() => false, 100);
    const originalQmlBase = qmlBase;
    const pending: ((buttons: number) => void)[] = [];
    qmlBase = { queryPointerButtons: (callback: (buttons: number) => void) => pending.push(callback) } as any;
    try {
        workspaceMock.activeWindow = client1;
        const f2 = client2.getActualFrameGeometry();
        ffmTestHover(workspaceMock, f2.x + 5, f2.y + 5);
        // the pointer leaves the window (into the gap above everything) before the answer arrives
        ffmTestHover(workspaceMock, f2.x + 5, f2.y - 3000);
        pending.forEach(callback => callback(0));
        Assert.assert(workspaceMock.activeWindow === client1, { message: "a stale answer must not focus a window the pointer has left" });
    } finally {
        qmlBase = originalQmlBase;
        ffm.destroy();
    }
});
