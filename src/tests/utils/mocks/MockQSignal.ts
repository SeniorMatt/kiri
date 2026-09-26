class MockQSignal<T extends unknown[]> {
    public readonly __brand = "QSignal";

    private readonly handlers = new Set<(...args: [...T]) => void>();

    public connect(handler: (...args: [...T]) => void) {
        this.handlers.add(handler);
    };

    public disconnect(handler: (...args: [...T]) => void) {
        this.handlers.delete(handler);
    };

    public fire(...args: [...T]) {
        // like Qt: a handler that is connected while the signal is emitted is not called by this emission
        for (const handler of [...this.handlers]) {
            if (this.handlers.has(handler)) {
                handler(...args);
            }
        }
    }
}
