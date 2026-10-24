// niri keeps the left edge of the focused column where it is when its width changes (the view offset is relative to the
// active column) and slides the columns to its right; the view only moves when the column no longer fits
function widthViewSetup(modify: (config: Config) => void = () => {}) {
    const config = getDefaultConfig();
    config.centerGridWhenFits = false;
    modify(config);
    const env = init(config);
    const [a, b, c] = env.workspaceMock.createClientsWithWidths(300, 300, 300);
    env.workspaceMock.activeWindow = c;
    env.qtMock.fireShortcut("focus-left");
    Assert.assert(env.workspaceMock.activeWindow === b, { message: "B is focused" });
    return { ...env, a, b, c };
}

tests.register("Column width keys keep the left edge of the focused column", 4, () => {
    for (const key of ["column-width-decrease", "column-width-increase", "cycle-preset-widths"]) {
        const { qtMock, a, b, c } = widthViewSetup();
        const message = key;
        const bx = b.getActualFrameGeometry().x;
        const ax = a.getActualFrameGeometry().x;
        qtMock.fireShortcut(key);
        const fb = b.getActualFrameGeometry();
        if (fb.width < tilingArea.width) {
            Assert.equal(fb.x, bx, { message: `left edge of B stays: ${message}` });
            Assert.equal(a.getActualFrameGeometry().x, ax, { message: `A stays: ${message}` });
            Assert.equal(c.getActualFrameGeometry().x, rectRight(fb) + gapH, { message: `C follows B: ${message}` });
        }
    }
});

tests.register("Interactive resize from the right edge keeps the left edge and the view", 3, () => {
    const { workspaceMock, a, b, c } = widthViewSetup();
    const bx = b.getActualFrameGeometry().x;
    const ax = a.getActualFrameGeometry().x;
    workspaceMock.resizeWindow(b, true, false, false, new MockQmlSize(-30, 0), new MockQmlSize(-30, 0));
    const fb = b.getActualFrameGeometry();
    Assert.equal(fb.width, 240, { message: "B shrank" });
    Assert.equal(fb.x, bx, { message: "left edge stays" });
    Assert.equal(a.getActualFrameGeometry().x, ax, { message: "view frozen" });
    Assert.equal(c.getActualFrameGeometry().x, rectRight(fb) + gapH, { message: "C follows" });
});

tests.register("Interactive resize from the left edge keeps the right edge", 3, () => {
    const { workspaceMock, a, b, c } = widthViewSetup();
    const right = rectRight(b.getActualFrameGeometry());
    const cx = c.getActualFrameGeometry().x;
    workspaceMock.resizeWindow(b, true, true, false, new MockQmlSize(-30, 0), new MockQmlSize(-30, 0));
    const fb = b.getActualFrameGeometry();
    Assert.equal(fb.width, 240, { message: "B shrank" });
    Assert.equal(rectRight(fb), right, { message: "right edge stays" });
    Assert.equal(c.getActualFrameGeometry().x, cx, { message: "C stays" });
});

tests.register("Width change of a centered column keeps it centered", 2, () => {
    const { qtMock, b } = widthViewSetup(config => { config.scrollingLazy = false; config.scrollingCentered = true; });
    qtMock.fireShortcut("column-width-decrease");
    const fb = b.getActualFrameGeometry();
    Assert.between(Math.abs((fb.x - tilingArea.x) - (tilingArea.x + tilingArea.width - rectRight(fb))), 0, 1, { message: "B stays centered" });
});

tests.register("A column that grows past the screen is left aligned, one that overflows a little scrolls the shortest way", 4, () => {
    {
        const { qtMock, b } = widthViewSetup();
        qtMock.fireShortcut("column-width-maximize");
        const fb = b.getActualFrameGeometry();
        Assert.equal(fb.x, tilingArea.x, { message: "full width column is left aligned" });
        Assert.equal(fb.width, tilingArea.width, { message: "full width" });
    }
    {
        const { qtMock, workspaceMock, b } = widthViewSetup();
        workspaceMock.resizeWindow(b, true, false, false, new MockQmlSize(500, 0));
        qtMock.fireShortcut("column-width-increase");
        const fb = b.getActualFrameGeometry();
        Assert.assert(fb.x >= tilingArea.x && rectRight(fb) <= tilingArea.x + tilingArea.width, { message: "B is fully visible" });
    }
});
