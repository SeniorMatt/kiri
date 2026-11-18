// The touchpad swipe against niri itself. src/tests/fixtures/swipe/*.json hold a trace (events in touchpad units) and
// what niri v26.04 does with it (made by tools/swipe/ref, a harness that runs niri's own gesture code).
// With SWIPE_TRACES=<dir> SWIPE_OUT=<dir>, every .trace in the directory is run and Kiri's result is written there.

function swipeEnv(name: string): string | undefined {
    return (process as any).env[name];
}

tests.register("Gesture swipe: Kiri matches niri on recorded traces", 1, () => {
    const fs = require("fs");
    const dir = "src/tests/fixtures/swipe";
    for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith(".json")) {
            continue;
        }
        const fixture = JSON.parse(fs.readFileSync(dir + "/" + file, "utf8"));
        const result = SwipeTrace.run(SwipeTrace.parse(fixture.trace));
        const ref = fixture.niri;
        Assert.equal(result.kind, ref.kind, { message: file + ": axis" });
        if (ref.kind !== "h") {
            continue;
        }
        // the view follows the fingers exactly like niri's, frame by frame
        for (let i = 0; i < ref.frames.length; i++) {
            if (ref.frames[i][1] !== null) {
                Assert.assert(Math.abs(result.frames[i][1] - ref.frames[i][1]) < 0.01, { message: `${file}: frame ${i}: ${result.frames[i][1]} vs ${ref.frames[i][1]}` });
            }
        }
        // the column that gets the focus, where the view comes to rest, and the spring in between
        Assert.equal(result.final_col, ref.final_col, { message: file + ": column" });
        Assert.assert(Math.abs(result.final_view - ref.to) < 0.5, { message: `${file}: rest ${result.final_view} vs ${ref.to}` });
        for (const [t, x] of ref.anim) {
            const mine = result.anim.find((a: number[]) => Math.abs(a[0] - t) < 0.5);
            if (mine !== undefined) {
                Assert.assert(Math.abs(mine[1] - x) < 1.5, { message: `${file}: animation at ${t} ms: ${mine[1]} vs ${x}` });
            }
        }
    }
});

tests.register("Gesture swipe: dump Kiri's result for the traces in SWIPE_TRACES", 1, () => {
    const inDir = swipeEnv("SWIPE_TRACES");
    const outDir = swipeEnv("SWIPE_OUT");
    if (inDir === undefined || outDir === undefined) {
        return;
    }
    const fs = require("fs");
    for (const file of fs.readdirSync(inDir)) {
        if (file.endsWith(".trace")) {
            const result = SwipeTrace.run(SwipeTrace.parse(fs.readFileSync(inDir + "/" + file, "utf8")));
            fs.writeFileSync(outDir + "/" + file.replace(/\.trace$/, ".json"), JSON.stringify(result));
        }
    }
});

// the desktop changes while the fingers are down (keyboard, another swipe): the swipe ends on the desktop it started on
tests.register("Gesture swipe: the current desktop changes mid-swipe", 1, () => {
    const config = getDefaultConfig();
    config.gestureScroll = true;
    config.gestureSettleDuration = 0;
    const { qtMock, workspaceMock, world } = init(config, { width: 1600, height: 900 });
    const [client0, client1, client2] = workspaceMock.createClientsWithWidths(800, 800, 800);
    workspaceMock.activeWindow = client0;
    const desktops = (world as any).desktopManager;
    const first = desktops.getCurrentDesktop() as Desktop;

    const swipe = (events: number[][], end: boolean) => world.gestureRaw(JSON.stringify({ id: 1, phase: "h", end: end, ev: events }));
    swipe([[0, 20], [10, 40], [20, 60]], false);
    Assert.assert(first.isGestureScrolling(), { message: "swipe on the first desktop" });

    workspaceMock.currentDesktop = workspaceMock.desktops[1];
    swipe([[30, 40]], false);
    swipe([[40, 0]], true);

    Assert.assert(!first.isGestureScrolling(), { message: "the swipe has to end on the desktop it started on" });
    Assert.assert(!world.isScrollBusy(), { message: "nothing is left scrolling" });
    Assert.equal(workspaceMock.currentDesktop, workspaceMock.desktops[1]);
    Assert.equal(workspaceMock.activeWindow, client0, { message: "the focus must not follow a swipe of another desktop" });
});

// fingers coming down while the view still settles from the swipe before: the new swipe starts where the view is
// (niri), it does not jump back to the old swipe's release position or inherit its position and velocity.
// With the compiled effect painting the swipe (visual) the layout is already at the end of the settle; the effect
// says where it paints the view (d0), the swipe starts there.
for (const visual of [false, true]) {
    tests.register(`Gesture swipe: a swipe that lands while the last one settles starts where the view is (${visual ? "effect paints" : "script settles"})`, 1, () => {
        const config = getDefaultConfig();
        config.gestureScroll = true;
        const { qtMock, workspaceMock, world } = init(config, { width: 1600, height: 900 });
        const clients = workspaceMock.createClientsWithWidths(800, 800, 800, 800, 800, 800);
        workspaceMock.activeWindow = clients[0];
        const desktop = (world as any).desktopManager.getCurrentDesktop() as Desktop;
        const timer = (world as any).gestureAnimationTimer;
        const realNow = Date.now;
        setSwipeVisualForTests(visual);
        try {
            const swipe = (id: number, events: number[][], end: boolean, d0 = 0) => world.gestureRaw(JSON.stringify({ id: id, phase: "h", end: end, ev: events, d0: d0 }));
            let t = 1000;
            for (let i = 0; i < 12; i++) {
                Date.now = () => t;
                swipe(1, [[t, -60]], false);
                t += 8;
            }
            Date.now = () => t;
            swipe(1, [[t, 0]], true);
            Assert.assert((world as any).gestureAnimation !== null, { message: "the view settles" });
            const releaseScroll = desktop.getScrollX();
            for (let i = 0; i < 4; i++) {
                t += 16;
                Date.now = () => t;
                timer.triggered.fire();
            }
            const mid = desktop.getScrollX();
            if (visual) {
                Assert.equal(mid, (world as any).gestureAnimation.to, { message: "the layout is at the end of the settle" });
            } else {
                Assert.assert(Math.abs(mid - releaseScroll) > 20, { message: "the view moves while settling" });
            }

            // slow tiny swipe 2: the view starts where the effect paints it (the layout's position, 130 px behind),
            // and its own history is empty
            const painted = visual ? mid - 130 : mid;
            t += 10;
            Date.now = () => t;
            swipe(2, [[t, 3]], false, visual ? -130 : 0);
            Assert.assert((world as any).gestureAnimation === null, { message: "the settle is cut" });
            Assert.assert(Math.abs(desktop.getScrollX() - painted) < 10, { message: `the new swipe starts at ${painted}, is at ${desktop.getScrollX()}` });
            t += 8;
            Date.now = () => t;
            swipe(2, [[t, 3]], false);
            t += 8;
            Date.now = () => t;
            swipe(2, [[t, 0]], true);
            const release = desktop.getRawRelease();
            Assert.assert(Math.abs(release.velocity) < 1500, { message: `no velocity from the swipe before: ${release.velocity}` });
            const anim = (world as any).gestureAnimation;
            Assert.assert(anim !== null && Math.abs(anim.from - painted) < 20, { message: `the release starts at the view position ${anim === null ? null : anim.from} vs ${painted}` });
        } finally {
            Date.now = realNow;
            setSwipeVisualForTests(true);
        }
    });
}

tests.register("Gesture swipe: the effect is told how the swipe scrolls and settles", 1, () => {
    const config = getDefaultConfig();
    config.gestureScroll = true;
    const { qtMock, workspaceMock, world } = init(config, { width: 1600, height: 900 });
    const clients = workspaceMock.createClientsWithWidths(800, 800, 800, 800);
    workspaceMock.activeWindow = clients[0];
    const realNow = Date.now;
    swipeCalls.length = 0;
    try {
        const swipe = (events: number[][], end: boolean) => world.gestureRaw(JSON.stringify({ id: 7, phase: "h", end: end, ev: events }));
        let t = 500;
        for (let i = 0; i < 8; i++) {
            Date.now = () => t;
            swipe([[t, -40]], false);
            t += 8;
        }
        Date.now = () => t;
        swipe([[t, 0]], true);
        const begins = swipeCalls.filter(c => c.member === "begin");
        Assert.equal(begins.length, 1, { message: "begin once per swipe" });
        const begin = JSON.parse(begins[0].arg);
        Assert.equal(begin.ids.length, 4);
        Assert.assert(Math.abs(begin.scale) > 0.5, { message: "scroll per unit of travel" });
        const release = swipeCalls.filter(c => c.member === "release");
        Assert.equal(release.length, 1);
        Assert.assert(JSON.parse(release[0].arg).to !== undefined);
    } finally {
        Date.now = realNow;
    }
});

// niri moves the focus to the column the swipe lands on when the fingers are lifted, not when the settle ends
tests.register("Gesture swipe: the focus moves when the fingers are lifted", 1, () => {
    const config = getDefaultConfig();
    config.gestureScroll = true;
    const { workspaceMock, world } = init(config, { width: 1600, height: 900 });
    const clients = workspaceMock.createClientsWithWidths(800, 800, 800, 800, 800, 800);
    workspaceMock.activeWindow = clients[0];
    const realNow = Date.now;
    setSwipeVisualForTests(true);
    try {
        const swipe = (events: number[][], end: boolean) => world.gestureRaw(JSON.stringify({ id: 9, phase: "h", end: end, ev: events }));
        let t = 2000;
        for (let i = 0; i < 12; i++) {
            Date.now = () => t;
            swipe([[t, 60]], false);
            t += 8;
        }
        Date.now = () => t;
        swipe([[t, 0]], true);
        Assert.assert((world as any).gestureAnimation !== null, { message: "the view still settles" });
        Assert.assert(Workspace.activeWindow !== clients[0], { message: "but the focus has moved already" });
    } finally {
        Date.now = realNow;
    }
});

// niri: a lone column with always-center-single-column swipes like any other, and the view comes back to the center
for (const visual of [false, true]) {
    for (const sign of [1, -1]) {
        for (const how of ["always-center-single-column", "center-grid-when-fits"]) {
            tests.register(`Gesture swipe: a lone centered column springs back to the center (${how}, ${visual ? "effect paints" : "script settles"}, ${sign > 0 ? "right" : "left"})`, 1, () => {
                const config = getDefaultConfig();
                config.gestureScroll = true;
                config.alwaysCenterSingleColumn = how === "always-center-single-column";
                config.centerGridWhenFits = how === "center-grid-when-fits";
                const { workspaceMock, world } = init(config, { width: 1600, height: 900 });
                const clients = workspaceMock.createClientsWithWidths(800);
                workspaceMock.activeWindow = clients[0];
                const desktop = (world as any).desktopManager.getCurrentDesktop() as Desktop;
                const timer = (world as any).gestureAnimationTimer;
                const centered = desktop.getScrollX(); 
                const realNow = Date.now;
                setSwipeVisualForTests(visual);
                try {
                    let t = 3000;
                    for (let i = 0; i < 12; i++) {
                        Date.now = () => t;
                        world.gestureRaw(JSON.stringify({ id: 1, phase: "h", end: false, ev: [[t, sign * 40]] }));
                        t += 8;
                    }
                    Assert.assert(Math.abs(desktop.getScrollX() - centered) > 100, { message: "the view follows the fingers" });
                    Date.now = () => t;
                    world.gestureRaw(JSON.stringify({ id: 1, phase: "h", end: true, ev: [[t, 0]] }));
                    for (let i = 0; i < 100 && (world as any).gestureAnimation !== null; i++) {
                        t += 16;
                        Date.now = () => t;
                        timer.triggered.fire();
                    }
                    Assert.equal(desktop.getScrollX(), centered, { message: "back at the center" });
                } finally {
                    Date.now = realNow;
                    setSwipeVisualForTests(true);
                }
            });
        }
    }
}

// niri: after the fingers lift the view settles once, and nothing moves afterwards, whatever the focus does. The focus
// passing to the column the swipe landed on must not scroll the view again (no scrollToColumn, no re-centering).
for (const visual of [false, true]) {
    for (const scroller of ["lazy", "overflow", "centered"]) {
        for (const start of [0, 2]) {
            tests.register(`Gesture swipe: nothing moves after the release (${scroller}, ${visual ? "effect paints" : "script settles"}, from column ${start})`, 1, () => {
                const config = getDefaultConfig();
                config.gestureScroll = true;
                config.scrollingLazy = scroller === "lazy";
                config.scrollingOnOverflow = scroller === "overflow";
                config.scrollingCentered = scroller === "centered";
                const { workspaceMock, world } = init(config, { width: 1600, height: 900 });
                const clients = workspaceMock.createClientsWithWidths(700, 900, 780, 650, 800);
                workspaceMock.activeWindow = clients[start];
                const desktop = (world as any).desktopManager.getCurrentDesktop() as Desktop;
                const timer = (world as any).gestureAnimationTimer;
                const realNow = Date.now;
                setSwipeVisualForTests(visual);
                try {
                    let t = 5000;
                    for (let i = 0; i < 10; i++) {
                        Date.now = () => t;
                        world.gestureRaw(JSON.stringify({ id: 1, phase: "h", end: false, ev: [[t, start === 0 ? -35 : 35]] }));
                        t += 8;
                    }
                    Date.now = () => t;
                    world.gestureRaw(JSON.stringify({ id: 1, phase: "h", end: true, ev: [[t, 0]] }));
                    const anim = (world as any).gestureAnimation;
                    Assert.assert(anim !== null, { message: "the view settles" });
                    const to = anim.to;
                    const seen: number[] = [desktop.getScrollX()];
                    for (let i = 0; i < 100 && (world as any).gestureAnimation !== null; i++) {
                        t += 16;
                        Date.now = () => t;
                        timer.triggered.fire();
                        seen.push(desktop.getScrollX());
                    }
                    if (visual) {
                        // the layout is at the end of the settle from the release on and never moves again
                        for (const x of seen) {
                            Assert.equal(x, to, { message: "the layout moved after the release: " + seen.join(",") });
                        }
                    } else {
                        // the script paints the settle: one spring towards `to` (it may first carry on with the fingers' velocity and
                        // turn once, never wobble), and it ends there
                        let turns = 0;
                        for (let i = 2; i < seen.length; i++) {
                            if ((seen[i] - seen[i - 1]) * (seen[i - 1] - seen[i - 2]) < 0 && Math.abs(seen[i - 1] - to) > 1) {
                                turns++;
                            }
                        }
                        Assert.assert(turns <= 1, { message: "the view wobbled: " + seen.join(",") });
                        Assert.equal(seen[seen.length - 1], to, { message: "the view ends at the snap point: " + seen.join(",") });
                    }
                    Assert.equal(desktop.getScrollX(), to, { message: "the view stays at the snap point after the settle" });
                } finally {
                    Date.now = realNow;
                    setSwipeVisualForTests(true);
                }
            });
        }
    }
}

// niri: an empty workspace is a normal place to be. Reaching one by a swipe (the focus goes to nobody) must not make any
// focus logic activate a window of the desktop that was left: KWin would switch straight back to it.
tests.register("Gesture swipe: nothing pulls the user back from an empty desktop", 1, () => {
    const config = getDefaultConfig();
    config.gestureScroll = true;
    const { qtMock, workspaceMock, world } = init(config, { width: 1600, height: 900 });
    const clients = workspaceMock.createClientsWithWidths(800, 800, 800, 800);
    workspaceMock.activeWindow = clients[3];
    const realNow = Date.now;
    try {
        // a horizontal swipe settles, and its focus change is done
        let t = 8000;
        for (let i = 0; i < 8; i++) {
            Date.now = () => t;
            world.gestureRaw(JSON.stringify({ id: 1, phase: "h", end: false, ev: [[t, 40]] }));
            t += 8;
        }
        Date.now = () => t;
        world.gestureRaw(JSON.stringify({ id: 1, phase: "h", end: true, ev: [[t, 0]] }));
        const first = workspaceMock.currentDesktop;
        // the effect (or a key) switches to the empty desktop; KWin leaves nobody focused
        workspaceMock.currentDesktop = workspaceMock.desktops[1];
        workspaceMock.activeWindow = null;
        // everything that may be pending runs: the settle timer, the focus passing retries
        for (let i = 0; i < 40; i++) {
            t += 16;
            Date.now = () => t;
            (world as any).gestureAnimationTimer.triggered.fire();
        }
        Assert.equal(workspaceMock.currentDesktop, workspaceMock.desktops[1], { message: "still on the empty desktop" });
        Assert.equal(workspaceMock.activeWindow, null, { message: "nothing was activated" });
        Assert.assert(first !== workspaceMock.currentDesktop);
    } finally {
        Date.now = realNow;
    }
});

// niri never wraps around: the last workspace is the last one, however KWin's "navigation wraps around" is set
tests.register("Gesture: switching desktops never wraps around", 1, () => {
    const config = getDefaultConfig();
    config.gestureScroll = true;
    config.gestureDesktopSwitch = true;
    const { workspaceMock, world } = init(config, { width: 1600, height: 900 });
    workspaceMock.createClientsWithWidths(800);
    const last = workspaceMock.desktops[workspaceMock.desktops.length - 1];
    workspaceMock.currentDesktop = last;
    world.gestureSwitchDesktop(1);
    Assert.equal(workspaceMock.currentDesktop, last, { message: "next at the last desktop stays" });
    workspaceMock.currentDesktop = workspaceMock.desktops[0];
    world.gestureSwitchDesktop(-1);
    Assert.equal(workspaceMock.currentDesktop, workspaceMock.desktops[0], { message: "previous at the first desktop stays" });
});

// niri's Mod+middle drag (spatial_movement_grab.rs): the view follows the pointer 1:1 in pixels (is_touchpad false, no
// norm factor), unlike a touchpad swipe that moves working_width / 1200 per unit
tests.register("Gesture pointer drag: the view moves 1:1 with the pointer (niri)", 1, () => {
    const config = getDefaultConfig();
    config.gestureScroll = true;
    config.gestureSettleDuration = 0;
    config.gestureScrollInvert = true; // a touchpad setting: the pointer ignores it
    const { qtMock, workspaceMock, world } = init(config, { width: 1600, height: 900 });
    const [client0, client1, client2] = workspaceMock.createClientsWithWidths(800, 800, 800);
    workspaceMock.activeWindow = client0;
    const desktop = (world as any).desktopManager.getCurrentDesktop() as Desktop;
    const x0 = desktop.getScrollX();

    // the effect queues -dx of the pointer: dragging 120 px to the left is +120
    world.gestureRaw(JSON.stringify({ id: 1, f: 3, phase: "h", end: false, ptr: true, ev: [[0, 100], [16, 20]] }));
    Assert.equal(desktop.getScrollX() - x0, 120, { message: "120 px of pointer travel are 120 px of view" });
    Assert.equal(desktop.getRawVisual().scale, 1, { message: "the effect paints it with scale 1" });

    world.gestureRaw(JSON.stringify({ id: 1, f: 3, phase: "h", end: true, ptr: true, ev: [[32, 0]] }));
    world.gestureRaw(JSON.stringify({ id: 2, f: 3, phase: "h", end: false, ev: [[0, 100]] })); // a touchpad swipe after it
    Assert.assert(desktop.getRawVisual().scale !== 1, { message: "a touchpad swipe scales by the working width again" });
});
