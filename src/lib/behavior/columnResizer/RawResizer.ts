class RawResizer {
    constructor(
        private readonly presetWidths: { getWidths: (minWidth: number, maxWidth: number, tilingAreaWidth: number) => number[] },
    ) {}

    public increaseWidth(column: Column) {
        const widths = this.presetWidths.getWidths(column.getMinWidth(), column.getMaxWidth(), column.grid.desktop.tilingArea.width);
        const current = column.getNominalWidth();
        const newWidth = findMinPositive(widths, width => width - current - 1); // 1 px allowance, like niri
        if (newWidth === undefined) {
            return;
        }
        column.setWidth(newWidth, true);
        column.setPresetIndex(widths.indexOf(newWidth), widths);
    }

    public decreaseWidth(column: Column) {
        const widths = this.presetWidths.getWidths(column.getMinWidth(), column.getMaxWidth(), column.grid.desktop.tilingArea.width);
        const current = column.getNominalWidth();
        const newWidth = findMinPositive(widths, width => current - width - 1);
        if (newWidth === undefined) {
            return;
        }
        column.setWidth(newWidth, true);
        column.setPresetIndex(widths.indexOf(newWidth), widths);
    }

    public maximizeWidth(column: Column) {
        const presetWidths = this.presetWidths.getWidths(column.getMinWidth(), column.getMaxWidth(), column.grid.desktop.tilingArea.width);
        const maxWidth = presetWidths[presetWidths.length-1];
        column.setWidth(maxWidth, true);
    }

    public minimizeWidth(column: Column) {
        const presetWidths = this.presetWidths.getWidths(column.getMinWidth(), column.getMaxWidth(), column.grid.desktop.tilingArea.width);
        const minWidth = presetWidths[0];
        column.setWidth(minWidth, true);
    }
}
