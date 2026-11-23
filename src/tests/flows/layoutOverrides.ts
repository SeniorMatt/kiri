// niri's per-workspace and per-output layout {}: global layout, the output's over it, the workspace's over both
{
    const right = () => new MockQmlRect(800, 0, 800, 600);

    function widthsAndGap(a: MockKwinClient, b: MockKwinClient) {
        return Math.round(b.getActualFrameGeometry().x - rectRight(a.getActualFrameGeometry()));
    }

    tests.register("Layout override: a desktop's gap applies on that desktop only", 3, () => {
        const config = getDefaultConfig();
        config.centerGridWhenFits = false;
        config.desktopLayouts = JSON.stringify({ "desktop 2": { gapsInnerHorizontal: 0, gapsOuterLeft: 40 } }); // names match without case
        const { workspaceMock } = init(config);
        const [a, b] = workspaceMock.createClientsWithWidths(200, 200);
        Assert.equal(widthsAndGap(a, b), config.gapsInnerHorizontal);
        Assert.equal(Math.round(a.getActualFrameGeometry().x), config.gapsOuterLeft);
        workspaceMock.currentDesktop = workspaceMock.desktops[1];
        const [c, d] = workspaceMock.createClientsWithWidths(200, 200);
        Assert.equal(widthsAndGap(c, d), 0, { message: "no gap on the desktop with the override" });
        Assert.equal(Math.round(c.getActualFrameGeometry().x), 40, { message: "its own outer gap" });
        workspaceMock.currentDesktop = workspaceMock.desktops[0];
        Assert.equal(widthsAndGap(a, b), config.gapsInnerHorizontal, { message: "the other desktop keeps the global gap" });
    });

    tests.register("Layout override: a desktop's preset widths and default width", 3, () => {
        const config = getDefaultConfig();
        config.centerGridWhenFits = false;
        config.desktopLayouts = JSON.stringify({ "Desktop 2": { presetWidths: "25%, 75%", defaultColumnWidth: "50%" } });
        const { qtMock, workspaceMock } = init(config);
        const [a] = workspaceMock.createClientsWithWidths(300);
        qtMock.fireShortcut("cycle-preset-widths");
        const first = Math.round(a.getActualFrameGeometry().width);
        const share = (proportion: number) => Math.round((tilingArea.width + gapH) * proportion - gapH);
        Assert.equal(first, share(0.5), { message: "the global presets (50%, 100%): the first press after 300 px" });
        workspaceMock.currentDesktop = workspaceMock.desktops[1];
        const [b] = workspaceMock.createClientsWithWidths(300);
        Assert.equal(Math.round(b.getActualFrameGeometry().width), share(0.5), { message: "default-column-width of the desktop" });
        qtMock.fireShortcut("cycle-preset-widths");
        Assert.equal(Math.round(b.getActualFrameGeometry().width), share(0.75), { message: "the next preset of the desktop (25%, 75%)" });
    });

    tests.register("Layout override: an output's layout and the desktop's over it", 4, () => {
        const config = getDefaultConfig();
        config.centerGridWhenFits = false;
        config.outputOverrides = JSON.stringify({ "dp-2": { layout: { gapsInnerHorizontal: 20, gapsOuterLeft: 30 } } });
        config.desktopLayouts = JSON.stringify({ "Desktop 2": { gapsInnerHorizontal: 2 } });
        const { workspaceMock } = init(config);
        workspaceMock.setOutputs(["DP-1", screen], ["DP-2", right()]);
        const [a, b] = workspaceMock.createClientsWithWidths(200, 200);
        const [c, d] = workspaceMock.createClientsWithFrames(new MockQmlRect(900, 100, 200, 300), new MockQmlRect(900, 100, 200, 300));
        Assert.equal(widthsAndGap(a, b), config.gapsInnerHorizontal, { message: "the first output has the global layout" });
        Assert.equal(widthsAndGap(c, d), 20, { message: "the second output has its own gap" });
        Assert.equal(Math.round(c.getActualFrameGeometry().x), 800 + 30, { message: "and its own outer gap" });
        // the desktop's layout wins over the output's, field by field: the gap is the desktop's, the outer gap the output's
        workspaceMock.currentDesktop = workspaceMock.desktops[1];
        const [e, f] = workspaceMock.createClientsWithFrames(new MockQmlRect(900, 100, 200, 300), new MockQmlRect(900, 100, 200, 300));
        Assert.equal(widthsAndGap(e, f), 2);
        Assert.equal(Math.round(e.getActualFrameGeometry().x), 800 + 30);
    });

    tests.register("Layout override: looks and backgrounds reach the decorations effect", 3, () => {
        const config = getDefaultConfig();
        config.centerGridWhenFits = false;
        config.desktopLayouts = JSON.stringify({ "Desktop 2": { focusRingWidth: 9, fullscreenBackdropColor: "#112233", backgroundColor: "#445566" } });
        config.outputOverrides = JSON.stringify({ "DP-2": { layout: { borderWidth: 7, backgroundColor: "#778899" } } });
        const { workspaceMock } = init(config);
        workspaceMock.setOutputs(["DP-1", screen], ["DP-2", right()]);
        const [a] = workspaceMock.createClientsWithWidths(200);
        const [b] = workspaceMock.createClientsWithFrames(new MockQmlRect(900, 100, 200, 300));
        const looks = JSON.parse(lastWindowDecorationsJson);
        Assert.equal(looks[String(a.internalId)], undefined, { message: "no override, no look" });
        Assert.equal(looks[String(b.internalId)].border.width, 7, { message: "the look of the output" });
        const backgrounds = () => JSON.parse(lastDecorationsConfigJson).outputBackgrounds;
        Assert.equal(JSON.stringify(backgrounds()), JSON.stringify({ "DP-2": "#778899" }));
        workspaceMock.currentDesktop = workspaceMock.desktops[1];
        const [c] = workspaceMock.createClientsWithWidths(200);
        const look = JSON.parse(lastWindowDecorationsJson)[String(c.internalId)];
        Assert.equal(look.focusRing.width, 9);
        Assert.equal(look.fullscreenBackdropColor, "#112233");
        Assert.equal(backgrounds()["DP-1"], "#445566", { message: "the background of the desktop that is shown on the output" });
    });
}
