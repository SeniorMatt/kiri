// issue 1: every output has a strip of columns of its own, like niri's monitors
{
    const right = () => new MockQmlRect(800, 0, 800, 600);

    function setup(config = getDefaultConfig()) {
        const result = init(config);
        result.workspaceMock.setOutputs(["DP-1", screen], ["DP-2", right()]);
        return result;
    }

    // a window that opens on the second output
    function openOnRight(workspaceMock: MockWorkspace, width = 300) {
        const [client] = workspaceMock.createClientsWithFrames(new MockQmlRect(900, 100, width, 300));
        return client;
    }

    function inside(client: MockKwinClient, rect: MockQmlRect, message: string) {
        const frame = client.getActualFrameGeometry();
        Assert.assert(frame.x >= rect.x && rectRight(frame) <= rectRight(rect), { message: message + ": " + JSON.stringify([frame.x, frame.width]) + " is not in " + JSON.stringify([rect.x, rect.width]) });
    }

    tests.register("Multi-monitor: each output has its own strip of columns", 5, () => {
        const { workspaceMock, world } = setup();
        const [a, b] = workspaceMock.createClientsWithWidths(300, 300);
        const c = openOnRight(workspaceMock);
        const d = openOnRight(workspaceMock);
        for (const client of [a, b]) {
            inside(client, screen, "a window of the first output");
        }
        for (const client of [c, d]) {
            inside(client, right(), "a window of the second output");
        }
        // both strips start at the left edge of their output, like the one of a single output
        Assert.equal(Math.round(a.getActualFrameGeometry().y), tilingArea.y);
        Assert.equal(Math.round(c.getActualFrameGeometry().y), tilingArea.y);
        world.do(clientManager => {
            Assert.equal(clientManager.findTiledWindow(a)!.column.grid === clientManager.findTiledWindow(b)!.column.grid, true);
            Assert.equal(clientManager.findTiledWindow(a)!.column.grid === clientManager.findTiledWindow(c)!.column.grid, false);
            Assert.equal(clientManager.findTiledWindow(c)!.column.grid === clientManager.findTiledWindow(d)!.column.grid, true);
        });
    });

    tests.register("Multi-monitor: the keys act on the strip of the focused window", 5, () => {
        const { qtMock, workspaceMock } = setup();
        const [a, b] = workspaceMock.createClientsWithWidths(300, 300);
        const c = openOnRight(workspaceMock);
        const d = openOnRight(workspaceMock);
        workspaceMock.activeWindow = d;
        qtMock.fireShortcut("focus-left");
        Assert.equal(workspaceMock.activeWindow, c, { message: "focus-left stays on the second output" });
        qtMock.fireShortcut("focus-left");
        Assert.equal(workspaceMock.activeWindow, c, { message: "the strip ends there" });
        qtMock.fireShortcut("column-move-right");
        inside(c, right(), "the column moved inside its output");
        inside(d, right(), "the other column too");
        workspaceMock.activeWindow = a;
        qtMock.fireShortcut("focus-right");
        Assert.equal(workspaceMock.activeWindow, b);
        qtMock.fireShortcut("focus-right");
        Assert.equal(workspaceMock.activeWindow, b, { message: "focus-right does not jump to the other output" });
    });

    tests.register("Multi-monitor: focus-monitor-left and -right", 5, () => {
        const { qtMock, workspaceMock } = setup();
        const [a, b] = workspaceMock.createClientsWithWidths(300, 300);
        const c = openOnRight(workspaceMock);
        const d = openOnRight(workspaceMock);
        workspaceMock.activeWindow = a;
        qtMock.fireShortcut("focus-monitor-right");
        Assert.equal(workspaceMock.activeWindow, d, { message: "the window that was active on the second output" });
        qtMock.fireShortcut("focus-monitor-right");
        Assert.equal(workspaceMock.activeWindow, d, { message: "no output further right" });
        qtMock.fireShortcut("focus-monitor-up");
        Assert.equal(workspaceMock.activeWindow, d);
        qtMock.fireShortcut("focus-monitor-left");
        Assert.equal(workspaceMock.activeWindow, a, { message: "the one that was active on the first" });
        qtMock.fireShortcut("focus-monitor-next");
        Assert.equal(workspaceMock.activeWindow, d);
        qtMock.fireShortcut("focus-monitor-previous");
        Assert.equal(workspaceMock.activeWindow, a);
        workspaceMock.activeWindow = c;
        qtMock.fireShortcut("focus-monitor-left");
        Assert.equal(workspaceMock.activeWindow, a, { message: "it is not changed by the window that was focused on the other one" });
        Assert.assert(b !== null);
    });

    tests.register("Multi-monitor: column-move-to-monitor and window-move-to-monitor", 5, () => {
        const { qtMock, workspaceMock, world } = setup();
        const [a, b] = workspaceMock.createClientsWithWidths(300, 300);
        const c = openOnRight(workspaceMock);
        workspaceMock.activeWindow = a;
        qtMock.fireShortcut("column-move-to-monitor-right");
        inside(a, right(), "the column is on the second output");
        inside(b, screen, "the other column stays");
        Assert.equal(workspaceMock.activeWindow, a, { message: "the moved column keeps the focus" });
        const aFrame = a.getActualFrameGeometry();
        const cFrame = c.getActualFrameGeometry();
        Assert.assert(aFrame.x > cFrame.x, { message: "it is put to the right of the active column of the target" });
        qtMock.fireShortcut("focus-left");
        Assert.equal(workspaceMock.activeWindow, c, { message: "the keys work on the second output now" });
        qtMock.fireShortcut("column-move-to-monitor-left");
        inside(c, screen, "and back");
        qtMock.fireShortcut("column-move-to-monitor-left");
        inside(c, screen, "no output to the left of the first");

        // a window of a column with two windows leaves it
        workspaceMock.activeWindow = b;
        qtMock.fireShortcut("window-move-left"); // into the column of c? (the first column of the strip)
        world.do((clientManager) => {
            const window = clientManager.findTiledWindow(b)!;
            Assert.assert(window.column.getWindowCount() >= 1);
        });
        qtMock.fireShortcut("window-move-to-monitor-right");
        inside(b, right(), "the window is on the second output");
    });

    tests.register("Multi-monitor: columns that are out of the view are not on the other output", 5, () => {
        const { qtMock, workspaceMock } = setup();
        const clients = workspaceMock.createClientsWithWidths(500, 500, 500, 500);
        const c = openOnRight(workspaceMock);
        workspaceMock.activeWindow = clients[0];
        qtMock.fireShortcut("focus-start");
        const bottom = 600;
        for (const client of clients) {
            const frame = client.getActualFrameGeometry();
            const visible = frame.x < 800 && rectRight(frame) > 0;
            if (!visible) {
                Assert.assert(frame.y >= bottom, { message: "a column out of the view is below all the outputs, not on the second one: " + JSON.stringify([frame.x, frame.y]) });
            } else {
                Assert.assert(frame.y < bottom, { message: "a visible column stays in place" });
            }
        }
        // scrolling to the end brings them back and parks the first ones
        qtMock.fireShortcut("focus-end");
        const last = clients[3].getActualFrameGeometry();
        Assert.assert(last.y < bottom && last.x < 800 && rectRight(last) <= 800, { message: "the focused column is in view: " + JSON.stringify([last.x, last.y]) });
        Assert.assert(clients[0].getActualFrameGeometry().y >= bottom, { message: "the first one is parked now" });
        inside(c, right(), "the second output is not touched");
    });

    tests.register("Multi-monitor: one output only parks nothing", 3, () => {
        const { qtMock, workspaceMock } = init(getDefaultConfig());
        const clients = workspaceMock.createClientsWithWidths(500, 500, 500);
        workspaceMock.activeWindow = clients[0];
        qtMock.fireShortcut("focus-start");
        for (const client of clients) {
            Assert.assert(client.getActualFrameGeometry().y < screen.height);
        }
    });

    tests.register("Multi-monitor: an unplugged output hands its columns over and gets them back", 5, () => {
        const { workspaceMock } = setup();
        const [a] = workspaceMock.createClientsWithWidths(200);
        const c = openOnRight(workspaceMock, 200);
        const d = openOnRight(workspaceMock, 200);
        workspaceMock.activeWindow = d;

        // the output goes away: KWin moves the windows that were on it
        workspaceMock.removeOutput("DP-2");
        for (const client of [c, d]) {
            const frame = client.getFrameGeometryCopy();
            client.frameGeometry = new MockQmlRect(frame.x - 800, frame.y, frame.width, frame.height);
        }
        workspaceMock.screensChanged.fire();
        for (const client of [a, c, d]) {
            inside(client, screen, "all windows are on the first output");
        }
        Assert.equal(workspaceMock.activeWindow, d, { message: "the focus is kept" });

        // and it comes back
        workspaceMock.addOutput("DP-2", right());
        workspaceMock.screensChanged.fire();
        inside(a, screen, "the first window stays");
        inside(c, right(), "the window of the second output goes back");
        inside(d, right(), "the other one too");
        Assert.equal(workspaceMock.activeWindow, d, { message: "the focus is kept" });
    });

    tests.register("Multi-monitor: every output can come and go while windows open and close", 3, () => {
        const { workspaceMock } = setup();
        const clients = [...workspaceMock.createClientsWithWidths(300, 300), openOnRight(workspaceMock)];
        for (let i = 0; i < 4; i++) {
            workspaceMock.removeOutput("DP-1");
            for (const client of clients) {
                const frame = client.getFrameGeometryCopy();
                client.frameGeometry = new MockQmlRect(frame.x + 800, frame.y, frame.width, frame.height);
            }
            workspaceMock.screensChanged.fire();
            const extra = openOnRight(workspaceMock);
            clients.push(extra);
            workspaceMock.addOutput("DP-1", screen);
            workspaceMock.screensChanged.fire();
            workspaceMock.removeWindow(clients.shift()!);
        }
        for (const client of clients) {
            const frame = client.getActualFrameGeometry();
            Assert.assert(frame.y >= 0 && frame.y < 700 && frame.x > -800 && frame.x < 1600, { message: "every window is where an output is: " + JSON.stringify([frame.x, frame.y]) });
        }
    });

    tests.register("Multi-monitor: no output at all (KWin's placeholder) does not break anything", 3, () => {
        const { workspaceMock } = setup();
        const clients = workspaceMock.createClientsWithWidths(300, 300);
        const c = openOnRight(workspaceMock);
        workspaceMock.removeOutput("DP-1");
        workspaceMock.removeOutput("DP-2");
        workspaceMock.screensChanged.fire();
        workspaceMock.virtualScreenSizeChanged.fire();
        workspaceMock.addOutput("DP-1", screen);
        workspaceMock.addOutput("DP-2", right());
        workspaceMock.activeScreen = workspaceMock.screens[0];
        workspaceMock.screensChanged.fire();
        for (const client of clients) {
            inside(client, screen, "back on its output");
        }
        inside(c, right(), "back on its output");
    });

    tests.register("Multi-monitor: a reload of the script keeps the strips, also the parked columns", 5, () => {
        const config = getDefaultConfig();
        const { workspaceMock, world } = setup(config);
        const clients = workspaceMock.createClientsWithWidths(500, 500, 500, 500);
        const c = openOnRight(workspaceMock);
        const before = [...clients, c].map(client => client.getActualFrameGeometry().clone());
        const json = JSON.stringify(world.captureLayout());
        world.destroy();
        new World(config, null, Kiri.parseState(json));
        [...clients, c].forEach((client, i) => {
            Assert.equalRects(client.getActualFrameGeometry(), before[i], { message: "window " + i });
        });
    });

    tests.register("Multi-monitor: a floating window on the second output moves back with the monitor keys", 5, () => {
        const { qtMock, workspaceMock } = setup();
        const [a] = workspaceMock.createClientsWithWidths(300);
        workspaceMock.activeWindow = a;
        qtMock.fireShortcut("window-toggle-floating");
        qtMock.fireShortcut("window-move-to-monitor-right");
        inside(a, right(), "on the second output");
        Assert.equal(workspaceMock.activeWindow, a);
        qtMock.fireShortcut("window-move-to-monitor-left");
        inside(a, screen, "and back");
    });

    // niri: closing the last window of the focused monitor leaves that monitor focused, with no window
    for (const perScreen of [false, true]) {
        tests.register("Multi-monitor: closing the last window of the focused output keeps that output focused" + (perScreen ? " (per-screen)" : ""), 5, () => {
            const { qtMock, workspaceMock } = setup();
            workspaceMock.setPerScreenDesktops(perScreen);
            const [a] = workspaceMock.createClientsWithWidths(300);
            const b = openOnRight(workspaceMock);
            workspaceMock.activeWindow = b;
            workspaceMock.activeScreen = workspaceMock.screens[1];
            workspaceMock.removeWindow(b);
            workspaceMock.activeWindow = null; // KWin focuses nothing on the empty output
            Assert.equal(workspaceMock.activeScreen.name, "DP-2");
            Assert.equal(workspaceMock.activeWindow, null, { message: "the empty output has no window to focus" });
            qtMock.fireShortcut("focus-monitor-left");
            Assert.equal(workspaceMock.activeWindow, a, { message: "the keys still start from the second output" });
        });
    }
    // the decorations effect clips each tiled window to the output of its strip; the script tells it which that is
    tests.register("Multi-monitor: each tiled window's output name is sent to the effect, and cleared when it goes", 5, () => {
        const { workspaceMock } = setup();
        const [a, b] = workspaceMock.createClientsWithWidths(300, 300);
        const c = openOnRight(workspaceMock);
        const outputOf = (client: MockKwinClient) => windowOutputs.get(String(client.internalId));
        Assert.equal(outputOf(a), "DP-1");
        Assert.equal(outputOf(b), "DP-1");
        Assert.equal(outputOf(c), "DP-2");
        workspaceMock.removeWindow(c);
        Assert.equal(outputOf(c), undefined, { message: "a closed window is forgotten" });
        Assert.equal(outputOf(a), "DP-1");
    });

    tests.register("Multi-monitor: a window moved to the other output is sent with the new name", 5, () => {
        const { qtMock, workspaceMock } = setup();
        const [a] = workspaceMock.createClientsWithWidths(300);
        workspaceMock.activeWindow = a;
        qtMock.fireShortcut("window-move-to-monitor-right");
        Assert.equal(windowOutputs.get(String(a.internalId)), "DP-2");
    });

    tests.register("Multi-monitor: a floating window is not clipped to an output", 5, () => {
        const { qtMock, workspaceMock } = setup();
        const [a] = workspaceMock.createClientsWithWidths(300);
        workspaceMock.activeWindow = a;
        Assert.equal(windowOutputs.get(String(a.internalId)), "DP-1");
        qtMock.fireShortcut("window-toggle-floating");
        Assert.equal(windowOutputs.get(String(a.internalId)), undefined);
    });

    tests.register("A single output sends no window outputs", 5, () => {
        const { workspaceMock } = init(getDefaultConfig());
        const [a] = workspaceMock.createClientsWithWidths(300);
        Assert.equal(windowOutputs.get(String(a.internalId)), undefined);
    });

    tests.register("Going back to one output clears the window outputs", 5, () => {
        const { workspaceMock } = setup();
        const [a] = workspaceMock.createClientsWithWidths(300);
        Assert.equal(windowOutputs.get(String(a.internalId)), "DP-1");
        workspaceMock.setOutputs(["DP-1", screen]);
        Assert.equal(windowOutputs.get(String(a.internalId)), undefined);
    });
}
