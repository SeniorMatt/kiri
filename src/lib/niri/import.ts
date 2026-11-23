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
        "focus-monitor-left": "focus-monitor-left",
        "focus-monitor-right": "focus-monitor-right",
        "focus-monitor-up": "focus-monitor-up",
        "focus-monitor-down": "focus-monitor-down",
        "focus-monitor-next": "focus-monitor-next",
        "focus-monitor-previous": "focus-monitor-previous",
        "move-column-to-monitor-left": "column-move-to-monitor-left",
        "move-column-to-monitor-right": "column-move-to-monitor-right",
        "move-column-to-monitor-up": "column-move-to-monitor-up",
        "move-column-to-monitor-down": "column-move-to-monitor-down",
        "move-column-to-monitor-next": "column-move-to-monitor-next",
        "move-column-to-monitor-previous": "column-move-to-monitor-previous",
        "move-window-to-monitor-left": "window-move-to-monitor-left",
        "move-window-to-monitor-right": "window-move-to-monitor-right",
        "move-window-to-monitor-up": "window-move-to-monitor-up",
        "move-window-to-monitor-down": "window-move-to-monitor-down",
        "move-window-to-monitor-next": "window-move-to-monitor-next",
        "move-window-to-monitor-previous": "window-move-to-monitor-previous",
        "focus-workspace-previous": "desktop-previous-used",
        "move-workspace-down": "desktop-move-down",
        "move-workspace-up": "desktop-move-up",
        "move-window-to-floating": "window-move-to-floating",
        "move-window-to-tiling": "window-move-to-tiling",
        "focus-floating": "focus-floating",
        "focus-tiling": "focus-tiling",
        "focus-window-previous": "focus-window-previous",
        "open-overview": "overview-open",
        "close-overview": "overview-close",
        "toggle-window-rule-opacity": "window-toggle-rule-opacity",
        // in niri's scrolling layout the width of a window is the width of its column
        "switch-preset-window-width": "cycle-preset-widths",
        "switch-preset-window-width-back": "cycle-preset-widths-reverse",
        "set-window-fullscreen": "window-set-fullscreen",
        "unset-window-fullscreen": "window-unset-fullscreen",
        "set-windowed-fullscreen": "window-set-windowed-fullscreen",
        "unset-windowed-fullscreen": "window-unset-windowed-fullscreen",
        "set-window-maximized-to-edges": "window-set-maximized-to-edges",
        "unset-window-maximized-to-edges": "window-unset-maximized-to-edges",
        // with one output these do what the plain action does (niri: no output in that direction)
        "focus-window-or-monitor-up": "focus-up",
        "focus-window-or-monitor-down": "focus-down",
        "focus-column-or-monitor-left": "focus-left",
        "focus-column-or-monitor-right": "focus-right",
        "move-column-left-or-to-monitor-left": "column-move-left",
        "move-column-right-or-to-monitor-right": "column-move-right",
    };

    // the same actions with focus=false (the focus stays where it was, see Actions.columnMoveNoFocus)
    const NO_FOCUS: Record<string, string> = {
        "move-column-left": "column-move-left-no-focus",
        "move-column-right": "column-move-right-no-focus",
        "move-column-to-first": "column-move-start-no-focus",
        "move-column-to-last": "column-move-end-no-focus",
        "move-window-up": "window-move-up-no-focus",
        "move-window-down": "window-move-down-no-focus",
        "swap-window-left": "window-swap-left-no-focus",
        "swap-window-right": "window-swap-right-no-focus",
    };

    const NUMBERED: Record<string, string> = {
        "focus-workspace": "desktop-{}",
        "move-column-to-workspace": "column-move-to-desktop-{}",
        "move-window-to-workspace": "window-move-to-desktop-{}",
        "focus-column": "focus-{}",
        "focus-window-in-column": "focus-window-in-column-{}",
        "move-column-to-index": "column-move-to-column-{}",
    };

    const NUMBERED_NO_FOCUS: Record<string, string> = {
        "move-column-to-index": "column-move-to-column-no-focus-{}",
    };
    const NO_FOCUS_SLOTS = 12; // how many numbered no-focus actions Kiri has
    const SIZE_SLOTS = 12; // how many column-width-set-N and window-height-set-N actions Kiri has

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

    // `mod` is what niri's Mod stands for (input { mod-key }): Kiri's name of that modifier, Meta (Super) by default
    export function convertKey(niriKey: string, mod = "Meta"): string|undefined {
        const parts = niriKey.split("+");
        let key = parts.pop() as string;
        const mods = new Set<string>();
        for (const modifier of parts) {
            const lower = modifier.toLowerCase();
            if (!has(MODIFIERS, lower)) {
                return undefined;
            }
            mods.add(lower === "mod" ? mod : MODIFIERS[lower]);
        }
        if (/^F\d{1,2}$/i.test(key) || key.length === 1) {
            key = key.toUpperCase();
        } else if (has(KEYS, key.toLowerCase())) {
            key = KEYS[key.toLowerCase()];
        } else {
            return undefined; // mouse wheel, XF86 keys etc.
        }
        const sorted = MODIFIER_ORDER.filter(modifier => mods.has(modifier));
        return [...sorted, key].join("+");
    }

    // Workspace binds that need more than a name lookup: a workspace by name (the Nth name of the bind list is the
    // shortcut "...-named-N", 12 at most), focus=false, new workspaces, move-workspace-to-index.
    function desktopAction(command: Kdl.Node, names: string[]): string|undefined {
        const arg = command.args[0];
        const noFocusSuffix = command.props["focus"] === "false" ? "-no-focus" : "";
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
                return command.name === "focus-workspace" ? undefined : `${kind}${noFocusSuffix}-${arg}`;
            }
            return noFocusSuffix !== "" || slot(arg) < 1 ? undefined : `${kind}-named-${slot(arg)}`;
        }
        case "set-workspace-name":
            return arg === undefined || slot(arg) < 1 ? undefined : `set-desktop-name-${slot(arg)}`;
        case "unset-workspace-name":
            return arg === undefined ? "unset-desktop-name" : undefined;
        case "move-workspace-to-index":
            return arg !== undefined && /^\d+$/.test(arg) ? `move-desktop-to-index-${arg}` : undefined;
        case "move-column-to-workspace-down": case "move-column-to-workspace-up":
            return noFocusSuffix === "" ? undefined : `column-move-to-${command.name.endsWith("down") ? "next" : "previous"}-desktop-no-focus`;
        case "move-window-to-workspace-down": case "move-window-to-workspace-up":
            return noFocusSuffix === "" ? undefined : `window-move-to-${command.name.endsWith("down") ? "next" : "previous"}-desktop-no-focus`;
        case "move-column-to-new-workspace-below": case "move-column-to-new-workspace-above":
        case "move-window-to-new-workspace-below": case "move-window-to-new-workspace-above":
            // a workspace reference is not mapped
            return arg !== undefined ? undefined : `${command.name.startsWith("move-column") ? "column" : "window"}-move-to-new-desktop-${command.name.endsWith("below") ? "below" : "above"}${noFocusSuffix}`;
        }
        return undefined;
    }


    // niri's mod-key names -> Kiri's modifier names
    const MOD_KEYS: Record<string, string> = { super: "Meta", alt: "Alt", ctrl: "Ctrl", shift: "Shift" };

    // The pointer triggers of niri's binds that Kiri's effect can take: the wheel and the mouse buttons.
    // TouchpadScroll* is continuous in KWin (no ticks to count) and TabletStylusButton* has no KWin hook.
    const POINTER_TRIGGERS = [
        "WheelScrollDown", "WheelScrollUp", "WheelScrollLeft", "WheelScrollRight",
        "MouseLeft", "MouseRight", "MouseMiddle", "MouseForward", "MouseBack",
    ];

    // "Mod+Ctrl+WheelScrollDown" -> "Meta+Ctrl+WheelScrollDown" (Kiri's pointerBinds setting names triggers like niri does)
    export function convertPointerKey(niriKey: string, mod = "Meta"): string|undefined {
        const parts = niriKey.split("+");
        const last = (parts.pop() as string).toLowerCase();
        const trigger = POINTER_TRIGGERS.find(name => name.toLowerCase() === last);
        if (trigger === undefined) {
            return undefined;
        }
        const keys = convertKey([...parts, "A"].join("+"), mod);
        return keys === undefined ? undefined : keys.substring(0, keys.length - 1) + trigger;
    }

    // why a niri action has no Kiri action (a regex on the name, the reason that is told)
    const UNMAPPED: [RegExp, string][] = [
        [/^(spawn|spawn-sh)$/, "starts a program: a Plasma command shortcut (tools/niri2kiri.py --apply makes them)"],
        [/^screenshot/, "screenshots are Spectacle's"],
        [/^show-hotkey-overlay$/, "Kiri has no hotkey overlay"],
        [/^(quit|suspend|power-off-monitors|power-on-monitors|change-vt|toggle-touchpad|do-screen-transition)$/, "session and hardware actions are Plasma's"],
        [/^switch-layout$/, "keyboard layouts are Plasma's"],
        [/^toggle-keyboard-shortcuts-inhibit$/, "KWin has its own shortcut inhibit key"],
        [/^(set-dynamic-cast|clear-dynamic-cast|stop-cast)/, "screencast targets are Plasma's"],
        [/^(toggle-debug-tint|debug-toggle)/, "niri renderer debugging"],
        [/monitor/, "monitors are numbered by position, not named, and workspaces are not tied to a monitor (the nearest are focus-monitor-*, move-*-to-monitor-* and screen-switch)"],
        [/^(focus-workspace|move-(window|column)-to-workspace)$/, "this workspace reference is not mapped (a name with focus=false, or more than 12 names)"],
        [/-by-id$|^focus-window$|^load-config-file$|^mru-/, "IPC and window switcher actions cannot be bound"],
    ];

    // undefined when the importer has no explicit reason for the action
    export function unmappedReason(name: string, args: string[]): string|undefined {
        const found = UNMAPPED.find(([regex]) => regex.test(name));
        return found === undefined ? undefined : found[1];
    }

    function isFalse(value: string|undefined) {
        return value === "false" || value === "#false";
    }

    // a bind that has `focus=false` (the property of the move actions)
    function withoutFocus(command: Kdl.Node) {
        return isFalse(command.props["focus"]);
    }

    function readBinds(nodes: Kdl.Node[], mod: string) {
        const binds: Record<string, string[]> = {};
        const pointer: string[] = [];
        const skipped: string[] = [];
        const steps: Record<string, any> = {}; // set-column-width "+5%" gives the step of the width keys
        const slots: Record<string, string[]> = { column: [], window: [] }; // the sizes the other set-column-width and set-window-height binds set
        let hasBinds = false;
        const bindNames = declaredWorkspaces(nodes); // the names that binds refer to; declared workspaces come first
        for (const block of Kdl.find(nodes, "binds")) {
            hasBinds = true;
            for (const bind of block.children) {
                // `press { action }` is a plain bind; a `release { action }` needs the key release, which kglobalaccel does not give
                const commands = bind.children.length > 0 && ["press", "release"].includes(bind.children[0].name) ?
                    bind.children.flatMap(node => node.name === "press" ? node.children : [node]) :
                    bind.children.slice(0, 1);
                for (const command of commands) {
                    const args = command.args;
                    let action: string|undefined = desktopAction(command, bindNames);
                    let reason: string|undefined;
                    if (action !== undefined) {
                        // a workspace bind
                    } else if (has(NUMBERED, command.name) && args.length > 0 && /^\d+$/.test(args[0])) {
                        const noFocus = withoutFocus(command);
                        if (noFocus && (!has(NUMBERED_NO_FOCUS, command.name) || parseInt(args[0]) > NO_FOCUS_SLOTS)) {
                            reason = `focus=false only for numbers up to ${NO_FOCUS_SLOTS}`;
                        } else {
                            action = (noFocus ? NUMBERED_NO_FOCUS : NUMBERED)[command.name].replace("{}", args[0]);
                        }
                    } else if (withoutFocus(command) && has(NO_FOCUS, command.name)) {
                        action = NO_FOCUS[command.name];
                    } else if (/^set-(column-width|window-width|window-height)$/.test(command.name) && args.length > 0 && SizeChange.parse(args[0]) !== undefined) {
                        action = sizeAction(command.name, args[0].trim(), steps, slots);
                        reason = action === undefined ? `more than ${SIZE_SLOTS} different sizes` : undefined;
                    } else if (command.name === "set-column-display" && (args[0] === "tabbed" || args[0] === "normal")) {
                        action = "column-display-" + args[0];
                    } else if (command.name === "focus-window-previous") {
                        action = focusPreviousAction(command.props["scope"], command.props["filter"]);
                    } else if (has(ACTIONS, command.name)) {
                        action = ACTIONS[command.name];
                    }
                    const description = `bind ${bind.name} ${[command.name, ...args].join(" ")}`;
                    const key = convertKey(bind.name, mod);
                    const pointerKey = key === undefined ? convertPointerKey(bind.name, mod) : undefined;
                    if (command.name === "release") {
                        skipped.push(`bind ${bind.name} release: release actions cannot be bound (kglobalaccel gets no key release)`);
                    } else if (action === undefined) {
                        skipped.push(`${description}: ${reason ?? unmappedReason(command.name, args) ?? "Kiri has no such action"}`);
                    } else if (key !== undefined) {
                        (binds[action] = binds[action] ?? []).push(key);
                    } else if (pointerKey !== undefined) {
                        const cooldown = parseInt(bind.props["cooldown-ms"] ?? "");
                        pointer.push(`${pointerKey}=${action}${cooldown > 0 ? "@" + cooldown : ""}`);
                    } else {
                        skipped.push(`${description}: ${keyReason(bind.name)}`);
                    }
                }
            }
        }
        if (bindNames.length > 0) {
            steps["desktopBindNames"] = JSON.stringify(bindNames);
        }
        return { binds, pointer: hasBinds ? pointer.join("\n") : undefined, skipped, steps, slots };
    }

    function keyReason(niriKey: string) {
        const trigger = niriKey.split("+").pop() as string;
        if (/^TouchpadScroll/.test(trigger)) {
            return "touchpad scrolling gives KWin no ticks to bind";
        }
        if (/^TabletStylusButton/.test(trigger)) {
            return "stylus buttons have no KWin hook";
        }
        if (/^(Mod|Super|Ctrl|Control|Shift|Alt|Win)$/i.test(trigger)) {
            return "a modifier on its own cannot be bound";
        }
        if (/^XF86/i.test(trigger)) {
            return "media and hardware keys are Plasma's (tools/niri2kiri.py --apply makes command shortcuts of the spawn ones)";
        }
        return "key or modifier Kiri does not know";
    }

    function focusPreviousAction(scope: string|undefined, filter: string|undefined) {
        const parts = [scope === "workspace" || scope === "output" ? scope : "", filter === "app-id" ? "app" : ""].filter(part => part !== "");
        return ["focus-window-previous", ...parts].join("-");
    }

    // The Kiri action for set-column-width, set-window-width and set-window-height: "+10%" keeps to the width and height
    // step keys of the first such bind; any other size gets one of the numbered "set to" actions, with the size
    // stored in the columnWidthSet / windowHeightSet setting.
    function sizeAction(niriName: string, value: string, steps: Record<string, any>, slots: Record<string, string[]>) {
        const kind = niriName === "set-window-height" ? "window" : "column";
        const percentStep = /^[+-]\d+%$/.exec(value);
        if (percentStep !== null) {
            const stepName = kind === "column" ? "columnWidthStep" : "windowHeightStep";
            const step = parseInt(value.substring(1));
            if (steps[stepName] === undefined) {
                steps[stepName] = step;
            }
            if (steps[stepName] === step) {
                return (kind === "column" ? "column-width" : "window-height") + (value.startsWith("-") ? "-decrease" : "-increase");
            }
        }
        const list = slots[kind];
        let index = list.indexOf(value);
        if (index < 0) {
            if (list.length >= SIZE_SLOTS) {
                return undefined;
            }
            list.push(value);
            index = list.length - 1;
        }
        return (kind === "column" ? "column-width-set-" : "window-height-set-") + (index + 1);
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
        if (!isFinite(value) || value <= 0) {
            return undefined; // niri refuses these too; "Infinity%" or "0px" would collapse the columns
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

    // a number from the config is a size in pixels: infinity or 1e300 would put every window off the screen
    const MAX_PIXELS = 10000;

    function number(args: string[]): number|undefined {
        const value = parseFloat(args[0]);
        return isFinite(value) ? Math.max(-MAX_PIXELS, Math.min(MAX_PIXELS, Math.trunc(value))) : undefined;
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

    const MATCHERS: Record<string, string> = {
        "app-id": "appId", "title": "title", "is-floating": "isFloating", "is-active": "isActive", "is-focused": "isFocused",
        "is-active-in-column": "isActiveInColumn", "is-urgent": "isUrgent", "is-window-cast-target": "isWindowCastTarget",
        "at-startup": "atStartup",
    };

    // One match or exclude line as a Kiri matcher; undefined when it uses a matcher Kiri does not know. The regexes are
    // kept as niri has them: Kiri's appId and title match anywhere in the string, with Rust's regex syntax.
    function matchOf(node: Kdl.Node, warn: (msg: string) => void): Record<string, any>|undefined {
        const entry: Record<string, any> = {};
        const unknown = Object.keys(node.props).filter(name => !has(MATCHERS, name));
        if (unknown.length > 0) {
            warn(`window-rule/${node.name}: matcher ${unknown.join(", ")} is not supported, a line that uses it is ignored`);
            return undefined;
        }
        for (const [niri, kiri] of Object.entries(MATCHERS)) {
            const value = node.props[niri];
            if (value === undefined) {
                continue;
            }
            if (kiri === "appId" || kiri === "title") {
                if (value !== "") {
                    entry[kiri] = value;
                }
            } else {
                entry[kiri] = value === "true";
            }
        }
        return entry;
    }

    function flag(node: Kdl.Node|undefined): boolean|undefined {
        return node === undefined ? undefined : node.args[0] !== "false";
    }

    function colorOf(node: Kdl.Node|undefined, warn: (msg: string) => void, what: string): string|undefined {
        if (node === undefined || node.args.length === 0) {
            return undefined;
        }
        const color = parseColor(node.args[0]);
        if (color === undefined) {
            warn(`window-rule/${what}: colour '${node.args[0]}' not understood`);
        }
        return color;
    }

    // the colour and the gradient of one state (a rule's focus-ring, border or tab-indicator), in the format of the settings
    function stateColors(node: Kdl.Node, out: Record<string, any>, warn: (msg: string) => void, what: string) {
        for (const state of ["active", "inactive", "urgent"]) {
            const color = colorOf(Kdl.child(node, state + "-color"), warn, `${what} ${state}`);
            if (color !== undefined) {
                out[state + "Color"] = color;
            }
            const gradient = gradientString(Kdl.child(node, state + "-gradient"), warn);
            if (gradient !== undefined) {
                out[state + "Gradient"] = gradient;
            }
        }
    }

    // the focus-ring and border rules
    function ringRule(node: Kdl.Node, warn: (msg: string) => void): Record<string, any>|undefined {
        const out: Record<string, any> = {};
        if (Kdl.child(node, "off")) {
            out["enabled"] = false;
        } else if (Kdl.child(node, "on")) {
            out["enabled"] = true;
        }
        const width = Kdl.child(node, "width");
        if (width !== undefined && number(width.args) !== undefined) {
            out["width"] = number(width.args);
        }
        stateColors(node, out, warn, node.name);
        return Object.keys(out).length > 0 ? out : undefined;
    }

    // a number of a window rule as a finite, sane one (infinity or 1e300 would put windows off the screen)
    function finiteNumber(raw: string|undefined): number|undefined {
        const value = parseFloat(raw ?? "");
        return isFinite(value) ? Math.max(-MAX_PIXELS, Math.min(MAX_PIXELS, value)) : undefined;
    }

    function shadowRule(node: Kdl.Node, warn: (msg: string) => void): Record<string, any>|undefined {
        const out: Record<string, any> = {};
        if (Kdl.child(node, "off")) {
            out["enabled"] = false;
        } else if (Kdl.child(node, "on")) {
            out["enabled"] = true;
        }
        for (const name of ["softness", "spread"]) {
            const child = Kdl.child(node, name);
            const value = finiteNumber(child?.args[0]);
            if (value !== undefined) {
                out[name] = value;
            }
        }
        const offset = Kdl.child(node, "offset");
        if (offset !== undefined) {
            const x = finiteNumber(offset.props["x"]);
            const y = finiteNumber(offset.props["y"]);
            if (x !== undefined) {
                out["offsetX"] = x;
            }
            if (y !== undefined) {
                out["offsetY"] = y;
            }
        }
        const behind = flag(Kdl.child(node, "draw-behind-window"));
        if (behind !== undefined) {
            out["drawBehindWindow"] = behind;
        }
        const color = colorOf(Kdl.child(node, "color"), warn, "shadow");
        if (color !== undefined) {
            out["color"] = color;
        }
        const inactive = colorOf(Kdl.child(node, "inactive-color"), warn, "shadow inactive");
        if (inactive !== undefined) {
            out["inactiveColor"] = inactive;
        }
        return Object.keys(out).length > 0 ? out : undefined;
    }

    function tabIndicatorRule(node: Kdl.Node, warn: (msg: string) => void): Record<string, any>|undefined {
        const out: Record<string, any> = {};
        stateColors(node, out, warn, "tab-indicator");
        return Object.keys(out).length > 0 ? out : undefined;
    }

    const POSITIONS = ["top-left", "top-right", "bottom-left", "bottom-right", "top", "bottom", "left", "right"];

    // The properties of one window-rule as the keys of a Kiri rule, in niri's order. `radiusIsGlobal` leaves
    // geometry-corner-radius out (it is the global cornerRadius setting then).
    function ruleProperties(rule: Kdl.Node, warn: (msg: string) => void, radiusIsGlobal: boolean): Record<string, any> {
        const out: Record<string, any> = {};
        const floating = flag(Kdl.child(rule, "open-floating"));
        if (floating !== undefined) {
            out["tile"] = !floating;
        }
        for (const [niri, kiri] of [["default-column-width", "width"], ["default-window-height", "height"]]) {
            const node = Kdl.child(rule, niri);
            if (node !== undefined) {
                out[kiri] = size(node) ?? ""; // an empty block lets the window pick its own size
            }
        }
        for (const [niri, kiri] of [["open-fullscreen", "fullscreen"], ["open-maximized", "maximized"], ["open-maximized-to-edges", "maximizedToEdges"], ["open-focused", "focused"]]) {
            const value = flag(Kdl.child(rule, niri));
            if (value !== undefined) {
                out[kiri] = value;
            }
        }
        const workspace = Kdl.child(rule, "open-on-workspace");
        if (workspace !== undefined && workspace.args[0] !== undefined) {
            out["workspace"] = workspace.args[0];
        }
        const display = Kdl.child(rule, "default-column-display");
        if (display !== undefined && (display.args[0] === "tabbed" || display.args[0] === "normal")) {
            out["columnDisplay"] = display.args[0];
        }
        const position = Kdl.child(rule, "default-floating-position");
        const positionX = finiteNumber(position?.props["x"]);
        const positionY = finiteNumber(position?.props["y"]);
        if (position !== undefined && positionX !== undefined && positionY !== undefined) {
            out["floatingPosition"] = { x: positionX, y: positionY };
            const relativeTo = position.props["relative-to"];
            if (relativeTo !== undefined && POSITIONS.includes(relativeTo) && relativeTo !== "top-left") {
                out["floatingPosition"].relativeTo = relativeTo;
            }
        }
        for (const [niri, kiri] of [["min-width", "minWidth"], ["min-height", "minHeight"], ["max-width", "maxWidth"], ["max-height", "maxHeight"]]) {
            const node = Kdl.child(rule, niri);
            if (node !== undefined && number(node.args) !== undefined) {
                out[kiri] = Math.max(0, number(node.args) as number);
            }
        }
        const opacity = Kdl.child(rule, "opacity");
        if (opacity !== undefined && finiteNumber(opacity.args[0]) !== undefined) {
            out["opacity"] = Math.max(0, Math.min(1, finiteNumber(opacity.args[0]) as number));
        }
        for (const [niri, kiri, convert] of [
            ["focus-ring", "focusRing", ringRule], ["border", "border", ringRule],
            ["shadow", "shadow", shadowRule], ["tab-indicator", "tabIndicator", tabIndicatorRule],
        ] as [string, string, (node: Kdl.Node, warn: (msg: string) => void) => Record<string, any>|undefined][]) {
            const node = Kdl.child(rule, niri);
            const converted = node === undefined ? undefined : convert(node, warn);
            if (converted !== undefined) {
                out[kiri] = converted;
            }
        }
        const radius = Kdl.child(rule, "geometry-corner-radius");
        if (radius !== undefined && !radiusIsGlobal) {
            const values = radius.args.map(arg => finiteNumber(arg)).filter((value): value is number => value !== undefined);
            if (values.length === 1 || values.length === 4) {
                // the effect has one radius per window: niri's four corners (top-left first) give their largest one
                if (values.length === 4 && values.some(value => value !== values[0])) {
                    warn("window-rule/geometry-corner-radius: different corners are not supported, the largest radius is used for all");
                }
                out["cornerRadius"] = Math.max(0, Math.round(Math.max(...values)));
            }
        }
        return out;
    }

    function windowRules(nodes: Kdl.Node[], warn: (msg: string) => void) {
        const rules: Record<string, any>[] = [];
        let radius: number|undefined;
        const warned = new Set<string>();
        for (const rule of Kdl.find(nodes, "window-rule")) {
            const matches = Kdl.find(rule.children, "match");
            const excludeNodes = Kdl.find(rule.children, "exclude");
            // a rule for every window that sets geometry-corner-radius is the global setting
            const radiusNode = Kdl.child(rule, "geometry-corner-radius");
            const radiusIsGlobal = matches.length === 0 && excludeNodes.length === 0;
            if (radiusIsGlobal && radiusNode !== undefined && number(radiusNode.args) !== undefined && radiusNode.args.length === 1) {
                radius = Math.max(0, number(radiusNode.args) as number);
            }
            const properties = ruleProperties(rule, warn, radiusIsGlobal && radiusNode !== undefined && radiusNode.args.length === 1);
            if (Object.keys(properties).length === 0) {
                continue;
            }
            const excludes: Record<string, any>[] = [];
            for (const exclude of excludeNodes) {
                const entry = matchOf(exclude, warn);
                if (entry !== undefined) {
                    excludes.push(entry);
                }
            }
            // a rule without match lines applies to every window
            const lines: (Kdl.Node|undefined)[] = matches.length === 0 ? [undefined] : matches;
            for (const match of lines) {
                const entry = match === undefined ? {} : matchOf(match, warn);
                if (entry === undefined) {
                    continue;
                }
                Object.assign(entry, properties);
                if (excludes.length > 0) {
                    entry["exclude"] = excludes;
                }
                rules.push(entry);
            }
        }
        return { rules, radius };
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
            warn("layout/struts: ignored without gaps (Kiri's gaps default is 16, niri's too, so add 'gaps 16' to use them)");
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
            if (length !== undefined && length.props["total-proportion"] !== undefined && isFinite(parseFloat(length.props["total-proportion"]))) {
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
            const follows = Kdl.child(block, "focus-follows-mouse");
            if (follows !== undefined) {
                out["focusFollowsMouse"] = true;
                const maxScroll = parseFloat(follows.props["max-scroll-amount"] ?? "");
                out["focusFollowsMouseMaxScroll"] = isNaN(maxScroll) ? 100 : Math.max(0, Math.round(maxScroll)); // the share of the screen the view may scroll for it; without the property there is no limit
            }
        }
        const gestures = Kdl.find(nodes, "gestures");
        // niri: `off` disables the corners; with none of the four named the top-left one is the default, and naming
        // other corners without top-left leaves only those (the last gestures / hot-corners block wins, as in niri)
        for (const block of gestures) {
            const corners = Kdl.child(block, "hot-corners");
            if (corners !== undefined) {
                out["hotCorner"] = Kdl.child(corners, "off") === undefined;
                const named = ["top-left", "top-right", "bottom-left", "bottom-right"].map(name => Kdl.child(corners, name) !== undefined);
                const none = !named.some(x => x);
                out["hotCornerTopLeft"] = none || named[0];
                out["hotCornerTopRight"] = named[1];
                out["hotCornerBottomLeft"] = named[2];
                out["hotCornerBottomRight"] = named[3];
            }
            for (const [name, prefix, size] of [["dnd-edge-view-scroll", "dndEdgeViewScroll", "trigger-width"], ["dnd-edge-workspace-switch", "dndEdgeWorkspaceSwitch", "trigger-height"]]) {
                const node = Kdl.child(block, name);
                if (node === undefined) {
                    continue;
                }
                const sizeValue = Kdl.child(node, size);
                if (sizeValue !== undefined && !isNaN(parseFloat(sizeValue.args[0]))) {
                    out[prefix + (size === "trigger-width" ? "TriggerWidth" : "TriggerHeight")] = parseFloat(sizeValue.args[0]);
                }
                const delay = Kdl.child(node, "delay-ms");
                if (delay !== undefined && !isNaN(parseFloat(delay.args[0]))) {
                    out[prefix + "Delay"] = Math.round(parseFloat(delay.args[0]));
                }
                const speed = Kdl.child(node, "max-speed");
                if (speed !== undefined && !isNaN(parseFloat(speed.args[0]))) {
                    out[prefix + "MaxSpeed"] = parseFloat(speed.args[0]);
                }
            }
        }
        for (const block of Kdl.find(nodes, "animations")) {
            // niri: `off` of any block turns the animations off, `on` turns them on again; the last slowdown wins
            if (Kdl.child(block, "off") !== undefined) {
                out["animationsOff"] = true;
            }
            if (Kdl.child(block, "on") !== undefined) {
                out["animationsOff"] = false;
            }
            const slowdown = Kdl.child(block, "slowdown");
            if (slowdown !== undefined && !isNaN(parseFloat(slowdown.args[0]))) {
                out["animationsSlowdown"] = Math.max(0, parseFloat(slowdown.args[0]));
            }
            // an animation node replaces the whole animation of the blocks before it
            for (const [name, key, fallback] of ANIMATIONS) {
                const node = Kdl.child(block, name);
                if (node !== undefined) {
                    out[key] = animationText(node, fallback, "animations/" + name, warn);
                }
            }
        }
        for (const block of Kdl.find(nodes, "overview")) {
            const zoom = Kdl.child(block, "zoom");
            if (zoom !== undefined && !isNaN(parseFloat(zoom.args[0]))) {
                out["overviewZoom"] = Math.max(0, Math.min(1, parseFloat(zoom.args[0])));
            }
            colorSetting(Kdl.child(block, "backdrop-color"), "overviewBackdropColor", out, warn);
            const shadow = Kdl.child(block, "workspace-shadow");
            if (shadow !== undefined) {
                if (Kdl.child(shadow, "off")) {
                    out["overviewShadowEnabled"] = false;
                }
                if (Kdl.child(shadow, "on")) {
                    out["overviewShadowEnabled"] = true;
                }
                const offset = Kdl.child(shadow, "offset");
                if (offset !== undefined) {
                    for (const [axis, key] of [["x", "overviewShadowOffsetX"], ["y", "overviewShadowOffsetY"]]) {
                        if (offset.props[axis] !== undefined && !isNaN(parseFloat(offset.props[axis]))) {
                            out[key] = parseFloat(offset.props[axis]);
                        }
                    }
                }
                for (const [name, key] of [["softness", "overviewShadowSoftness"], ["spread", "overviewShadowSpread"]]) {
                    const value = Kdl.child(shadow, name);
                    if (value !== undefined && value.args.length > 0 && !isNaN(parseFloat(value.args[0]))) {
                        out[key] = parseFloat(value.args[0]);
                    }
                }
                colorSetting(Kdl.child(shadow, "color"), "overviewShadowColor", out, warn);
            }
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

    // niri's animations: the setting of each is one text (src/lib/config/definition.ts, animWindowOpen and the others)
    const ANIMATIONS: [string, string, string][] = [
        ["window-open", "animWindowOpen", "ease-out-expo 150"],
        ["window-close", "animWindowClose", "ease-out-quad 150"],
        ["window-movement", "animWindowMovement", "spring 1 800 0.0001"],
        ["window-resize", "animWindowResize", "spring 1 800 0.0001"],
        ["horizontal-view-movement", "animHorizontalViewMovement", "spring 1 800 0.0001"],
        ["workspace-switch", "animWorkspaceSwitch", "spring 1 1000 0.0001"],
        ["overview-open-close", "animOverviewOpenClose", "spring 1 800 0.0001"],
    ];
    const CURVES = ["linear", "ease-out-quad", "ease-out-cubic", "ease-out-expo"];

    function formatNumber(x: number) {
        return String(x);
    }

    // niri-config/src/animations.rs Animation::decode_node: `off`, a `spring`, or `duration-ms` and `curve` (the missing
    // one of the two from the animation's default easing, or 250 ms / ease-out-cubic when the default is a spring)
    function animationText(node: Kdl.Node, fallback: string, path: string, warn: (msg: string) => void): string {
        if (Kdl.child(node, "custom-shader") !== undefined) {
            warn(`${path}/custom-shader: niri's custom shaders are GLSL for niri's renderer, not KWin's`);
        }
        const [fallbackKind, ...fallbackArgs] = fallback.split(" ");
        const spring = Kdl.child(node, "spring");
        const duration = Kdl.child(node, "duration-ms");
        const curve = Kdl.child(node, "curve");
        if (Kdl.child(node, "off") !== undefined) {
            return "off";
        }
        if (spring !== undefined) {
            const springDefault = fallbackKind === "spring" ? fallbackArgs : ["1", "800", "0.0001"];
            const values = [["damping-ratio", 0], ["stiffness", 1], ["epsilon", 2]].map(([prop, i]) => {
                const value = parseFloat(spring.props[prop as string] ?? "");
                return isNaN(value) ? springDefault[i as number] : formatNumber(value);
            });
            return "spring " + values.join(" ");
        }
        if (duration === undefined && curve === undefined) {
            return fallback;
        }
        const easingDefault = fallbackKind === "spring" ? ["ease-out-cubic", "250"] : [fallbackKind, ...fallbackArgs];
        let curveName = easingDefault[0];
        let ms = easingDefault[1];
        let bezier: string[] = [];
        if (duration !== undefined && !isNaN(parseFloat(duration.args[0]))) {
            ms = formatNumber(parseFloat(duration.args[0]));
        }
        if (curve !== undefined) {
            const name = curve.args[0] ?? "";
            const points = curve.args.slice(1, 5).map(x => parseFloat(x));
            if (CURVES.includes(name)) {
                curveName = name;
            } else if (name === "cubic-bezier" && points.length === 4 && !points.some(x => isNaN(x))) {
                curveName = name;
                bezier = points.map(formatNumber);
            } else {
                warn(`${path}: unknown curve ${name}, niri only has linear, ease-out-quad, ease-out-cubic, ease-out-expo and cubic-bezier with 4 numbers`);
            }
        }
        return [curveName, ms, ...bezier].join(" ");
    }

    // What the importer reads, by path in the config (the blocks that hold options are looked into one level down).
    // Everything else is reported as skipped, with the reason from SKIPPED_OPTIONS.
    const MAPPED_OPTIONS = new Set([
        "binds", "prefer-no-csd", "layout", "input", "gestures", "window-rule", "workspace",
        "layout/gaps", "layout/struts", "layout/center-focused-column", "layout/always-center-single-column",
        "layout/preset-column-widths", "layout/preset-window-heights", "layout/default-column-width",
        "layout/default-column-display", "layout/focus-ring", "layout/border", "layout/tab-indicator", "layout/shadow",
        "layout/insert-hint", "layout/fullscreen-backdrop-color", "layout/background-color", "layout/empty-workspace-above-first",
        "input/warp-mouse-to-focus", "input/focus-follows-mouse", "input/mod-key", "input/workspace-auto-back-and-forth", "gestures/hot-corners",
        "window-rule/match", "window-rule/exclude", "window-rule/open-floating", "window-rule/open-fullscreen",
        "window-rule/default-column-width", "window-rule/default-window-height", "window-rule/geometry-corner-radius",
        "window-rule/open-maximized", "window-rule/open-maximized-to-edges", "window-rule/open-focused", "window-rule/open-on-workspace",
        "window-rule/default-column-display", "window-rule/default-floating-position", "window-rule/min-width", "window-rule/min-height",
        "window-rule/max-width", "window-rule/max-height", "window-rule/opacity", "window-rule/focus-ring", "window-rule/border",
        "window-rule/shadow", "window-rule/tab-indicator",
        "window-rule/clip-to-geometry", // Kiri's effect clips every window that has a corner radius to its rounded corners
        "animations/off", "animations/on", "animations/slowdown", "animations/window-open", "animations/window-close",
        "animations/window-movement", "animations/window-resize", "animations/horizontal-view-movement",
        "animations/workspace-switch", "animations/overview-open-close",
    ]);
    const LOOKED_INTO = ["layout", "input", "gestures", "window-rule", "overview", "animations", "hotkey-overlay", "debug"];
    const SKIPPED_OPTIONS: Record<string, string> = {
        "include": "KWin scripts cannot read files (tools/niri2kiri.py follows includes)",
        "output": "the display layout is Plasma's (Display settings)",
        "spawn-at-startup": "programs start with Plasma's autostart",
        "spawn-sh-at-startup": "programs start with Plasma's autostart",
        "hotkey-overlay": "Kiri has no hotkey overlay",
        "screenshot-path": "screenshots are Spectacle's",
        "layer-rule": "layer-shell surfaces (panels, wallpapers) are Plasma's",
        "debug": "niri debug options",
        "environment": "environment variables belong to Plasma (~/.config/plasma-workspace/env)",
        "cursor": "the cursor theme is Plasma's",
        "clipboard": "the clipboard is Klipper's",
        "xwayland-satellite": "KWin runs XWayland itself",
        "switch-events": "KWin scripts get no switch events",
        "recent-windows": "Alt+Tab is KWin's Task Switcher",
        "config-notification": "KWin scripts have no config reload notice",
        "input/keyboard": "Plasma's Keyboard settings (tools/niri2kiri.py --input writes them)",
        "input/touchpad": "Plasma's Touchpad settings (tools/niri2kiri.py --input writes them)",
        "input/mouse": "Plasma's Mouse settings",
        "input/trackpoint": "Plasma's Mouse settings",
        "input/trackball": "Plasma's Mouse settings",
        "input/touch": "Plasma's Touchscreen settings",
        "input/tablet": "Plasma's Drawing Tablet settings",
        "input/mod-key-nested": "only used when niri runs inside another window",
        "overview/zoom": "not configurable yet",
        "overview/backdrop-color": "not configurable yet",
        "overview/workspace-shadow": "not configurable yet",
        "animations/config-notification-open-close": "KWin scripts have no config reload notice to animate",
        "animations/exit-confirmation-open-close": "Kiri has no exit confirmation dialog",
        "animations/screenshot-ui-open": "the screenshot UI is Spectacle's",
        "animations/recent-windows-close": "Alt+Tab is KWin's Task Switcher",
        "window-rule/open-on-output": "Kiri has one layout for all screens",
        "window-rule/on-xdg-activate": "KWin's focus stealing prevention decides",
        "window-rule/block-out-from": "KWin cannot hide a window from screen casts",
        "window-rule/variable-refresh-rate": "adaptive sync is set per output in Plasma's Display settings",
        "window-rule/scroll-factor": "Plasma's input settings; KWin has no per-window scroll scaling",
        "window-rule/pinch-sensitivity": "Plasma's input settings",
        "window-rule/tiled-state": "KWin gives scripts no xdg tiled state",
        "window-rule/background-effect": "the blur effect has no per-window script setting",
        "window-rule/popups": "KWin draws popups itself",
        "window-rule/draw-border-with-background": "the effect draws no background under a border",
        "window-rule/baba-is-float": "the effect has no bobbing animation",
    };

    // the paths of the options in a config that the importer has to account for: the top-level nodes, and one level down
    // in the blocks that hold options
    export function optionPaths(nodes: Kdl.Node[]): string[] {
        const paths: string[] = [];
        for (const node of nodes) {
            if (node.name === "binds") {
                continue;
            }
            if (LOOKED_INTO.includes(node.name) && !has(SKIPPED_OPTIONS, node.name)) {
                node.children.forEach(child => paths.push(`${node.name}/${child.name}`));
            } else {
                paths.push(node.name);
            }
        }
        return paths.filter((path, i) => paths.indexOf(path) === i);
    }

    export function isMappedOption(path: string) {
        return MAPPED_OPTIONS.has(path);
    }

    // why an option is not mapped, if the importer has a reason for it
    export function skippedOptionReason(path: string): string|undefined {
        return has(SKIPPED_OPTIONS, path) ? SKIPPED_OPTIONS[path] : undefined;
    }

    function reportUnmapped(nodes: Kdl.Node[], warn: (msg: string) => void) {
        for (const path of optionPaths(nodes)) {
            if (!MAPPED_OPTIONS.has(path)) {
                warn(`${path}: ${skippedOptionReason(path) ?? "not supported by Kiri"}`);
            }
        }
    }

    // what niri's Mod stands for: input { mod-key "Alt" }, Super by default
    function modKey(nodes: Kdl.Node[], warn: (msg: string) => void): string {
        let mod = "Meta";
        for (const block of Kdl.find(nodes, "input")) {
            const node = Kdl.child(block, "mod-key");
            if (node !== undefined) {
                const name = (node.args[0] ?? "Super").toLowerCase();
                if (has(MOD_KEYS, name)) {
                    mod = MOD_KEYS[name];
                } else {
                    warn(`input/mod-key ${node.args[0]}: Kiri cannot bind that modifier, Mod stays Super`);
                }
            }
        }
        return mod;
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
        const bound = readBinds(nodes, modKey(nodes, warn));
        skipped.push(...bound.skipped);
        const settings = Object.assign(readSettings(nodes, warn), bound.steps);
        reportUnmapped(nodes, warn);
        if (bound.pointer !== undefined) {
            // niri has only the binds of the config: the wheel binds Kiri has by default go when the config has none
            settings["pointerBinds"] = bound.pointer;
        }
        if (bound.slots["column"].length > 0) {
            settings["columnWidthSet"] = bound.slots["column"].join(", ");
        }
        if (bound.slots["window"].length > 0) {
            settings["windowHeightSet"] = bound.slots["window"].join(", ");
        }
        for (const [key, value] of Object.entries(settings)) { // whatever number got through: finite and a sane size
            if (typeof value === "number") {
                if (isFinite(value)) {
                    settings[key] = Math.max(-MAX_PIXELS, Math.min(MAX_PIXELS, value));
                } else {
                    delete settings[key];
                }
            }
        }
        const { rules, radius } = windowRules(nodes, warn);
        if (radius !== undefined) {
            settings["cornerRadius"] = radius;
        }
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
