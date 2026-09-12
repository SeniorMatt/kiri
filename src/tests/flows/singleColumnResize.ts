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
                    Assert.centered(config, tilingArea, client, { message: `centered during mouse resize ${scroller} ${alwaysCenter} ${centerWhenFits} left=${leftSide} step ${i}` });
                }
                client.resize = false;
                client.interactiveMoveResizeFinished.fire();
                Assert.centered(config, tilingArea, client, { message: "centered after mouse resize" });
            }

            workspaceMock.resizeWindow(client, true, leftSide, false, new MockQmlSize(20, 0));
            Assert.centered(config, tilingArea, client, { message: "centered after mouse resize" });

            workspaceMock.resizeWindow(client, true, leftSide, false, new MockQmlSize(20, 0), new MockQmlSize(10, 0));
            Assert.centered(config, tilingArea, client, { message: "centered after a longer mouse resize" });

            qtMock.fireShortcut("column-width-increase");
            Assert.centered(config, tilingArea, client, { message: "centered after a keyboard width change" });
        }
    }
});
