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

// the appearance settings and the wheel and mouse button binds as JSON for the compiled effect
function decorationsConfig(config: Config) {
    const out: Record<string, any> = {};
    for (const [name, value] of Object.entries(config)) {
        if (/^(cornerRadius|focusRing|border|shadow|insertHint|tabIndicator|fullscreenBackdropColor|backgroundColor|pointerBinds)/.test(name)) {
            out[name] = value;
        }
    }
    return out;
}

let lastDecorationsConfigJson = "";

// niri's layout.background-color per output: output name -> colour
let outputBackgrounds: Record<string, string> = {};
let baseDecorations: Record<string, any> = {};

function setOutputBackgrounds(colors: Record<string, string>) {
    if (JSON.stringify(colors) === JSON.stringify(outputBackgrounds)) {
        return;
    }
    outputBackgrounds = colors;
    sendDecorationsConfig();
}

function sendDecorationsConfig() {
    const out = Object.assign({}, baseDecorations);
    if (Object.keys(outputBackgrounds).length > 0) {
        out["outputBackgrounds"] = outputBackgrounds;
    }
    lastDecorationsConfigJson = JSON.stringify(out);
    if (typeof qmlBase !== "undefined") {
        (qmlBase as any).decorationsConfig = lastDecorationsConfigJson;
    }
}

function setRingConfig(config: Config) {
    baseDecorations = decorationsConfig(config);
    sendDecorationsConfig();
    if (typeof qmlBase === "undefined") {
        return;
    }
    (qmlBase as any).ringConfig = {
        cornerRadius: config.cornerRadius,
        focusRingEnabled: config.focusRingEnabled,
        focusRingWidth: config.focusRingWidth,
        focusRingUseAccent: config.focusRingUseAccent,
        focusRingActiveColor: config.focusRingActiveColor,
        focusRingInactiveColor: config.focusRingInactiveColor,
        borderEnabled: config.borderEnabled,
        borderWidth: config.borderWidth,
        borderUseAccent: config.borderUseAccent,
        borderActiveColor: config.borderActiveColor,
        borderInactiveColor: config.borderInactiveColor,
        tabIndicatorEnabled: config.tabIndicatorEnabled,
        tabIndicatorHideWhenSingleTab: config.tabIndicatorHideWhenSingleTab,
        tabIndicatorCornerRadius: config.tabIndicatorCornerRadius,
        tabIndicatorActiveColor: config.tabIndicatorActiveColor !== "" ? config.tabIndicatorActiveColor : config.focusRingActiveColor,
        tabIndicatorInactiveColor: config.tabIndicatorInactiveColor !== "" ? config.tabIndicatorInactiveColor : config.focusRingInactiveColor,
    };
}

// per-window overrides of the appearance settings, for niri's window rules; a missing field keeps the global setting
interface WindowDecorationRule {
    cornerRadius?: number;
    fullscreenBackdropColor?: string;
    drawBorderWithBackground?: boolean;
    babaIsFloat?: boolean;
    focusRing?: { enabled?: boolean, width?: number, useAccent?: boolean, activeColor?: string, inactiveColor?: string, urgentColor?: string, activeGradient?: string, inactiveGradient?: string, urgentGradient?: string };
    border?: { enabled?: boolean, width?: number, useAccent?: boolean, activeColor?: string, inactiveColor?: string, urgentColor?: string, activeGradient?: string, inactiveGradient?: string, urgentGradient?: string };
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

interface TabIndicator {
    x: number;
    y: number;
    width: number;
    height: number;
    vertical: boolean;
    count: number;
    active: number;
    windows: string[];
    tabs: { x: number, y: number, width: number, height: number }[];
}

let lastTabIndicatorsJson = "[]";
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

// `tabIndicators` for the script's fallback windows, `tabGroups` as JSON for the compiled effect
function publishTabIndicators(owner: any, indicators: TabIndicator[], isCurrent = true) {
    if (typeof qmlBase === "undefined") {
        return;
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

// where Kiri wants a window painted during KWin's interactive resize (id -> [x, y])
const visualPositions = new Map<string, [number, number]>();
let lastVisualPositionsJson = "{}";

// where Kiri wants a full-screen X11 window painted while its real geometry is parked at the screen's corner (id -> [x, y])
const parkedPositions = new Map<string, [number, number]>();
let lastParkedPositionsJson = "{}";

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
        return;
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
        return;
    }
    const obj: Record<string, [number, number]> = {};
    visualPositions.forEach((v, k) => { obj[k] = v; });
    const json = JSON.stringify(obj);
    if (json !== lastVisualPositionsJson) {
        lastVisualPositionsJson = json;
        (qmlBase as any).visualPositions = json;
    }
}

let lastInsertHintJson = "null";

function setInsertHint(rect: { x: number, y: number, width: number, height: number } | null, windowId = "") {
    if (typeof qmlBase === "undefined") {
        return;
    }
    // `windowId` is the window being dragged out of the grid; the effect fades it
    const json = rect === null && windowId === "" ? "null" : JSON.stringify({
        r: rect === null ? [] : [Math.round(rect.x), Math.round(rect.y), Math.round(rect.width), Math.round(rect.height)],
        w: windowId,
    });
    if (json !== lastInsertHintJson) {
        lastInsertHintJson = json;
        (qmlBase as any).insertHint = json;
    }
}

// the compiled effect kiri_overview is driven through main.qml with JSON calls {m, a, n}; answers come back through
// Kiri.overviewPoll()
let overviewCallSeq = 0;
const overviewCalls: { member: string, arg: string }[] = [];
let overviewPollingFlag = false;

// the compiled effect kiri_swipe paints a raw swipe itself: the script tells it how the swipe scrolls and settles
let swipeCallSeq = 0;
const swipeCalls: { member: string, arg: string }[] = [];
let swipeVisualForTests = true;

function setSwipeVisualForTests(on: boolean) {
    swipeVisualForTests = on;
}

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

// true while Plasma's panel or desktop edit mode is on (qml polls plasmashell); the overview must not open then
let plasmaEditModeFlag = false;
// the tests set it; the script reads it from qml
function setPlasmaEditModeForTests(on: boolean) {
    plasmaEditModeFlag = on;
}
function plasmaEditMode() {
    return typeof qmlBase === "undefined" ? plasmaEditModeFlag : (qmlBase as any).plasmaEditMode === true;
}

// true while the overview is open: the pointer is not warped and does not give the focus away
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

// niri's maybe_warp_cursor_to_focus, done by flushCursorWarp once the layout has settled; `both` is the centered variant
function requestCursorWarp(both = false) {
    if (cursorFollowsFocusOn) {
        warpPending = true;
        warpRequestedAt = Date.now();
        warpBoth = warpBoth || both;
    }
}

// niri's move_cursor_to_rect: only the coordinate that is outside the window is moved to its middle
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

function flushCursorWarp() {
    if (!warpPending) {
        return;
    }
    const both = warpBoth;
    const active = Workspace.activeWindow;
    if (Date.now() - warpRequestedAt > 1000) {
        warpPending = false;
        warpBoth = false;
        return;
    }
    if (active !== null && active.desktops.length > 0 && !isOnShownDesktop(active)) {
        return;
    }
    // niri does not warp while the overview is up
    if (overviewActive() || active === null || active.desktopWindow || active.dock || active.minimized || Clients.isShellUi(active)) {
        warpPending = false;
        warpBoth = false;
        return;
    }
    // niri warps to the place the window ends up in
    const placed = warpFrame.provider(active);
    if (placed === null) {
        return;
    }
    warpPending = false;
    warpBoth = false;
    const frame = placed ?? active.frameGeometry;
    const view = Workspace.clientArea(ClientAreaOption.ScreenArea, active.output, currentDesktopOn(active.output));
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

// moves the pointer through the compiled effect; without it the pointer goes to the centre of the focused window
function warpPointerTo(x: number, y: number) {
    lastWarpTime = Date.now();
    if (typeof qmlBase === "undefined") {
        (Workspace as any).warpPointerTo(x, y);
        return;
    }
    (qmlBase as any).warpPointer(x, y);
}

// true when a pointer move is probably the echo of our own warp, which must not run focus-follows-mouse
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

function setDesktopRows(rows: number) {
    if (typeof qmlBase === "undefined") {
        return;
    }
    (qmlBase as any).setDesktopRows(rows);
}

// calls `callback` with the held pointer buttons (Qt::MouseButtons bits), asked from the effect
function queryPointerButtons(callback: (buttons: number) => void) {
    if (typeof qmlBase === "undefined") {
        callback(0);
        return;
    }
    (qmlBase as any).queryPointerButtons(callback);
}

// calls `callback` with whether the window is an X11 window, asked from the effect
function queryX11Window(kwinClient: KwinClient, callback: (x11: boolean) => void) {
    if (typeof qmlBase === "undefined") {
        callback((kwinClient as any).x11 !== false);
        return;
    }
    if (/X11Window/.test(String(kwinClient))) {
        callback(true);
        return;
    }
    (qmlBase as any).queryX11Window(String(kwinClient.internalId), callback);
}

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

    // re-reads the settings and rebuilds the World with the same layout if any changed
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

    // the layout and the view as JSON for the next run of the script
    public saveState(): string {
        return JSON.stringify(this.world.captureLayout());
    }

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
