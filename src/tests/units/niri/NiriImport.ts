declare const require: (name: string) => any;

tests.register("NiriImport", 1, () => {
    const fs = require("fs");

    // KDL syntax
    const nodes = Kdl.parse(`
        // comment
        a 1 "two" key=3 { b; c "x\\ty" } /* block /* nested */ */
        /-skipped 1 { d }
        r #"raw "quoted""# ; e /-"dropped" kept
        f \\
          continued
    `);
    Assert.equal(nodes.map(n => n.name).join(","), "a,r,e,f");
    Assert.equal(nodes[0].args.join("|"), "1|two");
    Assert.equal(nodes[0].props["key"], "3");
    Assert.equal(nodes[0].children.map(n => n.name).join(","), "b,c");
    Assert.equal(nodes[0].children[1].args[0], "x\ty");
    Assert.equal(nodes[1].name, "r");
    Assert.equal(nodes[2].args.join("|"), "kept");
    Assert.equal(nodes[3].args.join("|"), "continued");

    // keys
    Assert.equal(NiriImport.convertKey("Mod+Shift+Page_Down"), "Meta+Shift+PgDown");
    Assert.equal(NiriImport.convertKey("Ctrl+Alt+Mod+h"), "Meta+Ctrl+Alt+H");
    Assert.equal(NiriImport.convertKey("Mod+Comma"), "Meta+,");
    Assert.equal(NiriImport.convertKey("Mod+f11"), "Meta+F11");
    Assert.equal(NiriImport.convertKey("Mod+WheelScrollDown"), undefined);
    Assert.equal(NiriImport.convertKey("XF86AudioMute"), undefined);
    Assert.equal(NiriImport.convertKey("Mod+Shift+H", "Alt"), "Alt+Shift+H", { message: "Mod is the mod-key" });
    Assert.equal(NiriImport.convertKey("Super+H", "Alt"), "Meta+H", { message: "Super stays Super" });
    Assert.equal(NiriImport.convertPointerKey("Mod+Ctrl+WheelScrollDown"), "Meta+Ctrl+WheelScrollDown");
    Assert.equal(NiriImport.convertPointerKey("Mod+MouseMiddle"), "Meta+MouseMiddle");
    Assert.equal(NiriImport.convertPointerKey("WheelScrollUp"), "WheelScrollUp");
    Assert.equal(NiriImport.convertPointerKey("Mod+TouchpadScrollUp"), undefined);
    Assert.equal(NiriImport.convertPointerKey("Mod+H"), undefined);

    // colours
    Assert.equal(NiriImport.parseColor("#7fc8ff"), "#7fc8ff");
    Assert.equal(NiriImport.parseColor("#abc"), "#aabbcc");
    Assert.equal(NiriImport.parseColor("#11223344"), "#11223344"); // the alpha is kept
    Assert.equal(NiriImport.parseColor("rgb(255 0 0)"), "#ff0000");
    Assert.equal(NiriImport.parseColor("hsl(120, 100%, 50%)"), "#00ff00");
    Assert.equal(NiriImport.parseColor("red"), "#ff0000");
    Assert.equal(NiriImport.parseColor("rgb(300 0 0 / 0.5)"), "#ff000080"); // clamped; tools/niri2kiri.py must agree
    Assert.equal(NiriImport.parseColor("nonsense"), undefined);


    // a hand-written config
    const result = NiriImport.parse(`
        input { warp-mouse-to-focus }
        layout {
            gaps 10
            struts { left 20; top 5 }
            center-focused-column "on-overflow"
            always-center-single-column
            preset-column-widths { proportion 0.25; fixed 800; proportion 0.5 }
            preset-window-heights { proportion 0.5 }
            default-column-width { proportion 0.75; }
            default-column-display "tabbed"
            focus-ring { width 2; active-color "#ff0000"; inactive-gradient from="blue" to="red" angle=45 }
            border { on; width 3 }
            tab-indicator { width 6; gap 2; position "top"; length total-proportion=0.7; hide-when-single-tab; active-color "red" }
        }
        prefer-no-csd
        window-rule { geometry-corner-radius 12 }
        window-rule {
            match app-id="^mpv$" title="^Video"
            match app-id="pavucontrol"
            open-floating true
        }
        window-rule { match app-id="foo"; default-column-width { fixed 640; } }
        window-rule { match app-id="bar"; open-floating false }
        binds {
            Mod+H { focus-column-left; }
            Mod+Left { focus-column-left; }
            Mod+3 { focus-workspace 3; }
            Mod+Ctrl+4 { move-column-to-workspace 4; }
            Mod+Minus { set-column-width "-10%"; }
            Mod+Equal { set-column-width "+10%"; }
            Mod+Q { close-window; }
            Mod+Ctrl+Shift+Page_Down { move-workspace-down; }
            Mod+Ctrl+Shift+Page_Up { move-workspace-up; }
            Mod+T { spawn "alacritty"; }
            Mod+WheelScrollDown cooldown-ms=150 { focus-workspace-down; }
            Mod+Shift+MouseMiddle { close-window; }
            Mod+TouchpadScrollUp { focus-workspace-up; }
            /-Mod+X { close-window; }
        }
    `, '[{"class":"mine","tile":false}]');
    const s = result.settings;
    Assert.equal(s["cursorFollowsFocus"], true);
    Assert.equal(s["hideTitlebars"], true);
    Assert.equal(s["gapsInnerHorizontal"], 10);
    Assert.equal(s["gapsInnerVertical"], 10);
    Assert.equal(s["gapsOuterLeft"], 30);
    Assert.equal(s["gapsOuterTop"], 15);
    Assert.equal(s["gapsOuterRight"], 10);
    Assert.equal(s["gapsOuterBottom"], 10);
    Assert.equal(s["scrollingOnOverflow"], true);
    Assert.equal(s["scrollingLazy"], false);
    Assert.equal(s["alwaysCenterSingleColumn"], true);
    Assert.equal(s["presetWidths"], "25%, 800px, 50%");
    Assert.equal(s["presetHeights"], "50%");
    Assert.equal(s["defaultColumnWidth"], "75%");
    Assert.equal(s["tabbedColumnsByDefault"], true);
    Assert.equal(s["cornerRadius"], 12);
    Assert.equal(s["focusRingWidth"], 2);
    Assert.equal(s["focusRingActiveColor"], "#ff0000");
    Assert.equal(s["focusRingInactiveGradient"], "from=#0000ff to=#ff0000 angle=45");
    Assert.equal(s["focusRingInactiveColor"], undefined);
    Assert.equal(s["tabIndicatorActiveColor"], "#ff0000");
    Assert.equal(s["borderEnabled"], true);
    Assert.equal(s["borderWidth"], 3);
    Assert.equal(s["tabIndicatorWidth"], 6);
    Assert.equal(s["tabIndicatorGap"], 2);
    Assert.equal(s["tabIndicatorPosition"], "top");
    Assert.equal(s["tabIndicatorLength"], 0.7);
    Assert.equal(s["tabIndicatorHideWhenSingleTab"], true);
    Assert.equal(JSON.stringify(JSON.parse(s["windowRules"])), JSON.stringify([
        { appId: "^mpv$", title: "^Video", tile: false },
        { appId: "pavucontrol", tile: false },
        { appId: "foo", width: "640px" },
        { appId: "bar", tile: true },
        { class: "mine", tile: false },
    ]));
    Assert.equal(JSON.stringify(result.shortcutKeys), JSON.stringify({
        "focus-left": ["Meta+H", "Meta+Left"],
        "desktop-3": ["Meta+3"],
        "column-move-to-desktop-4": ["Meta+Ctrl+4"],
        "column-width-decrease": ["Meta+-"],
        "column-width-increase": ["Meta+="],
        "window-close": ["Meta+Q"],
        "desktop-move-down": ["Meta+Ctrl+Shift+PgDown"],
        "desktop-move-up": ["Meta+Ctrl+Shift+PgUp"],
    }));
    Assert.equal(result.settings["pointerBinds"], "Meta+WheelScrollDown=desktop-next@150\nMeta+Shift+MouseMiddle=window-close");
    Assert.equal(result.skipped.length, 2); // spawn, touchpad scroll
    Assert.assert(result.skipped.every(line => line.includes(": ")), { message: "each skipped line has a reason" });

    // apply(): niri on top of the settings, keys typed in Kiri win
    const config = getDefaultConfig();
    config.niriConfigEnabled = true;
    config.niriConfig = "layout { gaps 3 }\nbinds { Mod+H { focus-column-left; } Mod+J { focus-column-right; } }";
    config.shortcutKeys = { "focus-left": ["Alt+Q"] };
    NiriImport.apply(config);
    Assert.equal(config.gapsInnerHorizontal, 3);
    Assert.equal(JSON.stringify(config.shortcutKeys), JSON.stringify({ "focus-left": ["Alt+Q"], "focus-right": ["Meta+J"] }));
    const disabled = getDefaultConfig();
    disabled.niriConfig = "layout { gaps 3 }";
    NiriImport.apply(disabled);
    Assert.equal(disabled.gapsInnerHorizontal, 8);

    // an empty default-column-width lets windows choose their own width
    Assert.equal(NiriImport.parse("layout { default-column-width {} }").settings["defaultColumnWidth"], "");

    // garbage in must not throw
    NiriImport.parse("}}} { { \"unterminated");

    // niri's default config
    const def = NiriImport.parse(fs.readFileSync("src/tests/fixtures/niri-default.kdl", "utf8"));
    Assert.equal(def.settings["gapsInnerHorizontal"], 16);
    Assert.equal(def.settings["presetWidths"], "33.333%, 50%, 66.667%");
    Assert.equal(def.settings["focusRingWidth"], 4);
    Assert.equal(def.settings["focusRingActiveColor"], "#7fc8ff");
    Assert.equal(def.settings["borderEnabled"], false);
    Assert.equal(def.shortcutKeys["focus-left"].join(), "Meta+Left,Meta+H");
    Assert.equal(def.shortcutKeys["desktop-1"].join(), "Meta+1");
    Assert.equal(def.shortcutKeys["window-close"].join(), "Meta+Q,Alt+F4");
    Assert.equal(def.shortcutKeys["column-width-maximize"].join(), "Meta+F");
    Assert.equal(def.shortcutKeys["window-maximize-to-edges"].join(), "Meta+M");
});

tests.register("NiriImport window rules: open-fullscreen, default-window-height, matchers and exclude", 1, () => {
    const result = NiriImport.parse(`
        window-rule {
            match app-id=r#"^fl64\\.exe$"#
            open-fullscreen true
        }
        window-rule {
            match app-id="dev.noctalia.Noctalia"
            open-floating true
            default-column-width { fixed 1080; }
            default-window-height { fixed 920; }
        }
        window-rule {
            match app-id="firefox" is-floating=false is-focused=true
            match app-id="mpv" is-urgent=true
            exclude app-id="firefox" title="Private"
            default-window-height { proportion 0.5; }
        }
    `);
    const rules = JSON.parse(result.settings["windowRules"]);
    Assert.equal(rules.length, 4);
    Assert.equal(rules[0].fullscreen, true);
    Assert.equal(rules[0].appId, "^fl64\\.exe$");
    Assert.equal(rules[1].tile, false);
    Assert.equal(rules[1].width, "1080px");
    Assert.equal(rules[1].height, "920px");
    Assert.equal(rules[2].isFloating, false);
    Assert.equal(rules[2].isFocused, true);
    Assert.equal(rules[2].height, "50%");
    Assert.equal(rules[2].exclude[0].title, "Private");
    Assert.equal(rules[3].isUrgent, true);
    Assert.equal(result.skipped.length, 0);
});

tests.register("NiriImport hot corners", 1, () => {
    const off = NiriImport.parse(`gestures { hot-corners { off; } }`);
    Assert.equal(off.settings["hotCorner"], false);
    const other = NiriImport.parse(`gestures { hot-corners { bottom-right; } }`);
    Assert.equal(other.settings["hotCorner"], true);
    Assert.equal(other.settings["hotCornerTopLeft"], false);
    Assert.equal(other.settings["hotCornerBottomRight"], true);
    Assert.equal(other.settings["hotCornerTopRight"], false);
    const both = NiriImport.parse(`gestures { hot-corners { top-left; bottom-right; top-right; bottom-left; } }`);
    Assert.equal(both.settings["hotCornerTopLeft"], true);
    Assert.equal(both.settings["hotCornerTopRight"], true);
    Assert.equal(both.settings["hotCornerBottomLeft"], true);
    Assert.equal(both.settings["hotCornerBottomRight"], true);
    const empty = NiriImport.parse(`gestures { hot-corners { } }`);
    Assert.equal(empty.settings["hotCornerTopLeft"], true);
    Assert.equal(NiriImport.parse(`layout { gaps 8; }`).settings["hotCorner"], undefined);
});

tests.register("NiriImport overview and dnd edge options", 1, () => {
    const r = NiriImport.parse(`
        overview { zoom 0.35; backdrop-color "#112233"; workspace-shadow { off; offset x=2 y=-4.5; softness 20; spread 3; color "#ff000080"; } }
        gestures { dnd-edge-view-scroll { trigger-width 40; delay-ms 200; max-speed 900; } dnd-edge-workspace-switch { trigger-height 70; } }`);
    const s = r.settings;
    Assert.equal(s["overviewZoom"], 0.35);
    Assert.equal(s["overviewBackdropColor"], "#112233");
    Assert.equal(s["overviewShadowEnabled"], false);
    Assert.equal(s["overviewShadowOffsetX"], 2);
    Assert.equal(s["overviewShadowOffsetY"], -4.5);
    Assert.equal(s["overviewShadowSoftness"], 20);
    Assert.equal(s["overviewShadowSpread"], 3);
    Assert.equal(s["overviewShadowColor"], "#ff000080");
    Assert.equal(s["dndEdgeViewScrollTriggerWidth"], 40);
    Assert.equal(s["dndEdgeViewScrollDelay"], 200);
    Assert.equal(s["dndEdgeViewScrollMaxSpeed"], 900);
    Assert.equal(s["dndEdgeWorkspaceSwitchTriggerHeight"], 70);
    Assert.equal(s["dndEdgeWorkspaceSwitchDelay"], undefined);
});

tests.register("NiriImport window rules: every property and matcher of niri's window-rule", 1, () => {
    const result = NiriImport.parse(`
        window-rule {
            clip-to-geometry true
            geometry-corner-radius 6
            opacity 0.9
        }
        window-rule {
            match app-id=r#"firefox$"# title="^Picture-in-Picture$"
            match is-active-in-column=false at-startup=true
            exclude is-urgent=true is-window-cast-target=false
            open-floating true
            open-maximized true
            open-maximized-to-edges false
            open-focused false
            open-on-workspace "chat"
            default-column-width {}
            default-window-height { proportion 0.5; }
            default-column-display "tabbed"
            default-floating-position x=100 y=200 relative-to="bottom-left"
            min-width 100
            max-width 200
            min-height 300
            max-height 400
            geometry-corner-radius 4 5 6 7
            focus-ring { off; width 2; active-color "#7fc8ff"; urgent-color "#9b0000" }
            border { on; width 3; inactive-gradient from="#505050" to="#808080" angle=45 }
            shadow { on; softness 40; spread 5; offset x=1 y=-2; draw-behind-window true; color "#00000064"; inactive-color "rgba(0, 0, 255, 0.5)" }
            tab-indicator { active-color "red"; urgent-color "#ff000080" }
            draw-border-with-background false
            baba-is-float true
            clip-to-geometry true
            variable-refresh-rate true
            block-out-from "screencast"
            open-on-output "HDMI-A-1"
        }
        window-rule { match app-id="x"; open-fullscreen false }
    `);
    Assert.equal(result.settings["cornerRadius"], 6);
    const rules = JSON.parse(result.settings["windowRules"]);
    Assert.equal(rules.length, 4);
    // no match line: a rule for every window; the global radius is not repeated
    Assert.equal(JSON.stringify(rules[0]), JSON.stringify({ opacity: 0.9 }));
    const full = {
        appId: "firefox$", title: "^Picture-in-Picture$",
        tile: false, width: "", height: "50%", maximized: true, maximizedToEdges: false, focused: false, workspace: "chat",
        columnDisplay: "tabbed", floatingPosition: { x: 100, y: 200, relativeTo: "bottom-left" },
        minWidth: 100, maxWidth: 200, minHeight: 300, maxHeight: 400,
        focusRing: { enabled: false, width: 2, activeColor: "#7fc8ff", urgentColor: "#9b0000" },
        border: { enabled: true, width: 3, inactiveGradient: "from=#505050 to=#808080 angle=45" },
        shadow: { enabled: true, softness: 40, spread: 5, offsetX: 1, offsetY: -2, drawBehindWindow: true, color: "#00000064", inactiveColor: "#0000ff80" },
        tabIndicator: { activeColor: "#ff0000", urgentColor: "#ff000080" },
        cornerRadius: 7,
        exclude: [{ isUrgent: true, isWindowCastTarget: false }],
    };
    const sorted = (value: any): any => {
        if (Array.isArray(value)) {
            return value.map(sorted);
        }
        if (value !== null && typeof value === "object") {
            return Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])]));
        }
        return value;
    };
    Assert.equal(JSON.stringify(sorted(rules[1])), JSON.stringify(sorted(full)));
    Assert.equal(rules[2].isActiveInColumn, false);
    Assert.equal(rules[2].atStartup, true);
    Assert.equal(rules[3].appId, "x");
    Assert.equal(rules[3].fullscreen, false);
    // what KWin and Plasma own is reported once, the rest of the rule still works
    Assert.equal(result.skipped.filter(line => line.includes("variable-refresh-rate")).length, 1);
    Assert.equal(result.skipped.filter(line => line.includes("draw-border-with-background")).length, 1);
    Assert.equal(result.skipped.filter(line => line.includes("baba-is-float")).length, 1);
    Assert.equal(result.skipped.filter(line => line.includes("different corners")).length, 1);
    Assert.equal(result.skipped.filter(line => line.includes("clip-to-geometry")).length, 0);
    Assert.equal(result.skipped.filter(line => line.includes("block-out-from")).length, 1);
    Assert.equal(result.skipped.filter(line => line.includes("open-on-output")).length, 1);
});

tests.register("NiriImport monitor binds", 1, () => {
    const result = NiriImport.parse(`
        binds {
            Mod+Shift+Left { focus-monitor-left; }
            Mod+Shift+Ctrl+Right { move-column-to-monitor-right; }
            Mod+Alt+Down { move-window-to-monitor-down; }
            Mod+Alt+N { focus-monitor-next; }
        }
    `);
    Assert.equalArrays(result.shortcutKeys["focus-monitor-left"], ["Meta+Shift+Left"]);
    Assert.equalArrays(result.shortcutKeys["column-move-to-monitor-right"], ["Meta+Ctrl+Shift+Right"]);
    Assert.equalArrays(result.shortcutKeys["window-move-to-monitor-down"], ["Meta+Alt+Down"]);
    Assert.equalArrays(result.shortcutKeys["focus-monitor-next"], ["Meta+Alt+N"]);
});
