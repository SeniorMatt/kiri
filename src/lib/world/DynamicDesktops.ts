// niri's workspaces on KWin's virtual desktops (monitor.rs clean_up_workspaces, add_workspace_top/bottom,
// move_workspace_up/down/to_idx, layout/mod.rs set/unset_workspace_name, ensure_named_workspace):
//  - there is always exactly one empty desktop at the bottom (and one at the top with empty-workspace-above-first): a
//    desktop that gets its first window gets a new empty one next to it, at once;
//  - an empty desktop in between is removed once it is not the current one;
//  - KWin's desktop switch effects stop the animation they are running when a desktop is added or removed. niri
//    changes its workspaces under a running animation without a jump, so here nothing is added or removed while the
//    desktop switch animates: the work waits until the desktops have been left alone for CLEANUP_DELAY, which is
//    longer than the animation. No desktop disappears under the animation, nothing jumps, the Pager does not flicker,
//    and a key held down that crosses desktops does not create and remove them again and again;
//  - a named desktop (`workspace "name"` in niri's config, or set-workspace-name) counts as occupied: it stays when it
//    is empty. KWin names every desktop, so Kiri keeps the ids of the named ones.
class DynamicDesktops {
    // niri's workspace switch animation is a spring that has settled well within this time
    private static readonly CLEANUP_DELAY = 500;
    private lastSwitch = -Infinity;
    // a desktop made for a window that is about to move there (move to a new desktop): not to be removed as empty
    private reserved: { id: string, until: number } | null = null;

    private suspended = false; // createDesktop and removeDesktop signal back into Kiri
    private named: Set<string>; // ids of the named desktops
    private namedSynced = false;
    private cleanupArmed = false;
    private touched = false;
    private rows = -1;
    private readonly cleanupDelayer: Delayer;

    constructor(
        private readonly config: DynamicDesktops.Config,
        private readonly isOccupied: (kwinDesktop: KwinDesktop) => boolean,
        savedNamed: string[] = [],
        // a desktop was replaced by a new one with the same content (see moveCurrent)
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

    // ---- what is a named, an empty desktop ----

    public isNamed(kwinDesktop: KwinDesktop) {
        return this.named.has(kwinDesktop.id);
    }

    // niri's has_windows_or_name, negated. Windows Kiri does not manage (dialogs of the desktop) count as well, so that
    // removing the desktop can never take a window away from where it is.
    private isEmpty(kwinDesktop: KwinDesktop) {
        if (this.named.has(kwinDesktop.id) || this.isOccupied(kwinDesktop)) {
            return false;
        }
        return !Workspace.windows.some(kwinClient =>
            (kwinClient.normalWindow || kwinClient.dialog) && !kwinClient.desktopWindow && !kwinClient.dock &&
            kwinClient.desktops.length > 0 && kwinClient.desktops.includes(kwinDesktop));
    }

    // niri's find_workspace_by_name: a named desktop, or else any desktop that happens to have the name
    public findByName(name: string): KwinDesktop|undefined {
        const desktops = Workspace.desktops;
        return desktops.find(desktop => this.named.has(desktop.id) && desktop.name === name) ?? desktops.find(desktop => desktop.name === name);
    }

    // the desktops that are named now, to survive a reload of the script
    public captureNamed() {
        const ids = new Set(Workspace.desktops.map(desktop => desktop.id));
        return [...this.named].filter(id => ids.has(id));
    }

    // "Desktop N" with the lowest N that no desktop has yet
    private static freeName() {
        const names = new Set(Workspace.desktops.map(desktop => desktop.name));
        let n = Workspace.desktops.length + 1;
        while (names.has("Desktop " + n)) {
            n++;
        }
        return "Desktop " + n;
    }

    // ---- keeping the empty desktops ----

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

    // niri creates the named workspaces from the config at the top, in the order of the config
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

    // monitor.rs: a window that lands on the last workspace makes a new empty one below it (and above the first one
    // with empty-workspace-above-first). Done at once, so that the next desktop is there before anybody goes to it.
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

    // the move into the desktop made by emptyDesktopNextToCurrent is done (or did not happen)
    public releaseReserved() {
        this.reserved = null;
    }

    // the desktops clean_up_workspaces would remove now
    private removable() {
        const desktops = Workspace.desktops;
        const result: KwinDesktop[] = [];
        for (let i = desktops.length - 2; i >= (this.config.emptyAbove ? 1 : 0); i--) {
            if (desktops[i] !== Workspace.currentDesktop && this.isEmpty(desktops[i]) && !this.isReserved(desktops[i])) {
                result.push(desktops[i]);
            }
        }
        return result;
    }

    private switchRunning() {
        return Date.now() - this.lastSwitch < DynamicDesktops.CLEANUP_DELAY - 50;
    }

    // whether the empty desktop at the bottom (top) is missing
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

    // a switch of the desktop starts the wait again: nothing is removed while the user is on the move
    public onDesktopChanged() {
        this.lastSwitch = Date.now();
        if (this.cleanupArmed) {
            this.cleanupDelayer.run();
        }
    }

    // monitor.rs: with empty-workspace-above-first and nothing but two empty workspaces, the second one goes
    private allEmptyAboveFirst() {
        const desktops = Workspace.desktops;
        return this.config.emptyAbove && desktops.length === 2 && this.isEmpty(desktops[0]) && this.isEmpty(desktops[1]);
    }

    // monitor.rs clean_up_workspaces. The ids of the desktops that stay are untouched, so the Pager keeps them as they are.
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
                if (Workspace.currentDesktop === second) {
                    gotoDesktop(first, "dynamic-desktops");
                }
                Workspace.removeDesktop(second);
            }
            this.publishRows();
        } finally {
            this.suspended = wasSuspended;
        }
    }

    // KWin's desktop grid has one row per desktop (the compiled effect sets it, the script API can't)
    private publishRows() {
        const count = Workspace.desktops.length;
        if ((this.config.enabled || this.touched) && count !== this.rows) {
            this.rows = count;
            setDesktopRows(count);
        }
    }

    // niri's focus-workspace N (and the move-to-workspace actions) with an N past the last workspace go to the last one,
    // which is the empty one at the bottom
    public clampIndex(index: number) {
        return this.config.enabled ? Math.min(index, Workspace.desktops.length - 1) : index;
    }

    // ---- names ----

    // niri's set-workspace-name: ignored when the name is used by another workspace
    public setName(name: string) {
        name = name.trim();
        const current = Workspace.currentDesktop;
        if (name === "" || (this.findByName(name) !== undefined && this.findByName(name) !== current)) {
            return;
        }
        current.name = name;
        this.named.add(current.id);
    }

    // niri's unset-workspace-name: the desktop is an ordinary one again, and goes once it is empty and left
    public unsetName() {
        const current = Workspace.currentDesktop;
        if (!this.named.delete(current.id)) {
            return;
        }
        current.name = DynamicDesktops.freeName();
    }

    // ---- moving desktops ----

    // niri's move-workspace-up / move-workspace-down, emulated: KWin cannot reorder desktops, so the neighbour the
    // current desktop swaps places with is replaced by a new desktop with the same name on the other side of it, and
    // everything on the neighbour moves there (columns keep their layout, so does the view). The current desktop keeps
    // its id. Returns whether the desktop moved.
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
            const from = desktopManager.getDesktopInCurrentActivity(neighbor);
            const to = desktopManager.getDesktopInCurrentActivity(replacement);
            if (from !== undefined && to !== undefined) {
                const scrollX = from.getScrollX();
                from.grid.evacuate(to.grid);
                to.setScroll(scrollX, true);
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

    // niri's move-workspace-to-index N (1-based; clamped to the last desktop)
    public moveCurrentToIndex(desktopManager: DesktopManager, index: number) {
        const target = Math.max(0, Math.min(index, Workspace.desktops.length - 1));
        for (let guard = 0; guard < 1000; guard++) {
            const now = Workspace.desktops.indexOf(Workspace.currentDesktop);
            if (now < 0 || now === target || !this.moveCurrent(desktopManager, now < target ? 1 : -1)) {
                return;
            }
        }
    }

    // niri's add_or_reuse_empty_workspace_at, for move-column-to-new-workspace-below/above: the index of an empty
    // desktop right below (above) the current one; the empty one at the bottom (top) is used as it is
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
        enabled: boolean; // niri's dynamic workspaces
        emptyAbove: boolean; // layout { empty-workspace-above-first }
        names: string[]; // the declared named workspaces, in the order of the config
    }
}
