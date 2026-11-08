// niri's view_offset_to_restore: when the focused column goes full-screen or maximized, the view offset it had is
// kept, and when it is back to its normal size the view returns to it, instead of being worked out again. Nothing is
// restored when the column moved, or when the focus went elsewhere in between.
{
    function setup(modify: (config: Config) => void = () => {}) {
        const config = getDefaultConfig();
        config.tileFullScreen = true;
        config.tileMaximized = true;
        modify(config);
        const { qtMock, workspaceMock, world } = init(config);
        // far-scrolled: eight columns, the focused one (index 5) sits at the right edge of the screen
        const clients = workspaceMock.createClientsWithWidths(300, 300, 300, 300, 300, 300, 300, 300);
        workspaceMock.activeWindow = clients[0];
        workspaceMock.activeWindow = clients[5];
        return { config, qtMock, workspaceMock, world, clients };
    }

    function same(a: number[], b: number[]) {
        return a.length === b.length && a.every((x, i) => x === b[i]);
    }

    function xs(clients: MockKwinClient[]) {
        return clients.map(client => client.getActualFrameGeometry().x);
    }

    // the view offset is restored, not recomputed: a lazy scroller would leave the column at the left edge of the screen
    function registerFullScreenTests(suffix: string, modify: (config: Config) => void) {
        tests.register("View offset is restored after full-screen " + suffix, 10, () => {
            const { qtMock, workspaceMock, clients } = setup(modify);
            const before = xs(clients);
            Assert.fullyVisible(clients[5].getActualFrameGeometry());

            clients[5].fullScreen = true;
            Assert.equalRects(clients[5].getActualFrameGeometry(), screen);
            Assert.assert(!same(xs(clients), before), { message: "the view moved while the column is full-screen" });

            clients[5].fullScreen = false;
            Assert.equal(Workspace.activeWindow, clients[5]);
            Assert.equalArrays(xs(clients), before, { message: "the view is back where it was" });
        });

        tests.register("View offset is restored after unmaximizing " + suffix, 10, () => {
            const { clients } = setup(modify);
            const before = xs(clients);
            clients[5].setMaximize(true, true);
            clients[5].setMaximize(false, false);
            Assert.equalArrays(xs(clients), before);
        });

        tests.register("View offset is kept when the focus came back " + suffix, 10, () => {
            const { qtMock, workspaceMock, clients } = setup(modify);
            const before = xs(clients);
            clients[5].fullScreen = true;
            qtMock.fireShortcut("focus-right");
            qtMock.fireShortcut("focus-left");
            Assert.equal(Workspace.activeWindow, clients[5]);
            clients[5].fullScreen = false;
            // the focus left the column in between: niri forgets the offset and shows the column the usual way
            Assert.fullyVisible(clients[5].getActualFrameGeometry());
        });
    }
    registerFullScreenTests("(lazy)", config => { config.scrollingLazy = true; config.scrollingOnOverflow = false; config.scrollingCentered = false; });
    registerFullScreenTests("(on overflow)", config => { config.scrollingLazy = false; config.scrollingOnOverflow = true; config.scrollingCentered = false; });

    tests.register("View offset is not restored when the focus changed in between", 10, () => {
        const { qtMock, workspaceMock, clients } = setup(config => { config.scrollingLazy = true; config.scrollingOnOverflow = false; config.scrollingCentered = false; });
        const before = xs(clients);
        clients[5].fullScreen = true;
        // another window is focused, then this one again: the stored offset is gone
        workspaceMock.activeWindow = clients[2];
        workspaceMock.activeWindow = clients[5];
        clients[5].fullScreen = false;
        Assert.assert(Workspace.activeWindow === clients[5]);
        const after = xs(clients);
        Assert.fullyVisible(clients[5].getActualFrameGeometry());
        Assert.equal(after[5], tilingArea.x, { message: "lazy scrolling: the column is at the left edge, as the layout was recomputed" });
        Assert.assert(!same(after, before));
    });

    tests.register("View offset is not restored after the column moved", 10, () => {
        const { qtMock, workspaceMock, clients } = setup(config => { config.scrollingLazy = true; config.scrollingOnOverflow = false; config.scrollingCentered = false; });
        clients[5].fullScreen = true;
        qtMock.fireShortcut("window-move-left");
        clients[5].fullScreen = false;
        Assert.assert(Workspace.activeWindow === clients[5]);
        Assert.fullyVisible(clients[5].getActualFrameGeometry());
        Assert.equal(clients[5].getActualFrameGeometry().x, tilingArea.x, { message: "recomputed, not restored" });
    });

    tests.register("View offset is restored once for one full-screen trip", 10, () => {
        const { qtMock, workspaceMock, clients } = setup(config => { config.scrollingLazy = true; config.scrollingOnOverflow = false; config.scrollingCentered = false; });
        const before = xs(clients);
        clients[5].fullScreen = true;
        clients[5].fullScreen = false;
        Assert.equalArrays(xs(clients), before);
        // scroll away by hand and go full-screen again from the new place
        qtMock.fireShortcut("focus-left");
        qtMock.fireShortcut("focus-right");
        const second = xs(clients);
        clients[5].fullScreen = true;
        clients[5].fullScreen = false;
        Assert.equalArrays(xs(clients), second);
    });

    tests.register("Leaving full-screen does not warp the cursor (niri)", 10, () => {
        const { qtMock, workspaceMock, clients } = setup(config => { config.scrollingLazy = true; config.scrollingOnOverflow = false; config.scrollingCentered = false; config.cursorFollowsFocus = true; });
        clients[5].fullScreen = true;
        workspaceMock.cursorPos = new MockQmlPoint(5, 5);
        clients[5].fullScreen = false;
        // niri has no warp in set-window-fullscreen / fullscreen-window (input/mod.rs): only focus changes and moves warp
        Assert.assert(pointEquals(workspaceMock.cursorPos, new MockQmlPoint(5, 5)), { message: "the pointer stays when a window leaves full-screen" });
    });
}
