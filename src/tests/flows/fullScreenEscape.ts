// Stardew Valley (SDL2 on X11) leaves full-screen mode by itself when the top-left corner of its window is moved out of
// the screen, asks for full-screen again a moment later, and every move of the strip starts it over (it "teleports
// around"). An X11 client must never see that: Kiri keeps the window of a full-screen X11 client in the bottom-right
// corner of the screen, where its corner is still on the screen, and tells the compiled effect where to paint it.
{
    function topLeftOnScreen(window: MockKwinClient) {
        const frame = window.getRealFrameGeometry();
        return frame.x >= screen.x && frame.x < screen.x + screen.width && frame.y >= screen.y && frame.y < screen.y + screen.height;
    }

    tests.register("Full-screen X11 window is painted in its column but its real place stays on the screen", 10, () => {
        const config = getDefaultConfig();
        config.tileFullScreen = true;
        const { qtMock, workspaceMock } = init(config);
        const [game, left, right] = workspaceMock.createClientsWithWidths(300, 300, 300);
        const id = String(game.internalId);
        workspaceMock.activeWindow = game;
        game.fullScreen = true;
        let changes = 0;
        game.fullScreenChanged.connect(() => changes++);
        Assert.equalRects(game.getActualFrameGeometry(), screen);
        Assert.equal(parkedPositions.get(id), undefined, { message: "focused and in view: a normal window" });

        for (let i = 0; i < 3; i++) {
            runOneOf(
                () => { workspaceMock.activeWindow = left; },
                () => { qtMock.fireShortcut("focus-right"); },
                () => { workspaceMock.activeWindow = right; },
            );
            Assert.assert(game.fullScreen, { message: "stays full-screen in its column" });
            Assert.assert(topLeftOnScreen(game), { message: "the corner of the window is on the screen (round " + i + ")" });
            Assert.rect(game.getRealFrameGeometry(), screen.width - 1, screen.height - 1, screen.width, screen.height);
            const painted = parkedPositions.get(id);
            Assert.assert(painted !== undefined && painted[0] < screen.x, { message: "painted left of the screen, in its column" });
            Assert.equal(painted![1], screen.y);

            workspaceMock.activeWindow = game;
            Assert.equalRects(game.getActualFrameGeometry(), screen);
            Assert.equal(parkedPositions.get(id), undefined, { message: "focused again: back at the origin, painted as is" });
        }
        Assert.equal(changes, 0, { message: "the window never had a reason to change its state" });

        workspaceMock.activeWindow = left;
        Assert.assert(parkedPositions.get(id) !== undefined);
        workspaceMock.activeWindow = game;
        qtMock.fireShortcut("window-toggle-floating");
        Assert.equal(parkedPositions.get(id), undefined, { message: "a floating window is not painted anywhere else" });
        Assert.assert(topLeftOnScreen(game));
    });
}
