class MockQmlTimer {
    public readonly __brand = "QmlObject";

    public interval = 0;
    public readonly triggered = new MockQSignal<[]>();

    // tests can hold timers back (to look at the state before they fire) and fire them later with `flush`
    public static deferred = false;
    // timers with one of these intervals are held back too, while `deferred` is off
    public static readonly deferIntervals = new Set<number>();
    private static pending = new Set<MockQmlTimer>();

    public static flush() {
        const timers = [...MockQmlTimer.pending];
        MockQmlTimer.pending.clear();
        for (const timer of timers) {
            timer.triggered.fire();
        }
    }

    public repeat = false;

    public start() {}

    public stop() {
        MockQmlTimer.pending.delete(this);
    }

    public restart() {
        if (MockQmlTimer.deferred || MockQmlTimer.deferIntervals.has(this.interval)) {
            MockQmlTimer.pending.add(this);
            return;
        }
        // no need to wait in tests, just fire immediately
        this.triggered.fire();
    };

    public destroy() {
        MockQmlTimer.pending.delete(this);
    }
}
