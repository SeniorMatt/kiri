class Column {
    public grid: Grid;
    public gridX: number;
    public widthBeforeMaximize: number|undefined;
    private width: number; // TODO: increase column width to contain transients
    private readonly windows: LinkedList<Window>;
    private tabbed: boolean;
    private focusTaker: Window|null;
    private static readonly minWidth = 40;
    private static readonly minHeight = 40;

    constructor(grid: Grid, leftColumn: Column|null) {
        this.gridX = 0;
        this.width = 0;
        this.windows = new LinkedList();
        this.tabbed = grid.config.tabbedColumnsByDefault;
        this.focusTaker = null;
        this.grid = grid;
        this.grid.onColumnAdded(this, leftColumn);
    }

    public moveToGrid(targetGrid: Grid, leftColumn: Column|null) {
        if (targetGrid === this.grid) {
            this.grid.moveColumn(this, leftColumn);
        } else {
            this.grid.onColumnRemoved(this, this.isFocused() ? FocusPassing.Type.Immediate : FocusPassing.Type.None);
            this.grid = targetGrid;
            targetGrid.onColumnAdded(this, leftColumn);
            for (const window of this.windows.iterator()) {
                window.client.kwinClient.desktops = [targetGrid.desktop.kwinDesktop];
            }
        }
    }

    public isToTheLeftOf(other: Column) {
        return this.gridX < other.gridX;
    }

    public isToTheRightOf(other: Column) {
        return this.gridX > other.gridX;
    }

    public moveWindowUp(window: Window) {
        this.windows.moveBack(window);
        this.grid.desktop.onLayoutChanged();
    }

    public moveWindowDown(window: Window) {
        this.windows.moveForward(window);
        this.grid.desktop.onLayoutChanged();
    }

    public getWindows() {
        return Array.from(this.windows.iterator());
    }

    public getWindowCount() {
        return this.windows.length();
    }

    public isEmpty() {
        return this.getWindowCount() === 0;
    }

    public getFirstWindow(): Window {
        return this.windows.getFirst()!;
    }

    public getLastWindow(): Window {
        return this.windows.getLast()!;
    }

    public getAboveWindow(window: Window) {
        return this.windows.getPrev(window);
    }

    public getBelowWindow(window: Window) {
        return this.windows.getNext(window);
    }

    public getWidth() {
        return this.fillsWidth() ? this.grid.desktop.tilingArea.width : this.width;
    }

    // whether the column contains a maximized or full-screen window that fills the width of the screen
    private fillsWidth() {
        for (const window of this.windows.iterator()) {
            if (window.fillsWidth()) {
                return true;
            }
        }
        return false;
    }

    // returns how far the column's windows reach past its left and right edges
    public getOverflow(): [number, number] {
        let overflowLeft = 0;
        let overflowRight = 0;
        for (const window of this.windows.iterator()) {
            const [left, right] = window.getOverflow();
            overflowLeft = Math.max(overflowLeft, left);
            overflowRight = Math.max(overflowRight, right);
        }
        return [overflowLeft, overflowRight];
    }

    public getMinWidth() {
        let maxMinWidth = Column.minWidth;
        for (const window of this.windows.iterator()) {
            const minWidth = window.client.kwinClient.minSize.width.ceil();
            if (minWidth > maxMinWidth) {
                maxMinWidth = minWidth;
            }
        }
        return Math.min(maxMinWidth, this.grid.desktop.tilingArea.width); // min width mustn't exceed tilingArea width
    }

    public getMaxWidth() {
        let minMaxWidth = this.grid.desktop.tilingArea.width;
        for (const window of this.windows.iterator()) {
            const maxWidth = window.client.kwinClient.maxSize.width.floor();
            if (maxWidth < minMaxWidth) {
                minMaxWidth = maxWidth;
            }
        }
        return Math.max(minMaxWidth, this.getMinWidth()); // max width mustn't be lower than min width
    }

    public setWidth(width: number, setPreferred: boolean) {
        width = clamp(width, this.getMinWidth(), this.getMaxWidth());
        if (width === this.width) {
            return;
        }

        this.width = width;
        if (setPreferred) {
            for (const window of this.windows.iterator()) {
                window.client.preferredWidth = width;
            }
        }
        this.grid.onColumnWidthChanged(this);
    }

    public adjustWidth(widthDelta: number, setPreferred: boolean) {
        this.setWidth(this.width + widthDelta, setPreferred);
    }

    public updateWidth() {
        let minErr = Infinity;
        let closestPreferredWidth = this.width;
        for (const window of this.windows.iterator()) {
            const err = Math.abs(window.client.preferredWidth - this.width);
            if (err < minErr) {
                minErr = err;
                closestPreferredWidth = window.client.preferredWidth;
            }
        }
        this.setWidth(closestPreferredWidth, false);
    }

    // returns x position of left edge in grid space
    public getLeft() {
        return this.gridX;
    }

    // returns x position of right edge in grid space
    public getRight() {
        return this.gridX + this.getWidth();
    }

    public onUserResizeWidth(
        startWidth: number,
        currentDelta: number,
        resizingLeftSide: boolean,
        neighbor?: { column: Column, startWidth: number },
    ) {
        const oldColumnWidth = this.getWidth();
        this.setWidth(startWidth + currentDelta, true);
        const actualDelta = this.getWidth() - startWidth;

        let leftEdgeDeltaStep = resizingLeftSide ? oldColumnWidth - this.getWidth() : 0;
        if (neighbor !== undefined) {
            const oldNeighborWidth = neighbor.column.getWidth();
            neighbor.column.setWidth(neighbor.startWidth - actualDelta, true);
            if (resizingLeftSide) {
                leftEdgeDeltaStep -= neighbor.column.getWidth() - oldNeighborWidth;
            }
        }
        this.grid.desktop.adjustScroll(-leftEdgeDeltaStep, true);
        this.grid.desktop.recenterWhileResizing(this, this.grid.getLastFocusedColumn() === this);
    }

    public adjustWindowHeight(window: Window, heightDelta: number, top: boolean) {
        const otherWindow = top ? this.windows.getPrev(window) : this.windows.getNext(window);
        if (otherWindow === null) {
            return;
        }

        window.height += heightDelta;
        otherWindow.height -= heightDelta;

        this.grid.desktop.onLayoutChanged();
    }

    // gives `window` the requested height and shrinks or grows the other windows of the column in proportion
    public setWindowHeight(window: Window, height: number) {
        const nWindows = this.windows.length();
        if (nWindows < 2) {
            return;
        }
        const totalHeight = this.grid.desktop.tilingArea.height - (nWindows-1) * this.grid.config.gapsInnerVertical;
        const minHeight = Math.min(Column.minHeight, Math.floor(totalHeight / nWindows));
        height = clamp(height, minHeight, totalHeight - (nWindows-1) * minHeight);

        const others: Window[] = [];
        let othersHeight = 0;
        for (const other of this.windows.iterator()) {
            if (other !== window) {
                others.push(other);
                othersHeight += other.height;
            }
        }
        window.height = height;
        let remainingPixels = totalHeight - height;
        let remainingHeight = othersHeight;
        let remainingWindows = others.length;
        for (const other of others) {
            const ratio = remainingHeight > 0 ? other.height / remainingHeight : 1 / remainingWindows;
            const otherHeight = remainingWindows === 1 ? remainingPixels : Math.max(minHeight, Math.round(remainingPixels * ratio));
            remainingHeight -= other.height;
            other.height = otherHeight;
            remainingPixels -= otherHeight;
            remainingWindows--;
        }

        this.grid.desktop.onLayoutChanged();
    }

    // returns the heights of the column's windows relative to the available height
    public getHeightRatios() {
        const heights = Array.from(this.windows.iterator()).map(window => window.height);
        const total = heights.reduce((a, b) => a + b, 0);
        return heights.map(height => total > 0 ? height / total : 1 / heights.length);
    }

    public setHeightRatios(ratios: number[]) {
        const nWindows = this.windows.length();
        if (ratios.length !== nWindows || nWindows < 2) {
            return;
        }
        let remainingPixels = this.grid.desktop.tilingArea.height - (nWindows-1) * this.grid.config.gapsInnerVertical;
        let i = 0;
        for (const window of this.windows.iterator()) {
            const windowHeight = i === nWindows-1 ? remainingPixels : Math.round(Math.min(ratios[i], 1) * (this.grid.desktop.tilingArea.height - (nWindows-1) * this.grid.config.gapsInnerVertical));
            window.height = windowHeight;
            remainingPixels -= windowHeight;
            i++;
        }
        this.grid.desktop.onLayoutChanged();
    }

    public isTabbed() {
        return this.tabbed;
    }

    public setTabbed(tabbed: boolean) {
        if (tabbed === this.tabbed) {
            return;
        }
        this.tabbed = tabbed;
        this.grid.desktop.onLayoutChanged();
    }

    public resizeWindows() {
        const nWindows = this.windows.length();
        if (nWindows === 0) {
            return;
        }
        let remainingPixels = this.grid.desktop.tilingArea.height - (nWindows-1) * this.grid.config.gapsInnerVertical;
        let remainingWindows = nWindows;
        for (const window of this.windows.iterator()) {
            const windowHeight = Math.round(remainingPixels / remainingWindows);
            window.height = windowHeight;
            remainingPixels -= windowHeight;
            remainingWindows--;
        }
        // TODO: respect min height

        this.grid.desktop.onLayoutChanged();
    }

    public getFocusTaker() {
        if (this.focusTaker === null || !this.windows.contains(this.focusTaker)) {
            return null;
        }
        return this.focusTaker;
    }

    public getWindowToFocus() {
        return this.getFocusTaker() ?? this.windows.getFirst()!;
    }

    public isFocused() {
        const lastFocusedWindow = this.grid.getLastFocusedWindow();
        if (lastFocusedWindow === null) {
            return false;
        }
        return lastFocusedWindow.column === this && lastFocusedWindow.isFocused();
    }

    public arrange(x: number, visibleRange: Range, forceOpaque: boolean) {
        if (this.grid.config.offScreenOpacity < 1.0 && !forceOpaque) {
            const opacity = Range.contains(visibleRange, this) ? 100 : this.grid.config.offScreenOpacity;
            for (const window of this.windows.iterator()) {
                window.client.kwinClient.opacity = opacity;
            }
        }

        if (this.tabbed) {
            this.arrangeTabbed(x);
            return;
        }
        let y = this.grid.desktop.tilingArea.y;
        for (const window of this.windows.iterator()) {
            window.arrange(x, y, this.getWidth(), window.height);
            y += window.height + this.grid.config.gapsInnerVertical;
        }
    }

    // every window gets the whole column, only the active one is raised above the others
    private arrangeTabbed(x: number) {
        const area = this.grid.desktop.tilingArea;
        for (const window of this.windows.iterator()) {
            window.arrange(x, area.y, this.getWidth(), area.height);
        }
        this.arrangeZ();
        this.grid.desktop.addTabIndicator(this.getTabIndicator(x));
    }

    private getTabIndicator(x: number): TabIndicator {
        const config = this.grid.config;
        const area = this.grid.desktop.tilingArea;
        const width = this.getWidth();
        const position = config.tabIndicatorPosition;
        const vertical = position === "left" || position === "right";
        const thickness = config.tabIndicatorWidth;
        const total = vertical ? area.height : width;
        const length = Math.max(1, Math.round(total * clamp(config.tabIndicatorLength, 0, 1)));
        const start = (vertical ? area.y : x) + Math.round((total - length) / 2);
        let tabX: number;
        let tabY: number;
        switch (position) {
        case "right":
            tabX = x + width + config.tabIndicatorGap;
            tabY = start;
            break;
        case "top":
            tabX = start;
            tabY = area.y - config.tabIndicatorGap - thickness;
            break;
        case "bottom":
            tabX = start;
            tabY = area.y + area.height + config.tabIndicatorGap;
            break;
        default:
            tabX = x - config.tabIndicatorGap - thickness;
            tabY = start;
            break;
        }
        const active = this.getWindowToFocus();
        let activeIndex = 0;
        let i = 0;
        for (const window of this.windows.iterator()) {
            if (window === active) {
                activeIndex = i;
            }
            i++;
        }
        return {
            x: tabX,
            y: tabY,
            width: vertical ? thickness : length,
            height: vertical ? length : thickness,
            vertical: vertical,
            count: this.windows.length(),
            active: activeIndex,
            windows: Array.from(this.windows.iterator()).map(window => String(window.client.kwinClient.internalId)),
        };
    }

    public arrangeZ() {
        for (const window of this.windows.iterator()) {
            if (window === this.focusTaker) {
                break;
            }
            window.raise();
        }
        for (const window of this.windows.iteratorReverse()) {
            window.raise();
            if (window === this.focusTaker) {
                break;
            }
        }
    }

    public toggleTabbed() {
        this.tabbed = !this.tabbed;
        this.grid.desktop.onLayoutChanged();
    }

    public onWindowAdded(window: Window, bottom: boolean) {
        if (bottom) {
            this.windows.insertEnd(window);
        } else {
            this.windows.insertStart(window);
        }

        if (this.width === 0) {
            this.setWidth(window.client.preferredWidth, false);
        } else {
            this.setWidth(this.width, false); // re-apply width constraints of the new window
        }

        this.resizeWindows();

        if (window.isFocused()) {
            this.onWindowFocused(window);
        }

        this.grid.desktop.onLayoutChanged();
    }

    public onWindowRemoved(window: Window, passFocus: FocusPassing.Type) {
        const lastWindow = this.windows.length() === 1;
        // like niri: the window below takes the place of the removed one, the one above if it was the bottom one
        const windowToFocus = this.getBelowWindow(window) ?? this.getAboveWindow(window);

        this.windows.remove(window);

        if (window === this.focusTaker) {
            this.focusTaker = windowToFocus;
        }

        if (lastWindow) {
            console.assert(this.isEmpty());
            this.destroy(passFocus);
        } else {
            this.resizeWindows();
            if (windowToFocus !== null) {
                switch (passFocus) {
                case FocusPassing.Type.Immediate:
                    windowToFocus.focus();
                    this.grid.focusPasser.request(windowToFocus.client.kwinClient); // KWin may still drop the focus while closing
                    break;
                case FocusPassing.Type.OnUnfocus:
                    this.grid.focusPasser.request(windowToFocus.client.kwinClient);
                    break;
                }
            }
        }

        this.grid.desktop.onLayoutChanged();
    }

    public onWindowFocused(window: Window) {
        this.grid.onColumnFocused(this, window);
        this.focusTaker = window;
        if (this.tabbed) {
            this.grid.desktop.forceArrange(); // the active tab changed
        }
    }

    public restoreToTiled(focusedWindow: Window) {
        const lastFocusedWindow = this.getFocusTaker();
        if (lastFocusedWindow !== null && lastFocusedWindow !== focusedWindow) {
            lastFocusedWindow.restoreToTiled();
        }
    }

    private destroy(passFocus: FocusPassing.Type) {
        this.grid.onColumnRemoved(this, passFocus);
    }
}
