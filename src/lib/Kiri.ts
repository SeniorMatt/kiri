function loadConfig(): Config {
    const config: any = {};
    for (const entry of configDef) {
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
const tabIndicatorsByDesktop = new Map<any, TabIndicator[]>();

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

function overviewEffectLoaded() {
    return typeof qmlBase === "undefined" ? true : (qmlBase as any).overviewEffect === true;
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
