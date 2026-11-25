// niri's workspaces on KWin's virtual desktops: one empty desktop at the bottom (and at the top with empty-workspace-
// above-first), empty ones in between removed, named ones kept; nothing is added or removed while a desktop switch
// animates, because KWin's effects stop their animation then
class DynamicDesktops {
    private static readonly CLEANUP_DELAY = 500;
    private lastSwitch = -Infinity;
    private reserved: { id: string, until: number } | null = null;

    private suspended = false;
    private named: Set<string>;
    private namedSynced = false;
    private cleanupArmed = false;
    private touched = false;
    private rows = -1;
    private readonly cleanupDelayer: Delayer;

    constructor(
        private readonly config: DynamicDesktops.Config,
        private readonly isOccupied: (kwinDesktop: KwinDesktop) => boolean,
        savedNamed: string[] = [],
        private readonly onReplaced: (oldDesktop: KwinDesktop, newDesktop: KwinDesktop) => void = () => {},
    ) {
        this.named = new Set(savedNamed);
        this.cleanupDelayer = new Delayer(DynamicDesktops.CLEANUP_DELAY, () => {
            this.cleanupArmed = false;
            this.cleanup();
        });
    }

    public destroy() {
        this.cleanupDelayer.destroy();
    }

    public static parseNames(text: string): string[] {
        text = text.trim();
        if (text === "") {
            return [];
        }
        let names: unknown[];
        try {
            const parsed = JSON.parse(text);
            names = Array.isArray(parsed) ? parsed : [parsed];
        } catch (error: any) {
            names = text.split(",");
        }
        const result: string[] = [];
        for (const name of names) {
            if (typeof name === "string" && name.trim() !== "" && !result.includes(name.trim())) {
                result.push(name.trim());
            }
        }
        return result;
    }


    public isNamed(kwinDesktop: KwinDesktop) {
        return this.named.has(kwinDesktop.id);
    }

    // niri's has_windows_or_name, negated; windows Kiri does not manage count too
    private isEmpty(kwinDesktop: KwinDesktop) {
        if (this.named.has(kwinDesktop.id) || this.isOccupied(kwinDesktop)) {
            return false;
        }
        return !Workspace.windows.some(kwinClient =>
            (kwinClient.normalWindow || kwinClient.dialog) && !kwinClient.desktopWindow && !kwinClient.dock &&
            kwinClient.desktops.length > 0 && kwinClient.desktops.includes(kwinDesktop));
    }

    public findByName(name: string): KwinDesktop|undefined {
        const desktops = Workspace.desktops;
        return desktops.find(desktop => this.named.has(desktop.id) && desktop.name === name) ?? desktops.find(desktop => desktop.name === name);
    }

    public captureNamed() {
        const ids = new Set(Workspace.desktops.map(desktop => desktop.id));
        return [...this.named].filter(id => ids.has(id));
    }

    private static freeName() {
        const names = new Set(Workspace.desktops.map(desktop => desktop.name));
        let n = Workspace.desktops.length + 1;
        while (names.has("Desktop " + n)) {
            n++;
        }
        return "Desktop " + n;
    }


    public update() {
        if (this.suspended) {
            return;
        }
        this.suspended = true;
        try {
            this.syncNamed();
            if (this.config.enabled) {
                if (this.switchRunning()) {
                    this.armCleanup();
                } else {
                    this.ensureEmptyDesktops();
                    this.armCleanup();
                }
            }
            this.publishRows();
        } finally {
            this.suspended = false;
        }
    }

    private syncNamed() {
        if (this.namedSynced || Workspace.desktops.length === 0) {
            return;
        }
        this.namedSynced = true;
        const ids = new Set(Workspace.desktops.map(desktop => desktop.id));
        this.named = new Set([...this.named].filter(id => ids.has(id)));
        let position = 0;
        for (const name of this.config.names) {
            let desktop = Workspace.desktops.find(candidate => candidate.name === name);
            if (desktop === undefined) {
                Workspace.createDesktop(Math.min(position, Workspace.desktops.length), name);
                desktop = Workspace.desktops.find(candidate => candidate.name === name);
                this.touched = true;
            }
            if (desktop !== undefined) {
                this.named.add(desktop.id);
                position = Math.max(position, Workspace.desktops.indexOf(desktop) + 1);
            }
        }
    }

    // niri's monitor.rs: a window on the last desktop makes a new empty one below it, at once
    private ensureEmptyDesktops() {
        let desktops = Workspace.desktops;
        if (desktops.length === 0) {
            return;
        }
        if (!this.isEmpty(desktops[desktops.length - 1])) {
            log("dynamic desktops: new empty desktop at the bottom");
            Workspace.createDesktop(desktops.length, DynamicDesktops.freeName());
            this.touched = true;
            desktops = Workspace.desktops;
        }
        if (this.config.emptyAbove && !this.isEmpty(desktops[0])) {
            log("dynamic desktops: new empty desktop at the top");
            Workspace.createDesktop(0, DynamicDesktops.freeName());
            this.touched = true;
        }
    }

    private isReserved(kwinDesktop: KwinDesktop) {
        return this.reserved !== null && this.reserved.id === kwinDesktop.id && Date.now() < this.reserved.until;
    }

    public releaseReserved() {
        this.reserved = null;
    }

    private removable() {
        const desktops = Workspace.desktops;
        const result: KwinDesktop[] = [];
        for (let i = desktops.length - 2; i >= (this.config.emptyAbove ? 1 : 0); i--) {
            if (!isDesktopShownAnywhere(desktops[i]) && this.isEmpty(desktops[i]) && !this.isReserved(desktops[i])) {
                result.push(desktops[i]);
            }
        }
        return result;
    }

    private switchRunning() {
        return Date.now() - this.lastSwitch < DynamicDesktops.CLEANUP_DELAY - 50;
    }

    private needsEmptyDesktops() {
        const desktops = Workspace.desktops;
        return desktops.length > 0 && (!this.isEmpty(desktops[desktops.length - 1]) || (this.config.emptyAbove && !this.isEmpty(desktops[0])));
    }

    private armCleanup() {
        if (this.cleanupArmed || !this.config.enabled) {
            return;
        }
        if (this.removable().length > 0 || this.allEmptyAboveFirst() || (this.switchRunning() && this.needsEmptyDesktops())) {
            this.cleanupArmed = true;
            this.cleanupDelayer.run();
        }
    }

    public onDesktopChanged() {
        this.lastSwitch = Date.now();
        if (this.cleanupArmed) {
            this.cleanupDelayer.run();
        }
    }

    private allEmptyAboveFirst() {
        const desktops = Workspace.desktops;
        return this.config.emptyAbove && desktops.length === 2 && this.isEmpty(desktops[0]) && this.isEmpty(desktops[1]);
    }

    // niri's clean_up_workspaces; the ids of the desktops that stay are untouched
    private cleanup() {
        if (!this.config.enabled) {
            return;
        }
        const wasSuspended = this.suspended;
        this.suspended = true;
        try {
            this.ensureEmptyDesktops();
            for (const desktop of this.removable()) {
                log("dynamic desktops: removing the empty desktop", desktop.name);
                Workspace.removeDesktop(desktop);
            }
            if (this.allEmptyAboveFirst()) {
                const [first, second] = Workspace.desktops;
                for (const output of Workspace.screens) {
                    if (currentDesktopOn(output) === second) {
                        gotoDesktop(first, "dynamic-desktops", output);
                    }
                }
                Workspace.removeDesktop(second);
            }
            this.publishRows();
        } finally {
            this.suspended = wasSuspended;
        }
    }

    private publishRows() {
        const count = Workspace.desktops.length;
        if ((this.config.enabled || this.touched) && count !== this.rows) {
            this.rows = count;
            setDesktopRows(count);
        }
    }

    // niri: a number past the last workspace goes to the last one, the empty one at the bottom
    public clampIndex(index: number) {
        return this.config.enabled ? Math.min(index, Workspace.desktops.length - 1) : index;
    }


    public setName(name: string) {
        name = name.trim();
        const current = Workspace.currentDesktop;
        if (name === "" || (this.findByName(name) !== undefined && this.findByName(name) !== current)) {
            return;
        }
        current.name = name;
        this.named.add(current.id);
    }

    public unsetName() {
        const current = Workspace.currentDesktop;
        if (!this.named.delete(current.id)) {
            return;
        }
        current.name = DynamicDesktops.freeName();
    }


    // niri's move-workspace-up/down, emulated: KWin cannot reorder desktops, so the neighbour is replaced by a new
    // desktop with its name on the other side
    public moveCurrent(desktopManager: DesktopManager, step: 1 | -1) {
        const desktops = Workspace.desktops;
        const index = desktops.indexOf(Workspace.currentDesktop);
        const neighborIndex = index + step;
        if (index < 0 || neighborIndex < 0 || neighborIndex >= desktops.length) {
            return false;
        }
        const neighbor = desktops[neighborIndex];
        const before = new Set(desktops);
        const wasSuspended = this.suspended;
        this.suspended = true;
        try {
            Workspace.createDesktop(step > 0 ? index : index + 1, neighbor.name);
            const replacement = Workspace.desktops.find(desktop => !before.has(desktop));
            if (replacement === undefined) {
                return false;
            }
            for (const from of Array.from(desktopManager.getOutputDesktops(Workspace.currentActivity, neighbor))) {
                const to = desktopManager.getDesktopInCurrentActivity(replacement, from.outputName);
                if (to !== undefined) {
                    const scrollX = from.getScrollX();
                    from.grid.evacuate(to.grid);
                    to.setScroll(scrollX, true);
                }
            }
            for (const kwinClient of Workspace.windows) {
                if (kwinClient.desktops.includes(neighbor)) {
                    kwinClient.desktops = kwinClient.desktops.map(desktop => desktop === neighbor ? replacement : desktop);
                }
            }
            if (this.named.delete(neighbor.id)) {
                this.named.add(replacement.id);
            }
            this.onReplaced(neighbor, replacement);
            Workspace.removeDesktop(neighbor);
            return true;
        } finally {
            this.suspended = wasSuspended;
        }
    }

    public moveCurrentToIndex(desktopManager: DesktopManager, index: number) {
        const target = Math.max(0, Math.min(index, Workspace.desktops.length - 1));
        for (let guard = 0; guard < 1000; guard++) {
            const now = Workspace.desktops.indexOf(Workspace.currentDesktop);
            if (now < 0 || now === target || !this.moveCurrent(desktopManager, now < target ? 1 : -1)) {
                return;
            }
        }
    }

    // niri's add_or_reuse_empty_workspace_at
    public emptyDesktopNextToCurrent(below: boolean) {
        let desktops = Workspace.desktops;
        const index = below ? desktops.indexOf(Workspace.currentDesktop) + 1 : desktops.indexOf(Workspace.currentDesktop);
        if (index < 0) {
            return null;
        }
        if (this.config.emptyAbove && index === 0 && this.isEmpty(desktops[0])) {
            return 0;
        }
        if (desktops.length - 1 <= index && this.isEmpty(desktops[desktops.length - 1])) {
            return desktops.length - 1;
        }
        const wasSuspended = this.suspended;
        this.suspended = true;
        try {
            Workspace.createDesktop(Math.min(index, desktops.length), DynamicDesktops.freeName());
            this.touched = true;
        } finally {
            this.suspended = wasSuspended;
        }
        desktops = Workspace.desktops;
        const made = desktops[Math.min(index, desktops.length - 1)];
        this.reserved = { id: made.id, until: Date.now() + 3000 };
        return Math.min(index, desktops.length - 1);
    }
}

namespace DynamicDesktops {
    export interface Config {
        enabled: boolean;
        emptyAbove: boolean;
        names: string[];
    }
}
