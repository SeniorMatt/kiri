// Replays a recorded or generated 3-finger swipe (tools/swipe) through Kiri's script side, the way the effect
// kiri_swipe and the poll in main.qml deliver it, and returns what Kiri did: the scroll position after every
// event, the column that got the focus, and the release animation sampled every 2 ms. The result has the
// shape of the JSON that the niri reference harness (tools/swipe/ref) prints for the same trace.
namespace SwipeTrace {
    export interface Trace {
        name: string;
        width: number;
        gaps: number;
        cols: number[];
        startCol: number;
        startViewPos: number;
        natural: boolean;
        center: string;
        events: number[][]; // t_ms, dx, dy
        end: number;
    }

    export function parse(text: string): Trace {
        const t: Trace = { name: "", width: 1600, gaps: 16, cols: [800, 800, 800, 800], startCol: 0, startViewPos: -16, natural: false, center: "never", events: [], end: 0 };
        for (const line of text.split("\n")) {
            const p = line.trim().split(/\s+/);
            switch (p[0]) {
            case "name": t.name = p[1]; break;
            case "width": t.width = Number(p[1]); break;
            case "gaps": t.gaps = Number(p[1]); break;
            case "cols": t.cols = p.slice(1).map(Number); break;
            case "start_col": t.startCol = Number(p[1]); break;
            case "start_view_pos": t.startViewPos = Number(p[1]); break;
            case "natural": t.natural = p[1] === "1"; break;
            case "center": t.center = p[1]; break;
            case "e": t.events.push([Number(p[1]), Number(p[2]), Number(p[3])]); break;
            case "end": t.end = Number(p[1]); break;
            }
        }
        return t;
    }

    // what the effect does with the events: 16 units of travel pick the axis, from then on horizontal deltas are
    // handed over (the locking event too)
    function lock(t: Trace) {
        let cx = 0, cy = 0;
        for (let i = 0; i < t.events.length; i++) {
            cx += t.events[i][1];
            cy += t.events[i][2];
            if (cx * cx + cy * cy >= 256) {
                return { index: i, horizontal: Math.abs(cx) > Math.abs(cy) };
            }
        }
        return null;
    }

    export function run(t: Trace) {
        const config = getDefaultConfig();
        config.gestureScroll = true;
        config.gestureScrollInvert = t.natural;
        config.gestureSettleDuration = 400;
        config.centerGridWhenFits = false;
        config.gapsInnerHorizontal = t.gaps;
        config.gapsInnerVertical = t.gaps;
        config.gapsOuterLeft = t.gaps;
        config.gapsOuterRight = t.gaps;
        config.gapsOuterTop = t.gaps;
        config.gapsOuterBottom = t.gaps;
        config.scrollingCentered = t.center === "always";
        config.scrollingOnOverflow = t.center === "on-overflow";
        config.scrollingLazy = t.center === "never";
        const { qtMock, workspaceMock, world } = init(config, { width: t.width, height: 900 });
        const clients = workspaceMock.createClientsWithWidths(...t.cols);
        workspaceMock.activeWindow = clients[t.startCol];
        const desktop = getClientManager(world) && (world as any).desktopManager.getCurrentDesktop() as Desktop;
        const marginLeft = config.gapsOuterLeft;
        // niri's view position v: the column at screen x = p has v = gridX - p; Kiri's scroll is v + marginLeft
        desktop.setScroll(t.startViewPos + marginLeft, true);

        const out: any = { name: t.name, kind: "none", frames: [] as any[] };
        const found = lock(t);
        if (found === null || !found.horizontal) {
            out.kind = found === null ? "none" : "v";
            return out;
        }
        out.kind = "h";
        out.lock = found.index;
        const realNow = Date.now;
        setSwipeVisualForTests(false); // the script's own settle is what is sampled here
        try {
            for (let i = 0; i < t.events.length; i++) {
                const e = t.events[i];
                if (i < found.index) {
                    out.frames.push([e[0], null]);
                    continue;
                }
                Date.now = () => e[0];
                world.gestureRaw(JSON.stringify({ id: 1, phase: "h", end: false, ev: [[e[0], e[1]]] }));
                out.frames.push([e[0], -(desktop.getScrollX() - marginLeft)]);
            }
            Date.now = () => t.end;
            world.gestureRaw(JSON.stringify({ id: 1, phase: "h", end: true, ev: [[t.end, 0]] }));
            const anim = (world as any).gestureAnimation;
            const timer = (world as any).gestureAnimationTimer;
            out.anim = [[t.end, -(desktop.getScrollX() - marginLeft)]];
            let dt = 0;
            if (anim !== null && anim !== undefined) {
                out.from = -(anim.from - marginLeft);
                out.to = -(anim.to - marginLeft);
                out.duration_ms = anim.spring ? anim.spring.duration * 1000 : (config.gestureSettleDuration as number);
                // the timer the script runs every 16 ms; sampled every 2 ms here
                for (dt = 2; (world as any).gestureAnimation !== null && dt < 5000; dt += 2) {
                    Date.now = () => t.end + dt;
                    timer.triggered.fire();
                    out.anim.push([t.end + dt, -(desktop.getScrollX() - marginLeft)]);
                }
            } else {
                out.duration_ms = 0;
            }
            for (let k = 0; k < 10; k++) {
                out.anim.push([t.end + dt + 2 * (k + 1), -(desktop.getScrollX() - marginLeft)]);
            }
            out.final_col = clients.indexOf(workspaceMock.activeWindow as MockKwinClient);
            out.final_view = -(desktop.getScrollX() - marginLeft);
        } finally {
            Date.now = realNow;
            setSwipeVisualForTests(true);
        }
        return out;
    }
}
