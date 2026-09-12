import QtQuick 6.0
import QtQml 6.0
import org.kde.kwin 3.0
import org.kde.notification 1.0
import org.kde.plasma.workspace.dbus as DBus
import "../code/main.js" as Karousel

Item {
    id: qmlBase

    property var karouselInstance
    property var ringConfig: ({})
    property var borderRings: ({})
    property int ringCounter: 0
    property var tabIndicators: []
    // JSON of every desktop's tabbed columns, for the compiled effect that paints their indicators
    property string tabGroups: "[]"
    // true while the C++ effect kiri_decorations is loaded: it paints the ring and borders (and rounds corners)
    // with the window itself, so these QML windows are only the fallback
    property bool decorationsEffect: false
    // with borders on, the focus ring goes around the border, like in niri
    readonly property int ringInset: ringConfig.borderEnabled === true ? (ringConfig.borderWidth ?? 0) : 0

    Instantiator {
        model: qmlBase.ringConfig.tabIndicatorEnabled === true && !qmlBase.decorationsEffect ? qmlBase.tabIndicators.length : 0
        delegate: TabIndicator {
            tag: String(index)
            info: qmlBase.tabIndicators[index] ?? ({ x: 0, y: 0, width: 1, height: 1, vertical: true, count: 0, active: 0 })
            wanted: info.count >= 1 && (info.count >= 2 || qmlBase.ringConfig.tabIndicatorHideWhenSingleTab !== true)
            activeColor: qmlBase.ringConfig.tabIndicatorActiveColor
            inactiveColor: qmlBase.ringConfig.tabIndicatorInactiveColor
        }
    }

    Ring {
        id: focusRing
        tag: "focus"
        wanted: qmlBase.ringConfig.focusRingEnabled === true && !qmlBase.decorationsEffect
        target: Workspace.activeWindow
        ringWidth: qmlBase.ringConfig.focusRingWidth ?? 0
        inset: qmlBase.ringInset
        ringColor: qmlBase.ringConfig.focusRingActiveColor
    }

    Component {
        id: borderRingComponent
        Ring {
            property bool isActive: target === Workspace.activeWindow
            // a hidden tab sits right under the active one, its border would cover the active border
            readonly property bool coveredByActive: {
                const a = Workspace.activeWindow;
                if (isActive || a === null || target === null) {
                    return false;
                }
                const g = target.frameGeometry, ag = a.frameGeometry;
                return g.x === ag.x && g.y === ag.y && g.width === ag.width && g.height === ag.height;
            }
            wanted: qmlBase.ringConfig.borderEnabled === true && !coveredByActive && !qmlBase.decorationsEffect
            ringWidth: qmlBase.ringConfig.borderWidth ?? 0
            ringColor: isActive ? qmlBase.ringConfig.borderActiveColor : qmlBase.ringConfig.borderInactiveColor
        }
    }

    property int decorationsChecks: 0
    // the compiled effect not being there is normal on a script-only install; a KWin update can also break it
    function noteDecorationsEffect(loaded) {
        decorationsChecks++;
        if (decorationsChecks === 3 && !loaded) {
            console.warn("Kiri: the compiled effect kiri_decorations is not loaded, drawing the rings with the script. If you installed it, a KWin update may have broken it: run install.sh again.");
        }
    }

    function checkDecorationsEffect() {
        DBus.SessionBus.asyncCall(
            {
                service: "org.kde.KWin",
                path: "/Effects",
                iface: "org.kde.kwin.Effects",
                member: "isEffectLoaded",
                arguments: [new DBus.string("kiri_decorations")],
                signature: "(s)",
            },
            (reply) => {
                const value = reply && reply.value !== undefined && reply.value !== null && typeof reply.value === "object" && "value" in reply.value ? reply.value.value : reply.value;
                qmlBase.decorationsEffect = value === true;
                qmlBase.noteDecorationsEffect(value === true);
                if (value === true) {
                    qmlBase.sendTabGroups(); // also after the effect was reloaded
                }
            },
            (error) => { qmlBase.decorationsEffect = false; },
        );
    }

    function sendTabGroups() {
        DBus.SessionBus.asyncCall(
            {
                service: "org.kde.KWin",
                path: "/KiriDecorations",
                iface: "org.kde.kiri.Decorations",
                member: "setTabGroups",
                arguments: [new DBus.string(qmlBase.tabGroups)],
                signature: "(s)",
            },
            () => {},
            (error) => {},
        );
    }

    onTabGroupsChanged: if (decorationsEffect) sendTabGroups()
    onDecorationsEffectChanged: if (decorationsEffect) sendTabGroups()

    Timer {
        interval: 3000
        running: true
        repeat: true
        triggeredOnStart: true
        onTriggered: qmlBase.checkDecorationsEffect()
    }

    // borders switched on or off in the settings
    onRingConfigChanged: {
        if (ringConfig.borderEnabled === true) {
            for (const w of Workspace.windows) {
                addBorderRing(w);
            }
        } else {
            for (const id in borderRings) {
                borderRings[id].destroy();
            }
            borderRings = {};
        }
    }

    function addBorderRing(w) {
        if (qmlBase.borderRings[w.internalId] !== undefined || w.caption.indexOf("kiri-ring-") === 0 || !(w.normalWindow || w.dialog)) {
            return;
        }
        qmlBase.ringCounter++;
        qmlBase.borderRings[w.internalId] = borderRingComponent.createObject(qmlBase, {target: w, tag: "b" + qmlBase.ringCounter});
    }

    function removeBorderRing(w) {
        const r = qmlBase.borderRings[w.internalId];
        if (r !== undefined) {
            delete qmlBase.borderRings[w.internalId];
            r.destroy();
        }
    }

    Connections {
        target: Workspace
        function onWindowAdded(w) {
            if (qmlBase.ringConfig.borderEnabled === true) {
                qmlBase.addBorderRing(w);
            }
        }
        function onWindowRemoved(w) {
            qmlBase.removeBorderRing(w);
        }
    }

    Component.onCompleted: {
        qmlBase.karouselInstance = Karousel.init();
    }

    Component.onDestruction: {
        qmlBase.karouselInstance.destroy();
    }

    // Applying settings without restarting: when kwinrc changes, KWin is asked to re-read it
    // (the same call the KWin Scripts settings page makes), then Kiri compares its settings and
    // rebuilds its layout if they differ. If the file watcher can't be loaded, settings apply on restart only.
    Timer {
        id: reloadTimer
        interval: 700
        onTriggered: qmlBase.karouselInstance.reloadConfig()
    }

    Loader {
        source: "ConfigWatcher.qml"
        onLoaded: item.changed.connect(qmlBase.onConfigFileChanged)
        onStatusChanged: {
            if (status === Loader.Error) {
                console.log("Kiri: can't watch kwinrc, settings apply after a restart");
            }
        }
    }

    function onConfigFileChanged() {
        DBus.SessionBus.asyncCall(
            {
                service: "org.kde.KWin",
                path: "/Scripting",
                iface: "org.kde.kwin.Scripting",
                member: "start",
                arguments: [],
                signature: "()",
            },
            () => {},
            (error) => console.log("Kiri: asking KWin to re-read its settings failed"),
        );
        reloadTimer.restart();
    }

    Notification {
        id: notificationInvalidTiledDesktops
        componentName: "plasma_workspace"
        eventId: "notification"
        title: "Kiri"
        text: "Your Tiled Desktops regex is malformed, please review your Kiri configuration"
        flags: Notification.Persistent
        urgency: Notification.HighUrgency
    }

    Notification {
        id: notificationInvalidWindowRules
        componentName: "plasma_workspace"
        eventId: "notification"
        title: "Kiri"
        text: "Your Window Rules JSON is malformed, please review your Kiri configuration"
        flags: Notification.Persistent
        urgency: Notification.HighUrgency
    }

    Notification {
        id: notificationInvalidPresetWidths
        componentName: "plasma_workspace"
        eventId: "notification"
        title: "Kiri"
        text: "Your preset widths are malformed, please review your Kiri configuration"
        flags: Notification.Persistent
        urgency: Notification.HighUrgency
    }


    // KWin reports each handler's progress as 0..1 over the first 200 units of finger travel, per direction
    // (no raw deltas, no progress past 1). Both horizontal handlers share one gesture; a change of direction
    // cancels one and starts the other, so `cancelled` ends the gesture only after a short delay.
    SwipeGestureHandler {
        direction: SwipeGestureHandler.Direction.Left
        fingerCount: 3
        onActivated: qmlBase.karouselInstance.gestureScrollFinish(false)
        onCancelled: qmlBase.karouselInstance.gestureScrollFinish(true)
        onProgressChanged: qmlBase.karouselInstance.gestureScroll(-progress)
    }

    SwipeGestureHandler {
        direction: SwipeGestureHandler.Direction.Right
        fingerCount: 3
        onActivated: qmlBase.karouselInstance.gestureScrollFinish(false)
        onCancelled: qmlBase.karouselInstance.gestureScrollFinish(true)
        onProgressChanged: qmlBase.karouselInstance.gestureScroll(progress)
    }

    // With desktops in rows, KWin's own vertical swipe (animated by kiri_desktop_switch) already switches desktops,
    // so these only act when there is a single row and KWin's swipe does nothing
    SwipeGestureHandler {
        direction: SwipeGestureHandler.Direction.Up
        fingerCount: 3
        onActivated: if (Workspace.desktopGridHeight <= 1) qmlBase.karouselInstance.gestureSwitchDesktop(1)
    }

    SwipeGestureHandler {
        direction: SwipeGestureHandler.Direction.Down
        fingerCount: 3
        onActivated: if (Workspace.desktopGridHeight <= 1) qmlBase.karouselInstance.gestureSwitchDesktop(-1)
    }

    KGlobalAccelBridge {
        id: kglobalaccel
    }

    DBusCall {
        id: moveCursorToFocus

        service: "org.kde.kglobalaccel"
        path: "/component/kwin"
        method: "invokeShortcut"
        arguments: ["MoveMouseToFocus"]
    }
}
