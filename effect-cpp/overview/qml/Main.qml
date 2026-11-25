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
    opacity: effect.warming ? 0.003 : 1
    enabled: !effect.warming

    readonly property QtObject effect: KWinComponents.SceneView.effect
    readonly property QtObject targetScreen: KWinComponents.SceneView.screen
    property QtObject currentDesktop: KWinComponents.SceneView.currentDesktop
    readonly property string outName: targetScreen ? targetScreen.name : ""
    // this screen's own position among the desktops (each screen has one when the desktops are per screen)
    readonly property real wsIndex: { effect.wsIndex; return effect.wsIndexOf(outName); }

    // niri's output { backdrop-color } wins over the overview's
    readonly property color backdropColor: { effect.backdropColor; return effect.backdropFor(targetScreen ? targetScreen.name : ""); }
    readonly property color hintColor: Qt.rgba(127 / 255, 200 / 255, 255 / 255, 128 / 255)
    readonly property color ringColor: "#7fc8ff"
    readonly property real moveThreshold: 256 // layout px of pointer travel (scaled by the zoom)
    readonly property real moveAlpha: 0.75

    property var lay: ({ screen: { x: 0, y: 0, w: 1, h: 1 }, current: 0, active: "", desktops: [] })
    readonly property real p: effect.progress
    readonly property real pc: Math.max(0, Math.min(1, effect.progress))
    readonly property real zm: 1 - p * (1 - effect.zoom)
    readonly property real wsW: width * zm
    readonly property real wsH: height * zm
    readonly property real gap: height * 0.1 * zm
    readonly property real x0: (width - wsW) / 2
    readonly property bool mine: lay.desktops.length > 0 && targetScreen !== null
        && Math.round(targetScreen.geometry.x) === Math.round(lay.screen.x)
        && Math.round(targetScreen.geometry.y) === Math.round(lay.screen.y)
    readonly property string query: effect.searchText.toLowerCase()

    function wsY(i) {
        return (height - wsH) / 2 + (i - wsIndex) * (wsH + gap);
    }
    function offsetOf(did, scroll) {
        const o = effect.viewOffsets[outName + "/" + did];
        return o === undefined ? scroll : o;
    }

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

    function applyStartRects() {
        const r = effect.startRects;
        for (let i = 0; i < tiles.count; i++) {
            const t = tiles.itemAt(i);
            if (t && r[t.wid] !== undefined) {
                t.startFrom(r[t.wid]);
            }
        }
    }

    function tileOf(wid) {
        for (let i = 0; i < tiles.count; i++) {
            const t = tiles.itemAt(i);
            if (t && t.wid === wid) {
                return t;
            }
        }
        return null;
    }

    function reload() {
        // the dropped window is still where the pointer let go: the offset that keeps it there eases away with the layout's animation
        const held = dropHold !== "" ? tileOf(dropHold) : null;
        const hx = held ? held.x : 0, hy = held ? held.y : 0;
        try {
            let l = JSON.parse(effect.layout);
            if (l.screens) {
                // one layout per screen: this scene shows the one of its own screen
                const g = targetScreen.geometry;
                l = l.screens.find(s => Math.round(s.screen.x) === Math.round(g.x) && Math.round(s.screen.y) === Math.round(g.y))
                    || { screen: { x: 0, y: 0, w: 1, h: 1 }, current: 0, active: "", desktops: [] };
            }
            lay = l;
            syncModel();
        } catch (e) {
            console.warn("kiri overview: bad layout", e);
        }
        if (held && dropPending) {
            held.settleAnim = false;
            held.offX = hx - (held.x - held.offX);
            held.offY = hy - (held.y - held.offY);
            held.settleAnim = true;
            held.offX = 0;
            held.offY = 0;
            dropPending = false;
            holdTimer.interval = 350;
            holdTimer.restart();
        }
    }

    Connections {
        target: root.effect
        function onLayoutChanged() { root.reload(); }
        function onStartRectsChanged() { Qt.callLater(root.applyStartRects); }
        function onClosingChanged() {
            if (!root.effect.closing) {
                root.dragWid = "";
                root.hint = null;
                root.forceActiveFocus();
            }
        }
    }
    Component.onCompleted: {
        if (effect.layout !== "") {
            reload();
            Qt.callLater(applyStartRects);
        }
        forceActiveFocus();
    }

    // the windows of column `c` without the dragged one share the column's height as in niri; the hint and the tiles use these rects
    function filled(d, c, dragWid) {
        const rest = c.wins.filter(w => w.id !== dragWid);
        if (rest.length === c.wins.length || rest.length === 0 || c.tab) {
            return rest;
        }
        const total = rest.reduce((sum, w) => sum + w.h, 0);
        const k = total > 0 ? (d.area[3] - d.gapV * (rest.length - 1)) / total : 1;
        let y = d.area[1];
        return rest.map(w => {
            const r = { id: w.id, x: w.x, y: y, w: w.w, h: w.h * k };
            y += r.h + d.gapV;
            return r;
        });
    }

    // niri's insert position (like ClientManager.insertTarget), in layout space
    function insertTarget(d, cur, dragWid) {
        const sx = lay.screen.x, sy = lay.screen.y;
        const gapH = d.gapH, gapV = d.gapV;
        const cols = [];
        let shift = 0;
        d.cols.forEach(c => {
            const wins = filled(d, c, dragWid);
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

    property string dragWid: ""
    property string dropHold: ""
    property bool dropPending: false
    Timer {
        id: holdTimer
        interval: 700
        onTriggered: {
            const t = root.dropHold !== "" ? root.tileOf(root.dropHold) : null;
            root.dropPending = false;
            root.dropHold = "";
            if (t) {
                t.settleAnim = true;
                t.offX = 0;
                t.offY = 0;
            }
        }
    }
    property bool dragFloating: false
    property real dragX: 0
    property real dragY: 0
    property var hint: null

    function desktopAt(y) {
        for (let i = 0; i < lay.desktops.length; i++) {
            if (y >= wsY(i) - gap / 2 && y < wsY(i) + wsH + gap / 2) {
                return i;
            }
        }
        return -1;
    }
    function updateHint() {
        if (dragWid === "" || (tileOf(dragWid) && tileOf(dragWid).floating)) {
            hint = null;
            return;
        }
        const di = desktopAt(dragY);
        if (di < 0) {
            hint = null;
            return;
        }
        const d = lay.desktops[di];
        const shift = d.scroll - offsetOf(d.id, d.scroll);
        const cur = { x: (dragX - x0) / zm - shift, y: (dragY - wsY(di)) / zm };
        const t = insertTarget(d, cur, dragWid);
        hint = { di: di, did: d.id, col: t.col, tile: t.tile, rect: t.rect, shift: shift };
    }
    onDragXChanged: updateHint()
    onDragYChanged: updateHint()

    Rectangle {
        anchors.fill: parent
        color: root.backdropColor
        opacity: root.pc
        // niri: a click on no desktop and no window does nothing
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
                visible: root.effect.shadowOn
                // niri's workspace-shadow, normalised to 1080 px; sized for the open zoom
                shadow.size: Math.max(0, root.effect.shadowSoftness + root.effect.shadowSpread) * (root.height / 1080) * root.effect.zoom
                shadow.xOffset: root.effect.shadowOffsetX * (root.height / 1080) * root.effect.zoom
                shadow.yOffset: root.effect.shadowOffsetY * (root.height / 1080) * root.effect.zoom
                shadow.color: Qt.rgba(root.effect.shadowColor.r, root.effect.shadowColor.g, root.effect.shadowColor.b, root.effect.shadowColor.a * root.pc)
            }
            KWinComponents.DesktopBackground {
                anchors.fill: parent
                activity: KWinComponents.Workspace.currentActivity
                desktop: ws.desktop
                outputName: root.targetScreen ? root.targetScreen.name : ""
            }
            TapHandler {
                acceptedButtons: Qt.LeftButton
                onTapped: root.effect.activateDesktop(ws.index, root.outName)
            }
        }
    }

    KWinComponents.VirtualDesktopModel { id: desktopModel }

    Repeater {
        id: tiles
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
            // layout-driven changes animate; zoom and scrolling do not, the effect's offset spring moves the tiles on a scroll
            readonly property real lsc: floating ? 0 : lscroll
            property real ax: rx + lsc
            readonly property var fillRect: {
                const wid = root.dragWid !== "" ? root.dragWid : (root.dropPending ? root.dropHold : "");
                if (wid === "" || wid === tile.wid || tile.floating) {
                    return null;
                }
                const d = root.lay.desktops[tile.di];
                for (let i = 0; i < d.cols.length; i++) {
                    const c = d.cols[i];
                    if (c.wins.some(w => w.id === wid) && c.wins.some(w => w.id === tile.wid)) {
                        const f = root.filled(d, c, wid).find(w => w.id === tile.wid);
                        return f ? f : null;
                    }
                }
                return null;
            }
            readonly property real eRy: fillRect ? fillRect.y - root.lay.screen.y : ry
            readonly property real eRh: fillRect ? fillRect.h : rh
            property real ay: eRy
            property real aw: rw
            property real ah: eRh
            Behavior on ax { enabled: tile.ready; NumberAnimation { duration: 220; easing.type: Easing.OutCubic } }
            Behavior on ay { enabled: tile.ready; NumberAnimation { duration: 220; easing.type: Easing.OutCubic } }
            Behavior on aw { enabled: tile.ready; NumberAnimation { duration: 220; easing.type: Easing.OutCubic } }
            Behavior on ah { enabled: tile.ready; NumberAnimation { duration: 220; easing.type: Easing.OutCubic } }

            function startFrom(r) {
                ready = false;
                ax = r.x - root.lay.screen.x + lsc;
                ay = r.y - root.lay.screen.y;
                aw = r.width;
                ah = r.height;
                Qt.callLater(() => {
                    ready = true;
                    ax = Qt.binding(() => tile.rx + tile.lsc);
                    ay = Qt.binding(() => tile.eRy);
                    aw = Qt.binding(() => tile.rw);
                    ah = Qt.binding(() => tile.eRh);
                });
            }

            readonly property bool dragging: root.dragWid === wid
            readonly property bool held: root.dropHold === wid
            property real offX: 0
            property real offY: 0
            property bool settleAnim: false
            Behavior on offX { enabled: tile.settleAnim; NumberAnimation { duration: 220; easing.type: Easing.OutCubic } }
            Behavior on offY { enabled: tile.settleAnim; NumberAnimation { duration: 220; easing.type: Easing.OutCubic } }
            property real closeUp: {
                if ((root.dragWid === "" && !root.dropPending) || tile.floating) {
                    return 0;
                }
                const d = root.lay.desktops[tile.di];
                let s = 0;
                for (let i = 0; i < d.cols.length; i++) {
                    const c = d.cols[i];
                    if (c.wins.length === 1 && c.wins[0].id === (root.dragWid !== "" ? root.dragWid : root.dropHold)) {
                        return i < tile.col ? -(c.w + d.gapH) : 0;
                    }
                }
                return 0;
            }
            Behavior on closeUp { NumberAnimation { duration: 220; easing.type: Easing.OutCubic } }

            readonly property real shift: floating ? 0 : -root.offsetOf(did, lscroll)
            x: root.x0 + (ax + shift + closeUp) * root.zm + offX
            y: root.wsY(di) + ay * root.zm + offY
            width: aw * root.zm
            height: ah * root.zm
            z: dragging || held ? 100 : (floating ? 10 : 0)
            opacity: ((dragging || held) && !floating ? root.moveAlpha : 1)
                * (root.query === "" || title.toLowerCase().indexOf(root.query) !== -1 || cls.toLowerCase().indexOf(root.query) !== -1 ? 1 : 0.2)
            visible: root.mine && x < root.width && x + width > 0 && y < root.height && y + height > 0

            KWinComponents.WindowThumbnail {
                anchors.fill: parent
                wId: tile.wid
            }
            Rectangle {
                // niri: the ring belongs to the focused window and goes with it while it is dragged and dropped
                visible: tile.active || tile.dragging || tile.held
                anchors.fill: parent
                anchors.margins: -border.width
                color: "transparent"
                border.width: Math.max(1, 4 * root.zm)
                border.color: root.ringColor
            }

            TapHandler {
                gesturePolicy: TapHandler.ReleaseWithinBounds
                acceptedButtons: Qt.LeftButton
                onTapped: root.effect.activateWindow(tile.wid, tile.did, tile.di, root.outName)
            }
            DragHandler {
                id: dh
                target: null
                acceptedButtons: Qt.LeftButton
                onTranslationChanged: {
                    if (!active) {
                        return;
                    }
                    const dist = Math.hypot(translation.x, translation.y);
                    const thr = tile.floating ? 0 : root.moveThreshold * root.effect.zoom;
                    tile.settleAnim = false;
                    if (root.dragWid === "" && dist >= thr) {
                        root.dragWid = tile.wid;
                        root.dragFloating = tile.floating;
                    }
                    const f = thr === 0 ? 1 : 0.5 + 0.5 * Math.min(1, dist / thr);
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
                        const fdi = tile.floating ? root.desktopAt(root.dragY) : -1;
                        root.dragWid = "";
                        root.hint = null;
                        if (tile.floating) {
                            if (fdi >= 0) {
                                const fd = root.lay.desktops[fdi];
                                root.dropHold = tile.wid;
                                root.dropPending = true;
                                root.effect.dropFloating(tile.wid, fd.id,
                                    (tile.x - root.x0) / root.zm + root.lay.screen.x,
                                    (tile.y - root.wsY(fdi)) / root.zm + root.lay.screen.y, root.outName);
                                holdTimer.interval = 700;
                                holdTimer.restart();
                            } else {
                                tile.settleAnim = true;
                                tile.offX = 0;
                                tile.offY = 0;
                            }
                        } else if (h !== null) {
                            root.dropHold = tile.wid;
                            root.dropPending = true;
                            root.effect.dropWindow(tile.wid, h.did, h.col, h.tile, root.outName);
                            holdTimer.interval = 700;
                            holdTimer.restart();
                        } else {
                            tile.settleAnim = true;
                            tile.offX = 0;
                            tile.offY = 0;
                        }
                    } else {
                        tile.offX = 0;
                        tile.offY = 0;
                    }
                }
            }
        }
    }

    // niri's dnd-edge-view-scroll and dnd-edge-workspace-switch: near the left/right edge the view scrolls, near the top/bottom the desktops move
    Timer {
        id: dndEdge
        interval: 16
        repeat: true
        running: root.dragWid !== ""
        property real last: 0
        property real viewSince: 0
        property real wsSince: 0
        onRunningChanged: {
            last = Date.now();
            viewSince = 0;
            wsSince = 0;
            if (!running) {
                root.effect.dndEdgeEnd(root.outName);
            }
        }
        onTriggered: {
            const t = Date.now();
            const dt = (t - last) / 1000;
            last = t;
            const o = root.effect.dnd;
            const speed = 1 / root.zm;
            let moved = false;
            {
                const h = root.height;
                const strip = root.wsW;
                const x = root.dragX - root.x0;
                const y = Math.max(0, Math.min(h, root.dragY));
                const trig = Math.max(0, Math.min(o.wsHeight, h / 2));
                let d = 0;
                if (x < 0 || x >= strip) {
                    d = 0;
                } else if (y < trig) {
                    d = -(trig - y);
                } else if (h - y < trig) {
                    d = trig - (h - y);
                }
                d = trig < 0.01 ? 0 : d / trig * speed;
                if (d === 0) {
                    wsSince = 0;
                } else {
                    if (wsSince === 0) {
                        wsSince = t;
                    }
                    moved = true;
                    if (t - wsSince >= o.wsDelay) {
                        root.effect.dndEdgeWorkspace(d * dt * o.wsSpeed / 1500, root.outName);
                    }
                }
            }
            const di = root.desktopAt(root.dragY);
            if (!root.dragFloating && di >= 0) {
                const w = root.width;
                const x = Math.max(0, Math.min(w, root.dragX));
                const trig = Math.max(0, Math.min(o.viewWidth, w / 2));
                let d = 0;
                if (x < trig) {
                    d = -(trig - x);
                } else if (w - x < trig) {
                    d = trig - (w - x);
                }
                d = trig < 0.01 ? 0 : d / trig * speed;
                if (d === 0) {
                    viewSince = 0;
                } else {
                    if (viewSince === 0) {
                        viewSince = t;
                    }
                    if (t - viewSince >= o.viewDelay) {
                        root.effect.scrollView(root.lay.desktops[di].id, d * dt * o.viewSpeed, root.outName);
                        root.updateHint();
                    }
                }
            }
        }
    }

    // niri's DnD hold: a drag-and-drop from another application held for 750 ms over a window activates it, over a desktop switches to it; the pointer is polled because KWin sends no pointer events
    Timer {
        id: dndHold
        interval: 50
        repeat: true
        running: root.mine && root.effect.seatDrag && !root.effect.closing && root.dragWid === ""
        property string target: ""
        property real since: 0
        onRunningChanged: target = ""
        onTriggered: {
            const g = root.targetScreen.geometry;
            const c = root.effect.cursorPosition();
            const px = c.x - g.x;
            const py = c.y - g.y;
            if (px < 0 || py < 0 || px >= root.width || py >= root.height) {
                target = "";
                return;
            }
            let hit = null;
            for (let i = 0; i < tiles.count; i++) {
                const t = tiles.itemAt(i);
                if (t && t.visible && px >= t.x && px < t.x + t.width && py >= t.y && py < t.y + t.height
                    && (hit === null || t.z >= hit.z)) {
                    hit = t;
                }
            }
            let key = "";
            if (hit !== null) {
                key = "w" + hit.wid;
            } else {
                const di = root.desktopAt(py);
                if (di >= 0 && px >= root.x0 && px < root.x0 + root.wsW
                    && py >= root.wsY(di) && py < root.wsY(di) + root.wsH) {
                    key = "d" + di;
                }
            }
            if (key === "") {
                target = "";
                return;
            }
            const t = Date.now();
            if (key !== target) {
                target = key;
                since = t;
            } else if (t - since >= 750) {
                target = "";
                if (hit !== null) {
                    root.effect.activateWindow(hit.wid, hit.did, hit.di, root.outName);
                } else {
                    root.effect.activateDesktop(root.desktopAt(py), root.outName);
                }
            }
        }
    }

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

    Repeater {
        model: KWinComponents.WindowFilterModel {
            desktop: root.currentDesktop
            screenName: root.targetScreen ? root.targetScreen.name : ""
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

    property real wheelY: 0
    property real wheelX: 0
    property real wheelLast: 0
    // niri: the wheel steps the desktops (50 ms cooldown), Shift+wheel and the horizontal wheel focus columns; touchpad scrolling is the overview scroll swipe
    WheelHandler {
        acceptedDevices: PointerDevice.Mouse | PointerDevice.TouchPad
        onWheel: event => {
            const inv = event.inverted ? -1 : 1;
            const mods = event.modifiers & ~Qt.KeypadModifier;
            const under = root.desktopAt(point.position.y);
            const underId = under >= 0 ? root.lay.desktops[under].id : "";
            if (event.pixelDelta.x !== 0 || event.pixelDelta.y !== 0) {
                if (mods === Qt.NoModifier && underId !== "") {
                    root.effect.touchpadScroll(-inv * event.pixelDelta.x * root.width / 1200, -inv * event.pixelDelta.y, underId, root.outName);
                }
                return;
            }
            if (mods !== Qt.NoModifier && mods !== Qt.ShiftModifier) {
                return;
            }
            let vertical = -inv * event.angleDelta.y, horizontal = inv * event.angleDelta.x;
            if (mods === Qt.ShiftModifier) {
                horizontal = vertical !== 0 ? vertical : -horizontal;
                vertical = 0;
            }
            root.wheelY += vertical;
            root.wheelX += horizontal;
            while (Math.abs(root.wheelY) >= 120) {
                const dir = root.wheelY > 0 ? 1 : -1;
                root.wheelY -= dir * 120;
                const t = Date.now();
                if (t - root.wheelLast >= 50) {
                    root.wheelLast = t;
                    root.effect.stepDesktop(dir, root.outName);
                }
            }
            while (Math.abs(root.wheelX) >= 120) {
                const dir = root.wheelX > 0 ? 1 : -1;
                root.wheelX -= dir * 120;
                if (underId !== "") {
                    root.effect.focusColumn(underId, dir, root.outName);
                }
            }
        }
    }
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
                root.effect.scrollView(root.lay.desktops[i].id, -(translation.x - last) / root.zm, root.outName);
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
        } else if (event.key === Qt.Key_Left && (event.modifiers & ~Qt.KeypadModifier) === Qt.NoModifier) {
            root.effect.invokeKiriAction("focus-left");
            event.accepted = true;
        } else if (event.key === Qt.Key_Right && (event.modifiers & ~Qt.KeypadModifier) === Qt.NoModifier) {
            root.effect.invokeKiriAction("focus-right");
            event.accepted = true;
        } else if (event.key === Qt.Key_Up && (event.modifiers & ~Qt.KeypadModifier) === Qt.NoModifier) {
            root.effect.invokeKiriAction("focus-window-or-desktop-up");
            event.accepted = true;
        } else if (event.key === Qt.Key_Down && (event.modifiers & ~Qt.KeypadModifier) === Qt.NoModifier) {
            root.effect.invokeKiriAction("focus-window-or-desktop-down");
            event.accepted = true;
        } else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
            const a = root.lay.active;
            for (let i = 0; i < winModel.count; i++) {
                const w = winModel.get(i);
                if (w.wid === a && (root.query === "" || w.title.toLowerCase().indexOf(root.query) !== -1)) {
                    root.effect.activateWindow(w.wid, w.did, w.di, root.outName);
                    break;
                }
            }
            event.accepted = true;
        }
    }
    Keys.forwardTo: [searchField]
}
