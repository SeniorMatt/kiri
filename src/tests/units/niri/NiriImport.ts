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

    // colours
    Assert.equal(NiriImport.parseColor("#7fc8ff"), "#7fc8ff");
    Assert.equal(NiriImport.parseColor("#abc"), "#aabbcc");
    Assert.equal(NiriImport.parseColor("#11223344"), "#112233");
    Assert.equal(NiriImport.parseColor("rgb(255 0 0)"), "#ff0000");
    Assert.equal(NiriImport.parseColor("hsl(120, 100%, 50%)"), "#00ff00");
    Assert.equal(NiriImport.parseColor("red"), "#ff0000");
    Assert.equal(NiriImport.parseColor("nonsense"), undefined);

    // window-rule anchoring
    Assert.equal(NiriImport.anchored("^firefox$"), "firefox");
    Assert.equal(NiriImport.anchored("firefox"), ".*firefox.*");
    Assert.equal(NiriImport.anchored("^foo"), "foo.*");

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
            Mod+T { spawn "alacritty"; }
            Mod+WheelScrollDown { focus-workspace-down; }
            /-Mod+X { close-window; }
        }
    `, '[{"class":"mine","tile":false}]');
    const s = result.settings;
    Assert.equal(s["cursorFollowsFocus"], true);
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
    Assert.equal(s["focusRingInactiveColor"], "#0000ff");
    Assert.equal(s["borderEnabled"], true);
    Assert.equal(s["borderWidth"], 3);
    Assert.equal(s["tabIndicatorWidth"], 6);
    Assert.equal(s["tabIndicatorGap"], 2);
    Assert.equal(s["tabIndicatorPosition"], "top");
    Assert.equal(s["tabIndicatorLength"], 0.7);
    Assert.equal(s["tabIndicatorHideWhenSingleTab"], true);
    Assert.equal(JSON.stringify(JSON.parse(s["windowRules"])), JSON.stringify([
        { class: "mpv", caption: "Video.*", tile: false },
        { class: ".*pavucontrol.*", tile: false },
        { class: ".*foo.*", width: "640px" },
        { class: "mine", tile: false },
    ]));
    Assert.equal(JSON.stringify(result.shortcutKeys), JSON.stringify({
        "focus-left": ["Meta+H", "Meta+Left"],
        "desktop-3": ["Meta+3"],
        "column-move-to-desktop-4": ["Meta+Ctrl+4"],
        "column-width-decrease": ["Meta+-"],
        "column-width-increase": ["Meta+="],
        "window-close": ["Meta+Q"],
    }));
    Assert.equal(result.skipped.length, 3); // spawn, wheel, tab indicator colours

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

    // the owner's config, when present
    const owner = "/tmp/claude-1001/-home-matthew-karousel/965f5914-ffa6-4c87-9792-e98cdab55c88/scratchpad/nixos/modules/session/niri/config.kdl";
    if (fs.existsSync(owner)) {
        const mine = NiriImport.parse(fs.readFileSync(owner, "utf8"));
        Assert.assert(Object.keys(mine.shortcutKeys).length > 10, { message: "owner's binds are read" });
        Assert.assert(mine.settings["gapsInnerHorizontal"] !== undefined, { message: "owner's gaps are read" });
        console.log("owner's config:", Object.keys(mine.settings).length, "settings,", Object.keys(mine.shortcutKeys).length, "actions bound,", mine.skipped.length, "skipped");
    }
});
