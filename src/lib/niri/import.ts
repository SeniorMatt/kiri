// Turns the text of a niri config.kdl into Kiri settings and shortcut keys.
// Keep the mappings in step with tools/niri2kiri.py.
namespace NiriImport {
    export interface Result {
        settings: Record<string, any>;
        shortcutKeys: Record<string, string[]>;
        skipped: string[];
    }

    const ACTIONS: Record<string, string> = {
        "focus-column-left": "focus-left",
        "focus-column-right": "focus-right",
        "focus-window-up": "focus-up",
        "focus-window-down": "focus-down",
        "focus-column-first": "focus-start",
        "focus-column-last": "focus-end",
        "move-column-left": "column-move-left",
        "move-column-right": "column-move-right",
        "move-window-up": "window-move-up",
        "move-window-down": "window-move-down",
        "move-column-to-first": "column-move-start",
        "move-column-to-last": "column-move-end",
        "focus-workspace-down": "desktop-next",
        "focus-workspace-up": "desktop-previous",
        "move-column-to-workspace-down": "column-move-to-next-desktop",
        "move-column-to-workspace-up": "column-move-to-previous-desktop",
        "move-window-to-workspace-down": "window-move-to-next-desktop",
        "move-window-to-workspace-up": "window-move-to-previous-desktop",
        "consume-or-expel-window-left": "window-consume-or-expel-left",
        "consume-or-expel-window-right": "window-consume-or-expel-right",
        "switch-focus-between-floating-and-tiling": "window-switch-focus-floating-tiling",
        "consume-window-into-column": "window-consume-into-column",
        "expel-window-from-column": "window-expel-from-column",
        "switch-preset-column-width": "cycle-preset-widths",
        "switch-preset-column-width-back": "cycle-preset-widths-reverse",
        "maximize-column": "column-width-maximize",
        "maximize-window-to-edges": "window-maximize-to-edges",
        "fullscreen-window": "window-toggle-fullscreen",
        "center-column": "grid-scroll-focused",
        "toggle-window-floating": "window-toggle-floating",
        "toggle-column-tabbed-display": "column-toggle-tabbed",
        "close-window": "window-close",
        "toggle-overview": "overview",
        "expand-column-to-available-width": "column-width-expand",
        "switch-preset-window-height": "window-height-cycle-presets",
        "switch-preset-window-height-back": "window-height-cycle-presets-reverse",
        "reset-window-height": "window-height-reset",
        "focus-window-or-workspace-up": "focus-window-or-desktop-up",
        "focus-window-or-workspace-down": "focus-window-or-desktop-down",
        "move-window-up-or-to-workspace-up": "window-move-up-or-to-desktop-up",
        "move-window-down-or-to-workspace-down": "window-move-down-or-to-desktop-down",
        "focus-column-right-or-first": "focus-column-right-or-first",
        "focus-column-left-or-last": "focus-column-left-or-last",
        "focus-window-down-or-column-left": "focus-window-down-or-column-left",
        "focus-window-down-or-column-right": "focus-window-down-or-column-right",
        "focus-window-up-or-column-left": "focus-window-up-or-column-left",
        "focus-window-up-or-column-right": "focus-window-up-or-column-right",
        "focus-window-top": "focus-window-top",
        "focus-window-bottom": "focus-window-bottom",
        "focus-window-down-or-top": "focus-window-down-or-top",
        "focus-window-up-or-bottom": "focus-window-up-or-bottom",
        "swap-window-left": "window-swap-left",
        "swap-window-right": "window-swap-right",
        "center-window": "grid-scroll-focused",
        "center-visible-columns": "column-center-visible",
        "focus-workspace-previous": "desktop-previous-used",
        "move-window-to-floating": "window-move-to-floating",
        "move-window-to-tiling": "window-move-to-tiling",
        "focus-floating": "focus-floating",
        "focus-tiling": "focus-tiling",
        "focus-window-previous": "focus-window-previous",
        "open-overview": "overview",
    };

    const NUMBERED: Record<string, string> = {
        "focus-workspace": "desktop-{}",
        "move-column-to-workspace": "column-move-to-desktop-{}",
        "move-window-to-workspace": "window-move-to-desktop-{}",
        "focus-column": "focus-{}",
        "focus-window-in-column": "focus-window-in-column-{}",
        "move-column-to-index": "column-move-to-column-{}",
    };

    const MODIFIERS: Record<string, string> = {
        mod: "Meta", super: "Meta", win: "Meta", ctrl: "Ctrl", control: "Ctrl", shift: "Shift", alt: "Alt",
    };

    const KEYS: Record<string, string> = {
        page_down: "PgDown", page_up: "PgUp", next: "PgDown", prior: "PgUp",
        comma: ",", period: ".", slash: "/", backslash: "\\", minus: "-", equal: "=", plus: "+",
        bracketleft: "[", bracketright: "]", semicolon: ";", apostrophe: "'", grave: "`",
        return: "Return", space: "Space", tab: "Tab", escape: "Esc", backspace: "Backspace",
        delete: "Del", insert: "Ins", home: "Home", end: "End", print: "Print",
        left: "Left", right: "Right", up: "Up", down: "Down",
    };

    const MODIFIER_ORDER = ["Meta", "Ctrl", "Alt", "Shift"];

    const has = (map: Record<string, string>, key: string) => Object.prototype.hasOwnProperty.call(map, key);

    export function convertKey(niriKey: string): string|undefined {
        const parts = niriKey.split("+");
        let key = parts.pop() as string;
        const mods = new Set<string>();
        for (const mod of parts) {
            const lower = mod.toLowerCase();
            if (!has(MODIFIERS, lower)) {
                return undefined;
            }
            mods.add(MODIFIERS[lower]);
        }
        if (/^F\d{1,2}$/i.test(key) || key.length === 1) {
            key = key.toUpperCase();
        } else if (has(KEYS, key.toLowerCase())) {
            key = KEYS[key.toLowerCase()];
        } else {
            return undefined; // mouse wheel, XF86 keys etc.
        }
        const sorted = MODIFIER_ORDER.filter(mod => mods.has(mod));
        return [...sorted, key].join("+");
    }

    function readBinds(nodes: Kdl.Node[]) {
        const binds: Record<string, string[]> = {};
        const skipped: string[] = [];
        const steps: Record<string, any> = {}; // set-column-width "+5%" gives the step of the width keys
        for (const block of Kdl.find(nodes, "binds")) {
            for (const bind of block.children) {
                if (bind.children.length === 0) {
                    continue;
                }
                const command = bind.children[0];
                const args = command.args;
                let action: string|undefined;
                if (has(NUMBERED, command.name) && args.length > 0 && /^\d+$/.test(args[0])) {
                    action = NUMBERED[command.name].replace("{}", args[0]);
                } else if ((command.name === "set-column-width" || command.name === "set-window-height") && args.length > 0 && /^[+-]\d+(\.\d+)?%$/.test(args[0])) {
                    const kind = command.name === "set-column-width" ? "column-width" : "window-height";
                    action = kind + (args[0].startsWith("-") ? "-decrease" : "-increase");
                    const stepName = kind === "column-width" ? "columnWidthStep" : "windowHeightStep";
                    if (steps[stepName] === undefined) {
                        steps[stepName] = Math.round(parseFloat(args[0].substring(1)));
                    }
                } else if (command.name === "set-column-display" && (args[0] === "tabbed" || args[0] === "normal")) {
                    action = "column-display-" + args[0];
                } else if (has(ACTIONS, command.name)) {
                    action = ACTIONS[command.name];
                }
                const key = convertKey(bind.name);
                if (action === undefined || key === undefined) {
                    skipped.push(`bind ${bind.name} ${[command.name, ...args].join(" ")}`);
                    continue;
                }
                (binds[action] = binds[action] ?? []).push(key);
            }
        }
        return { binds, skipped, steps };
    }

    const COLOR_NAMES: Record<string, string> = {
        black: "#000000", white: "#ffffff", red: "#ff0000", green: "#008000", lime: "#00ff00",
        blue: "#0000ff", yellow: "#ffff00", orange: "#ffa500", purple: "#800080", pink: "#ffc0cb",
        cyan: "#00ffff", magenta: "#ff00ff", gray: "#808080", grey: "#808080", silver: "#c0c0c0",
        brown: "#a52a2a", transparent: "#000000",
    };

    function hslToRgb(h: number, s: number, l: number): number[] {
        const a = s * Math.min(l, 1 - l);
        const f = (n: number) => {
            const k = (n + h * 12) % 12;
            return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
        };
        return [f(0), f(8), f(4)];
    }

    function hex2(x: number) {
        const v = Math.max(0, Math.min(255, Math.round(x)));
        return (v < 16 ? "0" : "") + v.toString(16);
    }

    export function parseColor(value: string): string|undefined {
        const v = value.trim().toLowerCase();
        if (has(COLOR_NAMES, v)) {
            return COLOR_NAMES[v];
        }
        const hex = /^#([0-9a-f]{3,8})$/.exec(v);
        if (hex !== null && [3, 4, 6, 8].includes(hex[1].length)) {
            let h = hex[1];
            if (h.length <= 4) {
                h = h.split("").map(c => c + c).join("");
            }
            return "#" + h.substring(0, 6);
        }
        const func = /^(rgba?|hsla?)\((.*)\)$/.exec(v);
        if (func !== null) {
            const nums = (func[2].match(/[\d.]+%?/g) ?? []).slice(0, 3).map(x => parseFloat(x));
            if (nums.length === 3 && nums.every(x => !isNaN(x))) {
                let rgb: number[];
                if (func[1].startsWith("rgb")) {
                    rgb = nums.map(x => x);
                } else {
                    const hue = (((nums[0] / 360) % 1) + 1) % 1;
                    rgb = hslToRgb(hue, nums[1] / 100, nums[2] / 100).map(x => x * 255);
                }
                return "#" + rgb.map(hex2).join("");
            }
        }
        return undefined;
    }

    // proportion 0.5 -> "50%", fixed 800 -> "800px"
    function oneSize(node: Kdl.Node): string|undefined {
        const value = parseFloat(node.args[0]);
        if (isNaN(value)) {
            return undefined;
        }
        if (node.name === "proportion") {
            return parseFloat((value * 100).toFixed(3)) + "%";
        }
        if (node.name === "fixed") {
            return Math.trunc(value) + "px";
        }
        return undefined;
    }

    function size(node: Kdl.Node|undefined): string|undefined {
        if (node === undefined) {
            return undefined;
        }
        return node.children.map(oneSize).find(s => s !== undefined);
    }

    function sizes(node: Kdl.Node|undefined): string {
        return node === undefined ? "" : node.children.map(oneSize).filter(s => s !== undefined).join(", ");
    }

    function number(args: string[]): number|undefined {
        const value = parseFloat(args[0]);
        return isNaN(value) ? undefined : Math.trunc(value);
    }

    function ringSettings(node: Kdl.Node|undefined, prefix: string, out: Record<string, any>, warn: (msg: string) => void) {
        if (node === undefined) {
            return;
        }
        if (Kdl.child(node, "off")) {
            out[prefix + "Enabled"] = false;
        } else if (Kdl.child(node, "on")) {
            out[prefix + "Enabled"] = true;
        }
        const width = Kdl.child(node, "width");
        if (width !== undefined && number(width.args) !== undefined) {
            out[prefix + "Width"] = number(width.args);
        }
        for (const state of ["active", "inactive"]) {
            const colorNode = Kdl.child(node, state + "-color");
            const gradient = Kdl.child(node, state + "-gradient");
            const raw = colorNode !== undefined && colorNode.args.length > 0 ? colorNode.args[0] : gradient?.props["from"];
            if (raw === undefined) {
                continue;
            }
            const color = parseColor(raw);
            if (color !== undefined) {
                out[prefix + (state === "active" ? "Active" : "Inactive") + "Color"] = color;
            } else {
                warn(`${prefix} ${state} colour '${raw}' not understood`);
            }
        }
    }

    // niri regexes match anywhere in the string; Kiri's match the whole string
    export function anchored(regex: string): string {
        if (regex.endsWith("$") && !regex.endsWith("\\$")) {
            regex = regex.substring(0, regex.length - 1);
        } else {
            regex += ".*";
        }
        return regex.startsWith("^") ? regex.substring(1) : ".*" + regex;
    }

    function windowRules(nodes: Kdl.Node[], warn: (msg: string) => void) {
        const rules: Record<string, any>[] = [];
        for (const rule of Kdl.find(nodes, "window-rule")) {
            const matches = Kdl.find(rule.children, "match");
            const floatingNode = Kdl.child(rule, "open-floating");
            const floating = floatingNode !== undefined && floatingNode.args[0] !== "false";
            const width = size(Kdl.child(rule, "default-column-width"));
            if (Kdl.find(rule.children, "exclude").length > 0) {
                warn("window-rule 'exclude' lines ignored");
            }
            if (matches.length === 0 || !(floating || width !== undefined)) {
                continue;
            }
            for (const match of matches) {
                const entry: Record<string, any> = {};
                if (match.props["app-id"]) {
                    entry["class"] = anchored(match.props["app-id"]);
                }
                if (match.props["title"]) {
                    entry["caption"] = anchored(match.props["title"]);
                }
                if (floating) {
                    entry["tile"] = false;
                }
                if (width !== undefined) {
                    entry["width"] = width;
                }
                rules.push(entry);
            }
        }
        return rules;
    }

    // geometry-corner-radius of the first window-rule that has no match lines, i.e. applies to every window
    function cornerRadius(nodes: Kdl.Node[]): number|undefined {
        for (const rule of Kdl.find(nodes, "window-rule")) {
            const node = Kdl.child(rule, "geometry-corner-radius");
            if (node !== undefined && Kdl.find(rule.children, "match").length === 0 && number(node.args) !== undefined) {
                return Math.max(0, number(node.args) as number);
            }
        }
        return undefined;
    }

    function readSettings(nodes: Kdl.Node[], warn: (msg: string) => void): Record<string, any> {
        const out: Record<string, any> = {};
        const layout = new Map<string, Kdl.Node>();
        for (const block of Kdl.find(nodes, "layout")) {
            for (const node of block.children) {
                layout.set(node.name, node);
            }
        }
        const L = (name: string): Kdl.Node|undefined => layout.get(name);

        const gapsNode = L("gaps");
        if (gapsNode !== undefined && number(gapsNode.args) !== undefined) {
            const gap = number(gapsNode.args) as number;
            out["gapsInnerHorizontal"] = out["gapsInnerVertical"] = gap;
            const struts = L("struts");
            for (const [side, name] of [["top", "Top"], ["bottom", "Bottom"], ["left", "Left"], ["right", "Right"]]) {
                const strut = Kdl.child(struts, side);
                out["gapsOuter" + name] = gap + (strut !== undefined ? number(strut.args) ?? 0 : 0);
            }
        } else if (L("struts") !== undefined) {
            warn("struts without gaps ignored (Kiri's gaps default is 16, niri's too, so add 'gaps 16' to use them)");
        }

        const center = L("center-focused-column");
        if (center !== undefined) {
            const modes: Record<string, string> = { "never": "scrollingLazy", "always": "scrollingCentered", "on-overflow": "scrollingOnOverflow" };
            const mode = center.args[0] ?? "never";
            if (has(modes, mode)) {
                for (const key of Object.values(modes)) {
                    out[key] = key === modes[mode];
                }
                out["scrollingGrouped"] = false;
            }
        }
        if (L("always-center-single-column") !== undefined) {
            out["alwaysCenterSingleColumn"] = true;
        }
        if (sizes(L("preset-column-widths")) !== "") {
            out["presetWidths"] = sizes(L("preset-column-widths"));
        }
        if (sizes(L("preset-window-heights")) !== "") {
            out["presetHeights"] = sizes(L("preset-window-heights"));
        }
        const defaultWidthNode = L("default-column-width");
        if (defaultWidthNode !== undefined) {
            // an empty block lets the windows pick their own width, which is "" for Kiri
            out["defaultColumnWidth"] = size(defaultWidthNode) ?? "";
        }
        const display = L("default-column-display");
        if (display !== undefined) {
            out["tabbedColumnsByDefault"] = (display.args[0] ?? "") === "tabbed";
        }
        ringSettings(L("focus-ring"), "focusRing", out, warn);
        const radius = cornerRadius(nodes);
        if (radius !== undefined) {
            out["cornerRadius"] = radius;
        }
        ringSettings(L("border"), "border", out, warn);

        const tab = L("tab-indicator");
        if (tab !== undefined) {
            if (Kdl.child(tab, "off")) {
                out["tabIndicatorEnabled"] = false;
            } else if (Kdl.child(tab, "on")) {
                out["tabIndicatorEnabled"] = true;
            }
            for (const [niri, kiri] of [["width", "tabIndicatorWidth"], ["gap", "tabIndicatorGap"]]) {
                const node = Kdl.child(tab, niri);
                if (node !== undefined && number(node.args) !== undefined) {
                    out[kiri] = number(node.args);
                }
            }
            const length = Kdl.child(tab, "length");
            if (length !== undefined && length.props["total-proportion"] !== undefined && !isNaN(parseFloat(length.props["total-proportion"]))) {
                out["tabIndicatorLength"] = parseFloat(length.props["total-proportion"]);
            }
            const position = Kdl.child(tab, "position");
            if (position !== undefined && position.args.length > 0 && ["left", "right", "top", "bottom"].includes(position.args[0])) {
                out["tabIndicatorPosition"] = position.args[0];
            }
            if (Kdl.child(tab, "hide-when-single-tab")) {
                out["tabIndicatorHideWhenSingleTab"] = true;
            }
            if (["active-color", "inactive-color", "active-gradient", "inactive-gradient", "place-within-column"].some(name => Kdl.child(tab, name))) {
                warn("tab-indicator colours and place-within-column (Kiri has no such options)");
            }
        }

        out["hideTitlebars"] = Kdl.find(nodes, "prefer-no-csd").length > 0;
        for (const block of Kdl.find(nodes, "input")) {
            if (Kdl.child(block, "warp-mouse-to-focus")) {
                out["cursorFollowsFocus"] = true;
            }
        }
        if (Kdl.find(nodes, "gestures").length > 0) {
            warn("gestures block (Kiri has no matching options)");
        }
        return out;
    }

    // Kiri's own windowRules (a JSON list) get the niri rules in front, so nothing the user wrote is lost
    function mergeRules(niriRules: Record<string, any>[], existing: string|undefined): string {
        let base: any[] = [];
        try {
            const parsed = JSON.parse(existing ?? "[]");
            if (Array.isArray(parsed)) {
                base = parsed;
            }
        } catch (error) {
            log("windowRules is not valid JSON, niri's rules replace it");
        }
        return JSON.stringify([...niriRules, ...base]);
    }

    export function parse(text: string, existingWindowRules?: string): Result {
        const skipped: string[] = [];
        const warn = (msg: string) => skipped.push(msg);
        let nodes: Kdl.Node[];
        try {
            nodes = Kdl.parse(text);
        } catch (error: any) {
            return { settings: {}, shortcutKeys: {}, skipped: ["could not read the niri config: " + error] };
        }
        const bound = readBinds(nodes);
        skipped.push(...bound.skipped);
        const settings = Object.assign(readSettings(nodes, warn), bound.steps);
        const rules = windowRules(nodes, warn);
        if (rules.length > 0) {
            settings["windowRules"] = mergeRules(rules, existingWindowRules);
        }
        return { settings, shortcutKeys: bound.binds, skipped };
    }

    // Applies the pasted niri config to a loaded config, on top of the other settings.
    // Keys typed into Kiri's own key fields win over niri's binds.
    export function apply(config: Config) {
        if (!config.niriConfigEnabled || config.niriConfig.trim() === "") {
            return;
        }
        const result = parse(config.niriConfig, config.windowRules);
        Object.assign(config, result.settings);
        config.shortcutKeys = Object.assign({}, result.shortcutKeys, config.shortcutKeys);
        for (const line of result.skipped) {
            log("niri config, skipped:", line);
        }
    }
}
