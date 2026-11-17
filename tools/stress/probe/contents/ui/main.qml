// Stress-harness probe, a KWin script. Prints (to the KWin log, which the harness tails):
//   STFT  ...  event-loop stall stats twice a second (a 4 ms timer: how late the main thread ran it)
//   STGEO ...  every geometry change of a normal window, with the wall clock
//   STINV ...  JSON of every window / desktop every 500 ms (STSAME when nothing changed)
// and runs JS the harness writes to /tmp/stwork/cmd.js (needs QML_XHR_ALLOW_FILE_READ=1 in KWin's environment).
import QtQuick
import org.kde.kwin
Item {
    id: root
    property double last: Date.now()
    property double worst: 0
    property int over16: 0
    property int over33: 0
    property int over100: 0
    property int ticks: 0
    property double lastReport: Date.now()
    property double lastDump: 0
    property string lastDumpText: ""
    property string lastCmd: ""
    property int tickN: 0

    Timer { interval: 4; repeat: true; running: true
        onTriggered: {
            const n = Date.now(); const gap = n - last; last = n;
            ticks++; tickN++;
            if (gap > worst) worst = gap;
            if (gap > 16) over16++; if (gap > 33) over33++; if (gap > 100) over100++;
            if (n - lastReport >= 500) {
                console.log("STFT " + n + " ticks=" + ticks + " worst=" + worst + " o16=" + over16 + " o33=" + over33 + " o100=" + over100);
                worst = 0; over16 = 0; over33 = 0; over100 = 0; ticks = 0; lastReport = n;
            }
            if (n - lastDump >= 500) { lastDump = n; dump(n); }
            if (tickN % 3 === 0) pollCmd();
        }
    }
    function dump(n) {
        const out = [];
        for (const w of Workspace.windows) {
            const g = w.frameGeometry;
            out.push({id: String(w.internalId), cap: w.caption, cls: w.resourceClass, x: g.x, y: g.y, w: g.width, h: g.height,
                act: w === Workspace.activeWindow, normal: w.normalWindow, dialog: w.dialog, special: w.specialWindow, dock: w.dock,
                dk: w.desktops.map(d => d.x11DesktopNumber), min: w.minimized, op: w.opacity, fs: w.fullScreen,
                tf: !!w.transientFor, ka: w.keepAbove});
        }
        const ca = Workspace.clientArea(KWin.MaximizeArea, Workspace.activeScreen, Workspace.currentDesktop);
        const s = JSON.stringify({win: out, cur: Workspace.currentDesktop.x11DesktopNumber, nd: Workspace.desktops.length,
            area: [ca.x, ca.y, ca.width, ca.height], stack: Workspace.stackingOrder.map(w => String(w.internalId))});
        if (s === lastDumpText) console.log("STSAME " + n);
        else { lastDumpText = s; console.log("STINV " + s.slice(0, -1) + ',"t":' + n + '}'); }
    }
    function byName(n) { for (const w of Workspace.windows) if (w.caption === n) return w; return null; }
    // repeat(ms, n, fn): fn(i) every ms, n times
    function repeat(ms, n, fn) {
        const t = Qt.createQmlObject('import QtQuick; Timer { property int i: 0; repeat: true; running: true }', root);
        t.interval = ms;
        t.triggered.connect(() => { if (t.i >= n) { t.stop(); t.destroy(); return; } try { fn(t.i); } catch (e) { console.log("STCMDERR " + e); } t.i++; });
    }
    function pollCmd() {
        const x = new XMLHttpRequest();
        x.open("GET", "file:///tmp/stwork/cmd.js", false);
        try { x.send(); } catch (e) { return; }
        const t = x.responseText;
        if (!t || t === lastCmd) return;
        lastCmd = t;
        try { var workspace = Workspace; eval(t); } catch (e) { console.log("STCMDERR " + e); console.log("STCMD done-error"); }
    }
    function watch(w) {
        if (!w || !w.normalWindow) return;
        w.frameGeometryChanged.connect(() => { const g = w.frameGeometry; console.log("STGEO " + Date.now() + " " + w.caption + " " + Math.round(g.x) + "," + Math.round(g.y) + " " + Math.round(g.width) + "x" + Math.round(g.height)); });
    }
    Component.onCompleted: {
        for (const w of Workspace.windows) watch(w);
        Workspace.windowAdded.connect(watch);
    }
}
