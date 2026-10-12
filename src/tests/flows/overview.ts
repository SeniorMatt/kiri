function overviewLastLayout(): any {
    const call = overviewCalls.filter(c => c.member === "toggle" || c.member === "setLayout").pop();
    Assert.assert(call !== undefined, { message: "the layout was sent" });
    return JSON.parse(call!.arg);
}

function overviewPoll(world: World, events: object[], open = true) {
    world.overviewPoll(JSON.stringify({ open: open, p: open ? 1 : 0, events: events }));
}

tests.register("Overview: the layout is where the windows are", 1, () => {
    const config = getDefaultConfig();
    const { qtMock, workspaceMock, world } = init(config);
    overviewCalls.length = 0;

    const [a, b, c] = workspaceMock.createClientsWithWidths(200, 300, 250);
    workspaceMock.activeWindow = b;
    qtMock.fireShortcut("overview");
    Assert.equal(overviewCalls[overviewCalls.length - 1].member, "toggle");
    const layout = overviewLastLayout();
    Assert.equal(layout.desktops.length, workspaceMock.desktops.length);
    Assert.equal(layout.current, 0);
    Assert.equal(layout.active, String(b.internalId));
    Assert.equal(layout.screen.w, screen.width);
    const d0 = layout.desktops[0];
    Assert.equal(d0.id, workspaceMock.desktops[0].id);
    Assert.equal(d0.cols.length, 3);
    for (const [i, client] of [a, b, c].entries()) {
        const win = d0.cols[i].wins[0];
        const frame = client.getActualFrameGeometry();
        Assert.equal(win.id, String(client.internalId));
        Assert.equal(win.x, Math.round(frame.x));
        Assert.equal(win.y, Math.round(frame.y));
        Assert.equal(win.w, Math.round(frame.width));
        Assert.equal(win.h, Math.round(frame.height));
        Assert.equal(d0.cols[i].w, Math.round(frame.width));
    }
    Assert.equal(d0.gapH, gapH);
    Assert.equal(d0.gapV, gapV);

    // toggling again closes it
    qtMock.fireShortcut("overview");
    Assert.equal(overviewCalls[overviewCalls.length - 1].member, "toggle");
});

tests.register("Overview: stacked windows and the other desktop", 1, () => {
    const config = getDefaultConfig();
    const { qtMock, workspaceMock, world } = init(config);
    overviewCalls.length = 0;

    const [a, b, c] = workspaceMock.createClientsWithWidths(200, 200, 200);
    workspaceMock.activeWindow = b;
    qtMock.fireShortcut("window-move-left"); // b joins a's column? (it moves b left of a)
    qtMock.fireShortcut("overview");
    const layout = overviewLastLayout();
    const total = layout.desktops[0].cols.reduce((n: number, col: any) => n + col.wins.length, 0);
    Assert.equal(total, 3);
    for (const client of [a, b, c]) {
        const frame = client.getActualFrameGeometry();
        const found = layout.desktops[0].cols.flatMap((col: any) => col.wins).find((w: any) => w.id === String(client.internalId));
        Assert.assert(found !== undefined, { message: "window in the layout" });
        Assert.equal(found.x, Math.round(frame.x));
        Assert.equal(found.y, Math.round(frame.y));
    }
    Assert.equal(layout.desktops[1].cols.length, 0);
});

tests.register("Overview: drop a window onto another desktop", 1, () => {
    const config = getDefaultConfig();
    const { qtMock, workspaceMock, world } = init(config);
    overviewCalls.length = 0;

    const [a, b, c] = workspaceMock.createClientsWithWidths(200, 200, 200);
    const desktop1 = workspaceMock.desktops[1];
    workspaceMock.activeWindow = a;
    qtMock.fireShortcut("overview");

    // dropped into an empty desktop: a new column
    overviewPoll(world, [{ t: "drop", w: String(b.internalId), d: desktop1.id, c: 0, i: -1 }]);
    Assert.equalArrays(b.desktops, [desktop1]);
    Assert.equalArrays(a.desktops, [workspaceMock.desktops[0]]);
    Assert.equal(workspaceMock.activeWindow, b);

    // and another one next to it, on its left
    overviewPoll(world, [{ t: "drop", w: String(c.internalId), d: desktop1.id, c: 0, i: -1 }]);
    Assert.equalArrays(c.desktops, [desktop1]);
    const layout = overviewLastLayout();
    Assert.equal(layout.desktops[1].cols[0].wins[0].id, String(c.internalId));
    Assert.equal(layout.desktops[1].cols[1].wins[0].id, String(b.internalId));
    Assert.equal(layout.desktops[1].cols.length, 2);
    Assert.equal(layout.desktops[0].cols.length, 1);
});

tests.register("Overview: drop into a column, out of a column, and reorder", 1, () => {
    const config = getDefaultConfig();
    config.centerGridWhenFits = false;
    const { qtMock, workspaceMock, world } = init(config);
    overviewCalls.length = 0;

    const [a, b, c] = workspaceMock.createClientsWithWidths(200, 200, 200);
    const desktop0 = workspaceMock.desktops[0];
    qtMock.fireShortcut("overview");

    // c goes into the column of a (columns without c: [a], [b]), at the top
    overviewPoll(world, [{ t: "drop", w: String(c.internalId), d: desktop0.id, c: 0, i: 0 }]);
    Assert.assert(Math.abs(c.getActualFrameGeometry().x - a.getActualFrameGeometry().x) < 1, { message: "c is in a's column" });
    Assert.assert(c.getActualFrameGeometry().y < a.getActualFrameGeometry().y, { message: "c is above a" });

    // c goes to the bottom of the same column (index 1 of the windows without c: [a])
    overviewPoll(world, [{ t: "drop", w: String(c.internalId), d: desktop0.id, c: 0, i: 1 }]);
    Assert.assert(Math.abs(c.getActualFrameGeometry().x - a.getActualFrameGeometry().x) < 1, { message: "c is still in a's column" });
    Assert.assert(c.getActualFrameGeometry().y > a.getActualFrameGeometry().y, { message: "c is below a" });

    // c leaves the column: a new column after b (columns without c: [a], [b], so index 2 is the end)
    overviewPoll(world, [{ t: "drop", w: String(c.internalId), d: desktop0.id, c: 2, i: -1 }]);
    Assert.assert(c.getActualFrameGeometry().x > b.getActualFrameGeometry().x, { message: "c is the last column" });
    Assert.assert(a.getActualFrameGeometry().x < b.getActualFrameGeometry().x, { message: "a is first" });

    // b to the very front
    overviewPoll(world, [{ t: "drop", w: String(b.internalId), d: desktop0.id, c: 0, i: -1 }]);
    Assert.assert(b.getActualFrameGeometry().x < a.getActualFrameGeometry().x, { message: "b is first" });
});

tests.register("Overview: click activates, goto and scroll", 1, () => {
    const config = getDefaultConfig();
    const { qtMock, workspaceMock, world } = init(config);
    overviewCalls.length = 0;

    const [a, b, c] = workspaceMock.createClientsWithWidths(300, 300, 300);
    const desktop1 = workspaceMock.desktops[1];
    workspaceMock.activeWindow = a;
    qtMock.fireShortcut("overview");

    overviewPoll(world, [{ t: "activate", w: String(c.internalId), d: workspaceMock.desktops[0].id }]);
    Assert.equal(workspaceMock.activeWindow, c);

    overviewPoll(world, [{ t: "goto", i: 1 }]);
    Assert.equal(workspaceMock.currentDesktop, desktop1);
    overviewPoll(world, [{ t: "goto", i: 0 }]);
    Assert.equal(workspaceMock.currentDesktop, workspaceMock.desktops[0]);

    const x0 = a.getActualFrameGeometry().x;
    overviewPoll(world, [{ t: "scroll", d: workspaceMock.desktops[0].id, x: 100 }]);
    Assert.assert(a.getActualFrameGeometry().x !== x0, { message: "the view scrolled" });
    // the answer to a poll carries the new layout while it is open
    Assert.equal(overviewCalls[overviewCalls.length - 1].member, "setLayout");
});

tests.register("Overview: 4-finger swipe follows the fingers and settles", 1, () => {
    const config = getDefaultConfig();
    const { qtMock, workspaceMock, world } = init(config);
    overviewCalls.length = 0;
    workspaceMock.createClients(2);

    function progressOf(call: { member: string, arg: string }) {
        return JSON.parse(call.arg).p;
    }

    // 3 fingers are not the overview
    world.gestureRaw(JSON.stringify({ id: 1, f: 3, phase: "v", end: false, ev: [[0, -30]] }));
    Assert.equal(overviewCalls.length, 0);

    // up: dy is negative; 120 units is 0.4 of the 300
    world.gestureRaw(JSON.stringify({ id: 2, f: 4, phase: "v", end: false, ev: [[0, -40], [20, -40], [40, -40]] }));
    const calls = overviewCalls.filter(c => c.member === "gesture");
    Assert.assert(JSON.parse(calls[0].arg).layout !== undefined, { message: "the first call carries the layout" });
    Assert.assert(Math.abs(progressOf(calls[calls.length - 1]) - 0.4) < 1e-9, { message: "120 of 300 units is 0.4" });

    // let go slowly at that point: rounds to the nearest end, here the closed one
    world.gestureRaw(JSON.stringify({ id: 2, f: 4, phase: "v", end: true, ev: [[400, 0]] }));
    const settle = JSON.parse(overviewCalls[overviewCalls.length - 1].arg);
    Assert.equal(settle.settle, false);

    // a fast swipe up is thrown open
    overviewCalls.length = 0;
    world.gestureRaw(JSON.stringify({ id: 3, f: 4, phase: "v", end: false, ev: [[0, -20], [10, -30], [20, -40], [30, -40]] }));
    world.gestureRaw(JSON.stringify({ id: 3, f: 4, phase: "v", end: true, ev: [[31, 0]] }));
    const open = JSON.parse(overviewCalls[overviewCalls.length - 1].arg);
    Assert.equal(open.settle, true);
    Assert.assert(open.v > 0, { message: "with the velocity of the swipe" });
});
tests.run();

tests.register("Overview: Meta+O keeps working after cancelled swipes and early polls", 1, () => {
    const config = getDefaultConfig();
    const { qtMock, workspaceMock, world } = init(config);
    workspaceMock.createClientsWithWidths(300, 300);
    overviewCalls.length = 0;
    const swipe = (end: boolean) => world.gestureRaw(JSON.stringify({ phase: "v", f: 4, end: end, ev: end ? [] : [[0, -40]] }));
    for (let i = 0; i < 50; i++) {
        if (i % 3 === 0) {
            swipe(false); // started, never ended
            Assert.assert(overviewCalls[overviewCalls.length - 1].member === "gesture", { message: "the swipe reached the effect" });
        }
        const before = overviewCalls.filter(c => c.member === "toggle").length;
        qtMock.fireShortcut("overview");
        Assert.equal(overviewCalls.filter(c => c.member === "toggle").length, before + 1);
        if (i % 2 === 0) {
            overviewPoll(world, [], i % 4 === 0); // polls that arrive at any state
        }
        if (i % 5 === 0) {
            overviewPoll(world, [{ t: "activate", w: "nope", d: workspaceMock.desktops[0].id }]);
        }
    }
    swipe(true);
    qtMock.fireShortcut("overview");
    Assert.equal(overviewCalls[overviewCalls.length - 1].member, "toggle");
});

tests.register("Overview: no cursor warps and no focus follows mouse while it is up", 1, () => {
    const config = getDefaultConfig();
    config.cursorFollowsFocus = true;
    const { qtMock, workspaceMock, world } = init(config);
    const [a, b, c] = workspaceMock.createClientsWithWidths(300, 300, 300);
    workspaceMock.stackingOrder.push(a, b, c);
    const ffm = new FocusFollowsMouse(() => false, 100);
    const originalQmlBase = qmlBase;
    const base: any = { overviewEffect: true, overviewPolling: false, overviewCall: "", queryPointerButtons: (callback: (buttons: number) => void) => callback(0) };
    qmlBase = base;
    try {
        const hover = (client: MockKwinClient) => {
            const frame = client.getActualFrameGeometry();
            workspaceMock.cursorPos = new MockQmlPoint(Math.floor(frame.x + frame.width / 2), Math.floor(frame.y + frame.height / 2));
            workspaceMock.cursorPosChanged.fire();
        };
        workspaceMock.activeWindow = a;
        hover(a);
        qtMock.fireShortcut("overview");
        Assert.assert(base.overviewPolling, { message: "the overview is up" });

        // a drop makes Kiri focus the window: the pointer stays where it is
        const before = new MockQmlPoint(workspaceMock.cursorPos.x, workspaceMock.cursorPos.y);
        qtMock.fireShortcut("focus-right");
        Assert.equal(workspaceMock.activeWindow, b);
        Assert.equal(workspaceMock.cursorPos.x, before.x);
        Assert.equal(workspaceMock.cursorPos.y, before.y);
        // and hovering a window below the overview does not give it the focus
        hover(c);
        Assert.assert(workspaceMock.activeWindow === b, { message: "no focus follows mouse in the overview" });

        // the overview is closed: both work again
        base.overviewPolling = false;
        hover(a);
        Assert.assert(workspaceMock.activeWindow === a, { message: "focus follows the mouse again" });
        qtMock.fireShortcut("focus-right");
        Assert.assert(rectContainsPoint(b.getActualFrameGeometry(), workspaceMock.cursorPos), { message: "the cursor follows the focus again" });
    } finally {
        qmlBase = originalQmlBase;
        ffm.destroy();
    }
});
