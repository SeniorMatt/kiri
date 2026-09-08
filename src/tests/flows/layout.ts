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
