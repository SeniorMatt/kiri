{
    tests.register("Key sequences", 1, () => {
        Assert.equal(parseKeySequence("Meta+D"), 0x10000000 | 0x44);
        Assert.equal(parseKeySequence("Meta+Shift+h"), 0x10000000 | 0x02000000 | 0x48);
        Assert.equal(parseKeySequence("Meta+Ctrl+PgDown"), 0x10000000 | 0x04000000 | 0x01000017);
        Assert.equal(parseKeySequence("Meta+F12"), 0x10000000 | 0x0100003b);
        Assert.equal(parseKeySequence("Meta+-"), 0x10000000 | 0x2d);
        Assert.equal(parseKeySequence("Meta++"), 0x10000000 | 0x2b);
        Assert.equal(parseKeySequence("Hyper+H"), undefined);
        Assert.equal(parseKeySequence("Meta+Nope"), undefined);
    });

    tests.register("Niri default keys", 1, () => {
        init(getDefaultConfig());
        const registered = (kglobalaccel as MockKGlobalAccel).registered;
        Assert.equalArrays(registered.get("focus-left")!, [parseKeySequence("Meta+H")!, parseKeySequence("Meta+Left")!]);
        Assert.equalArrays(registered.get("column-move-right")!, [parseKeySequence("Meta+Shift+L")!, parseKeySequence("Meta+Shift+Right")!]);
        Assert.equalArrays(registered.get("desktop-3")!, [parseKeySequence("Meta+3")!]);
        Assert.equalArrays(registered.get("column-move-to-desktop-9")!, [parseKeySequence("Meta+Ctrl+9")!]);
        Assert.equalArrays(registered.get("desktop-10")!, []);
        Assert.equalArrays(registered.get("column-move-to-column-1")!, []);
    });

    tests.register("Switch desktop", 1, () => {
        const { qtMock } = init(getDefaultConfig());
        qtMock.fireShortcut("desktop-2");
        Assert.equal(Workspace.currentDesktop, Workspace.desktops[1]);
        qtMock.fireShortcut("desktop-previous");
        Assert.equal(Workspace.currentDesktop, Workspace.desktops[0]);
        qtMock.fireShortcut("desktop-previous");
        Assert.equal(Workspace.currentDesktop, Workspace.desktops[0]);
    });
}
