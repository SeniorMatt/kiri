let Qt: Qt;
let KWin: KWin;
let Workspace: Workspace;
let qmlBase: QmlObject;
let notificationInvalidTiledDesktops: Notification;
let notificationInvalidWindowRules: Notification;
let notificationInvalidPresetWidths: Notification;
let moveCursorToFocus: DBusCall;
let kglobalaccel: MockKGlobalAccel;
// eslint-disable-next-line prefer-const -- assigned by the tests
let kwinSetup: ((accel: MockKGlobalAccel) => void)|null = null; // fills KWin's own actions before the key bindings register
let kglobalshortcutsrc: { value: (key: string, def: unknown) => any, sync: () => void } = { value: (key, def) => def, sync: () => {} };
let twinStore: { given: string, sync: () => void } = { given: "", sync: () => {} };

let screen: MockQmlRect;
let tilingArea: MockQmlRect;
let gapH: number;
let gapV: number;
let runLog: string[];

function init(config: Config, screenSize: { width: number, height: number } = { width: 800, height: 600 }) {
    screen = new MockQmlRect(0, 0, screenSize.width, screenSize.height);
    tilingArea = new MockQmlRect(
        config.gapsOuterLeft,
        config.gapsOuterTop,
        screen.width - config.gapsOuterLeft - config.gapsOuterRight,
        screen.height - config.gapsOuterTop - config.gapsOuterBottom,
    );
    gapH = config.gapsInnerHorizontal;
    gapV = config.gapsInnerVertical;
    runLog = [];

    setOverviewPolling(false); // a test that left the overview open must not change the next one
    const qtMock = new MockQt();
    const workspaceMock = new MockWorkspace();

    Qt = qtMock;
    Workspace = workspaceMock;
    kglobalaccel = new MockKGlobalAccel();
    twinStore = { given: "", sync: () => {} };
    kglobalshortcutsrc = { value: (key, def) => (kglobalaccel as MockKGlobalAccel).rc.get(key) ?? def, sync: () => {} };
    kwinSetup?.(kglobalaccel);
    moveCursorToFocus = {
        __brand: "QmlObject",
        call: () => {
            Assert.assert(Workspace.activeWindow !== null, { message: "moveCursorToFocus should never be called if there's no focused window" });
            const frame = (Workspace.activeWindow! as MockKwinClient).getActualFrameGeometry();
            workspaceMock.cursorPos.x = Math.floor(frame.x + frame.width/2);
            workspaceMock.cursorPos.y = Math.floor(frame.y + frame.height/2);
        },
    };

    const world = new World(config);
    return { qtMock, workspaceMock, world };
}

function getGridBounds(clientLeft: MockKwinClient, clientRight: MockKwinClient) {
    const columnsWidth = rectRight(clientRight.getActualFrameGeometry()) - clientLeft.getActualFrameGeometry().x;
    const left = tilingArea.x + Math.floor((tilingArea.width - columnsWidth) / 2);
    const right = left + columnsWidth;
    return { left, right };
}

function getWindowHeight(windowsInColumn: number) {
    const totalGaps = (windowsInColumn-1) * gapV;
    return Math.round((tilingArea.height - totalGaps) / windowsInColumn);
}

function getClientManager(world: World): ClientManager {
    // don't do this outside of tests
    let clientManager;
    world.do((cm, dm) => clientManager = cm);
    return clientManager!;
}

function activateRandomWindowOnDesktop(desktop: KwinDesktop) {
    const windows = Workspace.windows.filter(w => w.desktops.includes(desktop));
    if (windows.length > 0) {
        Workspace.activeWindow = randomItem(windows);
    }
}
