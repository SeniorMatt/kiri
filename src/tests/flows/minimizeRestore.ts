tests.register("A restored minimized window returns to its old column", 2, () => {
    const { workspaceMock } = init(getDefaultConfig());
    const [a, b, c] = workspaceMock.createClients(3);
    function order() {
        return [a, b, c].map(client => client.getActualFrameGeometry().x).every((x, i, xs) => i === 0 || xs[i - 1] < x);
    }
    Assert.assert(order());

    for (const client of [b, a, c]) {
        client.minimized = true;
        client.minimized = false;
        Assert.assert(order(), { message: "the window should be back between its neighbours" });
    }
});
