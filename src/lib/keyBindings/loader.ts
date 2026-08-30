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

function getShortcuts(world: World, actions: Actions): Shortcut[] {
    const shortcuts: Shortcut[] = getKeyBindings(world, actions).map(keyBinding => ({
        name: keyBinding.name,
        description: keyBinding.description,
        defaultKeys: keyBinding.defaultKeys ?? [],
        action: keyBinding.action,
    }));

    for (const numKeyBinding of getNumKeyBindings(world, actions)) {
        for (let i = 0; i < 12; i++) {
            const numKey = String(i + 1);
            shortcuts.push({
                name: applyMacro(numKeyBinding.name, numKey),
                description: applyMacro(numKeyBinding.description, numKey),
                defaultKeys: numKeyBinding.defaultModifiers !== undefined && i < 9 ? [`${numKeyBinding.defaultModifiers}+${numKey}`] : [],
                action: () => numKeyBinding.action(i),
            });
        }
    }

    return shortcuts;
}

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
                for (const key of keys ?? []) {
                    this.activeKeys.add(key);
                }
                pending--;
                if (pending === 0) {
                    this.takePriority();
                    this.priorityDelayer.run();
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
        kglobalaccel.onPressed = (name: string) => this.actions.get(name)?.();
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

    public destroy() {
        this.destroyed = true;
        this.priorityDelayer.destroy();
        kglobalaccel.onPressed = null;
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
    }
    return keys;
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
