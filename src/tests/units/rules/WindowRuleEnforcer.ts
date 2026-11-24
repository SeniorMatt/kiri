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
        classes.join(",") === "firefox|undefined|66.667%,kate|undefined|800px,calc|false|undefined,mpv|false|undefined,special|true|undefined",
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

tests.register("A window rule with a broken regex does not stop the others", 1, () => {
    screen = new MockQmlRect(0, 0, 800, 600);
    Workspace = new MockWorkspace();
    const enforcer = new WindowRuleEnforcer([
        { class: "(unclosed", caption: undefined, tile: false },
        { class: "fine", caption: undefined, tile: false, exclude: [{ class: "[" }] },
        { class: "ok", caption: undefined, tile: false },
    ], false);
    const client = (resourceClass: string): any => ({
        normalWindow: true, transient: false, modal: false, managed: true, pid: 100, fullScreen: false,
        resourceClass: resourceClass, resourceName: resourceClass, caption: "c",
    });
    Assert.equal(enforcer.shouldTile(client("ok")), false);
    Assert.equal(enforcer.shouldTile(client("other")), true);
});

tests.register("Window rules that are not a list are ignored", 1, () => {
    notificationInvalidWindowRules = { sendEvent: () => {} } as any;
    const config = getDefaultConfig();
    config.windowRules = '{ "class": "x", "tile": false }';
    const { workspaceMock, world } = init(config);
    const [client] = workspaceMock.createClients(1);
    world.do((clientManager) => Assert.tiledClient(clientManager, client));
});

function ruleClient(resourceClass: string, caption = "Main window"): any {
    return {
        normalWindow: true, transient: false, modal: false, managed: true, pid: 1, moveable: true, resizeable: true,
        popupWindow: false, fullScreen: false, resourceClass: resourceClass, resourceName: resourceClass, caption: caption,
        minSize: { width: 0, height: 0 }, maxSize: { width: 9999, height: 9999 },
    };
}

tests.register("niri's appId and title matchers search with Rust regexes", 1, () => {
    const rules: WindowRule[] = [
        { appId: "firefox$", title: "^Picture-in-Picture$", tile: false },
        { appId: "^org\\.keepassxc\\.KeePassXC$", tile: false, exclude: [{ title: "(?i)unlock" }] },
        { appId: "(?i)^alacritty$", width: "50%" },
    ];
    const enforcer = new WindowRuleEnforcer(rules, true);
    Assert.equal(enforcer.shouldTile(ruleClient("org.mozilla.firefox", "Picture-in-Picture")), false);
    Assert.equal(enforcer.shouldTile(ruleClient("org.mozilla.firefox", "Picture-in-Picture 2")), true);
    Assert.equal(enforcer.shouldTile(ruleClient("firefox-esr", "Picture-in-Picture")), true);
    Assert.equal(enforcer.shouldTile(ruleClient("org.keepassxc.KeePassXC", "Vault")), false);
    Assert.equal(enforcer.shouldTile(ruleClient("org.keepassxc.KeePassXC", "Unlock Database")), true);
    Assert.equal(enforcer.getColumnWidth(ruleClient("Alacritty"), 1000), 500);
    Assert.equal(enforcer.getColumnWidth(ruleClient("alacritty-x"), 1000), null);
});

tests.register("Window rules merge in order: the last rule that sets a property wins", 1, () => {
    const rules: WindowRule[] = [
        { width: "30%", opacity: 0.5, focusRing: { width: 2, activeColor: "#ff0000" } }, // no match lines: every window
        { appId: "app", width: "40%", focusRing: { width: 6 }, cornerRadius: 8 },
        { appId: "app", title: "Special", opacity: 0.8, maximized: true },
        { appId: "other", width: "", tile: false },
    ];
    const enforcer = new WindowRuleEnforcer(rules, true);
    const normal = enforcer.resolve(ruleClient("zzz"));
    Assert.equal(normal.width, "30%");
    Assert.equal(normal.opacity, 0.5);
    Assert.equal(JSON.stringify(normal.style), JSON.stringify({ focusRing: { width: 2, activeColor: "#ff0000" } }));
    const app = enforcer.resolve(ruleClient("app"));
    Assert.equal(app.width, "40%");
    Assert.equal(app.maximized, undefined);
    Assert.equal(JSON.stringify(app.style), JSON.stringify({ focusRing: { width: 6, activeColor: "#ff0000" }, cornerRadius: 8 }));
    const special = enforcer.resolve(ruleClient("app", "Special"));
    Assert.equal(special.opacity, 0.8);
    Assert.equal(special.maximized, true);
    // an empty width lets the window pick its own, also over a global default
    const withDefault = new WindowRuleEnforcer(rules, true, "50%");
    Assert.equal(withDefault.getColumnWidth(ruleClient("zzz"), 1000), 300);
    Assert.equal(withDefault.getColumnWidth(ruleClient("other"), 1000), null);
    Assert.equal(new WindowRuleEnforcer([{ appId: "x", width: "10%" }], true, "50%").getColumnWidth(ruleClient("y"), 1000), 500);
});

tests.register("Window rule matchers: is-active-in-column, is-urgent, at-startup", 1, () => {
    const state = { activeInColumn: true, urgent: false, startup: true, active: false };
    const context = {
        isFloating: () => false,
        isActive: () => state.active,
        isFocused: () => false,
        isActiveInColumn: () => state.activeInColumn,
        isUrgent: () => state.urgent,
        atStartup: () => state.startup,
    };
    const enforcer = new WindowRuleEnforcer([
        { appId: "app", isActiveInColumn: false, opacity: 0.1 },
        { appId: "app", isUrgent: true, opacity: 0.2 },
        { appId: "app", atStartup: true, minWidth: 100 },
        { appId: "app", atStartup: false, minWidth: 200 },
        { appId: "app", isWindowCastTarget: true, maxWidth: 1 },
        { appId: "app", isWindowCastTarget: false, maxHeight: 2 },
        { appId: "app", isActive: true, minHeight: 7 },
    ], true, "", 0, context);
    const client = ruleClient("app");
    Assert.equal(enforcer.hasDynamicRules(), true);
    Assert.equal(enforcer.hasStartupRules(), true);
    let resolved = enforcer.resolve(client);
    Assert.equal(resolved.opacity, undefined);
    Assert.equal(resolved.minWidth, 100);
    Assert.equal(resolved.maxWidth, undefined); // nothing KWin knows can be a screen cast target
    Assert.equal(resolved.maxHeight, 2);
    state.activeInColumn = false;
    state.urgent = true;
    state.startup = false;
    resolved = enforcer.resolve(client);
    Assert.equal(resolved.opacity, 0.2);
    Assert.equal(resolved.minWidth, 200);
    // a window that is opening is not urgent and not active, but active in its column
    state.active = true;
    resolved = enforcer.resolve(client, true);
    Assert.equal(resolved.opacity, undefined);
    Assert.equal(resolved.minHeight, undefined);
    Assert.equal(enforcer.resolve(client).minHeight, 7);
});

tests.register("A window with a fixed height opens floating, rules can change that", 1, () => {
    const fixed = ruleClient("dialog");
    fixed.minSize = { width: 100, height: 300 };
    fixed.maxSize = { width: 9999, height: 300 };
    const free = ruleClient("dialog");
    free.minSize = { width: 100, height: 0 };
    Assert.equal(new WindowRuleEnforcer([], true).shouldTile(fixed), false);
    Assert.equal(new WindowRuleEnforcer([], true).shouldTile(free), true);
    Assert.equal(new WindowRuleEnforcer([{ appId: "dialog", tile: true }], true).shouldTile(fixed), true);
    // min-height and max-height rules count: they can make a window fixed in height
    Assert.equal(new WindowRuleEnforcer([{ appId: "dialog", minHeight: 200, maxHeight: 200 }], true).shouldTile(free), false);
});
