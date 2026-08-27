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

    testLayout("kniri-column-move-right",       [ [client1], [client2], [client3] ]);

    testLayout("kniri-window-move-left",        [ [client1],    [client2,client3] ]);
    testLayout("kniri-window-move-left",        [ [client1], [client3], [client2] ]);
    testLayout("kniri-window-move-left",        [ [client1,client3],    [client2] ]);
    testFocus("kniri-focus-right", client2);
    testLayout("kniri-window-move-left",        [    [client1,client3,client2]    ]);
    testLayout("kniri-window-move-left",        [ [client2],    [client1,client3] ]);
    testLayout("kniri-window-move-left",        [ [client2],    [client1,client3] ]);
    testFocus("kniri-focus-2", client3);
    testFocus("kniri-focus-up", client1);
    testLayout("kniri-column-move-left",        [ [client1,client3],    [client2] ]);
    testLayout("kniri-window-move-right",       [ [client3], [client1], [client2] ]);

    testFocus("kniri-focus-3", client2);
    testLayout("kniri-window-move-start",       [ [client2], [client3], [client1] ]);
    testLayout("kniri-window-move-to-column-3", [ [client3],    [client1,client2] ]);
    testLayout("kniri-column-move-left",        [ [client1,client2],    [client3] ]);
    testLayout("kniri-column-move-end",         [ [client3],    [client1,client2] ]);
    testLayout("kniri-column-move-to-column-1", [ [client1,client2],    [client3] ]);
    testLayout("kniri-column-move-right",       [ [client3],    [client1,client2] ]);

    testLayout("kniri-window-move-previous",    [ [client3],    [client2,client1] ]);
    testLayout("kniri-window-move-previous",    [ [client3], [client2], [client1] ]);
    testLayout("kniri-window-move-previous",    [ [client3,client2],    [client1] ]);
    testLayout("kniri-window-move-previous",    [ [client2,client3],    [client1] ]);
    testLayout("kniri-window-move-previous",    [ [client2], [client3], [client1] ]);
    testLayout("kniri-window-move-previous",    [ [client2], [client3], [client1] ]);
    testLayout("kniri-window-move-next",        [ [client2,client3],    [client1] ]);
    testLayout("kniri-window-move-next",        [ [client3,client2],    [client1] ]);
    testLayout("kniri-window-move-next",        [ [client3], [client2], [client1] ]);
    testLayout("kniri-window-move-next",        [ [client3],    [client2,client1] ]);
    testLayout("kniri-window-move-next",        [ [client3],    [client1,client2] ]);
    testLayout("kniri-window-move-next",        [ [client3], [client1], [client2] ]);
    testLayout("kniri-window-move-next",        [ [client3], [client1], [client2] ]);
    testLayout("kniri-window-move-left",        [ [client3],    [client1,client2] ]);

    const col1Win1 = client3;
    const col2Win1 = client1;
    const col2Win2 = client2;

    testFocus("kniri-focus-up", col2Win1);
    testFocus("kniri-focus-up", col2Win1);
    testFocus("kniri-focus-down", col2Win2);
    testFocus("kniri-focus-left", col1Win1);
    testFocus("kniri-focus-left", col1Win1);
    testFocus("kniri-focus-right", col2Win2);
    testFocus("kniri-focus-right", col2Win2);

    testFocus("kniri-focus-2", col2Win2);
    testFocus("kniri-focus-1", col1Win1);
    testFocus("kniri-focus-2", col2Win2);
    testFocus("kniri-focus-start", col1Win1);
    testFocus("kniri-focus-end", col2Win2);

    testFocus("kniri-focus-up", col2Win1);
    testFocus("kniri-focus-left", col1Win1);
    testFocus("kniri-focus-right", col2Win1);
    testFocus("kniri-focus-2", col2Win1);
    testFocus("kniri-focus-1", col1Win1);
    testFocus("kniri-focus-2", col2Win1);
    testFocus("kniri-focus-start", col1Win1);
    testFocus("kniri-focus-end", col2Win1);

    testFocus("kniri-focus-down", col2Win2);
    testFocus("kniri-focus-start", col1Win1);
    testFocus("kniri-focus-next", col2Win1);
    testFocus("kniri-focus-next", col2Win2);
    testFocus("kniri-focus-next", col2Win2);
    testFocus("kniri-focus-previous", col2Win1);
    testFocus("kniri-focus-previous", col1Win1);
    testFocus("kniri-focus-previous", col1Win1);
});
