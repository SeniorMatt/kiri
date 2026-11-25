// like niri, every output has a strip of columns of its own; a desktop of Kiri is a KWin desktop on one output
class DesktopManager {
    private readonly desktops: Map<string, Desktop>;
    private forcedOutputName: string | null = null;
    // KWin builds the list of screens at every read: it is read again when the outputs change
    private screenList: Output[] = [];
    private kwinActivities: Set<string>;
    private kwinDesktops: Set<KwinDesktop>;

    constructor(
        private readonly pinManager: PinManager,
        private readonly profiles: LayoutProfiles,
        private readonly focusPasser: FocusPassing.Passer,
        private readonly desktopFilter: DesktopFilter,
        private readonly getFocusedOutputName: () => string | null = () => null,
    ) {
        this.pinManager = pinManager;
        this.desktops = new Map();
        this.kwinActivities = new Set(Workspace.activities);
        this.kwinDesktops = new Set(Workspace.desktops);
        this.screenList = Workspace.screens;
    }


    private hasScreen(name: string) {
        if (this.screenList.some(screen => screen.name === name)) {
            return true;
        }
        this.screenList = Workspace.screens;
        return this.screenList.some(screen => screen.name === name);
    }

    public getOutputCount() {
        return this.screenList.length;
    }

    private existingOutputName(name: string | undefined) {
        if (name !== undefined && this.hasScreen(name)) {
            return name;
        }
        return this.activeOutputName();
    }

    private activeOutputName() {
        const wanted = this.forcedOutputName ?? this.getFocusedOutputName();
        if (wanted !== null && this.hasScreen(wanted)) {
            return wanted;
        }
        const active = Workspace.activeScreen;
        const screens = this.screenList;
        if (active !== undefined && active !== null && (screens.length === 0 || this.hasScreen(active.name))) {
            return active.name;
        }
        return screens.length > 0 ? screens[0].name : "";
    }

    public getActiveOutputName() {
        return this.activeOutputName();
    }

    public setForcedOutput(outputName: string | null) {
        this.forcedOutputName = outputName;
    }

    private resolveScreen(outputName: string): Output {
        const found = this.screenList.find(screen => screen.name === outputName);
        if (found !== undefined) {
            return found;
        }
        this.screenList = Workspace.screens;
        return this.screenList.find(screen => screen.name === outputName) ?? Workspace.activeScreen ?? this.screenList[0];
    }


    public getDesktop(activity: string, kwinDesktop: KwinDesktop, outputName?: string) {
        if (!this.desktopFilter.shouldWorkOnDesktop(kwinDesktop)) {
            return undefined;
        }
        const name = this.existingOutputName(outputName);
        const desktopKey = DesktopManager.getDesktopKey(activity, kwinDesktop, name);
        const desktop = this.desktops.get(desktopKey);
        if (desktop !== undefined) {
            return desktop;
        } else {
            return this.addDesktop(activity, kwinDesktop, name);
        }
    }

    public getOutputByName(name: string) {
        return this.resolveScreen(name);
    }

    // the focused output, as an output
    public getFocusedOutput() {
        return this.resolveScreen(this.activeOutputName());
    }

    // the KWin desktop shown on the focused output
    public getCurrentKwinDesktop() {
        return currentDesktopOn(this.getFocusedOutput());
    }

    public getCurrentDesktop() {
        return this.getDesktop(Workspace.currentActivity, this.getCurrentKwinDesktop());
    }

    public getDesktopInCurrentActivity(kwinDesktop: KwinDesktop, outputName?: string) {
        return this.getDesktop(Workspace.currentActivity, kwinDesktop, outputName);
    }

    public getDesktopForClient(kwinClient: KwinClient, outputName?: string) {
        if (kwinClient.activities.length !== 1 || kwinClient.desktops.length !== 1) {
            return undefined;
        }
        return this.getDesktop(kwinClient.activities[0], kwinClient.desktops[0], outputName ?? kwinClient.output?.name);
    }

    private addDesktop(activity: string, kwinDesktop: KwinDesktop, outputName: string) {
        const desktopKey = DesktopManager.getDesktopKey(activity, kwinDesktop, outputName);
        const desktop = new Desktop(
            kwinDesktop,
            this.pinManager,
            desktop => this.getProfile(desktop),
            outputName,
            () => this.resolveScreen(outputName),
            () => this.getOutputCount(),
            this.focusPasser,
        );
        this.desktops.set(desktopKey, desktop);
        return desktop;
    }

    public getProfile(desktop: Desktop): LayoutProfile {
        if (this.profiles.isEmpty()) {
            return this.profiles.getBase();
        }
        const screen = this.screenList.find(item => item.name === desktop.outputName);
        return this.profiles.resolve(desktop.kwinDesktop.name, LayoutProfiles.outputIds(screen, desktop.outputName));
    }

    private static getDesktopKey(activity: string, kwinDesktop: KwinDesktop, outputName: string) {
        return activity + "|" + kwinDesktop.id + "|" + outputName;
    }

    public updateActivities() {
        const newActivities = new Set(Workspace.activities);
        for (const activity of this.kwinActivities) {
            if (!newActivities.has(activity)) {
                this.removeActivity(activity);
            }
        }
        this.kwinActivities = newActivities;
    }

    public updateDesktops() {
        const newDesktops = new Set(Workspace.desktops);
        for (const desktop of this.kwinDesktops) {
            if (!newDesktops.has(desktop)) {
                this.removeKwinDesktop(desktop);
            }
        }
        this.kwinDesktops = newDesktops;
    }


    // niri's focus-monitor-*: the output next to the active one in a direction
    public getOutputInDirection(fromName: string, dx: number, dy: number) {
        const center = (screen: Output) => {
            const kwinDesktop = currentDesktopOn(screen);
            const area = Workspace.clientArea(ClientAreaOption.ScreenArea, screen, kwinDesktop);
            return { x: area.x + area.width / 2, y: area.y + area.height / 2 };
        };
        const from = Workspace.screens.find(screen => screen.name === fromName);
        if (from === undefined) {
            return null;
        }
        const origin = center(from);
        let best: Output | null = null;
        let bestScore = Infinity;
        for (const screen of Workspace.screens) {
            if (screen === from) {
                continue;
            }
            const c = center(screen);
            const along = (c.x - origin.x) * dx + (c.y - origin.y) * dy;
            if (along <= 0) {
                continue;
            }
            const across = Math.abs((c.x - origin.x) * dy) + Math.abs((c.y - origin.y) * dx);
            const score = along + across * 2;
            if (score < bestScore) {
                bestScore = score;
                best = screen;
            }
        }
        return best;
    }

    public getAdjacentOutput(fromName: string, step: 1 | -1) {
        const screens = Workspace.screens;
        const index = screens.findIndex(screen => screen.name === fromName);
        if (index < 0 || screens.length < 2) {
            return null;
        }
        return screens[(index + step + screens.length) % screens.length];
    }

    private moveAllColumns(from: Desktop, to: Desktop, home: string | undefined) {
        for (const column of from.grid.getColumns()) {
            if (home !== undefined && column.homeOutput === undefined) {
                column.homeOutput = home;
            }
            column.moveToGrid(to.grid, to.grid.getLastColumn(), FocusPassing.Type.None);
        }
    }

    // like niri, the strips of an output that is gone are added to another output and go back when it reappears
    public onScreensChanged() {
        const screens = Workspace.screens;
        this.screenList = screens;
        const names = new Set(screens.map(screen => screen.name));
        if (names.size === 0) {
            return;
        }
        const active = Workspace.activeWindow;
        const survivor = screens.some(screen => screen.name === Workspace.activeScreen?.name) ? Workspace.activeScreen.name : screens[0].name;
        for (const [key, desktop] of Array.from(this.desktops)) {
            if (names.has(desktop.outputName)) {
                continue;
            }
            const [activity] = key.split("|");
            const target = this.getDesktop(activity, desktop.kwinDesktop, survivor);
            if (target !== undefined && target !== desktop) {
                this.moveAllColumns(desktop, target, desktop.outputName);
            }
            if (desktop.grid.getColumns().length === 0) {
                desktop.destroy();
                this.desktops.delete(key);
            }
        }
        for (const [key, desktop] of Array.from(this.desktops)) {
            const [activity] = key.split("|");
            for (const column of desktop.grid.getColumns()) {
                const home = column.homeOutput;
                if (home === undefined || home === desktop.outputName || !names.has(home)) {
                    continue;
                }
                const target = this.getDesktop(activity, desktop.kwinDesktop, home);
                if (target !== undefined) {
                    column.homeOutput = undefined;
                    column.moveToGrid(target.grid, target.grid.getLastColumn(), FocusPassing.Type.None);
                }
            }
        }
        if (active !== null && Workspace.activeWindow !== active && !active.minimized) {
            Workspace.activeWindow = active;
        }
        if (active !== null) {
            this.keepInView(active);
        }
        this.forcedOutputName = null;
    }

    private keepInView(kwinClient: KwinClient) {
        for (const desktop of this.desktops.values()) {
            for (const column of desktop.grid.getColumns()) {
                const window = column.getWindows().find(w => w.client.kwinClient === kwinClient);
                if (window !== undefined) {
                    column.onWindowFocused(window);
                    return;
                }
            }
        }
    }

    public gatherOnOutput(outputName: string) {
        for (const [key, desktop] of Array.from(this.desktops)) {
            if (desktop.outputName === outputName) {
                continue;
            }
            const [activity] = key.split("|");
            const target = this.getDesktop(activity, desktop.kwinDesktop, outputName);
            if (target !== undefined && target !== desktop) {
                for (const column of desktop.grid.getColumns()) {
                    column.homeOutput = undefined;
                    column.moveToGrid(target.grid, target.grid.getLastColumn(), FocusPassing.Type.None);
                }
            }
        }
        this.forcedOutputName = outputName;
    }


    private removeActivity(activity: string) {
        for (const kwinDesktop of this.kwinDesktops) {
            this.destroyDesktop(activity, kwinDesktop);
        }
    }

    private removeKwinDesktop(kwinDesktop: KwinDesktop) {
        for (const activity of this.kwinActivities) {
            this.destroyDesktop(activity, kwinDesktop);
        }
    }

    private destroyDesktop(activity: string, kwinDesktop: KwinDesktop) {
        const prefix = activity + "|" + kwinDesktop.id + "|";
        for (const [key, desktop] of Array.from(this.desktops)) {
            if (key.startsWith(prefix)) {
                desktop.destroy();
                this.desktops.delete(key);
            }
        }
    }

    public destroy() {
        for (const desktop of this.desktops.values()) {
            desktop.destroy();
        }
    }

    public *getKeyedDesktops(): Generator<[string, Desktop]> {
        for (const entry of this.desktops) {
            yield entry;
        }
    }

    public getDesktopByKey(key: string) {
        return this.desktops.get(key);
    }

    public *getAllDesktops() {
        for (const desktop of this.desktops.values()) {
            yield desktop;
        }
    }

    public *getOutputDesktops(activity: string, kwinDesktop: KwinDesktop) {
        const prefix = activity + "|" + kwinDesktop.id + "|";
        for (const [key, desktop] of this.desktops) {
            if (key.startsWith(prefix)) {
                yield desktop;
            }
        }
    }

    public getDesktopsForClient(kwinClient: KwinClient) {
        const desktops = this.getDesktops(kwinClient.activities, kwinClient.desktops); // workaround for QTBUG-109880
        return desktops;
    }

    public *getDesktops(activities: string[], kwinDesktops: KwinDesktop[]) {
        const matchedActivities = activities.length > 0 ? activities : this.kwinActivities.keys();
        const matchedDesktops = kwinDesktops.length > 0 ? kwinDesktops : this.kwinDesktops.keys();
        for (const matchedActivity of matchedActivities) {
            for (const matchedDesktop of matchedDesktops) {
                for (const desktop of this.getOutputDesktops(matchedActivity, matchedDesktop)) {
                    yield desktop;
                }
            }
        }
    }
}
