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

// Every appearance setting (corners, focus ring, border, shadow, insert hint, tab indicator, backdrops) and the wheel and
// mouse button binds as the script sees them,
// niri import included, as JSON for the compiled effect. The effect reads kwinrc by itself until the first call.
function decorationsConfig(config: Config) {
    const out: Record<string, any> = {};
    for (const [name, value] of Object.entries(config)) {
        if (/^(cornerRadius|focusRing|border|shadow|insertHint|tabIndicator|fullscreenBackdropColor|backgroundColor|pointerBinds)/.test(name)) {
            out[name] = value;
        }
    }
    return out;
}

// what tests look at: the last JSON handed to the effect
let lastDecorationsConfigJson = "";

function setRingConfig(config: Config) {
    lastDecorationsConfigJson = JSON.stringify(decorationsConfig(config));
    if (typeof qmlBase === "undefined") {
        return; // tests
    }
    (qmlBase as any).decorationsConfig = lastDecorationsConfigJson;
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
        tabIndicatorCornerRadius: config.tabIndicatorCornerRadius,
        // the fallback windows draw solid colours only: the colour of the gradient's start, like niri does for a missing shader
        tabIndicatorActiveColor: config.tabIndicatorActiveColor !== "" ? config.tabIndicatorActiveColor : config.focusRingActiveColor,
        tabIndicatorInactiveColor: config.tabIndicatorInactiveColor !== "" ? config.tabIndicatorInactiveColor : config.focusRingInactiveColor,
    };
}

// Per-window overrides of the appearance settings, for niri's window rules (`focus-ring`, `border`, `shadow`, `tab-indicator`
// and `geometry-corner-radius` inside a `window-rule`). Whoever matches the rules (rules/WindowRuleEnforcer) calls
// setWindowDecorations(id, rule) with a rule that holds only the fields the window rule sets, or null to clear it:
//   { cornerRadius: 12,
//     focusRing: { enabled: false, width: 2, activeColor: "#f00", activeGradient: "from=#f00 to=#00f angle=45", ... },
//     border:    { enabled, width, activeColor, inactiveColor, urgentColor, activeGradient, inactiveGradient, urgentGradient },
//     shadow:    { enabled, offsetX, offsetY, softness, spread, drawBehindWindow, color, inactiveColor },
//     tabIndicator: { activeColor, inactiveColor, urgentColor, activeGradient, inactiveGradient, urgentGradient } }
// Colours and gradients are strings in the format of the config keys (niri's CSS colours; gradients as niri's properties,
// e.g. "from=#80c7ff to=#ffc87f angle=45 relative-to=workspace-view in=oklch longer hue"). A field that is missing keeps
// the global setting. The effect (DecorationsEffect.cpp, D-Bus `setWindowDecorations`) merges it over the settings per window.
interface WindowDecorationRule {
    cornerRadius?: number;
    focusRing?: { enabled?: boolean, width?: number, activeColor?: string, inactiveColor?: string, urgentColor?: string, activeGradient?: string, inactiveGradient?: string, urgentGradient?: string };
    border?: { enabled?: boolean, width?: number, activeColor?: string, inactiveColor?: string, urgentColor?: string, activeGradient?: string, inactiveGradient?: string, urgentGradient?: string };
    shadow?: { enabled?: boolean, offsetX?: number, offsetY?: number, softness?: number, spread?: number, drawBehindWindow?: boolean, color?: string, inactiveColor?: string };
    tabIndicator?: { activeColor?: string, inactiveColor?: string, urgentColor?: string, activeGradient?: string, inactiveGradient?: string, urgentGradient?: string };
}

const windowDecorations = new Map<string, WindowDecorationRule>();
const urgentWindows = new Set<string>();
let lastWindowDecorationsJson = "{}";
let lastUrgentWindowsJson = "[]";

function setWindowDecorations(id: string, rule: WindowDecorationRule | null) {
    if (rule === null || Object.keys(rule).length === 0) {
        windowDecorations.delete(id);
    } else {
        windowDecorations.set(id, rule);
    }
    const obj: Record<string, WindowDecorationRule> = {};
    windowDecorations.forEach((v, k) => { obj[k] = v; });
    const json = JSON.stringify(obj);
    if (json !== lastWindowDecorationsJson) {
        lastWindowDecorationsJson = json;
        if (typeof qmlBase !== "undefined") {
            (qmlBase as any).windowDecorations = json;
        }
    }
}

// a window that asks for attention (niri's is_urgent) gets the urgent colours
function setWindowUrgent(id: string, urgent: boolean) {
    if (urgent === urgentWindows.has(id)) {
        return;
    }
    if (urgent) {
        urgentWindows.add(id);
    } else {
        urgentWindows.delete(id);
    }
    lastUrgentWindowsJson = JSON.stringify(Array.from(urgentWindows));
    if (typeof qmlBase !== "undefined") {
        (qmlBase as any).urgentWindows = lastUrgentWindowsJson;
    }
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
    tabs: { x: number, y: number, width: number, height: number }[]; // niri's tab_rects, one per window
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
    // `windowId` is the window that is being dragged out of the grid; the effect fades it to niri's moving alpha. A hint
    // without a rectangle (the pointer is not over anything) still tells that.
    const json = rect === null && windowId === "" ? "null" : JSON.stringify({
        r: rect === null ? [] : [Math.round(rect.x), Math.round(rect.y), Math.round(rect.width), Math.round(rect.height)],
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

let cursorFollowsFocusOn = false;
let warpPending = false;
let warpBoth = false;
let warpRequestedAt = 0;
const warpFrame: { provider: (kwinClient: KwinClient) => QmlRect|null|undefined } = { provider: () => undefined };

function setCursorWarpConfig(config: Config) {
    cursorFollowsFocusOn = config.cursorFollowsFocus;
    if (!cursorFollowsFocusOn) {
        warpPending = false;
    }
}

// niri's maybe_warp_cursor_to_focus: asks for a warp of the pointer to the focused window; it is done by
// flushCursorWarp once the layout has settled (niri warps to where the window ends up, not to where it is now).
// `both` is niri's maybe_warp_cursor_to_focus_centered (after a move to another screen): the pointer goes to the
// window's centre when it is outside the window, instead of only fixing the coordinate that is outside.
function requestCursorWarp(both = false) {
    if (cursorFollowsFocusOn) {
        warpPending = true;
        warpRequestedAt = Date.now();
        warpBoth = warpBoth || both;
    }
}

// niri's move_cursor_to_rect with the default mode (center-xy off): the visible part of the focused window is the
// target; the pointer stays where it is when it is inside, and only the coordinate that is outside is moved to the
// middle of that part. Returns null when the pointer does not move.
function cursorWarpTarget(cursor: { x: number, y: number }, rect: { x: number, y: number, width: number, height: number }, both: boolean) {
    const xIn = cursor.x >= rect.x && cursor.x <= rect.x + rect.width;
    const yIn = cursor.y >= rect.y && cursor.y <= rect.y + rect.height;
    if (xIn && yIn) {
        return null;
    }
    const centerX = rect.x + rect.width / 2;
    const centerY = rect.y + rect.height / 2;
    if (!both && yIn) {
        return { x: centerX, y: cursor.y };
    }
    if (!both && xIn) {
        return { x: cursor.x, y: centerY };
    }
    return { x: centerX, y: centerY };
}

// the warp asked for by requestCursorWarp, if it is still needed with the layout as it is now
function flushCursorWarp() {
    if (!warpPending) {
        return;
    }
    const both = warpBoth;
    const active = Workspace.activeWindow;
    if (Date.now() - warpRequestedAt > 1000) { // nothing arranged the layout after the request
        warpPending = false;
        warpBoth = false;
        return;
    }
    if (active !== null && active.desktops.length > 0 && !active.desktops.includes(Workspace.currentDesktop)) {
        return; // a desktop switch is still handing the focus over: the window that has it is on the desktop that is left
    }
    // niri does not warp while the overview is up (it has no focused window rectangle then), nor without a window
    if (overviewActive() || active === null || active.desktopWindow || active.dock || active.minimized || Clients.isShellUi(active)) {
        warpPending = false;
        warpBoth = false;
        return;
    }
    // niri warps to the place the window ends up in: where Kiri put a tiled window, which KWin's frame shows only after
    // the client has committed (a new window is still at KWin's own placement then)
    const placed = warpFrame.provider(active);
    if (placed === null) {
        return; // not placed yet: wait for the next layout pass
    }
    warpPending = false;
    warpBoth = false;
    const frame = placed ?? active.frameGeometry;
    const view = Workspace.clientArea(ClientAreaOption.ScreenArea, active.output, Workspace.currentDesktop);
    const x1 = Math.max(frame.x, view.x);
    const y1 = Math.max(frame.y, view.y);
    const x2 = Math.min(frame.x + frame.width, view.x + view.width);
    const y2 = Math.min(frame.y + frame.height, view.y + view.height);
    if (x2 <= x1 || y2 <= y1) {
        return;
    }
    const target = cursorWarpTarget(Workspace.cursorPos, { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }, both);
    if (target !== null) {
        warpPointerTo(target.x, target.y);
    }
}

// moves the pointer, without a click or a hover; the compiled effect does it (KWin's script API cannot), and without
// it the pointer goes to the centre of the focused window (KWin's MoveMouseToFocus)
function warpPointerTo(x: number, y: number) {
    lastWarpTime = Date.now();
    if (typeof qmlBase === "undefined") {
        (Workspace as any).warpPointerTo(x, y); // tests
        return;
    }
    (qmlBase as any).warpPointer(x, y);
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

    // The layout and the view as JSON, for the next run of the script (the script is unloaded when Kiri mode is left
    // and loaded again when it is back): the columns with their heights, the floating windows, the focus and the
    // scroll of every desktop. Windows are named by their internal id.
    public saveState(): string {
        return JSON.stringify(this.world.captureLayout());
    }

    // the saved state back, or null when there is none or it is not valid
    public static parseState(json: string): World.Layout | null {
        if (typeof json !== "string" || json === "") {
            return null;
        }
        try {
            const data = JSON.parse(json);
            if (data === null || typeof data !== "object" || !Array.isArray(data.columns)) {
                return null;
            }
            return {
                columns: data.columns,
                floating: Array.isArray(data.floating) ? data.floating : [],
                manual: Array.isArray(data.manual) ? data.manual : [],
                floatingFrames: Array.isArray(data.floatingFrames) ? data.floatingFrames : [],
                views: Array.isArray(data.views) ? data.views : [],
                namedDesktops: Array.isArray(data.namedDesktops) ? data.namedDesktops.filter((id: unknown) => typeof id === "string") : [],
                previousDesktop: typeof data.previousDesktop === "string" ? data.previousDesktop : undefined,
            };
        } catch (error: any) {
            log("the saved state is not valid:", error);
            return null;
        }
    }

    public destroy() {
        this.focusFollowsMouse?.destroy();
        this.focusFollowsMouse = null;
        this.world.destroy();
    }
}
