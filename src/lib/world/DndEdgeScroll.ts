// niri's dnd-edge-view-scroll: while a window is dragged, the pointer within `trigger-width` of the left or right edge
// scrolls the columns, faster towards the screen edge, after it has stayed in the zone for `delay-ms`
class DndEdgeScroll {
    private static readonly INTERVAL_MS = 16;

    private readonly timer: Delayer;
    private running = false;
    private last = 0;
    private nonzeroSince: number | null = null;
    private ticking = false;

    constructor(
        private readonly config: DndEdgeScroll.Config,
        private readonly cursor: () => { x: number, y: number },
        private readonly desktop: () => Desktop | undefined,
        private readonly scrolled: () => void,
    ) {
        this.timer = new Delayer(DndEdgeScroll.INTERVAL_MS, () => this.tick(Date.now()));
    }

    public start() {
        this.running = true;
        this.last = Date.now();
        this.nonzeroSince = null;
        this.timer.run();
    }

    public stop() {
        this.running = false;
        this.timer.stop();
        this.timer.destroy();
    }

    // -1..1 times the trigger-zone depth: negative at the left edge, positive at the right, 0 in the middle
    public static normalizedDelta(x: number, workingX: number, workingWidth: number, triggerWidth: number) {
        x = Math.max(0, Math.min(workingWidth, x - workingX));
        triggerWidth = Math.max(0, Math.min(workingWidth / 2, triggerWidth));
        if (triggerWidth < 0.01) {
            return 0;
        }
        let delta = 0;
        if (x < triggerWidth) {
            delta = -(triggerWidth - x);
        } else if (workingWidth - x < triggerWidth) {
            delta = triggerWidth - (workingWidth - x);
        }
        return delta / triggerWidth;
    }

    // one step; returns the scroll (grid px) it applied
    public tick(now: number) {
        if (!this.running || this.ticking) {
            return 0;
        }
        this.ticking = true; // the test mock fires a timer at once when it is restarted
        try {
            this.timer.run();
            return this.step(now);
        } finally {
            this.ticking = false;
        }
    }

    private step(now: number) {
        const timeDelta = Math.max(0, (now - this.last) / 1000);
        this.last = now;
        const desktop = this.desktop();
        if (desktop === undefined) {
            return 0;
        }
        const area = desktop.tilingArea;
        const workingX = desktop.getWorkingLeft();
        const delta = DndEdgeScroll.normalizedDelta(this.cursor().x, workingX, desktop.getWorkingWidth(), this.config.dndEdgeViewScrollTriggerWidth);
        if (delta === 0) {
            this.nonzeroSince = null;
            return 0;
        }
        if (this.nonzeroSince === null) {
            this.nonzeroSince = now;
        }
        if (now - this.nonzeroSince < this.config.dndEdgeViewScrollDelay) {
            return 0;
        }
        const lastColumn = desktop.grid.getLastColumn();
        // niri lets the view go one screen past either end of the columns
        const min = -desktop.getWorkingWidth();
        const max = lastColumn === null ? 0 : lastColumn.getRight() - workingX + area.x;
        const target = Math.max(min, Math.min(max, desktop.getScrollX() + delta * timeDelta * this.config.dndEdgeViewScrollMaxSpeed));
        const amount = target - desktop.getScrollX();
        if (amount !== 0) {
            desktop.setScroll(target, true);
            this.scrolled();
        }
        return amount;
    }
}

namespace DndEdgeScroll {
    export interface Config {
        dndEdgeViewScrollTriggerWidth: number;
        dndEdgeViewScrollDelay: number;
        dndEdgeViewScrollMaxSpeed: number;
    }
}
