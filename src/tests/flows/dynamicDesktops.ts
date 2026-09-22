// niri's workspaces: one empty desktop at the bottom, empty ones in between go away
tests.register("Dynamic desktops (niri)", 10, () => {
    const config = getDefaultConfig();
    config.dynamicDesktops = true;
    const { qtMock, workspaceMock, world } = init(config);

    const [a, b] = workspaceMock.createClients(2);
    Assert.equal(workspaceMock.desktops.length, 2, { message: "desktop 1 has windows, desktop 2 is the empty one" });

    workspaceMock.activeWindow = b;
    qtMock.fireShortcut("column-move-to-next-desktop");
    Assert.equal(workspaceMock.desktops.length, 3, { message: "the empty one at the bottom got a window, so a new one appears" });
    Assert.equal(workspaceMock.currentDesktop, workspaceMock.desktops[1]);

    // moving down once more: the desktop that was left empty in the middle goes away
    qtMock.fireShortcut("column-move-to-next-desktop");
    Assert.equal(workspaceMock.desktops.length, 3, { message: "desktops: a, b, and a new empty one" });
    Assert.equal(workspaceMock.currentDesktop, workspaceMock.desktops[1]);
    Assert.equalArrays(b.desktops, [workspaceMock.desktops[1]]);
    Assert.equalArrays(a.desktops, [workspaceMock.desktops[0]]);
    Assert.assert(!getClientManager(world).isDesktopOccupied(workspaceMock.desktops[2]));
});

tests.register("Fixed desktops stay as they are", 1, () => {
    const config = getDefaultConfig();
    const { qtMock, workspaceMock, world } = init(config);
    workspaceMock.createClients(2);
    qtMock.fireShortcut("column-move-to-next-desktop");
    Assert.equal(workspaceMock.desktops.length, 2);
});
