// Plasma 6.7's "switch desktops independently for each screen": like niri's monitors, every output has a workspace of its
// own, and the keys act on the focused output only
{
    const right = () => new MockQmlRect(800, 0, 800, 600);

    function setup(perScreen: boolean, configure: (config: Config) => void = () => {}) {
        const config = getDefaultConfig();
        configure(config);
        const result = init(config);
        result.workspaceMock.setOutputs(["DP-1", screen], ["DP-2", right()]);
        result.workspaceMock.setPerScreenDesktops(perScreen);
        const [client] = result.workspaceMock.createClientsWithFrames(new MockQmlRect(100, 100, 300, 300));
        const [other] = result.workspaceMock.createClientsWithFrames(new MockQmlRect(900, 100, 300, 300));
        return { ...result, left: client, right: other, d1: result.workspaceMock.desktops[0], d2: result.workspaceMock.desktops[1] };
    }

    function shown(workspaceMock: MockWorkspace) {
        return workspaceMock.screens.map(output => workspaceMock.currentDesktopForScreen(output));
    }

    function onOutput(client: MockKwinClient, rect: MockQmlRect) {
        const frame = client.getActualFrameGeometry();
        return frame.x >= rect.x && rectRight(frame) <= rectRight(rect);
    }

    tests.register("Per-screen desktops: a switch changes the focused output only", 3, () => {
        const { qtMock, workspaceMock, left, right: other, d1, d2 } = setup(true);
        workspaceMock.activeWindow = left;
        qtMock.fireShortcut("desktop-2");
        Assert.equalArrays(shown(workspaceMock), [d2, d1]);
        workspaceMock.activeWindow = other;
        qtMock.fireShortcut("desktop-2");
        Assert.equalArrays(shown(workspaceMock), [d2, d2]);
        qtMock.fireShortcut("desktop-1");
        Assert.equalArrays(shown(workspaceMock), [d2, d1]);
        // the windows stay where they are
        Assert.equalArrays(left.desktops, [d1]);
        Assert.equalArrays(other.desktops, [d1]);
        Assert.assert(onOutput(left, screen) && onOutput(other, right()));
    });

    tests.register("Per-screen desktops: desktop-next, desktop-previous and back-and-forth act on one output", 3, () => {
        const { qtMock, workspaceMock, left, right: other, d1, d2 } = setup(true, config => config.desktopAutoBackAndForth = true);
        workspaceMock.activeWindow = other;
        qtMock.fireShortcut("desktop-next");
        Assert.equalArrays(shown(workspaceMock), [d1, d2]);
        qtMock.fireShortcut("desktop-previous");
        Assert.equalArrays(shown(workspaceMock), [d1, d1]);
        workspaceMock.activeWindow = left;
        qtMock.fireShortcut("desktop-2");
        qtMock.fireShortcut("desktop-2"); // the shown one again: back
        Assert.equalArrays(shown(workspaceMock), [d1, d1]);
        workspaceMock.activeWindow = other;
        qtMock.fireShortcut("desktop-2");
        workspaceMock.activeWindow = left;
        qtMock.fireShortcut("desktop-2");
        qtMock.fireShortcut("desktop-2"); // left goes back to d1 (its own previous one), right stays on d2
        Assert.equalArrays(shown(workspaceMock), [d1, d2]);
    });

    tests.register("Per-screen desktops: move column to desktop keeps the window on its output", 3, () => {
        const { qtMock, workspaceMock, left, right: other, d1, d2 } = setup(true);
        workspaceMock.activeWindow = other;
        qtMock.fireShortcut("column-move-to-desktop-2");
        Assert.equalArrays(other.desktops, [d2]);
        Assert.equalArrays(left.desktops, [d1]);
        Assert.equalArrays(shown(workspaceMock), [d1, d2], { message: "the output of the column follows it, the other stays" });
        Assert.assert(onOutput(other, right()), { message: "still on its output" });
        Assert.equal(workspaceMock.activeWindow, other);
        workspaceMock.activeWindow = left;
        qtMock.fireShortcut("window-move-to-desktop-2");
        Assert.equalArrays(left.desktops, [d2]);
        Assert.equalArrays(shown(workspaceMock), [d2, d2]);
        Assert.assert(onOutput(left, screen), { message: "still on its output" });
        // and back, on the first output only
        qtMock.fireShortcut("column-move-to-previous-desktop");
        Assert.equalArrays(left.desktops, [d1]);
        Assert.equalArrays(shown(workspaceMock), [d1, d2]);
    });

    tests.register("Per-screen desktops: the focus after a switch goes to a window of that output", 3, () => {
        const { qtMock, workspaceMock, left, right: other, d1, d2 } = setup(true);
        const [third] = workspaceMock.createClientsWithFrames(new MockQmlRect(1300, 100, 200, 300));
        workspaceMock.activeWindow = third;
        qtMock.fireShortcut("column-move-to-desktop-2"); // the output follows with the moved column
        Assert.equalArrays(shown(workspaceMock), [d1, d2]);
        // KWin leaves no window focused on the switch; the keys then work on the last window of the output's desktop
        const focusAfter = (key: string) => {
            qtMock.fireShortcut(key);
            workspaceMock.activeWindow = null;
            workspaceMock.activeScreen = workspaceMock.screens[1];
            qtMock.fireShortcut("focus-left");
        };
        focusAfter("desktop-1");
        Assert.equalArrays(shown(workspaceMock), [d1, d1]);
        Assert.equal(workspaceMock.activeWindow, other, { message: "a window of the second output, not the first" });
        focusAfter("desktop-2");
        Assert.equalArrays(shown(workspaceMock), [d1, d2]);
        Assert.equal(workspaceMock.activeWindow, third);
        Assert.equalArrays(left.desktops, [d1]);
    });

    tests.register("Per-screen desktops: dynamic desktops keep a desktop another output shows", 3, () => {
        const { qtMock, workspaceMock, left, right: other, d1, d2 } = setup(true, config => config.dynamicDesktops = true);
        // d1: both windows, d2: empty; the first output looks at the empty desktop
        workspaceMock.activeWindow = left;
        qtMock.fireShortcut("desktop-2");
        Assert.equalArrays(shown(workspaceMock), [d2, d1]);
        Assert.equal(workspaceMock.desktops.length, 2);
        // the other output moves its window to d2 and on to a third desktop
        workspaceMock.activeWindow = other;
        qtMock.fireShortcut("column-move-to-next-desktop");
        Assert.equal(workspaceMock.desktops.length, 3, { message: "a window on the last desktop makes a new empty one" });
        qtMock.fireShortcut("column-move-to-next-desktop");
        Assert.assert(workspaceMock.desktops.includes(d2), { message: "d2 is empty but the first output shows it" });
        // the first output leaves it: now it goes away
        workspaceMock.activeWindow = left;
        qtMock.fireShortcut("desktop-1");
        Assert.assert(!workspaceMock.desktops.includes(d2), { message: "an empty desktop that no output shows is removed" });
        Assert.equal(workspaceMock.currentDesktopForScreen(workspaceMock.screens[0]), d1);
    });

    tests.register("Per-screen desktops: a window on a desktop another output shows is not on another desktop", 3, () => {
        const { qtMock, workspaceMock, left, right: other, d1, d2 } = setup(true);
        workspaceMock.activeWindow = left;
        qtMock.fireShortcut("desktop-2"); // the first output shows d2, the second still d1
        const frame = other.getActualFrameGeometry().clone();
        // a column move on the second output must lay out its window as a visible one
        workspaceMock.activeWindow = other;
        qtMock.fireShortcut("focus-left");
        qtMock.fireShortcut("column-move-right");
        Assert.assert(onOutput(other, right()));
        Assert.equalArrays(shown(workspaceMock), [d2, d1]);
        Assert.assert(frame.width > 0);
    });

    tests.register("Per-screen desktops: with the setting off a switch changes every output", 3, () => {
        const { qtMock, workspaceMock, left, right: other, d1, d2 } = setup(false);
        workspaceMock.activeWindow = left;
        qtMock.fireShortcut("desktop-2");
        Assert.equalArrays(shown(workspaceMock), [d2, d2]);
        workspaceMock.activeWindow = other;
        qtMock.fireShortcut("desktop-1");
        Assert.equalArrays(shown(workspaceMock), [d1, d1]);
        qtMock.fireShortcut("column-move-to-desktop-2");
        Assert.equalArrays(other.desktops, [d2]);
        Assert.equalArrays(left.desktops, [d1]);
        Assert.equalArrays(shown(workspaceMock), [d2, d2]);
        Assert.assert(onOutput(other, right()));
    });
}

// the overview's layout has one entry per output with per-screen desktops, and its events name the output
{
    const right = () => new MockQmlRect(800, 0, 800, 600);

    function setup(perScreen: boolean) {
        const result = init(getDefaultConfig());
        const { workspaceMock } = result;
        workspaceMock.setOutputs(["DP-1", screen], ["DP-2", right()]);
        workspaceMock.setPerScreenDesktops(perScreen);
        const [left] = workspaceMock.createClientsWithFrames(new MockQmlRect(100, 100, 300, 300));
        const [other] = workspaceMock.createClientsWithFrames(new MockQmlRect(900, 100, 300, 300));
        overviewCalls.length = 0;
        return { ...result, left, other, d1: workspaceMock.desktops[0], d2: workspaceMock.desktops[1] };
    }

    function shown(workspaceMock: MockWorkspace) {
        return workspaceMock.screens.map(output => workspaceMock.currentDesktopForScreen(output));
    }

    function pollEvents(world: World, events: object[]) {
        world.overviewPoll(JSON.stringify({ open: true, p: 1, events: events }));
    }

    tests.register("Per-screen desktops: the overview sends one layout per output", 3, () => {
        const { qtMock, workspaceMock, left, other, d1, d2 } = setup(true);
        workspaceMock.activeWindow = other;
        qtMock.fireShortcut("desktop-2"); // the second output only
        qtMock.fireShortcut("overview");
        const layout = overviewLastLayout();
        Assert.equal(layout.screens.length, 2);
        Assert.equal(layout.screens[0].current, 0);
        Assert.equal(layout.screens[1].current, 1);
        Assert.equal(layout.screens[0].screen.x, 0);
        Assert.equal(layout.screens[1].screen.x, 800);
        for (const one of layout.screens) {
            Assert.equalArrays(one.desktops.map((d: any) => d.id), [d1.id, d2.id]);
        }
        const ids = (one: any) => one.desktops.flatMap((d: any) => d.cols.flatMap((c: any) => c.wins.map((w: any) => w.id)));
        Assert.equalArrays(ids(layout.screens[0]), [String(left.internalId)]);
        Assert.equalArrays(ids(layout.screens[1]), [String(other.internalId)], { message: "the window of the second output is on its first desktop" });
    });

    tests.register("Per-screen desktops: the overview events switch and act on the named output", 3, () => {
        const { qtMock, workspaceMock, world, left, other, d1, d2 } = setup(true);
        qtMock.fireShortcut("overview");
        pollEvents(world, [{ t: "goto", i: 1, o: "DP-2" }]);
        Assert.equalArrays(shown(workspaceMock), [d1, d2]);
        pollEvents(world, [{ t: "goto", i: 1, o: "DP-1" }]);
        Assert.equalArrays(shown(workspaceMock), [d2, d2]);
        pollEvents(world, [{ t: "goto", i: 0, o: "DP-2" }]);
        Assert.equalArrays(shown(workspaceMock), [d2, d1]);
        pollEvents(world, [{ t: "activate", w: String(other.internalId), o: "DP-2" }]);
        Assert.equal(workspaceMock.activeWindow, other);
        Assert.equalArrays(shown(workspaceMock), [d2, d1]);
        const layout = overviewLastLayout();
        Assert.equal(layout.screens[0].current, 1);
        Assert.equal(layout.screens[1].current, 0);
        // a drop on the first output's second desktop goes to that output's strip
        pollEvents(world, [{ t: "drop", w: String(left.internalId), d: d2.id, c: 0, i: -1, o: "DP-1" }]);
        Assert.equalArrays(left.desktops, [d2]);
        Assert.assert(left.getActualFrameGeometry().x < 800);
        // a missing "o" acts on the focused output, like before
        workspaceMock.activeWindow = other;
        pollEvents(world, [{ t: "goto", i: 1 }]);
        Assert.equalArrays(shown(workspaceMock), [d2, d2]);
    });

    tests.register("Per-screen desktops: without the setting the overview sends the single layout", 3, () => {
        const { qtMock, workspaceMock } = setup(false);
        qtMock.fireShortcut("overview");
        const layout = overviewLastLayout();
        Assert.equal(layout.screens, undefined);
        Assert.equal(layout.desktops.length, workspaceMock.desktops.length);
        Assert.equal(layout.current, 0);
    });
}
