class ContextualResizer {
    constructor(
        private readonly presetWidths: { getWidths: (minWidth: number, maxWidth: number, tilingAreaWidth: number) => number[] },
    ) {}

    public increaseWidth(column: Column) {
        const grid = column.grid;
        const desktop = grid.desktop;
        const visibleRange = desktop.getCurrentVisibleRange();
        const minWidth = column.getMinWidth();
        const maxWidth = column.getMaxWidth();
        if(!Range.contains(visibleRange, column) || column.getWidth() >= maxWidth) {
            return;
        }

        const leftVisibleColumn = grid.getLeftmostVisibleColumn(visibleRange);
        const rightVisibleColumn = grid.getRightmostVisibleColumn(visibleRange);
        if (leftVisibleColumn === null || rightVisibleColumn === null) {
            console.assert(false); // should at least see self
            return;
        }

        const leftSpace = leftVisibleColumn.getLeft() - visibleRange.getLeft();
        const rightSpace = visibleRange.getRight() - rightVisibleColumn.getRight();

        const presets = this.presetWidths.getWidths(minWidth, maxWidth, desktop.tilingArea.width);
        const nominalWidth = column.getNominalWidth();
        const newWidth = findMinPositive(
            [
                column.getWidth() + leftSpace + rightSpace,
                column.getWidth() + leftSpace + rightSpace + leftVisibleColumn.getWidth() + grid.config.gapsInnerHorizontal,
                column.getWidth() + leftSpace + rightSpace + rightVisibleColumn.getWidth() + grid.config.gapsInnerHorizontal,
                ...presets,
            ],
            // presets are compared with the width that was asked for and with niri's 1 px allowance, the client may have rounded it down
            width => presets.includes(width) ? width - nominalWidth - 1 : width - column.getWidth(),
        );
        if (newWidth === undefined) {
            return;
        }

        column.setWidth(newWidth, true);
        column.setPresetIndex(presets.indexOf(newWidth), presets);
        desktop.scrollCenterVisible(column);
    }

    public decreaseWidth(column: Column) {
        const grid = column.grid;
        const desktop = grid.desktop;
        const visibleRange = desktop.getCurrentVisibleRange();
        const minWidth = column.getMinWidth();
        const maxWidth = column.getMaxWidth();
        if(!Range.contains(visibleRange, column) || column.getWidth() <= minWidth) {
            return;
        }

        const leftVisibleColumn = grid.getLeftmostVisibleColumn(visibleRange);
        const rightVisibleColumn = grid.getRightmostVisibleColumn(visibleRange);
        if (leftVisibleColumn === null || rightVisibleColumn === null) {
            console.assert(false); // should at least see self
            return;
        }

        let leftOffScreenColumn = grid.getLeftColumn(leftVisibleColumn);
        if (leftOffScreenColumn === column) {
            leftOffScreenColumn = null;
        }
        let rightOffScreenColumn = grid.getRightColumn(rightVisibleColumn);
        if (rightOffScreenColumn === column) {
            rightOffScreenColumn = null;
        }

        const visibleColumnsWidth = rightVisibleColumn.getRight() - leftVisibleColumn.getLeft();
        const unusedWidth = visibleRange.getWidth() - visibleColumnsWidth;
        const leftOffScreen = leftOffScreenColumn === null ? 0 : leftOffScreenColumn.getWidth() + grid.config.gapsInnerHorizontal - unusedWidth;
        const rightOffScreen = rightOffScreenColumn === null ? 0 : rightOffScreenColumn.getWidth() + grid.config.gapsInnerHorizontal - unusedWidth;

        const presets = this.presetWidths.getWidths(minWidth, maxWidth, desktop.tilingArea.width);
        const nominalWidth = column.getNominalWidth();
        const newWidth = findMinPositive(
            [
                column.getWidth() - leftOffScreen,
                column.getWidth() - rightOffScreen,
                ...presets,
            ],
            width => presets.includes(width) ? nominalWidth - width - 1 : column.getWidth() - width,
        );
        if (newWidth === undefined) {
            return;
        }

        column.setWidth(newWidth, true);
        column.setPresetIndex(presets.indexOf(newWidth), presets);
        desktop.scrollCenterVisible(column);
    }

    public maximizeWidth(column: Column) {
        const grid = column.grid;
        const desktop = grid.desktop;
        const presetWidths = this.presetWidths.getWidths(column.getMinWidth(), column.getMaxWidth(), desktop.tilingArea.width);
        if (presetWidths.length === 0) {
            return;
        }
        const maxWidth = presetWidths[presetWidths.length-1];
        column.setWidth(maxWidth, true);
        desktop.scrollCenterVisible(column);
    }

    public minimizeWidth(column: Column) {
        const grid = column.grid;
        const desktop = grid.desktop;
        const presetWidths = this.presetWidths.getWidths(column.getMinWidth(), column.getMaxWidth(), desktop.tilingArea.width);
        if (presetWidths.length === 0) {
            return;
        }
        const minWidth = presetWidths[0];
        column.setWidth(minWidth, true);
        desktop.scrollCenterVisible(column);
    }
}
