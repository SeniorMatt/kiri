class Desktop {
    private tabIndicators: TabIndicator[] = [];
    public readonly grid: Grid;
    private scrollX: number;
    private gestureScrollXInitial: number | null;
    private readonly gestureVelocity = new VelocityTracker(100, 120);
    private static readonly GESTURE_PROJECTION_MS = 333;
    // KWin starts a horizontal handler on the first units of every swipe; less than 0.05 progress is not a swipe
    private static readonly GESTURE_MIN_PROGRESS = 0.05;
    private gestureMaxAmount = 0;
    private gestureRight = true;
    private gestureRaw = false;
    private gestureRawPointer = false;
    private gestureRawPos = 0;
    private gestureTargetColumn: Column|null = null;
    private gestureRawHistory: { delta: number, time: number }[] = [];
    private static readonly RAW_HISTORY_MS = 150;
    private static readonly RAW_DECELERATION = 0.997;
    private static readonly RAW_WORKING_AREA_MOVEMENT = 1200;
    private dirty: boolean;
    private dirtyScroll: boolean;
    private dirtyPins: boolean;
    private margins = "";
    public clientArea: QmlRect;
    public fullScreenArea: QmlRect;
    public tilingArea: QmlRect;

    constructor(
        public readonly kwinDesktop: KwinDesktop,
        private readonly pinManager: PinManager,
        private readonly getProfile: (desktop: Desktop) => LayoutProfile,
        public readonly outputName: string,
        private readonly getScreen: () => Output,
        private readonly getOutputCount: () => number,
        focusPasser: FocusPassing.Passer,
    ) {
        this.scrollX = 0;
        this.gestureScrollXInitial = null;
        this.dirty = true;
        this.dirtyScroll = true;
        this.dirtyPins = true;
        this.grid = new Grid(this, focusPasser);
        this.clientArea = Desktop.getClientArea(this.getScreen(), kwinDesktop);
        this.fullScreenArea = Desktop.getFullScreenArea(this.getScreen(), kwinDesktop);
        const config = this.config;
        this.margins = [config.marginTop, config.marginBottom, config.marginLeft, config.marginRight].join();
        this.tilingArea = Desktop.getTilingArea(this.clientArea, kwinDesktop, pinManager, config);
    }

    public get profile(): LayoutProfile {
        return this.getProfile(this);
    }

    private get config(): Desktop.Config {
        return this.getProfile(this).desktop;
    }

    private screenChangedAt = -Infinity;

    public onScreenChanged() {
        this.screenChangedAt = Date.now();
    }

    public isScreenSettling() {
        return Date.now() - this.screenChangedAt < 3000;
    }

    private updateArea() {
        const newClientArea = Desktop.getClientArea(this.getScreen(), this.kwinDesktop);
        const config = this.config;
        const margins = [config.marginTop, config.marginBottom, config.marginLeft, config.marginRight].join();
        if (rectEquals(newClientArea, this.clientArea) && !this.dirtyPins && margins === this.margins) {
            return;
        }
        this.margins = margins;
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

    public isCenteringFocusedColumn() {
        return this.config.scroller instanceof CenteredScroller ||
            (this.config.alwaysCenterSingleColumn && this.grid.getFirstColumn() === this.grid.getLastColumn());
    }

    // niri leaves the view offset alone unless the focused column is centered
    public keepsViewOffset() {
        const clamper = this.config.clamper;
        return !this.isCenteringFocusedColumn() && clamper instanceof EdgeClamper && !clamper.centerWhenFits;
    }

    // niri's compute_new_view_offset
    public fitColumnInView(column: Column) {
        const view = this.getCurrentVisibleRange();
        if (this.tilingArea.width <= column.getWidth()) {
            this.setScroll(column.getLeft(), true);
        } else if (column.getLeft() < view.getLeft() || column.getRight() > view.getRight()) {
            const toLeft = Math.abs(view.getLeft() - column.getLeft());
            const toRight = Math.abs(view.getRight() - column.getRight());
            this.setScroll(toLeft <= toRight ? column.getLeft() : column.getRight() - this.tilingArea.width, true);
        }
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
        this.recenterLoneColumn();
    }

    // niri: a lone column stays centered whatever happened to the view before
    public recenterLoneColumn() {
        if (this.config.alwaysCenterSingleColumn && this.grid.getFirstColumn() !== null && this.grid.getFirstColumn() === this.grid.getLastColumn()) {
            this.setScroll(this.scrollX, false);
            return;
        }
        const clamper = this.config.clamper;
        if ((clamper instanceof CenterClamper || (clamper instanceof EdgeClamper && clamper.centerWhenFits)) &&
            this.grid.getFirstColumn() !== null && this.grid.getWidth() <= this.tilingArea.width) {
            this.setScroll(Math.round((this.grid.getWidth() - this.tilingArea.width) / 2), false);
        }
    }

    // while the user resizes a column the view keeps it centered only when niri would; the focused column is brought
    // into view on release
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

    public scrollToColumn(column: Column, force: boolean, previous: Column|null = null) {
        if (force || this.dirtyScroll || this.config.scroller.alwaysScroll === true || !Range.contains(this.getCurrentVisibleRange(), column)) {
            this.config.scroller.scrollToColumn(this, column, previous);
        }
    }

    private getVisibleRange(scrollX: number) {
        return Range.create(scrollX, this.tilingArea.width);
    }

    public getWorkingWidth() {
        return this.tilingArea.width + this.config.marginLeft + this.config.marginRight;
    }

    public getWorkingLeft() {
        return this.tilingArea.x - this.config.marginLeft;
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
        this.setScroll(this.gestureScrollXInitial + this.config.gestureScrollStep * amount, true);
        this.gestureVelocity.add(now, this.scrollX);
    }

    // niri's view_offset_gesture_update for a touchpad: working_width / 1200 per unit of finger travel, no cap
    public gestureRawUpdate(delta: number, time: number, startOffset = 0, pointer = false) {
        if (!this.config.gestureScroll) {
            return;
        }
        if (this.gestureScrollXInitial === null) {
            this.gestureScrollXInitial = this.scrollX + startOffset;
            this.gestureRaw = true;
            this.gestureRawPointer = pointer;
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

    public getRawVisual() {
        const ids: string[] = [];
        for (const column of this.grid.getColumns()) {
            for (const window of column.getWindows()) {
                ids.push(String(window.client.kwinClient.internalId));
            }
        }
        return { scale: this.getRawScale(), ids: ids };
    }

    private getRawScale() {
        if (this.gestureRawPointer) {
            return 1;
        }
        return (this.config.gestureScrollInvert ? -1 : 1) * this.getWorkingWidth() / Desktop.RAW_WORKING_AREA_MOVEMENT;
    }

    // niri's view_offset_gesture_end: project the release velocity, pick the closest snapping point
    public getRawRelease(): { from: number, to: number, velocity: number } {
        const history = this.gestureRawHistory;
        let velocity = 0;
        if (history.length > 1 && history[history.length - 1].time > history[0].time) {
            const total = history.reduce((sum, e) => sum + e.delta, 0);
            velocity = total / ((history[history.length - 1].time - history[0].time) / 1000);
        }
        const scale = this.getRawScale();
        const viewVelocity = velocity * scale;
        const projected = -viewVelocity / (1000 * Math.log(Desktop.RAW_DECELERATION));
        this.gestureRight = projected >= 0;

        const marginLeft = this.config.marginLeft;
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
        let to = result.view + marginLeft;
        if (this.centersGridWhenFits()) {
            to = this.clampScrollX(to);
        }
        return { from: this.scrollX, to: to, velocity: to !== result.view + marginLeft || result.retargeted ? 0 : viewVelocity };
    }

    private centersGridWhenFits() {
        const clamper = this.config.clamper;
        return clamper instanceof EdgeClamper && clamper.centerWhenFits && this.grid.getWidth() <= this.tilingArea.width;
    }

    public isRawGesture() {
        return this.gestureRaw && this.gestureScrollXInitial !== null;
    }

    public isGestureScrolling() {
        return this.gestureScrollXInitial !== null;
    }

    public getGestureSettleTarget(now: number) {
        if (this.gestureRaw) {
            return this.getRawRelease().to;
        }
        const candidates: number[] = [this.clampScrollX(-Infinity), this.clampScrollX(Infinity)];
        for (const column of this.grid.getColumns()) {
            candidates.push(this.clampScrollX(column.getLeft()));
            candidates.push(this.clampScrollX(column.getRight() - this.tilingArea.width));
        }
        const velocity = this.gestureVelocity.getVelocity(now);
        const moved = this.gestureScrollXInitial === null ? 0 : this.scrollX - this.gestureScrollXInitial;
        this.gestureRight = velocity !== 0 ? velocity > 0 : moved >= 0;
        return pickSnapTarget(candidates, this.scrollX, velocity, Desktop.GESTURE_PROJECTION_MS);
    }

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

    // niri: after a swipe the furthest column in its direction that is fully on screen gets the focus
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

    private parkTop: number | null = null;

    public getParkOffset() {
        return this.parkTop === null ? null : this.parkTop - this.tilingArea.y;
    }

    private updateParking() {
        const parkTop = this.getOutputCount() > 1 ?
            rectBottom(Workspace.clientArea(ClientAreaOption.FullArea, this.getScreen(), this.kwinDesktop)) : null;
        if (parkTop !== this.parkTop) {
            this.parkTop = parkTop;
            this.dirty = true;
        }
    }

    public arrange() {
        // TODO (optimization): only arrange visible windows
        this.updateArea();
        this.updateParking();
        this.grid.refreshMinHeights();
        if (this.dirty) {
            this.tabIndicators = [];
            this.grid.arrange(this.tilingArea.x - this.scrollX, this.getCurrentVisibleRange());
            this.dirty = false;
        }
        publishTabIndicators(this, this.tabIndicators, this.kwinDesktop === currentDesktopOn(this.getScreen()));
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
        maximizeSingleColumn: boolean;
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
        readonly alwaysScroll?: boolean;
        scrollToColumn(desktop: Desktop, column: Column, previous: Column|null): void;
    }

    export interface Clamper {
        clampScrollX(desktop: Desktop, x: number): number;
    }
}
