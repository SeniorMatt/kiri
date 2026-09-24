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
