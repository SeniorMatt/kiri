// niri's window heights: auto windows share what the fixed one leaves, other windows keep their height when one comes or
// goes
tests.register("Window heights (niri auto and fixed)", 10, () => {
    const config = getDefaultConfig();
    config.presetHeights = "25%, 50%, 75%";
    const { qtMock, workspaceMock, world } = init(config);

    const [a, b, c] = workspaceMock.createClientsWithWidths(300, 300, 300);
    workspaceMock.activeWindow = b;
    qtMock.fireShortcut("window-consume-or-expel-left"); // a b | c
    workspaceMock.activeWindow = c;
    qtMock.fireShortcut("window-consume-or-expel-left"); // a b c in one column
    const total = tilingArea.height - 2 * gapV;
    Assert.between(a.getActualFrameGeometry().height, Math.floor(total / 3), Math.ceil(total / 3));

    function preset(ratio: number) {
        return Math.floor((tilingArea.height + gapV) * ratio - gapV);
    }
    workspaceMock.activeWindow = b;
    qtMock.fireShortcut("window-height-cycle-presets");
    Assert.equal(b.getActualFrameGeometry().height, preset(0.5), { message: "first preset taller than the window" });
    const rest = total - preset(0.5);
    Assert.between(a.getActualFrameGeometry().height, Math.floor(rest / 2), Math.ceil(rest / 2));
    Assert.between(c.getActualFrameGeometry().height, Math.floor(rest / 2), Math.ceil(rest / 2));

    qtMock.fireShortcut("window-height-cycle-presets");
    Assert.equal(b.getActualFrameGeometry().height, preset(0.75), { message: "next preset" });
    qtMock.fireShortcut("window-height-cycle-presets-reverse");
    Assert.equal(b.getActualFrameGeometry().height, preset(0.5), { message: "back" });

    // a window that goes keeps the others' heights, the fixed one stays as it is
    workspaceMock.removeWindow(c);
    Assert.equal(b.getActualFrameGeometry().height, preset(0.5));
    Assert.equal(a.getActualFrameGeometry().height, tilingArea.height - gapV - preset(0.5));

    // a window that comes gets the free space together with the auto windows
    const [d] = workspaceMock.createClientsWithWidths(300);
    workspaceMock.activeWindow = d;
    qtMock.fireShortcut("window-consume-or-expel-left"); // d joins b's column? (left column is a b)
    Assert.equal(b.getActualFrameGeometry().height, preset(0.5));
    const free = total - preset(0.5);
    Assert.between(a.getActualFrameGeometry().height, Math.floor(free / 2), Math.ceil(free / 2));
    Assert.between(d.getActualFrameGeometry().height, Math.floor(free / 2), Math.ceil(free / 2));

    workspaceMock.activeWindow = b;
    qtMock.fireShortcut("window-height-reset");
    const third = total / 3;
    Assert.between(b.getActualFrameGeometry().height, Math.floor(free / 3 - 1), Math.ceil(third + 1));
});

tests.register("A single window can have a preset height (niri)", 5, () => {
    const config = getDefaultConfig();
    config.presetHeights = "50%";
    const { qtMock, workspaceMock, world } = init(config);
    const [a] = workspaceMock.createClientsWithWidths(300);
    qtMock.fireShortcut("window-height-cycle-presets");
    Assert.equal(a.getActualFrameGeometry().height, Math.floor((tilingArea.height + gapV) * 0.5 - gapV));
    Assert.equal(a.getActualFrameGeometry().y, tilingArea.y);
    qtMock.fireShortcut("window-height-reset");
    Assert.equal(a.getActualFrameGeometry().height, tilingArea.height);
});

// niri updates the tile sizes when a window commits new limits: a minimum height that grows after the window joined
// the column (Chromium, Konsole) takes space from the other windows
tests.register("Window heights follow a minimum that changes", 10, () => {
    const { qtMock, workspaceMock } = init(getDefaultConfig());
    const [a, b, c] = workspaceMock.createClientsWithWidths(300, 300, 300);
    workspaceMock.activeWindow = b;
    qtMock.fireShortcut("window-consume-or-expel-left");
    workspaceMock.activeWindow = c;
    qtMock.fireShortcut("window-consume-or-expel-left"); // a b c in one column
    const total = tilingArea.height - 2 * gapV;

    a.minSize = new MockQmlSize(50, Math.floor(total / 2));
    workspaceMock.activeWindow = b; // any event: the layout looks at the limits again
    Assert.equal(a.getActualFrameGeometry().height, Math.floor(total / 2), { message: "grown minimum honoured" });
    Assert.between(b.getActualFrameGeometry().height, Math.floor(total / 4), Math.ceil(total / 4));
    Assert.between(c.getActualFrameGeometry().height, Math.floor(total / 4), Math.ceil(total / 4));
    Assert.equal(a.getActualFrameGeometry().height + b.getActualFrameGeometry().height + c.getActualFrameGeometry().height + 2 * gapV, tilingArea.height);

    a.minSize = new MockQmlSize(50, 100);
    workspaceMock.activeWindow = c;
    Assert.between(a.getActualFrameGeometry().height, Math.floor(total / 3), Math.ceil(total / 3));
});
