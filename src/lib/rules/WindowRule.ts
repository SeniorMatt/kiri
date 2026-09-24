// What a rule or an exclude line matches (niri's match / exclude lines). Class and caption are regexes that match the
// whole string. is-floating, is-active and is-focused (niri's matchers) are checked when the rule is evaluated: when a
// window opens and when its caption changes.
interface WindowMatch {
    class?: string | undefined;
    caption?: string | undefined;
    isFloating?: boolean;
    isActive?: boolean;
    isFocused?: boolean;
}

interface WindowRule extends WindowMatch {
    class: string | undefined;
    caption: string | undefined;
    tile?: boolean; // omit to leave the tiling decision to Kiri (useful for rules that only set a width)
    width?: string; // column width for new windows (niri's default-column-width), like "50%" or "800px"; floating windows get it too
    height?: string; // niri's default-window-height, like "50%" or "920px"
    fullscreen?: boolean; // niri's open-fullscreen
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
    for (const windowClass of splitRuleList(tileClasses)) {
        rules.push({ class: windowClass, caption: undefined, tile: true });
    }
    for (const windowClass of splitRuleList(floatClasses)) {
        rules.push({ class: windowClass, caption: undefined, tile: false });
    }
    return rules;
}
