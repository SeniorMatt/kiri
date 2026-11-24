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

function desktopIds() {
    return (Workspace as MockWorkspace).desktops.map(desktop => desktop.id);
}

tests.register("Dynamic desktops: empty ones go away when left, ids of the others stay", 5, () => {
    const config = getDefaultConfig();
    config.dynamicDesktops = true;
    const { qtMock, workspaceMock, world } = init(config);
    const [a, b, c] = workspaceMock.createClients(3);
    const [d1, d2] = workspaceMock.desktops;
    workspaceMock.activeWindow = b;
    qtMock.fireShortcut("window-move-to-next-desktop");
    workspaceMock.activeWindow = c;
    qtMock.fireShortcut("window-move-to-next-desktop");
    // d1: a, d2: b and c, d3: empty
    Assert.equal(workspaceMock.desktops.length, 3);
    Assert.equal(workspaceMock.desktops[0], d1);
    Assert.equal(workspaceMock.desktops[1], d2);

    // d3 (empty, last) is entered and filled: d4 appears, d1 and d2 stay
    qtMock.fireShortcut("window-move-to-next-desktop");
    Assert.equal(workspaceMock.desktops.length, 4);
    const ids = desktopIds();
    // go back to d1 and empty it into d2: it is removed as soon as it is left, nothing else changes
    workspaceMock.currentDesktop = d1;
    workspaceMock.activeWindow = a;
    qtMock.fireShortcut("window-move-to-next-desktop");
    Assert.assert(!workspaceMock.desktops.includes(d1), { message: "the emptied desktop is removed when left" });
    Assert.equalArrays(desktopIds(), ids.slice(1));
    Assert.equal(workspaceMock.desktops.length, 3);
    Assert.assert(!getClientManager(world).isDesktopOccupied(workspaceMock.desktops[workspaceMock.desktops.length - 1]));
});

tests.register("Dynamic desktops: a number past the last goes to the empty desktop", 3, () => {
    const config = getDefaultConfig();
    config.dynamicDesktops = true;
    const { qtMock, workspaceMock } = init(config);
    const [first] = workspaceMock.createClients(2);
    Assert.equal(workspaceMock.desktops.length, 2);
    qtMock.fireShortcut("desktop-9");
    Assert.equal(workspaceMock.currentDesktop, workspaceMock.desktops[1]);
    Assert.equal(workspaceMock.desktops.length, 2);
    qtMock.fireShortcut("desktop-1");
    workspaceMock.activeWindow = first;
    qtMock.fireShortcut("window-move-to-desktop-7");
    Assert.equal(workspaceMock.currentDesktop, workspaceMock.desktops[1]);
    Assert.equal(workspaceMock.desktops.length, 3);
});

tests.register("Dynamic desktops: new desktops get free names", 1, () => {
    const config = getDefaultConfig();
    config.dynamicDesktops = true;
    const { qtMock, workspaceMock } = init(config);
    workspaceMock.createClients(1);
    for (let i = 0; i < 3; i++) {
        qtMock.fireShortcut("window-move-to-next-desktop");
        workspaceMock.createClients(1);
    }
    const names = workspaceMock.desktops.map(desktop => desktop.name);
    Assert.equal(new Set(names).size, names.length);
});

tests.register("move-workspace-up and move-workspace-down", 5, () => {
    for (const dynamic of [true, false]) {
        const config = getDefaultConfig();
        config.dynamicDesktops = dynamic;
        const { qtMock, workspaceMock } = init(config);
        const [a] = workspaceMock.createClients(1);
        const [d1, d2] = workspaceMock.desktops;
        const [b, c] = workspaceMock.createClients(2);
        qtMock.fireShortcut("window-move-to-next-desktop"); // c to d2
        workspaceMock.activeWindow = b;
        qtMock.fireShortcut("window-move-to-next-desktop"); // b joins c
        workspaceMock.currentDesktop = d1;
        workspaceMock.activeWindow = a;
        const name2 = d2.name;
        const beforeCurrentId = d1.id;

        // d1 moves below d2
        qtMock.fireShortcut("desktop-move-down");
        Assert.equal(workspaceMock.currentDesktop.id, beforeCurrentId, { message: "the moved desktop stays current" });
        const order = workspaceMock.desktops;
        Assert.equal(order[1].id, beforeCurrentId);
        Assert.equal(order[0].name, name2, { message: "the neighbour keeps its name" });
        Assert.equalArrays(a.desktops, [order[1]]);
        Assert.equalArrays(b.desktops, [order[0]]);
        Assert.equalArrays(c.desktops, [order[0]]);
        // columns keep their layout
        Assert.assert(b.getActualFrameGeometry().x !== c.getActualFrameGeometry().x, { message: "still two columns" });

        // and back up
        qtMock.fireShortcut("desktop-move-up");
        Assert.equal(workspaceMock.desktops[0].id, beforeCurrentId);
        Assert.equalArrays(a.desktops, [workspaceMock.desktops[0]]);
        Assert.equalArrays(b.desktops, [workspaceMock.desktops[1]]);
        Assert.equal(workspaceMock.desktops[1].name, name2);

        // at the top, moving up does nothing
        qtMock.fireShortcut("desktop-move-up");
        Assert.equal(workspaceMock.desktops[0].id, beforeCurrentId);
        Assert.assert(d1 !== undefined && d2 !== undefined);
    }
});
