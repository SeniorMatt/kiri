// Toggling full-screen mode: a layout pass between the frame and the flag must not hand the client another size
{
    function distinct(rects: MockQmlRect[]) {
        const result: MockQmlRect[] = [];
        for (const rect of rects) {
            if (!result.some(other => rectEquals(other, rect))) {
                result.push(rect);
            }
        }
        return result;
    }

    // the timers fire after KWin has set the flag too, as they do in KWin
    function toggle(qtMock: MockQt) {
        MockQmlTimer.deferred = true;
        try {
            qtMock.fireShortcut("window-toggle-fullscreen");
            MockQmlTimer.flush();
        } finally {
            MockQmlTimer.deferred = false;
        }
    }

    let round = 0;

    function setup() {
        const config = getDefaultConfig();
        config.tileFullScreen = true;
        config.hideTitlebars = round++ % 2 === 0;
        const { qtMock, workspaceMock } = init(config);
        const clients = workspaceMock.createClientsWithWidths(300, 300, 300);
        clients.forEach(client => client.frameFirst = true);
        workspaceMock.activeWindow = clients[1];
        return { qtMock, workspaceMock, clients };
    }

    tests.register("Leaving full-screen gives back the exact place and width of the column", 20, () => {
        const { qtMock, workspaceMock, clients } = setup();
        const [left, middle, right] = clients;
        qtMock.fireShortcut("cycle-preset-widths");
        const places = clients.map(client => client.getActualFrameGeometry().clone());

        toggle(qtMock);
        Assert.assert(middle.fullScreen);
        Assert.equalRects(middle.getActualFrameGeometry(), screen);
        toggle(qtMock);
        Assert.assert(!middle.fullScreen);
        clients.forEach((client, i) => Assert.equalRects(client.getActualFrameGeometry(), places[i], { message: "window " + i + " is back" }));

        // the same after the width changed in between, and twice in a row
        qtMock.fireShortcut("cycle-preset-widths");
        const later = clients.map(client => client.getActualFrameGeometry().clone());
        for (let i = 0; i < 2; i++) {
            toggle(qtMock);
            toggle(qtMock);
            clients.forEach((client, j) => Assert.equalRects(client.getActualFrameGeometry(), later[j], { message: "window " + j + " is back (round " + i + ")" }));
        }
        Assert.assert(workspaceMock.activeWindow === middle && left !== right);
    });

    tests.register("A full-screen toggle gives the client a single size", 20, () => {
        const { qtMock, clients } = setup();
        const middle = clients[1];
        qtMock.fireShortcut("cycle-preset-widths");
        const slot = middle.getActualFrameGeometry().clone();

        middle.assignedGeometries = [];
        toggle(qtMock);
        let targets = distinct(middle.assignedGeometries);
        Assert.assert(targets.length <= 1, { message: "entering asks for " + targets.length + " different geometries" });
        if (targets.length === 1) {
            Assert.equalRects(targets[0], screen);
        }

        middle.assignedGeometries = [];
        toggle(qtMock);
        targets = distinct(middle.assignedGeometries);
        Assert.assert(targets.length <= 1, { message: "leaving asks for " + targets.length + " different geometries" });
        if (targets.length === 1) {
            Assert.equalRects(targets[0], slot);
        }
    });

    tests.register("A width preset gives the client a single size", 20, () => {
        const { qtMock, clients } = setup();
        const middle = clients[1];
        for (let i = 0; i < 3; i++) {
            const before = middle.getActualFrameGeometry().width;
            middle.assignedGeometries = [];
            qtMock.fireShortcut("cycle-preset-widths");
            const targets = distinct(middle.assignedGeometries);
            Assert.assert(targets.length === 1, { message: "a preset asks for " + targets.length + " different geometries" });
            Assert.equal(targets[0].width, middle.getActualFrameGeometry().width);
            Assert.assert(targets[0].width !== before);
        }
    });

    tests.register("A slow client is not asked for the old size on its way to full-screen", 20, () => {
        const { qtMock, clients } = setup();
        const middle = clients[1];
        middle.slowClient = true;
        toggle(qtMock);
        for (const requested of middle.requestedGeometries) {
            Assert.equalRects(requested, screen, { message: "only the full-screen size is waiting for the commit" });
        }
        middle.commitRequestedGeometry();
        Assert.equalRects(middle.getActualFrameGeometry(), screen);
    });
}
