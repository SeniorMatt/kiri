interface KeyBinding {
    name: string;
    description: string;
    defaultKeys?: string[];
    action: () => void;
}

interface NumKeyBinding {
    name: string;
    description: string;
    defaultModifiers?: string;
    count?: number; // how many numbered actions there are, 12 if not given
    action: (i: number) => void;
}

interface Shortcut {
    name: string;
    description: string;
    defaultKeys: string[];
    action: () => void;
}

function catchWrap(f: () => void) {
    return () => {
        try {
            f();
        } catch (error: any) {
            log(error);
            log(error.stack);
        }
    };
}

// The actions after which niri calls maybe_warp_cursor_to_focus (input/mod.rs, every `Action::` arm that does), by the name
// of Kiri's shortcut. The others never move the pointer: width and height changes, centring, full-screen and
// maximize, floating toggles, consume-into-column, the overview. Closing a window and opening one warp too, through
// the focus they hand out (see ClientManager).
const WARPING_SHORTCUTS = new Set([
    "focus-left", "focus-right", "focus-up", "focus-down", "focus-next", "focus-previous", "focus-start", "focus-end",
    "focus-column-right-or-first", "focus-column-left-or-last", "focus-window-down-or-column-left",
    "focus-window-down-or-column-right", "focus-window-up-or-column-left", "focus-window-up-or-column-right",
    "focus-window-top", "focus-window-bottom", "focus-window-down-or-top", "focus-window-up-or-bottom",
    "focus-window-or-desktop-down", "focus-window-or-desktop-up", "focus-window-previous", "focus-floating", "focus-tiling",
    "window-switch-focus-floating-tiling", "window-move-left", "window-move-right", "window-consume-or-expel-left",
    "window-consume-or-expel-right", "window-expel-from-column", "window-move-up", "window-move-down",
    "window-move-down-or-to-desktop-down", "window-move-up-or-to-desktop-up", "window-swap-left", "window-swap-right",
    "column-display-normal", "column-display-tabbed", "column-toggle-tabbed", "column-move-left", "column-move-right",
    "column-move-start", "column-move-end", "column-move-to-next-desktop", "column-move-to-previous-desktop",
    "window-move-to-next-desktop", "window-move-to-previous-desktop", "desktop-previous-used", "desktop-next",
    "desktop-previous",
    "focus-window-previous-workspace", "focus-window-previous-output", "focus-window-previous-app",
    "focus-window-previous-workspace-app", "focus-window-previous-output-app",
    "column-move-left-no-focus", "column-move-right-no-focus", "column-move-start-no-focus", "column-move-end-no-focus",
    "window-move-up-no-focus", "window-move-down-no-focus", "window-swap-left-no-focus", "window-swap-right-no-focus",
    "column-move-to-next-desktop-no-focus", "column-move-to-previous-desktop-no-focus",
    "window-move-to-next-desktop-no-focus", "window-move-to-previous-desktop-no-focus",
]);
const WARPING_PREFIXES = ["desktop-", "focus-", "focus-window-in-column-", "window-move-to-column-", "column-move-to-column-", "column-move-to-desktop-", "window-move-to-desktop-",
    "column-move-to-column-no-focus-", "column-move-to-desktop-no-focus-", "window-move-to-desktop-no-focus-"];
// niri's maybe_warp_cursor_to_focus_centered: after a move to another screen
const WARPING_BOTH = new Set(["screen-switch"]);

function warpsCursor(name: string) {
    return WARPING_SHORTCUTS.has(name) || WARPING_BOTH.has(name) ||
        (/-\d+$/.test(name) && WARPING_PREFIXES.some(prefix => name.startsWith(prefix)));
}

function warpAfter(name: string, action: () => void) {
    if (!warpsCursor(name)) {
        return action;
    }
    return () => {
        // asked for before the action, so that the action's own arrange does it (niri warps to where the window ends up)
        requestCursorWarp(WARPING_BOTH.has(name));
        try {
            action();
        } finally {
            // actions that do not arrange anything still warp; one that handed the focus to another desktop is waited
            // for (flushCursorWarp keeps the request until the focused window is on the desktop shown)
            flushCursorWarp();
        }
    };
}

function getShortcuts(world: World, actions: Actions): Shortcut[] {
    const shortcuts: Shortcut[] = getKeyBindings(world, actions).map(keyBinding => ({
        name: keyBinding.name,
        description: keyBinding.description,
        defaultKeys: keyBinding.defaultKeys ?? [],
        action: warpAfter(keyBinding.name, keyBinding.action),
    }));

    for (const numKeyBinding of getNumKeyBindings(world, actions)) {
        for (let i = 0; i < (numKeyBinding.count ?? 12); i++) {
            const numKey = String(i + 1);
            shortcuts.push({
                name: applyMacro(numKeyBinding.name, numKey),
                description: applyMacro(numKeyBinding.description, numKey),
                defaultKeys: numKeyBinding.defaultModifiers !== undefined && i < 9 ? [`${numKeyBinding.defaultModifiers}+${numKey}`] : [],
                action: warpAfter(applyMacro(numKeyBinding.name, numKey), () => numKeyBinding.action(i)),
            });
        }
    }

    return shortcuts;
}

// Holding a key repeats its action like in niri (binds repeat by default there). Close, overview and the toggles
// do not repeat (niri's default config has repeat=false for close-window), a held key would flip them back and forth.
const NO_REPEAT = new Set([
    "window-close", "overview", "window-toggle-floating", "window-toggle-fullscreen", "window-toggle-windowed-fullscreen", "window-move-to-floating",
    "window-move-to-tiling", "column-toggle-tabbed", "column-display-normal", "column-display-tabbed",
    "column-width-maximize", "column-width-expand", "window-maximize-to-edges", "window-switch-focus-floating-tiling",
    "desktop-previous-used", "screen-switch", "overview-open", "overview-close",
]);

// Actions that had no default keys in earlier versions (kglobalacceld stored them as "no key" and never applies a new default)
const GAINED_DEFAULT_KEYS = new Set([
    "window-height-cycle-presets", "window-height-reset", "column-width-expand", "cycle-preset-widths-reverse",
]);

namespace KGlobalAccel {
    export const path = "/kglobalaccel";
    export const iface = "org.kde.KGlobalAccel";
    export const componentIface = "org.kde.kglobalaccel.Component";
    export const component = "kiri";
    export const componentFriendly = "Kiri";

    // KGlobalAccel::SetShortcutFlag
    export const setPresent = 2;
    export const noAutoloading = 4;
    export const isDefault = 8;

    export function call(member: string, types: string[], args: unknown[], resolve: (value: any) => void = () => {}) {
        kglobalaccel.call(path, iface, member, types, args, resolve);
    }
}

// Kiri's settings have two key fields per action (primary and alternate), stored as "key1_<name>" and "key2_<name>"
// with "-" replaced by "_". A key typed there wins over what the Shortcuts settings page has stored.
function shortcutConfigName(slot: number, shortcutName: string) {
    return `key${slot}_${shortcutName.replace(/-/g, "_")}`;
}

function getShortcutConfigDef() {
    const empty: any = {};
    const entries: { name: string, type: string, default: string }[] = [];
    for (const shortcut of getShortcuts(empty, empty)) {
        for (const slot of [1, 2]) {
            entries.push({ name: shortcutConfigName(slot, shortcut.name), type: "String", default: "" });
        }
    }
    return entries;
}

function readShortcutKeys(readConfig: (name: string) => string): Record<string, string[]> {
    const empty: any = {};
    const result: Record<string, string[]> = {};
    for (const shortcut of getShortcuts(empty, empty)) {
        const keys = [1, 2]
            .map(slot => String(readConfig(shortcutConfigName(slot, shortcut.name)) ?? "").trim())
            .filter(key => key !== "");
        if (keys.length > 0) {
            result[shortcut.name] = keys;
        }
    }
    return result;
}

// Registers Kiri's shortcuts in their own "Kiri" group in Plasma's Shortcuts settings.
// While Kiri runs, Plasma shortcuts that use the same keys are switched off, so Kiri's win.
// That only changes kglobalaccel's state in memory, nothing is saved, and they're switched back on when Kiri stops.
class KeyBindings {
    private readonly actions = new Map<string, () => void>();
    private readonly activeKeys = new Set<number>();
    private readonly borrowed = new Map<string, string[]>();
    private readonly kiriKeys = new Map<string, number[]>();
    private readonly priorityDelayer: Delayer;
    private destroyed = false;

    constructor(world: World, config: Actions.Config, shortcutKeys: Record<string, string[]> = {}) {
        const shortcuts = this.setActions(world, config);

        // Plasma's own shortcuts are registered again when plasmashell or kded start, which can happen after Kiri starts
        this.priorityDelayer = new Delayer(3000, () => this.takePriority());

        removeOldShortcuts();

        let pending = shortcuts.length;
        for (const shortcut of shortcuts) {
            const actionId = [KGlobalAccel.component, shortcut.name, KGlobalAccel.componentFriendly, shortcut.description];
            const defaultKeys = parseKeys(shortcut.defaultKeys);
            KGlobalAccel.call("doRegister", ["as"], [actionId]);
            KGlobalAccel.call("setShortcut", ["as", "ai", "u"], [actionId, defaultKeys, KGlobalAccel.isDefault]);
            // keys typed in Kiri's own settings replace the stored ones (NoAutoloading), so they also show up in Plasma's Shortcuts page
            // without them, keys the user already set in Plasma's settings are kept (autoloading)
            const userKeys = parseKeys(shortcutKeys[shortcut.name] ?? []);
            const flags = userKeys.length > 0 ? KGlobalAccel.setPresent | KGlobalAccel.noAutoloading : KGlobalAccel.setPresent;
            KGlobalAccel.call("setShortcut", ["as", "ai", "u"], [actionId, userKeys.length > 0 ? userKeys : defaultKeys, flags], (keys: number[]|undefined) => {
                if (this.destroyed) {
                    return; // the script stopped before kglobalaccel answered
                }
                if (userKeys.length === 0 && defaultKeys.length > 0 && (keys ?? []).length === 0 && GAINED_DEFAULT_KEYS.has(shortcut.name)) {
                    // kglobalacceld keeps what it stored, and older versions stored "no key" for these actions
                    // (their default keys came later), so the default never took effect: set it once more
                    KGlobalAccel.call("setShortcut", ["as", "ai", "u"], [actionId, defaultKeys, KGlobalAccel.setPresent | KGlobalAccel.noAutoloading], (newKeys: number[]|undefined) => {
                        for (const key of newKeys ?? []) {
                            this.activeKeys.add(key);
                        }
                    });
                }
                for (const key of keys ?? []) {
                    this.activeKeys.add(key);
                }
                this.kiriKeys.set(shortcut.name, keys ?? []);
                pending--;
                if (pending === 0) {
                    // the twins first, so that taking priority also switches off KWin's twin actions
                    syncTwins(this.kiriKeys, () => this.destroyed, () => {
                        this.takePriority();
                        this.priorityDelayer.run();
                    });
                }
            });
        }
    }

    // Points the shortcuts at a new world, keeping the registrations in kglobalaccel as they are.
    // Used when Kiri reloads its settings, so shortcuts are neither registered twice nor lose priority.
    public setActions(world: World, config: Actions.Config) {
        const shortcuts = getShortcuts(world, new Actions(config));
        this.actions.clear();
        for (const shortcut of shortcuts) {
            this.actions.set(shortcut.name, catchWrap(shortcut.action));
        }
        kglobalaccel.onPressed = (name: string) => runShortcutEvent(name, "press", () => this.actions.get(name)?.());
        kglobalaccel.onRepeated = (name: string) => {
            if (!NO_REPEAT.has(name)) {
                runShortcutEvent(name, "repeat", () => this.actions.get(name)?.());
            }
        };
        kglobalaccel.onReleased = (name: string) => {
            if (name.startsWith("desktop-")) {
                log("shortcut", name, "release");
            }
        };
        return shortcuts;
    }

    private takePriority() {
        if (this.destroyed) {
            return;
        }
        for (const key of this.activeKeys) {
            KGlobalAccel.call("getGlobalShortcutsByKey", ["i"], [key], (infos: string[][]|undefined) => {
                if (this.destroyed) {
                    return;
                }
                for (const info of infos ?? []) {
                    const actionUnique = String(info[0]);
                    const componentUnique = String(info[2]);
                    if (componentUnique === KGlobalAccel.component) {
                        continue;
                    }
                    const actionId = [componentUnique, actionUnique, "", ""];
                    log("taking over", componentUnique, actionUnique);
                    this.borrowed.set(componentUnique + "/" + actionUnique, actionId);
                    KGlobalAccel.call("setInactive", ["as"], [actionId]);
                }
            });
        }
    }

    // Puts back the default keys of actions whose key fields (or niri binds) were removed
    public static resetToDefaultKeys(names: string[]) {
        const empty: any = {};
        for (const shortcut of getShortcuts(empty, empty)) {
            if (names.includes(shortcut.name)) {
                const actionId = [KGlobalAccel.component, shortcut.name, KGlobalAccel.componentFriendly, shortcut.description];
                KGlobalAccel.call("setShortcut", ["as", "ai", "u"], [actionId, parseKeys(shortcut.defaultKeys), KGlobalAccel.setPresent | KGlobalAccel.noAutoloading]);
            }
        }
    }

    public destroy() {
        this.destroyed = true;
        this.priorityDelayer.destroy();
        kglobalaccel.onPressed = null;
        kglobalaccel.onRepeated = null;
        kglobalaccel.onReleased = null;
        for (const name of this.actions.keys()) {
            KGlobalAccel.call("setInactive", ["as"], [[KGlobalAccel.component, name, "", ""]]);
        }
        for (const actionId of this.borrowed.values()) {
            // with autoloading, this only marks the shortcut as present again, its keys stay as they are
            KGlobalAccel.call("setShortcut", ["as", "ai", "u"], [actionId, [], KGlobalAccel.setPresent]);
        }
    }
}

function parseKeys(keySequences: string[]) {
    const keys: number[] = [];
    for (const keySequence of keySequences) {
        const key = parseKeySequence(keySequence);
        if (key === undefined) {
            log("invalid key:", keySequence);
            continue;
        }
        keys.push(key);
        const variant = shiftedSymbolVariant(key);
        if (variant !== undefined) {
            keys.push(variant);
        }
    }
    return keys;
}


// Plasma-mode twins: KWin's own action for what a Kiri action does gets the same keys, so the key still works after
// `kiri-mode plasma` (when the script is unloaded). Only actions that do the same thing are paired.
const KWIN_TWINS: Record<string, string> = {
    "grid-scroll-focused": "Window Move Center",
    "window-close": "Window Close",
    "window-toggle-fullscreen": "Window Fullscreen",
    "window-maximize-to-edges": "Window Maximize",
    "desktop-next": "Switch to Next Desktop",
    "desktop-previous": "Switch to Previous Desktop",
    "overview": "Overview",
};

function twinOf(kiriName: string): string|undefined {
    const desktop = /^desktop-(\d+)$/.exec(kiriName);
    return desktop !== null ? "Switch to Desktop " + desktop[1] : KWIN_TWINS[kiriName];
}

// What Kiri gave to KWin's actions, kept in ~/.config/kiri-twins.conf: "action name~key.key|action name~key". The keys
// are Qt key codes. An action whose keys are not exactly these any more was changed by the user.
function readTwinRecord(): Map<string, number[]> {
    const record = new Map<string, number[]>();
    for (const entry of String(twinStore.given ?? "").split("|")) {
        const [name, keys] = entry.split("~");
        if (name && keys) {
            record.set(name, keys.split(".").map(Number).filter(key => key > 0));
        }
    }
    return record;
}

function writeTwinRecord(record: Map<string, number[]>) {
    const text = Array.from(record).filter(([, keys]) => keys.length > 0).map(([name, keys]) => name + "~" + keys.join(".")).join("|");
    if (text !== twinStore.given) {
        twinStore.given = text;
        twinStore.sync();
    }
}

// D-Bus replies come as list-like objects (not real arrays) whose items can still be wrapped in an object with a `value`
function plainKeys(keys: any): number[] {
    const result: number[] = [];
    for (let i = 0; i < (keys?.length ?? 0); i++) {
        const key = Number(typeof keys[i] === "object" && keys[i] !== null ? keys[i].value : keys[i]);
        if (key > 0) {
            result.push(key);
        }
    }
    return result;
}

function sameKeys(a: number[], b: number[]) {
    return a.length === b.length && a.every(key => b.includes(key));
}

// Gives the twins their keys. kiriKeys: the keys each Kiri action ended up with. Keys that another action uses are
// never taken.
function syncTwins(kiriKeys: Map<string, number[]>, isDestroyed: () => boolean, done: () => void) {
    kglobalshortcutsrc.sync();
    kglobalaccel.call("/component/kwin", KGlobalAccel.componentIface, "shortcutNames", [], [], (names: string[]|undefined) => {
        const existing = new Set(names ?? []);
        const pairs: [string, string][] = [];
        for (const [kiriName] of kiriKeys) {
            const twin = twinOf(kiriName);
            if (twin !== undefined && existing.has(twin)) {
                pairs.push([kiriName, twin]);
            }
        }
        const record = readTwinRecord();
        const next = (i: number) => {
            if (isDestroyed() || i >= pairs.length) {
                if (!isDestroyed()) {
                    writeTwinRecord(record);
                }
                done();
                return;
            }
            syncTwin(pairs[i][1], plainKeys(kiriKeys.get(pairs[i][0])), record, () => next(i + 1));
        };
        next(0);
    });
}

// KWin's own default keys of an action, from ~/.config/kglobalshortcutsrc: [kwin] "Name=current,default,description" (keys
// of one entry are separated by a tab). It is read through a QtCore Settings object on that file (kglobalshortcutsrc in
// main.qml). The default D-Bus reports follows every change, this one only changes when KWin registers the action.
function kwinDefaultKeys(twin: string): number[]|undefined {
    const entry = kglobalshortcutsrc.value(twin, undefined);
    const fields: string[] = typeof entry === "string" ? [entry] : Array.from(entry ?? []);
    if (fields.length < 2) {
        return undefined;
    }
    const keys: number[] = [];
    for (const text of String(fields[1]).split("\t")) {
        const key = parseKeySequence(text.trim());
        if (key !== undefined) {
            keys.push(key);
        }
    }
    return keys;
}

function syncTwin(twin: string, wanted: number[], record: Map<string, number[]>, done: () => void) {
    const id = ["kwin", twin, "", ""];
    KGlobalAccel.call("shortcut", ["as"], [id], (current: number[]|undefined) => {
        if (current === undefined) {
            // the call failed: the action's keys are unknown, and setting them would replace the user's
            done();
            return;
        }
        const now = plainKeys(current);
        // what the action has apart from the keys Kiri gave it earlier
        const given = record.get(twin) ?? [];
        const base = given.length > 0 && given.every(key => now.includes(key)) ? now.filter(key => !given.includes(key)) : now;
        // Kiri adds its keys next to KWin's defaults (or to an action that has none); an action the user changed, even by removing its keys, is left alone
        if (!sameKeys(base, kwinDefaultKeys(twin) ?? [])) {
            record.delete(twin);
            done();
            return;
        }
        const candidates = wanted.filter((key, i) => !base.includes(key) && wanted.indexOf(key) === i).slice(0, Math.max(0, 4 - base.length));
        const free: number[] = [];
        const check = (i: number) => {
            if (i < candidates.length) {
                KGlobalAccel.call("getGlobalShortcutsByKey", ["i"], [candidates[i]], (infos: string[][]|undefined) => {
                    // a failed lookup says nothing about the key: it is not taken then
                    const taken = infos === undefined || Array.from(infos).some(info => String(info[2]) !== KGlobalAccel.component && !(String(info[2]) === "kwin" && String(info[0]) === twin));
                    if (!taken) {
                        free.push(candidates[i]);
                    }
                    check(i + 1);
                });
                return;
            }
            if (free.length > 0) {
                record.set(twin, free);
            } else {
                record.delete(twin);
            }
            const keys = base.concat(free);
            if (!sameKeys(keys, now)) {
                log("twin", twin, "gets", free.length, "key(s)");
                KGlobalAccel.call("setForeignShortcut", ["as", "ai"], [id, keys]);
            }
            done();
        };
        check(0);
    });
}

// Earlier versions registered their shortcuts in KWin's group as "kiri-*"
function removeOldShortcuts() {
    kglobalaccel.call("/component/kwin", KGlobalAccel.componentIface, "shortcutNames", [], [], (names: string[]|undefined) => {
        for (const name of names ?? []) {
            if (name.startsWith("kiri-")) {
                KGlobalAccel.call("unregister", ["s", "s"], ["kwin", name]);
            }
        }
    });
}
