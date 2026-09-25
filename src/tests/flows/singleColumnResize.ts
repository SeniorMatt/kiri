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
