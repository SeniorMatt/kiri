import QtQuick 6.0
import QtQml 6.0
import org.kde.kwin 3.0
import org.kde.notification 1.0
import QtCore as QC
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
    property string visualPositions: "{}"
    property string parkedPositions: "{}"
    property string insertHint: "null"
    // JSON for the compiled effect: every appearance setting as the script resolves it (niri import included), the per-window
    // overrides of niri's window rules, and the ids of the windows that ask for attention
    property string decorationsConfig: ""
    property string windowDecorations: "{}"
    property string urgentWindows: "[]"
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
            cornerRadius: qmlBase.ringConfig.tabIndicatorCornerRadius ?? 0
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

    // true while the compiled effect kiri_swipe is loaded: it hands over the raw, uncapped 3-finger swipe,
    // which replaces KWin's handler progress (capped at 200 units) for scrolling
    property bool swipeEffect: false
    // true while the compiled effect kiri_overview (niri's overview) is loaded. The script drives it: a call is a
    // JSON {m: method, a: string argument, n: counter}, and while it is open the script polls it for what happened
    property bool overviewEffect: false
    property string overviewCall: ""
    property bool overviewPolling: false
    property bool overviewPollPending: false
    property double overviewPollSince: 0
    property bool swipePollPending: false
    // the script's calls to kiri_swipe (begin / release / cancel of a raw swipe it paints itself): JSON {m, a, n};
    // swipeVisual is the effect's answer to the last begin: true when it paints this swipe
    property string swipeCall: ""
    property bool swipeVisual: false
    onSwipeCallChanged: {
        if (swipeCall === "") {
            return;
        }
        const call = JSON.parse(swipeCall);
        DBus.SessionBus.asyncCall(
            {
                service: "org.kde.KWin",
                path: "/KiriSwipe",
                iface: "org.kde.kwin.KWin.SwipeEffect",
                member: "command",
                arguments: [new DBus.string(call.a)],
                signature: "(s)",
            },
            (reply) => {
                if (call.m === "begin") {
                    const value = reply && reply.value !== undefined && reply.value !== null && typeof reply.value === "object" && "value" in reply.value ? reply.value.value : reply.value;
                    qmlBase.swipeVisual = value === true;
                }
            },
            (error) => { if (call.m === "begin") { qmlBase.swipeVisual = false; } },
        );
    }
    function checkSwipeEffect() {
        DBus.SessionBus.asyncCall(
            {
                service: "org.kde.KWin",
                path: "/Effects",
                iface: "org.kde.kwin.Effects",
                member: "isEffectLoaded",
                arguments: [new DBus.string("kiri_swipe")],
                signature: "(s)",
            },
            (reply) => {
                const value = reply && reply.value !== undefined && reply.value !== null && typeof reply.value === "object" && "value" in reply.value ? reply.value.value : reply.value;
                qmlBase.swipeEffect = value === true;
            },
            (error) => { qmlBase.swipeEffect = false; },
        );
    }
    function checkOverviewEffect() {
        DBus.SessionBus.asyncCall(
            {
                service: "org.kde.KWin",
                path: "/Effects",
                iface: "org.kde.kwin.Effects",
                member: "isEffectLoaded",
                arguments: [new DBus.string("kiri_overview")],
                signature: "(s)",
            },
            (reply) => {
                const value = reply && reply.value !== undefined && reply.value !== null && typeof reply.value === "object" && "value" in reply.value ? reply.value.value : reply.value;
                const loaded = value === true;
                if (loaded && !qmlBase.overviewEffect) {
                    overviewWarmTimer.restart();
                }
                qmlBase.overviewEffect = loaded;
            },
            (error) => { /* a busy compositor times out: keep what is known, or Meta+O would fall back to Plasma's overview */ },
        );
    }
    // a while (15 s) after the effect has loaded, when the first frames are long shown: it builds its scene once, invisibly.
    // Not at login: the compositor is busy with the splash, the panel and the hand-over from the login screen then
    Timer {
        id: overviewWarmTimer
        interval: 15000
        onTriggered: if (qmlBase.overviewEffect && !qmlBase.overviewPolling) qmlBase.karouselInstance.overviewWarm()
    }
    property int overviewPollErrors: 0
    onOverviewCallChanged: {
        if (overviewCall === "") {
            return;
        }
        const call = JSON.parse(overviewCall);
        DBus.SessionBus.asyncCall(
            {
                service: "org.kde.KWin",
                path: "/KiriOverview",
                iface: "org.kde.kiri.Overview",
                member: call.m,
                arguments: call.a === "" ? [] : [new DBus.string(call.a)],
                signature: call.a === "" ? "()" : "(s)",
            },
            () => {},
            (error) => {},
        );
    }
    function pollOverview() {
        // a reply that never arrives must not stop the polling for good
        if (overviewPollPending && Date.now() - overviewPollSince < 500) {
            return;
        }
        overviewPollPending = true;
        overviewPollSince = Date.now();
        DBus.SessionBus.asyncCall(
            {
                service: "org.kde.KWin",
                path: "/KiriOverview",
                iface: "org.kde.kiri.Overview",
                member: "poll",
                arguments: [],
                signature: "()",
            },
            (reply) => {
                qmlBase.overviewPollPending = false;
                qmlBase.overviewPollErrors = 0;
                const value = reply && reply.value !== undefined && reply.value !== null && typeof reply.value === "object" && "value" in reply.value ? reply.value.value : reply.value;
                if (typeof value === "string") {
                    qmlBase.karouselInstance.overviewPoll(value);
                }
            },
            (error) => {
                qmlBase.overviewPollPending = false;
                // a vanished effect must not leave the script in overview mode (no cursor warps) for ever
                if (++qmlBase.overviewPollErrors >= 25) { qmlBase.overviewPollErrors = 0; qmlBase.overviewPolling = false; }
            },
        );
    }
    Timer {
        interval: 40
        repeat: true
        running: qmlBase.overviewPolling
        onTriggered: qmlBase.pollOverview()
    }

    // Scripts cannot receive calls, so while fingers are on the touchpad the script asks the effect for the
    // swipe events it has seen since the last question. Started by any 3-finger handler below.
    function startSwipePoll() {
        if (swipeEffect) {
            swipeTimer.running = true;
        }
    }
    function pollSwipe() {
        if (swipePollPending) {
            return;
        }
        swipePollPending = true;
        DBus.SessionBus.asyncCall(
            {
                service: "org.kde.KWin",
                path: "/KiriSwipe",
                iface: "org.kde.kwin.KWin.SwipeEffect",
                member: "poll",
                arguments: [],
                signature: "()",
            },
            (reply) => {
                qmlBase.swipePollPending = false;
                const value = reply && reply.value !== undefined && reply.value !== null && typeof reply.value === "object" && "value" in reply.value ? reply.value.value : reply.value;
                if (typeof value !== "string") {
                    return;
                }
                qmlBase.karouselInstance.gestureRaw(value);
                if (value.indexOf("\"phase\":\"i\"") !== -1) {
                    swipeTimer.running = false;
                }
            },
            (error) => { qmlBase.swipePollPending = false; swipeTimer.running = false; },
        );
    }
    Timer {
        id: swipeTimer
        interval: 8
        repeat: true
        onTriggered: qmlBase.pollSwipe()
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

    // the compiled effect reads the ring, border and corner settings from kwinrc too
    function reloadDecorationsSettings() {
        DBus.SessionBus.asyncCall(
            {
                service: "org.kde.KWin",
                path: "/KiriDecorations",
                iface: "org.kde.kiri.Decorations",
                member: "reloadSettings",
                arguments: [new DBus.string("")],
                signature: "(s)",
            },
            () => {},
            (error) => {},
        );
    }

    function sendToDecorations(member, json) {
        DBus.SessionBus.asyncCall(
            {
                service: "org.kde.KWin",
                path: "/KiriDecorations",
                iface: "org.kde.kiri.Decorations",
                member: member,
                arguments: [new DBus.string(json)],
                signature: "(s)",
            },
            () => {},
            (error) => {},
        );
    }

    function sendInsertHint() {
        DBus.SessionBus.asyncCall(
            {
                service: "org.kde.KWin",
                path: "/KiriDecorations",
                iface: "org.kde.kiri.Decorations",
                member: "setInsertHint",
                arguments: [new DBus.string(qmlBase.insertHint)],
                signature: "(s)",
            },
            () => {},
            (error) => {},
        );
    }

    // Whether a window is an X11 one, from the compiled effect (scripts cannot tell). Calls callback(false) when the
    // effect is not loaded or does not answer.
    function setDesktopRows(rows) {
        if (!decorationsEffect) {
            return;
        }
        DBus.SessionBus.asyncCall(
            {
                service: "org.kde.KWin",
                path: "/KiriDecorations",
                iface: "org.kde.kiri.Decorations",
                member: "setDesktopRows",
                arguments: [new DBus.string(String(rows))],
                signature: "(s)",
            },
            (reply) => {},
            (error) => {},
        );
    }

    function queryX11Window(id, callback) {
        if (!decorationsEffect) {
            callback(false);
            return;
        }
        DBus.SessionBus.asyncCall(
            {
                service: "org.kde.KWin",
                path: "/KiriDecorations",
                iface: "org.kde.kiri.Decorations",
                member: "isX11Window",
                arguments: [new DBus.string(id)],
                signature: "(s)",
            },
            (reply) => {
                const value = reply && reply.value !== undefined && reply.value !== null && typeof reply.value === "object" && "value" in reply.value ? reply.value.value : reply.value;
                callback(value === true);
            },
            (error) => callback(false),
        );
    }

    // Qt::MouseButtons held right now, from the compiled effect (it sees the input; scripts don't). Calls
    // callback(0) when the effect is not loaded or does not answer.
    function queryPointerButtons(callback) {
        if (!decorationsEffect) {
            callback(0);
            return;
        }
        DBus.SessionBus.asyncCall(
            {
                service: "org.kde.KWin",
                path: "/KiriDecorations",
                iface: "org.kde.kiri.Decorations",
                member: "pointerButtons",
                arguments: [],
                signature: "()",
            },
            (reply) => {
                const value = reply && reply.value !== undefined && reply.value !== null && typeof reply.value === "object" && "value" in reply.value ? reply.value.value : reply.value;
                callback(typeof value === "number" ? value : 0);
            },
            (error) => callback(0),
        );
    }

    // Moves the pointer to (x, y) (niri's warp-mouse-to-focus puts it at an exact place), by the compiled effect: KWin's
    // script API has no way to. Without the effect, or when it does not know the call, the pointer goes to the centre
    // of the focused window (KWin's own MoveMouseToFocus shortcut).
    function warpPointer(x, y) {
        if (!decorationsEffect) {
            moveCursorToFocus.call();
            return;
        }
        DBus.SessionBus.asyncCall(
            {
                service: "org.kde.KWin",
                path: "/KiriDecorations",
                iface: "org.kde.kiri.Decorations",
                member: "warpPointer",
                arguments: [new DBus.string(x + "," + y)],
                signature: "(s)",
            },
            (reply) => {},
            (error) => moveCursorToFocus.call(),
        );
    }

    function sendVisualPositions() {
        DBus.SessionBus.asyncCall(
            {
                service: "org.kde.KWin",
                path: "/KiriDecorations",
                iface: "org.kde.kiri.Decorations",
                member: "setVisualPositions",
                arguments: [new DBus.string(qmlBase.visualPositions)],
                signature: "(s)",
            },
            () => {},
            (error) => {},
        );
    }

    function sendParkedPositions() {
        DBus.SessionBus.asyncCall(
            {
                service: "org.kde.KWin",
                path: "/KiriDecorations",
                iface: "org.kde.kiri.Decorations",
                member: "setParkedPositions",
                arguments: [new DBus.string(qmlBase.parkedPositions)],
                signature: "(s)",
            },
            () => {},
            (error) => {},
        );
    }

    onParkedPositionsChanged: if (decorationsEffect) sendParkedPositions()
    onTabGroupsChanged: if (decorationsEffect) sendTabGroups()
    onVisualPositionsChanged: if (decorationsEffect) sendVisualPositions()
    onInsertHintChanged: if (decorationsEffect) sendInsertHint()
    onDecorationsConfigChanged: if (decorationsEffect && decorationsConfig !== "") sendToDecorations("setConfig", decorationsConfig)
    onWindowDecorationsChanged: if (decorationsEffect) sendToDecorations("setWindowDecorations", windowDecorations)
    onUrgentWindowsChanged: if (decorationsEffect) sendToDecorations("setUrgentWindows", urgentWindows)
    onDecorationsEffectChanged: if (decorationsEffect) {
        sendTabGroups(); sendVisualPositions(); sendParkedPositions();
        if (decorationsConfig !== "") sendToDecorations("setConfig", decorationsConfig);
        sendToDecorations("setWindowDecorations", windowDecorations);
        sendToDecorations("setUrgentWindows", urgentWindows);
    }

    Timer {
        interval: 3000
        running: true
        repeat: true
        triggeredOnStart: true
        onTriggered: { qmlBase.checkDecorationsEffect(); qmlBase.checkSwipeEffect(); qmlBase.checkOverviewEffect(); }
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

    // Kiri mode: while the script runs, Plasma's own animation effects are unloaded and the kiri_* effects are loaded
    // (at runtime only; kwinrc keeps the user's Plasma settings). Stopping the script reverses it. `kiri-mode`
    // (tools/kiri-mode) does the same from outside and covers a script that was stopped without getting to do it.
    property var unloadedPlasmaEffects: []
    readonly property var plasmaEffects: ["slide", "overview", "kwin4_effect_geometry_change", "fade", "scale", "glide", "maximize"]
    readonly property var kiriEffects: ["kiri_decorations", "kiri_desktop_switch", "kiri_motion", "kiri_swipe", "kiri_overview"]

    function effectCall(member, name, callback) {
        DBus.SessionBus.asyncCall(
            {
                service: "org.kde.KWin",
                path: "/Effects",
                iface: "org.kde.kwin.Effects",
                member: member,
                arguments: [new DBus.string(name)],
                signature: "(s)",
            },
            (reply) => {
                const value = reply && reply.value !== undefined && reply.value !== null && typeof reply.value === "object" && "value" in reply.value ? reply.value.value : reply.value;
                if (callback) { callback(value === true); }
            },
            (error) => { if (callback) { callback(false); } },
        );
    }

    function enterKiriMode() {
        for (const name of plasmaEffects) {
            effectCall("isEffectLoaded", name, (loaded) => {
                if (loaded) {
                    qmlBase.unloadedPlasmaEffects.push(name);
                    qmlBase.effectCall("unloadEffect", name, null);
                }
            });
        }
        for (const name of kiriEffects) {
            effectCall("loadEffect", name, (ok) => {
                // the script effect is only the fallback where the compiled one is not installed
                if (!ok && name === "kiri_motion") {
                    qmlBase.effectCall("loadEffect", "kiri_animations", null);
                }
            });
        }
    }

    function leaveKiriMode() {
        for (const name of kiriEffects.concat(["kiri_animations"])) {
            effectCall("unloadEffect", name, null);
        }
        for (const name of unloadedPlasmaEffects) {
            effectCall("loadEffect", name, null);
        }
        unloadedPlasmaEffects = [];
    }

    // What Kiri keeps of its layout between two runs of the script (Kiri mode off and on again): floating
    // windows, column heights, the focus and the scroll of every desktop. Windows are named by internal id.
    QC.Settings {
        id: stateStore
        category: "KiriState"
        location: QC.StandardPaths.writableLocation(QC.StandardPaths.GenericCacheLocation) + "/kiri-state.conf"
        property string state: ""
    }

    // The keys Kiri gave to KWin's own actions (see syncTwins), so they can be told from the user's and taken back
    QC.Settings {
        id: twinStore
        category: "Twins"
        location: QC.StandardPaths.writableLocation(QC.StandardPaths.GenericConfigLocation) + "/kiri-twins.conf"
        property string given: ""
    }

    // Read only: KWin's own default keys (see kwinDefaultKeys), so Kiri can tell them from keys the user set
    QC.Settings {
        id: kglobalshortcutsrc
        category: "kwin"
        location: QC.StandardPaths.writableLocation(QC.StandardPaths.GenericConfigLocation) + "/kglobalshortcutsrc"
    }

    function saveState() {
        try {
            const json = qmlBase.karouselInstance.saveState();
            if (json !== stateStore.state) {
                stateStore.state = json;
                stateStore.sync();
            }
        } catch (error) {
            console.log("Kiri: could not save the state:", error);
        }
    }

    // in case the script is stopped without a chance to save
    Timer {
        interval: 20000
        repeat: true
        running: true
        onTriggered: qmlBase.saveState()
    }

    Component.onCompleted: {
        qmlBase.karouselInstance = Karousel.init(stateStore.state);
        qmlBase.enterKiriMode();
    }

    Component.onDestruction: {
        qmlBase.saveState();
        qmlBase.karouselInstance.destroy();
        qmlBase.leaveKiriMode();
    }

    // Applying settings without restarting: when kwinrc changes, KWin is asked to re-read it
    // (the same call the KWin Scripts settings page makes), then Kiri compares its settings and
    // rebuilds its layout if they differ. If the file watcher can't be loaded, settings apply on restart only.
    Timer {
        id: reloadTimer
        interval: 700
        onTriggered: {
            qmlBase.karouselInstance.reloadConfig();
            qmlBase.reloadDecorationsSettings();
        }
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
        onActivated: if (!qmlBase.swipeEffect) qmlBase.karouselInstance.gestureScrollFinish(false)
        onCancelled: if (!qmlBase.swipeEffect) qmlBase.karouselInstance.gestureScrollFinish(true)
        onProgressChanged: if (qmlBase.swipeEffect) qmlBase.startSwipePoll(); else qmlBase.karouselInstance.gestureScroll(-progress)
    }

    SwipeGestureHandler {
        direction: SwipeGestureHandler.Direction.Right
        fingerCount: 3
        onActivated: if (!qmlBase.swipeEffect) qmlBase.karouselInstance.gestureScrollFinish(false)
        onCancelled: if (!qmlBase.swipeEffect) qmlBase.karouselInstance.gestureScrollFinish(true)
        onProgressChanged: if (qmlBase.swipeEffect) qmlBase.startSwipePoll(); else qmlBase.karouselInstance.gestureScroll(progress)
    }

    // With desktops in rows, KWin's own vertical swipe (animated by kiri_desktop_switch) already switches desktops,
    // so these only act when there is a single row and KWin's swipe does nothing
    SwipeGestureHandler {
        direction: SwipeGestureHandler.Direction.Up
        fingerCount: 3
        onProgressChanged: qmlBase.startSwipePoll()
        onActivated: if (Workspace.desktopGridHeight <= 1) qmlBase.karouselInstance.gestureSwitchDesktop(1)
    }

    SwipeGestureHandler {
        direction: SwipeGestureHandler.Direction.Down
        fingerCount: 3
        onProgressChanged: qmlBase.startSwipePoll()
        onActivated: if (Workspace.desktopGridHeight <= 1) qmlBase.karouselInstance.gestureSwitchDesktop(-1)
    }

    // 4 fingers up/down: niri's overview gesture. KWin only reports 200 units of progress per handler, so these
    // just start the polling of kiri_swipe, which sees the raw swipe (the script then drives kiri_overview).
    // KWin's own Overview must be off (install.sh does that), it has the same 4-finger binding.
    SwipeGestureHandler {
        direction: SwipeGestureHandler.Direction.Up
        fingerCount: 4
        onProgressChanged: qmlBase.startSwipePoll()
    }

    SwipeGestureHandler {
        direction: SwipeGestureHandler.Direction.Down
        fingerCount: 4
        onProgressChanged: qmlBase.startSwipePoll()
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
