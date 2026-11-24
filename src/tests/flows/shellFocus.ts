// KRunner and Plasma's popups keep the keyboard focus, but the pointer must not snap to them, and when they close the
// focus goes back to the window that had it before, not to the hovered one (niri)
function shellWindow(resourceClass: string, props: object = {}) {
    const client = new MockKwinClient(new MockQmlRect(500, 500, 300, 60));
    client.resourceClass = resourceClass;
    client.caption = resourceClass;
    Object.assign(client, props);
    return client;
}

function shellSetup(withFfm = false) {
    const config = getDefaultConfig();
    config.cursorFollowsFocus = true;
    config.focusFollowsMouse = withFfm;
    const { qtMock, workspaceMock } = init(config);
    const [a, b, c] = workspaceMock.createClients(3);
    workspaceMock.stackingOrder.push(a, b, c);
    qtMock.fireShortcut("focus-1");
    Assert.assert(workspaceMock.activeWindow === a, { message: "invalid test setup" });
    const inside = (client: MockKwinClient) => {
        const f = client.getActualFrameGeometry();
        return new MockQmlPoint(Math.floor(f.x + f.width / 2), Math.floor(f.y + f.height / 2));
    };
    return { qtMock, workspaceMock, a, b, c, inside };
}

const shellKinds: [string, object][] = [
    ["krunner", {}],
    ["org.kde.krunner", { normalWindow: false }],
    ["org.kde.plasmashell", { appletPopup: true }],
    ["org.kde.plasmashell", { normalWindow: false, popupWindow: true }],
    ["org.kde.plasmashell", { normalWindow: false, dock: true }],
];

tests.register("Shell windows: KRunner or a popup takes the focus without moving the pointer", 1, () => {
    for (const [resourceClass, props] of shellKinds) {
        const { workspaceMock, a, b, inside } = shellSetup();
        const pointer = inside(b);
        workspaceMock.cursorPos = pointer.clone();
        const shell = shellWindow(resourceClass, props);
        workspaceMock.createWindows(shell);
        workspaceMock.stackingOrder.push(shell);
        Assert.assert(workspaceMock.activeWindow === shell, { message: "the shell window keeps the keyboard focus: " + resourceClass });
        Assert.assert(pointEquals(workspaceMock.cursorPos, pointer), { message: "no warp to the shell window: " + resourceClass });
        // even a key action that asks for a warp while it is open does not move the pointer to it
        workspaceMock.activeWindow = a;
        workspaceMock.activeWindow = shell;
        Assert.assert(pointEquals(workspaceMock.cursorPos, pointer), { message: "still no warp: " + resourceClass });
    }
});

tests.register("Shell windows: closing KRunner gives the focus back without a warp", 1, () => {
    for (const ffm of [false, true]) {
        for (const [resourceClass, props] of shellKinds) {
            const { workspaceMock, a, b, inside } = shellSetup(ffm);
            const shell = shellWindow(resourceClass, props);
            workspaceMock.createWindows(shell);
            workspaceMock.stackingOrder.push(shell);
            const pointer = inside(b);
            workspaceMock.cursorPos = pointer.clone();
            workspaceMock.removeWindow(shell);
            Assert.assert(workspaceMock.activeWindow === a, { message: `the previous window gets the focus back (${resourceClass}, ffm ${ffm})` });
            Assert.assert(pointEquals(workspaceMock.cursorPos, pointer), { message: "pointer stays" });
            if (ffm) {
                // focus follows the mouse on the next pointer motion only
                const follower = new FocusFollowsMouse(() => false, 100);
                try {
                    workspaceMock.cursorPos = inside(a); // the pointer was over the previous window, then enters b
                    workspaceMock.cursorPosChanged.fire();
                    Assert.assert(workspaceMock.activeWindow === a);
                    workspaceMock.cursorPos = pointer.clone();
                    workspaceMock.cursorPosChanged.fire();
                    Assert.assert(workspaceMock.activeWindow === b, { message: "the next pointer motion focuses the hovered window" });
                } finally {
                    follower.destroy();
                }
            }
        }
    }
});

tests.register("Shell windows: closing KRunner over nothing gives the focus back", 1, () => {
    for (const [resourceClass, props] of shellKinds) {
        const { workspaceMock, a, b, c } = shellSetup();
        workspaceMock.activeWindow = b;
        const shell = shellWindow(resourceClass, props);
        workspaceMock.createWindows(shell);
        workspaceMock.stackingOrder.push(shell);
        const pointer = new MockQmlPoint(screen.width - 1, screen.height - 1);
        workspaceMock.cursorPos = pointer.clone();
        workspaceMock.removeWindow(shell); // the mock lets KWin pick a random window
        Assert.assert(workspaceMock.activeWindow === b, { message: "the window focused before gets it back: " + resourceClass });
        Assert.assert(pointEquals(workspaceMock.cursorPos, pointer), { message: "pointer stays" });
    }
});

tests.register("Shell windows: an app launched from KRunner gets the focus", 1, () => {
    for (const newFirst of [false, true]) {
        const { workspaceMock, a, b, inside } = shellSetup();
        const shell = shellWindow("krunner");
        workspaceMock.createWindows(shell);
        workspaceMock.stackingOrder.push(shell);
        workspaceMock.cursorPos = inside(b);
        let app: MockKwinClient;
        if (newFirst) {
            app = workspaceMock.createWindowActivatedFirst(new MockQmlRect(20, 20, 300, 300));
            workspaceMock.removeWindow(shell);
        } else {
            workspaceMock.removeWindow(shell);
            app = workspaceMock.createWindowActivatedFirst(new MockQmlRect(20, 20, 300, 300));
        }
        Assert.assert(workspaceMock.activeWindow === app, { message: `the new app has the focus (new window first: ${newFirst})` });
    }
});

tests.register("Shell windows: a new tiled app still warps the pointer, a notification does not", 1, () => {
    const { workspaceMock, inside, b } = shellSetup();
    workspaceMock.cursorPos = new MockQmlPoint(1, 1);
    const note = shellWindow("org.kde.plasmashell", { normalWindow: false });
    workspaceMock.createWindows(note);
    Assert.assert(pointEquals(workspaceMock.cursorPos, new MockQmlPoint(1, 1)), { message: "a notification does not move the pointer" });
    const app = workspaceMock.createWindowActivatedFirst(new MockQmlRect(20, 20, 300, 300));
    Assert.assert(rectContainsPoint(app.getActualFrameGeometry(), Workspace.cursorPos), { message: "a new app gets the pointer" });
});
