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
