// Stardew Valley (SDL2 on X11) leaves full-screen mode by itself a moment after Kiri has moved its unfocused
// full-screen window out of the view, and asks for full-screen again a little later. Every new move started it over
// (a window that "teleports around"). The first escape is the sign: from then on the unfocused full-screen window
// stays on the screen, below the others, however the focus moves.
tests.register("Full-screen window that escapes being moved stays put while unfocused", 10, () => {
    const config = getDefaultConfig();
    config.tileFullScreen = true;
    const { qtMock, workspaceMock } = init(config);
    const [game, left, right] = workspaceMock.createClientsWithWidths(300, 300, 300);
    workspaceMock.activeWindow = game;
    game.fullScreen = true;
    let changes = 0;
    game.fullScreenChanged.connect(() => changes++);

    workspaceMock.activeWindow = left;
    Assert.assert(game.getActualFrameGeometry().x !== screen.x, { message: "the first time the window is scrolled out of the view" });
    game.fullScreen = false; // the game drops full-screen, because it was moved...
    game.fullScreen = true; // ... and wants it back a moment later
    Assert.equalRects(game.getActualFrameGeometry(), screen, { message: "full-screen again, Kiri leaves it on the screen" });
    const flips = changes;

    for (let i = 0; i < 4; i++) {
        qtMock.fireShortcut("focus-right");
        Assert.equalRects(game.getActualFrameGeometry(), screen, { message: "unfocused, not moved (round " + i + ")" });
        Assert.assert(game.fullScreen);
        qtMock.fireShortcut("focus-left");
        workspaceMock.activeWindow = right;
        workspaceMock.activeWindow = left;
    }
    Assert.equal(changes, flips, { message: "Kiri does not make the window change its state again" });

    workspaceMock.activeWindow = game;
    Assert.equalRects(game.getActualFrameGeometry(), screen, { message: "focused, it is full-screen in the layout" });
    Assert.equal(game.keepBelow, false);
    workspaceMock.activeWindow = left;
    Assert.assert(game.fullScreen);
    Assert.equal(game.keepBelow, true, { message: "unfocused, it is kept below the others" });
});

// A full-screen window that does not mind being moved still scrolls out of the view like niri's
tests.register("Full-screen window that stays full-screen is still scrolled out of the view", 10, () => {
    const config = getDefaultConfig();
    config.tileFullScreen = true;
    const { workspaceMock } = init(config);
    const [a, b] = workspaceMock.createClientsWithWidths(300, 300);
    workspaceMock.activeWindow = a;
    a.fullScreen = true;
    workspaceMock.activeWindow = b;
    Assert.assert(a.getActualFrameGeometry().x !== screen.x, { message: "moved away" });
    Assert.assert(a.fullScreen);
    workspaceMock.activeWindow = a;
    Assert.equalRects(a.getActualFrameGeometry(), screen);
    workspaceMock.activeWindow = b;
    Assert.assert(a.getActualFrameGeometry().x !== screen.x, { message: "moved away again" });
});
