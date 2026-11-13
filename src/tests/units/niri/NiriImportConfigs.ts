// Every bind and option of the owner's niri config and of niri's default config is mapped, or skipped with a reason,
// and tools/niri2kiri.py (the importer that runs outside KWin) comes to the same result.
tests.register("NiriImport accounts for every bind and option of real configs", 1, () => {
    const fs = require("fs");
    const kiriActions = new Set(getShortcuts({} as any, {} as any).map(shortcut => shortcut.name));
    const generic = ["Kiri has no such action", "key or modifier Kiri does not know", "not supported by Kiri"];

    for (const file of ["niri-owner.kdl", "niri-default.kdl"]) {
        const path = "src/tests/fixtures/" + file;
        const text = fs.readFileSync(path, "utf8");
        const nodes = Kdl.parse(text);
        const result = NiriImport.parse(text);
        const where = file + ": ";

        // options
        const paths = NiriImport.optionPaths(nodes);
        Assert.assert(paths.length > 5, { message: where + "options were found" });
        for (const optionPath of paths) {
            if (NiriImport.isMappedOption(optionPath)) {
                continue;
            }
            const reason = NiriImport.skippedOptionReason(optionPath);
            Assert.assert(reason !== undefined, { message: where + optionPath + " is neither mapped nor skipped with a reason" });
            Assert.assert(result.skipped.includes(`${optionPath}: ${reason}`), { message: where + optionPath + " is reported as skipped" });
        }

        // binds
        const mappedKeys = new Set<string>();
        for (const keys of Object.values(result.shortcutKeys)) {
            keys.forEach(key => mappedKeys.add(key));
        }
        const pointerEntries = ((result.settings["pointerBinds"] ?? "") as string).split(";").filter(entry => entry !== "");
        let binds = 0;
        for (const block of Kdl.find(nodes, "binds")) {
            for (const bind of block.children) {
                const command = bind.children[0];
                if (command === undefined) {
                    continue;
                }
                binds++;
                const key = NiriImport.convertKey(bind.name);
                const pointerKey = NiriImport.convertPointerKey(bind.name);
                const prefix = `bind ${bind.name} ${command.name}`;
                const skippedLine = result.skipped.find(line => line.startsWith(prefix));
                if (skippedLine !== undefined) {
                    const reason = skippedLine.substring(skippedLine.indexOf(": ") + 2);
                    Assert.assert(skippedLine.includes(": ") && !generic.includes(reason), { message: where + skippedLine + " has no reason" });
                } else if (pointerKey !== undefined) {
                    Assert.assert(pointerEntries.some(entry => entry.startsWith(pointerKey + "=")), { message: where + bind.name + " is a pointer bind" });
                } else {
                    Assert.assert(key !== undefined && mappedKeys.has(key), { message: where + bind.name + " " + command.name + " is mapped" });
                }
            }
        }
        Assert.assert(binds > 50, { message: where + "binds were found" });

        // everything that is mapped is an action Kiri has
        for (const action of Object.keys(result.shortcutKeys)) {
            Assert.assert(kiriActions.has(action), { message: where + action + " is a Kiri action" });
        }
        for (const entry of pointerEntries) {
            Assert.assert(kiriActions.has(entry.substring(entry.indexOf("=") + 1).split("@")[0]), { message: where + entry + " is a Kiri action" });
        }
        console.log(file + ":", binds, "binds,", Object.keys(result.shortcutKeys).length, "actions,", pointerEntries.length, "pointer binds,", paths.length, "options,", result.skipped.length, "skipped");

        // tools/niri2kiri.py comes to the same result
        let json: any = undefined;
        try {
            const out = require("child_process").execFileSync("python3", ["-I", "tools/niri2kiri.py", path, "--json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], env: Object.assign({}, process.env, { PYTHONDONTWRITEBYTECODE: "1" }) });
            json = JSON.parse(out);
        } catch (error: any) {
            console.log("python3 is not usable here, skipped the tools/niri2kiri.py comparison:", String(error).substring(0, 100));
        }
        if (json !== undefined) {
            const rules = JSON.parse(json.settings["windowRules"] ?? "[]");
            const ownRules = JSON.parse(result.settings["windowRules"] ?? "[]");
            Assert.equal(JSON.stringify(rules.slice(0, ownRules.length)), JSON.stringify(ownRules), { message: where + "window rules" });
            delete json.settings["windowRules"];
            const settings = Object.assign({}, result.settings);
            delete settings["windowRules"];
            const sorted = (object: Record<string, any>) => JSON.stringify(Object.keys(object).sort().map(name => [name, object[name]]));
            Assert.equal(sorted(json.settings), sorted(settings), { message: where + "settings of tools/niri2kiri.py" });
            Assert.equal(sorted(json.shortcutKeys), sorted(result.shortcutKeys), { message: where + "keys of tools/niri2kiri.py" });
            const withoutInclude = (lines: string[]) => lines.filter(line => !line.startsWith("include")).sort();
            Assert.equalArrays(withoutInclude(json.skipped), withoutInclude(result.skipped), { message: where + "skipped lines of tools/niri2kiri.py" });

            // and tells what it skipped on stderr (the spawn binds are made into Plasma shortcuts by --apply, not skipped there)
            const run = require("child_process").spawnSync("python3", ["-I", "tools/niri2kiri.py", path, "--settings"], { encoding: "utf8", env: Object.assign({}, process.env, { PYTHONDONTWRITEBYTECODE: "1" }) });
            const told = new Set((run.stderr as string).split("\n"));
            for (const line of json.skipped) {
                Assert.assert(line.includes(": starts a program") || told.has("# skipped: " + line), { message: where + "tools/niri2kiri.py tells on stderr: " + line });
            }
        }
    }

    // the owner's config in particular
    const mine = NiriImport.parse(fs.readFileSync("src/tests/fixtures/niri-owner.kdl", "utf8"));
    Assert.equal(mine.settings["gapsInnerHorizontal"], 8);
    Assert.equal(mine.settings["alwaysCenterSingleColumn"], true);
    Assert.equal(mine.settings["focusRingWidth"], 2);
    Assert.equal(mine.settings["borderEnabled"], false);
    Assert.equal(mine.settings["focusFollowsMouse"], true);
    Assert.equal(mine.settings["focusFollowsMouseMaxScroll"], 100);
    Assert.equal(mine.settings["cursorFollowsFocus"], true);
    Assert.equal(mine.settings["cornerRadius"], 6);
    Assert.equal(mine.settings["hideTitlebars"], true);
    Assert.equal(mine.shortcutKeys["desktop-next"].join(), "Meta+PgDown,Meta+U");
    Assert.equal(mine.shortcutKeys["window-close"].join(), "Meta+C");
    Assert.equal(mine.shortcutKeys["column-width-increase"].join(), "Meta+=");
    Assert.equal(mine.shortcutKeys["window-height-decrease"].join(), "Meta+Shift+-");
    Assert.equal(mine.settings["columnWidthStep"], 10);
    Assert.equal(mine.settings["windowHeightStep"], 10);
    Assert.equal(mine.settings["pointerBinds"], getConfigDef().find(entry => entry.name === "pointerBinds")!.default, { message: "the wheel binds are niri's default ones, like Kiri's default" });
});

tests.register("NiriImport: size binds, focus=false, mod-key, pointer binds, focus-window-previous", 1, () => {
    const result = NiriImport.parse(`
        input { mod-key "Alt" }
        binds {
            Mod+Minus { set-column-width "-10%"; }
            Mod+Equal { set-column-width "+10%"; }
            Mod+1 { set-column-width "50%"; }
            Mod+2 { set-column-width "800"; }
            Mod+3 { set-window-width "+100"; }
            Mod+4 { set-column-width "-5%"; }
            Mod+5 { set-window-width "50%"; }
            Mod+Shift+1 { set-window-height "25%"; }
            Mod+Shift+2 { set-window-height "-100"; }
            Mod+Shift+Minus { set-window-height "-5%"; }
            Mod+Shift+Equal { set-window-height "+5%"; }
            Mod+Shift+3 { set-window-height "+7%"; }
            Mod+R { switch-preset-window-width; }
            Mod+Shift+R { switch-preset-window-width-back; }
            Mod+F { set-window-fullscreen; }
            Mod+Shift+F { unset-window-fullscreen; }
            Mod+G { set-windowed-fullscreen; }
            Mod+Shift+G { unset-windowed-fullscreen; }
            Mod+M { set-window-maximized-to-edges; }
            Mod+Shift+M { unset-window-maximized-to-edges; }
            Mod+O { open-overview; }
            Mod+Shift+O { close-overview; }
            Mod+Left { move-column-left focus=false; }
            Mod+Right { move-column-right focus=true; }
            Mod+Home { move-column-to-first focus=false; }
            Mod+End { move-column-to-last focus=false; }
            Mod+Up { move-window-up focus=false; }
            Mod+Down { move-window-down focus=false; }
            Mod+Ctrl+Left { swap-window-left focus=false; }
            Mod+Ctrl+Right { swap-window-right; }
            Mod+Page_Down { move-column-to-workspace-down focus=false; }
            Mod+Page_Up { move-window-to-workspace-up focus=false; }
            Mod+I { move-column-to-workspace 2 focus=false; }
            Mod+U { move-window-to-workspace 3 focus=false; }
            Mod+Y { move-column-to-index 4 focus=false; }
            Mod+Shift+Y { move-column-to-workspace 11 focus=false; }
            Mod+J { focus-window-or-monitor-down; }
            Mod+K { focus-window-or-monitor-up; }
            Mod+H { focus-column-or-monitor-left; }
            Mod+L { focus-column-or-monitor-right; }
            Mod+Ctrl+H { move-column-left-or-to-monitor-left; }
            Mod+Ctrl+L { move-column-right-or-to-monitor-right; }
            Mod+Tab { focus-window-previous; }
            Mod+Shift+Tab { focus-window-previous scope="workspace" filter="app-id"; }
            Mod+Ctrl+Tab { focus-window-previous filter="app-id"; }
            Mod+Ctrl+Shift+Tab { focus-window-previous scope="output"; }
            Mod+WheelScrollUp cooldown-ms=200 { focus-workspace-up; }
            Mod+WheelScrollLeft { focus-column-left; }
            Mod+MouseLeft { toggle-window-floating; }
            MouseMiddle { close-window; }
            Mod+TouchpadScrollUp { focus-workspace-up; }
            Mod+TabletStylusButton1 { close-window; }
            Mod+XF86AudioMute { close-window; }
        }
    `);
    const keys = result.shortcutKeys;
    Assert.equal(keys["column-width-decrease"].join(), "Alt+-", { message: "Mod is the mod-key" });
    Assert.equal(keys["column-width-increase"].join(), "Alt+=");
    Assert.equal(keys["column-width-set-1"].join(), "Alt+1,Alt+5", { message: "the same size is one slot: 50% from set-column-width and set-window-width" });
    Assert.equal(keys["column-width-set-2"].join(), "Alt+2");
    Assert.equal(keys["column-width-set-3"].join(), "Alt+3", { message: "set-window-width is set-column-width" });
    Assert.equal(keys["column-width-set-4"].join(), "Alt+4");
    Assert.equal(result.settings["columnWidthSet"], "50%, 800, +100, -5%");
    Assert.equal(keys["window-height-set-1"].join(), "Alt+Shift+1");
    Assert.equal(keys["window-height-set-2"].join(), "Alt+Shift+2");
    Assert.equal(result.settings["windowHeightStep"], 5, { message: "the first relative height is the step of the height keys" });
    Assert.equal(keys["window-height-decrease"].join(), "Alt+Shift+-");
    Assert.equal(keys["window-height-increase"].join(), "Alt+Shift+=");
    Assert.equal(result.settings["windowHeightSet"], "25%, -100, +7%");
    Assert.equal(keys["window-height-set-3"].join(), "Alt+Shift+3");
    Assert.equal(result.settings["columnWidthStep"], 10);
    Assert.equal(keys["cycle-preset-widths"].join(), "Alt+R");
    Assert.equal(keys["cycle-preset-widths-reverse"].join(), "Alt+Shift+R");
    Assert.equal(keys["window-set-fullscreen"].join(), "Alt+F");
    Assert.equal(keys["window-unset-fullscreen"].join(), "Alt+Shift+F");
    Assert.equal(keys["window-set-windowed-fullscreen"].join(), "Alt+G");
    Assert.equal(keys["window-unset-windowed-fullscreen"].join(), "Alt+Shift+G");
    Assert.equal(keys["window-set-maximized-to-edges"].join(), "Alt+M");
    Assert.equal(keys["window-unset-maximized-to-edges"].join(), "Alt+Shift+M");
    Assert.equal(keys["overview-open"].join(), "Alt+O");
    Assert.equal(keys["overview-close"].join(), "Alt+Shift+O");
    Assert.equal(keys["column-move-left-no-focus"].join(), "Alt+Left");
    Assert.equal(keys["column-move-start-no-focus"].join(), "Alt+Home");
    Assert.equal(keys["column-move-end-no-focus"].join(), "Alt+End");
    Assert.equal(keys["window-move-up-no-focus"].join(), "Alt+Up");
    Assert.equal(keys["window-move-down-no-focus"].join(), "Alt+Down");
    Assert.equal(keys["window-swap-left-no-focus"].join(), "Ctrl+Alt+Left");
    Assert.equal(keys["window-swap-right"].join(), "Ctrl+Alt+Right");
    Assert.equal(keys["column-move-to-next-desktop-no-focus"].join(), "Alt+PgDown");
    Assert.equal(keys["window-move-to-previous-desktop-no-focus"].join(), "Alt+PgUp");
    Assert.equal(keys["column-move-to-desktop-no-focus-2"].join(), "Alt+I");
    Assert.equal(keys["window-move-to-desktop-no-focus-3"].join(), "Alt+U");
    Assert.equal(keys["column-move-to-column-no-focus-4"].join(), "Alt+Y");
    Assert.equal(keys["focus-down"].join(), "Alt+J", { message: "or-to-monitor on one output is the plain action" });
    Assert.equal(keys["focus-up"].join(), "Alt+K");
    Assert.equal(keys["focus-left"].join(), "Alt+H");
    Assert.equal(keys["focus-right"].join(), "Alt+L");
    Assert.equal(keys["column-move-left"].join(), "Ctrl+Alt+H");
    Assert.equal(keys["column-move-right"].join(), "Alt+Right,Ctrl+Alt+L");
    Assert.equal(keys["focus-window-previous"].join(), "Alt+Tab");
    Assert.equal(keys["focus-window-previous-workspace-app"].join(), "Alt+Shift+Tab");
    Assert.equal(keys["focus-window-previous-app"].join(), "Ctrl+Alt+Tab");
    Assert.equal(keys["focus-window-previous-output"].join(), "Ctrl+Alt+Shift+Tab");
    Assert.equal(result.settings["pointerBinds"], "Alt+WheelScrollUp=desktop-previous@200;Alt+WheelScrollLeft=focus-left;Alt+MouseLeft=window-toggle-floating;MouseMiddle=window-close");
    const skipped = result.skipped.join("\n");
    Assert.assert(skipped.includes("bind Mod+Shift+Y move-column-to-workspace 11: focus=false only for numbers up to 9"));
    Assert.assert(skipped.includes("bind Mod+TouchpadScrollUp focus-workspace-up: touchpad scrolling gives KWin no ticks to bind"));
    Assert.assert(skipped.includes("bind Mod+TabletStylusButton1 close-window: stylus buttons have no KWin hook"));
    Assert.assert(skipped.includes("bind Mod+XF86AudioMute close-window: media and hardware keys are Plasma's"));

    // no more than 12 sizes
    let many = "binds {\n";
    for (let i = 1; i <= 14; i++) {
        many += `    Mod+Ctrl+${String.fromCharCode(64 + i)} { set-column-width "${i * 100}"; }\n`;
    }
    const lots = NiriImport.parse(many + "}");
    Assert.equal((lots.settings["columnWidthSet"] as string).split(",").length, 12);
    Assert.equal(lots.skipped.filter(line => line.includes("more than 12 different sizes")).length, 2);

    // a mod-key Kiri cannot bind, and none at all: Super
    const odd = NiriImport.parse('input { mod-key "ISO_Level3_Shift" }\nbinds { Mod+H { focus-column-left; } }');
    Assert.equal(odd.shortcutKeys["focus-left"].join(), "Meta+H");
    Assert.assert(odd.skipped.some(line => line.startsWith("input/mod-key ISO_Level3_Shift: ")));
    Assert.equal(NiriImport.parse("binds { Mod+H { focus-column-left; } }").shortcutKeys["focus-left"].join(), "Meta+H");

    // a config without binds leaves the pointer binds alone; one with binds but no wheel binds has none, like niri
    Assert.equal(NiriImport.parse("layout { gaps 3 }").settings["pointerBinds"], undefined);
    Assert.equal(NiriImport.parse("binds { Mod+H { focus-column-left; } }").settings["pointerBinds"], "");
});
