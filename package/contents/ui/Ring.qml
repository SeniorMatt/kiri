import QtQuick 6.0
import QtQuick.Window 6.0 as QtWin
import org.kde.kwin 3.0

// A rectangular outline drawn around a KWin window, outside of its frame.
// It is a real (frameless, transparent, input-transparent) window that is kept
// just around the target and below every other window.
QtWin.Window {
    id: ring

    property var target: null
    property string tag: "0"
    property int ringWidth: 4
    property int inset: 0 // extra distance between the target's frame and the ring
    property color ringColor: "#7fc8ff"
    property bool wanted: true // false hides the ring regardless of the target

    property var kw: null

    readonly property bool shown: {
        const t = target;
        if (!wanted || t === null || kw === null || ringWidth <= 0) {
            return false;
        }
        if (!(t.normalWindow || t.dialog) || t.fullScreen || t.minimized || t.move || t.resize || t.deleted) {
            return false;
        }
        return t.onAllDesktops || t.desktops.indexOf(Workspace.currentDesktop) >= 0;
    }
    readonly property int outset: ringWidth + inset
    readonly property rect ringRect: {
        const g = target !== null ? target.frameGeometry : Qt.rect(0, 0, 0, 0);
        return Qt.rect(g.x - outset, g.y - outset, g.width + 2 * outset, g.height + 2 * outset);
    }

    title: "kiri-ring-" + tag
    flags: Qt.FramelessWindowHint | Qt.WindowTransparentForInput | Qt.WindowDoesNotAcceptFocus | Qt.Tool
    color: "transparent"
    x: ringRect.x
    y: ringRect.y
    width: Math.max(1, ringRect.width)
    height: Math.max(1, ringRect.height)

    Rectangle {
        anchors.fill: parent
        color: "transparent"
        border.width: ring.ringWidth
        border.color: ring.ringColor
        visible: ring.shown
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
        function onWindowAdded(w) {
            if (ring.kw === null && w.caption.indexOf(ring.title) === 0) {
                ring.attach(w);
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
