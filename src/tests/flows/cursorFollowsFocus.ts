tests.register("Cursor follows focus", 10, () => {
    const config = getDefaultConfig();
    config.cursorFollowsFocus = true;
    const { qtMock, workspaceMock, world } = init(config);

    const [client1, client2] = workspaceMock.createClients(2);
    const initialCursorPos = new MockQmlPoint(380, 20);
    Assert.assert(rectContainsPoint(client1.getActualFrameGeometry(), initialCursorPos), { message: "invalid test setup" });
    workspaceMock.cursorPos = initialCursorPos.clone();

    qtMock.fireShortcut("focus-1");
    Assert.assert(rectContainsPoint(client1.getActualFrameGeometry(), Workspace.cursorPos));
    Assert.assert(!rectContainsPoint(client2.getActualFrameGeometry(), Workspace.cursorPos));
    Assert.assert(pointEquals(Workspace.cursorPos, initialCursorPos), { message: "Cursor should not have been moved because it was already within the focused client" });

    qtMock.fireShortcut("focus-2");
    Assert.assert(!rectContainsPoint(client1.getActualFrameGeometry(), Workspace.cursorPos));
    Assert.assert(rectContainsPoint(client2.getActualFrameGeometry(), Workspace.cursorPos));

    qtMock.fireShortcut("focus-1");
    Assert.assert(rectContainsPoint(client1.getActualFrameGeometry(), Workspace.cursorPos));
    Assert.assert(!rectContainsPoint(client2.getActualFrameGeometry(), Workspace.cursorPos));
    const lastCursorPos = workspaceMock.cursorPos.clone();

    Workspace.activeWindow = null;
    Assert.assert(pointEquals(Workspace.cursorPos, lastCursorPos), { message: "Cursor should not have been moved" });
});

tests.register("Cursor follows focus: pointer focus never warps", 10, () => {
    // A window focused by the pointer (focus follows mouse, hovering while dragging a file) gets scrolled into
    // view; the cursor must stay where the user put it, even though the window moved away from it
    const config = getDefaultConfig();
    config.cursorFollowsFocus = true;
    const { qtMock, workspaceMock, world } = init(config);

    const [client1, client2, client3, client4] = workspaceMock.createClients(4);
    qtMock.fireShortcut("focus-1");
    const frame = client4.getActualFrameGeometry();
    const pointerPos = new MockQmlPoint(frame.x + 5, frame.y + 5);
    workspaceMock.cursorPos = pointerPos.clone();

    Workspace.activeWindow = client4;
    Assert.assert(pointEquals(Workspace.cursorPos, pointerPos), { message: "Cursor should stay where the pointer focused the window" });

    // An app activating itself (not under the cursor) doesn't move the cursor either
    Workspace.activeWindow = client2;
    Assert.assert(pointEquals(Workspace.cursorPos, pointerPos), { message: "Cursor should not follow an app activating itself" });

    qtMock.fireShortcut("focus-1");
    Assert.assert(rectContainsPoint(client1.getActualFrameGeometry(), Workspace.cursorPos), { message: "Keyboard focus should still warp" });
});

tests.register("Cursor follows focus: a newly opened window gets the cursor", 5, () => {
    const config = getDefaultConfig();
    config.cursorFollowsFocus = true;
    const { workspaceMock } = init(config);
    const [client1] = workspaceMock.createClients(1);
    workspaceMock.cursorPos = new MockQmlPoint(5, 5); // outside the window
    Assert.assert(!rectContainsPoint(client1.getActualFrameGeometry(), Workspace.cursorPos), { message: "invalid test setup" });
    const [client2] = workspaceMock.createClients(1);
    Assert.assert(rectContainsPoint(client2.getActualFrameGeometry(), Workspace.cursorPos));

    // without the option the cursor stays
    const off = getDefaultConfig();
    const second = init(off);
    second.workspaceMock.createClients(1);
    second.workspaceMock.cursorPos = new MockQmlPoint(5, 5);
    second.workspaceMock.createClients(1);
    Assert.assert(pointEquals(Workspace.cursorPos, new MockQmlPoint(5, 5)));
});

// niri's move_cursor_to_rect (default mode): only the coordinate that is outside the window is fixed
tests.register("Cursor follows focus: only the coordinate outside the window moves", 1, () => {
    const config = getDefaultConfig();
    config.cursorFollowsFocus = true;
    const { qtMock, workspaceMock } = init(config);
    const [client1, client2] = workspaceMock.createClients(2);
    qtMock.fireShortcut("focus-1");
    const f1 = client1.getActualFrameGeometry();
    workspaceMock.cursorPos = new MockQmlPoint(f1.x + 10, f1.y + 30);
    qtMock.fireShortcut("focus-2");
    let f2 = client2.getActualFrameGeometry(); // after the shortcut: the layout has moved
    Assert.assert(Math.abs(Workspace.cursorPos.y - (f1.y + 30)) < 1, { message: "y is inside the window, so it stays" });
    Assert.assert(Math.abs(Workspace.cursorPos.x - (f2.x + f2.width / 2)) < 1);
    // outside on both axes: the centre
    workspaceMock.cursorPos = new MockQmlPoint(f1.x + 10, f2.y + f2.height + 50);
    qtMock.fireShortcut("focus-2");
    f2 = client2.getActualFrameGeometry();
    Assert.assert(Math.abs(Workspace.cursorPos.x - (f2.x + f2.width / 2)) < 1);
    Assert.assert(Math.abs(Workspace.cursorPos.y - (f2.y + f2.height / 2)) < 1);
    // pressing the key again with the pointer inside does nothing
    const warps = (workspaceMock as any).warps.length;
    qtMock.fireShortcut("focus-2");
    Assert.equal((workspaceMock as any).warps.length, warps);
});

tests.register("Cursor follows focus: a key that keeps the focus brings the pointer back", 1, () => {
    const config = getDefaultConfig();
    config.cursorFollowsFocus = true;
    const { qtMock, workspaceMock } = init(config);
    const [client1, client2] = workspaceMock.createClients(2);
    qtMock.fireShortcut("focus-1");
    workspaceMock.cursorPos = new MockQmlPoint(700, 500); // away from client1
    qtMock.fireShortcut("focus-left");
    Assert.assert(workspaceMock.activeWindow === client1);
    Assert.assert(rectContainsPoint(client1.getActualFrameGeometry(), Workspace.cursorPos), { message: "focus-left at the first column still warps" });
});

tests.register("Cursor follows focus: moving a column warps, resizing and toggling do not", 1, () => {
    const config = getDefaultConfig();
    config.cursorFollowsFocus = true;
    const { qtMock, workspaceMock } = init(config);
    const [client1, client2, client3] = workspaceMock.createClients(3);
    qtMock.fireShortcut("focus-2");
    const park = new MockQmlPoint(790, 590);
    workspaceMock.cursorPos = park.clone();
    qtMock.fireShortcut("column-move-left");
    Assert.assert(rectContainsPoint(client2.getActualFrameGeometry(), Workspace.cursorPos), { message: "move-column warps to the moved window" });
    workspaceMock.cursorPos = park.clone();
    qtMock.fireShortcut("cycle-preset-widths");
    Assert.assert(pointEquals(Workspace.cursorPos, park), { message: "a width change does not warp" });
    qtMock.fireShortcut("window-toggle-fullscreen");
    qtMock.fireShortcut("window-toggle-fullscreen");
    Assert.assert(pointEquals(Workspace.cursorPos, park), { message: "full-screen toggles do not warp" });
    qtMock.fireShortcut("column-center-visible");
    Assert.assert(pointEquals(Workspace.cursorPos, park), { message: "centring does not warp" });
});

tests.register("Cursor follows focus: a new focused window gets the pointer", 1, () => {
    const config = getDefaultConfig();
    config.cursorFollowsFocus = true;
    const { workspaceMock } = init(config);
    workspaceMock.createClients(2);
    workspaceMock.cursorPos = new MockQmlPoint(5, 5);
    const opened = workspaceMock.createWindowActivatedFirst(new MockQmlRect(300, 300, 100, 300));
    Assert.assert(workspaceMock.activeWindow === opened);
    Assert.assert(rectContainsPoint(opened.getActualFrameGeometry(), Workspace.cursorPos), { message: "the pointer goes to the window KWin activated before telling the script" });
    workspaceMock.cursorPos = new MockQmlPoint(5, 5);
    workspaceMock.createWindowInBackground(new MockQmlRect(300, 300, 100, 300));
    Assert.assert(pointEquals(Workspace.cursorPos, new MockQmlPoint(5, 5)), { message: "a window that opens in the background does not move the pointer" });
});

tests.register("Cursor follows focus: the window that gets the focus on a close", 1, () => {
    const config = getDefaultConfig();
    config.cursorFollowsFocus = true;
    const { qtMock, workspaceMock } = init(config);
    const [client1, client2, client3] = workspaceMock.createClients(3);
    qtMock.fireShortcut("focus-2");
    workspaceMock.cursorPos = new MockQmlPoint(790, 590);
    workspaceMock.removeWindow(client2);
    const active = workspaceMock.activeWindow as MockKwinClient;
    Assert.assert(active !== null && active !== client2, { message: "focus passed on" });
    // (the mock settles the frames a few pixels apart from where Kiri put them)
    const f = active.getActualFrameGeometry();
    Assert.assert(Math.abs(Workspace.cursorPos.x - (f.x + f.width / 2)) < 60 && Math.abs(Workspace.cursorPos.y - (f.y + f.height / 2)) < 60, { message: "the pointer goes to the window that got the focus" });
});

tests.register("Cursor follows focus: the warp goes to the visible part of a window", 1, () => {
    const config = getDefaultConfig();
    config.cursorFollowsFocus = true;
    const { workspaceMock } = init(config);
    const [client] = workspaceMock.createClientsWithFrames(new MockQmlRect(700, 100, 300, 200));
    workspaceMock.cursorPos = new MockQmlPoint(10, 500);
    (client as any).frameGeometry = new MockQmlRect(700, 100, 300, 200);
    workspaceMock.activeWindow = null;
    const visible = new MockQmlPoint(750, 200);
    Assert.assert(visible.x < 800);
    // the pure rule
    const target = cursorWarpTarget({ x: 10, y: 500 }, { x: 700, y: 100, width: 100, height: 200 }, false);
    Assert.equal(target!.x, 750);
    Assert.equal(target!.y, 200);
    Assert.assert(cursorWarpTarget({ x: 750, y: 150 }, { x: 700, y: 100, width: 100, height: 200 }, false) === null);
    Assert.equal(cursorWarpTarget({ x: 10, y: 150 }, { x: 700, y: 100, width: 100, height: 200 }, false)!.y, 150);
    Assert.equal(cursorWarpTarget({ x: 10, y: 150 }, { x: 700, y: 100, width: 100, height: 200 }, true)!.y, 200);
});
