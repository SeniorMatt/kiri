declare const Qt: Qt;
declare const KWin: KWin;
declare const Workspace: Workspace;
declare const qmlBase: QmlObject;
declare const notificationInvalidTiledDesktops: Notification;
declare const notificationInvalidWindowRules: Notification;
declare const notificationInvalidPresetWidths: Notification;
declare const moveCursorToFocus: DBusCall;
declare const kglobalaccel: {
    onPressed: ((name: string) => void)|null;
    onRepeated: ((name: string) => void)|null;
    call(path: string, iface: string, member: string, types: string[], args: unknown[], resolve: (value: any) => void): void;
};
