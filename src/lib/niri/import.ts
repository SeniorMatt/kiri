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
        "toggle-windowed-fullscreen": "window-toggle-windowed-fullscreen",
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
        "move-workspace-down": "desktop-move-down",
        "move-workspace-up": "desktop-move-up",
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

    // Workspace binds that need more than a name lookup: a workspace by name (the Nth name of the bind list is the
    // shortcut "...-named-N", 12 at most), focus=false, new workspaces, move-workspace-to-index.
    function desktopAction(command: Kdl.Node, names: string[]): string|undefined {
        const arg = command.args[0];
        const nofocus = command.props["focus"] === "false" ? "-nofocus" : "";
        const slot = (name: string) => {
            if (!names.includes(name) && names.length < 12) {
                names.push(name);
            }
            return names.indexOf(name) + 1;
        };
        switch (command.name) {
        case "focus-workspace": case "move-column-to-workspace": case "move-window-to-workspace": {
            const kind = command.name === "focus-workspace" ? "desktop" : command.name === "move-column-to-workspace" ? "column-move-to-desktop" : "window-move-to-desktop";
            if (arg === undefined) {
                return undefined;
            }
            if (/^\d+$/.test(arg)) {
                return command.name === "focus-workspace" ? undefined : `${kind}${nofocus}-${arg}`;
            }
            return nofocus !== "" || slot(arg) < 1 ? undefined : `${kind}-named-${slot(arg)}`;
        }
        case "set-workspace-name":
            return arg === undefined || slot(arg) < 1 ? undefined : `set-desktop-name-${slot(arg)}`;
        case "unset-workspace-name":
            return arg === undefined ? "unset-desktop-name" : undefined;
        case "move-workspace-to-index":
            return arg !== undefined && /^\d+$/.test(arg) ? `move-desktop-to-index-${arg}` : undefined;
        case "move-column-to-workspace-down": case "move-column-to-workspace-up":
            return nofocus === "" ? undefined : `column-move-to-${command.name.endsWith("down") ? "next" : "previous"}-desktop-nofocus`;
        case "move-window-to-workspace-down": case "move-window-to-workspace-up":
            return nofocus === "" ? undefined : `window-move-to-${command.name.endsWith("down") ? "next" : "previous"}-desktop-nofocus`;
        case "move-column-to-new-workspace-below": case "move-column-to-new-workspace-above":
        case "move-window-to-new-workspace-below": case "move-window-to-new-workspace-above":
            // a workspace reference is not mapped
            return arg !== undefined ? undefined : command.name.replace("-to-new-workspace-", "-to-new-desktop-") + nofocus;
        }
        return undefined;
    }

    function readBinds(nodes: Kdl.Node[]) {
        const binds: Record<string, string[]> = {};
        const skipped: string[] = [];
        const steps: Record<string, any> = {}; // set-column-width "+5%" gives the step of the width keys
        const bindNames = declaredWorkspaces(nodes); // the names that binds refer to; declared workspaces come first
        for (const block of Kdl.find(nodes, "binds")) {
            for (const bind of block.children) {
                if (bind.children.length === 0) {
                    continue;
                }
                const command = bind.children[0];
                const args = command.args;
                let action: string|undefined = desktopAction(command, bindNames);
                if (action !== undefined) {
                    // a workspace bind
                } else if (has(NUMBERED, command.name) && args.length > 0 && /^\d+$/.test(args[0])) {
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
        if (bindNames.length > 0) {
            steps["desktopBindNames"] = JSON.stringify(bindNames);
        }
        return { binds, skipped, steps };
    }

    // workspace "name" { ... } at the top level, in the order of the config
    function declaredWorkspaces(nodes: Kdl.Node[]) {
        const names: string[] = [];
        for (const node of Kdl.find(nodes, "workspace")) {
            if (node.args.length > 0 && !names.includes(node.args[0]) && names.length < 12) {
                names.push(node.args[0]);
            }
        }
        return names;
    }

    const COLOR_NAMES: Record<string, string> = {
        black: "#000000", white: "#ffffff", red: "#ff0000", green: "#008000", lime: "#00ff00",
        blue: "#0000ff", yellow: "#ffff00", orange: "#ffa500", purple: "#800080", pink: "#ffc0cb",
        cyan: "#00ffff", magenta: "#ff00ff", gray: "#808080", grey: "#808080", silver: "#c0c0c0",
        brown: "#a52a2a", transparent: "#00000000",
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

    // "#rrggbb", or "#rrggbbaa" when the colour is not opaque (niri's colours are CSS ones)
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
            return "#" + (h.length === 8 && h.substring(6) === "ff" ? h.substring(0, 6) : h);
        }
        const func = /^(rgba?|hsla?)\((.*)\)$/.exec(v);
        if (func !== null) {
            const parts = (func[2].match(/[\d.]+%?/g) ?? []);
            const nums = parts.slice(0, 3).map(x => parseFloat(x));
            if (nums.length === 3 && nums.every(x => !isNaN(x))) {
                let rgb: number[];
                if (func[1].startsWith("rgb")) {
                    rgb = nums.map(x => x);
                } else {
                    const hue = (((nums[0] / 360) % 1) + 1) % 1;
                    rgb = hslToRgb(hue, nums[1] / 100, nums[2] / 100).map(x => x * 255);
                }
                let alpha = parts.length > 3 ? parseFloat(parts[3]) : 1;
                if (parts.length > 3 && parts[3].endsWith("%")) {
                    alpha /= 100;
                }
                alpha = isNaN(alpha) ? 1 : Math.max(0, Math.min(1, alpha));
                return "#" + rgb.map(hex2).join("") + (alpha < 1 ? hex2(alpha * 255) : "");
            }
        }
        return undefined;
    }

    // niri's `active-gradient from="#80c8ff" to="#bbddff" angle=45 relative-to="workspace-view" in="oklch longer hue"` in the
    // one-line format of the Kiri settings: "from=#80c8ff to=#bbddff angle=45 relative-to=workspace-view in=oklch longer hue"
    function gradientString(node: Kdl.Node|undefined, warn: (msg: string) => void): string|undefined {
        if (node === undefined) {
            return undefined;
        }
        const from = parseColor(node.props["from"] ?? "");
        const to = parseColor(node.props["to"] ?? "");
        if (from === undefined || to === undefined) {
            warn(`${node.name} needs from and to colours`);
            return undefined;
        }
        let out = `from=${from} to=${to}`;
        for (const name of ["angle", "relative-to", "in"]) {
            if (node.props[name] !== undefined) {
                out += ` ${name}=${node.props[name]}`;
            }
        }
        return out;
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

    function colorSetting(node: Kdl.Node|undefined, key: string, out: Record<string, any>, warn: (msg: string) => void) {
        if (node === undefined || node.args.length === 0) {
            return;
        }
        const color = parseColor(node.args[0]);
        if (color !== undefined) {
            out[key] = color;
        } else {
            warn(`${key}: colour '${node.args[0]}' not understood`);
        }
    }

    // niri: a colour and a gradient of one state; the gradient wins, and a colour set after it (in the block) is ignored by niri too
    function colorOrGradient(node: Kdl.Node, name: string, key: string, out: Record<string, any>, warn: (msg: string) => void) {
        colorSetting(Kdl.child(node, name + "-color"), key + "Color", out, warn);
        const gradient = gradientString(Kdl.child(node, name + "-gradient"), warn);
        if (gradient !== undefined) {
            out[key + "Gradient"] = gradient;
        }
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
        for (const state of ["Active", "Inactive", "Urgent"]) {
            colorOrGradient(node, state.toLowerCase(), prefix + state, out, warn);
        }
    }

    function shadowSettings(node: Kdl.Node|undefined, out: Record<string, any>, warn: (msg: string) => void) {
        if (node === undefined) {
            return;
        }
        if (Kdl.child(node, "on")) {
            out["shadowEnabled"] = true;
        }
        if (Kdl.child(node, "off")) {
            out["shadowEnabled"] = false;
        }
        const offset = Kdl.child(node, "offset");
        if (offset !== undefined) {
            for (const [axis, key] of [["x", "shadowOffsetX"], ["y", "shadowOffsetY"]]) {
                if (offset.props[axis] !== undefined && !isNaN(parseFloat(offset.props[axis]))) {
                    out[key] = Math.round(parseFloat(offset.props[axis]));
                }
            }
        }
        for (const [name, key] of [["softness", "shadowSoftness"], ["spread", "shadowSpread"]]) {
            const value = Kdl.child(node, name);
            if (value !== undefined && value.args.length > 0 && !isNaN(parseFloat(value.args[0]))) {
                out[key] = Math.round(parseFloat(value.args[0]));
            }
        }
        const behind = Kdl.child(node, "draw-behind-window");
        if (behind !== undefined) {
            out["shadowDrawBehindWindow"] = (behind.args[0] ?? "true") !== "false";
        }
        colorSetting(Kdl.child(node, "color"), "shadowColor", out, warn);
        colorSetting(Kdl.child(node, "inactive-color"), "shadowInactiveColor", out, warn);
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

    // One match or exclude line as a Kiri matcher; undefined when it uses a matcher Kiri has no data for
    function matchOf(node: Kdl.Node, warn: (msg: string) => void): Record<string, any>|undefined {
        const entry: Record<string, any> = {};
        if (node.props["app-id"]) {
            entry["class"] = anchored(node.props["app-id"]);
        }
        if (node.props["title"]) {
            entry["caption"] = anchored(node.props["title"]);
        }
        for (const [niri, kiri] of [["is-floating", "isFloating"], ["is-active", "isActive"], ["is-focused", "isFocused"]]) {
            if (node.props[niri] !== undefined) {
                entry[kiri] = node.props[niri] === "true";
            }
        }
        const unknown = Object.keys(node.props).filter(name => !["app-id", "title", "is-floating", "is-active", "is-focused"].includes(name));
        if (unknown.length > 0) {
            warn(`window-rule matcher ${unknown.join(", ")} (a ${node.name} line that uses it is ignored)`);
            return undefined;
        }
        return entry;
    }

    function windowRules(nodes: Kdl.Node[], warn: (msg: string) => void) {
        const rules: Record<string, any>[] = [];
        for (const rule of Kdl.find(nodes, "window-rule")) {
            const matches = Kdl.find(rule.children, "match");
            const floatingNode = Kdl.child(rule, "open-floating");
            const floating = floatingNode !== undefined && floatingNode.args[0] !== "false";
            const width = size(Kdl.child(rule, "default-column-width"));
            const height = size(Kdl.child(rule, "default-window-height"));
            const fullscreenNode = Kdl.child(rule, "open-fullscreen");
            const fullscreen = fullscreenNode === undefined ? undefined : fullscreenNode.args[0] !== "false";
            if (matches.length === 0 || !(floating || width !== undefined || height !== undefined || fullscreen !== undefined)) {
                continue;
            }
            const excludes: Record<string, any>[] = [];
            for (const exclude of Kdl.find(rule.children, "exclude")) {
                const entry = matchOf(exclude, warn);
                if (entry !== undefined) {
                    excludes.push(entry);
                }
            }
            for (const match of matches) {
                const entry = matchOf(match, warn);
                if (entry === undefined) {
                    continue;
                }
                if (floating) {
                    entry["tile"] = false;
                }
                if (width !== undefined) {
                    entry["width"] = width;
                }
                if (height !== undefined) {
                    entry["height"] = height;
                }
                if (fullscreen !== undefined) {
                    entry["fullscreen"] = fullscreen;
                }
                if (excludes.length > 0) {
                    entry["exclude"] = excludes;
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
            if (Kdl.child(tab, "place-within-column")) {
                out["tabIndicatorPlaceWithinColumn"] = true;
            }
            for (const [niri, kiri] of [["gaps-between-tabs", "tabIndicatorGapsBetweenTabs"], ["corner-radius", "tabIndicatorCornerRadius"]]) {
                const node = Kdl.child(tab, niri);
                if (node !== undefined && number(node.args) !== undefined) {
                    out[kiri] = number(node.args);
                }
            }
            for (const state of ["Active", "Inactive", "Urgent"]) {
                colorOrGradient(tab, state.toLowerCase(), "tabIndicator" + state, out, warn);
            }
        }

        shadowSettings(L("shadow"), out, warn);
        const hint = L("insert-hint");
        if (hint !== undefined) {
            if (Kdl.child(hint, "off")) {
                out["insertHintEnabled"] = false;
            } else if (Kdl.child(hint, "on")) {
                out["insertHintEnabled"] = true;
            }
            colorSetting(Kdl.child(hint, "color"), "insertHintColor", out, warn);
            const hintGradient = gradientString(Kdl.child(hint, "gradient"), warn);
            if (hintGradient !== undefined) {
                out["insertHintGradient"] = hintGradient;
            }
        }
        colorSetting(L("fullscreen-backdrop-color"), "fullscreenBackdropColor", out, warn);
        colorSetting(L("background-color"), "backgroundColor", out, warn);

        out["hideTitlebars"] = Kdl.find(nodes, "prefer-no-csd").length > 0;
        // niri always has dynamic workspaces; Kiri's are an option that stays as the user set it
        if (L("empty-workspace-above-first") !== undefined) {
            out["emptyDesktopAboveFirst"] = true;
        }
        const declared = declaredWorkspaces(nodes);
        if (declared.length > 0) {
            out["namedDesktops"] = JSON.stringify(declared);
            if (Kdl.find(nodes, "workspace").some(node => node.children.length > 0)) {
                warn("workspace blocks: open-on-output and layout are not mapped (the names are)");
            }
        }
        for (const block of Kdl.find(nodes, "input")) {
            if (Kdl.child(block, "warp-mouse-to-focus")) {
                out["cursorFollowsFocus"] = true;
            }
            if (Kdl.child(block, "workspace-auto-back-and-forth")) {
                out["desktopAutoBackAndForth"] = true;
            }
        }
        const gestures = Kdl.find(nodes, "gestures");
        if (gestures.length > 0) {
            // niri: `off` disables the corners; naming other corners without top-left turns the top-left one off
            for (const block of gestures) {
                const corners = Kdl.child(block, "hot-corners");
                if (corners !== undefined) {
                    const others = ["top-right", "bottom-left", "bottom-right"].some(name => Kdl.child(corners, name) !== undefined);
                    if (Kdl.child(corners, "off") !== undefined || (others && Kdl.child(corners, "top-left") === undefined)) {
                        out["hotCorner"] = false;
                    }
                }
            }
            warn("gestures block (Kiri maps only hot-corners off; no other gesture options)");
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
