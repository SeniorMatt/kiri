class DesktopManager {
    private readonly desktops: Map<string, Desktop>; // key is activityId|desktopId
    private selectedScreen: Output;
    private preferredScreenName: string; // like niri's workspaces, the grid returns to its output when it comes back
    private kwinActivities: Set<string>;
    private kwinDesktops: Set<KwinDesktop>;

    constructor(
        private readonly pinManager: PinManager,
        private readonly config: Desktop.Config,
        private readonly layoutConfig: LayoutConfig,
        private readonly focusPasser: FocusPassing.Passer,
        private readonly desktopFilter: DesktopFilter,
    ) {
        this.pinManager = pinManager;
        this.config = config;
        this.layoutConfig = layoutConfig;
        this.desktops = new Map();
        this.selectedScreen = Workspace.activeScreen;
        this.preferredScreenName = Workspace.activeScreen.name;
        this.kwinActivities = new Set(Workspace.activities);
        this.kwinDesktops = new Set(Workspace.desktops);
    }

    public getDesktop(activity: string, kwinDesktop: KwinDesktop) {
        if (!this.desktopFilter.shouldWorkOnDesktop(kwinDesktop)) {
            return undefined;
        }
        const desktopKey = DesktopManager.getDesktopKey(activity, kwinDesktop);
        const desktop = this.desktops.get(desktopKey);
        if (desktop !== undefined) {
            return desktop;
        } else {
            return this.addDesktop(activity, kwinDesktop);
        }
    }

    public getCurrentDesktop() {
        return this.getDesktop(Workspace.currentActivity, Workspace.currentDesktop);
    }

    public getDesktopInCurrentActivity(kwinDesktop: KwinDesktop) {
        return this.getDesktop(Workspace.currentActivity, kwinDesktop);
    }

    public getDesktopForClient(kwinClient: KwinClient) {
        if (kwinClient.activities.length !== 1 || kwinClient.desktops.length !== 1) {
            return undefined;
        }
        return this.getDesktop(kwinClient.activities[0], kwinClient.desktops[0]);
    }

    private addDesktop(activity: string, kwinDesktop: KwinDesktop) {
        const desktopKey = DesktopManager.getDesktopKey(activity, kwinDesktop);
        const desktop = new Desktop(
            kwinDesktop,
            this.pinManager,
            this.config,
            () => this.selectedScreen,
            this.layoutConfig,
            this.focusPasser,
        );
        this.desktops.set(desktopKey, desktop);
        return desktop;
    }

    private static getDesktopKey(activity: string, kwinDesktop: KwinDesktop) {
        return activity + "|" + kwinDesktop.id;
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

    // an explicit choice (the move-to-screen action)
    public selectScreen(screen: Output) {
        this.selectedScreen = screen;
        this.preferredScreenName = screen.name;
    }

    // The outputs changed (hot-plug, lock, sleep, wake). The active screen is no guide then (it is briefly wrong on
    // wake), so the grid keeps its output, goes back to it when it reappears, and only leaves it when it is gone.
    public onScreensChanged() {
        const screens = Workspace.screens;
        const preferred = screens.find(screen => screen.name === this.preferredScreenName);
        if (preferred !== undefined) {
            this.selectedScreen = preferred;
        } else if (!screens.includes(this.selectedScreen)) {
            this.selectedScreen = Workspace.activeScreen;
        }
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
        const desktopKey = DesktopManager.getDesktopKey(activity, kwinDesktop);
        const desktop = this.desktops.get(desktopKey);
        if (desktop !== undefined) {
            desktop.destroy();
            this.desktops.delete(desktopKey);
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

    public getDesktopsForClient(kwinClient: KwinClient) {
        const desktops = this.getDesktops(kwinClient.activities, kwinClient.desktops); // workaround for QTBUG-109880
        return desktops;
    }

    // empty array means all
    public *getDesktops(activities: string[], kwinDesktops: KwinDesktop[]) {
        const matchedActivities = activities.length > 0 ? activities : this.kwinActivities.keys();
        const matchedDesktops = kwinDesktops.length > 0 ? kwinDesktops : this.kwinDesktops.keys();
        for (const matchedActivity of matchedActivities) {
            for (const matchedDesktop of matchedDesktops) {
                const desktopKey = DesktopManager.getDesktopKey(matchedActivity, matchedDesktop);
                const desktop = this.desktops.get(desktopKey);
                if (desktop !== undefined) {
                    yield desktop;
                }
            }
        }
    }
}
