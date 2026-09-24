tests.register("WindowRuleEnforcer", 1, () => {
    screen = new MockQmlRect(0, 0, 800, 600);
    Workspace = new MockWorkspace();

    const testCases = [
        { tiledByDefault: true, resourceClass: "unknown", caption: "anything", shouldTile: true },
        { tiledByDefault: false, resourceClass: "unknown", caption: "anything", shouldTile: false },
        { tiledByDefault: true, resourceClass: "org.kde.plasmashell", caption: "something", shouldTile: false },
        { tiledByDefault: true, resourceClass: "plasmashell", caption: "something", shouldTile: false },
        { tiledByDefault: false, resourceClass: "org.kde.kfind", caption: "something", shouldTile: true },
        { tiledByDefault: false, resourceClass: "kfind", caption: "something", shouldTile: true },
        { tiledByDefault: true, resourceClass: "org.kde.kruler", caption: "anything", shouldTile: false },
        { tiledByDefault: true, resourceClass: "kruler", caption: "anything", shouldTile: false },
        { tiledByDefault: true, resourceClass: "zoom", caption: "something", shouldTile: true },
        { tiledByDefault: true, resourceClass: "zoom", caption: "zoom", shouldTile: false },
    ];

    const enforcer = new WindowRuleEnforcer(JSON.parse(defaultWindowRules), false);
    for (const testCase of testCases) {
        const kwinClient: any = createKwinClient(testCase.tiledByDefault, testCase.resourceClass, testCase.caption);
        Assert.assert(
            enforcer.shouldTile(kwinClient) === testCase.shouldTile,
            { message: "failed case: " + JSON.stringify(testCase) },
        );
    }

    function createKwinClient(normalWindow: boolean, resourceClass: string, caption: string) {
        return {
            normalWindow: normalWindow,
            transient: false,
            clientGeometry: new MockQmlRect(0, 0, 200, 200),
            managed: true,
            pid: 100,
            moveable: true,
            resizeable: true,
            popupWindow: false,
            minimized: false,
            desktops: [1],
            activities: [1],
            resourceClass: resourceClass,
            caption: caption,
        };
    }
});

tests.register("simple window rules", 1, () => {
    const rules = getSimpleWindowRules("calc\n  mpv \n", "special", "firefox=66.667%\nbad-line\nkate = 800px");
    const classes = rules.map(rule => `${rule.class}|${rule.tile}|${rule.width}`);
    Assert.assert(
        classes.join(",") === "firefox|undefined|66.667%,kate|undefined|800px,special|true|undefined,calc|false|undefined,mpv|false|undefined",
        { message: "unexpected simple rules: " + classes.join(",") },
    );
});

tests.register("window rule matchers: is-floating, is-active, is-focused and exclude", 1, () => {
    screen = new MockQmlRect(0, 0, 800, 600);
    Workspace = new MockWorkspace();
    const state = { floating: false, active: false, focused: false };
    const context = {
        isFloating: () => state.floating,
        isActive: () => state.active,
        isFocused: () => state.focused,
    };
    const client: any = {
        normalWindow: true, transient: false, modal: false, managed: true, pid: 1, moveable: true, resizeable: true,
        popupWindow: false, fullScreen: false, resourceClass: "app", caption: "Main window",
    };
    const rules: WindowRule[] = [
        { class: "app", caption: undefined, tile: false, isFloating: false, isFocused: true },
        { class: "app", caption: undefined, tile: false, caption2: undefined, exclude: [{ caption: "Main.*" }] } as any,
    ];
    const enforcer = new WindowRuleEnforcer(rules, true, "", 0, context);
    Assert.equal(enforcer.shouldTile(client), true); // not focused; the second rule is excluded by the caption
    state.focused = true;
    Assert.equal(enforcer.shouldTile(client), false);
    state.floating = true;
    Assert.equal(enforcer.shouldTile(client), true); // is-floating=false does not match a floating window
    state.floating = false;
    client.caption = "Other";
    state.focused = false;
    Assert.equal(enforcer.shouldTile(client), false); // the second rule applies now

    const active = new WindowRuleEnforcer([{ class: "app", caption: undefined, tile: false, isActive: true }], true, "", 0, context);
    Assert.equal(active.shouldTile(client), true);
    state.active = true;
    Assert.equal(active.shouldTile(client), false);

    const sizes = new WindowRuleEnforcer([{ class: "app", caption: undefined, tile: false, width: "50%", height: "300px" }], true);
    const area = new MockQmlRect(0, 0, 800, 600);
    Assert.equal(JSON.stringify(sizes.getFloatingSize(client, area)), JSON.stringify({ width: 400, height: 300 }));
    client.resourceClass = "none";
    Assert.equal(sizes.getFloatingSize(client, area), null);
});
