// niri's center-focused-column "on-overflow" (scrolling.rs compute_new_view_offset_for_column): a newly focused column is
// centered only if it doesn't fit on the screen together with its neighbour on the side the focus came from
class OnOverflowScroller {
    public readonly alwaysScroll = true;

    public scrollToColumn(desktop: Desktop, column: Column, previous: Column|null) {
        const grid = desktop.grid;
        if (previous === null || previous === column) {
            desktop.scrollIntoView(column);
            return;
        }

        const columns = grid.getColumns();
        const index = columns.indexOf(column);
        const previousIndex = columns.indexOf(previous);
        if (index < 0 || previousIndex < 0) {
            desktop.scrollIntoView(column);
            return;
        }
        const source = columns[previousIndex > index ? Math.min(index + 1, columns.length - 1) : Math.max(index - 1, 0)];
        const left = Math.min(column.getLeft(), source.getLeft());
        const right = Math.max(column.getRight(), source.getRight());
        if (right - left <= desktop.getWorkingWidth() - 2 * grid.config.gapsInnerHorizontal) {
            desktop.scrollIntoView(column);
        } else {
            desktop.scrollCenterRange(column);
        }
    }
}
