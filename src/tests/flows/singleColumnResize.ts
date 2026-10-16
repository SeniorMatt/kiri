tests.register("Single column stays centered while resizing", 6, () => {
    for (const [scroller, alwaysCenter, centerWhenFits] of [
        ["lazy", false, true], ["lazy", false, false], ["lazy", true, false],
        ["centered", false, false], ["onOverflow", false, false], ["grouped", false, false],
    ] as [string, boolean, boolean][]) {
        for (const leftSide of [false, true]) {
            const config = getDefaultConfig();
            config.alwaysCenterSingleColumn = alwaysCenter;
            config.centerGridWhenFits = centerWhenFits;
            config.scrollingLazy = scroller === "lazy";
            config.scrollingCentered = scroller === "centered";
            config.scrollingOnOverflow = scroller === "onOverflow";
            config.scrollingGrouped = scroller === "grouped";
            const { qtMock, workspaceMock, world } = init(config);
            const [client] = workspaceMock.createClientsWithWidths(300);
            const f = client.getActualFrameGeometry();
            if (Math.abs(f.x + f.width/2 - (tilingArea.x + tilingArea.width/2)) > 1) {
                continue; // this configuration doesn't center a lone column to begin with
            }

            // mid-drag: the pointer is still held
            {
                const frame = client.getFrameGeometryCopy();
                workspaceMock.cursorPos = new MockQmlPoint(leftSide ? frame.x : rectRight(frame), frame.y + 10);
                client.resize = true;
                client.interactiveMoveResizeStarted.fire();
                for (let i = 0; i < 3; i++) {
                    frame.width += 20;
                    if (leftSide) {
                        frame.x -= 20;
                    }
                    client.frameGeometry = frame;
                    // KWin owns the real geometry now: it must stay exactly where KWin put it ...
                    Assert.rect(client.getActualFrameGeometry(), frame.x, frame.y, frame.width, frame.height, { message: `real geometry untouched ${scroller} ${alwaysCenter} ${centerWhenFits} left=${leftSide} step ${i}` });
                    // ... and the effect is told to paint it centered
                    const pos = visualPositions.get(String(client.internalId));
                    const centeredX = Math.round(tilingArea.x + (tilingArea.width - frame.width) / 2);
                    if (pos === undefined) {
                        Assert.equal(frame.x, centeredX, { message: `already centered ${scroller} ${alwaysCenter} ${centerWhenFits} left=${leftSide} step ${i}` });
                    } else {
                        Assert.equal(pos[0], centeredX, { message: `visual x ${scroller} ${alwaysCenter} ${centerWhenFits} left=${leftSide} step ${i}` });
                    }
                }
                client.resize = false;
                client.interactiveMoveResizeFinished.fire();
                Assert.centered(config, tilingArea, client, { message: "centered after mouse resize" });
                Assert.equal(visualPositions.size, 0, { message: "visual offset cleared" });
            }

            workspaceMock.resizeWindow(client, true, leftSide, false, new MockQmlSize(20, 0));
            Assert.centered(config, tilingArea, client, { message: "centered after mouse resize" });

            workspaceMock.resizeWindow(client, true, leftSide, false, new MockQmlSize(20, 0), new MockQmlSize(10, 0));
            Assert.centered(config, tilingArea, client, { message: "centered after a longer mouse resize" });

            qtMock.fireShortcut("column-width-fit-increase");
            Assert.centered(config, tilingArea, client, { message: "centered after a keyboard width change" });
        }
    }
});

// niri keeps the view where it is while a column is resized (the left edge or the right edge stays, whichever is not
// dragged), however few columns there are; only "center when everything fits" (Karousel's setting) centers the group
tests.register("Columns that fit stay put while resizing, unless the grid is centered", 8, () => {
    for (const centerGridWhenFits of [false, true]) {
        for (const leftSide of [false, true]) {
            const config = getDefaultConfig();
            config.centerGridWhenFits = centerGridWhenFits;
            const { qtMock, workspaceMock } = init(config);
            const [a, b] = workspaceMock.createClientsWithWidths(200, 200);
            const start = a.getFrameGeometryCopy();
            const frame = a.getFrameGeometryCopy();
            const bStart = b.getActualFrameGeometry().x;
            workspaceMock.cursorPos = new MockQmlPoint(leftSide ? frame.x : rectRight(frame), frame.y + 10);
            a.resize = true;
            a.interactiveMoveResizeStarted.fire();
            for (let i = 0; i < 3; i++) {
                frame.width += 20;
                if (leftSide) {
                    frame.x -= 20;
                }
                a.interactiveMoveResizeStepped.fire(frame);
                a.frameGeometry = frame;
                const message = `step ${i} left=${leftSide} centered=${centerGridWhenFits}`;
                const fb = b.getActualFrameGeometry();
                if (centerGridWhenFits) {
                    const total = frame.width + gapH + fb.width;
                    Assert.equal(fb.x, Math.round(tilingArea.x + (tilingArea.width - total) / 2) + frame.width + gapH, { message: `neighbour follows, group centered ${message}` });
                } else if (leftSide) {
                    Assert.equal(fb.x, bStart, { message: `the right edge stays, the neighbour does not move ${message}` });
                } else {
                    Assert.equal(fb.x, start.x + frame.width + gapH, { message: `the left edge stays, the neighbour follows ${message}` });
                }
            }
            a.resize = false;
            a.interactiveMoveResizeFinished.fire();
            qtMock.fireShortcut("focus-right");
            const fa = a.getActualFrameGeometry(), fb = b.getActualFrameGeometry();
            Assert.equal(fa.width, frame.width, { message: `the new width sticks after release left=${leftSide}` });
            Assert.equal(fb.width, 200, { message: "neighbour width unchanged" });
            if (centerGridWhenFits) {
                const left = fa.x, right = rectRight(fb);
                Assert.between(Math.abs((left - tilingArea.x) - (tilingArea.x + tilingArea.width - right)), 0, 1, { message: "group centered after resize" });
            } else {
                Assert.equal(fb.x - rectRight(fa), gapH, { message: `columns keep their gap after release left=${leftSide}` });
            }
        }
    }
});

tests.register("Lone column re-centers when its neighbour closes", 6, () => {
    for (const alwaysCenter of [true, false]) {
        for (const closeFirst of [false, true]) {
            const config = getDefaultConfig();
            config.alwaysCenterSingleColumn = alwaysCenter;
            config.centerGridWhenFits = false;
            const { qtMock, workspaceMock, world } = init(config);
            const [a] = workspaceMock.createClientsWithWidths(300);
            const [b] = workspaceMock.createClientsWithWidths(300);
            const message = `always=${alwaysCenter} closeFirst=${closeFirst}`;
            if (closeFirst) {
                workspaceMock.activeWindow = a;
                workspaceMock.removeWindow(a);
                if (alwaysCenter) {
                    Assert.centered(config, tilingArea, b, { message });
                }
            } else {
                workspaceMock.removeWindow(b);
                if (alwaysCenter) {
                    Assert.centered(config, tilingArea, a, { message });
                }
            }
            workspaceMock.removeWindow(closeFirst ? b : a);
        }
    }
});

tests.register("Lone column re-centers when a manually focused neighbour closes", 6, () => {
    const config = getDefaultConfig();
    config.alwaysCenterSingleColumn = true;
    const { qtMock, workspaceMock, world } = init(config);
    const [a] = workspaceMock.createClientsWithWidths(300);
    const [b] = workspaceMock.createClientsWithWidths(300);
    qtMock.fireShortcut("focus-left");
    qtMock.fireShortcut("focus-right");
    workspaceMock.removeWindow(b);
    Assert.centered(config, tilingArea, a);
    const [c] = workspaceMock.createClientsWithWidths(300);
    qtMock.fireShortcut("focus-left");
    workspaceMock.removeWindow(a);
    Assert.centered(config, tilingArea, c);
});

tests.register("Lone column stays centered through consume, expel and width changes", 6, () => {
    const config = getDefaultConfig();
    config.alwaysCenterSingleColumn = true;
    const { qtMock, workspaceMock, world } = init(config);
    const [a, b] = workspaceMock.createClientsWithWidths(300, 300);
    qtMock.fireShortcut("window-consume-or-expel-left"); // b joins a: one column
    Assert.equal(Math.round(a.getActualFrameGeometry().x + a.getActualFrameGeometry().width / 2), Math.round(tilingArea.x + tilingArea.width / 2), { message: "consume" });
    qtMock.fireShortcut("window-consume-or-expel-right"); // b leaves again: two columns
    qtMock.fireShortcut("window-consume-or-expel-left");
    Assert.equal(Math.round(a.getActualFrameGeometry().x + a.getActualFrameGeometry().width / 2), Math.round(tilingArea.x + tilingArea.width / 2), { message: "consume again" });
    qtMock.fireShortcut("column-width-fit-increase");
    Assert.equal(Math.round(a.getActualFrameGeometry().x + a.getActualFrameGeometry().width / 2), Math.round(tilingArea.x + tilingArea.width / 2), { message: "wider" });
    qtMock.fireShortcut("column-width-fit-decrease");
    Assert.equal(Math.round(a.getActualFrameGeometry().x + a.getActualFrameGeometry().width / 2), Math.round(tilingArea.x + tilingArea.width / 2), { message: "narrower" });
    workspaceMock.removeWindow(b);
    Assert.equal(Math.round(a.getActualFrameGeometry().x + a.getActualFrameGeometry().width / 2), Math.round(tilingArea.x + tilingArea.width / 2), { message: "one window of the column closed" });
});
