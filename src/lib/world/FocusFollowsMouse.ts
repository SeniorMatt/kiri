// niri's focus-follows-mouse, done by Kiri itself (KWin is set to click-to-focus): hovering a window activates it, but
// not while a Plasma popup (the launcher, the system tray, ...) or KRunner is open, because the popup closes as soon
// as it loses focus, and not while a pointer button is held (niri skips the grab). Like niri, only a change of the window under the pointer activates, and layout animations that
// slide a window under a still pointer do not (cursorPosChanged only fires when the pointer moves).
class FocusFollowsMouse {
    // where the pointer was at the previous event; like niri, the window "left" is looked up here with the layout as it
    // is NOW (handle_focus_follows_mouse recomputes it), not remembered, so a window that slid under a still pointer
    // does not count as entered when the pointer then moves inside it
    private prevPos: { x: number, y: number } | null = null;
    private readonly signalManager = new SignalManager();

    // `busy` says that the layout is in a swipe or settling after one; `maxScroll` is niri's max-scroll-amount in
    // percent of the screen width (100 or more = no limit)
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
        if (overviewActive()) {
            // the pointer is over the overview's tiles, not over the windows below them
            return;
        }
        if (recentlyWarped(pos)) {
            // niri's warp-mouse-to-focus moves the pointer without focus-follows-mouse looking at it
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
        // niri does nothing while the pointer is grabbed (handle_focus_follows_mouse): a held button means a
        // drag or drag and drop, which must not move the focus and scroll the view
        queryPointerButtons(buttons => {
            // the answer comes later: the pointer may have moved on, or a warp / the overview may have taken over
            if (buttons === 0 && !overviewActive() && window !== Workspace.activeWindow &&
                FocusFollowsMouse.topWindowAt(Workspace.cursorPos) === window) {
                activateWindow(window, "focus-follows-mouse");
            }
        });
    }

    // how far the view has to scroll to show the whole window, in percent of the screen width
    private static scrollAmount(window: KwinClient) {
        const area = Workspace.clientArea(ClientAreaOption.PlacementArea, window.output, Workspace.currentDesktop);
        const g = window.frameGeometry;
        const left = Math.max(0, area.x - g.x);
        const right = Math.max(0, g.x + g.width - (area.x + area.width));
        return 100 * Math.max(left, right) / area.width;
    }

    private static popupOpen() {
        for (const window of Workspace.windows) {
            if (!window.minimized && (window.appletPopup || window.resourceClass === "org.kde.krunner")) {
                return true;
            }
        }
        return false;
    }

    private static topWindowAt(point: { x: number, y: number }) {
        // runs for every pointer event: the cheap geometry test comes first, so that only the windows under the
        // pointer pay for the desktops list
        const stack = Workspace.stackingOrder;
        for (let i = stack.length - 1; i >= 0; i--) {
            const window = stack[i];
            const g = window.frameGeometry;
            if (point.x < g.x || point.x >= g.x + g.width || point.y < g.y || point.y >= g.y + g.height) {
                continue;
            }
            if (!window.minimized && (window.desktops.length === 0 || window.desktops.indexOf(Workspace.currentDesktop) >= 0)) {
                return window;
            }
        }
        return null;
    }
}
