// The script's side of the compiled effect kiri_overview (niri's overview).
//
// The effect draws; this class tells it what there is to draw. It sends the layout of every desktop (rects per
// window, computed from the grid the same way arrange() places the windows, so nothing is guessed), opens and
// closes the overview, follows the 4-finger swipe, and applies what the user did in it (the effect cannot call the
// script, so main.qml polls it and hands the answers to poll()).
class Overview {
    // niri OVERVIEW_GESTURE_MOVEMENT: units of finger travel from closed to open
    public static readonly GESTURE_MOVEMENT = 300;
    private static readonly RAW_DECELERATION = 0.997; // niri DECELERATION_TOUCHPAD, per millisecond
    private static readonly RAW_HISTORY_MS = 150; // niri HISTORY_LIMIT

    // niri OVERVIEW_GESTURE_RUBBER_BAND: past the ends the progress follows the fingers a little (stiffness 0.5, limit 0.05)
    private static readonly RUBBER_STIFFNESS = 0.5;
    private static readonly RUBBER_LIMIT = 0.05;

    private open = false;
    private lastLayout = "";
    private gesture: { start: number, pos: number, history: { delta: number, time: number }[] } | null = null;
    private lastGestureValue = -1;
    private openedAt = 0;

    constructor(
        private readonly world: World,
        private readonly clientManager: ClientManager,
        private readonly desktopManager: DesktopManager,
    ) {}

    public isOpen() {
        return this.open;
    }

    public toggle() {
        if (!overviewEffectLoaded()) {
            return false;
        }
        this.lastLayout = this.buildLayout();
        overviewCall("toggle", this.lastLayout);
        this.open = !this.open;
        this.openedAt = Date.now();
        setOverviewPolling(true);
        return true;
    }

    public close() {
        if (this.open) {
            overviewCall("close", "");
            this.open = false;
        }
    }

    // ---- the layout, as JSON -------------------------------------------------------------------------------

    public buildLayout() {
        const desktops: unknown[] = [];
        let screen = { x: 0, y: 0, w: 0, h: 0 };
        let current = 0;
        const activeWindow = Workspace.activeWindow;
        const activeId = activeWindow === null ? "" : String(activeWindow.internalId);
        Workspace.desktops.forEach((kwinDesktop, index) => {
            if (kwinDesktop === Workspace.currentDesktop) {
                current = index;
            }
            const desktop = this.desktopManager.getDesktopInCurrentActivity(kwinDesktop);
            if (desktop === undefined) {
                desktops.push({ id: kwinDesktop.id, scroll: 0, gapH: 0, gapV: 0, area: [0, 0, 0, 0], cols: [], floats: [] });
                return;
            }
            const full = desktop.fullScreenArea;
            screen = { x: full.x, y: full.y, w: full.width, h: full.height };
            const area = desktop.tilingArea;
            const scroll = desktop.getScrollX();
            const config = desktop.grid.config;
            const cols = desktop.grid.getColumns().map(column => {
                const x = area.x - scroll + column.getLeft();
                const width = column.getWidth();
                let y = area.y;
                const tabbed = column.isTabbed();
                const wins = column.getWindows().map(window => {
                    const rect = tabbed ? [x, area.y, width, area.height] : [x, y, width, window.height];
                    y += window.height + config.gapsInnerVertical;
                    return Overview.windowJson(window.client.kwinClient, rect);
                });
                return { x: x, w: width, tab: tabbed, wins: wins };
            });
            const floats = this.clientManager.getFloatingOnDesktop(kwinDesktop).map(kwinClient => {
                const g = kwinClient.frameGeometry;
                return Overview.windowJson(kwinClient, [g.x, g.y, g.width, g.height]);
            });
            desktops.push({
                id: kwinDesktop.id,
                scroll: scroll,
                gapH: config.gapsInnerHorizontal,
                gapV: config.gapsInnerVertical,
                area: [area.x, area.y, area.width, area.height],
                cols: cols,
                floats: floats,
            });
        });
        return JSON.stringify({ screen: screen, current: current, active: activeId, desktops: desktops });
    }

    private static windowJson(kwinClient: KwinClient, rect: number[]) {
        return {
            id: String(kwinClient.internalId),
            x: Math.round(rect[0]), y: Math.round(rect[1]), w: Math.round(rect[2]), h: Math.round(rect[3]),
            t: kwinClient.caption,
            c: kwinClient.resourceClass,
        };
    }

    // ---- what the effect reports ----------------------------------------------------------------------------

    // the answer of the effect's poll(): {"open":bool,"p":progress,"events":[...]}
    public poll(json: string) {
        let answer: { open: boolean, p: number, events: any[] };
        try {
            answer = JSON.parse(json);
        } catch (error: any) {
            return;
        }
        let changed = false;
        for (const event of answer.events) {
            changed = this.apply(event) || changed;
        }
        const wasOpen = this.open;
        if (this.gesture === null) {
            this.open = answer.open;
        }
        if (this.open || changed) {
            this.sendLayout();
        }
        // the effect is back to the normal view: stop asking (after a moment: the open call may still be on its way)
        if (!answer.open && answer.p < 0.005 && this.gesture === null && Date.now() - this.openedAt > 400) {
            this.open = false;
            setOverviewPolling(false);
        }
        if (wasOpen && !this.open) {
            this.lastLayout = "";
        }
    }

    // sends the layout again if something in it changed
    public sendLayout() {
        const layout = this.buildLayout();
        if (layout !== this.lastLayout) {
            this.lastLayout = layout;
            overviewCall("setLayout", layout);
        }
    }

    private apply(event: { t: string, [key: string]: any }) {
        switch (event.t) {
        case "activate": {
            const kwinClient = this.clientManager.findClientById(event.w);
            if (kwinClient === undefined) {
                return false;
            }
            this.world.do(() => {
                if (kwinClient.desktops.length === 1 && kwinClient.desktops[0] !== Workspace.currentDesktop) {
                    Workspace.currentDesktop = kwinClient.desktops[0];
                }
                Workspace.activeWindow = kwinClient;
            });
            return true;
        }
        case "goto": {
            const kwinDesktop = Workspace.desktops[event.i];
            if (kwinDesktop !== undefined && kwinDesktop !== Workspace.currentDesktop) {
                Workspace.currentDesktop = kwinDesktop;
            }
            return true;
        }
        case "scroll": {
            const kwinDesktop = Workspace.desktops.find(d => d.id === event.d);
            const desktop = kwinDesktop === undefined ? undefined : this.desktopManager.getDesktopInCurrentActivity(kwinDesktop);
            if (desktop === undefined) {
                return false;
            }
            this.world.do(() => desktop.setScroll(event.x, false));
            return true;
        }
        case "drop": {
            const kwinClient = this.clientManager.findClientById(event.w);
            const kwinDesktop = Workspace.desktops.find(d => d.id === event.d);
            if (kwinClient === undefined || kwinDesktop === undefined) {
                return false;
            }
            this.world.do(clientManager => clientManager.overviewDrop(kwinClient, kwinDesktop, event.c, event.i));
            return true;
        }
        }
        return false;
    }

    // ---- the 4-finger swipe ----------------------------------------------------------------------------------

    // niri's overview gesture: vertical finger travel moves the progress 1 per 300 units (up opens), and when the
    // fingers lift the velocity is projected to decide whether it ends open or closed. `events` are [ms, dy].
    public gestureUpdate(events: number[][]) {
        if (events.length === 0) {
            return;
        }
        if (this.gesture === null) {
            this.gesture = { start: this.open ? 1 : 0, pos: 0, history: [] };
            this.lastGestureValue = -1;
            this.lastLayout = this.buildLayout();
            overviewCall("gesture", JSON.stringify({ layout: JSON.parse(this.lastLayout) }));
            this.openedAt = Date.now();
            setOverviewPolling(true);
        }
        const gesture = this.gesture;
        for (const event of events) {
            const delta = -event[1];
            gesture.pos += delta;
            gesture.history.push({ delta: delta, time: event[0] });
            while (gesture.history.length > 1 && event[0] > gesture.history[0].time + Overview.RAW_HISTORY_MS) {
                gesture.history.shift();
            }
        }
        const value = Overview.rubberClamp(gesture.start + gesture.pos / Overview.GESTURE_MOVEMENT);
        if (value !== this.lastGestureValue) {
            this.lastGestureValue = value;
            overviewCall("gesture", JSON.stringify({ p: value }));
        }
    }

    public gestureEnd() {
        const gesture = this.gesture;
        if (gesture === null) {
            return;
        }
        this.gesture = null;
        const history = gesture.history;
        let velocity = 0; // units per second
        if (history.length > 1 && history[history.length - 1].time > history[0].time) {
            const total = history.reduce((sum, e) => sum + e.delta, 0);
            velocity = total / ((history[history.length - 1].time - history[0].time) / 1000);
        }
        const projected = -velocity / (1000 * Math.log(Overview.RAW_DECELERATION));
        const end = Math.round(Math.max(0, Math.min(1, gesture.start + (gesture.pos + projected) / Overview.GESTURE_MOVEMENT)));
        this.open = end === 1;
        const rubber = Overview.rubberDerivative(gesture.start + gesture.pos / Overview.GESTURE_MOVEMENT);
        overviewCall("gesture", JSON.stringify({ settle: this.open, v: velocity / Overview.GESTURE_MOVEMENT * rubber }));
        this.openedAt = Date.now();
    }

    private static band(x: number) {
        return (1 - 1 / (x * Overview.RUBBER_STIFFNESS / Overview.RUBBER_LIMIT + 1)) * Overview.RUBBER_LIMIT;
    }

    private static rubberClamp(x: number) {
        const clamped = Math.max(0, Math.min(1, x));
        return clamped + (x < clamped ? -1 : 1) * Overview.band(Math.abs(x - clamped));
    }

    private static rubberDerivative(x: number) {
        const clamped = Math.max(0, Math.min(1, x));
        if (clamped === x) {
            return 1;
        }
        const d = Overview.RUBBER_STIFFNESS * Math.abs(x - clamped) + Overview.RUBBER_LIMIT;
        return Overview.RUBBER_STIFFNESS * Overview.RUBBER_LIMIT * Overview.RUBBER_LIMIT / (d * d);
    }

    public isGesturing() {
        return this.gesture !== null;
    }
}
