// niri's focus-follows-mouse, done by Kiri (KWin is set to click-to-focus); not while a Plasma popup or KRunner is open,
// Plasma's edit mode is on, a Plasma dialog (panel settings, widget explorer) has the focus, or a button is held
class FocusFollowsMouse {
    // where the pointer was at the previous event; the window "left" is looked up with the layout as it is now, like niri
    private prevPos: { x: number, y: number } | null = null;
    private readonly signalManager = new SignalManager();

    // `busy`: a swipe is on or settling; `maxScroll` is niri's max-scroll-amount in percent of the screen width
    constructor(private readonly busy: () => boolean, private readonly maxScroll: number) {
        const pos = Workspace.cursorPos;
        this.prevPos = { x: pos.x, y: pos.y };
        this.signalManager.connect(Workspace.cursorPosChanged, () => this.onPointerMoved());
    }

    public destroy() {
        this.signalManager.destroy();
    }

    private onPointerMoved() {
        const pos = Workspace.cursorPos;
        const prev = this.prevPos;
        this.prevPos = { x: pos.x, y: pos.y };
        if (overviewActive() || plasmaEditMode() || FocusFollowsMouse.shellHoldsFocus()) {
            return;
        }
        if (recentlyWarped(pos)) {
            return;
        }
        const window = FocusFollowsMouse.topWindowAt(pos);
        if (window === null || !(window.normalWindow || window.dialog) || window === Workspace.activeWindow) {
            return;
        }
        if (prev !== null && FocusFollowsMouse.topWindowAt(prev) === window) {
            return;
        }
        if (FocusFollowsMouse.popupOpen() || this.busy() || isOverTabIndicator(pos.x, pos.y)) {
            return;
        }
        if (this.maxScroll < 100 && FocusFollowsMouse.scrollAmount(window) > this.maxScroll) {
            return;
        }
        // niri does nothing while the pointer is grabbed
        const activeAtEvent = Workspace.activeWindow;
        queryPointerButtons(buttons => {
            // the answer comes later: it must not take away a focus given since the pointer event
            if (buttons === 0 && !overviewActive() && window !== Workspace.activeWindow && Workspace.activeWindow === activeAtEvent &&
                FocusFollowsMouse.topWindowAt(Workspace.cursorPos) === window) {
                activateWindow(window, "focus-follows-mouse");
            }
        });
    }

    private static scrollAmount(window: KwinClient) {
        const area = Workspace.clientArea(ClientAreaOption.PlacementArea, window.output, currentDesktopOn(window.output));
        const g = window.frameGeometry;
        const left = Math.max(0, area.x - g.x);
        const right = Math.max(0, g.x + g.width - (area.x + area.width));
        return 100 * Math.max(left, right) / area.width;
    }

    // like a niri layer surface with exclusive keyboard focus: hovering does not take the focus from Plasma's dialogs and
    // popups (the panel and the desktop do give it up, like niri's on-demand layers)
    private static shellHoldsFocus() {
        const active = Workspace.activeWindow;
        return active !== null && !active.dock && !active.desktopWindow && Clients.isShellUi(active);
    }

    private static popupOpen() {
        for (const window of Workspace.windows) {
            if (!window.minimized && (window.appletPopup || window.resourceClass === "org.kde.krunner")) {
                return true;
            }
        }
        return false;
    }

    public static topWindowAt(point: { x: number, y: number }) {
        // the cheap geometry test comes first
        const stack = Workspace.stackingOrder;
        for (let i = stack.length - 1; i >= 0; i--) {
            const window = stack[i];
            const g = window.frameGeometry;
            if (point.x < g.x || point.x >= g.x + g.width || point.y < g.y || point.y >= g.y + g.height) {
                continue;
            }
            if (!window.minimized && !window.hidden && isOnShownDesktop(window)) {
                return window;
            }
        }
        return null;
    }
}
