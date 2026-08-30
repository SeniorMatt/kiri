// niri's center-focused-column "on-overflow": a newly focused column is centered
// only if it doesn't fit on the screen together with the previously focused column
class OnOverflowScroller {
    public scrollToColumn(desktop: Desktop, column: Column) {
        const previous = desktop.grid.getPreviousFocusedColumn();
        if (previous === null || previous === column) {
            desktop.scrollIntoView(column);
            return;
        }

        const left = Math.min(column.getLeft(), previous.getLeft());
        const right = Math.max(column.getRight(), previous.getRight());
        if (right - left <= desktop.tilingArea.width) {
            desktop.scrollIntoView(Range.create(left, right - left));
        } else {
            desktop.scrollCenterRange(column);
        }
    }
}
