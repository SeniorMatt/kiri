// Moving the focused column to another desktop (Meta+Shift+N): the moved column must land fully in view (centred when
// the mode centres), and the columns left behind must be laid out as niri would: no stale scroll, a lone column centred
// with always-center-single-column, everything that fits centred with "center when everything fits".
namespace ColumnMoveMatrix {
    export interface Mode {
        name: string;
        lazy: boolean;
        centered: boolean;
        onOverflow: boolean;
        centerFits: boolean;
        alwaysCenterSingle: boolean;
    }

    export const modes: Mode[] = [
        { name: "never", lazy: true, centered: false, onOverflow: false, centerFits: false, alwaysCenterSingle: false },
        { name: "never+single", lazy: true, centered: false, onOverflow: false, centerFits: false, alwaysCenterSingle: true },
        { name: "never+fits", lazy: true, centered: false, onOverflow: false, centerFits: true, alwaysCenterSingle: false },
        { name: "always", lazy: false, centered: true, onOverflow: false, centerFits: false, alwaysCenterSingle: false },
        { name: "on-overflow", lazy: false, centered: false, onOverflow: true, centerFits: false, alwaysCenterSingle: false },
    ];

    export function makeConfig(mode: Mode) {
        const config = getDefaultConfig();
        config.scrollingLazy = mode.lazy;
        config.scrollingCentered = mode.centered;
        config.scrollingOnOverflow = mode.onOverflow;
        config.centerGridWhenFits = mode.centerFits;
        config.alwaysCenterSingleColumn = mode.alwaysCenterSingle;
        return config;
    }

    // what niri guarantees whatever happened before: the focused column is in view, a lone column with
    // always-center-single-column is centred, "always" centres the focused column (if it fits)
    export function checkDesktop(mode: Mode, focused: MockKwinClient|null, columns: MockKwinClient[], what: string) {
        if (focused === null) {
            Assert.assert(columns.some(c => { const f = c.getActualFrameGeometry(); return f.width > tilingArea.width ? rectRight(f) > tilingArea.x && f.x < rectRight(tilingArea) : f.x >= tilingArea.x - 1 && rectRight(f) <= rectRight(tilingArea) + 1; }),
                { message: `${what}: some column is in view` });
            return ColumnMoveMatrix.checkGroup(mode, columns, what);
        }
        const frame = focused.getActualFrameGeometry();
        if (frame.width <= tilingArea.width) {
            Assert.assert(frame.x >= tilingArea.x - 1 && rectRight(frame) <= rectRight(tilingArea) + 1,
                { message: `${what}: the focused column is in view (${frame.x}..${rectRight(frame)} in ${tilingArea.x}..${rectRight(tilingArea)})` });
        }
        const middle = frame.x + frame.width / 2;
        const screenMiddle = tilingArea.x + tilingArea.width / 2;
        const lone = columns.length === 1;
        if (frame.width > tilingArea.width) {
            return; // a column wider than the screen is not centred
        }
        if ((mode.alwaysCenterSingle && lone) || (mode.centered && frame.width <= tilingArea.width) || (mode.centerFits && lone)) {
            Assert.assert(Math.abs(middle - screenMiddle) <= 1, { message: `${what}: the focused column is centred (${middle} vs ${screenMiddle})` });
        }
        ColumnMoveMatrix.checkGroup(mode, columns, what);
    }

    export function checkGroup(mode: Mode, columns: MockKwinClient[], what: string) {
        if (columns.some(c => c.getActualFrameGeometry().width > tilingArea.width)) {
            return;
        }
        if (columns.length > 1 && (mode.centerFits || mode.centered)) {
            const left = Math.min(...columns.map(c => c.getActualFrameGeometry().x));
            const right = Math.max(...columns.map(c => rectRight(c.getActualFrameGeometry())));
            if (right - left <= tilingArea.width && mode.centerFits) {
                Assert.assert(Math.abs((left - tilingArea.x) - (rectRight(tilingArea) - right)) <= 1, { message: `${what}: columns that fit are centred as a group (${left}..${right})` });
            }
        }
    }
}

tests.register("Column move to desktop: matrix of source and target columns, widths and centering modes", 1, () => {
    const widthsOf = (area: number) => [Math.round(area / 3), Math.round(area / 2), Math.round(area * 2 / 3)];
    let cases = 0;
    for (const mode of ColumnMoveMatrix.modes) {
        for (const sourceCount of [1, 2, 3]) {
            for (const movedIndex of [0, sourceCount - 1].filter((v, i, a) => a.indexOf(v) === i)) {
                for (const targetCount of [0, 1, 2, 3]) {
                    for (const w of [0, 1, 2]) {
                        const config = ColumnMoveMatrix.makeConfig(mode);
                        const { qtMock, workspaceMock } = init(config);
                        workspaceMock.ignoreSameActivation = true; // like KWin: the active window is not announced again
                        const [d1, d2] = workspaceMock.desktops;
                        const widths = widthsOf(tilingArea.width);
                        const width = widths[w];
                        const target = targetCount === 0 ? [] : workspaceMock.createClientsWithWidths(...Array(targetCount).fill(0).map((_, i) => widths[(w + i) % 3]));
                        // the clients above are on desktop 1: send them to desktop 2
                        for (const client of target) {
                            workspaceMock.activeWindow = client;
                            qtMock.fireShortcut("column-move-to-desktop-2");
                            workspaceMock.currentDesktop = d1;
                        }
                        const source = workspaceMock.createClientsWithWidths(...Array(sourceCount).fill(0).map((_, i) => widths[(w + i + 1) % 3]));
                        source[movedIndex].getActualFrameGeometry();
                        workspaceMock.activeWindow = source[movedIndex];
                        const moved = source[movedIndex];
                        const rest = source.filter(c => c !== moved);
                        const label = `${mode.name} source ${sourceCount} moved ${movedIndex} target ${targetCount} width ${w}`;
                        qtMock.fireShortcut("column-move-to-desktop-2");
                        cases++;
                        Assert.equal(workspaceMock.currentDesktop, d2, { message: label });
                        Assert.equal(workspaceMock.activeWindow, moved, { message: label });
                        ColumnMoveMatrix.checkDesktop(mode, moved, [...target, moved], label + " (target)");
                        // the source desktop, laid out although it is not the current one
                        if (rest.length > 0) {
                            workspaceMock.currentDesktop = d1;
                            ColumnMoveMatrix.checkDesktop(mode, rest.length === 1 ? rest[0] : null, rest, label + " (source)");
                            workspaceMock.currentDesktop = d2;
                        }
                        void width;
                    }
                }
            }
        }
    }
    Assert.assert(cases > 100);
});

// Random histories before the move: scrolling, width changes, new and closed windows, desktop switches, moves back and forth
tests.register("Column move to desktop: random histories keep the view right on both desktops", 1, () => {
    for (const mode of ColumnMoveMatrix.modes) {
        for (let seed = 1; seed <= 30; seed++) {
            const dynamic = seed % 3 === 0; // a target that does not exist yet: the empty desktop at the bottom is made
            let state = seed * 7919 + mode.name.length * 104729;
            const rnd = (n: number) => {
                state = (state * 1103515245 + 12345) & 0x7fffffff;
                return Math.floor(state / 65536) % n;
            };
            const config = ColumnMoveMatrix.makeConfig(mode);
            config.dynamicDesktops = dynamic;
            const { qtMock, workspaceMock } = init(config);
            workspaceMock.ignoreSameActivation = true; // like KWin: the active window is not announced again
            workspaceMock.createDesktop(2, "Desktop 3");
            const getDesktops = () => workspaceMock.desktops.slice();
            const trace: string[] = [];
            let describeBefore = "";
            const describe = () => getDesktops().map((d, i) => `d${i + 1}${d === workspaceMock.currentDesktop ? "*" : ""}: ` + columnsOn(d).map(w => `${w === workspaceMock.activeWindow ? "F" : ""}${Math.round(w.getActualFrameGeometry().x)}+${Math.round(w.getActualFrameGeometry().width)}`).join(" ")).join(" | ");
            const columnsOn = (desktop: KwinDesktop) => workspaceMock.windows.filter(w => w.desktops[0] === desktop);
            const widths = [Math.round(tilingArea.width / 3), Math.round(tilingArea.width / 2), Math.round(tilingArea.width * 2 / 3)];
            workspaceMock.createClientsWithWidths(widths[rnd(3)]);
            for (let step = 0; step < 40; step++) {
                const op = rnd(13);
                const k = 1 + rnd(dynamic ? 6 : 3);
                let move = false;
                switch (op) {
                case 0: case 1:
                    trace.push("new");
                    workspaceMock.createClientsWithWidths(widths[rnd(3)]);
                    break;
                case 2: trace.push("focus-left"); qtMock.fireShortcut("focus-left"); break;
                case 3: trace.push("focus-right"); qtMock.fireShortcut("focus-right"); break;
                case 4: trace.push("cycle-preset-widths"); qtMock.fireShortcut("cycle-preset-widths"); break;
                case 5: trace.push("column-width-increase"); qtMock.fireShortcut("column-width-increase"); break;
                case 6: trace.push("grid-scroll"); qtMock.fireShortcut(rnd(2) === 0 ? "grid-scroll-left" : "grid-scroll-right"); break;
                case 7: trace.push("column-move-left/right"); qtMock.fireShortcut(rnd(2) === 0 ? "column-move-left" : "column-move-right"); break;
                case 8: trace.push("desktop-" + k); qtMock.fireShortcut("desktop-" + k); break;
                case 9: {
                    const here = columnsOn(workspaceMock.currentDesktop);
                    if (here.length > 1 && workspaceMock.activeWindow !== null) {
                        trace.push("close");
                        workspaceMock.removeWindow(workspaceMock.activeWindow as MockKwinClient);
                    }
                    break;
                }
                case 10:
                    describeBefore = describe();
                    trace.push("column-move-to-desktop-nofocus-" + k);
                    qtMock.fireShortcut("column-move-to-desktop-nofocus-" + k);
                    move = true;
                    break;
                default:
                    describeBefore = describe();
                    trace.push("column-move-to-desktop-" + k);
                    qtMock.fireShortcut("column-move-to-desktop-" + k);
                    move = true;
                }
                if (move && describe() !== describeBefore) {
                    const label = `${mode.name} seed ${seed} step ${step} [${trace.join(", ")}] BEFORE ${describeBefore} AFTER ${describe()}`;
                    const active = workspaceMock.activeWindow as MockKwinClient|null;
                    if (active !== null && active.desktops[0] === workspaceMock.currentDesktop) {
                        const here = columnsOn(workspaceMock.currentDesktop);
                        ColumnMoveMatrix.checkDesktop(mode, active, here, label + " (target)");
                    }
                    for (const desktop of getDesktops()) {
                        const cols = columnsOn(desktop);
                        if (desktop !== workspaceMock.currentDesktop && cols.length > 0) {
                            ColumnMoveMatrix.checkDesktop(mode, cols.length === 1 ? cols[0] : null, cols, label + " (other desktop)");
                        }
                    }
                }
            }
        }
    }
});

// The owner's report: moving columns with Meta+Shift+N sometimes left them off-centre. A column that is alone on its
// desktop has no neighbour to take the focus, so its window stays the active one; KWin then does not announce the
// activation that follows the move, and the target desktop never scrolled to the column.
tests.register("Column move to desktop: a lone column is scrolled to on the target when KWin does not announce the focus again", 1, () => {
    for (const alwaysCenter of [false, true]) {
        const config = getDefaultConfig();
        config.alwaysCenterSingleColumn = alwaysCenter;
        const { qtMock, workspaceMock } = init(config);
        workspaceMock.ignoreSameActivation = true;
        const [d1, d2] = workspaceMock.desktops;
        // desktop 2: two columns, the view at the left end, the first one focused
        workspaceMock.currentDesktop = d2;
        const [x, y, z] = workspaceMock.createClientsWithWidths(300, 300, 300);
        workspaceMock.activeWindow = x;
        qtMock.fireShortcut("focus-start");
        // desktop 1: one column, alone
        workspaceMock.currentDesktop = d1;
        const [lone] = workspaceMock.createClientsWithWidths(300);
        workspaceMock.activeWindow = lone;
        qtMock.fireShortcut("column-move-to-desktop-2");
        Assert.equal(workspaceMock.currentDesktop, d2);
        Assert.equal(workspaceMock.activeWindow, lone);
        for (const client of [lone]) {
            Assert.fullyVisible(client.getActualFrameGeometry(), { message: "the moved column is in view" });
        }
        Assert.assert(x !== undefined && y !== undefined && z !== undefined);
        // and nothing was lost on the way back
        qtMock.fireShortcut("column-move-to-desktop-1");
        Assert.equal(workspaceMock.currentDesktop, d1);
        const frame = lone.getActualFrameGeometry();
        Assert.fullyVisible(frame);
        if (alwaysCenter) {
            Assert.assert(Math.abs(frame.x + frame.width / 2 - (tilingArea.x + tilingArea.width / 2)) <= 1, { message: "a lone column is centred" });
        }
    }
});

tests.register("Column move to desktop with focus=false into an empty desktop: the lone column is centred", 1, () => {
    const config = getDefaultConfig();
    config.alwaysCenterSingleColumn = true;
    const { qtMock, workspaceMock } = init(config);
    workspaceMock.ignoreSameActivation = true;
    const [d1, d2] = workspaceMock.desktops;
    const [a, b] = workspaceMock.createClientsWithWidths(300, 300);
    workspaceMock.activeWindow = b;
    qtMock.fireShortcut("column-move-to-next-desktop-nofocus");
    Assert.equal(workspaceMock.currentDesktop, d1);
    workspaceMock.currentDesktop = d2;
    const frame = b.getActualFrameGeometry();
    Assert.assert(Math.abs(frame.x + frame.width / 2 - (tilingArea.x + tilingArea.width / 2)) <= 1, { message: "the only column of the desktop is centred" });
    Assert.assert(a !== undefined);
});
