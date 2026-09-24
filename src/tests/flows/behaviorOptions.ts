tests.register("Default column width", 5, () => {
    const config = getDefaultConfig();
    config.defaultColumnWidth = "50%";
    config.windowRules = '[{ "class": "wide-app", "width": "100%" }, { "class": "px-app", "width": "400px" }]';
    const { qtMock, workspaceMock, world } = init(config);

    const halfWidth = Math.floor((tilingArea.width + gapH) / 2 - gapH);
    const [client0] = workspaceMock.createClientsWithWidths(300);
    Assert.equal(client0.getActualFrameGeometry().width, halfWidth);

    const wide = new MockKwinClient(new MockQmlRect(0, 0, 300, 300));
    wide.resourceClass = "wide-app";
    const px = new MockKwinClient(new MockQmlRect(0, 0, 300, 300));
    px.resourceClass = "px-app";
    workspaceMock.createWindows(wide, px);
    Assert.equal(wide.getActualFrameGeometry().width, tilingArea.width);
    Assert.equal(px.getActualFrameGeometry().width, 400);
});

tests.register("Default column width invalid", 1, () => {
    const config = getDefaultConfig();
    config.defaultColumnWidth = "wide";
    const { qtMock, workspaceMock, world } = init(config);
    const [client0] = workspaceMock.createClientsWithWidths(300);
    Assert.equal(client0.getActualFrameGeometry().width, 300);
});

tests.register("Center single column", 5, () => {
    // Karousel's behavior: a grid that fits on the screen is centered
    {
        const config = getDefaultConfig();
        const { qtMock, workspaceMock, world } = init(config);
        const [client0] = workspaceMock.createClientsWithWidths(300);
        Assert.centered(config, tilingArea, client0);
    }

    // niri's behavior: aligned to the left
    {
        const config = getDefaultConfig();
        config.centerGridWhenFits = false;
        const { qtMock, workspaceMock, world } = init(config);
        const [client0] = workspaceMock.createClientsWithWidths(300);
        Assert.equal(client0.getActualFrameGeometry().x, tilingArea.x);
        const [client1] = workspaceMock.createClientsWithWidths(300);
        Assert.equal(client0.getActualFrameGeometry().x, tilingArea.x);
        Assert.equal(client1.getActualFrameGeometry().x, tilingArea.x + 300 + gapH);
    }

    // aligned to the left, but a single column is centered
    {
        const config = getDefaultConfig();
        config.centerGridWhenFits = false;
        config.alwaysCenterSingleColumn = true;
        const { qtMock, workspaceMock, world } = init(config);
        const [client0] = workspaceMock.createClientsWithWidths(300);
        Assert.centered(config, tilingArea, client0);
        const [client1] = workspaceMock.createClientsWithWidths(300);
        Assert.equal(client0.getActualFrameGeometry().x, tilingArea.x);
        Assert.equal(client1.getActualFrameGeometry().x, tilingArea.x + 300 + gapH);
    }
});

tests.register("Center focused column on overflow", 5, () => {
    const config = getDefaultConfig();
    config.scrollingLazy = false;
    config.scrollingOnOverflow = true;
    config.centerGridWhenFits = false;
    const { qtMock, workspaceMock, world } = init(config);

    function centerX(client: MockKwinClient) {
        const frame = client.getActualFrameGeometry();
        return frame.x + frame.width / 2;
    }
    const tilingCenter = tilingArea.x + tilingArea.width / 2;

    // niri compares the new column with its neighbour on the side the focus came from, not with the old column
    const [client0, client1, client2] = workspaceMock.createClientsWithWidths(300, 300, 300);
    Assert.assert(Math.abs(centerX(client2) - tilingCenter) > 100, { message: "the last column is not centered (it is the last one)" });
    qtMock.fireShortcut("focus-start");
    Assert.assert(workspaceMock.activeWindow === client0);
    Assert.assert(Math.abs(centerX(client0) - tilingCenter) > 100, { message: "client0 fits together with client1, so it is not centered" });
    qtMock.fireShortcut("focus-right");
    Assert.assert(workspaceMock.activeWindow === client1);
    Assert.fullyVisible(client0.getActualFrameGeometry());
    Assert.fullyVisible(client1.getActualFrameGeometry());
    Assert.assert(Math.abs(centerX(client1) - tilingCenter) > 1, { message: "client1 should not be centered" });
});

tests.register("Center focused column on overflow (wide columns)", 5, () => {
    const config = getDefaultConfig();
    config.scrollingLazy = false;
    config.scrollingOnOverflow = true;
    config.centerGridWhenFits = false;
    const { qtMock, workspaceMock, world } = init(config);

    function centerX(client: MockKwinClient) {
        const frame = client.getActualFrameGeometry();
        return frame.x + frame.width / 2;
    }
    const tilingCenter = tilingArea.x + tilingArea.width / 2;

    const [client0, client1, client2] = workspaceMock.createClientsWithWidths(400, 400, 400);
    qtMock.fireShortcut("focus-start");
    Assert.assert(Math.abs(centerX(client0) - tilingCenter) <= 1, { message: "client0 and client1 don't fit together, so client0 is centered" });
    qtMock.fireShortcut("focus-right");
    Assert.assert(Math.abs(centerX(client1) - tilingCenter) <= 1, { message: "client1 doesn't fit with client0, so it is centered" });
    qtMock.fireShortcut("focus-right");
    Assert.assert(Math.abs(centerX(client2) - tilingCenter) <= 1, { message: "client2 doesn't fit with client1, so it is centered" });
    qtMock.fireShortcut("focus-left");
    Assert.assert(Math.abs(centerX(client1) - tilingCenter) <= 1, { message: "going back centers client1 again" });
});

tests.register("Center focused column always", 5, () => {
    const config = getDefaultConfig();
    config.scrollingLazy = false;
    config.scrollingCentered = true;
    const { qtMock, workspaceMock, world } = init(config);

    function centerX(client: MockKwinClient) {
        const frame = client.getActualFrameGeometry();
        return frame.x + frame.width / 2;
    }
    const tilingCenter = tilingArea.x + tilingArea.width / 2;

    const [client0, client1, client2] = workspaceMock.createClientsWithWidths(100, 100, 100);
    for (const client of [client0, client1, client2, client1, client0]) {
        workspaceMock.activeWindow = client;
        Assert.assert(Math.abs(centerX(client) - tilingCenter) <= 1, { message: "every focused column is centered, even when it was visible already" });
    }
});

tests.register("Window height presets", 5, () => {
    const config = getDefaultConfig();
    config.presetHeights = "25%, 75%";
    const { qtMock, workspaceMock, world } = init(config);

    const [client0, client1] = workspaceMock.createClientsWithWidths(300, 300);
    qtMock.fireShortcut("window-move-left");
    const equalHeight = getWindowHeight(2);
    Assert.equal(client0.getActualFrameGeometry().height, equalHeight);
    Assert.equal(client1.getActualFrameGeometry().height, equalHeight);

    function presetHeight(ratio: number) {
        return Math.floor((tilingArea.height + gapV) * ratio - gapV);
    }
    function assertSplit(height1: number) {
        const geometry0 = client0.getActualFrameGeometry();
        const geometry1 = client1.getActualFrameGeometry();
        Assert.equal(geometry1.height, height1);
        Assert.equal(geometry0.height + gapV + geometry1.height, tilingArea.height);
    }

    // client1 is focused
    qtMock.fireShortcut("window-height-cycle-presets");
    assertSplit(presetHeight(0.75));
    qtMock.fireShortcut("window-height-cycle-presets"); // wraps around
    assertSplit(presetHeight(0.25));
    qtMock.fireShortcut("window-height-cycle-presets");
    assertSplit(presetHeight(0.75));
    qtMock.fireShortcut("window-height-cycle-presets-reverse");
    assertSplit(presetHeight(0.25));
    qtMock.fireShortcut("window-height-reset");
    Assert.equal(client0.getActualFrameGeometry().height, equalHeight);
    Assert.equal(client1.getActualFrameGeometry().height, equalHeight);
});

tests.register("Expand column to available width", 5, () => {
    const config = getDefaultConfig();
    const { qtMock, workspaceMock, world } = init(config);

    const [client0, client1] = workspaceMock.createClientsWithWidths(200, 200);
    qtMock.fireShortcut("column-width-expand");
    Assert.equal(client1.getActualFrameGeometry().width, tilingArea.width - 200 - gapH);
    Assert.columnsFillTilingArea([client0, client1]);
});

tests.register("Reload settings", 5, () => {
    const config = getDefaultConfig();
    const { qtMock, workspaceMock, world } = init(config);

    const settings: any = { ...config };
    KWin = { __brand: "KWin", readConfig: (key: string, defaultValue: any) => settings[key] ?? defaultValue };
    const kiri = new Kiri(config, world);

    const [client0, client1, client2] = workspaceMock.createClientsWithWidths(200, 200, 200);
    qtMock.fireShortcut("window-move-left"); // client2 joins client1's column
    qtMock.fireShortcut("column-move-left");  // and the column moves to the front
    const nShortcuts = (kglobalaccel as MockKGlobalAccel).registered.size;
    const heightBefore = client1.getActualFrameGeometry().height;
    const xBefore = client0.getActualFrameGeometry().x;

    Assert.equal(kiri.reloadConfig(), false);

    settings.gapsInnerHorizontal = 20;
    settings.gapsInnerVertical = 20;
    Assert.equal(kiri.reloadConfig(), true);

    // same layout, new gaps
    const g0 = client0.getActualFrameGeometry();
    const g1 = client1.getActualFrameGeometry();
    const g2 = client2.getActualFrameGeometry();
    Assert.assert(g1.x < g0.x, { message: "column order is kept" });
    Assert.equal(g1.x, g2.x);
    Assert.equal(g1.width, 200);
    Assert.equal(g0.x - rectRight(g1), 20, { message: "new horizontal gap" });
    Assert.equal(g2.y - rectBottom(g1), 20, { message: "new vertical gap" });
    Assert.assert(heightBefore !== g1.height);

    // shortcuts are still registered once and act on the new world
    Assert.equal((kglobalaccel as MockKGlobalAccel).registered.size, nShortcuts);
    qtMock.fireShortcut("focus-right");
    Assert.assert(workspaceMock.activeWindow === client0);

    // windows opened afterwards are handled by the new world only
    const [client3] = workspaceMock.createClientsWithWidths(200);
    Assert.equal(client3.getActualFrameGeometry().height, tilingArea.height);
    Assert.assert(xBefore !== undefined);
});

tests.register("Reload removed key field", 1, () => {
    const config = getDefaultConfig();
    const { world } = init(config);
    const settings: any = Object.assign({}, config);
    KWin = { __brand: "KWin", readConfig: (key: string, defaultValue: any) => settings[key] ?? defaultValue };
    const kiri = new Kiri(config, world);
    const accel = kglobalaccel as MockKGlobalAccel;
    const defaultKeys = accel.registered.get("focus-left");

    settings.key1_focus_left = "Meta+D";
    Assert.equal(kiri.reloadConfig(), true);
    Assert.equal(String(accel.registered.get("focus-left")), String(parseKeySequence("Meta+D")));

    settings.key1_focus_left = "";
    Assert.equal(kiri.reloadConfig(), true);
    Assert.equal(String(accel.registered.get("focus-left")), String(defaultKeys), { message: "default keys are back" });
});

tests.register("niri's defaults: new windows are half as wide, columns aligned left", 5, () => {
    const config = getDefaultConfig();
    config.centerGridWhenFits = configDef.find(def => def.name === "centerGridWhenFits")!.default as boolean;
    config.defaultColumnWidth = configDef.find(def => def.name === "defaultColumnWidth")!.default as string;
    const { qtMock, workspaceMock, world } = init(config);

    const halfWidth = Math.floor((tilingArea.width + gapH) / 2 - gapH);
    const [client0] = workspaceMock.createClientsWithWidths(300);
    Assert.equal(client0.getActualFrameGeometry().width, halfWidth);
    Assert.equal(client0.getActualFrameGeometry().x, tilingArea.x, { message: "a lone column is not centered" });
    const [client1] = workspaceMock.createClientsWithWidths(500);
    Assert.equal(client1.getActualFrameGeometry().width, halfWidth);
    Assert.equal(client0.getActualFrameGeometry().x, tilingArea.x);
    Assert.equal(client1.getActualFrameGeometry().x, tilingArea.x + halfWidth + gapH);
});

tests.register("Shortcut keys from the settings or a pasted niri config apply without a new login", 1, () => {
    const config = getDefaultConfig();
    const { world } = init(config);
    const settings: any = Object.assign({}, config);
    KWin = { __brand: "KWin", readConfig: (key: string, defaultValue: any) => settings[key] ?? defaultValue };
    const kiri = new Kiri(config, world);
    const accel = kglobalaccel as MockKGlobalAccel;

    // what niri2kiri --apply writes: key fields in kwinrc
    settings.key1_focus_left = "Meta+Alt+J";
    settings.key2_focus_left = "Meta+Alt+K";
    Assert.equal(kiri.reloadConfig(), true);
    Assert.equal(String(accel.registered.get("focus-left")), String([parseKeySequence("Meta+Alt+J"), parseKeySequence("Meta+Alt+K")]));

    // a niri config pasted into the settings
    settings.key1_focus_left = "";
    settings.key2_focus_left = "";
    settings.niriConfigEnabled = true;
    settings.niriConfig = "binds { Mod+Alt+H { focus-column-left; } }";
    Assert.equal(kiri.reloadConfig(), true);
    Assert.assert(accel.registered.get("focus-left")!.includes(parseKeySequence("Meta+Alt+H")!));
    Assert.equal(accel.registered.get("focus-left")!.includes(parseKeySequence("Meta+Alt+J")!), false);
});
