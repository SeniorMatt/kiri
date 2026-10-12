// niri's focus-follows-mouse, done by Kiri itself (KWin is set to click-to-focus): hovering a window activates it, but
// not while a Plasma popup (the launcher, the system tray, ...) or KRunner is open, because the popup closes as soon
// as it loses focus, and not while a pointer button is held (niri skips the grab). Like niri, only a change of the window under the pointer activates, and layout animations that
// slide a window under a still pointer do not (cursorPosChanged only fires when the pointer moves).
class FocusFollowsMouse {
    private hover: KwinClient | null = null;
    private readonly signalManager = new SignalManager();

    // `busy` says that the layout is in a swipe or settling after one; `maxScroll` is niri's max-scroll-amount in
    // percent of the screen width (100 or more = no limit)
    constructor(private readonly busy: () => boolean, private readonly maxScroll: number) {
        this.signalManager.connect(Workspace.cursorPosChanged, () => this.onPointerMoved());
    }

    public destroy() {
        this.signalManager.destroy();
    }

    private onPointerMoved() {
        if (overviewActive()) {
            // the pointer is over the overview's tiles, not over the windows below them
            this.hover = null;
            return;
        }
        const window = FocusFollowsMouse.topWindowAt(Workspace.cursorPos);
        if (window === this.hover) {
            return;
        }
        this.hover = window;
        if (window === null || !(window.normalWindow || window.dialog) || window === Workspace.activeWindow) {
            return;
        }
        if (FocusFollowsMouse.popupOpen() || this.busy() || isOverTabIndicator(Workspace.cursorPos.x, Workspace.cursorPos.y)) {
            return;
        }
        if (this.maxScroll < 100 && FocusFollowsMouse.scrollAmount(window) > this.maxScroll) {
            return;
        }
        // niri does nothing while the pointer is grabbed (handle_focus_follows_mouse): a held button means a
        // drag or drag and drop, which must not move the focus and scroll the view
        queryPointerButtons(buttons => {
            if (buttons === 0 && this.hover === window && window !== Workspace.activeWindow) {
                Workspace.activeWindow = window;
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

    private static topWindowAt(point: Readonly<QmlPoint>) {
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
