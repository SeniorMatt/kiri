interface KWin {
    __brand: "KWin";

    readConfig(key: string, defaultValue: any): any;
}

interface Workspace {
    __brand: "Workspace";

    readonly activities: string[];
    readonly desktops: KwinDesktop[];
    currentDesktop: KwinDesktop;
    readonly currentActivity: string;
    readonly activeScreen: Output;
    readonly screens: Output[];
    readonly windows: KwinClient[];
    readonly cursorPos: Readonly<QmlPoint>;
    readonly stackingOrder: KwinClient[];
    readonly cursorPosChanged: QSignal<[]>;

    activeWindow: KwinClient|null;

    readonly currentDesktopChanged: QSignal<[]>;
    readonly windowAdded: QSignal<[KwinClient]>;
    readonly windowRemoved: QSignal<[KwinClient]>;
    readonly windowActivated: QSignal<[KwinClient|null]>;
    readonly screensChanged: QSignal<[]>;
    readonly activitiesChanged: QSignal<[]>;
    readonly desktopsChanged: QSignal<[]>;
    readonly currentActivityChanged: QSignal<[]>;
    readonly virtualScreenSizeChanged: QSignal<[]>;

    clientArea(option: ClientAreaOption, output: Output, kwinDesktop: KwinDesktop): QmlRect;
    raiseWindow(kwinClient: KwinClient): void;
    createDesktop(position: number, name: string): void;
    removeDesktop(desktop: KwinDesktop): void;
}

const enum ClientAreaOption {
    PlacementArea,
    MovementArea,
    MaximizeArea,
    MaximizeFullArea,
    FullScreenArea,
    WorkArea,
    FullArea,
    ScreenArea,
}

const enum MaximizedMode {
    Unmaximized,
    Vertically,
    Horizontally,
    Maximized,
}

interface Tile { __brand: "Tile" }
interface Output { __brand: "Output", readonly name: string }

interface KwinClient {
    __brand: "KwinClient";

    readonly internalId: unknown;
    readonly caption: string;
    readonly minSize: Readonly<QmlSize>;
    readonly maxSize: Readonly<QmlSize>;
    readonly transient: boolean;
    readonly transientFor: KwinClient | null;
    readonly clientGeometry: Readonly<QmlRect>;
    readonly move: boolean;
    readonly resize: boolean;
    readonly moveable: boolean;
    readonly resizeable: boolean;
    readonly fullScreenable: boolean;
    closeWindow(): void;
    readonly maximizable: boolean;
    readonly output: Output;
    readonly resourceClass: string;
    readonly resourceName: string;
    readonly dock: boolean;
    readonly normalWindow: boolean;
    readonly desktopWindow: boolean;
    readonly managed: boolean;
    readonly popupWindow: boolean;
    readonly appletPopup: boolean;
    readonly dialog: boolean;
    readonly modal: boolean;
    readonly pid: number;

    fullScreen: boolean;
    readonly demandsAttention: boolean;
    activities: string[]; // empty array means all activities
    skipSwitcher: boolean;
    noBorder: boolean; // no title bar and frame (server-side decorations); KWin ignores changes while full-screen
    keepAbove: boolean;
    keepBelow: boolean;
    minimized: boolean;
    frameGeometry: QmlRect;
    desktops: KwinDesktop[]; // empty array means all desktops
    tile: Tile|null;
    opacity: number;

    readonly fullScreenChanged: QSignal<[]>;
    readonly demandsAttentionChanged: QSignal<[]>;
    readonly desktopsChanged: QSignal<[]>;
    readonly activitiesChanged: QSignal<[]>;
    readonly minimizedChanged: QSignal<[]>;
    readonly maximizedAboutToChange: QSignal<[MaximizedMode]>;
    readonly captionChanged: QSignal<[]>;
    readonly tileChanged: QSignal<[]>;
    readonly interactiveMoveResizeStarted: QSignal<[]>;
    readonly interactiveMoveResizeStepped: QSignal<[geometry: QmlRect]>; // the geometry the pointer asks for, before the client has committed it
    readonly interactiveMoveResizeFinished: QSignal<[]>;
    readonly frameGeometryChanged: QSignal<[oldGeometry: QmlRect]>;

    setMaximize(vertically: boolean, horizontally: boolean): void;
}

interface KwinDesktop {
    __brand: "KwinDesktop";

    readonly id: string;
    readonly name: string;
}

interface ShortcutHandler extends QmlObject {
    readonly activated: QSignal<[]>;
    destroy(): void;
}
