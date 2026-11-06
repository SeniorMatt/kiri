// niri's toggle-windowed-fullscreen: the client is told it is full-screen, the window stays a tile of its column.
{
    function setup(tileFullScreen = true) {
        const config = getDefaultConfig();
        config.tileFullScreen = tileFullScreen;
        const { qtMock, workspaceMock, world } = init(config);
        const clients = workspaceMock.createClientsWithWidths(300, 300, 300);
        workspaceMock.activeWindow = clients[1];
        return { config, qtMock, workspaceMock, world, clients };
    }

    function places(clients: MockKwinClient[]) {
        return clients.map(client => client.getActualFrameGeometry().clone());
    }

    function same(clients: MockKwinClient[], before: MockQmlRect[], message: string) {
        clients.forEach((client, i) => Assert.equalRects(client.getActualFrameGeometry(), before[i], { message: message + ": window " + i }));
    }

    // the view scrolls with the focus: the sizes stay
    function sameSizes(clients: MockKwinClient[], before: MockQmlRect[], message: string) {
        clients.forEach((client, i) => {
            const frame = client.getActualFrameGeometry();
            Assert.equal(frame.width, before[i].width, { message: message + ": width of window " + i });
            Assert.equal(frame.height, before[i].height, { message: message + ": height of window " + i });
            Assert.equal(frame.y, before[i].y, { message: message + ": y of window " + i });
        });
    }

    for (const tileFullScreen of [true, false]) {
        const suffix = " (tileFullScreen " + tileFullScreen + ")";

        tests.register("Windowed full-screen keeps the tile" + suffix, 10, () => {
            const { qtMock, clients } = setup(tileFullScreen);
            const before = places(clients);
            qtMock.fireShortcut("window-toggle-windowed-fullscreen");
            Assert.assert(clients[1].fullScreen, { message: "the client is full-screen" });
            same(clients, before, "on");
            Assert.equal(clients[1].getActualFrameGeometry().y, tilingArea.y);
            Assert.equal(clients[1].getActualFrameGeometry().height, tilingArea.height);
            qtMock.fireShortcut("window-toggle-windowed-fullscreen");
            Assert.assert(!clients[1].fullScreen, { message: "the client left full-screen" });
            same(clients, before, "off");
        });

        tests.register("Windowed full-screen: the real action makes it full-screen for real" + suffix, 10, () => {
            const { qtMock, clients } = setup(tileFullScreen);
            const before = places(clients);
            qtMock.fireShortcut("window-toggle-windowed-fullscreen");
            qtMock.fireShortcut("window-toggle-fullscreen");
            Assert.assert(clients[1].fullScreen);
            if (tileFullScreen) {
                Assert.equalRects(clients[1].getActualFrameGeometry(), screen);
            }
            // and the windowed toggle on a real full-screen window makes it a tile again
            qtMock.fireShortcut("window-toggle-windowed-fullscreen");
            Assert.assert(clients[1].fullScreen);
            same(clients, before, "windowed again");
            qtMock.fireShortcut("window-toggle-fullscreen");
            qtMock.fireShortcut("window-toggle-fullscreen");
            Assert.assert(!clients[1].fullScreen);
            same(clients, before, "real full-screen on and off");
        });
    }

    tests.register("Windowed full-screen: the app's own requests stay windowed", 10, () => {
        const { qtMock, clients } = setup();
        const before = places(clients);
        qtMock.fireShortcut("window-toggle-windowed-fullscreen");
        clients[1].fullScreen = true; // the app asks again (a video's button, F11): nothing changes
        same(clients, before, "request while windowed");
        clients[1].fullScreen = false; // the app leaves
        Assert.assert(!clients[1].fullScreen);
        same(clients, before, "app left");
        // the app asks again: that one is a real full-screen request, the windowed state is gone
        clients[1].fullScreen = true;
        Assert.equalRects(clients[1].getActualFrameGeometry(), screen);
    });

    tests.register("Windowed full-screen: focus changes and closing", 10, () => {
        const { qtMock, workspaceMock, clients } = setup();
        const before = places(clients);
        qtMock.fireShortcut("window-toggle-windowed-fullscreen");
        workspaceMock.activeWindow = clients[0];
        sameSizes(clients, before, "focus left");
        workspaceMock.activeWindow = clients[1];
        sameSizes(clients, before, "focus back");
        qtMock.fireShortcut("focus-right");
        qtMock.fireShortcut("focus-left");
        sameSizes(clients, before, "focus right and left");
        Assert.assert(clients[1].fullScreen);
        workspaceMock.removeWindow(clients[1]);
        Assert.assert(clients[0].getActualFrameGeometry().width === before[0].width, { message: "neighbour keeps its width" });
        Assert.equal(clients[2].getActualFrameGeometry().y, tilingArea.y);
    });

    tests.register("Windowed full-screen: it survives a script reload", 10, () => {
        const { config, qtMock, world, clients } = setup();
        const before = places(clients);
        qtMock.fireShortcut("window-toggle-windowed-fullscreen");
        const json = JSON.stringify(world.captureLayout());
        world.destroy();
        const next = new World(config, null, Kiri.parseState(json));
        same(clients, before, "after reload");
        Assert.assert(clients[1].fullScreen);
        qtMock.fireShortcut("window-toggle-fullscreen");
        Assert.equalRects(clients[1].getActualFrameGeometry(), screen);
        qtMock.fireShortcut("window-toggle-fullscreen");
        same(clients, before, "left");
        Assert.assert(next !== null);
    });
}
