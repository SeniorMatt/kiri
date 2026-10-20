// like niri, every workspace is laid out all the time: a window closed on another desktop leaves it arranged
tests.register("Other desktop stays laid out", 1, () => {
    const config = getDefaultConfig();
    const { workspaceMock } = init(config);
    const desktop1 = workspaceMock.desktops[1];

    workspaceMock.currentDesktop = desktop1;
    const [a, b, c] = workspaceMock.createClients(3);
    const widthB = b.frameGeometry.width;
    workspaceMock.currentDesktop = workspaceMock.desktops[0];

    const xBefore = c.frameGeometry.x;
    Assert.assert(xBefore > b.frameGeometry.x);
    workspaceMock.removeWindow(b);
    Assert.assert(c.frameGeometry.x < xBefore, { message: "c moved left to fill the gap while desktop 2 was not shown" });
    Assert.equal(Math.round(c.frameGeometry.x), Math.round(a.frameGeometry.x + a.frameGeometry.width + config.gapsInnerHorizontal));
    Assert.assert(widthB > 0);
});
