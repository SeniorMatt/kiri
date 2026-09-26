/*
    Kiri overview scene. License: GPL-3.0-or-later.

    Draws niri's overview: every desktop zoomed out and stacked vertically, windows where Kiri placed them (the layout
    JSON comes from the Kiri script through the effect). The geometry follows niri's src/layout/monitor.rs:
      workspace size = view size * zoom, gap = view height * 0.1 * zoom, the active one centred, the backdrop #262626,
      zoom goes from 1 to 0.5 with the open/close spring (run by the effect, `progress`).
    The search field and the wallpaper under each desktop are Plasma's.
*/
import QtQuick
import org.kde.kirigami as Kirigami
import org.kde.kwin as KWinComponents
import org.kde.plasma.extras as PlasmaExtras

FocusScope {
    id: root
    focus: true

    readonly property QtObject effect: KWinComponents.SceneView.effect
    readonly property QtObject targetScreen: KWinComponents.SceneView.screen
    property QtObject currentDesktop: KWinComponents.SceneView.currentDesktop

    // niri constants
    readonly property color backdropColor: Qt.rgba(0.15, 0.15, 0.15, 1)
    readonly property color hintColor: Qt.rgba(127 / 255, 200 / 255, 255 / 255, 128 / 255)
    readonly property color ringColor: "#7fc8ff"
    readonly property real moveThreshold: 256 // layout px of pointer travel (scaled by the zoom)
    readonly property real moveAlpha: 0.75

    property var lay: ({ screen: { x: 0, y: 0, w: 1, h: 1 }, current: 0, active: "", desktops: [] })
    // may overshoot 0..1 a little (niri's rubber band); `pc` is the clamped one
    readonly property real p: effect.progress
    readonly property real pc: Math.max(0, Math.min(1, effect.progress))
    readonly property real zm: 1 - p * (1 - effect.zoom)
    readonly property real wsW: width * zm
    readonly property real wsH: height * zm
    readonly property real gap: height * 0.1 * zm
    readonly property real x0: (width - wsW) / 2
    readonly property bool mine: lay.desktops.length > 0
        && Math.round(targetScreen.geometry.x) === Math.round(lay.screen.x)
        && Math.round(targetScreen.geometry.y) === Math.round(lay.screen.y)
    readonly property string query: effect.searchText.toLowerCase()

    function wsY(i) {
        return (height - wsH) / 2 + (i - effect.wsIndex) * (wsH + gap);
    }
    function offsetOf(did, scroll) {
        const o = effect.viewOffsets[did];
        return o === undefined ? scroll : o;
    }

    // ---- the window model, kept in step with the layout by id so thumbnails are not recreated ----
    ListModel { id: winModel }
    property var modelIndex: ({})

    function flatten(l) {
        const out = [];
        l.desktops.forEach((d, di) => {
            d.cols.forEach((c, ci) => {
                c.wins.forEach((w, wi) => out.push({ wid: w.id, did: d.id, di: di, lscroll: d.scroll,
                    rx: w.x - l.screen.x, ry: w.y - l.screen.y, rw: w.w, rh: w.h, col: ci, row: wi,
                    colw: c.w, floating: false, active: w.id === l.active, title: w.t || "", cls: w.c || "" }));
            });
            (d.floats || []).forEach((w, wi) => out.push({ wid: w.id, did: d.id, di: di, lscroll: d.scroll,
                rx: w.x - l.screen.x, ry: w.y - l.screen.y, rw: w.w, rh: w.h, col: -1, row: wi,
                colw: 0, floating: true, active: w.id === l.active, title: w.t || "", cls: w.c || "" }));
        });
        return out;
    }

    function syncModel() {
        const want = flatten(lay);
        const seen = {};
        want.forEach(w => { seen[w.wid] = true; });
        for (let i = winModel.count - 1; i >= 0; i--) {
            if (!seen[winModel.get(i).wid]) {
                winModel.remove(i);
            }
        }
        const idx = {};
        for (let i = 0; i < winModel.count; i++) {
            idx[winModel.get(i).wid] = i;
        }
        want.forEach(w => {
            if (idx[w.wid] === undefined) {
                winModel.append(w);
            } else {
                winModel.set(idx[w.wid], w);
            }
        });
    }

    function reload() {
        try {
            const l = JSON.parse(effect.layout);
            lay = l;
            syncModel();
        } catch (e) {
            console.warn("kiri overview: bad layout", e);
        }
        dropHold = "";
    }

    Connections {
        target: root.effect
        function onLayoutChanged() { root.reload(); }
    }
    Component.onCompleted: {
        if (effect.layout !== "") {
            reload();
        }
        forceActiveFocus();
    }

    // ---- niri's insert position (the same as the script's ClientManager.insertTarget), in layout space ----
    // `cur` is the pointer in the desktop's unzoomed space relative to the screen; the dragged window is out of the grid
    function insertTarget(d, cur, dragWid) {
        const sx = lay.screen.x, sy = lay.screen.y;
        const gapH = d.gapH, gapV = d.gapV;
        const cols = [];
        let shift = 0;
        d.cols.forEach(c => {
            const wins = c.wins.filter(w => w.id !== dragWid);
            if (wins.length === 0) {
                shift += c.w + gapH;
            } else {
                cols.push({ x: c.x - sx - shift, w: c.w, tab: c.tab, wins: wins });
            }
        });
        const ay = d.area[1] - sy, ah = d.area[3];
        if (cols.length === 0) {
            return { col: 0, tile: -1, rect: null };
        }
        const xs = cols.map(c => c.x - gapH / 2);
        xs.push(cols[cols.length - 1].x + cols[cols.length - 1].w + gapH / 2);
        let closest = 0;
        for (let i = 1; i < xs.length; i++) {
            if (Math.abs(xs[i] - cur.x) < Math.abs(xs[closest] - cur.x)) {
                closest = i;
            }
        }
        let columnIndex = -1;
        for (let i = 0; i < cols.length; i++) {
            if (cur.x >= xs[i]) {
                columnIndex = i;
            }
        }
        let tileGap = null;
        if (columnIndex >= 0 && cur.x < xs[cols.length]) {
            const c = cols[columnIndex];
            if (c.tab) {
                const top = c.wins[0].y - sy - gapV / 2;
                const bottom = c.wins[0].y - sy + c.wins[0].h + gapV / 2;
                tileGap = Math.abs(top - cur.y) <= Math.abs(bottom - cur.y)
                    ? { index: 0, distance: Math.abs(top - cur.y), y: top + gapV / 2 }
                    : { index: 1, distance: Math.abs(bottom - cur.y), y: bottom - gapV / 2 };
            } else {
                let y = ay - gapV / 2;
                for (let j = 0; j <= c.wins.length; j++) {
                    const distance = Math.abs(y - cur.y);
                    if (tileGap === null || distance < tileGap.distance) {
                        tileGap = { index: j, distance: distance, y: y + gapV / 2 };
                    }
                    if (j < c.wins.length) {
                        y += c.wins[j].h + gapV;
                    }
                }
            }
        }
        const columnDistance = Math.abs(xs[closest] - cur.x);
        if (tileGap !== null && columnDistance > tileGap.distance) {
            const c = cols[columnIndex];
            const count = c.tab ? 1 : c.wins.length;
            let h = 150, y = tileGap.y;
            if (tileGap.index === 0) {
                // 150 at the top
            } else if (tileGap.index === count) {
                y = tileGap.y - 150 - gapV;
                if (c.tab) {
                    y = tileGap.y + gapV / 2 - 150;
                }
            } else {
                h = 300;
                y = tileGap.y - gapV / 2 - 150;
            }
            return { col: columnIndex, tile: tileGap.index, rect: { x: c.x, y: y, w: c.w, h: h } };
        }
        let hx = xs[closest] + gapH / 2 - 150 - gapH / 2;
        if (closest === 0) {
            hx = xs[0] + gapH / 2 - 300 - gapH;
        } else if (closest === cols.length) {
            hx = xs[closest] + gapH / 2;
        }
        return { col: closest, tile: -1, rect: { x: hx, y: ay + gapV, w: 300, h: ah - gapV * 2 } };
    }

    // ---- dragging ----
    property string dragWid: ""
    property string dropHold: ""
    property real dragX: 0 // pointer position, root coordinates
    property real dragY: 0
    property var hint: null // { di, rect }

    function desktopAt(y) {
        for (let i = 0; i < lay.desktops.length; i++) {
            if (y >= wsY(i) - gap / 2 && y < wsY(i) + wsH + gap / 2) {
                return i;
            }
        }
        return -1;
    }
    function updateHint() {
        if (dragWid === "") {
            hint = null;
            return;
        }
        const di = desktopAt(dragY);
        if (di < 0) {
            hint = null;
            return;
        }
        const d = lay.desktops[di];
        const shift = d.scroll - offsetOf(d.id, d.scroll); // hint rects are in layout space
        const cur = { x: (dragX - x0) / zm - shift, y: (dragY - wsY(di)) / zm };
        const t = insertTarget(d, cur, dragWid);
        hint = { di: di, did: d.id, col: t.col, tile: t.tile, rect: t.rect, shift: shift };
    }
    onDragXChanged: updateHint()
    onDragYChanged: updateHint()

    // ---- scene ----
    Rectangle {
        anchors.fill: parent
        color: root.backdropColor
        opacity: root.pc
        TapHandler {
            onTapped: root.effect.requestClose()
        }
    }

    Repeater {
        model: root.mine ? desktopModel : null
        delegate: Item {
            id: ws
            required property KWinComponents.VirtualDesktop desktop
            required property int index
            x: root.x0
            y: root.wsY(index)
            width: root.wsW
            height: root.wsH
            visible: y < root.height && y + height > 0

            Kirigami.ShadowedRectangle {
                anchors.fill: parent
                color: "black"
                // niri workspace-shadow: offset 0/10, softness 40, spread 10, #00000050, normalised to 1080 px
                // sized for the open zoom: resizing the shadow every frame of the zoom rebuilds its geometry, the fade
                // with the progress is enough
                shadow.size: 50 * (root.height / 1080) * root.effect.zoom
                shadow.yOffset: 10 * (root.height / 1080) * root.effect.zoom
                shadow.color: Qt.rgba(0, 0, 0, 0x50 / 255 * root.pc)
            }
            KWinComponents.DesktopBackground {
                anchors.fill: parent
                activity: KWinComponents.Workspace.currentActivity
                desktop: ws.desktop
                outputName: root.targetScreen.name
            }
            TapHandler {
                acceptedButtons: Qt.LeftButton
                onTapped: root.effect.activateDesktop(ws.index)
            }
        }
    }

    KWinComponents.VirtualDesktopModel { id: desktopModel }

    // windows
    Repeater {
        model: winModel
        delegate: Item {
            id: tile
            required property string wid
            required property string did
            required property int di
            required property real lscroll
            required property real rx
            required property real ry
            required property real rw
            required property real rh
            required property int col
            required property bool floating
            required property bool active
            required property string title
            required property string cls

            property bool ready: false
            Component.onCompleted: Qt.callLater(() => { ready = true; })
            // layout-driven changes (reflow, resize) animate; zoom and scrolling do not. ax is in content space (the
            // position without the view scroll), so a scroll change (focus moving) never goes through the Behavior: the
            // effect's offset spring moves every tile smoothly instead of the tile jumping and then animating back.
            property real ax: rx + lscroll
            property real ay: ry
            property real aw: rw
            property real ah: rh
            Behavior on ax { enabled: tile.ready; NumberAnimation { duration: 220; easing.type: Easing.OutCubic } }
            Behavior on ay { enabled: tile.ready; NumberAnimation { duration: 220; easing.type: Easing.OutCubic } }
            Behavior on aw { enabled: tile.ready; NumberAnimation { duration: 220; easing.type: Easing.OutCubic } }
            Behavior on ah { enabled: tile.ready; NumberAnimation { duration: 220; easing.type: Easing.OutCubic } }

            readonly property bool dragging: root.dragWid === wid
            readonly property bool held: root.dropHold === wid
            property real offX: 0
            property real offY: 0
            // when a column leaves (a window is dragged out of a single-window column) the columns to its right close up
            property real closeUp: {
                if (root.dragWid === "" || tile.floating) {
                    return 0;
                }
                const d = root.lay.desktops[tile.di];
                let s = 0;
                for (let i = 0; i < d.cols.length; i++) {
                    const c = d.cols[i];
                    if (c.wins.length === 1 && c.wins[0].id === root.dragWid) {
                        return i < tile.col ? -(c.w + d.gapH) : 0;
                    }
                }
                return 0;
            }
            Behavior on closeUp { NumberAnimation { duration: 220; easing.type: Easing.OutCubic } }

            readonly property real shift: -root.offsetOf(did, lscroll)
            x: root.x0 + (ax + shift + closeUp) * root.zm + offX
            y: root.wsY(di) + ay * root.zm + offY
            width: aw * root.zm
            height: ah * root.zm
            z: dragging || held ? 100 : (floating ? 10 : 0)
            opacity: (dragging || held ? root.moveAlpha : 1)
                * (root.query === "" || title.toLowerCase().indexOf(root.query) !== -1 || cls.toLowerCase().indexOf(root.query) !== -1 ? 1 : 0.2)
            visible: root.mine && x < root.width && x + width > 0 && y < root.height && y + height > 0

            KWinComponents.WindowThumbnail {
                anchors.fill: parent
                wId: tile.wid
            }
            Rectangle {
                visible: tile.active && !tile.dragging
                anchors.fill: parent
                anchors.margins: -border.width
                color: "transparent"
                border.width: Math.max(1, 4 * root.zm)
                border.color: root.ringColor
            }

            TapHandler {
                acceptedButtons: Qt.LeftButton
                onTapped: root.effect.activateWindow(tile.wid, tile.did, tile.di)
            }
            DragHandler {
                id: dh
                target: null
                enabled: !tile.floating
                acceptedButtons: Qt.LeftButton
                onTranslationChanged: {
                    if (!active) {
                        return;
                    }
                    const dist = Math.hypot(translation.x, translation.y);
                    const thr = root.moveThreshold * root.effect.zoom;
                    if (root.dragWid === "" && dist >= thr) {
                        root.dragWid = tile.wid;
                    }
                    // rubber band before the window leaves the grid (niri), then it follows the pointer
                    const f = 0.5 + 0.5 * Math.min(1, dist / thr);
                    tile.offX = translation.x * f;
                    tile.offY = translation.y * f;
                    if (root.dragWid === tile.wid) {
                        const sp = root.mapFromItem(null, centroid.scenePosition.x, centroid.scenePosition.y);
                        root.dragX = sp.x;
                        root.dragY = sp.y;
                    }
                }
                onActiveChanged: {
                    if (active) {
                        return;
                    }
                    if (root.dragWid === tile.wid) {
                        const h = root.hint;
                        if (h !== null) {
                            root.dropHold = tile.wid;
                            root.effect.dropWindow(tile.wid, h.did, h.col, h.tile);
                            holdTimer.restart();
                        } else {
                            tile.offX = 0;
                            tile.offY = 0;
                        }
                        root.dragWid = "";
                        root.hint = null;
                    } else {
                        tile.offX = 0;
                        tile.offY = 0;
                    }
                }
            }
            Timer {
                id: holdTimer
                interval: 600
                onTriggered: {
                    if (root.dropHold === tile.wid) {
                        root.dropHold = "";
                    }
                }
            }
            Connections {
                target: root
                function onDropHoldChanged() {
                    if (root.dropHold !== tile.wid && !tile.dragging) {
                        tile.offX = 0;
                        tile.offY = 0;
                    }
                }
            }
        }
    }

    // niri's insert hint
    Rectangle {
        visible: root.hint !== null && root.hint.rect !== null
        color: root.hintColor
        radius: 8 * root.zm
        x: root.hint && root.hint.rect ? root.x0 + (root.hint.rect.x + root.hint.shift) * root.zm : 0
        y: root.hint && root.hint.rect ? root.wsY(root.hint.di) + root.hint.rect.y * root.zm : 0
        width: root.hint && root.hint.rect ? root.hint.rect.w * root.zm : 0
        height: root.hint && root.hint.rect ? root.hint.rect.h * root.zm : 0
        z: 50
    }

    // the panels (docks) fade out as the view zooms out, like in Plasma's overview
    Repeater {
        model: KWinComponents.WindowFilterModel {
            desktop: root.currentDesktop
            screenName: root.targetScreen.name
            windowModel: stackModel
            windowType: KWinComponents.WindowFilterModel.Dock
        }
        KWinComponents.WindowThumbnail {
            visible: !model.window.hidden && opacity > 0
            wId: model.window.internalId
            x: model.window.x - root.targetScreen.geometry.x
            y: model.window.y - root.targetScreen.geometry.y
            z: model.window.stackingOrder
            width: model.window.width
            height: model.window.height
            opacity: 1 - Math.min(1, root.pc * 2)
        }
    }
    KWinComponents.WindowModel { id: stackModel }

    // Plasma's search field: filters (dims) the windows by title and class
    PlasmaExtras.SearchField {
        id: searchField
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.top: parent.top
        anchors.topMargin: Kirigami.Units.largeSpacing * 2
        width: Math.min(parent.width, 20 * Kirigami.Units.gridUnit)
        opacity: root.pc
        visible: opacity > 0
        focus: true
        text: root.effect.searchText
        onTextChanged: root.effect.searchText = text
        z: 200
    }

    // ---- input ----
    property real wheelY: 0
    WheelHandler {
        acceptedDevices: PointerDevice.Mouse | PointerDevice.TouchPad
        onWheel: event => {
            const d = event.pixelDelta.x !== 0 || event.pixelDelta.y !== 0
                ? Qt.point(event.pixelDelta.x, event.pixelDelta.y)
                : Qt.point(event.angleDelta.x / 120 * 60, event.angleDelta.y / 120 * 60);
            const inv = event.inverted ? -1 : 1;
            if (Math.abs(d.x) > Math.abs(d.y)) {
                // horizontal scrolling moves the view of the desktop in the middle, like the 3-finger gesture
                const i = Math.round(root.effect.wsIndex);
                if (i >= 0 && i < root.lay.desktops.length) {
                    root.effect.scrollView(root.lay.desktops[i].id, -inv * d.x / root.zm);
                }
                return;
            }
            root.wheelY += -inv * d.y;
            // one desktop per mouse notch (60 here), or per 100 px of touchpad
            const step = event.pixelDelta.y !== 0 ? 100 : 60;
            while (Math.abs(root.wheelY) >= step) {
                const dir = root.wheelY > 0 ? 1 : -1;
                root.wheelY -= dir * step;
                root.effect.goToDesktop(Math.round(root.effect.wsIndex) + dir);
            }
        }
    }
    // niri: right button drag scrolls the view of the desktop under it
    DragHandler {
        id: rightDrag
        target: null
        acceptedButtons: Qt.RightButton
        property real last: 0
        onActiveChanged: last = 0
        onTranslationChanged: {
            if (!active) {
                return;
            }
            const i = root.desktopAt(centroid.position.y);
            if (i >= 0) {
                root.effect.scrollView(root.lay.desktops[i].id, -(translation.x - last) / root.zm);
            }
            last = translation.x;
        }
    }

    Keys.priority: Keys.BeforeItem
    Keys.onPressed: event => {
        if (event.key === Qt.Key_Escape) {
            if (root.effect.searchText !== "") {
                root.effect.searchText = "";
            } else {
                root.effect.requestClose();
            }
            event.accepted = true;
        } else if (event.key === Qt.Key_O && (event.modifiers & Qt.MetaModifier)) {
            root.effect.requestClose();
            event.accepted = true;
        } else if (event.key === Qt.Key_Up) {
            root.effect.goToDesktop(Math.round(root.effect.wsIndex) - 1);
            event.accepted = true;
        } else if (event.key === Qt.Key_Down) {
            root.effect.goToDesktop(Math.round(root.effect.wsIndex) + 1);
            event.accepted = true;
        } else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
            const a = root.lay.active;
            for (let i = 0; i < winModel.count; i++) {
                const w = winModel.get(i);
                if (w.wid === a && (root.query === "" || w.title.toLowerCase().indexOf(root.query) !== -1)) {
                    root.effect.activateWindow(w.wid, w.did, w.di);
                    break;
                }
            }
            event.accepted = true;
        }
    }
    Keys.forwardTo: [searchField]
}
