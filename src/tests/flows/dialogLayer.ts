// issue 47: dialogs, popups and the other windows that are not tiled must not be pushed behind the tiled windows
tests.register("Dialogs of tiled windows are never put in the layer below", 5, () => {
    const config = getDefaultConfig();
    config.tiledKeepBelow = true;
    config.floatingKeepAbove = false;
    const { qtMock, workspaceMock } = init(config);
    const [parent, other] = workspaceMock.createClientsWithWidths(300, 300);
    const dialog = new MockKwinClient(new MockQmlRect(100, 100, 200, 150), parent);
    workspaceMock.createWindows(dialog);

    const check = (message: string) => {
        Assert.assert(!dialog.keepBelow, { message: message + ": the dialog is not kept below" });
        Assert.assert(parent.keepBelow && other.keepBelow, { message: message + ": tiled windows are" });
    };
    check("opened");
    for (const action of ["focus-left", "focus-right", "cycle-preset-widths", "column-move-left"]) {
        workspaceMock.activeWindow = parent;
        qtMock.fireShortcut(action);
        check(action);
    }
    // the dialog is closed and a new one opens
    workspaceMock.removeWindow(dialog);
    const second = new MockKwinClient(new MockQmlRect(100, 100, 200, 150), other);
    workspaceMock.createWindows(second);
    Assert.assert(!second.keepBelow, { message: "the second dialog is not kept below" });
});
