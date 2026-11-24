// what a rule or an exclude line matches (niri's match / exclude lines); all conditions of one line must hold; `class`
// and `caption` are Kiri's own regexes, `appId` and `title` are Rust regexes (see RustRegex)
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
    atStartup?: boolean;
}

// niri's default-floating-position: x and y are measured from the corner or edge `relativeTo` names
interface FloatingPositionRule {
    x: number;
    y: number;
    relativeTo?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "top" | "bottom" | "left" | "right";
}

// the look fields are those of WindowDecorationRule (Kiri.ts); a missing field means the global setting
interface WindowRule extends WindowMatch, WindowDecorationRule {
    tile?: boolean;
    width?: string;
    height?: string;
    fullscreen?: boolean;
    maximized?: boolean;
    maximizedToEdges?: boolean;
    focused?: boolean;
    workspace?: string;
    columnDisplay?: "normal" | "tabbed";
    floatingPosition?: FloatingPositionRule;
    minWidth?: number;
    minHeight?: number;
    maxWidth?: number;
    maxHeight?: number;
    opacity?: number;
    exclude?: WindowMatch[];
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
    for (const windowClass of splitRuleList(floatClasses)) {
        rules.push({ class: windowClass, caption: undefined, tile: false });
    }
    for (const windowClass of splitRuleList(tileClasses)) {
        rules.push({ class: windowClass, caption: undefined, tile: true });
    }
    return rules;
}
