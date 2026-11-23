tests.register("Focus and move windows", 1, () => {
    const config = getDefaultConfig();
    const { qtMock, workspaceMock, world } = init(config);

    const [client1, client2, client3] = workspaceMock.createClients(3);
    world.do((clientManager, desktopManager) => {
        Assert.assert(clientManager.hasClient(client1));
        Assert.assert(clientManager.hasClient(client2));
        Assert.assert(clientManager.hasClient(client3));
    });
    Assert.assert(workspaceMock.activeWindow === client3);

    function testLayout(shortcutName: string, grid: MockKwinClient[][]) {
        qtMock.fireShortcut(shortcutName);
        Assert.grid(config, tilingArea, 100, grid, true, [], { skip: 1 });
    }

    function testFocus(shortcutName: string, expectedFocus: KwinClient) {
        qtMock.fireShortcut(shortcutName);
        Assert.assert(workspaceMock.activeWindow === expectedFocus, {
            message: `wrong activeWindow: ${workspaceMock.activeWindow?.pid}`,
            skip: 1,
        });
    };

    testLayout("column-move-right",       [ [client1], [client2], [client3] ]);

    testLayout("window-move-left",        [ [client1],    [client2,client3] ]);
    testLayout("window-move-left",        [ [client1], [client3], [client2] ]);
    testLayout("window-move-left",        [ [client1,client3],    [client2] ]);
    testFocus("focus-right", client2);
    testLayout("window-move-left",        [    [client1,client3,client2]    ]);
    testLayout("window-move-left",        [ [client2],    [client1,client3] ]);
    testLayout("window-move-left",        [ [client2],    [client1,client3] ]);
    testFocus("focus-2", client3);
    testFocus("focus-up", client1);
    testLayout("column-move-left",        [ [client1,client3],    [client2] ]);
    testLayout("window-move-right",       [ [client3], [client1], [client2] ]);

    testFocus("focus-3", client2);
    testLayout("window-move-start",       [ [client2], [client3], [client1] ]);
    testLayout("window-move-to-column-3", [ [client3],    [client1,client2] ]);
    testLayout("column-move-left",        [ [client1,client2],    [client3] ]);
    testLayout("column-move-end",         [ [client3],    [client1,client2] ]);
    testLayout("column-move-to-column-1", [ [client1,client2],    [client3] ]);
    testLayout("column-move-right",       [ [client3],    [client1,client2] ]);

    testLayout("window-move-previous",    [ [client3],    [client2,client1] ]);
    testLayout("window-move-previous",    [ [client3], [client2], [client1] ]);
    testLayout("window-move-previous",    [ [client3,client2],    [client1] ]);
    testLayout("window-move-previous",    [ [client2,client3],    [client1] ]);
    testLayout("window-move-previous",    [ [client2], [client3], [client1] ]);
    testLayout("window-move-previous",    [ [client2], [client3], [client1] ]);
    testLayout("window-move-next",        [ [client2,client3],    [client1] ]);
    testLayout("window-move-next",        [ [client3,client2],    [client1] ]);
    testLayout("window-move-next",        [ [client3], [client2], [client1] ]);
    testLayout("window-move-next",        [ [client3],    [client2,client1] ]);
    testLayout("window-move-next",        [ [client3],    [client1,client2] ]);
    testLayout("window-move-next",        [ [client3], [client1], [client2] ]);
    testLayout("window-move-next",        [ [client3], [client1], [client2] ]);
    testLayout("window-move-left",        [ [client3],    [client1,client2] ]);

    testFocus("focus-1", client3);
    testLayout("window-consume-into-column", [ [client3,client1],    [client2] ]);
    testFocus("focus-down", client1);
    testLayout("window-expel-from-column",   [ [client3], [client1], [client2] ]);
    testLayout("window-expel-from-column",   [ [client3], [client1], [client2] ]);
    testFocus("focus-2", client1);
    testLayout("window-consume-into-column", [ [client3],    [client1,client2] ]);

    const col1Win1 = client3;
    const col2Win1 = client1;
    const col2Win2 = client2;

    testFocus("focus-up", col2Win1);
    testFocus("focus-up", col2Win1);
    testFocus("focus-down", col2Win2);
    testFocus("focus-left", col1Win1);
    testFocus("focus-left", col1Win1);
    testFocus("focus-right", col2Win2);
    testFocus("focus-right", col2Win2);

    testFocus("focus-2", col2Win2);
    testFocus("focus-1", col1Win1);
    testFocus("focus-2", col2Win2);
    testFocus("focus-start", col1Win1);
    testFocus("focus-end", col2Win2);

    testFocus("focus-up", col2Win1);
    testFocus("focus-left", col1Win1);
    testFocus("focus-right", col2Win1);
    testFocus("focus-2", col2Win1);
    testFocus("focus-1", col1Win1);
    testFocus("focus-2", col2Win1);
    testFocus("focus-start", col1Win1);
    testFocus("focus-end", col2Win1);

    testFocus("focus-down", col2Win2);
    testFocus("focus-start", col1Win1);
    testFocus("focus-next", col2Win1);
    testFocus("focus-next", col2Win2);
    testFocus("focus-next", col2Win2);
    testFocus("focus-previous", col2Win1);
    testFocus("focus-previous", col1Win1);
    testFocus("focus-previous", col1Win1);
});

{
    function setup(nClients = 3) {
        const config = getDefaultConfig();
        const { qtMock, workspaceMock } = init(config);
        const clients = workspaceMock.createClients(nClients);
        const fire = (name: string) => qtMock.fireShortcut(name);
        const layout = (grid: MockKwinClient[][]) => Assert.grid(config, tilingArea, 100, grid, true, [], { skip: 1 });
        const focus = (expected: KwinClient) => Assert.assert(workspaceMock.activeWindow === expected, {
            message: `wrong activeWindow: ${workspaceMock.activeWindow?.pid}`,
            skip: 1,
        });
        // name the windows after their initial columns, left to right
        const cols: MockKwinClient[] = [];
        for (let i = 1; i <= nClients; i++) {
            fire(`focus-${i}`);
            cols.push(workspaceMock.activeWindow as MockKwinClient);
        }
        return { qtMock, workspaceMock, cols, fire, layout, focus };
    }

    tests.register("niri consume-or-expel: lone window", 1, () => {
        const { cols: [a, b, c], fire, layout, focus } = setup();
        layout([[a], [b], [c]]);

        // nothing happens at the edges
        fire("focus-1");
        focus(a);
        fire("window-consume-or-expel-left");
        layout([[a], [b], [c]]);
        focus(a);
        fire("focus-3");
        fire("window-consume-or-expel-right");
        layout([[a], [b], [c]]);
        focus(c);

        // goes to the bottom of the neighbouring column and keeps focus
        fire("focus-2");
        fire("window-consume-or-expel-left");
        layout([[a, b], [c]]);
        focus(b);
        fire("window-consume-or-expel-left");
        layout([[b], [a], [c]]);
        focus(b);
        fire("window-consume-or-expel-right");
        layout([[a, b], [c]]);
        focus(b);
        fire("window-consume-or-expel-right");
        layout([[a], [b], [c]]);
        focus(b);

        // the target column may already hold several windows; the window joins at the bottom
        fire("window-consume-or-expel-right");
        fire("window-consume-or-expel-left");
        fire("focus-3");
        fire("window-consume-or-expel-left");
        layout([[a], [b, c]]);
        focus(c);
        fire("focus-1");
        fire("window-consume-or-expel-right");
        layout([[b, c, a]]);
        focus(a);
    });

    tests.register("niri consume-or-expel: window in a shared column", 1, () => {
        const { cols: [a, b, c], fire, layout, focus } = setup();
        fire("focus-3");
        fire("window-consume-or-expel-left");
        fire("focus-1");
        fire("window-consume-or-expel-right");
        layout([[b, c, a]]);
        focus(a);

        // the middle window leaves to the left as a new column, to the right it joins the bottom of the next column
        fire("focus-up");
        focus(c);
        fire("window-consume-or-expel-left");
        layout([[c], [b, a]]);
        focus(c);
        fire("window-consume-or-expel-right");
        layout([[b, a, c]]);
        focus(c);
        fire("window-consume-or-expel-right");
        layout([[b, a], [c]]);
        focus(c);

        // the top window of the first column leaves to the left, even though there is no column there
        fire("focus-left");
        fire("focus-up");
        fire("focus-up");
        focus(b);
        fire("window-consume-or-expel-left");
        layout([[b], [a], [c]]);
        focus(b);

        // the bottom window leaves to the right
        fire("window-consume-or-expel-right");
        layout([[a, b], [c]]);
        fire("window-consume-or-expel-right");
        layout([[a], [b], [c]]);
        focus(b);
    });

    tests.register("niri consume-window-into-column", 1, () => {
        const { cols: [a, b, c], fire, layout, focus } = setup();
        fire("focus-3");
        fire("window-consume-into-column");
        layout([[a], [b], [c]]);
        fire("focus-1");
        fire("window-consume-into-column");
        layout([[a, b], [c]]);
        focus(a);
        fire("focus-down");
        focus(b);
        fire("window-consume-into-column");
        layout([[a, b, c]]);
        focus(b);
        fire("window-consume-into-column");
        layout([[a, b, c]]);

        // only the first window of the next column is taken
        fire("focus-up");
        fire("focus-up");
        focus(a);
        fire("window-consume-or-expel-left");
        layout([[a], [b, c]]);
        fire("window-consume-into-column");
        layout([[a, b], [c]]);
        focus(a);
    });

    tests.register("niri expel-window-from-column", 1, () => {
        const { cols: [a, b, c], fire, layout, focus } = setup();
        fire("window-expel-from-column");
        layout([[a], [b], [c]]);
        fire("focus-1");
        fire("window-consume-into-column");
        fire("window-consume-into-column");
        layout([[a, b, c]]);

        // the bottom window is expelled, the focus stays on the focused window
        focus(a);
        fire("window-expel-from-column");
        layout([[a, b], [c]]);
        focus(a);

        // when the bottom window is focused, the focus moves up
        fire("focus-down");
        focus(b);
        fire("window-expel-from-column");
        layout([[a], [b], [c]]);
        focus(a);

        // the expelled window goes right next to the column, not to the end
        fire("window-consume-into-column");
        fire("focus-up");
        fire("window-expel-from-column");
        layout([[a], [b], [c]]);
    });

    tests.register("niri expel and consume-or-expel keep the column width", 1, () => {
        const config = getDefaultConfig();
        const { qtMock, workspaceMock } = init(config);
        workspaceMock.createClientsWithWidths(300, 100);
        qtMock.fireShortcut("focus-1");
        const first = workspaceMock.activeWindow as MockKwinClient;
        qtMock.fireShortcut("focus-2");
        const second = workspaceMock.activeWindow as MockKwinClient;
        const w1 = first.getActualFrameGeometry().width;
        const w2 = second.getActualFrameGeometry().width;
        Assert.assert(w1 !== w2);
        const [widerWin, narrowWin] = w1 > w2 ? [first, second] : [second, first];

        // narrow joins the wide column
        qtMock.fireShortcut(narrowWin === second ? "window-consume-or-expel-left" : "window-consume-or-expel-right");
        Assert.equal(narrowWin.getActualFrameGeometry().width, widerWin.getActualFrameGeometry().width);
        const width = widerWin.getActualFrameGeometry().width;

        // and leaves it as a column of the same width
        qtMock.fireShortcut("window-consume-or-expel-right");
        Assert.equal(narrowWin.getActualFrameGeometry().width, width);
        qtMock.fireShortcut("window-consume-or-expel-left");
        qtMock.fireShortcut("window-expel-from-column");
        qtMock.fireShortcut("focus-2");
        Assert.equal((workspaceMock.activeWindow as MockKwinClient).getActualFrameGeometry().width, width);
    });
}

tests.register("The strip keeps its output when the active screen changes briefly (wake)", 1, () => {
    const { workspaceMock } = init(getDefaultConfig());
    workspaceMock.setOutputs(["DP-1", screen], ["HDMI-1", new MockQmlRect(800, 0, 800, 600)]);
    const [client] = workspaceMock.createClientsWithWidths(300);
    const x = () => client.getActualFrameGeometry().x;
    Assert.assert(x() < 800, { message: "the window is on the first output" });

    workspaceMock.activeScreen = workspaceMock.screens[1]; // wrong for a moment on wake
    workspaceMock.screensChanged.fire();
    Assert.assert(x() < 800, { message: "the strip must stay on its output" });

    workspaceMock.removeOutput("DP-1"); // its output is gone, KWin moves the window
    const frame = client.getFrameGeometryCopy();
    client.frameGeometry = new MockQmlRect(frame.x + 800, frame.y, frame.width, frame.height);
    workspaceMock.screensChanged.fire();
    Assert.assert(x() >= 800, { message: "the strip goes to the other output" });

    workspaceMock.addOutput("DP-1", screen); // and comes back
    workspaceMock.screensChanged.fire();
    Assert.assert(x() < 800, { message: "the strip returns to its output" });
});
