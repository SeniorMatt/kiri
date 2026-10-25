class Delayer {
    private readonly timer: QmlTimer | null;

    constructor(delay: number, f: () => void) {
        this.timer = initQmlTimer();
        if (this.timer !== null) {
            this.timer.interval = delay;
            this.timer.triggered.connect(f);
        }
    }

    public run() {
        this.timer?.restart();
    }

    public stop() {
        this.timer?.stop();
    }

    public destroy() {
        try {
            this.timer?.destroy();
        } catch (e) {
            // the QML parent is already gone while the script unloads
        }
    }
}

function initQmlTimer() {
    try {
        const timer = Qt.createQmlObject(
            `import QtQuick 6.0
            Timer {}`,
            qmlBase,
        ) as QmlTimer;
        return typeof timer?.restart === "function" ? timer : null;
    } catch (e) {
        return null; // no QML parent: the script is being unloaded
    }
}
