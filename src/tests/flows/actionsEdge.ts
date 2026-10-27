// actions on states with nothing to act on must not throw
tests.register("Equalize widths on an empty desktop does nothing", 1, () => {
    const { world } = init(getDefaultConfig());
    const actions = new Actions({} as any);
    world.do((clientManager, desktopManager) => actions.columnsWidthEqualize(clientManager, desktopManager));
});

for (const centered of [false, true]) {
    tests.register("Minimize width with unusable presets keeps the width" + (centered ? " (centered)" : ""), 1, () => {
        const config = getDefaultConfig();
        config.presetWidths = "not a width";
        config.scrollingLazy = !centered;
        config.scrollingCentered = centered;
        notificationInvalidPresetWidths = { sendEvent: () => {} } as any;
        const { qtMock, workspaceMock } = init(config);
        const [client] = workspaceMock.createClients(1);
        const before = client.getActualFrameGeometry().width;
        qtMock.fireShortcut("column-width-minimize");
        Assert.equal(client.getActualFrameGeometry().width, before);
    });
}

tests.register("Trading window height stops at the minimum height", 1, () => {
    const { qtMock, workspaceMock } = init(getDefaultConfig());
    const [a, b] = workspaceMock.createClients(2);
    workspaceMock.activeWindow = b;
    qtMock.fireShortcut("window-consume-or-expel-left");
    workspaceMock.activeWindow = a;
    for (let i = 0; i < 40; i++) {
        qtMock.fireShortcut("window-height-increase-down");
    }
    for (const client of [a, b]) {
        Assert.assert(client.getActualFrameGeometry().height > 0, { message: "height: " + client.getActualFrameGeometry().height });
    }
    Assert.assert(rectBottom(b.getActualFrameGeometry()) <= rectBottom(tilingArea), { message: "the window stays on the screen" });
    workspaceMock.activeWindow = b;
    for (let i = 0; i < 80; i++) {
        qtMock.fireShortcut("window-height-increase-up"); // the other way
    }
    for (const client of [a, b]) {
        Assert.assert(client.getActualFrameGeometry().height > 0, { message: "height: " + client.getActualFrameGeometry().height });
    }
});
