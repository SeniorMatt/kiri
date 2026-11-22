// What a rule or an exclude line matches (niri's match / exclude lines). All the conditions of one line must hold.
// `class` and `caption` are regexes that match the whole string (Kiri's own rules). `appId` and `title` are niri's:
// Rust regexes that match anywhere in the window's app id (resource class) and title (see RustRegex).
// The dynamic matchers (isFloating, isActive, isFocused, isActiveInColumn, isUrgent, atStartup) are checked whenever
// the rules are evaluated: when a window opens, and again when its title, app id or one of these states changes.
// isWindowCastTarget can never be true, KWin does not tell which windows are screen cast targets.
interface WindowMatch {
    class?: string | undefined;
    caption?: string | undefined;
    appId?: string;
    title?: string;
    isFloating?: boolean;
    isActive?: boolean;
    isFocused?: boolean;
    isActiveInColumn?: boolean;
    isUrgent?: boolean;
    isWindowCastTarget?: boolean;
    atStartup?: boolean; // true for the first 60 s after Kiri started
}

// niri's default-floating-position: x and y are measured from the corner or edge `relativeTo` names
interface FloatingPositionRule {
    x: number;
    y: number;
    relativeTo?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "top" | "bottom" | "left" | "right";
}

// A rule's look fields (cornerRadius, focusRing, border, shadow, tabIndicator) are those of WindowDecorationRule (Kiri.ts): the
// merged result for a window goes to the compiled decorations effect through setWindowDecorations. A missing field means "the
// global setting". geometry-corner-radius is one number (niri's four-corner form takes its largest corner); clip-to-geometry
// needs no field, the effect clips every window with a radius to its rounded corners.
interface WindowRule extends WindowMatch, WindowDecorationRule {
    tile?: boolean; // niri's open-floating (false = floating, true = tiled); omit to leave the decision to Kiri's heuristics
    width?: string; // column width for new windows (niri's default-column-width), like "50%" or "800px"; "" lets the window pick; floating windows get it too
    height?: string; // niri's default-window-height, like "50%" or "920px"; "" lets the window pick
    fullscreen?: boolean; // niri's open-fullscreen
    maximized?: boolean; // niri's open-maximized: the new column opens at the full width
    maximizedToEdges?: boolean; // niri's open-maximized-to-edges
    focused?: boolean; // niri's open-focused; false keeps the focus where it was
    workspace?: string; // niri's open-on-workspace: the name of a desktop
    columnDisplay?: "normal" | "tabbed"; // niri's default-column-display, for a column the window opens
    floatingPosition?: FloatingPositionRule; // niri's default-floating-position
    minWidth?: number; // niri's min-width, min-height, max-width and max-height; 0 for max means no limit
    minHeight?: number;
    maxWidth?: number;
    maxHeight?: number;
    opacity?: number; // niri's opacity (0 to 1); toggle-window-rule-opacity turns it off for the focused window
    exclude?: WindowMatch[]; // the rule does not apply to windows that match one of these
}

// Window rules from the simple fields of the settings dialog: one entry per line.
function splitRuleList(text: string) {
    return text.split("\n").map(item => item.trim()).filter(item => item !== "");
}

function getSimpleWindowRules(floatClasses: string, tileClasses: string, columnWidthRules: string): WindowRule[] {
    const rules: WindowRule[] = [];
    for (const entry of splitRuleList(columnWidthRules)) {
        const separator = entry.lastIndexOf("=");
        if (separator <= 0 || separator === entry.length - 1) {
            log("invalid column width rule:", entry);
            continue;
        }
        rules.push({
            class: entry.slice(0, separator).trim(),
            caption: undefined,
            width: entry.slice(separator + 1).trim(),
        });
    }
    // the last matching rule wins, so a class in both lists is tiled
    for (const windowClass of splitRuleList(floatClasses)) {
        rules.push({ class: windowClass, caption: undefined, tile: false });
    }
    for (const windowClass of splitRuleList(tileClasses)) {
        rules.push({ class: windowClass, caption: undefined, tile: true });
    }
    return rules;
}
