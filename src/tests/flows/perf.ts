// A lag benchmark on the mock (pure JS, so the bounds are generous): how long the operations a user feels take with many
// windows, and how many geometry assignments they cause. `make build` prints the numbers.
{
    function now() {
        const [s, ns] = process.hrtime();
        return s * 1000 + ns / 1e6;
    }

    function setup(total: number, desktops: number) {
        const config = getDefaultConfig();
        config.focusFollowsMouse = true;
        const { qtMock, workspaceMock, world } = init(config);
        while (workspaceMock.desktops.length < desktops) {
            workspaceMock.createDesktop(workspaceMock.desktops.length, "Desktop " + (workspaceMock.desktops.length + 1));
        }
        const clients: MockKwinClient[] = [];
        for (let d = 0; d < desktops; d++) {
            workspaceMock.currentDesktop = workspaceMock.desktops[d];
            const count = Math.floor(total / desktops) + (d < total % desktops ? 1 : 0);
            clients.push(...workspaceMock.createClientsWithWidths(...Array(count).fill(200)));
        }
        workspaceMock.stackingOrder.push(...clients);
        workspaceMock.currentDesktop = workspaceMock.desktops[0];
        workspaceMock.activeWindow = clients[0];
        return { qtMock, workspaceMock, world, clients };
    }

    // runs f, returns the milliseconds and how many geometries the script assigned to the windows meanwhile
    function measure(clients: MockKwinClient[], f: () => void) {
        const before = clients.reduce((n, client) => n + client.assignedGeometries.length, 0);
        const start = now();
        f();
        const ms = now() - start;
        const assigned = clients.reduce((n, client) => n + client.assignedGeometries.length, 0) - before;
        return { ms, assigned };
    }

    function report(name: string, result: { ms: number, assigned: number }, limitMs: number, perOpDivisor = 1) {
        const perOp = result.ms / perOpDivisor;
        console.log(`perf: ${name.padEnd(38)} ${perOp.toFixed(3).padStart(9)} ms/op  ${(result.assigned / perOpDivisor).toFixed(1).padStart(7)} geometries/op`);
        Assert.assert(perOp < limitMs, { message: `${name} took ${perOp.toFixed(1)} ms, over ${limitMs} ms` });
    }

    function scenario(total: number, check: boolean) {
        const { qtMock, workspaceMock, world, clients } = setup(total, 3);
        const ffm = new FocusFollowsMouse(() => false, 100);
        const results: Record<string, number> = {};
        try {
            const run = (name: string, limit: number, divisor: number, f: () => void) => {
                const result = measure(clients, f);
                results[name] = result.ms / divisor;
                if (check) {
                    report(name, result, limit, divisor);
                }
            };
            run("focus-left/right", 50, 20, () => {
                for (let i = 0; i < 10; i++) {
                    qtMock.fireShortcut("focus-right");
                }
                for (let i = 0; i < 10; i++) {
                    qtMock.fireShortcut("focus-left");
                }
            });
            run("desktop switch", 100, 6, () => {
                for (let i = 0; i < 3; i++) {
                    qtMock.fireShortcut("desktop-2");
                    qtMock.fireShortcut("desktop-1");
                }
            });
            run("open a window", 100, 1, () => { workspaceMock.createClientsWithWidths(200); });
            run("close the focused window", 100, 1, () => {
                const active = workspaceMock.activeWindow as MockKwinClient;
                workspaceMock.removeWindow(active);
            });
            const area = tilingArea;
            run("pointer burst (500 moves)", 2000, 500, () => {
                for (let i = 0; i < 500; i++) {
                    workspaceMock.cursorPos = new MockQmlPoint(area.x + (i * 37) % area.width, area.y + (i * 53) % area.height);
                    workspaceMock.cursorPosChanged.fire();
                }
            });
            run("arrange (screen size changed)", 200, 1, () => {
                world.do((cm, dm) => dm.getCurrentDesktop()?.forceArrange());
            });
        } finally {
            ffm.destroy();
            world.destroy();
        }
        return results;
    }

    // one operation: how many windows got a new geometry and how often the busiest one did (more than once is a layout
    // that ran twice)
    function probe(name: string, clients: MockKwinClient[], f: () => void) {
        const before = clients.map(client => client.assignedGeometries.length);
        f();
        const counts = clients.map((client, i) => client.assignedGeometries.length - before[i]);
        const moved = counts.filter(n => n > 0).length;
        const busiest = Math.max(...counts);
        console.log(`perf: one ${name.padEnd(30)} ${String(moved).padStart(3)} windows moved, busiest got ${busiest} geometries`);
        Assert.assert(busiest <= 4, { message: `${name}: a window was given ${busiest} geometries by one operation` });
    }

    tests.register("Perf: layout passes of a single operation", 1, () => {
        const { qtMock, workspaceMock, world, clients } = setup(40, 3);
        try {
            withoutKiriLog(() => {
                probe("focus-right", clients, () => qtMock.fireShortcut("focus-right"));
                probe("focus-left", clients, () => qtMock.fireShortcut("focus-left"));
                probe("window-move-right", clients, () => qtMock.fireShortcut("window-move-right"));
                probe("column-width-maximize", clients, () => qtMock.fireShortcut("column-width-maximize"));
                probe("open a window", clients, () => workspaceMock.createClientsWithWidths(200));
                probe("close the focused window", clients, () => workspaceMock.removeWindow(workspaceMock.activeWindow as MockKwinClient));
                probe("desktop-2", clients, () => qtMock.fireShortcut("desktop-2"));
            });
        } finally {
            world.destroy();
        }
    });

    tests.register("Perf: operations with 40 windows on 3 desktops", 1, () => {
        const results = withoutKiriLog(() => scenario(40, true));
        // a quadratic operation shows when the windows are four times as many: a linear one costs about 4 times as much,
        // a quadratic one 16 times
        const small = withoutKiriLog(() => scenario(20, false));
        const large = withoutKiriLog(() => scenario(80, false));
        for (const name of Object.keys(results)) {
            const ratio = small[name] > 0.01 ? large[name] / small[name] : 0;
            console.log(`perf: scaling 20 -> 80 windows, ${name.padEnd(30)} x${ratio.toFixed(1)}`);
            Assert.assert(ratio < 40, { message: `${name} gets ${ratio.toFixed(1)} times slower with 4 times the windows` });
        }
    });
}
