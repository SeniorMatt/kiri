// declared before the functions that use them: QML warns about a variable used above its declaration
const tabIndicatorsByDesktop = new Map<any, TabIndicator[]>();
let lastWarpTime = 0;

function loadConfig(): Config {
    const config: any = {};
    for (const entry of getConfigDef()) {
        config[entry.name] = KWin.readConfig(entry.name, entry.default);
    }
    config.shortcutKeys = readShortcutKeys(name => KWin.readConfig(name, ""));
    NiriImport.apply(config);
    return config;
}

function setRingConfig(config: Config) {
    if (typeof qmlBase === "undefined") {
        return; // tests
    }
    (qmlBase as any).ringConfig = {
        cornerRadius: config.cornerRadius,
        focusRingEnabled: config.focusRingEnabled,
        focusRingWidth: config.focusRingWidth,
        focusRingActiveColor: config.focusRingActiveColor,
        focusRingInactiveColor: config.focusRingInactiveColor,
        borderEnabled: config.borderEnabled,
        borderWidth: config.borderWidth,
        borderActiveColor: config.borderActiveColor,
        borderInactiveColor: config.borderInactiveColor,
        tabIndicatorEnabled: config.tabIndicatorEnabled,
        tabIndicatorHideWhenSingleTab: config.tabIndicatorHideWhenSingleTab,
        tabIndicatorActiveColor: config.focusRingActiveColor,
        tabIndicatorInactiveColor: config.focusRingInactiveColor,
    };
}

// geometry of the current desktop's tab indicators, drawn by main.qml
interface TabIndicator {
    x: number;
    y: number;
    width: number;
    height: number;
    vertical: boolean;
    count: number;
    active: number;
    windows: string[]; // internal ids, in tab order
}

let lastTabIndicatorsJson = "[]";
// niri does not focus a window the pointer reaches over the tab indicator
function isOverTabIndicator(x: number, y: number) {
    let over = false;
    tabIndicatorsByDesktop.forEach(list => {
        for (const indicator of list) {
            if (x >= indicator.x && x < indicator.x + indicator.width && y >= indicator.y && y < indicator.y + indicator.height) {
                over = true;
            }
        }
    });
    return over;
}

let lastTabGroupsJson = "[]";

// `tabIndicators` (this desktop's, for the script's own fallback windows) and `tabGroups` (every desktop's, as
// JSON, for the compiled effect, which paints them with the windows and so also while desktops switch)
function publishTabIndicators(owner: any, indicators: TabIndicator[], isCurrent = true) {
    if (typeof qmlBase === "undefined") {
        return; // tests
    }
    if (indicators.length > 0) {
        tabIndicatorsByDesktop.set(owner, indicators);
    } else {
        tabIndicatorsByDesktop.delete(owner);
    }
    if (isCurrent) {
        const json = JSON.stringify(indicators);
        if (json !== lastTabIndicatorsJson) {
            lastTabIndicatorsJson = json;
            (qmlBase as any).tabIndicators = indicators;
        }
    }
    const groups: { windows: string[]; active: number }[] = [];
    tabIndicatorsByDesktop.forEach(list => {
        for (const indicator of list) {
            groups.push({ windows: indicator.windows, active: indicator.active });
        }
    });
    const groupsJson = JSON.stringify(groups);
    if (groupsJson !== lastTabGroupsJson) {
        lastTabGroupsJson = groupsJson;
        (qmlBase as any).tabGroups = groupsJson;
    }
}

// Where Kiri wants a window painted while KWin's own interactive resize owns its real geometry (id -> [x, y]).
// The compiled effect paints the window there; the real geometry is set when the resize is over.
const visualPositions = new Map<string, [number, number]>();
let lastVisualPositionsJson = "{}";

// Where Kiri wants a full-screen X11 window painted while its real geometry is parked in the bottom-right corner of the
// screen (id -> [x, y]); see ClientWrapper.place. A window that is full-screen is quite content with its place at
// the screen's corner, but it is not with a place where its top-left corner is outside of the screen.
const parkedPositions = new Map<string, [number, number]>();
let lastParkedPositionsJson = "{}";

// the compiled effect paints parked windows; without it they must stay where they are
function canParkWindows() {
    return typeof qmlBase === "undefined" || (qmlBase as any).decorationsEffect === true;
}

function setParkedPosition(id: string, position: [number, number] | null) {
    const old = parkedPositions.get(id);
    if (position === null ? old === undefined : (old !== undefined && old[0] === position[0] && old[1] === position[1])) {
        return;
    }
    if (position === null) {
        parkedPositions.delete(id);
    } else {
        parkedPositions.set(id, position);
    }
    if (typeof qmlBase === "undefined") {
        return; // tests
    }
    const obj: Record<string, [number, number]> = {};
    parkedPositions.forEach((v, k) => { obj[k] = v; });
    const json = JSON.stringify(obj);
    if (json !== lastParkedPositionsJson) {
        lastParkedPositionsJson = json;
        (qmlBase as any).parkedPositions = json;
    }
}

function setVisualPosition(id: string, position: [number, number] | null) {
    const old = visualPositions.get(id);
    if (position === null ? old === undefined : (old !== undefined && old[0] === position[0] && old[1] === position[1])) {
        return;
    }
    if (position === null) {
        visualPositions.delete(id);
    } else {
        visualPositions.set(id, position);
    }
    if (typeof qmlBase === "undefined") {
        return; // tests
    }
    const obj: Record<string, [number, number]> = {};
    visualPositions.forEach((v, k) => { obj[k] = v; });
    const json = JSON.stringify(obj);
    if (json !== lastVisualPositionsJson) {
        lastVisualPositionsJson = json;
        (qmlBase as any).visualPositions = json;
    }
}

// niri's insert hint while a window is dragged: the screen rectangle (null = none) the compiled effect draws
let lastInsertHintJson = "null";

function setInsertHint(rect: { x: number, y: number, width: number, height: number } | null, windowId = "") {
    if (typeof qmlBase === "undefined") {
        return; // tests
    }
    const json = rect === null ? "null" : JSON.stringify({
        r: [Math.round(rect.x), Math.round(rect.y), Math.round(rect.width), Math.round(rect.height)],
        w: windowId, // the dragged window, so the effect draws the hint under it
    });
    if (json !== lastInsertHintJson) {
        lastInsertHintJson = json;
        (qmlBase as any).insertHint = json;
    }
}

// The compiled effect kiri_overview (niri's overview) is driven through main.qml: a call is a JSON
// {m: method, a: argument, n: counter}, answers come back through Kiri.overviewPoll()
let overviewCallSeq = 0;
const overviewCalls: { member: string, arg: string }[] = []; // what tests look at
let overviewPollingFlag = false;

// The compiled effect kiri_swipe paints a raw swipe itself (see SwipeEffect.h): the script tells it how the swipe
// scrolls (begin) and settles (release), and it shifts the windows from where the layout has put them to where
// the fingers (and then the spring) say they belong. A call is a JSON {m: method, a: JSON argument, n: counter}.
let swipeCallSeq = 0;
const swipeCalls: { member: string, arg: string }[] = []; // what tests look at
let swipeVisualForTests = true;

function setSwipeVisualForTests(on: boolean) {
    swipeVisualForTests = on;
}

// true when the effect has taken this swipe over (it answers begin with true)
function swipeVisualActive() {
    return typeof qmlBase === "undefined" ? swipeVisualForTests : (qmlBase as any).swipeVisual === true;
}

function swipeCall(member: string, arg: object) {
    if (typeof qmlBase === "undefined") {
        swipeCalls.push({ member: member, arg: JSON.stringify(arg) });
        if (swipeCalls.length > 200) {
            swipeCalls.shift();
        }
        return;
    }
    (qmlBase as any).swipeCall = JSON.stringify({ m: member, a: JSON.stringify(Object.assign({ m: member }, arg)), n: ++swipeCallSeq });
}

function overviewEffectLoaded() {
    return typeof qmlBase === "undefined" ? true : (qmlBase as any).overviewEffect === true;
}

// true from the moment the overview is asked to open until it is closed again (the polling runs for that long):
// the pointer is not warped to the focus and does not give the focus away then
function overviewActive() {
    return typeof qmlBase === "undefined" ? overviewPollingFlag : (qmlBase as any).overviewPolling === true;
}

// moves the pointer to the focused window (KWin's MoveMouseToFocus), except while the overview is up: it would move
// the pointer under the overview's own tiles
function warpCursorToFocus() {
    if (!overviewActive()) {
        lastWarpTime = Date.now();
        moveCursorToFocus.call();
    }
}

// true when a pointer move at `pos` is (most likely) the echo of our own warp: shortly after one, and onto the
// focused window. niri's warp-mouse-to-focus does not run focus-follows-mouse, so such a move must not pick the
// window under the pointer (a floating window above the focus would take the focus away again)
function recentlyWarped(pos: Readonly<QmlPoint>) {
    const active = Workspace.activeWindow;
    if (Date.now() - lastWarpTime > 200 || active === null) {
        return false;
    }
    const g = active.frameGeometry;
    return pos.x >= g.x && pos.x < g.x + g.width && pos.y >= g.y && pos.y < g.y + g.height;
}

function overviewCall(member: string, arg: string) {
    if (typeof qmlBase === "undefined") {
        overviewCalls.push({ member: member, arg: arg });
        if (overviewCalls.length > 200) {
            overviewCalls.shift();
        }
        return;
    }
    (qmlBase as any).overviewCall = JSON.stringify({ m: member, a: arg, n: ++overviewCallSeq });
}

function setOverviewPolling(polling: boolean) {
    overviewPollingFlag = polling;
    if (typeof qmlBase !== "undefined") {
        (qmlBase as any).overviewPolling = polling;
    }
}

// Puts every desktop in its own row of KWin's desktop grid (through the compiled effect; the script API can't)
function setDesktopRows(rows: number) {
    if (typeof qmlBase === "undefined") {
        return; // tests
    }
    (qmlBase as any).setDesktopRows(rows);
}

// Calls `callback` with the pointer buttons that are held now (Qt::MouseButtons bits). Scripts can't see them, so the compiled
// effect is asked, which takes a moment; without the effect nothing is known and no button counts as held.
function queryPointerButtons(callback: (buttons: number) => void) {
    if (typeof qmlBase === "undefined") {
        callback(0); // tests
        return;
    }
    (qmlBase as any).queryPointerButtons(callback);
}

// Calls `callback` with whether the window is an X11 (Xwayland) window. KWin's script API does not say, so the compiled
// effect is asked; without it nothing is known and the window counts as a Wayland one.
function queryX11Window(kwinClient: KwinClient, callback: (x11: boolean) => void) {
    if (typeof qmlBase === "undefined") {
        callback((kwinClient as any).x11 !== false); // tests
        return;
    }
    // the script engine names a window object after its C++ class ("KWin::X11Window(0x...)"), which needs no effect
    if (/X11Window/.test(String(kwinClient))) {
        callback(true);
        return;
    }
    (qmlBase as any).queryX11Window(String(kwinClient.internalId), callback);
}

// Owns the World and rebuilds it when the settings change
class Kiri {
    private world: World;
    private configJson: string;
    private focusFollowsMouse: FocusFollowsMouse | null;

    constructor(private config: Config, world = new World(config)) {
        setRingConfig(config);
        this.configJson = JSON.stringify(config);
        this.world = world;
        this.focusFollowsMouse = config.focusFollowsMouse ? new FocusFollowsMouse(() => this.world.isScrollBusy(), config.focusFollowsMouseMaxScroll) : null;
    }

    public gestureScroll(amount: number) {
        this.world.gestureScroll(amount);
    }

    public gestureRaw(json: string) {
        this.world.gestureRaw(json);
    }

    public gestureScrollFinish(delayed: boolean) {
        this.world.gestureScrollFinish(delayed);
    }

    public overviewWarm() {
        this.world.overviewWarm();
    }

    public overviewPoll(json: string) {
        this.world.overviewPoll(json);
    }

    public gestureSwitchDesktop(offset: number) {
        this.world.gestureSwitchDesktop(offset);
    }

    // Re-reads the settings and, if any changed, rebuilds the World with the same layout.
    // The shortcuts stay registered in kglobalaccel, only their actions are pointed at the new World.
    public reloadConfig() {
        const config = loadConfig();
        const configJson = JSON.stringify(config);
        if (configJson === this.configJson) {
            return false;
        }
        log("settings changed, reloading");

        const layout = this.world.captureLayout();
        let keyBindings: KeyBindings|null = this.world.releaseKeyBindings();
        if (JSON.stringify(config.shortcutKeys) !== JSON.stringify(this.config.shortcutKeys)) {
            // the keys changed, so register the shortcuts again
            keyBindings.destroy();
            keyBindings = null;
            const removed = Object.keys(this.config.shortcutKeys).filter(name => !(name in config.shortcutKeys));
            KeyBindings.resetToDefaultKeys(removed);
        }
        this.world.destroy();
        try {
            this.world = new World(config, keyBindings, layout);
            this.config = config;
            this.configJson = configJson;
            this.focusFollowsMouse?.destroy();
            this.focusFollowsMouse = config.focusFollowsMouse ? new FocusFollowsMouse(() => this.world.isScrollBusy(), config.focusFollowsMouseMaxScroll) : null;
            setRingConfig(config);
        } catch (error: any) {
            log("failed to apply the new settings, going back to the old ones:", error, error.stack);
            this.world = new World(this.config, keyBindings, layout);
        }
        return true;
    }

    public destroy() {
        this.world.destroy();
    }
}
