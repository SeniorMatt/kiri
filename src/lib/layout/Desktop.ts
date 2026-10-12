class Desktop {
    private tabIndicators: TabIndicator[] = [];
    public readonly grid: Grid;
    private scrollX: number;
    private gestureScrollXInitial: number | null;
    private readonly gestureVelocity = new VelocityTracker(100, 120);
    private static readonly GESTURE_PROJECTION_MS = 333; // niri: 1 / (1000 * -ln 0.997) seconds of the release velocity
    // KWin starts a horizontal handler on the first few units of every swipe, before it has locked the axis;
    // a swipe that ends up vertical cancels it again. Less than this much progress (0.05 = 10 units) is not a swipe.
    private static readonly GESTURE_MIN_PROGRESS = 0.05;
    private gestureMaxAmount = 0;
    private gestureRight = true;
    // raw-swipe mode (compiled effect kiri_swipe): finger travel in units, like niri's SwipeTracker
    private gestureRaw = false;
    private gestureRawPos = 0;
    private gestureTargetColumn: Column|null = null;
    private gestureRawHistory: { delta: number, time: number }[] = [];
    private static readonly RAW_HISTORY_MS = 150; // niri HISTORY_LIMIT
    private static readonly RAW_DECELERATION = 0.997; // niri DECELERATION_TOUCHPAD, per millisecond
    private static readonly RAW_WORKING_AREA_MOVEMENT = 1200; // niri VIEW_GESTURE_WORKING_AREA_MOVEMENT
    private dirty: boolean;
    private dirtyScroll: boolean;
    private dirtyPins: boolean;
    public clientArea: QmlRect;
    public fullScreenArea: QmlRect;
    public tilingArea: QmlRect;

    constructor(
        public readonly kwinDesktop: KwinDesktop,
        private readonly pinManager: PinManager,
        private readonly config: Desktop.Config,
        private readonly getScreen: () => Output,
        layoutConfig: LayoutConfig,
        focusPasser: FocusPassing.Passer,
    ) {
        this.scrollX = 0;
        this.gestureScrollXInitial = null;
        this.dirty = true;
        this.dirtyScroll = true;
        this.dirtyPins = true;
        this.grid = new Grid(this, layoutConfig, focusPasser);
        this.clientArea = Desktop.getClientArea(this.getScreen(), kwinDesktop);
        this.fullScreenArea = Desktop.getFullScreenArea(this.getScreen(), kwinDesktop);
        this.tilingArea = Desktop.getTilingArea(this.clientArea, kwinDesktop, pinManager, config);
    }

    // the time of the latest screen size or dock change; windows are resized by KWin around it
    private screenChangedAt = -Infinity;

    public onScreenChanged() {
        this.screenChangedAt = Date.now();
    }

    public isScreenSettling() {
        return Date.now() - this.screenChangedAt < 3000;
    }

    private updateArea() {
        const newClientArea = Desktop.getClientArea(this.getScreen(), this.kwinDesktop);
        if (rectEquals(newClientArea, this.clientArea) && !this.dirtyPins) {
            return;
        }
        this.clientArea = newClientArea;
        this.fullScreenArea = Desktop.getFullScreenArea(this.getScreen(), this.kwinDesktop);
        this.tilingArea = Desktop.getTilingArea(newClientArea, this.kwinDesktop, this.pinManager, this.config);
        this.dirty = true;
        this.dirtyScroll = true;
        this.dirtyPins = false;
        this.grid.onScreenSizeChanged();
        this.autoAdjustScroll();
    }

    private static getClientArea(screen: Output, kwinDesktop: KwinDesktop) {
        return Workspace.clientArea(ClientAreaOption.PlacementArea, screen, kwinDesktop);
    }

    private static getFullScreenArea(screen: Output, kwinDesktop: KwinDesktop) {
        return Workspace.clientArea(ClientAreaOption.FullScreenArea, screen, kwinDesktop);
    }

    private static getTilingArea(clientArea: QmlRect, kwinDesktop: KwinDesktop, pinManager: PinManager, config: Desktop.Config) {
        const availableSpace = pinManager.getAvailableSpace(kwinDesktop, clientArea);
        const top = availableSpace.top + config.marginTop;
        const bottom = availableSpace.bottom - config.marginBottom;
        const left = availableSpace.left + config.marginLeft;
        const right = availableSpace.right - config.marginRight;
        return Qt.rect(
            left,
            top,
            right - left,
            bottom - top,
        );
    }

    public scrollIntoView(range: Range) {
        const left = range.getLeft();
        const right = range.getRight();
        const initialVisibleRange = this.getCurrentVisibleRange();

        let targetScrollX: number;
        if (left < initialVisibleRange.getLeft()) {
            targetScrollX = left;
        } else if (right > initialVisibleRange.getRight()) {
            targetScrollX = right - this.tilingArea.width;
        } else {
            targetScrollX = initialVisibleRange.getLeft();
        }

        this.setScroll(targetScrollX, false);
    }

    // niri: center-focused-column "always", or a lone column with always-center-single-column
    public isCenteringFocusedColumn() {
        return this.config.scroller instanceof CenteredScroller ||
            (this.config.alwaysCenterSingleColumn && this.grid.getFirstColumn() === this.grid.getLastColumn());
    }

    public scrollCenterRange(range: Range) {
        const scrollAmount = Range.minus(range, this.getCurrentVisibleRange());
        this.adjustScroll(scrollAmount, true);
    }

    public scrollCenterVisible(focusedColumn: Column) {
        const columnRange = new Desktop.ColumnRange(focusedColumn);
        const visibleRange = this.getCurrentVisibleRange();
        columnRange.addNeighbors(visibleRange, this.grid.config.gapsInnerHorizontal);
        this.scrollCenterRange(columnRange);
    }

    public autoAdjustScroll() {
        const focusedColumn = this.grid.getLastFocusedColumn();
        if (focusedColumn === null || focusedColumn.grid !== this.grid) {
            return;
        }

        this.scrollToColumn(focusedColumn, false);
    }

    // While the user resizes a column (and when they let go): like niri, the view only keeps the resized column centered
    // when niri would center it (center-focused-column "always", or a lone column with always-center-single-column).
    // Otherwise the view stays where it is, apart from following the left edge; the focused column is brought into
    // view when the pointer is released (niri's interactive_resize_end). The "center when everything fits" setting and
    // the centering scrollers (not niri's) also keep the columns that fit on the screen centered as a group.
    public recenterWhileResizing(column: Column, focused: boolean) {
        const clamper = this.config.clamper;
        if ((clamper instanceof CenterClamper || (clamper instanceof EdgeClamper && clamper.centerWhenFits)) && this.grid.getWidth() <= this.tilingArea.width) {
            this.setScroll(Math.round((this.grid.getWidth() - this.tilingArea.width) / 2), true);
        } else if (focused && this.isCenteringFocusedColumn()) {
            if (column.getWidth() < this.tilingArea.width) {
                this.setScroll(Math.round(column.getLeft() - (this.tilingArea.width - column.getWidth()) / 2), true);
            } else {
                this.scrollToColumn(column, true);
            }
        }
    }

    // `previous` is the column that was active before `column` took the focus
    public scrollToColumn(column: Column, force: boolean, previous: Column|null = null) {
        if (force || this.dirtyScroll || this.config.scroller.alwaysScroll === true || !Range.contains(this.getCurrentVisibleRange(), column)) {
            this.config.scroller.scrollToColumn(this, column, previous);
        }
    }

    private getVisibleRange(scrollX: number) {
        return Range.create(scrollX, this.tilingArea.width);
    }

    // the width niri calls the working area: the tiling area plus the outer gaps
    public getWorkingWidth() {
        return this.tilingArea.width + this.config.marginLeft + this.config.marginRight;
    }

    public getCurrentVisibleRange() {
        return this.getVisibleRange(this.scrollX);
    }

    private clampScrollX(x: number) {
        if (this.config.alwaysCenterSingleColumn) {
            const column = this.grid.getFirstColumn();
            if (column !== null && column === this.grid.getLastColumn()) {
                return Math.round((column.getWidth() - this.tilingArea.width) / 2);
            }
        }
        return this.config.clamper.clampScrollX(this, x);
    }

    public setScroll(x: number, force: boolean) {
        const oldScrollX = this.scrollX;
        this.scrollX = force ? x : this.clampScrollX(x);
        if (this.scrollX !== oldScrollX) {
            this.onLayoutChanged();
        }
        this.dirtyScroll = false;
    }

    public adjustScroll(dx: number, force: boolean) {
        this.setScroll(this.scrollX + dx, force);
    }

    public gestureScroll(amount: number, now: number) {
        if (!this.config.gestureScroll) {
            return;
        }
        if (this.gestureScrollXInitial === null) {
            this.gestureScrollXInitial = this.scrollX;
            this.gestureVelocity.reset();
            this.gestureMaxAmount = 0;
        }
        this.gestureMaxAmount = Math.max(this.gestureMaxAmount, Math.abs(amount));

        if (this.config.gestureScrollInvert) {
            amount = -amount;
        }
        // like niri, the view follows the fingers freely, past the ends too; releasing snaps it back
        this.setScroll(this.gestureScrollXInitial + this.config.gestureScrollStep * amount, true);
        this.gestureVelocity.add(now, this.scrollX);
    }

    // niri's view_offset_gesture_update for a touchpad: the view moves working_width / 1200 per unit of finger
    // travel, with no cap, and follows the fingers past the ends
    public gestureRawUpdate(delta: number, time: number, startOffset = 0) {
        if (!this.config.gestureScroll) {
            return;
        }
        if (this.gestureScrollXInitial === null) {
            // the view starts where it is painted: the compiled effect may still show a settle that the layout is ahead of
            this.gestureScrollXInitial = this.scrollX + startOffset;
            this.gestureRaw = true;
            this.gestureTargetColumn = null;
            this.gestureRawPos = 0;
            this.gestureRawHistory = [];
        }
        this.gestureRawPos += delta;
        this.gestureRawHistory.push({ delta: delta, time: time });
        while (this.gestureRawHistory.length > 1 && time > this.gestureRawHistory[0].time + Desktop.RAW_HISTORY_MS) {
            this.gestureRawHistory.shift();
        }
        this.setScroll(this.gestureScrollXInitial + this.getRawScale() * this.gestureRawPos, true);
    }

    // what the compiled effect needs to paint a raw swipe at frame rate: the scroll per unit of finger travel and the
    // windows that scroll
    public getRawVisual() {
        const ids: string[] = [];
        for (const column of this.grid.getColumns()) {
            for (const window of column.getWindows()) {
                ids.push(String(window.client.kwinClient.internalId));
            }
        }
        return { scale: this.getRawScale(), ids: ids };
    }

    // scroll pixels per unit of finger travel, signed by the invert setting
    private getRawScale() {
        return (this.config.gestureScrollInvert ? -1 : 1) * this.getWorkingWidth() / Desktop.RAW_WORKING_AREA_MOVEMENT;
    }

    // niri's view_offset_gesture_end: project the release velocity, pick the closest snapping point, focus the
    // furthest column towards the swipe that is fully on screen there. Returns where the view should settle
    // (a scroll position) and how fast the view moves at the release (scroll pixels per second).
    public getRawRelease(): { from: number, to: number, velocity: number } {
        const history = this.gestureRawHistory;
        let velocity = 0; // units per second
        if (history.length > 1 && history[history.length - 1].time > history[0].time) {
            const total = history.reduce((sum, e) => sum + e.delta, 0);
            velocity = total / ((history[history.length - 1].time - history[0].time) / 1000);
        }
        const scale = this.getRawScale();
        const viewVelocity = velocity * scale;
        const projected = -viewVelocity / (1000 * Math.log(Desktop.RAW_DECELERATION));
        this.gestureRight = projected >= 0;

        const marginLeft = this.config.marginLeft;
        // niri's view position: the column at screen x = p has view position gridX - p
        const columns = this.grid.getColumns();
        const result = NiriSnap.choose({
            columns: columns.map(c => ({ x: c.getLeft(), width: c.getWidth() })),
            viewWidth: this.getWorkingWidth(),
            gaps: marginLeft,
            center: this.isCenteringFocusedColumn() ? "always" : this.config.scroller instanceof OnOverflowScroller ? "on-overflow" : "never",
            currentView: this.scrollX - marginLeft,
            targetView: this.scrollX - marginLeft + projected,
        });
        if (result === null) {
            return { from: this.scrollX, to: this.scrollX, velocity: 0 };
        }
        this.gestureTargetColumn = columns[result.column];
        return { from: this.scrollX, to: result.view + marginLeft, velocity: result.retargeted ? 0 : viewVelocity };
    }

    public isRawGesture() {
        return this.gestureRaw && this.gestureScrollXInitial !== null;
    }

    public isGestureScrolling() {
        return this.gestureScrollXInitial !== null;
    }

    // Fingers lifted: the column-aligned scroll position to settle on, taking the swipe velocity into account.
    public getGestureSettleTarget(now: number) {
        if (this.gestureRaw) {
            return this.getRawRelease().to;
        }
        // niri-style: a column's left edge at the left edge of the screen, or the ends of the grid
        const candidates: number[] = [this.clampScrollX(-Infinity), this.clampScrollX(Infinity)];
        for (const column of this.grid.getColumns()) {
            candidates.push(this.clampScrollX(column.getLeft()));
            // niri also snaps with a column's right edge at the right edge of the screen
            candidates.push(this.clampScrollX(column.getRight() - this.tilingArea.width));
        }
        const velocity = this.gestureVelocity.getVelocity(now);
        const moved = this.gestureScrollXInitial === null ? 0 : this.scrollX - this.gestureScrollXInitial;
        this.gestureRight = velocity !== 0 ? velocity > 0 : moved >= 0;
        return pickSnapTarget(candidates, this.scrollX, velocity, Desktop.GESTURE_PROJECTION_MS);
    }

    // A gesture that never got past a few units was KWin guessing the axis of a vertical swipe: put it back, no focus change.
    public gestureScrollAbortIfAccidental() {
        if (this.gestureRaw || this.gestureScrollXInitial === null || this.gestureMaxAmount >= Desktop.GESTURE_MIN_PROGRESS) {
            return false;
        }
        this.setScroll(this.gestureScrollXInitial, false);
        this.gestureScrollXInitial = null;
        return true;
    }

    public getScrollX() {
        return this.scrollX;
    }

    // niri: after a swipe, the column furthest in the swipe's direction that is fully on screen gets focus,
    // also when all columns fit on the screen and the view did not move
    public gestureScrollFinish(focusedWindow: Window|null, focusedUntiled = false, mayFocus = true) {
        if (this.gestureScrollXInitial === null) {
            return;
        }
        this.gestureScrollXInitial = null;
        this.gestureRaw = false;

        const visibleRange = this.getCurrentVisibleRange();
        const targetColumn = this.gestureTargetColumn;
        this.gestureTargetColumn = null;
        const focusTargetColumn = targetColumn !== null && targetColumn.grid === this.grid ? targetColumn : this.gestureRight ?
            this.grid.getRightmostVisibleColumn(visibleRange) :
            this.grid.getLeftmostVisibleColumn(visibleRange);
        if (focusTargetColumn === null || !mayFocus) {
            return;
        }
        if (focusedUntiled || focusedWindow === null || focusedWindow.column !== focusTargetColumn) {
            focusTargetColumn.getWindowToFocus().focus();
        }
    }

    public arrange() {
        // TODO (optimization): only arrange visible windows
        this.updateArea();
        if (this.dirty) {
            this.tabIndicators = [];
            this.grid.arrange(this.tilingArea.x - this.scrollX, this.getCurrentVisibleRange());
            this.dirty = false;
        }
        publishTabIndicators(this, this.tabIndicators);
    }

    public addTabIndicator(indicator: TabIndicator) {
        this.tabIndicators.push(indicator);
    }

    public forceArrange() {
        this.dirty = true;
    }

    public onLayoutChanged() {
        this.dirty = true;
        this.dirtyScroll = true;
    }

    public onPinsChanged() {
        this.dirty = true;
        this.dirtyScroll = true;
        this.dirtyPins = true;
    }

    public destroy() {
        publishTabIndicators(this, [], false);
        this.grid.destroy();
    }
}

namespace Desktop {
    export interface Config {
        marginTop: number;
        marginBottom: number;
        marginLeft: number;
        marginRight: number;
        alwaysCenterSingleColumn: boolean;
        gestureScroll: boolean;
        gestureScrollInvert: boolean;
        gestureScrollStep: number;
        scroller: Desktop.Scroller;
        clamper: Desktop.Clamper;
    }

    export class ColumnRange {
        private left: Column;
        private right: Column;
        private width: number;

        constructor(initialColumn: Column) {
            this.left = initialColumn;
            this.right = initialColumn;
            this.width = initialColumn.getWidth();
        }

        public addNeighbors(visibleRange: Range, gap: number) {
            const grid = this.left.grid;

            const columnRange = this;
            function canFit(column: Column) {
                return columnRange.width + gap + column.getWidth() <= visibleRange.getWidth();
            }
            function isUsable(column: Column|null) {
                return column !== null && canFit(column);
            }

            let leftColumn = grid.getLeftColumn(this.left);
            let rightColumn = grid.getRightColumn(this.right);
            function checkColumns() {
                if (!isUsable(leftColumn)) {
                    leftColumn = null;
                }
                if (!isUsable(rightColumn)) {
                    rightColumn = null;
                }
            }
            checkColumns();

            const visibleCenter = visibleRange.getLeft() + visibleRange.getWidth() / 2;
            while (leftColumn !== null || rightColumn !== null) {
                const leftToCenter = leftColumn === null ? Infinity : Math.abs(leftColumn.getLeft() - visibleCenter);
                const rightToCenter = rightColumn === null ? Infinity : Math.abs(rightColumn.getRight() - visibleCenter);
                if (leftToCenter < rightToCenter) {
                    this.addLeft(leftColumn!, gap);
                    leftColumn = grid.getLeftColumn(leftColumn!);
                } else {
                    this.addRight(rightColumn!, gap);
                    rightColumn = grid.getRightColumn(rightColumn!);
                }
                checkColumns();
            }
        }

        public addLeft(column: Column, gap: number) {
            this.left = column;
            this.width += column.getWidth() + gap;
        }

        public addRight(column: Column, gap: number) {
            this.right = column;
            this.width += column.getWidth() + gap;
        }

        public getLeft() {
            return this.left.getLeft();
        }

        public getRight() {
            return this.right.getRight();
        }

        public getWidth() {
            return this.width;
        }
    }

    export interface Scroller {
        // always called, also for columns that are already visible (niri centers those too)
        readonly alwaysScroll?: boolean;
        scrollToColumn(desktop: Desktop, column: Column, previous: Column|null): void;
    }

    export interface Clamper {
        clampScrollX(desktop: Desktop, x: number): number;
    }
}
