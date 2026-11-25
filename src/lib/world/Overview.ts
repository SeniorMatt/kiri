// the script's side of the compiled effect kiri_overview (niri's overview): sends the layout of every desktop, opens and
// closes it, follows the 4-finger swipe and applies what the user did in it
class Overview {
    public static readonly GESTURE_MOVEMENT = 300;
    private static readonly RAW_DECELERATION = 0.997;
    private static readonly RAW_HISTORY_MS = 150;

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
        this.gesture = null;
        this.lastLayout = this.buildLayout();
        overviewCall("toggle", this.lastLayout);
        this.open = !this.open;
        this.openedAt = Date.now();
        setOverviewPolling(true);
        return true;
    }

    public warm() {
        if (!overviewEffectLoaded() || this.open || this.gesture !== null) {
            return;
        }
        overviewCall("warm", this.buildLayout());
    }

    public close() {
        this.gesture = null;
        if (this.open) {
            overviewCall("close", "");
            this.open = false;
        }
    }


    // one layout when every output shows the same desktop; one per output (same desktop order) with per-screen desktops
    public buildLayout() {
        if (!this.world.isPerScreenDesktops()) {
            return JSON.stringify(this.buildOutputLayout(this.desktopManager.getFocusedOutput(), false));
        }
        return JSON.stringify({ screens: Workspace.screens.map(output => this.buildOutputLayout(output, true)) });
    }

    private buildOutputLayout(output: Output, onlyThisOutput: boolean) {
        const desktops: unknown[] = [];
        const full0 = Workspace.clientArea(ClientAreaOption.FullScreenArea, output, currentDesktopOn(output));
        let screen = { x: full0.x, y: full0.y, w: full0.width, h: full0.height };
        let current = 0;
        const activeWindow = Workspace.activeWindow;
        const activeId = activeWindow === null ? "" : String(activeWindow.internalId);
        const shown = currentDesktopOn(output);
        Workspace.desktops.forEach((kwinDesktop, index) => {
            if (kwinDesktop === shown) {
                current = index;
            }
            const desktop = this.desktopManager.getDesktopInCurrentActivity(kwinDesktop, output.name);
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
                    return Overview.windowJson(window.client.kwinClient, window.getFilledRect(rect[0], rect[1], rect[2], rect[3]));
                });
                return { x: x, w: width, tab: tabbed, wins: wins };
            });
            const floats = this.clientManager.getFloatingOnDesktop(kwinDesktop, onlyThisOutput ? output : undefined).map(kwinClient => {
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
        return { screen: screen, current: current, active: activeId, desktops: desktops };
    }

    private static windowJson(kwinClient: KwinClient, rect: number[]) {
        return {
            id: String(kwinClient.internalId),
            x: Math.round(rect[0]), y: Math.round(rect[1]), w: Math.round(rect[2]), h: Math.round(rect[3]),
            t: kwinClient.caption,
            c: kwinClient.resourceClass,
        };
    }


    public poll(json: string) {
        let answer: { open: boolean, run?: boolean, p: number, events: any[] };
        try {
            answer = JSON.parse(json);
        } catch (error: any) {
            return;
        }
        if (answer === null || typeof answer !== "object") {
            return;
        }
        let changed = false;
        for (const event of Array.isArray(answer.events) ? answer.events : []) {
            changed = this.apply(event) || changed;
        }
        const wasOpen = this.open;
        if (this.gesture === null) {
            this.open = answer.open;
        }
        if (this.open || changed || answer.run === true) {
            this.sendLayout();
        }
        if (!answer.open && answer.run !== true && answer.p < 0.005 && this.gesture === null && Date.now() - this.openedAt > 400) {
            this.open = false;
            setOverviewPolling(false);
        }
        if (wasOpen && !this.open) {
            this.lastLayout = "";
        }
    }

    public sendLayout() {
        const layout = this.buildLayout();
        if (layout !== this.lastLayout) {
            this.lastLayout = layout;
            overviewCall("setLayout", layout);
        }
    }

    // the output an event of the effect is about ("o"); the focused one when it is missing or unknown
    private eventOutput(event: Record<string, any>) {
        if (typeof event.o === "string") {
            const found = Workspace.screens.find(output => output.name === event.o);
            if (found !== undefined) {
                return found;
            }
        }
        return this.desktopManager.getFocusedOutput();
    }

    private apply(event: { t: string, [key: string]: any }) {
        if (event === null || typeof event !== "object") {
            return false;
        }
        const output = this.eventOutput(event);
        switch (event.t) {
        case "activate": {
            const kwinClient = this.clientManager.findClientById(event.w);
            if (kwinClient === undefined) {
                return false;
            }
            this.world.do(() => {
                if (kwinClient.desktops.length === 1 && kwinClient.desktops[0] !== currentDesktopOn(output)) {
                    gotoDesktop(kwinClient.desktops[0], "overview-window", output);
                }
                activateWindow(kwinClient, "overview");
            });
            return true;
        }
        case "goto": {
            const kwinDesktop = Workspace.desktops[event.i];
            if (kwinDesktop !== undefined && kwinDesktop !== currentDesktopOn(output)) {
                gotoDesktop(kwinDesktop, "overview-desktop", output);
            }
            return true;
        }
        case "scroll": {
            const kwinDesktop = Workspace.desktops.find(d => d.id === event.d);
            const desktop = kwinDesktop === undefined ? undefined : this.desktopManager.getDesktopInCurrentActivity(kwinDesktop, output.name);
            if (desktop === undefined) {
                return false;
            }
            this.world.do(() => desktop.setScroll(event.x, false));
            return true;
        }
        case "focuscol": {
            const kwinDesktop = Workspace.desktops.find(d => d.id === event.d);
            const desktop = kwinDesktop === undefined ? undefined : this.desktopManager.getDesktopInCurrentActivity(kwinDesktop, output.name);
            if (kwinDesktop === undefined || desktop === undefined) {
                return false;
            }
            const grid = desktop.grid;
            const column = grid.getLastFocusedColumn();
            if (column === null) {
                return false;
            }
            const target = event.dir < 0 ? grid.getLeftColumn(column) : grid.getRightColumn(column);
            if (target === null) {
                return true;
            }
            this.world.do(() => {
                if (kwinDesktop === currentDesktopOn(output)) {
                    target.getWindowToFocus().focus();
                } else {
                    grid.setActiveColumn(target);
                    desktop.scrollToColumn(target, true, column);
                }
            });
            return true;
        }
        case "drop": {
            const kwinClient = this.clientManager.findClientById(event.w);
            const kwinDesktop = Workspace.desktops.find(d => d.id === event.d);
            if (kwinClient === undefined || kwinDesktop === undefined) {
                return false;
            }
            this.world.do(clientManager => clientManager.overviewDrop(kwinClient, kwinDesktop, event.c, event.i, output.name));
            return true;
        }
        case "dropf": {
            const kwinClient = this.clientManager.findClientById(event.w);
            const kwinDesktop = Workspace.desktops.find(d => d.id === event.d);
            if (kwinClient === undefined || kwinDesktop === undefined) {
                return false;
            }
            this.world.do(clientManager => clientManager.overviewDropFloating(kwinClient, kwinDesktop, event.x, event.y));
            return true;
        }
        }
        return false;
    }


    // niri's overview gesture: 300 units of vertical finger travel per progress; the release velocity decides open or closed
    public gestureUpdate(events: number[][]) {
        if (events.length === 0) {
            return;
        }
        if (this.gesture === null) {
            if (plasmaEditMode() && !this.open) {
                return;
            }
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
        let velocity = 0;
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
