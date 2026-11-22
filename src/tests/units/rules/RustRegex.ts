tests.register("RustRegex: niri's patterns mean the same here", 1, () => {
    const matches = (pattern: string, text: string) => RustRegex.compile(pattern).test(text);

    // a search, not a whole-string match
    Assert.equal(matches("firefox$", "org.mozilla.firefox"), true);
    Assert.equal(matches("firefox$", "firefox-esr"), false);
    Assert.equal(matches("^Picture-in-Picture$", "Picture-in-Picture"), true);
    Assert.equal(matches("Mozilla", "Mozilla Firefox"), true);
    Assert.equal(matches(String.raw`^org\.wezfurlong\.wezterm$`, "org.wezfurlong.wezterm"), true);
    Assert.equal(matches(String.raw`^org\.wezfurlong\.wezterm$`, "org-wezfurlong-wezterm"), false);

    // inline flags, \A and \z
    Assert.equal(matches("(?i)alacritty", "Alacritty"), true);
    Assert.equal(matches("(?i:alacritty)", "ALACRITTY"), true);
    Assert.equal(matches(String.raw`\Afoo\z`, "foo"), true);
    Assert.equal(matches(String.raw`\Afoo\z`, "foo bar"), false);
    Assert.equal(matches("(?x) fo o  # a comment", "foo"), true);

    // groups, classes, escapes
    Assert.equal(matches("(?P<name>ab)+c", "ababc"), true);
    Assert.equal(matches("(?<name>ab)c", "abc"), true);
    Assert.equal(matches("^[[:alpha:]]+$", "Hello"), true);
    Assert.equal(matches("^[[:alpha:]]+$", "Hello1"), false);
    Assert.equal(matches("^[[:digit:][:upper:]]+$", "A1B2"), true);
    Assert.equal(matches(String.raw`\x{41}\x42`, "AB"), true);
    Assert.equal(matches(String.raw`a\-b\ c\#d`, "a-b c#d"), true);
    Assert.equal(matches(String.raw`^\pL+$`, "Привет"), true);
    Assert.equal(matches(String.raw`^\p{Greek}+$`, "αβγ"), true);
    Assert.equal(matches(String.raw`^\PL+$`, "123"), true);
    Assert.equal(matches("[]a]", "]"), true);
    Assert.equal(matches(String.raw`^.$`, "ü"), true);
    Assert.equal(matches("a{2,3}", "caab"), true);

    // what JavaScript cannot say is an error, so that the rule is dropped instead of matching wrongly
    for (const broken of ["[a&&b]", String.raw`\q`, "(unclosed", "[a-z", String.raw`\b{start}`]) {
        let failed = false;
        try {
            RustRegex.compile(broken);
        } catch (error: any) {
            failed = true;
        }
        Assert.equal(failed, true, { message: "pattern " + broken });
    }
});
