import QtQuick 6.0
import QtQuick.Window 6.0 as QtWin
import org.kde.kwin 3.0
import "Panels.js" as Panels

// niri's tab indicator of a tabbed column: a strip beside the column, split into one segment per tab.
// Like Ring, it is a frameless, transparent, input-transparent window that sits below every other window,
// and it leaves out the parts that a panel above the windows covers.
QtWin.Window {
    id: indicator

    property string tag: "0"
    // info.tabs: niri's tab_rects in screen coordinates (the window covers their bounding box, info.x/y/width/height)
    property var info: ({ x: 0, y: 0, width: 1, height: 1, vertical: true, count: 1, active: 0, tabs: [] })
    property real cornerRadius: 0
    property color activeColor: "#7fc8ff"
    property color inactiveColor: "#505050"
    property bool wanted: true

    property var kw: null
    property var lastActive: null

    // what is left of the window after the panels above the windows are taken off
    readonly property var parts: Panels.visibleParts(info.x, info.y, width, height, Panels.panelsAbove(Workspace.stackingOrder, null))

    title: "kiri-ring-tab-" + tag + "#"
    flags: Qt.FramelessWindowHint | Qt.WindowTransparentForInput | Qt.WindowDoesNotAcceptFocus | Qt.Tool
    color: "transparent"
    x: info.x
    y: info.y
    width: Math.max(1, info.width)
    height: Math.max(1, info.height)

    Repeater {
        model: indicator.parts
        Item {
            id: part
            readonly property var area: modelData
            x: area.x
            y: area.y
            width: area.width
            height: area.height
            clip: true
            Repeater {
                model: indicator.info.tabs ?? []
                Rectangle {
                    x: modelData.x - indicator.info.x - part.area.x
                    y: modelData.y - indicator.info.y - part.area.y
                    width: modelData.width
                    height: modelData.height
                    radius: indicator.cornerRadius
                    color: index === indicator.info.active ? indicator.activeColor : indicator.inactiveColor
                }
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
