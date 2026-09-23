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
