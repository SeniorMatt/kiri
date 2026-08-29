class MockQt {
    public readonly __brand = "Qt";

    public point(x: number, y: number) {
        return new MockQmlPoint(x, y);
    }

    public rect(x: number, y: number, width: number, height: number) {
        return new MockQmlRect(x, y, width, height);
    }

    public createQmlObject(qml: string, parent: QmlObject): QmlObject {
        if (qml.includes("Timer")) {
            return new MockQmlTimer();
        } else {
            throw new Error("Unexpected qml string: " + qml);
        }
    }

    public fireShortcut(shortcutName: string) {
        (kglobalaccel as MockKGlobalAccel).press(shortcutName);
    }
}
