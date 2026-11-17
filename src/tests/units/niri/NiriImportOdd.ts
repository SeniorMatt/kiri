// The importer reads whatever the user pastes: it must never throw, and what it returns must be usable. Odd configs,
// and seeded mutations (cut, doubled, shuffled, bytes swapped) of niri's default config and of the file named in NIRI_FILE.
tests.register("NiriImport odd configs", 1, () => {
    const fs = require("fs");
    const odd = [
        "", " ", "\n\n", "{", "}", "{}", "a {", "a }", "a { b { c { d } } ", "\"", "\"unterminated", "#\"raw", "/*", "/* /* */", "/-", "/- a", "a /-",
        "binds {", "binds { Mod+ { } }", "binds { Mod+Shift+ { focus-column-left; } }", "binds { \"\" { focus-column-left; } }",
        "binds { Mod+H { focus-column-left; focus-column-right; } }", "binds { Mod+H { } }", "binds { Mod+H }", "binds { Mod+H repeat=false }",
        "binds { Mod+H { unknown-action 1 2 3; } }", "binds { Mod+Nonsense+H { focus-column-left; } }", "binds { Mod+H { set-column-width \"+9999999\"; } }",
        "layout { gaps -5 }", "layout { gaps \"x\" }", "layout { gaps 1e999 }", "layout { gaps nan }", "layout { gaps 99999999999999999999 }",
        "layout { gaps }", "layout { preset-column-widths { } }", "layout { preset-column-widths { proportion } }",
        "layout { preset-column-widths { proportion 0 proportion -1 proportion 1e9 fixed 0 fixed -3 } }", "layout { default-column-width { proportion 0 } }",
        "layout { focus-ring { width 99999 active-color \"#zzz\" inactive-color \"rgb(1,2)\" } }",
        "layout { focus-ring { active-color \"hsl(400 200% 300%)\" } border { width -1 } }", "layout { border { off; on } }",
        "window-rule { match app-id=\"(\" ; open-floating true }", "window-rule { match app-id=\"[\" } window-rule { match title=\"*\" }",
        "window-rule { match app-id=r#\"(?<name>x)\"# }", "window-rule { }", "window-rule { match; exclude; geometry-corner-radius -1 }",
        "window-rule { match app-id=\"a\" { b } open-fullscreen true default-column-width { fixed 0 } }",
        "window-rule { geometry-corner-radius 1e99 }", "window-rule { match is-floating=true is-active=\"yes\" at-startup=1 }",
        "overview { zoom 0 } hotkey-overlay { skip-at-startup }", "workspace \"a\" workspace \"b\" workspace \"a\"", "output \"X\" { scale 0 mode \"0x0@0\" }",
        "animations { off slowdown 0 }", "animations { window-open { duration-ms -5 curve \"x\" } }", "gestures { hot-corners { off } }",
        "a 1 2 3 4 5 6 7 8 9 10 key=val key2=\"v\" key=dup", "a \\", "a \\\n", "a;b;c;;;;d", "\ufeffbinds {}", "binds\t{\r\n}\r\n", "\u0000\u0001\u0002",
        "a #true #false #null #inf #-inf #nan", "(type)a (t)1 (t)\"s\" k=(t)3", "a 0x10 0o7 0b101 1_000 1.5e3 -0 +1", "a \"\\u{1F600}\" \"\\u{110000}\" \"\\q\"",
        "\"quoted node\" 1", "1 2 3", "= = =", "a = 1", "a { ; ; ; }", "a { b; ; c }", "binds { Mod+1 { focus-workspace 1; } Mod+2 { focus-workspace \"two\"; } Mod+3 { focus-workspace 99999; } }",
        "binds { Mod+WheelScrollDown cooldown-ms=150 { focus-workspace-down; } Mod+TouchpadScrollUp { focus-column-left; } }",
        "include \"missing.kdl\"", "include", "include 1", "binds { Mod+Return hotkey-overlay-title=\"Open\" { spawn \"alacritty\"; } }",
        "x".repeat(200000), "a ".repeat(50000), "{".repeat(5000) + "}".repeat(5000), "a { ".repeat(3000), "a { b }".repeat(20000),
        "binds {" + " Mod+H { focus-column-left; }".repeat(5000) + "}",
    ];
    const check = (text: string, label: string) => {
        let r: NiriImport.Result;
        try {
            r = NiriImport.parse(text, undefined);
        } catch (error: any) {
            Assert.assert(false, { message: "NiriImport.parse threw on " + label + ": " + error });
            return;
        }
        Assert.assert(r !== undefined && typeof r.settings === "object" && typeof r.shortcutKeys === "object" && Array.isArray(r.skipped), { message: "bad result for " + label });
        for (const [key, value] of Object.entries(r.settings)) {
            if (typeof value === "number") {
                Assert.assert(Number.isFinite(value) && Math.abs(value) <= 100000, { message: label + ": setting " + key + " is " + value });
            }
            Assert.assert(value !== undefined && value !== null, { message: label + ": setting " + key + " is " + value });
        }
        for (const [name, keys] of Object.entries(r.shortcutKeys)) {
            Assert.assert(Array.isArray(keys) && keys.every(k => typeof k === "string" && k.length > 0), { message: label + ": keys of " + name + " are " + JSON.stringify(keys) });
        }
    };
    for (let i = 0; i < odd.length; ++i) {
        check(odd[i], "odd #" + i);
    }

    let seed = 12345;
    const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const sources: string[] = [fs.readFileSync("src/tests/fixtures/niri-default.kdl", "utf8")];
    const file = process.env["NIRI_FILE"];
    if (file !== undefined && file !== "") {
        sources.push(fs.readFileSync(file, "utf8"));
    }
    for (let s = 0; s < sources.length; ++s) {
        const src = sources[s];
        check(src, "source " + s);
        for (let n = 0; n < 400; ++n) {
            let t = src;
            const kind = Math.floor(rand() * 6);
            const a = Math.floor(rand() * t.length);
            const b = Math.min(t.length, a + Math.floor(rand() * 200));
            if (kind === 0) {
                t = t.slice(0, a); // cut off
            } else if (kind === 1) {
                t = t.slice(0, a) + t.slice(b); // delete a stretch
            } else if (kind === 2) {
                t = t.slice(0, b) + t.slice(a, b) + t.slice(b); // double a stretch
            } else if (kind === 3) {
                t = t.slice(0, a) + "{}\"\\/*#;()=".charAt(Math.floor(rand() * 12)) + t.slice(a); // one stray character
            } else if (kind === 4) {
                const lines = t.split("\n");
                for (let k = lines.length - 1; k > 0; --k) { // shuffle lines
                    const j = Math.floor(rand() * (k + 1));
                    [lines[k], lines[j]] = [lines[j], lines[k]];
                }
                t = lines.join("\n");
            } else {
                t = t.replace(/\d+/g, m => (rand() < 0.3 ? String(Math.floor(rand() * 1e12) - 5e11) : m)); // wild numbers
            }
            check(t, "mutation " + n + " (kind " + kind + ") of source " + s);
        }
    }
});
