// Converts key sequences like "Meta+Shift+H" into Qt's key codes, which is what kglobalaccel takes over D-Bus.
const keyModifiers: Record<string, number> = {
    shift: 0x02000000,
    ctrl: 0x04000000,
    alt: 0x08000000,
    meta: 0x10000000,
};

const namedKeys: Record<string, number> = {
    escape: 0x01000000,
    tab: 0x01000001,
    backspace: 0x01000003,
    return: 0x01000004,
    enter: 0x01000005,
    insert: 0x01000006,
    delete: 0x01000007,
    print: 0x01000009,
    home: 0x01000010,
    end: 0x01000011,
    left: 0x01000012,
    up: 0x01000013,
    right: 0x01000014,
    down: 0x01000015,
    pgup: 0x01000016,
    pageup: 0x01000016,
    pgdown: 0x01000017,
    pagedown: 0x01000017,
    space: 0x20,
};

function parseKeySequence(keySequence: string): number|undefined {
    // split on "+", but a trailing "+" is the plus key itself (e.g. "Meta++")
    const parts = keySequence.endsWith("++") ?
        [...keySequence.slice(0, -2).split("+"), "+"] :
        keySequence.split("+");
    const key = parts.pop()!;

    let code = 0;
    for (const modifier of parts) {
        const modifierCode = keyModifiers[modifier.trim().toLowerCase()];
        if (modifierCode === undefined) {
            return undefined;
        }
        code |= modifierCode;
    }

    const keyCode = parseKey(key.trim());
    if (keyCode === undefined) {
        return undefined;
    }
    return code | keyCode;
}

function parseKey(key: string) {
    const named = namedKeys[key.toLowerCase()];
    if (named !== undefined) {
        return named;
    }
    const fKey = key.match(/^F([1-9][0-9]?)$/i);
    if (fKey !== null && Number(fKey[1]) <= 35) {
        return 0x01000030 + Number(fKey[1]) - 1;
    }
    if (key.length === 1) {
        const c = key.toUpperCase().charCodeAt(0);
        if (c > 0x20 && c < 0x7f) {
            return c;
        }
    }
    return undefined;
}

// KWin hands kglobalaccel the key a shortcut produces, with the Shift that was used to type it taken away
// ("Meta+Shift+=" arrives as "Meta++", "Meta+Shift+-" as "Meta+_"), so on a US layout a key written with Shift and
// a symbol key never matches. This is the form that does match (the original is registered too, for other layouts).
const usShiftedSymbols: Record<string, string> = {
    "1": "!", "2": "@", "3": "#", "4": "$", "5": "%", "6": "^", "7": "&", "8": "*", "9": "(", "0": ")",
    "-": "_", "=": "+", "[": "{", "]": "}", ";": ":", "'": "\"", ",": "<", ".": ">", "/": "?", "\\": "|", "`": "~",
};

function shiftedSymbolVariant(code: number): number|undefined {
    const shift = keyModifiers["shift"];
    if ((code & shift) === 0) {
        return undefined;
    }
    const key = code & 0x01ffffff;
    const symbol = key >= 0x20 && key < 0x7f ? usShiftedSymbols[String.fromCharCode(key)] : undefined;
    return symbol === undefined ? undefined : (code & ~shift & ~0x01ffffff) | symbol.charCodeAt(0);
}
