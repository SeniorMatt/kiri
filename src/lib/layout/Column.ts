interface TabRectsConfig {
    tabIndicatorWidth: number;
    tabIndicatorGap: number;
    tabIndicatorGapsBetweenTabs: number;
    tabIndicatorLength: number;
    tabIndicatorPosition: string;
}

class Column {
    public grid: Grid;
    public gridX: number;
    public widthBeforeMaximize: number|undefined;
    private width: number; // TODO: increase column width to contain transients
    private presetIndex: number|undefined; // like niri's preset_width_idx: where the preset cycling stands; any other width change forgets it
    private presetWidth: number|undefined; // the width that was asked for when `presetIndex` was set; clients may snap to a smaller one
    private readonly windows: LinkedList<Window>;
    private tabbed: boolean;
    private normalSizing = true; // niri's sizing_mode is normal: no window is full-screen or maximized in the grid
    private focusTaker: Window|null;
    // the output this column was on before its output was unplugged: it goes back there when the output returns
    public homeOutput: string | undefined = undefined;
    private minHeightsSeen: number[] = []; // the minimum heights the last height distribution was made with
    // while the user resizes one of the windows: the geometry the pointer asks for, before the client has committed
    // it. The other windows of the column are sent there at once (niri sends all the configures of a resize together)
    private userResizeTarget: { window: Window, width: number, leftEdge: boolean } | null = null;
    private beyondView = false; // a width step made the column wider than the view (niri allows it)
    private static readonly minWidth = 40;
    private static readonly maxWidthBeyondView = 4; // times the view width: keeps the window under the GPU's texture size
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

    public moveToGrid(targetGrid: Grid, leftColumn: Column|null, passFocus = this.isFocused() ? FocusPassing.Type.Immediate : FocusPassing.Type.None) {
        if (targetGrid === this.grid) {
            this.grid.moveColumn(this, leftColumn);
        } else {
            this.grid.onColumnRemoved(this, passFocus);
            this.grid = targetGrid;
            targetGrid.onColumnAdded(this, leftColumn);
            for (const window of this.windows.iterator()) {
                window.client.kwinClient.desktops = [targetGrid.desktop.kwinDesktop];
            }
            // A column that was alone on its desktop has no neighbour to hand the focus to, so its window is still the
            // active one. KWin does not announce the activation of the active window again, so the focus that
            // follows the move would never reach the new grid: the view would stay where it was and the column
            // could sit off-centre or half off the screen. The new grid learns of the focus here.
            const focused = this.getWindows().find(window => window.isFocused());
            if (focused !== undefined) {
                this.onWindowFocused(focused);
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

    public isNormalSizing() {
        for (const window of this.windows.iterator()) {
            if (window.fillsWidth() || window.fillsHeight()) {
                return false;
            }
        }
        return true;
    }

    // A window of the column changed its full-screen or maximized state while the view was at `scrollX`.
    // Returns true when the column is back to its normal size, then the caller restores the view once the layout is updated.
    public updateSizingMode(scrollX: number) {
        const normal = this.isNormalSizing();
        if (normal === this.normalSizing) {
            return false;
        }
        this.normalSizing = normal;
        if (!normal) {
            this.grid.onColumnSizingLeftNormal(this, scrollX);
        }
        return normal;
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
            const minWidth = window.client.getMinWidth();
            if (minWidth > maxMinWidth) {
                maxMinWidth = minWidth;
            }
        }
        return Math.min(maxMinWidth, this.grid.desktop.tilingArea.width); // min width mustn't exceed tilingArea width
    }

    // `beyondView`: the limit for niri's width steps (Meta+=), which may make a column wider than the screen
    public getMaxWidth(beyondView = false) {
        let minMaxWidth = this.grid.desktop.tilingArea.width * (beyondView ? Column.maxWidthBeyondView : 1);
        for (const window of this.windows.iterator()) {
            const maxWidth = window.client.getMaxWidth();
            if (maxWidth > 0 && maxWidth < minMaxWidth) {
                minMaxWidth = maxWidth;
            }
        }
        return Math.max(minMaxWidth, this.getMinWidth()); // max width mustn't be lower than min width
    }

    // `beyondView`: the width was asked for by a width step and may exceed the screen; once a column is that
    // wide, later updates (the client's own frame) may keep it so until it is narrowed back into the view
    public setWidth(width: number, setPreferred: boolean, keepPreset = false, beyondView = false) {
        const viewMax = this.getMaxWidth();
        if (beyondView) {
            this.beyondView = width > viewMax;
        }
        width = clamp(width, this.getMinWidth(), this.beyondView ? this.getMaxWidth(true) : viewMax);
        if (width <= viewMax) {
            this.beyondView = false;
        }
        if (!keepPreset) {
            this.presetIndex = undefined;
            this.presetWidth = undefined;
        }
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

    // remembers that the width was just set to `widths[index]` where `widths` is the list of presets that is cycled through
    public setPresetIndex(index: number, widths: number[]) {
        this.presetIndex = index >= 0 && index < widths.length ? index : undefined;
        this.presetWidth = this.presetIndex === undefined ? undefined : widths[this.presetIndex];
    }

    public getPresetIndex() {
        return this.fillsWidth() ? undefined : this.presetIndex;
    }

    // the width the user asked for with the last preset; the client may have snapped to a slightly smaller one
    public getNominalWidth() {
        return this.getPresetIndex() !== undefined ? this.presetWidth! : this.getWidth();
    }

    public adjustWidth(widthDelta: number, setPreferred: boolean) {
        this.setWidth(this.width + widthDelta, setPreferred);
    }

    public updateWidth() {
        this.presetIndex = undefined;
        this.presetWidth = undefined;
        let minErr = Infinity;
        let closestPreferredWidth = this.width;
        for (const window of this.windows.iterator()) {
            const err = Math.abs(window.client.preferredWidth - this.width);
            if (err < minErr) {
                minErr = err;
                closestPreferredWidth = window.client.preferredWidth;
            }
        }
        this.setWidth(closestPreferredWidth, false, true);
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

    // the pointer asks for `requested` (the window had `previous` at the last step; `leftEdge`: the left edge is dragged): the
    // column's windows get the new sizes now, without waiting for the resized client's commit. Other columns still follow
    // the committed geometry. Returns the geometry the layout allows the dragged window, which is `requested` unless the
    // pointer asks for more than the column can give (a size limit of this or another window of the column).
    public onUserResizeRequested(window: Window, requested: QmlRect, previous: QmlRect, leftEdge: boolean) {
        const width = clamp(requested.width, this.getMinWidth(), this.getMaxWidth());
        this.userResizeTarget = { window: window, width: width, leftEdge: leftEdge };
        if (requested.height !== previous.height) {
            // like niri: the dragged window gets the height under the pointer and the rest of the column shares what is
            // left; the top edge of the first window does nothing
            const top = requested.y !== previous.y;
            if (!(top && this.isTopWindow(window))) {
                this.setFixedHeight(window, requested.height, null);
            }
        }
        this.grid.desktop.onLayoutChanged();
        if (this.tabbed || window.height <= 0) {
            return requested;
        }
        // the pointer-driven frame keeps the edge that is not dragged where it is
        const height = Math.min(requested.height, window.height);
        const clampedWidth = Math.min(requested.width, width);
        const y = requested.y !== previous.y ? requested.y + requested.height - height : requested.y;
        const x = leftEdge ? requested.x + requested.width - clampedWidth : requested.x;
        return Qt.rect(x, y, clampedWidth, height);
    }

    public clearUserResizeTarget() {
        this.userResizeTarget = null;
    }

    public isTopWindow(window: Window) {
        return this.windows.getPrev(window) === null;
    }

    // Karousel's keys that trade height with the neighbouring window; all heights become weights again afterwards
    public tradeWindowHeight(window: Window, heightDelta: number, top: boolean) {
        const otherWindow = top ? this.windows.getPrev(window) : this.windows.getNext(window);
        if (otherWindow === null) {
            return;
        }

        // neither window gets smaller than its minimum
        heightDelta = Math.min(heightDelta, otherWindow.height - this.getMinWindowHeight(otherWindow));
        heightDelta = Math.max(heightDelta, this.getMinWindowHeight(window) - window.height);
        if (heightDelta === 0) {
            return;
        }
        window.height += heightDelta;
        otherWindow.height -= heightDelta;
        for (const other of this.windows.iterator()) {
            other.setAutoHeight(other.height);
        }

        this.grid.desktop.onLayoutChanged();
    }

    // niri's convert_heights_to_auto: the weights keep the current heights, centred on the median height
    private convertHeightsToAuto() {
        const windows = Array.from(this.windows.iterator());
        const sorted = windows.map(window => window.height).sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        for (const window of windows) {
            window.setAutoHeight(median > 0 ? window.height / median : 1);
        }
    }

    private getMinWindowHeight(window: Window) {
        return Math.max(1, window.client.getMinHeight());
    }

    // like niri's set-window-height: the window gets this height, the others share the rest by their weights
    public setFixedHeight(window: Window, height: number, presetIndex: number|null) {
        window.client.forgetLearnedHeight();
        if (window.fixedHeight === null) {
            this.convertHeightsToAuto();
        }
        const totalHeight = this.grid.desktop.tilingArea.height - (this.windows.length()-1) * this.grid.config.gapsInnerVertical;
        let othersMin = 0;
        for (const other of this.windows.iterator()) {
            if (other !== window) {
                othersMin += this.getMinWindowHeight(other);
            }
        }
        const max = window.client.getMaxHeight();
        height = Math.min(height, Math.max(1, totalHeight - othersMin));
        if (max > 0) {
            height = Math.min(height, max);
        }
        height = Math.max(height, this.getMinWindowHeight(window), 1);
        window.fixedHeight = Math.round(height);
        window.presetHeightIndex = presetIndex;
        this.resizeWindows();
    }

    // niri's reset-window-height: the window is auto-sized again (all windows of a tabbed column)
    public resetWindowHeight(window: Window) {
        window.client.forgetLearnedHeight();
        if (this.tabbed) {
            for (const other of this.windows.iterator()) {
                other.setAutoHeight();
            }
        } else {
            window.setAutoHeight();
        }
        this.resizeWindows();
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
        let i = 0;
        for (const window of this.windows.iterator()) {
            window.setAutoHeight(ratios[i] * nWindows);
            i++;
        }
        this.resizeWindows();
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

    // niri runs update_tile_sizes again whenever a window commits new size limits; KWin has no signal for that, so the
    // layout asks: a window whose minimum height changed (Chromium and Konsole report theirs late) gets a new distribution
    public minHeightsChanged() {
        const seen = this.minHeightsSeen;
        let i = 0;
        for (const window of this.windows.iterator()) {
            if (seen[i++] !== this.getMinWindowHeight(window)) {
                return true;
            }
        }
        return false;
    }

    public refreshMinHeights() {
        if (this.minHeightsChanged()) {
            this.resizeWindows();
        }
    }

    // Gives the windows their heights like niri's update_tile_sizes: fixed windows first, the rest of the column
    // is shared by the weights of the auto windows (windows that need more than their share keep their minimum)
    public resizeWindows() {
        const windows = Array.from(this.windows.iterator());
        const nWindows = windows.length;
        if (nWindows === 0) {
            return;
        }
        const totalHeight = this.grid.desktop.tilingArea.height - (nWindows-1) * this.grid.config.gapsInnerVertical;
        const minHeights = windows.map(window => this.getMinWindowHeight(window));
        this.minHeightsSeen = minHeights;

        const heights: (number|null)[] = windows.map(() => null);
        let heightLeft = totalHeight;
        let weightLeft = 0;
        windows.forEach((window, i) => {
            // niri: a window with an exact height (its minimum and maximum height are the same, from the client or
            // from min-height and max-height rules) is a fixed one; the maximum also caps a fixed height
            const clientMax = window.client.getMaxHeight();
            const exact = clientMax > 0 && minHeights[i] === clientMax;
            if (window.fixedHeight !== null || exact) {
                let fixed = Math.round(exact ? clientMax : window.fixedHeight!);
                if (clientMax > 0) {
                    fixed = Math.min(fixed, clientMax);
                }
                if (nWindows > 1) {
                    let othersMin = 0;
                    minHeights.forEach((min, j) => othersMin += j === i ? 0 : min);
                    fixed = Math.min(fixed, Math.max(1, totalHeight - othersMin));
                } else {
                    fixed = Math.min(fixed, Math.max(1, totalHeight));
                }
                heights[i] = Math.max(fixed, minHeights[i]);
                heightLeft -= heights[i]!;
            } else {
                weightLeft += window.heightWeight;
            }
        });

        // auto windows that don't get their minimum are fixed at it, which leaves less for the others
        let again = true;
        while (again) {
            again = false;
            let weight = weightLeft;
            let left = heightLeft;
            for (let i = 0; i < nWindows; i++) {
                if (heights[i] !== null) {
                    continue;
                }
                const auto = weight > 0 ? left * windows[i].heightWeight / weight : left;
                if (minHeights[i] > auto) {
                    heights[i] = minHeights[i];
                    heightLeft -= minHeights[i];
                    weightLeft -= windows[i].heightWeight;
                    again = true;
                    break;
                }
                const rounded = Math.max(1, Math.round(auto));
                left -= rounded;
                weight -= windows[i].heightWeight;
            }
        }
        for (let i = 0; i < nWindows; i++) {
            if (heights[i] !== null) {
                continue;
            }
            const auto = weightLeft > 0 ? heightLeft * windows[i].heightWeight / weightLeft : heightLeft;
            const rounded = Math.max(1, Math.round(auto));
            heights[i] = rounded;
            heightLeft -= rounded;
            weightLeft -= windows[i].heightWeight;
        }
        windows.forEach((window, i) => window.height = heights[i]!);

        this.grid.desktop.onLayoutChanged();
    }

    public getFocusTaker() {
        if (this.focusTaker === null || !this.windows.contains(this.focusTaker)) {
            return null;
        }
        return this.focusTaker;
    }

    public setFocusTaker(window: Window) {
        if (this.windows.contains(window)) {
            this.focusTaker = window;
        }
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
            const opacity = Range.contains(visibleRange, this) ? 1 : this.grid.config.offScreenOpacity;
            for (const window of this.windows.iterator()) {
                window.client.setBaseOpacity(opacity);
            }
        }

        const parked = this.isParked(visibleRange, forceOpaque);
        if (this.tabbed) {
            this.arrangeTabbed(x, parked);
            return;
        }
        let y = this.grid.desktop.tilingArea.y;
        const target = this.userResizeTarget;
        for (const window of this.windows.iterator()) {
            if (target !== null && window !== target.window) {
                // like niri, a tile that is not as wide as the column starts at the column's left edge, but when the left edge is
                // dragged the column grows to the left (what the pointer asks for may not be committed yet)
                window.arrange(target.leftEdge ? x + this.getWidth() - target.width : x, y, target.width, window.height, parked);
            } else {
                window.arrange(x, y, this.getWidth(), window.height, parked);
            }
            y += window.height + this.grid.config.gapsInnerVertical;
        }
    }

    // Completely out of the view while the outputs are more than one (see Desktop.parkTop). Not while the user resizes.
    private isParked(visibleRange: Range, forceOpaque: boolean) {
        return !forceOpaque && this.grid.desktop.getParkOffset() !== null &&
            (this.getRight() <= visibleRange.getLeft() || this.getLeft() >= visibleRange.getRight());
    }

    // every window gets the whole column (less the room of a tab indicator placed within the column), only the active one is
    // raised above the others
    private arrangeTabbed(x: number, parked: boolean) {
        const area = this.grid.desktop.tilingArea;
        const width = this.getWidth();
        const extra = this.tabIndicatorExtra();
        const position = this.grid.config.tabIndicatorPosition;
        const toLeft = position === "left" ? extra : 0;
        const toTop = position === "top" ? extra : 0;
        const toWidth = position === "left" || position === "right" ? extra : 0;
        const toHeight = position === "top" || position === "bottom" ? extra : 0;
        for (const window of this.windows.iterator()) {
            window.arrange(x + toLeft, area.y + toTop, width - toWidth, area.height - toHeight, parked);
        }
        this.arrangeZ();
        this.grid.desktop.addTabIndicator(this.getTabIndicator(x + toLeft, area.y + toTop, width - toWidth, area.height - toHeight));
    }

    // niri's tab_indicator.rs `extra_size`: room the windows give up to a tab indicator with `place-within-column`
    private tabIndicatorExtra() {
        const config = this.grid.config;
        if (!config.tabIndicatorEnabled || !config.tabIndicatorPlaceWithinColumn || (config.tabIndicatorHideWhenSingleTab && this.windows.length() === 1)) {
            return 0;
        }
        return Math.max(0, Math.round(config.tabIndicatorWidth) + Math.round(config.tabIndicatorGap));
    }

    // niri's tab_indicator.rs `tab_rects`, for a column area (x, y, width, height) with the indicator fully open: the rectangle
    // of every tab, in screen coordinates. Physical pixels are logical ones here (the effect rounds to physical pixels itself).
    public static tabRects(config: TabRectsConfig, count: number, x: number, y: number, width: number, height: number, progress = 1): { x: number, y: number, width: number, height: number }[] {
        // Rust's f64::round: halves go away from zero
        const round = (value: number) => Math.sign(value) * Math.round(Math.abs(value));
        const max1 = (value: number) => Math.max(1, round(value));
        const tabWidth = max1(config.tabIndicatorWidth);
        const gap = (config.tabIndicatorGap < 0 ? -1 : 1) * max1(Math.abs(config.tabIndicatorGap));
        const gapsBetweenShortest = max1(config.tabIndicatorGapsBetweenTabs);
        const position = config.tabIndicatorPosition;
        const side = position === "left" || position === "right" ? height : width;
        const minLength = round(side * clamp(config.tabIndicatorLength, 0, 2));
        const shortestLength = count * (1 + gapsBetweenShortest) - gapsBetweenShortest;
        const requested = Math.max(minLength, shortestLength);
        let perTab = (requested + gapsBetweenShortest) / count - gapsBetweenShortest;
        perTab *= progress;
        const gapsBetween = round(config.tabIndicatorGapsBetweenTabs * progress);
        const length = count * (perTab + gapsBetween) - gapsBetween;
        perTab = Math.max(1, Math.floor(perTab));
        const flooredLength = count * (perTab + gapsBetween) - gapsBetween;
        let onesLeft = Math.max(0, round(length - flooredLength));
        const a = -gap - tabWidth; // across the tabs
        const b = round((side - length) / 2); // along them
        let lx: number;
        let ly: number;
        switch (position) {
        case "right":
            lx = width + gap;
            ly = b;
            break;
        case "top":
            lx = b;
            ly = a;
            break;
        case "bottom":
            lx = b;
            ly = height + gap;
            break;
        default:
            lx = a;
            ly = b;
            break;
        }
        lx += x;
        ly += y;
        const vertical = position === "left" || position === "right";
        const rects = [];
        for (let i = 0; i < count; i++) {
            let size = perTab;
            if (onesLeft > 0) {
                onesLeft--;
                size++;
            }
            rects.push({ x: lx, y: ly, width: vertical ? tabWidth : size, height: vertical ? size : tabWidth });
            if (vertical) {
                ly += size + gapsBetween;
            } else {
                lx += size + gapsBetween;
            }
        }
        return rects;
    }

    private getTabIndicator(x: number, y: number, width: number, height: number): TabIndicator {
        const config = this.grid.config;
        const position = config.tabIndicatorPosition;
        const vertical = position === "left" || position === "right";
        const count = this.windows.length();
        const tabs = Column.tabRects(config, count, x, y, width, height);
        const left = Math.min(...tabs.map(tab => tab.x));
        const top = Math.min(...tabs.map(tab => tab.y));
        const right = Math.max(...tabs.map(tab => tab.x + tab.width));
        const bottom = Math.max(...tabs.map(tab => tab.y + tab.height));
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
            x: left,
            y: top,
            width: right - left,
            height: bottom - top,
            vertical: vertical,
            count: count,
            active: activeIndex,
            windows: Array.from(this.windows.iterator()).map(window => String(window.client.kwinClient.internalId)),
            tabs: tabs,
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

    public onWindowAdded(window: Window, bottom: boolean, after?: Window|null) {
        const widthBefore = this.getWidth();
        if (after !== undefined && after !== null) {
            this.windows.insertAfter(window, after);
        } else if (after === null || !bottom) {
            this.windows.insertStart(window);
        } else {
            this.windows.insertEnd(window);
        }
        window.setAutoHeight(); // like niri, a window that enters a column gets an auto height

        if (this.width === 0) {
            this.setWidth(window.client.preferredWidth, false);
        } else {
            this.setWidth(this.width, false); // re-apply width constraints of the new window
        }

        this.resizeWindows();
        this.normalSizing = this.isNormalSizing(); // a window that arrives full-screen has no view offset to restore
        if (widthBefore > 0 && this.getWidth() !== widthBefore) {
            this.grid.onColumnWidthChanged(this); // a maximized window makes the column as wide as the screen
        }

        if (window.isFocused()) {
            this.onWindowFocused(window);
        }

        this.grid.desktop.onLayoutChanged();
    }

    public onWindowRemoved(window: Window, passFocus: FocusPassing.Type) {
        const lastWindow = this.windows.length() === 1;
        // like niri: the window below takes the place of the removed one, the one above if it was the bottom one
        const windowToFocus = this.getBelowWindow(window) ?? this.getAboveWindow(window);
        const widthBefore = this.getWidth();
        const overflowBefore = this.getOverflow();

        this.windows.remove(window);
        if (!lastWindow) {
            // niri: when the column gets back to its normal size because a tile left it, nothing is restored
            const normal = this.isNormalSizing();
            if (normal && !this.normalSizing) {
                this.grid.clearViewRestore(this);
            }
            this.normalSizing = normal;
        }

        if (window === this.focusTaker) {
            this.focusTaker = windowToFocus;
        }

        if (lastWindow) {
            console.assert(this.isEmpty());
            this.destroy(passFocus);
        } else {
            if (this.windows.length() === 1) {
                const remaining = this.getFirstWindow();
                if (remaining.fixedHeight === null) {
                    remaining.heightWeight = 1; // niri: a lone auto window gets weight 1 again
                }
            }
            this.resizeWindows();
            const overflow = this.getOverflow();
            if (this.getWidth() !== widthBefore || overflow[0] !== overflowBefore[0] || overflow[1] !== overflowBefore[1]) {
                this.grid.onColumnWidthChanged(this); // the maximized window that filled the screen left (the column keeps its width, the overflow past its edges goes)
            }
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
