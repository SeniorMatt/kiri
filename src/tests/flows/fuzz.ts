// A seeded random stress test with invariants checked after every operation; `FUZZ_SEEDS=2000 make fuzz`, `FUZZ_ONLY=<seed>` replays one seed
// Kiri's journal lines ("Kiri: desktop 1 -> 2 (KWin)") are not wanted in the output of a stress run
function withoutKiriLog<T>(f: () => T): T {
    const original = console.log;
    console.log = (...args: any[]) => { if (args[0] !== "Kiri:" || process.env.FUZZ_KIRI_LOG !== undefined) { original(...args); } };
    try {
        return f();
    } finally {
        console.log = original;
    }
}

{
    function mulberry32(seed: number) {
        let a = seed >>> 0;
        return () => {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function env(name: string, fallback: number) {
        const value = Number(process.env[name]);
        return process.env[name] !== undefined && process.env[name] !== "" && isFinite(value) ? value : fallback;
    }

    const noDigitShortcuts = /^(window-close|overview)$/; // closing is done by the fuzzer (the mock's closeWindow is a no-op), the overview below

    class FuzzFailure extends Error {}

    class FuzzRun {
        public world: World;
        public readonly workspaceMock: MockWorkspace;
        public readonly qtMock: MockQt;
        public config: Config;
        private readonly closed = new Set<MockKwinClient>();
        private pendingClose: MockKwinClient[] = [];
        private ffm: FocusFollowsMouse | null = null;
        private readonly shortcuts: string[];
        public readonly log: string[] = [];
        private counter = 0;
        private viewDetached: string | null = null;
        private readonly twoOutputs: boolean; // every third seed has a second output to the right of the first one
        private secondOutput = true;

        private signature() {
            const current = this.workspaceMock.currentDesktop;
            return `${this.workspaceMock.activeWindow}/${current.id}`; // the view stays where the user scrolled it until the focus moves
        }
        private readonly fullScreenSize = { width: 800, height: 600 };

        constructor(private readonly seed: number, dynamic: boolean, ffm: boolean) {
            this.config = getDefaultConfig();
            this.config.dynamicDesktops = dynamic;
            this.config.focusFollowsMouse = ffm;
            if (this.rnd() < 0.3) {
                this.config.presetHeights = "25%, 50%, 75%";
            }
            if (seed % 4 !== 0) {
                // the other settings that change the layout; every fourth seed keeps the defaults of the other tests
                const config: any = this.config;
                const modes = ["scrollingLazy", "scrollingCentered", "scrollingGrouped", "scrollingOnOverflow"];
                const mode = this.pick(modes);
                modes.forEach(name => config[name] = name === mode);
                config.tileMaximized = this.chance(0.5);
                config.tileFullScreen = this.chance(0.5);
                config.hideTitlebars = this.chance(0.3);
                config.centerGridWhenFits = this.chance(0.5);
                config.alwaysCenterSingleColumn = this.chance(0.3);
                config.tabbedColumnsByDefault = this.chance(0.2);
                config.cursorFollowsFocus = this.chance(0.3);
                config.untileOnDrag = this.chance(0.5);
                config.dropToTile = this.chance(0.5);
                config.reMaximize = this.chance(0.5);
                config.gapsOuterLeft = this.pick([0, 8, 16]);
                config.gapsOuterRight = this.pick([0, 8, 16]);
                config.gapsInnerHorizontal = this.pick([0, 4, 8]);
                config.defaultColumnWidth = this.pick(["", "50%", "400px", "0.8"]);
            }
            if (seed % 3 === 0) {
                // rules with matchers that change all the time must not upset the layout
                this.config.windowRules = JSON.stringify([
                    { isFocused: false, opacity: 0.9 },
                    { isActiveInColumn: false, isFloating: false, opacity: 0.8, cornerRadius: 4, shadow: { enabled: true } },
                    { isUrgent: true, focusRing: { activeColor: "#ff0000" } },
                    { atStartup: true, clipToGeometry: true },
                ]);
            }
            const { qtMock, workspaceMock, world } = init(this.config);
            this.twoOutputs = seed % 3 === 1;
            if (this.twoOutputs) {
                workspaceMock.setOutputs(["DP-1", screen], ["DP-2", new MockQmlRect(screen.width, 0, screen.width, screen.height)]);
            }
            this.qtMock = qtMock;
            this.workspaceMock = workspaceMock;
            this.world = world;
            if (ffm) {
                this.ffm = new FocusFollowsMouse(() => false, 100);
            }
            this.shortcuts = [...kglobalaccel.registered.keys()].filter(name => !noDigitShortcuts.test(name));
            Assert.assert(this.shortcuts.length > 50, { message: "the shortcuts are registered" });
        }

        public destroy() {
            this.ffm?.destroy();
            this.world.destroy();
        }

        private rnd() { return Math.random(); }
        private int(n: number) { return Math.floor(this.rnd() * n); }
        private pick<T>(items: T[]): T { return items[this.int(items.length)]; }
        private chance(p: number) { return this.rnd() < p; }

        private open() {
            const n = 1 + this.int(2);
            const widths = Array.from({ length: n }, () => 80 + this.int(700));
            const second = this.twoOutputs && this.secondOutput && this.chance(0.5);
            const clients = second ?
                this.workspaceMock.createClientsWithFrames(...widths.map(width => new MockQmlRect(screen.width + this.int(100), this.int(100), width, 100 + this.int(400)))) :
                this.workspaceMock.createClientsWithWidths(...widths);
            for (const client of clients) {
                client.caption = "W" + (this.counter++);
                client.closeWindow = () => { this.pendingClose.push(client); };
                this.workspaceMock.stackingOrder.push(client);
            }
            return `open ${n} on ${this.workspaceMock.desktops.indexOf(this.workspaceMock.currentDesktop)}`;
        }

        private liveWindows() {
            return this.workspaceMock.windows.filter(w => !this.closed.has(w));
        }

        private close(client: MockKwinClient) {
            if (this.closed.has(client)) {
                return;
            }
            this.closed.add(client);
            const stacking = this.workspaceMock.stackingOrder;
            const index = stacking.indexOf(client);
            if (index >= 0) {
                stacking.splice(index, 1);
            }
            this.workspaceMock.removeWindow(client);
            if (process.env.FUZZ_TRACE2 !== undefined) { console.log(`  closed ${client}, active ${this.workspaceMock.activeWindow}\n${this.dump()}`); }
        }

        // what KWin does that the mock does not: a desktop switch moves the activation to a window of the new desktop
        private settleActivation() {
            const active = this.workspaceMock.activeWindow as MockKwinClient | null;
            const current = this.workspaceMock.currentDesktop;
            if (active !== null && (this.closed.has(active) || active.minimized || !active.desktops.includes(current))) {
                const candidates = this.liveWindows().filter(w => w.desktops.includes(current) && !w.minimized);
                this.workspaceMock.activeWindow = candidates.length > 0 ? this.pick(candidates) : null;
            }
        }

        public step(): string {
            const wm = this.workspaceMock;
            const live = this.liveWindows();
            const roll = this.int(100);
            let description: string;
            if (roll < (live.length > 24 ? 3 : 12)) {
                description = this.open();
            } else if (roll < 17) {
                const active = wm.activeWindow as MockKwinClient | null;
                if (active !== null && !this.closed.has(active)) {
                    description = "close focused";
                    this.close(active);
                } else { description = "close nothing"; }
            } else if (roll < 22) {
                if (live.length > 0) {
                    const victim = this.pick(live);
                    description = "close " + victim;
                    this.close(victim);
                } else { description = "close nothing"; }
            } else if (roll < 24) {
                const victims = live.filter(() => this.chance(0.4));
                description = `close ${victims.length} at once`;
                victims.forEach(w => this.close(w));
            } else if (roll < 32) {
                if (live.length > 0) {
                    const target = this.pick(live);
                    description = "activate " + target;
                    if (!target.desktops.includes(wm.currentDesktop) && this.chance(0.8)) {
                        wm.currentDesktop = target.desktops[0]; // KWin follows the window to its desktop
                    }
                    if (target.minimized) {
                        target.minimized = false; // KWin restores a minimized window that is activated
                    }
                    wm.activeWindow = target;
                } else { description = "activate nothing"; }
            } else if (roll < 68) {
                const name = this.pick(this.shortcuts);
                description = "shortcut " + name;
                this.qtMock.fireShortcut(name);
                if (name.startsWith("grid-scroll") || name.startsWith("columns-squeeze")) {
                    this.viewDetached = this.signature(); // niri's scroll actions move the view without the focus
                }
            } else if (roll < 70) {
                description = "shortcut overview";
                this.qtMock.fireShortcut("overview");
                if (this.chance(0.5)) {
                    description += " + close";
                    this.world.overviewPoll(JSON.stringify({ open: false, p: 0, events: [] }));
                }
            } else if (roll < 74) {
                if (live.length > 0) {
                    const target = this.pick(live);
                    const wantFull = !target.fullScreen;
                    description = `${target} full-screen ${wantFull}`;
                    target.fullScreen = wantFull;
                } else { description = "full-screen nothing"; }
            } else if (roll < 77) {
                if (live.length > 0) {
                    const target = this.pick(live);
                    const v = this.chance(0.7), h = this.chance(0.7);
                    description = `${target} maximize ${v} ${h}`;
                    target.setMaximize(v, h);
                } else { description = "maximize nothing"; }
            } else if (roll < 79) {
                if (live.length > 0) {
                    const target = this.pick(live);
                    description = `${target} minimized ${!target.minimized}`;
                    target.minimized = !target.minimized;
                } else { description = "minimize nothing"; }
            } else if (roll < 82) {
                const tiled = live.filter(w => w.desktops.includes(wm.currentDesktop) && !w.minimized && !w.fullScreen);
                if (tiled.length > 0) {
                    const target = this.pick(tiled);
                    const dx = this.int(200) - 100, dy = this.int(200) - 100;
                    if (this.chance(0.5)) {
                        description = `user resizes ${target} by ${dx},${dy}`;
                        wm.resizeWindow(target, this.chance(0.5), this.chance(0.5), this.chance(0.5), new MockQmlSize(dx, dy), new MockQmlSize(dx, 0));
                    } else {
                        description = `user drags ${target} by ${dx * 4},${dy * 4}`;
                        wm.moveWindow(target, new MockQmlPoint(dx * 4, dy * 4), new MockQmlPoint(dx, dy));
                    }
                } else { description = "user moves nothing"; }
            } else if (roll < 84) {
                const desktop = this.pick(wm.desktops);
                description = "KWin switches to " + desktop.name;
                wm.currentDesktop = desktop;
            } else if (roll < 92) {
                const size = this.chance(0.5) ? this.fullScreenSize : { width: 400 + this.int(1500), height: 300 + this.int(900) };
                description = `screen ${size.width}x${size.height}`;
                screen = new MockQmlRect(0, 0, size.width, size.height);
                if (this.twoOutputs && this.chance(0.4)) {
                    description = this.secondOutput ? "unplug the second output" : "plug in the second output";
                    this.toggleSecondOutput();
                } else if (this.twoOutputs) {
                    wm.outputRects.set("DP-1", screen);
                    if (this.secondOutput) {
                        wm.outputRects.set("DP-2", new MockQmlRect(screen.width, 0, size.width, size.height));
                    }
                }
                wm.virtualScreenSizeChanged.fire();
            } else if (roll < 94) {
                this.config = Object.assign({}, this.config);
                if (this.chance(0.3)) {
                    this.config.dynamicDesktops = !this.config.dynamicDesktops;
                }
                description = "reload, dynamic desktops " + this.config.dynamicDesktops;
                const json = JSON.stringify(this.world.captureLayout());
                this.world.destroy();
                this.world = new World(this.config, null, Kiri.parseState(json));
            } else {
                description = "pointer";
            }
            if (description === "pointer" || this.chance(0.15)) {
                const area = screen;
                const targets = this.liveWindows();
                const onWindow = targets.length > 0 && this.chance(0.7);
                const frame = onWindow ? this.pick(targets).getActualFrameGeometry() : area;
                wm.cursorPos = new MockQmlPoint(frame.x + this.int(Math.max(1, frame.width)), frame.y + this.int(Math.max(1, frame.height)));
                description += " + pointer";
                wm.cursorPosChanged.fire();
            }
            // windows that asked to be closed (the shortcut) are gone a moment later
            while (this.pendingClose.length > 0) {
                const client = this.pendingClose.shift()!;
                description += " (closed " + client + ")";
                this.close(client);
            }
            this.settleActivation();
            return description;
        }

        // KWin squeezes the windows of an unplugged output into the others
        private toggleSecondOutput() {
            const wm = this.workspaceMock;
            if (this.secondOutput) {
                const rect = wm.removeOutput("DP-2")!;
                for (const client of wm.windows) {
                    const frame = client.getFrameGeometryCopy();
                    if (frame.x >= rect.x - 1) {
                        client.frameGeometry = new MockQmlRect(Math.max(0, frame.x - rect.x), frame.y, frame.width, frame.height);
                    }
                }
            } else {
                wm.addOutput("DP-2", new MockQmlRect(screen.width, 0, screen.width, screen.height));
            }
            wm.outputRects.set("DP-1", screen);
            this.secondOutput = !this.secondOutput;
            wm.screensChanged.fire();
        }

        // for a failure: the columns of the current desktop
        public dump() {
            let text = "";
            this.world.do((cm, dm) => {
                text += `active ${this.workspaceMock.activeWindow}; current ${this.workspaceMock.desktops.indexOf(this.workspaceMock.currentDesktop) + 1}/${this.workspaceMock.desktops.length}; windows: ` + this.liveWindows().map(w =>
                    `${w.caption}@${w.desktops.map(d => this.workspaceMock.desktops.indexOf(d) + 1)}${cm.findTiledWindow(w) === null ? (cm.isFloating(w) ? " floating" : " untiled") : ""}${w.minimized ? " min" : ""}`).join(", ") + "\n";
                for (const [key, desktop] of dm.getKeyedDesktops()) {
                    if (desktop !== dm.getCurrentDesktop() && desktop.grid.getColumns().length === 0) { continue; }
                    text += `${desktop === dm.getCurrentDesktop() ? "CURRENT " : ""}${key} scroll ${desktop.getScrollX()} area ${desktop.tilingArea.x},${desktop.tilingArea.width}\n`;
                    for (const column of desktop.grid.getColumns()) {
                        text += `    [${column.getLeft()}, ${column.getRight()}] ${column.getWindows().map(w => (w.client.kwinClient as MockKwinClient).caption + `[real ${Math.round((w.client.kwinClient as MockKwinClient).getRealFrameGeometry().x)}]` + `(${Math.round((w.client.kwinClient as MockKwinClient).getActualFrameGeometry().x)},${Math.round((w.client.kwinClient as MockKwinClient).getActualFrameGeometry().width)} pref ${Math.round(w.client.preferredWidth)} y${Math.round((w.client.kwinClient as MockKwinClient).getActualFrameGeometry().y)} h${Math.round((w.client.kwinClient as MockKwinClient).getActualFrameGeometry().height)})` + (w.client.kwinClient === this.workspaceMock.activeWindow ? "*" : "") + (w.client.kwinClient.fullScreen ? "F" : "") + (w.client.getMaximizedMode() === MaximizedMode.Maximized ? "M" : "")).join(" ")}\n`;
                    }
                }
            });
            return text;
        }

        // known and left alone: a window that is as big as the screen after the screen shrank (it left full-screen mode with
        // its old windowed size) looks like full-screen geometry to Kiri, which then leaves its frame to KWin
        private coversScreen(client: MockKwinClient) {
            const frame = client.getRealFrameGeometry();
            return frame.width >= screen.width && frame.height >= screen.height;
        }

        public checkInvariants() {
            const wm = this.workspaceMock;
            const fail = (message: string): never => { throw new FuzzFailure(message); };
            const tiledIn = new Map<KwinClient, Window[]>();
            let desktopManager!: DesktopManager;
            let clientManager!: ClientManager;
            this.world.do((cm, dm) => { clientManager = cm; desktopManager = dm; });
            const currentDesktop = desktopManager.getCurrentDesktop();

            for (const [key, desktop] of desktopManager.getKeyedDesktops()) {
                for (const column of desktop.grid.getColumns()) {
                    if (column.isEmpty()) {
                        fail(`an empty column on ${key}`);
                    }
                    if (column.grid !== desktop.grid) {
                        fail("a column that belongs to another grid");
                    }
                    for (const window of column.getWindows()) {
                        const kwinClient = window.client.kwinClient;
                        if (window.column !== column) {
                            fail(`${kwinClient} is in a column that is not its own`);
                        }
                        if (this.closed.has(kwinClient as MockKwinClient)) {
                            fail(`the closed window ${kwinClient} is still in a column on ${key}`);
                        }
                        if (!kwinClient.desktops.includes(desktop.kwinDesktop)) {
                            fail(`${kwinClient} is in the grid of ${key} but lives on ${kwinClient.desktops.map(d => d.name)}`);
                        }
                        tiledIn.set(kwinClient, [...(tiledIn.get(kwinClient) ?? []), window]);
                    }
                }
            }
            for (const [key, desktop] of desktopManager.getKeyedDesktops()) {
                for (const column of desktop.grid.getColumns()) {
                    const clients = column.getWindows().map(window => window.client.kwinClient as MockKwinClient);
                    if (column.isTabbed() || clients.some(c => c.fullScreen || c.maximizedHorizontally || c.maximizedVertically || c.minimized || c.slowClient || this.coversScreen(c))) {
                        continue;
                    }
                    const frames = clients.map(c => c.getActualFrameGeometry());
                    for (let i = 1; i < frames.length; i++) {
                        if (Math.abs(frames[i].x - frames[0].x) > 2 || Math.abs(frames[i].width - frames[0].width) > 2) {
                            fail(`the windows of one column on ${key} are not aligned: ${clients.map((c, j) => `${c} x=${frames[j].x} w=${frames[j].width}`)}`);
                        }
                        if (frames[i].y < frames[i - 1].y + frames[i - 1].height - 2) {
                            fail(`windows of one column on ${key} overlap: ${clients.map((c, j) => `${c} y=${frames[j].y} h=${frames[j].height}`)}`);
                        }
                    }
                }
            }
            for (const [key, desktop] of desktopManager.getKeyedDesktops()) {
                // the columns keep their order from left to right and do not overlap
                let previous: { right: number, name: string } | null = null;
                for (const column of desktop.grid.getColumns()) {
                    const clients = column.getWindows().map(window => window.client.kwinClient as MockKwinClient);
                    if (clients.some(c => c.fullScreen || c.maximizedHorizontally || c.maximizedVertically || c.minimized || c.slowClient || this.coversScreen(c))) {
                        previous = null;
                        continue;
                    }
                    const frame = clients[0].getActualFrameGeometry();
                    if (previous !== null && frame.x < previous.right - 2) {
                        fail(`on ${key} ${clients[0]} (x=${frame.x}) overlaps the column on its left (${previous.name} ends at ${previous.right})`);
                    }
                    previous = { right: frame.x + frame.width, name: String(clients[0]) };
                }
            }
            for (const [kwinClient, windows] of tiledIn) {
                if (windows.length !== 1) {
                    fail(`${kwinClient} is in ${windows.length} columns`);
                }
                if (clientManager.findTiledWindow(kwinClient) !== windows[0]) {
                    fail(`${kwinClient} is in a column but its state is not tiled`);
                }
            }
            for (const client of wm.windows) {
                const tiled = clientManager.findTiledWindow(client);
                if (this.closed.has(client)) {
                    if (clientManager.hasClient(client)) {
                        fail(`the closed window ${client} is still known`);
                    }
                    continue;
                }
                if (tiled !== null && !tiledIn.has(tiled.client.kwinClient)) {
                    fail(`${client} is tiled but in no column`);
                }
                const frame = client.getActualFrameGeometry();
                for (const value of [frame.x, frame.y, frame.width, frame.height]) {
                    if (typeof value !== "number" || !isFinite(value)) {
                        fail(`${client} has a frame that is not finite: ${frame.x} ${frame.y} ${frame.width} ${frame.height}`);
                    }
                }
                if (tiled !== null && (frame.width < 0 || frame.height < 0)) {
                    fail(`${client} is tiled with a negative size ${frame.width}x${frame.height}`);
                }
            }

            const active = wm.activeWindow as MockKwinClient | null;
            if (active !== null) {
                if (this.closed.has(active)) {
                    fail(`the active window ${active} is closed`);
                }
                if (active.minimized) {
                    fail(`the active window ${active} is minimized`);
                }
                if (!active.desktops.includes(wm.currentDesktop)) {
                    fail(`the active window ${active} is not on the current desktop`);
                }
                const tiled = clientManager.findTiledWindow(active);
                if (tiled !== null && currentDesktop !== undefined && tiled.column.grid === currentDesktop.grid
                    && this.viewDetached !== this.signature() && !active.minimized && !active.fullScreen && !active.maximizedHorizontally && !overviewActive()) {
                    const column = tiled.column;
                    const range = currentDesktop.getCurrentVisibleRange();
                    // a column with a full-screen or maximized window reaches past its edges by the margins, which are
                    // not content
                    const slack = column.getOverflow().reduce((a, b) => a + b, 0);
                    if (column.getWidth() <= range.getWidth() && (column.getLeft() < range.getLeft() - slack || column.getRight() > range.getRight() + slack)) {
                        fail(`the focused column [${column.getLeft()}, ${column.getRight()}] is outside the view [${range.getLeft()}, ${range.getRight()}]`);
                    }
                }
            }

            if (this.config.dynamicDesktops) {
                const desktops = wm.desktops;
                const last = desktops[desktops.length - 1];
                if (clientManager.isDesktopOccupied(last)) {
                    fail("the last desktop is not empty");
                }
                for (const desktop of desktops.slice(0, -1)) {
                    if (desktop !== wm.currentDesktop && !clientManager.isDesktopOccupied(desktop)) {
                        fail(`the empty desktop ${desktop.name} is in the middle`);
                    }
                }
            }
        }
    }

    let ranOnce = false; // the test runner goes through the tests registered before main.ts twice

    function runSeed(seed: number, steps: number) {
        const original = Math.random;
        const originalScreen = screen;
        const originalNow = Date.now;
        Math.random = mulberry32(seed);
        // a clock of its own: Kiri's rate limits and "the screen is settling" windows depend on the time between events
        let clock = 1.7e12;
        Date.now = () => clock;
        let run: FuzzRun | null = null;
        let step = -1;
        let last = "setup";
        try {
            const dynamic = seed % 2 === 1;
            const ffm = seed % 3 === 0;
            run = new FuzzRun(seed, dynamic, ffm);
            for (step = 0; step < steps; step++) {
                last = "?";
                const r = Math.random();
                // a person is not quicker than the 200 ms in which Kiri treats a focus change as KWin's pick of a
                // closing window
                clock += r < 0.7 ? 300 : r < 0.95 ? 700 : 5000;
                last = run.step();
                run.log.push(last);
                if (process.env.FUZZ_TRACE !== undefined) { console.log(`${step}: ${last}\n${run.dump()}`); }
                run.checkInvariants();
            }
        } catch (error: any) {
            const recent = run === null ? [] : run.log.slice(-8);
            if (process.env.FUZZ_DUMP !== undefined && run !== null) {
                console.log(run.dump());
                run.world.do((cm, dm) => { for (const desktop of dm.getAllDesktops()) { desktop.forceArrange(); } });
                console.log("after a forced arrange:\n" + run.dump());
            }
            throw new Error(`fuzz: seed ${seed} step ${step} (${last}): ${error?.message ?? error}\n  last steps: ${recent.join(" | ")}\n${error instanceof FuzzFailure ? "" : error?.stack ?? ""}`);
        } finally {
            Math.random = original;
            Date.now = originalNow;
            screen = originalScreen;
            try { run?.destroy(); } catch (e) { /* the failure above is the one to report */ }
        }
    }

    tests.register("Fuzz: random operations keep the layout consistent", 1, () => {
        const seeds = env("FUZZ_SEEDS", 30);
        const steps = env("FUZZ_STEPS", 300);
        if (ranOnce) {
            return;
        }
        ranOnce = true;
        const only = process.env.FUZZ_ONLY;
        if (only !== undefined && only !== "") {
            withoutKiriLog(() => runSeed(Number(only), steps));
            return;
        }
        for (let seed = 1; seed <= seeds; seed++) {
            withoutKiriLog(() => runSeed(seed, steps));
        }
        console.log(`fuzz: ${seeds} seeds x ${steps} steps passed`);
    });
}
