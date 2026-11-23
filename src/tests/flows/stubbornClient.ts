// issue 66: a client that does not take the height it is given (scrcpy keeps its aspect ratio, winewayland ignores
// configures) answered every layout with its own height, and every answer made the layout ask again, for ever
tests.register("A client that keeps its own height does not make the layout ask again and again", 3, () => {
    timeControl(addTime => {
        const config = getDefaultConfig();
        const { workspaceMock } = init(config);
        const [other, stubborn] = workspaceMock.createClientsWithWidths(300, 300);
        stubborn.stubbornHeight = 300;
        workspaceMock.activeWindow = stubborn;

        let answers = 0;
        for (let round = 0; round < 12; round++) {
            addTime(80); // the client needs a moment to answer
            if (stubborn.answerStubborn()) {
                answers++;
            }
        }
        const asked = stubborn.assignedGeometries.length;
        Assert.assert(answers <= 5, { message: "the client had to answer " + answers + " times" });

        // it has settled: no more answers, no more requests, whatever happens next
        for (let round = 0; round < 12; round++) {
            addTime(80);
            Assert.assert(!stubborn.answerStubborn(), { message: "the client is still being asked (round " + round + ")" });
        }
        Assert.equal(stubborn.assignedGeometries.length, asked);

        const frame = stubborn.getActualFrameGeometry();
        Assert.equal(Math.round(frame.height), 300);
        Assert.equal(Math.round(frame.y), tilingArea.y, { message: "the window is at the top of its slot, not where the client's answer left it" });
        Assert.equal(Math.round(other.getActualFrameGeometry().height), tilingArea.height, { message: "the neighbour is not affected" });
    });
});

tests.register("A client that cannot be smaller than its own height makes the others share what is left", 3, () => {
    timeControl(addTime => {
        const config = getDefaultConfig();
        const { qtMock, workspaceMock } = init(config);
        const [first, second] = workspaceMock.createClientsWithWidths(300, 300);
        second.stubbornHeight = 450;
        workspaceMock.activeWindow = second;
        qtMock.fireShortcut("window-move-left"); // both in one column: each is asked for about half of the screen
        for (let round = 0; round < 12; round++) {
            addTime(80);
            second.answerStubborn();
        }
        addTime(80);
        Assert.assert(!second.answerStubborn(), { message: "settled" });
        Assert.equal(Math.round(second.getActualFrameGeometry().height), 450);
        Assert.equal(Math.round(first.getActualFrameGeometry().height), tilingArea.height - gapV - 450);
        Assert.equal(Math.round(second.getActualFrameGeometry().y), Math.round(first.getActualFrameGeometry().y + first.getActualFrameGeometry().height + gapV));
    });
});

tests.register("A client that snaps to its own steps (a terminal's cells) is not taken for one that keeps its height", 3, () => {
    timeControl(addTime => {
        const config = getDefaultConfig();
        const { qtMock, workspaceMock } = init(config);
        const [first, terminal] = workspaceMock.createClientsWithWidths(300, 300);
        terminal.heightStep = 37;
        workspaceMock.activeWindow = terminal;
        qtMock.fireShortcut("window-move-left"); // both in one column: each gets about half of the screen
        for (const key of ["cycle-preset-widths", "focus-up", "focus-down", "cycle-preset-widths", "focus-up", "focus-down"]) {
            addTime(80);
            qtMock.fireShortcut(key);
        }
        addTime(80);
        workspaceMock.removeWindow(first);
        addTime(80);
        // the terminal has the whole column now, to the step
        const height = Math.round(terminal.getActualFrameGeometry().height);
        Assert.assert(height >= tilingArea.height - 37 - 1, { message: "the terminal grew with its slot: " + height + " of " + tilingArea.height });
    });
});
