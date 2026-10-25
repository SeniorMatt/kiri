// the journal says which desktop changes Kiri made and why, and which ones it did not make
function captureLog(f: () => void) {
    const lines: string[] = [];
    const realLog = console.log;
    console.log = (...args: any[]) => { lines.push(args.join(" ")); };
    try {
        f();
    } finally {
        console.log = realLog;
    }
    return lines.filter(line => line.indexOf("Kiri: desktop") === 0);
}

tests.register("Journal: every desktop change is logged with its cause", 1, () => {
    const config = getDefaultConfig();
    config.gestureDesktopSwitch = true;
    const { workspaceMock, world } = init(config);
    workspaceMock.createClients(1);
    Assert.assert(workspaceMock.desktops.length >= 2);

    let lines = captureLog(() => world.gestureSwitchDesktop(1));
    Assert.equalArrays(lines, ["Kiri: desktop 1 -> 2 (swipe)"]);

    lines = captureLog(() => { workspaceMock.currentDesktop = workspaceMock.desktops[0]; });
    Assert.equalArrays(lines, ["Kiri: desktop 2 -> 1 (KWin)"]);

    lines = captureLog(() => { workspaceMock.currentDesktop = workspaceMock.desktops[0]; });
    Assert.equalArrays(lines, ["Kiri: desktop 1 -> 1 (KWin, unchanged, of 2 desktops)"], { message: "a signal without a change is logged too: a switch undone inside the cascade" });
});
