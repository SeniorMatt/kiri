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
