import QtQuick 6.0
import QtQuick.Window 6.0 as QtWin
import org.kde.kwin 3.0
import "Panels.js" as Panels

// A rectangular outline drawn around a KWin window, outside of its frame.
// It is a real (frameless, transparent, input-transparent) window that is kept
// just around the target and below every other window. KWin draws it above panels, so the parts that a panel
// above the target covers are left out.
QtWin.Window {
    id: ring

    property var target: null
    property string tag: "0"
    property int ringWidth: 4
    property int inset: 0 // extra distance between the target's frame and the ring
    property color ringColor: "#7fc8ff"
    property bool wanted: true // false hides the ring regardless of the target

    property var kw: null

    // niri draws no ring or border around a window that is full-screen or fills its screen (maximize-window-to-edges);
    // the compiled effect uses the same rule. Bound to the frame geometry, so it is back as soon as the window shrinks.
    readonly property bool fillsScreen: {
        const t = target;
        if (t === null || t.output === null || t.output === undefined) {
            return false;
        }
        const g = t.frameGeometry, o = t.output.geometry;
        if (g.width >= o.width - 0.5 && g.height >= o.height - 0.5) {
            return true;
        }
        // maximized next to a panel: the frame fills the work area, not the screen
        const a = Workspace.clientArea(Workspace.MaximizeArea, t);
        return a.width > 0 && g.width >= a.width - 0.5 && g.height >= a.height - 0.5 && g.x <= a.x + 0.5 && g.y <= a.y + 0.5;
    }

    readonly property bool shown: {
        const t = target;
        if (!wanted || t === null || kw === null || ringWidth <= 0) {
            return false;
        }
        if (!(t.normalWindow || t.dialog) || t.fullScreen || t.minimized || t.move || t.resize || t.deleted || fillsScreen) {
            return false;
        }
        return t.onAllDesktops || t.desktops.indexOf(Workspace.currentDesktop) >= 0;
    }
    readonly property int outset: ringWidth + inset
    readonly property rect ringRect: {
        const g = target !== null ? target.frameGeometry : Qt.rect(0, 0, 0, 0);
        return Qt.rect(g.x - outset, g.y - outset, g.width + 2 * outset, g.height + 2 * outset);
    }

    // what the panel's strut leaves of its screen
    function panelArea(panel) {
        return Workspace.clientArea(Workspace.MaximizeArea, panel);
    }

    // what is left of the window after the panels above the target are taken off
    readonly property var parts: Panels.visibleParts(ringRect.x, ringRect.y, width, height, Panels.panelsAbove(Workspace.stackingOrder, target, panelArea))

    title: "kiri-ring-" + tag
    flags: Qt.FramelessWindowHint | Qt.WindowTransparentForInput | Qt.WindowDoesNotAcceptFocus | Qt.Tool
    color: "transparent"
    x: ringRect.x
    y: ringRect.y
    width: Math.max(1, ringRect.width)
    height: Math.max(1, ringRect.height)

    Repeater {
        model: ring.shown ? ring.parts : []
        Item {
            x: modelData.x
            y: modelData.y
            width: modelData.width
            height: modelData.height
            clip: true
            Rectangle {
                x: -modelData.x
                y: -modelData.y
                width: ring.width
                height: ring.height
                color: "transparent"
                border.width: ring.ringWidth
                border.color: ring.ringColor
            }
        }
    }

    onWantedChanged: wanted ? show() : hide()
    Component.onCompleted: if (wanted) show()

    function attach(w) {
        kw = w;
        w.skipTaskbar = true;
        w.skipPager = true;
        w.skipSwitcher = true;
        w.noBorder = true;
        w.keepBelow = true;
        w.onAllDesktops = true;
    }

    property var lastActive: null

    Connections {
        target: Workspace
        // hiding the ring closes its KWin window and showing it makes a new one, so every window with the ring's title
        // is the ring's window now (not only the first one), or a ring that was hidden once stays unattached for good.
        // KWin adds " <2>" to a title that is already used; "kiri-ring-b1" must not match "kiri-ring-b10".
        function onWindowAdded(w) {
            if (w.caption === ring.title || w.caption.indexOf(ring.title + " <") === 0) {
                ring.attach(w);
            }
        }
        function onWindowRemoved(w) {
            if (w === ring.kw) {
                ring.kw = null;
            }
        }
        function onWindowActivated(w) {
            if (w === null || w !== ring.kw) {
                ring.lastActive = w;
            } else if (ring.lastActive !== null) {
                Workspace.activeWindow = ring.lastActive; // never keep focus on the ring
            }
        }
    }
}
