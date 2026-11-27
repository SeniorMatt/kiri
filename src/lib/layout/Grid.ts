class Grid {
    public readonly desktop: Desktop;
    public readonly focusPasser: FocusPassing.Passer;
    private readonly columns: LinkedList<Column>;
    private lastFocusedColumn: Column|null;
    private previousFocusedColumn: Column|null;
    // niri's activate_prev_column_on_removal
    private opened: { column: Column, previous: Column, scrollX: number } | null = null;
    private returnTo: { column: Column, scrollX: number } | null = null;
    // niri's view_offset_to_restore: kept while the active column is full-screen or maximized, dropped when the column
    // changes or moves
    private viewRestore: { column: Column, offset: number } | null = null;
    private focusMemo: { from: Column, scrollX: number, time: number } | null = null;
    private width: number;
    private userResized = false;
    private userResize: boolean; // is any part of the grid being resized by the user
    private readonly userResizeFinishedDelayer: Delayer;

    public get config(): LayoutConfig {
        return this.desktop.profile.layout;
    }

    constructor(desktop: Desktop, focusPasser: FocusPassing.Passer) {
        this.desktop = desktop;
        this.focusPasser = focusPasser;
        this.columns = new LinkedList();
        this.lastFocusedColumn = null;
        this.previousFocusedColumn = null;
        this.width = 0;
        this.userResize = false;
        this.userResizeFinishedDelayer = new Delayer(50, () => {
            // this delay prevents windows' contents from freezing after resizing
            this.desktop.onLayoutChanged();
            const focused = this.getLastFocusedColumn();
            const resized = this.userResized;
            this.userResized = false;
            if (focused !== null && resized) {
                this.desktop.recenterWhileResizing(focused, true);
                // niri's interactive_resize_end: the view moves only to bring the column into view
                if (!Range.contains(this.desktop.getCurrentVisibleRange(), focused)) {
                    this.desktop.autoAdjustScroll();
                }
            } else {
                this.desktop.autoAdjustScroll();
            }
            this.desktop.arrange();
        });
    }

    private getNaturalLeft(column: Column) {
        const left = this.columns.getPrev(column);
        return left === null ? 0 : left.getRight() + left.getOverflow()[1] + this.config.gapsInnerHorizontal;
    }

    public onColumnSizingLeftNormal(column: Column, scrollX: number) {
        if (column === this.getLastFocusedColumn()) {
            this.viewRestore = { column: column, offset: scrollX - this.getNaturalLeft(column) };
        }
    }

    // `column` is back to its normal size: niri puts the view back unless the user is resizing or swiping
    public onColumnSizingBecameNormal(column: Column) {
        if (column !== this.getLastFocusedColumn()) {
            return;
        }
        const restore = this.viewRestore;
        this.viewRestore = null;
        if (restore === null || restore.column !== column || this.userResize || this.desktop.isGestureScrolling()) {
            return;
        }
        this.desktop.setScroll(this.getNaturalLeft(column) + restore.offset, false);
        this.desktop.scrollToColumn(column, false);
    }

    public clearViewRestore(column?: Column) {
        if (column === undefined || (this.viewRestore !== null && this.viewRestore.column === column)) {
            this.viewRestore = null;
        }
    }

    public getViewRestoreOffset(column: Column) {
        return this.viewRestore !== null && this.viewRestore.column === column ? this.viewRestore.offset : null;
    }

    public setViewRestoreOffset(column: Column, offset: number) {
        if (column === this.getLastFocusedColumn()) {
            this.viewRestore = { column: column, offset: offset };
        }
    }

    public getScrollBeforeFocusLeft(column: Column) {
        const memo = this.focusMemo;
        return memo !== null && memo.from === column && Date.now() - memo.time < 200 ? memo.scrollX : null;
    }

    public moveColumn(column: Column, leftColumn: Column|null) {
        if (column === leftColumn) {
            return;
        }
        this.viewRestore = null;
        const movedLeft = leftColumn === null ? true : column.isToTheRightOf(leftColumn);
        const firstMovedColumn = movedLeft ? column : this.getRightColumn(column);
        this.columns.move(column, leftColumn);
        this.columnsSetX(firstMovedColumn);
        this.desktop.onLayoutChanged();
        this.desktop.autoAdjustScroll();
    }

    public moveColumnLeft(column: Column) {
        this.viewRestore = null;
        this.columns.moveBack(column);
        this.columnsSetX(column);
        this.desktop.onLayoutChanged();
        this.desktop.autoAdjustScroll();
    }

    public moveColumnRight(column: Column) {
        const rightColumn = this.columns.getNext(column);
        if (rightColumn === null) {
            return;
        }
        this.moveColumnLeft(rightColumn);
    }

    public getWidth() {
        return this.width;
    }

    public isUserResizing() {
        return this.userResize;
    }

    public hasColumn(column: Column) {
        return column.grid === this && this.columns.contains(column);
    }

    public getLeftColumn(column: Column) {
        return this.columns.getPrev(column);
    }

    public getRightColumn(column: Column) {
        return this.columns.getNext(column);
    }

    public getColumns() {
        return Array.from(this.columns.iterator());
    }

    public getFirstColumn() {
        return this.columns.getFirst();
    }

    public getLastColumn() {
        return this.columns.getLast();
    }

    public getColumnAtIndex(i: number) {
        return this.columns.getItemAtIndex(i);
    }

    public getLastFocusedColumn() {
        if (this.lastFocusedColumn === null || this.lastFocusedColumn.grid !== this) {
            return null;
        }
        return this.lastFocusedColumn;
    }

    // niri's focus-column-left/right-under-mouse on a desktop that is not the active one: only its active column changes
    public setActiveColumn(column: Column) {
        if (column.grid === this && column !== this.lastFocusedColumn) {
            this.previousFocusedColumn = this.lastFocusedColumn;
            this.lastFocusedColumn = column;
        }
    }

    public getPreviousFocusedColumn() {
        if (this.previousFocusedColumn === null || !this.hasColumn(this.previousFocusedColumn)) {
            return null;
        }
        return this.previousFocusedColumn;
    }

    public getLastFocusedWindow() {
        const lastFocusedColumn = this.getLastFocusedColumn();
        if (lastFocusedColumn === null) {
            return null;
        }
        return lastFocusedColumn.getFocusTaker();
    }

    private columnsSetX(firstMovedColumn: Column|null) {
        const lastUnmovedColumn = firstMovedColumn === null ? this.columns.getLast() : this.columns.getPrev(firstMovedColumn);
        let x = lastUnmovedColumn === null ? 0 : lastUnmovedColumn.getRight() + lastUnmovedColumn.getOverflow()[1] + this.config.gapsInnerHorizontal;
        if (firstMovedColumn !== null) {
            for (const column of this.columns.iteratorFrom(firstMovedColumn)) {
                const [overflowLeft, overflowRight] = column.getOverflow();
                column.gridX = x + overflowLeft;
                x = column.getRight() + overflowRight + this.config.gapsInnerHorizontal;
            }
        }
        this.width = x - this.config.gapsInnerHorizontal;
    }

    public getLeftmostVisibleColumn(visibleRange: Range) {
        for (const column of this.columns.iterator()) {
            if (Range.contains(visibleRange, column)) {
                return column;
            }
        }
        return null;
    }

    public getRightmostVisibleColumn(visibleRange: Range) {
        let last = null;
        for (const column of this.columns.iterator()) {
            if (Range.contains(visibleRange, column)) {
                last = column;
            } else if (last !== null) {
                break;
            }
        }
        return last;
    }

    public *getVisibleColumns(visibleRange: Range) {
        for (const column of this.columns.iterator()) {
            if (Range.contains(visibleRange, column)) {
                yield column;
            }
        }
    }

    public minHeightsChanged() {
        for (const column of this.columns.iterator()) {
            if (column.minHeightsChanged()) {
                return true;
            }
        }
        return false;
    }

    public refreshMinHeights() {
        for (const column of this.columns.iterator()) {
            column.refreshMinHeights();
        }
    }

    public arrange(x: number, visibleRange: Range) {
        for (const column of this.columns.iterator()) {
            column.arrange(x + column.gridX, visibleRange, this.userResize);
        }

        const focusedWindow = this.getLastFocusedWindow();
        if (focusedWindow !== null) {
            focusedWindow.client.ensureTransientsVisible(this.desktop.clientArea);
        }
    }

    // maximizeSingleColumn: with one or two columns, adding or removing one changes the width of the other
    private lonelinessChanges() {
        return this.desktop.profile.desktop.maximizeSingleColumn && this.columns.length() <= 2;
    }

    public onColumnAdded(column: Column, leftColumn: Column|null) {
        if (leftColumn === null) {
            this.columns.insertStart(column);
        } else {
            this.columns.insertAfter(column, leftColumn);
        }
        this.columnsSetX(this.lonelinessChanges() ? this.columns.getFirst() : column);
        if (this.getLastFocusedColumn() === null) {
            this.lastFocusedColumn = column;
        }
        this.desktop.onLayoutChanged();
        this.desktop.autoAdjustScroll();
    }

    public onColumnOpened(column: Column, previous: Column|null, scrollX: number) {
        if (previous === null || this.getLeftColumn(column) !== previous) {
            return;
        }
        if (this.lastFocusedColumn === column) {
            this.returnTo = { column: previous, scrollX: scrollX };
        } else {
            this.opened = { column: column, previous: previous, scrollX: scrollX };
        }
    }

    public onColumnRemoved(column: Column, passFocus: FocusPassing.Type) {
        const isLastColumn = this.columns.length() === 1;
        const rightColumn = this.getRightColumn(column);
        const leftColumn = this.getLeftColumn(column);
        // like niri: the right neighbour gets the focus, or the left one when the closed one was the last, or the one it
        // was opened from
        const returnTo = this.returnTo !== null && column === this.lastFocusedColumn && this.returnTo.column === leftColumn ? this.returnTo : null;
        let columnToFocus = isLastColumn ? null : returnTo !== null ? leftColumn : rightColumn ?? leftColumn;
        if (columnToFocus !== null && columnToFocus.isEmpty()) {
            const goRight = columnToFocus === rightColumn;
            columnToFocus = this.findNonEmptyColumn(columnToFocus, goRight, column) ?? this.findNonEmptyColumn(columnToFocus, !goRight, column);
        }
        if (this.opened !== null && this.opened.column === column) {
            this.opened = null;
        }
        if (this.viewRestore !== null && this.viewRestore.column === column) {
            this.viewRestore = null;
        }
        if (column === this.lastFocusedColumn) {
            this.lastFocusedColumn = columnToFocus;
            this.returnTo = null;
        } else if (this.returnTo !== null && (this.returnTo.column === column || this.lastFocusedColumn === null)) {
            this.returnTo = null;
        }

        this.columns.remove(column);
        this.columnsSetX(this.lonelinessChanges() ? this.columns.getFirst() : rightColumn);

        this.desktop.onLayoutChanged();
        if (returnTo !== null) {
            this.desktop.setScroll(returnTo.scrollX, false);
        }
        this.desktop.recenterLoneColumn();
        if (columnToFocus !== null) {
            switch (passFocus) {
            case FocusPassing.Type.Immediate:
                columnToFocus.getWindowToFocus().focus();
                this.focusPasser.request(columnToFocus.getWindowToFocus().client.kwinClient);
                this.ensureInView(columnToFocus);
                return;
            case FocusPassing.Type.OnUnfocus:
                this.focusPasser.request(columnToFocus.getWindowToFocus().client.kwinClient);
                this.ensureInView(columnToFocus);
                return;
            }
        }
        this.desktop.autoAdjustScroll();
    }

    private findNonEmptyColumn(start: Column, goRight: boolean, removed: Column) {
        for (let c: Column | null = start; c !== null; c = goRight ? this.getRightColumn(c) : this.getLeftColumn(c)) {
            if (c !== removed && !c.isEmpty()) {
                return c;
            }
        }
        return null;
    }

    // a view left where a closed window was would show an empty desktop when KWin had already focused the neighbour
    private ensureInView(column: Column) {
        if (this.columns.length() > 0 && !Range.contains(this.desktop.getCurrentVisibleRange(), column)) {
            this.desktop.autoAdjustScroll();
        }
    }

    public onColumnWidthChanged(column: Column) {
        // niri: the view offset is relative to the active column
        const keepOffset = !this.userResize && column === this.lastFocusedColumn && this.desktop.keepsViewOffset();
        const offset = keepOffset ? this.desktop.getScrollX() - column.getLeft() : 0;
        this.columnsSetX(column);
        this.desktop.onLayoutChanged();
        if (keepOffset) {
            this.desktop.setScroll(column.getLeft() + offset, true);
            this.desktop.fitColumnInView(column);
        } else if (!this.userResize) {
            this.desktop.autoAdjustScroll();
        }
    }

    public onColumnFocused(column: Column, window: Window) {
        const lastFocusedColumn = this.getLastFocusedColumn();
        if (lastFocusedColumn !== null) {
            lastFocusedColumn.restoreToTiled(window);
        }
        const previous = this.getLastFocusedColumn();
        if (column !== this.lastFocusedColumn) {
            this.previousFocusedColumn = this.lastFocusedColumn;
            this.viewRestore = null;
            this.focusMemo = this.lastFocusedColumn === null ? null : { from: this.lastFocusedColumn, scrollX: this.desktop.getScrollX(), time: Date.now() };
            this.returnTo = null;
            if (this.opened !== null && this.opened.column === column) {
                this.returnTo = { column: this.opened.previous, scrollX: this.opened.scrollX };
            }
            this.opened = null;
        }
        this.lastFocusedColumn = column;
        this.desktop.scrollToColumn(column, false, previous === column ? null : previous);
    }

    public onScreenSizeChanged() {
        for (const column of this.columns.iterator()) {
            column.updateWidth();
            column.resizeWindows();
        }
        this.columnsSetX(this.columns.getFirst());
    }

    public onUserResizeStarted() {
        this.userResize = true;
        this.userResized = true;
    }

    public onUserResizeFinished() {
        this.userResize = false;
        for (const column of this.columns.iterator()) {
            column.clearUserResizeTarget();
        }
        this.userResizeFinishedDelayer.run();
    }

    public evacuateTail(targetGrid: Grid, startColumn: Column) {
        for (const column of this.columns.iteratorFrom(startColumn)) {
            column.moveToGrid(targetGrid, targetGrid.getLastColumn());
        }
    }

    public evacuate(targetGrid: Grid) {
        const focused = this.getLastFocusedColumn();
        for (const column of this.columns.iterator()) {
            column.moveToGrid(targetGrid, targetGrid.getLastColumn());
        }
        if (focused !== null && focused.grid === targetGrid && targetGrid.getLastFocusedColumn() === null) {
            targetGrid.lastFocusedColumn = focused;
        }
    }

    public destroy() {
        this.userResizeFinishedDelayer.destroy();
    }
}
