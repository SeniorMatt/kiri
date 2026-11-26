// issue 85: Chromium commits the new position at the old size first and the size after; that is not a refusal
tests.register("A two-step client always reaches the asked width", 10, () => {
    timeControl(addTime => {
        const config = getDefaultConfig();
        const { qtMock, workspaceMock } = init(config);
        const [left, middle] = workspaceMock.createClientsWithWidths(300, 300);
        middle.twoStep = true;
        workspaceMock.activeWindow = middle;
        for (let i = 0; i < 6; i++) {
            qtMock.fireShortcut("column-width-maximize");
            addTime(50);
            Assert.equal(Math.round(middle.getActualFrameGeometry().width), tilingArea.width, { message: "maximize " + i });
            qtMock.fireShortcut("column-width-maximize");
            addTime(50);
            Assert.equal(Math.round(middle.getActualFrameGeometry().width), 300, { message: "restore " + i });
        }
        for (const preset of [1, 2, 3, 4]) {
            qtMock.fireShortcut("cycle-preset-widths");
            addTime(50);
        }
        addTime(2000);
        const before = Math.round(middle.getActualFrameGeometry().width);
        qtMock.fireShortcut("column-width-maximize");
        addTime(50);
        // still takes a new size: not learned as a refusal (from full width that is the default width, see issue 84)
        const after = Math.round(middle.getActualFrameGeometry().width);
        Assert.assert(after !== before, { message: "after the presets the width still changes, stayed at " + after });
    });
});

tests.register("A client that stays at its old size becomes a refusal after the wait", 10, () => {
    timeControl(addTime => {
        const config = getDefaultConfig();
        const { qtMock, workspaceMock } = init(config);
        const [left, middle] = workspaceMock.createClientsWithWidths(300, 300);
        middle.refusesSize = true;
        workspaceMock.activeWindow = middle;
        MockQmlTimer.deferIntervals.add(500);
        try {
            qtMock.fireShortcut("column-width-maximize");
            const width = Math.round(middle.getRealFrameGeometry().width);
            const counts: number[] = [];
            for (let i = 0; i < 6; i++) {
                addTime(600);
                MockQmlTimer.flush();
                qtMock.fireShortcut("focus-left");
                qtMock.fireShortcut("focus-right");
                // only asks for another size count: moves while the view scrolls are fine
                counts.push(middle.assignedGeometries.filter(g => Math.round(g.width) !== width).length);
            }
            Assert.equal(Math.round(middle.getRealFrameGeometry().width), width, { message: "the client kept its size" });
            Assert.equal(counts[5], counts[3], { message: "the refusal is learned: no more asks " + counts.join(",") });
        } finally {
            MockQmlTimer.deferIntervals.clear();
            MockQmlTimer.flush();
        }
    });
});
