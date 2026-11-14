// niri's workspace actions on KWin's virtual desktops: workspace-auto-back-and-forth, empty-workspace-above-first, named
// workspaces, focus=false, new workspaces, move-workspace-to-index
function desktopNames() {
    return (Workspace as MockWorkspace).desktops.map(desktop => desktop.name);
}

tests.register("workspace-auto-back-and-forth: the key of the current desktop goes to the previous one", 3, () => {
    for (const on of [true, false]) {
        const config = getDefaultConfig();
        config.desktopAutoBackAndForth = on;
        const { qtMock, workspaceMock } = init(config);
        const [d1, d2] = workspaceMock.desktops;
        workspaceMock.createClients(1);
        qtMock.fireShortcut("desktop-2");
        Assert.equal(workspaceMock.currentDesktop, d2);
        qtMock.fireShortcut("desktop-2");
        Assert.equal(workspaceMock.currentDesktop, on ? d1 : d2, { message: "asking for the desktop that is shown " + (on ? "goes back" : "does nothing") });
        qtMock.fireShortcut("desktop-1");
        Assert.equal(workspaceMock.currentDesktop, on ? d2 : d1, { message: "desktop 1 is shown: back to desktop 2" });
        qtMock.fireShortcut("desktop-1");
        Assert.equal(workspaceMock.currentDesktop, d1);
    }
});

tests.register("empty-workspace-above-first: an empty desktop at the top as well", 3, () => {
    const config = getDefaultConfig();
    config.dynamicDesktops = true;
    config.emptyDesktopAboveFirst = true;
    const { qtMock, workspaceMock, world } = init(config);
    const manager = getClientManager(world);
    Assert.equal(workspaceMock.desktops.length, 1, { message: "nothing but empty desktops: one is enough" });
    const [a, b] = workspaceMock.createClients(2);
    Assert.equal(workspaceMock.desktops.length, 3, { message: "an empty desktop above and below the one with windows" });
    Assert.assert(!manager.isDesktopOccupied(workspaceMock.desktops[0]) && !manager.isDesktopOccupied(workspaceMock.desktops[2]));
    const middle = workspaceMock.desktops[1];
    Assert.equal(workspaceMock.currentDesktop, middle);

    // a window that goes to the top desktop makes a new empty one above it
    workspaceMock.activeWindow = b;
    qtMock.fireShortcut("column-move-to-previous-desktop");
    Assert.equal(workspaceMock.desktops.length, 4);
    Assert.assert(!manager.isDesktopOccupied(workspaceMock.desktops[0]), { message: "the top desktop is empty again" });
    Assert.assert(manager.isDesktopOccupied(workspaceMock.desktops[1]) && manager.isDesktopOccupied(workspaceMock.desktops[2]));
    Assert.equal(workspaceMock.currentDesktop, workspaceMock.desktops[1]);
    Assert.assert(!manager.isDesktopOccupied(workspaceMock.desktops[3]));

    // everything closed: back to a single empty desktop, the current one stays
    workspaceMock.removeWindow(b);
    workspaceMock.currentDesktop = middle;
    workspaceMock.removeWindow(a);
    workspaceMock.currentDesktop = workspaceMock.desktops[0];
    Assert.equal(workspaceMock.desktops.length, 1, { message: "with nothing open only one empty desktop is left" });
});

tests.register("Named desktops: they exist from the start and stay when empty", 3, () => {
    const config = getDefaultConfig();
    config.dynamicDesktops = true;
    config.namedDesktops = JSON.stringify(["browser", "chat"]);
    config.desktopBindNames = JSON.stringify(["browser", "chat", "later"]);
    const { qtMock, workspaceMock } = init(config);
    Assert.equalArrays(desktopNames().slice(0, 2), ["browser", "chat"], { message: "named desktops are created at the top, in the order of the config" });
    const named = workspaceMock.desktops.slice(0, 2);
    Assert.equal(workspaceMock.currentDesktop.name, "Desktop 1", { message: "the current desktop stays" });

    qtMock.fireShortcut("desktop-named-1");
    Assert.equal(workspaceMock.currentDesktop, named[0], { message: "focus-workspace \"browser\"" });
    qtMock.fireShortcut("desktop-named-2");
    Assert.equal(workspaceMock.currentDesktop, named[1]);
    qtMock.fireShortcut("desktop-named-3");
    Assert.equal(workspaceMock.currentDesktop, named[1], { message: "a name no desktop has does nothing" });

    // left, the empty unnamed desktop goes, the named ones never do
    qtMock.fireShortcut("desktop-next");
    qtMock.fireShortcut("desktop-next");
    Assert.assert(workspaceMock.desktops.includes(named[0]) && workspaceMock.desktops.includes(named[1]), { message: "named desktops are never removed" });
    Assert.assert(!desktopNames().includes("Desktop 1") || workspaceMock.currentDesktop.name === "Desktop 1");

    // a window moved to a named desktop by name
    const [a] = workspaceMock.createClients(1);
    qtMock.fireShortcut("column-move-to-desktop-named-1");
    Assert.equalArrays(a.desktops, [named[0]]);
    Assert.equal(workspaceMock.currentDesktop, named[0]);
    qtMock.fireShortcut("column-move-to-desktop-named-2");
    Assert.equalArrays(a.desktops, [named[1]]);
    qtMock.fireShortcut("window-move-to-desktop-named-1");
    Assert.equalArrays(a.desktops, [named[0]]);
});

tests.register("set-workspace-name and unset-workspace-name", 3, () => {
    const config = getDefaultConfig();
    config.dynamicDesktops = true;
    config.desktopBindNames = JSON.stringify(["mail", "web"]);
    const { qtMock, workspaceMock, world } = init(config);
    const manager = getClientManager(world);
    const [d1, d2] = workspaceMock.desktops;
    qtMock.fireShortcut("set-desktop-name-1");
    Assert.equal(d1.name, "mail");
    Assert.equal(workspaceMock.desktops.length, 2, { message: "not the last desktop: nothing is added" });
    qtMock.fireShortcut("set-desktop-name-1");
    Assert.equal(d1.name, "mail", { message: "setting the same name again changes nothing" });

    qtMock.fireShortcut("desktop-2");
    Assert.equal(workspaceMock.currentDesktop, d2);
    qtMock.fireShortcut("set-desktop-name-1");
    Assert.equal(d2.name, "Desktop 2", { message: "a name that another desktop has is refused" });
    qtMock.fireShortcut("set-desktop-name-2");
    Assert.equal(d2.name, "web");
    Assert.equal(workspaceMock.desktops.length, 3, { message: "the last desktop got a name, so an empty one is added below" });

    // d1 is empty but named: leaving it keeps it
    Assert.assert(!manager.isDesktopOccupied(d1));
    qtMock.fireShortcut("desktop-3");
    Assert.assert(workspaceMock.desktops.includes(d1) && workspaceMock.desktops.includes(d2));

    qtMock.fireShortcut("desktop-1");
    qtMock.fireShortcut("unset-desktop-name");
    Assert.assert(d1.name !== "mail", { message: "the name is gone" });
    Assert.assert(workspaceMock.desktops.includes(d1), { message: "the current desktop stays until it is left" });
    qtMock.fireShortcut("desktop-3");
    Assert.assert(!workspaceMock.desktops.includes(d1), { message: "an empty desktop that lost its name is removed like any other" });
    Assert.assert(workspaceMock.desktops.includes(d2));
});

tests.register("Names survive a reload of Kiri's settings", 1, () => {
    const config = getDefaultConfig();
    config.dynamicDesktops = true;
    config.desktopBindNames = JSON.stringify(["mail"]);
    const { qtMock, workspaceMock, world } = init(config);
    const [d1] = workspaceMock.desktops;
    qtMock.fireShortcut("set-desktop-name-1");
    const layout = world.captureLayout();
    Assert.equalArrays(layout.namedDesktops ?? [], [d1.id]);
    world.destroy();
    const again = new World(config, null, JSON.parse(JSON.stringify(layout)));
    workspaceMock.currentDesktop = workspaceMock.desktops[workspaceMock.desktops.length - 1];
    Assert.assert(workspaceMock.desktops.includes(d1), { message: "the named empty desktop is still there after the reload" });
    again.destroy();
});

tests.register("focus=false: the column or window goes, the focus stays", 3, () => {
    for (const kind of ["column", "window"]) {
        const config = getDefaultConfig();
        const { qtMock, workspaceMock } = init(config);
        const [d1, d2] = workspaceMock.desktops;
        const [a, b] = workspaceMock.createClients(2);
        workspaceMock.activeWindow = b;
        qtMock.fireShortcut(`${kind}-move-to-next-desktop-no-focus`);
        Assert.equal(workspaceMock.currentDesktop, d1, { message: "the view stays" });
        Assert.equalArrays(b.desktops, [d2]);
        Assert.equal(workspaceMock.activeWindow, a, { message: "the next column has the focus" });
        Assert.assert(b.getActualFrameGeometry().width > 0);

        workspaceMock.activeWindow = a;
        qtMock.fireShortcut(`${kind}-move-to-desktop-no-focus-2`);
        Assert.equalArrays(a.desktops, [d2]);
        Assert.equal(workspaceMock.currentDesktop, d1);
        // both are on desktop 2 now, side by side, in the order they came
        workspaceMock.currentDesktop = d2;
        Assert.assert(a.getActualFrameGeometry().x > b.getActualFrameGeometry().x, { message: "the second one goes to the right of the active column" });
    }
});

tests.register("move to a new desktop below and above", 3, () => {
    for (const dynamic of [false, true]) {
        for (const below of [true, false]) {
            const config = getDefaultConfig();
            config.dynamicDesktops = dynamic;
            const { qtMock, workspaceMock } = init(config);
            const [a, b] = workspaceMock.createClients(2);
            const [d1] = workspaceMock.desktops;
            workspaceMock.activeWindow = b;
            const before = workspaceMock.desktops.length;
            qtMock.fireShortcut(`column-move-to-new-desktop-${below ? "below" : "above"}`);
            const now = workspaceMock.desktops;
            if (below) {
                Assert.equal(now.indexOf(workspaceMock.currentDesktop), 1, { message: "the empty desktop at the bottom is used" });
                Assert.equal(now.length, dynamic ? before + 1 : before, { message: dynamic ? "and gets a new empty one below" : "no new desktop is needed" });
            } else {
                Assert.equal(now.length, before + 1, { message: `dynamic ${dynamic} below ${below}: ${now.map(d => d.name).join(",")}` });
                Assert.equal(now.indexOf(workspaceMock.currentDesktop), below ? 1 : 0, { message: `a new desktop ${below ? "below" : "above"} the current one` });
            }
            Assert.equalArrays(b.desktops, [workspaceMock.currentDesktop]);
            Assert.equalArrays(a.desktops, [d1]);
            Assert.equal(workspaceMock.activeWindow, b);

            // focus=false: the window goes, the view stays
            workspaceMock.currentDesktop = d1;
            workspaceMock.activeWindow = a;
            const [c] = workspaceMock.createClients(1);
            workspaceMock.activeWindow = c;
            qtMock.fireShortcut(`window-move-to-new-desktop-${below ? "below" : "above"}-no-focus`);
            Assert.equal(workspaceMock.currentDesktop, d1);
            Assert.assert(!c.desktops.includes(d1), { message: "the window left this desktop" });
            Assert.equal(workspaceMock.activeWindow, a, { message: "the focus stays" });
        }
    }
});

tests.register("move-workspace-to-index", 3, () => {
    const config = getDefaultConfig();
    const { qtMock, workspaceMock } = init(config);
    workspaceMock.createDesktop(2, "Desktop 3");
    const [d1, d2, d3] = workspaceMock.desktops;
    const [a] = workspaceMock.createClients(1);
    workspaceMock.currentDesktop = d2;
    const [b] = workspaceMock.createClients(1);
    workspaceMock.currentDesktop = d3;
    const [c] = workspaceMock.createClients(1);
    workspaceMock.currentDesktop = d1;
    workspaceMock.activeWindow = a;

    qtMock.fireShortcut("move-desktop-to-index-3");
    Assert.equalArrays(desktopNames(), ["Desktop 2", "Desktop 3", "Desktop 1"]);
    Assert.equal(workspaceMock.currentDesktop.name, "Desktop 1");
    Assert.equal(workspaceMock.desktops.indexOf(workspaceMock.currentDesktop), 2);
    Assert.equalArrays(a.desktops, [workspaceMock.currentDesktop]);
    Assert.equalArrays(b.desktops, [workspaceMock.desktops[0]]);
    Assert.equalArrays(c.desktops, [workspaceMock.desktops[1]]);

    qtMock.fireShortcut("move-desktop-to-index-1");
    Assert.equalArrays(desktopNames(), ["Desktop 1", "Desktop 2", "Desktop 3"]);
    Assert.equalArrays(a.desktops, [workspaceMock.desktops[0]]);
    qtMock.fireShortcut("move-desktop-to-index-9");
    Assert.equal(workspaceMock.desktops.indexOf(workspaceMock.currentDesktop), 2, { message: "an index past the last one means the last" });
});

tests.register("Dynamic desktops: an empty desktop goes only after it has been left for a while", 3, () => {
    const config = getDefaultConfig();
    config.dynamicDesktops = true;
    const { qtMock, workspaceMock, world } = init(config);
    const [a] = workspaceMock.createClients(1);
    const [d1] = workspaceMock.desktops;
    MockQmlTimer.deferred = true;
    try {
        workspaceMock.activeWindow = a;
        qtMock.fireShortcut("column-move-to-next-desktop");
        // the empty desktop below is made as soon as the window is there, before the switch starts; nothing changes under the animation
        Assert.equal(workspaceMock.desktops.length, 3);
        Assert.assert(workspaceMock.desktops.includes(d1), { message: "the desktop that was left is still there during the switch" });
        MockQmlTimer.flush();
        Assert.assert(!workspaceMock.desktops.includes(d1), { message: "and gone when the wait is over" });
        Assert.equal(workspaceMock.desktops.length, 2);
        Assert.assert(!getClientManager(world).isDesktopOccupied(workspaceMock.desktops[1]));
    } finally {
        MockQmlTimer.deferred = false;
    }
});

tests.register("Dynamic desktops: coming back to the empty desktop keeps it", 3, () => {
    const config = getDefaultConfig();
    config.dynamicDesktops = true;
    const { qtMock, workspaceMock } = init(config);
    const [a] = workspaceMock.createClients(1);
    const [d1] = workspaceMock.desktops;
    MockQmlTimer.deferred = true;
    try {
        workspaceMock.activeWindow = a;
        qtMock.fireShortcut("column-move-to-next-desktop");
        qtMock.fireShortcut("desktop-previous"); // back to the empty d1 before the wait is over
        MockQmlTimer.flush();
        Assert.equal(workspaceMock.currentDesktop, d1);
        Assert.assert(workspaceMock.desktops.includes(d1), { message: "the current desktop is never removed" });
    } finally {
        MockQmlTimer.deferred = false;
    }
});

tests.register("Dynamic desktops are off by default (fixed desktops, like Plasma)", 1, () => {
    const config: any = {};
    for (const prop of configDef) {
        config[prop.name] = prop.default;
    }
    Assert.equal(config.dynamicDesktops, false);
    Assert.equal(config.emptyDesktopAboveFirst, false);
    Assert.equal(config.desktopAutoBackAndForth, false);
});

tests.register("niri import: workspace binds, named workspaces and options", 1, () => {
    const result = NiriImport.parse(`
        layout { empty-workspace-above-first }
        input { workspace-auto-back-and-forth }
        workspace "browser"
        workspace "chat" { open-on-output "DP-2"; }
        binds {
            Mod+1 { focus-workspace "browser"; }
            Mod+2 { focus-workspace "chat"; }
            Mod+3 { focus-workspace 3; }
            Mod+Shift+1 { move-column-to-workspace "browser"; }
            Mod+Shift+3 { move-column-to-workspace 3 focus=false; }
            Mod+Ctrl+W { move-window-to-workspace "extra"; }
            Mod+N { set-workspace-name "later"; }
            Mod+Shift+N { unset-workspace-name; }
            Mod+Ctrl+U { move-column-to-workspace-down focus=false; }
            Mod+Ctrl+I { move-window-to-workspace-up focus=false; }
            Mod+Y { move-workspace-to-index 2; }
            Mod+B { move-column-to-new-workspace-below; }
            Mod+A { move-window-to-new-workspace-above focus=false; }
            Mod+Z { move-column-to-new-workspace-below "chat"; }
            Mod+U { focus-workspace-down; }
        }
    `);
    Assert.equal(result.settings["emptyDesktopAboveFirst"], true);
    Assert.equal(result.settings["desktopAutoBackAndForth"], true);
    Assert.equal(result.settings["namedDesktops"], JSON.stringify(["browser", "chat"]));
    Assert.equal(result.settings["desktopBindNames"], JSON.stringify(["browser", "chat", "extra", "later"]));
    const keys = result.shortcutKeys;
    Assert.equalArrays(keys["desktop-named-1"], ["Meta+1"]);
    Assert.equalArrays(keys["desktop-named-2"], ["Meta+2"]);
    Assert.equalArrays(keys["desktop-3"], ["Meta+3"]);
    Assert.equalArrays(keys["column-move-to-desktop-named-1"], ["Meta+Shift+1"]);
    Assert.equalArrays(keys["column-move-to-desktop-no-focus-3"], ["Meta+Shift+3"]);
    Assert.equalArrays(keys["window-move-to-desktop-named-3"], ["Meta+Ctrl+W"]);
    Assert.equalArrays(keys["set-desktop-name-4"], ["Meta+N"]);
    Assert.equalArrays(keys["unset-desktop-name"], ["Meta+Shift+N"]);
    Assert.equalArrays(keys["column-move-to-next-desktop-no-focus"], ["Meta+Ctrl+U"]);
    Assert.equalArrays(keys["window-move-to-previous-desktop-no-focus"], ["Meta+Ctrl+I"]);
    Assert.equalArrays(keys["move-desktop-to-index-2"], ["Meta+Y"]);
    Assert.equalArrays(keys["column-move-to-new-desktop-below"], ["Meta+B"]);
    Assert.equalArrays(keys["window-move-to-new-desktop-above-no-focus"], ["Meta+A"]);
    Assert.equalArrays(keys["desktop-next"], ["Meta+U"]);
    Assert.assert(result.skipped.some(line => line.includes("move-column-to-new-workspace-below chat")), { message: "a workspace reference is skipped" });
    // every shortcut name that is bound exists
    const known = new Set(getShortcuts({} as any, {} as any).map(shortcut => shortcut.name));
    for (const name of Object.keys(keys)) {
        Assert.assert(known.has(name), { message: "unknown shortcut " + name });
    }
});
