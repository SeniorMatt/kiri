class EdgeClamper {
    // when the whole grid fits on the screen it is centered (Karousel's behavior), or aligned to the left like niri does
    constructor(private readonly centerWhenFits = true) {}

    public clampScrollX(desktop: Desktop, x: number) {
        const minScroll = 0;
        const maxScroll = desktop.grid.getWidth() - desktop.tilingArea.width;
        if (maxScroll < 0) {
            return this.centerWhenFits ? Math.round(maxScroll / 2) : 0;
        }
        return clamp(x, minScroll, maxScroll);
    }
}
