{
    tests.register("Key sequences", 1, () => {
        Assert.equal(parseKeySequence("Meta+D"), 0x10000000 | 0x44);
        Assert.equal(parseKeySequence("Meta+Shift+h"), 0x10000000 | 0x02000000 | 0x48);
        Assert.equal(parseKeySequence("Meta+Ctrl+PgDown"), 0x10000000 | 0x04000000 | 0x01000017);
        Assert.equal(parseKeySequence("Meta+F12"), 0x10000000 | 0x0100003b);
        Assert.equal(parseKeySequence("Meta+-"), 0x10000000 | 0x2d);
        Assert.equal(parseKeySequence("Meta++"), 0x10000000 | 0x2b);
        Assert.equal(parseKeySequence("Hyper+H"), undefined);
        Assert.equal(parseKeySequence("Meta+Nope"), undefined);
    });

    tests.register("The journal says which shortcut event switched the desktop", 1, () => {
        const { workspaceMock } = init(getDefaultConfig());
        const accel = kglobalaccel as MockKGlobalAccel;
        const lines: string[] = [];
        const original = console.log;
        console.log = (...args: any[]) => { lines.push(args.join(" ")); };
        try {
            accel.press("desktop-next");
            accel.repeat("desktop-next");
            accel.release("desktop-next");
            accel.press("desktop-previous");
        } finally {
            console.log = original;
        }
        const text = lines.join("\n");
        Assert.assert(text.includes("desktop 1 -> 2 (focus-desktop desktop-next press)"), { message: text });
        Assert.assert(text.includes("shortcut desktop-next repeat"), { message: text });
        Assert.assert(text.includes("shortcut desktop-next release"), { message: text });
        Assert.assert(text.includes("desktop 2 -> 1 (focus-desktop desktop-previous press)"), { message: text });
        Assert.equal(workspaceMock.desktops.indexOf(workspaceMock.currentDesktop), 0);
    });

    tests.register("No default key belongs to two actions", 1, () => {
        init(getDefaultConfig());
        const owners = new Map<number, string>();
        (kglobalaccel as MockKGlobalAccel).registered.forEach((keys, name) => {
            for (const key of keys) {
                Assert.assert(!owners.has(key), { message: `${name} and ${owners.get(key)} both use the key ${key.toString(16)}` });
                owners.set(key, name);
            }
        });
    });

    tests.register("Niri default keys", 1, () => {
        init(getDefaultConfig());
        const registered = (kglobalaccel as MockKGlobalAccel).registered;
        const fs = require("fs");
        // every bind of niri's default config that Kiri has an action for uses the same keys
        const def = NiriImport.parse(fs.readFileSync("src/tests/fixtures/niri-default.kdl", "utf8"));
        let checked = 0;
        for (const action of Object.keys(def.shortcutKeys)) {
            const keys = registered.get(action);
            Assert.assert(keys !== undefined, { message: `niri binds ${action}, which Kiri doesn't register` });
            for (const key of def.shortcutKeys[action]) {
                if (key === "Meta+Ctrl+Shift+K") {
                    continue; // the kiri-mode switch
                }
                Assert.assert(keys!.includes(parseKeySequence(key)!), { message: `${action}: niri's ${key} is missing in Kiri` });
                checked++;
            }
        }
        Assert.assert(checked > 40, { message: "most of niri's default binds are mapped: " + checked });
        Assert.equalArrays(registered.get("column-move-right")!, [parseKeySequence("Meta+Ctrl+L")!, parseKeySequence("Meta+Ctrl+Right")!]);
        Assert.equalArrays(registered.get("desktop-3")!, [parseKeySequence("Meta+3")!]);
        Assert.equalArrays(registered.get("column-move-to-desktop-9")!, [parseKeySequence("Meta+Ctrl+9")!]);
        Assert.equalArrays(registered.get("desktop-10")!, []);
        Assert.equalArrays(registered.get("column-move-to-column-1")!, []);
    });

    tests.register("Keys from Kiri's settings replace stored keys", 1, () => {
        const config = getDefaultConfig();
        config.shortcutKeys = { "focus-left": ["Meta+D", "Meta+Shift+Left"], "desktop-3": ["bogus+key"] };
        init(config);
        const registered = (kglobalaccel as MockKGlobalAccel).registered;
        Assert.equalArrays(registered.get("focus-left")!, [parseKeySequence("Meta+D")!, parseKeySequence("Meta+Shift+Left")!]);
        // invalid keys fall back to the defaults
        Assert.equalArrays(registered.get("desktop-3")!, [parseKeySequence("Meta+3")!]);
        Assert.equalArrays(registered.get("focus-right")!, [parseKeySequence("Meta+L")!, parseKeySequence("Meta+Right")!]);
        const flags = (kglobalaccel as MockKGlobalAccel).lastFlags;
        Assert.equal(flags.get("focus-left"), 2 | 4);
        Assert.equal(flags.get("focus-right"), 2);
    });

    tests.register("Key fields in settings", 1, () => {
        const values: Record<string, string> = { key1_focus_left: " Meta+D ", key2_focus_left: "", key2_desktop_2: "Meta+F5" };
        const keys = readShortcutKeys(name => values[name] ?? "");
        Assert.equalArrays(keys["focus-left"], ["Meta+D"]);
        Assert.equalArrays(keys["desktop-2"], ["Meta+F5"]);
        Assert.equal(keys["focus-right"], undefined);
        const names = getShortcutConfigDef().map(entry => entry.name);
        Assert.assert(names.includes("key1_column_move_to_desktop_12") && names.includes("key2_focus_left"));
    });

    tests.register("Switch desktop", 1, () => {
        const { qtMock } = init(getDefaultConfig());
        qtMock.fireShortcut("desktop-2");
        Assert.equal(Workspace.currentDesktop, Workspace.desktops[1]);
        qtMock.fireShortcut("desktop-previous");
        Assert.equal(Workspace.currentDesktop, Workspace.desktops[0]);
        qtMock.fireShortcut("desktop-previous");
        Assert.equal(Workspace.currentDesktop, Workspace.desktops[0]);
    });
}

tests.register("Shift with a symbol key is also registered the way KWin reports it", 1, () => {
    init(getDefaultConfig());
    const registered = (kglobalaccel as MockKGlobalAccel).registered;
    const meta = 0x10000000;
    const shift = 0x02000000;
    const keys = registered.get("window-height-increase")!;
    Assert.assert(keys.includes(meta | shift | "=".charCodeAt(0)), { message: "as written" });
    Assert.assert(keys.includes(meta | "+".charCodeAt(0)), { message: "Meta++, what KWin sends for Shift+=" });
    Assert.assert(registered.get("window-height-decrease")!.includes(meta | "_".charCodeAt(0)));
});

// Plasma-mode twins: KWin's own actions get Kiri's keys
const kwinAction = (accel: MockKGlobalAccel, name: string, keys: string[], defaults: string[]) => {
    accel.kwinActions.set(name, { keys: keys.map(key => parseKeySequence(key)!), defaults: defaults.map(key => parseKeySequence(key)!) });
    accel.rc.set(name, [keys.join("\t") || "none", defaults.join("\t") || "none", name]);
};
const twinInit = (setup: (accel: MockKGlobalAccel) => void, config = getDefaultConfig()) => {
    kwinSetup = setup;
    try {
        init(config);
    } finally {
        kwinSetup = null;
    }
    return kglobalaccel as MockKGlobalAccel;
};
const keysOf = (accel: MockKGlobalAccel, name: string) => accel.kwinActions.get(name)!.keys;
const code = (key: string) => parseKeySequence(key)!;

tests.register("An empty KWin twin action gets Kiri's keys", 1, () => {
    const accel = twinInit(a => kwinAction(a, "Window Move Center", [], []));
    Assert.equalArrays(keysOf(accel, "Window Move Center"), [code("Meta+C")]);
    Assert.equal(twinStore.given, "Window Move Center~" + code("Meta+C"));
    // no twin is made for an action KWin does not have
    Assert.equal(accel.kwinActions.has("Window Close"), false);
});

tests.register("Kiri's keys are added next to KWin's default keys", 1, () => {
    const accel = twinInit(a => {
        kwinAction(a, "Switch to Desktop 1", ["Ctrl+F1"], ["Ctrl+F1"]);
        kwinAction(a, "Window Close", ["Alt+F4"], ["Alt+F4"]);
    });
    Assert.equalArrays(keysOf(accel, "Switch to Desktop 1"), [code("Ctrl+F1"), code("Meta+1")]);
    // Kiri's Alt+F4 is the default already, only Meta+Q is added
    Assert.equalArrays(keysOf(accel, "Window Close"), [code("Alt+F4"), code("Meta+Q")]);
    Assert.equal(twinStore.given.includes("Window Close~" + code("Meta+Q") + "|"), true);
});

tests.register("A key the user set on a KWin action stays", 1, () => {
    const mine = "Meta+Ctrl+Alt+Z";
    const accel = twinInit(a => {
        kwinAction(a, "Window Move Center", [mine], []);
        kwinAction(a, "Window Close", ["Alt+F4", mine], ["Alt+F4"]);
        kwinAction(a, "Window Fullscreen", [], ["Meta+Ctrl+Alt+Y"]); // the user removed the default
    });
    Assert.equalArrays(keysOf(accel, "Window Move Center"), [code(mine)]);
    Assert.equalArrays(keysOf(accel, "Window Close"), [code("Alt+F4"), code(mine)]);
    Assert.equalArrays(keysOf(accel, "Window Fullscreen"), []);
    Assert.equal(twinStore.given, "");
});

tests.register("A key another action uses is not taken for a twin", 1, () => {
    const accel = twinInit(a => {
        kwinAction(a, "Window Move Center", [], []);
        a.otherActions.set("plasmashell/activate task manager entry 1", [code("Meta+C")]);
    });
    Assert.equalArrays(keysOf(accel, "Window Move Center"), []);
});

tests.register("A twin follows a changed Kiri key and keeps its default", 1, () => {
    const config = getDefaultConfig();
    config.shortcutKeys = { "window-close": ["Meta+D"] };
    const old = code("Meta+Q");
    const accel = twinInit(a => {
        // the default from kglobalshortcutsrc is still Alt+F4, the live keys carry Kiri's old key
        kwinAction(a, "Window Close", ["Alt+F4"], ["Alt+F4"]);
        a.kwinActions.get("Window Close")!.keys.push(old);
        twinStore.given = "Window Close~" + old;
    }, config);
    Assert.equalArrays(keysOf(accel, "Window Close"), [code("Alt+F4"), code("Meta+D")]);
    Assert.equal(twinStore.given, "Window Close~" + code("Meta+D"));
    // the user then replaced the twin's keys: they are theirs, nothing is added
    const record = twinStore.given;
    const other = twinInit(a => {
        kwinAction(a, "Window Close", ["Meta+Ctrl+Alt+Z"], ["Alt+F4"]);
        twinStore.given = record;
    }, config);
    Assert.equalArrays(keysOf(other, "Window Close"), [code("Meta+Ctrl+Alt+Z")]);
    Assert.equal(twinStore.given, "");
});

tests.register("Kiri's own action keeps its key next to its twin", 1, () => {
    const accel = twinInit(a => kwinAction(a, "Window Move Center", [], []));
    Assert.equalArrays(accel.registered.get("grid-scroll-focused")!, [code("Meta+C")]);
    // takePriority found the twin on Kiri's key, so it is switched off while Kiri runs
    Assert.equal(accel.inactive.has("kwin/Window Move Center"), true);
});

tests.register("A failed D-Bus lookup leaves a twin's keys alone", 1, () => {
    const mine = "Meta+Ctrl+Alt+Z";
    const accel = twinInit(a => {
        kwinAction(a, "Window Move Center", [mine], []);
        a.failing.add("shortcut");
    });
    Assert.equalArrays(keysOf(accel, "Window Move Center"), [code(mine)]);
    Assert.equal(twinStore.given, "");
    const other = twinInit(a => {
        kwinAction(a, "Window Move Center", [], []);
        a.failing.add("getGlobalShortcutsByKey");
    });
    Assert.equalArrays(keysOf(other, "Window Move Center"), []);
});

tests.register("No Kiri action takes the kiri-mode switch key", 1, () => {
    const modeSwitch = code("Meta+Ctrl+Shift+K");
    // the default keys, and niri's keys brought by an import
    const config = getDefaultConfig();
    config.shortcutKeys = { "column-move-to-monitor-up": ["Meta+Ctrl+Shift+Up", "Meta+Ctrl+Shift+K"] };
    for (const accel of [twinInit(() => {}), twinInit(() => {}, config)]) {
        accel.registered.forEach((keys, name) => Assert.assert(!keys.includes(modeSwitch), { message: name + " has the kiri-mode switch key" }));
        Assert.equalArrays(accel.registered.get("column-move-to-monitor-up")!, [code("Meta+Ctrl+Shift+Up")]);
    }
    // stored by a dev build, whose default for this action had it
    const stored = twinInit(accel => accel.call("", "", "setShortcut", [], [["kiri", "column-move-to-monitor-up"], [code("Meta+Ctrl+Shift+Up"), modeSwitch], 4], () => {}));
    Assert.equalArrays(stored.registered.get("column-move-to-monitor-up")!, [code("Meta+Ctrl+Shift+Up")]);
});
