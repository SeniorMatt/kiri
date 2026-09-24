tests.register("Preset Widths default", 5, () => {
    const config = getDefaultConfig();
    const { qtMock, workspaceMock, world } = init(config);

    const maxWidth = tilingArea.width;
    const halfWidth = maxWidth/2 - config.gapsInnerHorizontal/2;

    function getRect(columnWidth: number) {
        return new MockQmlRect(
            tilingArea.x + (tilingArea.width - columnWidth) / 2,
            tilingArea.y,
            columnWidth,
            tilingArea.height,
        );
    }

    const [kwinClient] = workspaceMock.createClientsWithWidths(300);
    Assert.equalRects(kwinClient.getActualFrameGeometry(), getRect(300));

    runOneOf(
        () => qtMock.fireShortcut("cycle-preset-widths"),
        () => qtMock.fireShortcut("column-width-fit-increase"),
    );
    Assert.equalRects(kwinClient.getActualFrameGeometry(), getRect(halfWidth));

    runOneOf(
        () => qtMock.fireShortcut("cycle-preset-widths"),
        () => qtMock.fireShortcut("column-width-fit-increase"),
    );
    Assert.equalRects(kwinClient.getActualFrameGeometry(), getRect(maxWidth));

    runOneOf(
        () => qtMock.fireShortcut("cycle-preset-widths"),
        () => qtMock.fireShortcut("column-width-fit-decrease"),
    );
    Assert.equalRects(kwinClient.getActualFrameGeometry(), getRect(halfWidth));

    runOneOf(
        () => qtMock.fireShortcut("cycle-preset-widths"),
        () => qtMock.fireShortcut("column-width-fit-increase"),
    );
    Assert.equalRects(kwinClient.getActualFrameGeometry(), getRect(maxWidth));

    runOneOf(
        () => qtMock.fireShortcut("cycle-preset-widths"),
        () => qtMock.fireShortcut("column-width-fit-decrease"),
    );
    Assert.equalRects(kwinClient.getActualFrameGeometry(), getRect(halfWidth));
});

tests.register("Preset Widths custom", 5, () => {
    const config = getDefaultConfig();
    config.presetWidths = "500px, 250px, 100px, 50%";
    const { qtMock, workspaceMock, world } = init(config);

    const maxWidth = tilingArea.width;
    const halfWidth = maxWidth/2 - config.gapsInnerHorizontal/2;

    function getRect(columnWidth: number) {
        return new MockQmlRect(
            tilingArea.x + (tilingArea.width - columnWidth) / 2,
            tilingArea.y,
            columnWidth,
            tilingArea.height,
        );
    }

    const [kwinClient] = workspaceMock.createClientsWithWidths(200);
    Assert.equalRects(kwinClient.getActualFrameGeometry(), getRect(200));

    runOneOf(
        () => qtMock.fireShortcut("cycle-preset-widths"),
        () => qtMock.fireShortcut("column-width-fit-increase"),
    );
    Assert.equalRects(kwinClient.getActualFrameGeometry(), getRect(250));

    runOneOf(
        () => qtMock.fireShortcut("cycle-preset-widths"),
        () => qtMock.fireShortcut("column-width-fit-increase"),
    );
    Assert.equalRects(kwinClient.getActualFrameGeometry(), getRect(halfWidth));

    runOneOf(
        () => qtMock.fireShortcut("cycle-preset-widths"),
        () => qtMock.fireShortcut("column-width-fit-increase"),
    );
    Assert.equalRects(kwinClient.getActualFrameGeometry(), getRect(500));

    qtMock.fireShortcut("cycle-preset-widths");
    Assert.equalRects(kwinClient.getActualFrameGeometry(), getRect(100));

    runOneOf(
        () => qtMock.fireShortcut("cycle-preset-widths"),
        () => qtMock.fireShortcut("column-width-fit-increase"),
    );
    Assert.equalRects(kwinClient.getActualFrameGeometry(), getRect(250));

    runOneOf(
        () => qtMock.fireShortcut("cycle-preset-widths-reverse"),
        () => qtMock.fireShortcut("column-width-fit-decrease"),
    );
    Assert.equalRects(kwinClient.getActualFrameGeometry(), getRect(100));

    qtMock.fireShortcut("cycle-preset-widths-reverse");
    Assert.equalRects(kwinClient.getActualFrameGeometry(), getRect(500));

    runOneOf(
        () => qtMock.fireShortcut("cycle-preset-widths-reverse"),
        () => qtMock.fireShortcut("column-width-fit-decrease"),
    );
    Assert.equalRects(kwinClient.getActualFrameGeometry(), getRect(halfWidth));
});

tests.register("Preset Widths custom percentages", 5, () => {
    const config = getDefaultConfig();
    config.presetWidths = "25%, 50%, 75%, 100%";
    const { qtMock, workspaceMock, world } = init(config);

    const width100 = tilingArea.width;
    const width75 = width100*0.75 - config.gapsInnerHorizontal*0.25;
    const width50 = width100*0.50 - config.gapsInnerHorizontal*0.50;
    const width25 = width100*0.25 - config.gapsInnerHorizontal*0.75;

    function getRect(columnWidth: number) {
        return new MockQmlRect(
            tilingArea.x + (tilingArea.width - columnWidth) / 2,
            tilingArea.y,
            columnWidth,
            tilingArea.height,
        );
    }

    const [kwinClient] = workspaceMock.createClientsWithWidths(200);
    Assert.equalRects(kwinClient.getActualFrameGeometry(), getRect(200));

    runOneOf(
        () => qtMock.fireShortcut("cycle-preset-widths"),
        () => qtMock.fireShortcut("column-width-fit-increase"),
    );
    Assert.equalRects(kwinClient.getActualFrameGeometry(), getRect(width50));

    runOneOf(
        () => qtMock.fireShortcut("cycle-preset-widths"),
        () => qtMock.fireShortcut("column-width-fit-increase"),
    );
    Assert.equalRects(kwinClient.getActualFrameGeometry(), getRect(width75));

    runOneOf(
        () => qtMock.fireShortcut("cycle-preset-widths"),
        () => qtMock.fireShortcut("column-width-fit-increase"),
    );
    Assert.equalRects(kwinClient.getActualFrameGeometry(), getRect(width100));

    qtMock.fireShortcut("cycle-preset-widths");
    Assert.equalRects(kwinClient.getActualFrameGeometry(), getRect(width25));

    qtMock.fireShortcut("cycle-preset-widths-reverse");
    Assert.equalRects(kwinClient.getActualFrameGeometry(), getRect(width100));

    runOneOf(
        () => qtMock.fireShortcut("cycle-preset-widths-reverse"),
        () => qtMock.fireShortcut("column-width-fit-decrease"),
    );
    Assert.equalRects(kwinClient.getActualFrameGeometry(), getRect(width75));

    runOneOf(
        () => qtMock.fireShortcut("cycle-preset-widths-reverse"),
        () => qtMock.fireShortcut("column-width-fit-decrease"),
    );
    Assert.equalRects(kwinClient.getActualFrameGeometry(), getRect(width50));

    runOneOf(
        () => qtMock.fireShortcut("cycle-preset-widths-reverse"),
        () => qtMock.fireShortcut("column-width-fit-decrease"),
    );
    Assert.equalRects(kwinClient.getActualFrameGeometry(), getRect(width25));
});

tests.register("Preset Widths fill screen uniform", 1, () => {
    for (let nColumns = 1; nColumns < 10; nColumns++) {
        const config = getDefaultConfig();
        config.presetWidths = String(1 / nColumns);
        const { qtMock, workspaceMock, world } = init(config);

        let firstClient, lastClient;
        for (let i = 0; i < nColumns; i++) {
            const [kwinClient] = workspaceMock.createClientsWithWidths(300);
            if (i === 0) {
                firstClient = kwinClient;
            }
            if (i === nColumns-1) {
                lastClient = kwinClient;
            }
            qtMock.fireShortcut("cycle-preset-widths");
        }

        const left = tilingArea.x;
        const right = rectRight(tilingArea);
        const maxLeftoverPx = nColumns - 1;
        const eps = Math.ceil(maxLeftoverPx / 2);
        Assert.between(firstClient!.getActualFrameGeometry().x, left, left+eps, { message: `nColumns: ${nColumns}` });
        Assert.between(rectRight(lastClient!.getActualFrameGeometry()), right-eps, right, { message: `nColumns: ${nColumns}` });
    }
});

tests.register("Preset Widths fill screen non-uniform", 1, () => {
    const config = getDefaultConfig();
    config.presetWidths = String("50%, 25%");
    const { qtMock, workspaceMock, world } = init(config);

    const [clientThin1] = workspaceMock.createClientsWithWidths(100);
    qtMock.fireShortcut("cycle-preset-widths");

    const [clientThin2] = workspaceMock.createClientsWithWidths(100);
    qtMock.fireShortcut("cycle-preset-widths");

    const [clientWide] = workspaceMock.createClientsWithWidths(300);
    qtMock.fireShortcut("cycle-preset-widths");

    const maxWidth = tilingArea.width;
    const halfWidth = maxWidth/2 - config.gapsInnerHorizontal/2;
    const quarterWidth = halfWidth/2 - config.gapsInnerHorizontal/2;
    const height = tilingArea.height;
    const left1 = tilingArea.x;
    const left2 = left1 + config.gapsInnerHorizontal + quarterWidth;
    const left3 = left2 + config.gapsInnerHorizontal + quarterWidth;

    Assert.rect(clientThin1.getActualFrameGeometry(), left1, tilingArea.y, quarterWidth, height);
    Assert.rect(clientThin2.getActualFrameGeometry(), left2, tilingArea.y, quarterWidth, height);
    Assert.rect(clientWide.getActualFrameGeometry(), left3, tilingArea.y, halfWidth, height);
    Assert.equal(rectRight(clientWide.getActualFrameGeometry()), rectRight(tilingArea));
});

// the client ends up a bit narrower than asked (fractional scale, cell grid), after the window was placed
function snapClientWidth(kwinClient: MockKwinClient, snap: (width: number) => number) {
    const frame = kwinClient.getFrameGeometryCopy();
    kwinClient.frameGeometry = new MockQmlRect(frame.x, frame.y, snap(frame.width), frame.height);
}

tests.register("Preset Widths cycle when the client rounds the width down", 1, () => {
    const config = getDefaultConfig();
    config.presetWidths = "25%, 50%, 75%, 100%";
    const { qtMock, workspaceMock } = init(config);

    const cycle = () => qtMock.fireShortcut("cycle-preset-widths");
    const [kwinClient] = workspaceMock.createClientsWithWidths(100);
    const widthOf = (ratio: number) => Math.floor((tilingArea.width + gapH) * ratio - gapH);
    const width = () => Math.round(kwinClient.getActualFrameGeometry().width);

    for (const ratio of [0.25, 0.5, 0.75, 1]) {
        cycle();
        Assert.equal(width(), widthOf(ratio));
        snapClientWidth(kwinClient, w => w - 1);
    }
    cycle();
    Assert.equal(width(), widthOf(0.25), { message: "wraps around to the first preset" });
    snapClientWidth(kwinClient, w => w - 1);

    qtMock.fireShortcut("cycle-preset-widths-reverse");
    Assert.equal(width(), widthOf(1));
    snapClientWidth(kwinClient, w => w - 1);
    qtMock.fireShortcut("cycle-preset-widths-reverse");
    Assert.equal(width(), widthOf(0.75));
});

tests.register("Preset Widths cycle forgets the index after another resize", 1, () => {
    const config = getDefaultConfig();
    config.presetWidths = "25%, 50%, 75%, 100%";
    const { qtMock, workspaceMock } = init(config);

    const [kwinClient] = workspaceMock.createClientsWithWidths(100);
    const widthOf = (ratio: number) => Math.floor((tilingArea.width + gapH) * ratio - gapH);
    qtMock.fireShortcut("cycle-preset-widths"); // 25%
    qtMock.fireShortcut("cycle-preset-widths"); // 50%
    qtMock.fireShortcut("column-width-fit-increase"); // 75%
    qtMock.fireShortcut("cycle-preset-widths");
    Assert.equal(Math.round(kwinClient.getActualFrameGeometry().width), widthOf(1));
});

tests.register("Increasing the width of a client that snaps to a cell grid", 1, () => {
    for (const centered of [false, true]) {
        const config = getDefaultConfig();
        config.presetWidths = "25%, 50%, 75%, 100%";
        config.scrollingCentered = centered;
        const { qtMock, workspaceMock } = init(config);

        const [kwinClient] = workspaceMock.createClientsWithWidths(100);
        const width = () => Math.round(kwinClient.getActualFrameGeometry().width);
        const seen: number[] = [];
        for (let i = 0; i < 4; i++) {
            qtMock.fireShortcut("column-width-fit-increase");
            seen.push(width());
            snapClientWidth(kwinClient, w => Math.floor(w / 10) * 10);
        }
        Assert.assert(seen[0] > 100 && seen[1] > seen[0] && seen[2] > seen[1] && seen[3] > seen[2],
            { message: `widths must keep growing, got ${seen.join(", ")} (centered: ${centered})` });
        for (let i = 0; i < 4; i++) {
            qtMock.fireShortcut("column-width-fit-decrease");
            seen.push(width());
            snapClientWidth(kwinClient, w => Math.floor(w / 10) * 10);
        }
        Assert.assert(seen[4] < seen[3] && seen[5] < seen[4] && seen[6] < seen[5],
            { message: `widths must keep shrinking, got ${seen.join(", ")} (centered: ${centered})` });
    }
});
