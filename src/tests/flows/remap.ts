// SDL on X11 unmaps and maps its window again when a game goes full-screen: KWin deletes the window and makes a new
// one. Kiri treats that as one window: it keeps the place, the full-screen state and the focus, and does not pass the
// focus to the neighbour or scroll to it unless no window comes back within 300 ms.
{
    function setup() {
        const config = getDefaultConfig();
        config.tileFullScreen = true;
        config.scrollingLazy = true;
        config.scrollingOnOverflow = false;
        config.scrollingCentered = false;
        const { qtMock, workspaceMock, world } = init(config);
        MockQmlTimer.deferIntervals.add(300); // the 300 ms wait for a window that comes back is run by the test
        const clients = workspaceMock.createClientsWithWidths(300, 300, 300, 300, 300, 300);
        clients.forEach((client, index) => { client.pid = 100 + index; });
        return { config, qtMock, workspaceMock, world, clients };
    }

    function finish() {
        MockQmlTimer.deferIntervals.clear();
        MockQmlTimer.flush();
    }

    function xs(clients: MockKwinClient[]) {
        return clients.map(client => client.getActualFrameGeometry().x);
    }

    // a window of the same process and class as `old` is mapped; the window is not activated by the test
    function mapAgain(workspaceMock: MockWorkspace, old: MockKwinClient, pid = old.pid) {
        const client = new MockKwinClient(new MockQmlRect(randomInt(100), randomInt(100), 300, 400));
        client.pid = pid;
        client.resourceClass = old.resourceClass;
        client.caption = old.caption;
        workspaceMock.windows.push(client);
        workspaceMock.windowAdded.fire(client);
        return client;
    }

    tests.register("Remapped full-screen window takes its place, state and focus at once", 10, () => {
        const { workspaceMock, clients } = setup();
        const [a, b, c, d, e, f] = clients;
        workspaceMock.activeWindow = d;
        d.fullScreen = true;
        const before = xs(clients);
        Assert.equalRects(d.getActualFrameGeometry(), screen);

        workspaceMock.removeWindow(d);
        Assert.equalArrays(xs([a, b, c, e, f]), [before[0], before[1], before[2], before[4], before[5]], { message: "nothing moves while the window may come back" });

        const d2 = mapAgain(workspaceMock, d);
        Assert.assert(d2.fullScreen, { message: "the new window is full-screen at once" });
        Assert.equal(Workspace.activeWindow, d2, { message: "and it has the focus" });
        Assert.equalArrays(xs([a, b, c, d2, e, f]), before, { message: "everything is where it was" });
        Assert.equalRects(d2.getActualFrameGeometry(), screen);
        finish();
    });

    tests.register("Remapped window: the view before full-screen is still restored", 10, () => {
        const { workspaceMock, clients } = setup();
        const [a, b, c, d, e, f] = clients;
        workspaceMock.activeWindow = d;
        const windowed = xs(clients);
        d.fullScreen = true;
        workspaceMock.removeWindow(d);
        const d2 = mapAgain(workspaceMock, d);
        d2.fullScreen = false;
        Assert.equalArrays(xs([a, b, c, d2, e, f]), windowed);
        finish();
    });

    tests.register("A window that does not come back: the focus is passed after 300 ms", 10, () => {
        const { workspaceMock, clients } = setup();
        const [a, b, c, d, e, f] = clients;
        workspaceMock.activeWindow = d;
        d.fullScreen = true;
        const before = xs(clients);
        workspaceMock.removeWindow(d);
        Assert.equalArrays(xs([a, b, c, e, f]), [before[0], before[1], before[2], before[4], before[5]], { message: "held" });
        MockQmlTimer.flush();
        Assert.assert(Workspace.activeWindow !== d && Workspace.activeWindow !== null);
        Assert.fullyVisible((Workspace.activeWindow as MockKwinClient).getActualFrameGeometry());
        Assert.equal(e.getActualFrameGeometry().x, c.getActualFrameGeometry().x + c.getActualFrameGeometry().width + gapH, { message: "the grid is closed up" });
        finish();
    });

    tests.register("A different process within 300 ms is a new window", 10, () => {
        const { workspaceMock, clients } = setup();
        const d = clients[3];
        workspaceMock.activeWindow = d;
        d.fullScreen = true;
        workspaceMock.removeWindow(d);
        const other = mapAgain(workspaceMock, d, 999);
        Assert.assert(!other.fullScreen);
        finish();
    });

    tests.register("A window that comes back too late is a new window", 10, () => {
        timeControl(addTime => {
            const { workspaceMock, clients } = setup();
            const d = clients[3];
            workspaceMock.activeWindow = d;
            d.fullScreen = true;
            workspaceMock.removeWindow(d);
            addTime(400);
            const d2 = mapAgain(workspaceMock, d);
            Assert.assert(!d2.fullScreen);
            finish();
        });
    });

    tests.register("A Wayland window is not held: the focus is passed at once", 10, () => {
        const { workspaceMock, clients } = setup();
        const g = new MockKwinClient(new MockQmlRect(10, 10, 300, 400));
        g.x11 = false;
        g.pid = 777;
        workspaceMock.createWindows(g);
        g.fullScreen = true;
        workspaceMock.removeWindow(g);
        Assert.assert(Workspace.activeWindow !== null && Workspace.activeWindow !== g);
        const h = mapAgain(workspaceMock, g);
        Assert.assert(!h.fullScreen, { message: "no state carried over for a Wayland window" });
        finish();
    });

    tests.register("Closing an old windowed window passes the focus at once", 10, () => {
        timeControl(addTime => {
            const { workspaceMock, clients } = setup();
            const [a, b, c, d, e, f] = clients;
            addTime(5000);
            workspaceMock.activeWindow = d;
            workspaceMock.removeWindow(d);
            Assert.equal(Workspace.activeWindow, e, { message: "the right neighbour is focused without waiting" });
            Assert.equal(e.getActualFrameGeometry().x, c.getActualFrameGeometry().x + c.getActualFrameGeometry().width + gapH);
            finish();
        });
    });

    tests.register("Remapped window returns to its column and its place in it", 10, () => {
        const { qtMock, workspaceMock, clients } = setup();
        const [a, b, c, d, e, f] = clients;
        workspaceMock.activeWindow = c;
        qtMock.fireShortcut("window-consume-or-expel-right"); // c is in d's column
        Assert.equal(c.getActualFrameGeometry().x, d.getActualFrameGeometry().x);
        const cAboveD = c.getActualFrameGeometry().y < d.getActualFrameGeometry().y;
        workspaceMock.activeWindow = d;
        workspaceMock.removeWindow(d);
        const d2 = mapAgain(workspaceMock, d);
        Assert.equal(d2.getActualFrameGeometry().x, c.getActualFrameGeometry().x, { message: "in the same column" });
        Assert.equal(c.getActualFrameGeometry().y < d2.getActualFrameGeometry().y, cAboveD, { message: "and at the same place in it" });
        finish();
    });
}
