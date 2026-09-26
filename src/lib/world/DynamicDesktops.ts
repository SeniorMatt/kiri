// niri's dynamic workspaces on KWin's virtual desktops (monitor.rs clean_up_workspaces, move_workspace_up/down):
// there is always exactly one empty desktop at the bottom, an empty desktop in between is removed once it is no
// longer the current one, and a desktop that is filled at the bottom gets a new empty one below it.
class DynamicDesktops {
    private suspended = false;

    constructor(
        private readonly enabled: boolean,
        private readonly isOccupied: (kwinDesktop: KwinDesktop) => boolean,
    ) {}

    public update() {
        if (!this.enabled || this.suspended) {
            return;
        }
        this.suspended = true; // createDesktop and removeDesktop signal back into Kiri
        try {
            const desktops = Workspace.desktops;
            if (desktops.length === 0) {
                return;
            }
            if (this.isOccupied(desktops[desktops.length - 1])) {
                Workspace.createDesktop(desktops.length, DynamicDesktops.freeName());
            }
            // ids of the desktops that stay are untouched, so the pager keeps them as they are
            for (const desktop of Workspace.desktops.slice(0, -1)) {
                if (desktop !== Workspace.currentDesktop && !this.isOccupied(desktop)) {
                    Workspace.removeDesktop(desktop);
                }
            }
            setDesktopRows(Workspace.desktops.length);
        } finally {
            this.suspended = false;
        }
    }

    // niri's focus-workspace N (and the move-to-workspace actions) with an N past the last workspace go to the last one,
    // which is the empty one at the bottom
    public clampIndex(index: number) {
        return this.enabled ? Math.min(index, Workspace.desktops.length - 1) : index;
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

    // niri's move-workspace-up / move-workspace-down, emulated: KWin cannot reorder desktops, so the neighbour the
    // current desktop swaps places with is replaced by a new desktop with the same name on the other side of it, and
    // everything on the neighbour moves there (columns keep their layout). The current desktop keeps its id.
    public moveCurrent(desktopManager: DesktopManager, step: 1 | -1) {
        const desktops = Workspace.desktops;
        const index = desktops.indexOf(Workspace.currentDesktop);
        const neighborIndex = index + step;
        if (index < 0 || neighborIndex < 0 || neighborIndex >= desktops.length) {
            return;
        }
        const neighbor = desktops[neighborIndex];
        const before = new Set(desktops);
        const wasSuspended = this.suspended;
        this.suspended = true;
        try {
            Workspace.createDesktop(step > 0 ? index : index + 1, neighbor.name);
            const replacement = Workspace.desktops.find(desktop => !before.has(desktop));
            if (replacement === undefined) {
                return;
            }
            const from = desktopManager.getDesktopInCurrentActivity(neighbor);
            const to = desktopManager.getDesktopInCurrentActivity(replacement);
            if (from !== undefined && to !== undefined) {
                from.grid.evacuate(to.grid);
            }
            for (const kwinClient of Workspace.windows) {
                if (kwinClient.desktops.includes(neighbor)) {
                    kwinClient.desktops = kwinClient.desktops.map(desktop => desktop === neighbor ? replacement : desktop);
                }
            }
            Workspace.removeDesktop(neighbor);
        } finally {
            this.suspended = wasSuspended;
        }
    }
}
