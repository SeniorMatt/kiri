import QtQuick 6.0
import QtQuick.Window 6.0 as QtWin
import org.kde.kwin 3.0

// niri's tab indicator of a tabbed column: a strip beside the column, split into one segment per tab.
// Like Ring, it is a frameless, transparent, input-transparent window that sits below every other window.
QtWin.Window {
    id: indicator

    property string tag: "0"
    property var info: ({ x: 0, y: 0, width: 1, height: 1, vertical: true, count: 1, active: 0 })
    property color activeColor: "#7fc8ff"
    property color inactiveColor: "#505050"
    property bool wanted: true

    property var kw: null
    property var lastActive: null

    title: "kiri-ring-tab-" + tag + "#"
    flags: Qt.FramelessWindowHint | Qt.WindowTransparentForInput | Qt.WindowDoesNotAcceptFocus | Qt.Tool
    color: "transparent"
    x: info.x
    y: info.y
    width: Math.max(1, info.width)
    height: Math.max(1, info.height)

    Repeater {
        model: indicator.info.count
        Rectangle {
            readonly property real total: indicator.info.vertical ? indicator.height : indicator.width
            readonly property int from: Math.round(index * total / indicator.info.count)
            readonly property int to: Math.round((index + 1) * total / indicator.info.count)
            x: indicator.info.vertical ? 0 : from
            y: indicator.info.vertical ? from : 0
            width: indicator.info.vertical ? indicator.width : to - from
            height: indicator.info.vertical ? to - from : indicator.height
            color: index === indicator.info.active ? indicator.activeColor : indicator.inactiveColor
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

    Connections {
        target: Workspace
        function onWindowAdded(w) {
            if (indicator.kw === null && w.caption === indicator.title) {
                indicator.attach(w);
            }
        }
        function onWindowActivated(w) {
            if (w === null || w !== indicator.kw) {
                indicator.lastActive = w;
            } else if (indicator.lastActive !== null) {
                Workspace.activeWindow = indicator.lastActive; // never keep focus on the indicator
            }
        }
    }
}
