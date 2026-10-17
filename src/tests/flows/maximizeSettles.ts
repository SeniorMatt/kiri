// KWin tells a script that a window is about to be maximized or restored before it is: an X11 window that is given a
// geometry in that moment ends up with the wrong size after a restore (it stayed screen-sized and unmaximized). The
// layout reacts when KWin is done.
tests.register("Layout waits for KWin to finish maximizing and restoring a window", 10, () => {
    const config = getDefaultConfig();
    config.tileMaximized = true;
    const { workspaceMock } = init(config);
    const [, middle, right] = workspaceMock.createClientsWithWidths(300, 300, 300);
    workspaceMock.activeWindow = middle;
    const rightBefore = right.getActualFrameGeometry().x;
    const middleWidth = middle.getActualFrameGeometry().width;

    MockQmlTimer.deferred = true;
    try {
        middle.setMaximize(true, true);
        Assert.equal(right.getActualFrameGeometry().x, rightBefore, { message: "nothing is placed while KWin maximizes" });
        MockQmlTimer.flush();
        Assert.assert(right.getActualFrameGeometry().x !== rightBefore, { message: "the neighbours make room afterwards" });

        const rightMaximized = right.getActualFrameGeometry().x;
        middle.setMaximize(false, false);
        Assert.equal(right.getActualFrameGeometry().x, rightMaximized, { message: "nothing is placed while KWin restores" });
        MockQmlTimer.flush();
    } finally {
        MockQmlTimer.deferred = false;
    }
    Assert.equal(right.getActualFrameGeometry().x, rightBefore, { message: "back as it was" });
    Assert.equal(middle.getActualFrameGeometry().width, middleWidth, { message: "the column has its width again" });
});
