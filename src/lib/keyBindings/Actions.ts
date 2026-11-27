class Actions {
    constructor(
        public readonly config: Actions.Config,
    ) {}

    public readonly focusLeft = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        const leftColumn = grid.getLeftColumn(column);
        if (leftColumn === null) {
            return;
        }
        leftColumn.getWindowToFocus().focus();
    };

    public readonly focusRight = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        const rightColumn = grid.getRightColumn(column);
        if (rightColumn === null) {
            return;
        }
        rightColumn.getWindowToFocus().focus();
    };

    public readonly focusUp = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        const aboveWindow = column.getAboveWindow(window);
        if (aboveWindow === null) {
            return;
        }
        aboveWindow.focus();
    };

    public readonly focusDown = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        const belowWindow = column.getBelowWindow(window);
        if (belowWindow === null) {
            return;
        }
        belowWindow.focus();
    };

    public readonly focusNext = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        const belowWindow = column.getBelowWindow(window);
        if (belowWindow !== null) {
            belowWindow.focus();
        } else {
            const rightColumn = grid.getRightColumn(column);
            if (rightColumn === null) {
                return;
            }
            rightColumn.getFirstWindow().focus();
        }
    };

    public readonly focusPrevious = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        const aboveWindow = column.getAboveWindow(window);
        if (aboveWindow !== null) {
            aboveWindow.focus();
        } else {
            const leftColumn = grid.getLeftColumn(column);
            if (leftColumn === null) {
                return;
            }
            leftColumn.getLastWindow().focus();
        }
    };

    public readonly focusStart = (cm: ClientManager, dm: DesktopManager) => {
        const desktop = dm.getCurrentDesktop();
        if (desktop === undefined) {
            return;
        }
        const grid = desktop.grid;
        const firstColumn = grid.getFirstColumn();
        if (firstColumn === null) {
            return;
        }
        firstColumn.getWindowToFocus().focus();
    };

    public readonly focusEnd = (cm: ClientManager, dm: DesktopManager) => {
        const desktop = dm.getCurrentDesktop();
        if (desktop === undefined) {
            return;
        }
        const grid = desktop.grid;
        const lastColumn = grid.getLastColumn();
        if (lastColumn === null) {
            return;
        }
        lastColumn.getWindowToFocus().focus();
    };

    public readonly focusColumnRightOrFirst = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        (grid.getRightColumn(column) ?? grid.getFirstColumn()!).getWindowToFocus().focus();
    };

    public readonly focusColumnLeftOrLast = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        (grid.getLeftColumn(column) ?? grid.getLastColumn()!).getWindowToFocus().focus();
    };

    public readonly focusWindowDownOrColumnLeft = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        const below = column.getBelowWindow(window);
        (below ?? grid.getLeftColumn(column)?.getWindowToFocus())?.focus();
    };

    public readonly focusWindowDownOrColumnRight = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        const below = column.getBelowWindow(window);
        (below ?? grid.getRightColumn(column)?.getWindowToFocus())?.focus();
    };

    public readonly focusWindowUpOrColumnLeft = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        const above = column.getAboveWindow(window);
        (above ?? grid.getLeftColumn(column)?.getWindowToFocus())?.focus();
    };

    public readonly focusWindowUpOrColumnRight = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        const above = column.getAboveWindow(window);
        (above ?? grid.getRightColumn(column)?.getWindowToFocus())?.focus();
    };

    public readonly focusWindowTop = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        column.getFirstWindow().focus();
    };

    public readonly focusWindowBottom = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        column.getLastWindow().focus();
    };

    public readonly focusWindowDownOrTop = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        (column.getBelowWindow(window) ?? column.getFirstWindow()).focus();
    };

    public readonly focusWindowUpOrBottom = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        (column.getAboveWindow(window) ?? column.getLastWindow()).focus();
    };

    public readonly focusWindowInColumn = (index: number, cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        const windows = column.getWindows();
        windows[Math.min(index, windows.length - 1)].focus();
    };

    public readonly focusWindowOrDesktopDown = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        const below = column.getBelowWindow(window);
        if (below !== null) {
            below.focus();
        } else {
            Actions.switchDesktop(1, dm);
        }
    };

    public readonly focusWindowOrDesktopUp = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        const above = column.getAboveWindow(window);
        if (above !== null) {
            above.focus();
        } else {
            Actions.switchDesktop(-1, dm);
        }
    };

    public static switchDesktop(step: number, dm: DesktopManager) {
        const output = dm.getFocusedOutput();
        const target = Workspace.desktops[Workspace.desktops.indexOf(currentDesktopOn(output)) + step];
        if (target !== undefined) {
            gotoDesktop(target, "switch-desktop", output);
        }
    }

    public readonly windowMoveDownOrToDesktopDown = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        if (column.getBelowWindow(window) !== null) {
            column.moveWindowDown(window);
        } else {
            this.windowMoveToNextDesktop(cm, dm, window, column, grid);
        }
    };

    public readonly windowMoveUpOrToDesktopUp = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        if (column.getAboveWindow(window) !== null) {
            column.moveWindowUp(window);
        } else {
            this.windowMoveToPreviousDesktop(cm, dm, window, column, grid);
        }
    };

    // niri's swap-window-left/right
    public readonly swapWindowLeft = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid, focus = true) => {
        this.swapWindow(window, column, grid, grid.getLeftColumn(column), true, focus);
    };

    public readonly swapWindowRight = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid, focus = true) => {
        this.swapWindow(window, column, grid, grid.getRightColumn(column), false, focus);
    };

    private swapWindow(window: Window, column: Column, grid: Grid, target: Column|null, left: boolean, focus: boolean) {
        if (target === null) {
            return;
        }
        if (column.getWindowCount() === 1 && target.getWindowCount() === 1) {
            if (left) {
                grid.moveColumnLeft(column);
            } else {
                grid.moveColumnRight(column);
            }
            if (!focus) {
                this.focusColumn(target, grid);
            }
            return;
        }
        const other = target.getWindowToFocus();
        const windowAbove = column.getAboveWindow(window);
        const otherAbove = target.getAboveWindow(other);
        const width = column.getRegularWidth();
        if (column.getWindowCount() === 1) {
            other.moveToColumn(column, true, FocusPassing.Type.None, window);
            column.setWidth(width, false);
            window.moveToColumn(target, false, FocusPassing.Type.None, otherAbove);
        } else {
            window.moveToColumn(target, false, FocusPassing.Type.None, otherAbove);
            other.moveToColumn(column, false, FocusPassing.Type.None, windowAbove);
        }
        column.setFocusTaker(other);
        target.setFocusTaker(window);
        (focus ? window : other).focus();
        grid.desktop.autoAdjustScroll();
    }

    private focusColumn(column: Column, grid: Grid) {
        column.getWindowToFocus().focus();
        grid.desktop.autoAdjustScroll();
    }

    // niri's focus=false on the move-column actions
    public readonly columnMoveNoFocus = (kind: "left"|"right"|"start"|"end"|number, cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        const before = grid.getLeftColumn(column);
        let target: Column|null;
        let towardsRight: boolean;
        if (typeof kind === "number") {
            target = grid.getColumnAtIndex(kind) ?? grid.getLastColumn();
            towardsRight = target !== null && target.isToTheRightOf(column);
        } else {
            towardsRight = kind === "right" || kind === "end";
        }
        const neighbour = towardsRight ? grid.getRightColumn(column) : grid.getLeftColumn(column);
        if (kind === "left") {
            this.columnMoveLeft(cm, dm, window, column, grid);
        } else if (kind === "right") {
            this.columnMoveRight(cm, dm, window, column, grid);
        } else if (kind === "start") {
            this.columnMoveStart(cm, dm, window, column, grid);
        } else if (kind === "end") {
            this.columnMoveEnd(cm, dm, window, column, grid);
        } else {
            this.columnMoveToColumn(kind, cm, dm, window, column, grid);
        }
        if (neighbour !== null && grid.getLeftColumn(column) !== before) {
            this.focusColumn(neighbour, grid);
        }
    };

    public readonly windowMoveVerticalNoFocus = (up: boolean, cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        const neighbour = up ? column.getAboveWindow(window) : column.getBelowWindow(window);
        if (neighbour === null) {
            return;
        }
        if (up) {
            column.moveWindowUp(window);
        } else {
            column.moveWindowDown(window);
        }
        neighbour.focus();
    };

    public readonly columnDisplayNormal = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        column.setTabbed(false);
    };

    public readonly columnDisplayTabbed = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        column.setTabbed(true);
    };

    public readonly focusWindowPrevious = (cm: ClientManager, dm: DesktopManager, scope: "all"|"output"|"workspace" = "all", appOnly = false) => {
        const previous = cm.findPreviousFocused(scope, appOnly);
        if (previous !== null) {
            KiriFocus.mark(previous);
            activateWindow(previous, "actions");
        }
    };

    public readonly focusFloating = (cm: ClientManager, dm: DesktopManager) => {
        const floating = cm.findLastFocusedFloating();
        if (floating !== null) {
            KiriFocus.mark(floating);
            activateWindow(floating, "actions");
        }
    };

    public readonly focusTiling = (cm: ClientManager, dm: DesktopManager) => {
        const desktop = dm.getCurrentDesktop();
        const window = desktop === undefined ? null : desktop.grid.getLastFocusedWindow();
        if (window !== null) {
            window.focus();
        }
    };

    public readonly switchFocusFloatingTiling = (cm: ClientManager, dm: DesktopManager) => {
        const active = Workspace.activeWindow;
        if (active !== null && cm.isUserFloating(active)) {
            this.focusTiling(cm, dm);
        } else {
            this.focusFloating(cm, dm);
        }
    };

    public readonly windowMoveToFloating = (cm: ClientManager, dm: DesktopManager) => {
        if (Workspace.activeWindow !== null && cm.findTiledWindow(Workspace.activeWindow) !== null) {
            cm.toggleFloatingClient(Workspace.activeWindow);
        }
    };

    public readonly windowMoveToTiling = (cm: ClientManager, dm: DesktopManager) => {
        if (Workspace.activeWindow !== null && cm.isUserFloating(Workspace.activeWindow)) {
            cm.toggleFloatingClient(Workspace.activeWindow);
        }
    };

    public readonly windowMoveLeft = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        if (column.getWindowCount() === 1) {
            // move from own column into existing column
            const leftColumn = grid.getLeftColumn(column);
            if (leftColumn === null) {
                return;
            }
            window.moveToColumn(leftColumn, true, FocusPassing.Type.None);
            grid.desktop.autoAdjustScroll();
        } else {
            // move from shared column into own column
            const newColumn = new Column(grid, grid.getLeftColumn(column));
            window.moveToColumn(newColumn, true, FocusPassing.Type.None);
        }
    };

    public readonly windowMoveRight = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid, bottom = true) => {
        if (column.getWindowCount() === 1) {
            // move from own column into existing column
            const rightColumn = grid.getRightColumn(column);
            if (rightColumn === null) {
                return;
            }
            window.moveToColumn(rightColumn, bottom, FocusPassing.Type.None);
            grid.desktop.autoAdjustScroll();
        } else {
            // move from shared column into own column
            const newColumn = new Column(grid, column);
            window.moveToColumn(newColumn, true, FocusPassing.Type.None);
        }
    };

    // niri's consume-or-expel-window-left/right
    public readonly windowConsumeOrExpelLeft = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        this.consumeOrExpel(window, column, grid, grid.getLeftColumn(column), grid.getLeftColumn(column));
    };

    public readonly windowConsumeOrExpelRight = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        this.consumeOrExpel(window, column, grid, grid.getRightColumn(column), column);
    };

    private consumeOrExpel(window: Window, column: Column, grid: Grid, neighbour: Column|null, newColumnLeftOf: Column|null) {
        if (column.getWindowCount() === 1) {
            if (neighbour === null) {
                return;
            }
            window.moveToColumn(neighbour, true, FocusPassing.Type.None);
        } else {
            const width = column.getRegularWidth();
            const newColumn = new Column(grid, newColumnLeftOf);
            newColumn.setWidth(width, false);
            window.moveToColumn(newColumn, true, FocusPassing.Type.None);
        }
        grid.desktop.autoAdjustScroll();
    }

    public readonly windowConsumeIntoColumn = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        const rightColumn = grid.getRightColumn(column);
        if (rightColumn === null) {
            return;
        }
        rightColumn.getFirstWindow().moveToColumn(column, true, FocusPassing.Type.None);
        grid.desktop.autoAdjustScroll();
    };

    // niri's expel-window-from-column
    public readonly windowExpelFromColumn = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        if (column.getWindowCount() === 1) {
            return;
        }
        const expelled = column.getLastWindow();
        if (expelled.isFocused()) {
            const above = column.getAboveWindow(expelled);
            if (above !== null) {
                above.focus();
            }
        }
        const newColumn = new Column(grid, column);
        newColumn.setWidth(column.getRegularWidth(), false);
        expelled.moveToColumn(newColumn, true, FocusPassing.Type.None);
        grid.desktop.autoAdjustScroll();
    };

    // TODO (optimization): only arrange moved windows
    public readonly windowMoveUp = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        column.moveWindowUp(window);
    };

    // TODO (optimization): only arrange moved windows
    public readonly windowMoveDown = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        column.moveWindowDown(window);
    };

    public readonly windowMoveNext = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        const canMoveDown = window !== column.getLastWindow();
        if (canMoveDown) {
            column.moveWindowDown(window);
        } else {
            this.windowMoveRight(cm, dm, window, column, grid, false);
        }
    };

    public readonly windowMovePrevious = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        const canMoveUp = window !== column.getFirstWindow();
        if (canMoveUp) {
            column.moveWindowUp(window);
        } else {
            this.windowMoveLeft(cm, dm, window, column, grid);
        }
    };

    public readonly windowMoveStart = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        const newColumn = new Column(grid, null);
        window.moveToColumn(newColumn, true, FocusPassing.Type.None);
    };

    public readonly windowMoveEnd = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        const newColumn = new Column(grid, grid.getLastColumn());
        window.moveToColumn(newColumn, true, FocusPassing.Type.None);
    };

    public readonly windowHeightIncreaseUp = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        window.column.tradeWindowHeight(
            window,
            this.config.verticalResizeStep,
            true,
        );
    };

    public readonly windowHeightIncreaseDown = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        window.column.tradeWindowHeight(
            window,
            this.config.verticalResizeStep,
            false,
        );
    };

    public readonly windowToggleFloating = (cm: ClientManager, dm: DesktopManager) => {
        if (Workspace.activeWindow === null) {
            return;
        }
        cm.toggleFloatingClient(Workspace.activeWindow);
    };

    public readonly windowToggleWindowedFullScreen = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        window.toggleWindowedFullScreen();
    };

    public readonly columnMoveLeft = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        grid.moveColumnLeft(column);
    };

    public readonly columnMoveRight = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        grid.moveColumnRight(column);
    };

    public readonly columnMoveStart = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        grid.moveColumn(column, null);
    };

    public readonly columnMoveEnd = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        grid.moveColumn(column, grid.getLastColumn());
    };

    public readonly columnToggleTabbed = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        column.toggleTabbed();
    };

    public readonly columnWidthIncrease = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        grid.desktop.profile.columnResizer.increaseWidth(column);
    };

    public readonly columnWidthDecrease = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        grid.desktop.profile.columnResizer.decreaseWidth(column);
    };

    public readonly columnWidthStep = (percent: number, cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        const desktop = grid.desktop;
        const full = desktop.tilingArea.width + grid.config.gapsInnerHorizontal;
        column.widthBeforeMaximize = undefined;
        column.setWidth(column.getWidth() + Math.round(full * percent / 100), true, false, true);
    };

    // niri's set-column-width and set-window-width with a size
    public readonly columnWidthSet = (change: SizeChange, cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        const gap = grid.config.gapsInnerHorizontal;
        const full = grid.desktop.tilingArea.width + gap;
        column.widthBeforeMaximize = undefined;
        column.setWidth(change.resolve(column.getWidth(), full, gap), true, false, true);
    };

    public readonly windowHeightSet = (change: SizeChange, cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        const gap = grid.config.gapsInnerVertical;
        const full = grid.desktop.tilingArea.height + gap;
        column.setFixedHeight(window, change.resolve(window.height, full, gap), null);
    };

    public readonly floatingSizeSet = (horizontal: boolean, change: SizeChange, cm: ClientManager, active: KwinClient) => {
        cm.setFloatingSize(active, horizontal, change);
    };

    public readonly floatingSizeStep = (horizontal: boolean, percent: number, cm: ClientManager, active: KwinClient) => {
        cm.adjustFloatingSize(active, horizontal, percent);
    };

    public readonly floatingSizePreset = (horizontal: boolean, forwards: boolean, cm: ClientManager, active: KwinClient) => {
        const area = Workspace.clientArea(ClientAreaOption.PlacementArea, active.output, Clients.getKwinDesktopApprox(active));
        const presets = horizontal ?
            this.config.floatingPresetWidths.getOrdered(area.width) :
            this.config.floatingPresetHeights.getOrdered(area.height);
        cm.cycleFloatingSizePreset(active, horizontal, forwards, presets);
    };

    public readonly windowHeightStep = (percent: number, cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        const full = grid.desktop.tilingArea.height + grid.config.gapsInnerVertical;
        column.setFixedHeight(window, window.height + Math.round(full * percent / 100), null);
    };

    public readonly windowSetMaximizedToEdges = (maximize: boolean, cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        if ((window.client.getMaximizedMode() === MaximizedMode.Maximized) !== maximize) {
            window.client.setMaximize(maximize, maximize);
        }
    };

    // like niri's maximize-column
    public readonly columnWidthMaximize = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        const desktop = grid.desktop;
        const fullWidth = Math.min(Math.max(desktop.tilingArea.width, column.getMinWidth()), column.getMaxWidth());
        if (column.isAutoFullWidth()) {
            // maximizeSingleColumn made it full width: the shortcut takes it back to its own width, which counts as the
            // user's choice from now on
            column.widthBeforeMaximize = undefined;
            column.setWidth(column.getRegularWidth(), true, false, true);
            desktop.scrollCenterVisible(column);
            return;
        }
        const mode = window.client.getMaximizedMode() ?? MaximizedMode.Unmaximized;
        if (window.fillsWidth() && mode !== MaximizedMode.Unmaximized) {
            // KWin keeps the window maximized in the grid and the full area pins its frame: niri has no such state, so
            // the column goes back to its own width first
            window.client.setMaximize(false, false);
            if (column.getWidth() !== fullWidth) {
                desktop.scrollCenterVisible(column);
                return;
            }
        }
        if (column.getWidth() === fullWidth && column.widthBeforeMaximize !== undefined) {
            const restoreWidth = column.widthBeforeMaximize;
            column.widthBeforeMaximize = undefined;
            column.setWidth(restoreWidth, true, false, true);
        } else if (column.getWidth() !== fullWidth) {
            column.widthBeforeMaximize = column.getWidth();
            column.setWidth(fullWidth, true);
        } else if (!window.fillsWidth()) {
            // full width and nothing to go back to: niri's default column width
            const area = desktop.tilingArea.width;
            const getDefault = desktop.profile.defaultColumnWidth;
            let target = getDefault === null ? null : getDefault(area);
            if (target === null && window.client.preferredWidth !== fullWidth) {
                target = window.client.preferredWidth;
            }
            if (target === null) {
                target = Math.floor((area - grid.config.gapsInnerHorizontal) / 2);
            }
            target = Math.min(Math.max(target, column.getMinWidth()), column.getMaxWidth());
            if (target !== fullWidth) {
                column.setWidth(target, true, false, true);
            }
        }
        desktop.scrollCenterVisible(column);
    };

    // like niri's maximize-window-to-edges
    public readonly windowMaximizeToEdges = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        const maximized = window.client.getMaximizedMode() === MaximizedMode.Maximized;
        window.client.setMaximize(!maximized, !maximized);
    };

    public readonly columnWidthMinimize = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        grid.desktop.profile.columnResizer.minimizeWidth(column);
    };

    public readonly cyclePresetWidths = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        grid.desktop.profile.presetWidths.cycle(column, true);
    };

    public readonly cyclePresetWidthsReverse = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        grid.desktop.profile.presetWidths.cycle(column, false);
    };

    public readonly columnWidthExpand = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        const desktop = grid.desktop;
        const visibleRange = desktop.getCurrentVisibleRange();
        if (!Range.contains(visibleRange, column)) {
            return;
        }
        const left = grid.getLeftmostVisibleColumn(visibleRange);
        const right = grid.getRightmostVisibleColumn(visibleRange);
        if (left === null || right === null) {
            return;
        }
        if (left === column && right === column) {
            this.columnWidthMaximize(cm, dm, window, column, grid);
            return;
        }
        const freeSpace = visibleRange.getWidth() - (right.getRight() - left.getLeft());
        column.widthBeforeMaximize = undefined;
        column.setWidth(column.getWidth() + freeSpace, true);
        desktop.scrollCenterVisible(column);
    };

    public readonly windowHeightCyclePresets = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        this.cycleHeight(window, column, grid, false);
    };

    public readonly windowHeightCyclePresetsReverse = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        this.cycleHeight(window, column, grid, true);
    };

    // niri's switch-preset-window-height
    private cycleHeight(window: Window, column: Column, grid: Grid, reverse: boolean) {
        const presets = grid.desktop.profile.presetHeights.getOrdered(grid.desktop.tilingArea.height);
        const len = presets.length;
        if (len === 0) {
            return;
        }
        let index: number;
        if (window.presetHeightIndex !== null && window.presetHeightIndex < len) {
            index = (window.presetHeightIndex + (reverse ? len - 1 : 1)) % len;
        } else {
            const current = window.height;
            if (reverse) {
                index = len - 1;
                for (let i = len - 1; i >= 0; i--) {
                    if (presets[i] + 1 < current) {
                        index = i;
                        break;
                    }
                }
            } else {
                index = 0;
                for (let i = 0; i < len; i++) {
                    if (current + 1 < presets[i]) {
                        index = i;
                        break;
                    }
                }
            }
        }
        column.setFixedHeight(window, presets[index], index);
    }

    public readonly windowHeightReset = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        column.resetWindowHeight(window);
    };

    public readonly columnsWidthEqualize = (cm: ClientManager, dm: DesktopManager) => {
        const desktop = dm.getCurrentDesktop();
        if (desktop === undefined) {
            return;
        }
        const visibleRange = desktop.getCurrentVisibleRange();
        const visibleColumns = Array.from(desktop.grid.getVisibleColumns(visibleRange));
        if (visibleColumns.length === 0) {
            return;
        }

        const availableSpace = desktop.tilingArea.width;
        const gapsWidth = desktop.grid.config.gapsInnerHorizontal * (visibleColumns.length-1);
        const widths = fillSpace(
            availableSpace - gapsWidth,
            visibleColumns.map(column => ({ min: column.getMinWidth(), max: column.getMaxWidth() })),
        );
        visibleColumns.forEach((column, index) => column.setWidth(widths[index], true));

        desktop.scrollCenterRange(Range.fromRanges(
            visibleColumns[0],
            visibleColumns[visibleColumns.length - 1],
        ));
    };

    public readonly columnsSqueezeLeft = (cm: ClientManager, dm: DesktopManager, window: Window, focusedColumn: Column, grid: Grid) => {
        const visibleRange = grid.desktop.getCurrentVisibleRange();
        if (!Range.contains(visibleRange, focusedColumn)) {
            return;
        }

        const currentVisibleColumns = Array.from(grid.getVisibleColumns(visibleRange));
        console.assert(currentVisibleColumns.includes(focusedColumn), "should at least contain the focused column");

        const targetColumn = grid.getLeftColumn(currentVisibleColumns[0]);
        if (targetColumn === null) {
            return;
        }

        const wantedVisibleColumns = [targetColumn, ...currentVisibleColumns];
        while (true) {
            const success = this.squeezeColumns(wantedVisibleColumns);
            if (success) {
                break;
            }
            const removedColumn = wantedVisibleColumns.pop();
            if (removedColumn === focusedColumn) {
                break; // don't scroll past the currently focused column
            }
        }
    };

    public readonly columnsSqueezeRight = (cm: ClientManager, dm: DesktopManager, window: Window, focusedColumn: Column, grid: Grid) => {
        const visibleRange = grid.desktop.getCurrentVisibleRange();
        if (!Range.contains(visibleRange, focusedColumn)) {
            return;
        }

        const currentVisibleColumns = Array.from(grid.getVisibleColumns(visibleRange));
        console.assert(currentVisibleColumns.includes(focusedColumn), "should at least contain the focused column");

        const targetColumn = grid.getRightColumn(currentVisibleColumns[currentVisibleColumns.length-1]);
        if (targetColumn === null) {
            return;
        }

        const wantedVisibleColumns = [...currentVisibleColumns, targetColumn];
        while (true) {
            const success = this.squeezeColumns(wantedVisibleColumns);
            if (success) {
                break;
            }
            const removedColumn = wantedVisibleColumns.shift();
            if (removedColumn === focusedColumn) {
                break; // don't scroll past the currently focused column
            }
        }
    };

    private readonly squeezeColumns = (columns: Column[]) => {
        const firstColumn = columns[0];
        const lastColumn = columns[columns.length-1];
        const grid = firstColumn.grid;
        const desktop = grid.desktop;

        const availableSpace = desktop.tilingArea.width;
        const gapsWidth = grid.config.gapsInnerHorizontal * (columns.length-1);
        const columnConstraints = columns.map(column => ({ min: column.getMinWidth(), max: column.getWidth() }));
        const minTotalWidth = gapsWidth + columnConstraints.reduce((acc, constraint) => acc + constraint.min, 0);
        if (minTotalWidth > availableSpace) {
            // there's nothing we can do
            return false;
        }

        const widths = fillSpace(availableSpace - gapsWidth, columnConstraints);
        columns.forEach((column, index) => column.setWidth(widths[index], true));
        desktop.scrollCenterRange(Range.fromRanges(firstColumn, lastColumn));
        return true;
    };

    public readonly gridScrollLeft = (cm: ClientManager, dm: DesktopManager) => {
        this.gridScroll(dm, -this.config.manualScrollStep);
    };

    public readonly gridScrollRight = (cm: ClientManager, dm: DesktopManager) => {
        this.gridScroll(dm, this.config.manualScrollStep);
    };

    private readonly gridScroll = (desktopManager: DesktopManager, amount: number) => {
        const desktop = desktopManager.getCurrentDesktop();
        if (desktop !== undefined) {
            desktop.adjustScroll(amount, false);
        }
    };

    public readonly gridScrollStart = (cm: ClientManager, dm: DesktopManager) => {
        const desktop = dm.getCurrentDesktop();
        if (desktop === undefined) {
            return;
        }
        const grid = desktop.grid;
        const firstColumn = grid.getFirstColumn();
        if (firstColumn === null) {
            return;
        }
        grid.desktop.scrollToColumn(firstColumn, false);
    };

    public readonly gridScrollEnd = (cm: ClientManager, dm: DesktopManager) => {
        const desktop = dm.getCurrentDesktop();
        if (desktop === undefined) {
            return;
        }
        const grid = desktop.grid;
        const lastColumn = grid.getLastColumn();
        if (lastColumn === null) {
            return;
        }
        grid.desktop.scrollToColumn(lastColumn, false);
    };

    public readonly floatingCenter = (cm: ClientManager, active: KwinClient) => {
        cm.centerFloatingClient(active);
    };

    public readonly gridScrollFocused = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        grid.desktop.scrollCenterRange(column);
    };

    public readonly centerVisibleColumns = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        const desktop = grid.desktop;
        if (desktop.isCenteringFocusedColumn()) {
            return;
        }
        const visibleRange = desktop.getCurrentVisibleRange();
        const visible = Array.from(grid.getVisibleColumns(visibleRange));
        if (!visible.includes(column)) {
            return;
        }
        desktop.scrollCenterRange(Range.fromRanges(visible[0], visible[visible.length - 1]));
    };

    public readonly gridScrollLeftColumn = (cm: ClientManager, dm: DesktopManager) => {
        const desktop = dm.getCurrentDesktop();
        if (desktop === undefined) {
            return;
        }
        const grid = desktop.grid;
        const column = grid.getLeftmostVisibleColumn(grid.desktop.getCurrentVisibleRange());
        if (column === null) {
            return;
        }

        const leftColumn = grid.getLeftColumn(column);
        if (leftColumn === null) {
            return;
        }

        grid.desktop.scrollToColumn(leftColumn, false);
    };

    public readonly gridScrollRightColumn = (cm: ClientManager, dm: DesktopManager) => {
        const desktop = dm.getCurrentDesktop();
        if (desktop === undefined) {
            return;
        }
        const grid = desktop.grid;
        const column = grid.getRightmostVisibleColumn(grid.desktop.getCurrentVisibleRange());
        if (column === null) {
            return;
        }

        const rightColumn = grid.getRightColumn(column);
        if (rightColumn === null) {
            return;
        }

        grid.desktop.scrollToColumn(rightColumn, false);
    };

    public readonly screenSwitch = (cm: ClientManager, dm: DesktopManager) => {
        dm.gatherOnOutput(dm.getActiveOutputName());
    };

    private getMonitor(dm: DesktopManager, direction: Actions.MonitorDirection) {
        const from = dm.getActiveOutputName();
        switch (direction) {
        case "left": return dm.getOutputInDirection(from, -1, 0);
        case "right": return dm.getOutputInDirection(from, 1, 0);
        case "up": return dm.getOutputInDirection(from, 0, -1);
        case "down": return dm.getOutputInDirection(from, 0, 1);
        case "next": return dm.getAdjacentOutput(from, 1);
        case "previous": return dm.getAdjacentOutput(from, -1);
        }
    }

    // niri's focus-monitor-*
    public readonly focusMonitor = (direction: Actions.MonitorDirection, cm: ClientManager, dm: DesktopManager) => {
        const output = this.getMonitor(dm, direction);
        if (output === null) {
            return;
        }
        const window = dm.getDesktopInCurrentActivity(currentDesktopOn(output), output.name)?.grid.getLastFocusedWindow() ?? null;
        if (window !== null) {
            window.focus();
            return;
        }
        const floating = cm.getTopFloatingOnOutput(output);
        if (floating !== null) {
            activateWindow(floating, "focus-monitor");
            return;
        }
        dm.setForcedOutput(output.name);
        const area = Workspace.clientArea(ClientAreaOption.ScreenArea, output, currentDesktopOn(output));
        warpPointerTo(Math.round(area.x + area.width / 2), Math.round(area.y + area.height / 2));
    };

    // niri's move-column-to-monitor-*
    public readonly columnMoveToMonitor = (direction: Actions.MonitorDirection, cm: ClientManager, dm: DesktopManager, window: Window, column: Column, oldGrid: Grid) => {
        const output = this.getMonitor(dm, direction);
        if (output === null) {
            return;
        }
        const newGrid = dm.getDesktopInCurrentActivity(currentDesktopOn(output), output.name)?.grid;
        if (newGrid === undefined || newGrid === oldGrid) {
            return;
        }
        const wasFocused = window.isFocused();
        column.homeOutput = undefined;
        column.moveToGrid(newGrid, newGrid.getLastFocusedColumn() ?? newGrid.getLastColumn());
        if (wasFocused) {
            window.focus();
        }
    };

    public readonly windowMoveToMonitor = (direction: Actions.MonitorDirection, cm: ClientManager, dm: DesktopManager, window: Window, column: Column, oldGrid: Grid) => {
        if (column.getWindowCount() === 1) {
            this.columnMoveToMonitor(direction, cm, dm, window, column, oldGrid);
            return;
        }
        const output = this.getMonitor(dm, direction);
        if (output === null) {
            return;
        }
        const newGrid = dm.getDesktopInCurrentActivity(currentDesktopOn(output), output.name)?.grid;
        if (newGrid === undefined || newGrid === oldGrid) {
            return;
        }
        const wasFocused = window.isFocused();
        const newColumn = new Column(newGrid, newGrid.getLastFocusedColumn() ?? newGrid.getLastColumn());
        window.moveToColumn(newColumn, true, wasFocused ? FocusPassing.Type.Immediate : FocusPassing.Type.None);
        if (wasFocused) {
            window.focus();
        }
    };

    public readonly floatingMoveToMonitor = (direction: Actions.MonitorDirection, cm: ClientManager, dm: DesktopManager, active: KwinClient) => {
        const output = this.getMonitor(dm, direction);
        if (output !== null) {
            cm.moveFloatingToOutput(active, output);
        }
    };

    public readonly focus = (columnIndex: number, cm: ClientManager, dm: DesktopManager) => {
        const desktop = dm.getCurrentDesktop();
        if (desktop === undefined) {
            return;
        }
        const grid = desktop.grid;
        const targetColumn = grid.getColumnAtIndex(columnIndex) ?? grid.getLastColumn();
        if (targetColumn === null) {
            return;
        }
        targetColumn.getWindowToFocus().focus();
    };

    public readonly windowMoveToColumn = (columnIndex: number, cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        const targetColumn = grid.getColumnAtIndex(columnIndex);
        if (targetColumn === null) {
            return;
        }
        window.moveToColumn(targetColumn, true, FocusPassing.Type.None);
        grid.desktop.autoAdjustScroll();
    };

    public readonly columnMoveToColumn = (columnIndex: number, cm: ClientManager, dm: DesktopManager, window: Window, column: Column, grid: Grid) => {
        const targetColumn = grid.getColumnAtIndex(columnIndex) ?? grid.getLastColumn();
        if (targetColumn === null || targetColumn === column) {
            return;
        }
        if (targetColumn.isToTheRightOf(column)) {
            grid.moveColumn(column, targetColumn);
        } else {
            grid.moveColumn(column, grid.getLeftColumn(targetColumn));
        }
    };

    // like niri, the column goes to the right of the target's active column; `follow` false is focus=false
    public readonly columnMoveToDesktop = (desktopIndex: number, cm: ClientManager, dm: DesktopManager, window: Window, column: Column, oldGrid: Grid, follow = true) => {
        desktopIndex = this.config.clampDesktopIndex(desktopIndex);
        const newGrid = this.getOtherGrid(desktopIndex, dm, oldGrid);
        if (newGrid === null) {
            return;
        }
        const wasFocused = window.isFocused();
        column.moveToGrid(newGrid, newGrid.getLastFocusedColumn() ?? newGrid.getLastColumn());
        if (wasFocused && follow) {
            gotoDesktop(newGrid.desktop.kwinDesktop, "move-window-follow", dm.getOutputByName(newGrid.desktop.outputName));
            window.focus();
        }
    };

    public readonly windowMoveToDesktop = (desktopIndex: number, cm: ClientManager, dm: DesktopManager, window: Window, column: Column, oldGrid: Grid, follow = true) => {
        desktopIndex = this.config.clampDesktopIndex(desktopIndex);
        if (column.getWindowCount() === 1) {
            this.columnMoveToDesktop(desktopIndex, cm, dm, window, column, oldGrid, follow);
            return;
        }
        const newGrid = this.getOtherGrid(desktopIndex, dm, oldGrid);
        if (newGrid === null) {
            return;
        }
        const wasFocused = window.isFocused();
        const newColumn = new Column(newGrid, newGrid.getLastFocusedColumn() ?? newGrid.getLastColumn());
        window.moveToColumn(newColumn, true, wasFocused ? FocusPassing.Type.Immediate : FocusPassing.Type.None);
        window.client.kwinClient.desktops = [newGrid.desktop.kwinDesktop];
        if (wasFocused && follow) {
            gotoDesktop(newGrid.desktop.kwinDesktop, "move-window-follow", dm.getOutputByName(newGrid.desktop.outputName));
            window.focus();
        }
    };

    // niri's move-column-to-new-workspace-below/above and the window variants
    public readonly columnMoveToNewDesktop = (below: boolean, follow: boolean, cm: ClientManager, dm: DesktopManager, window: Window, column: Column, oldGrid: Grid) => {
        const target = this.config.emptyDesktopNextToCurrent(below);
        if (target !== null) {
            this.columnMoveToDesktop(target, cm, dm, window, column, oldGrid, follow);
            this.config.releaseNewDesktop();
        }
    };

    public readonly windowMoveToNewDesktop = (below: boolean, follow: boolean, cm: ClientManager, dm: DesktopManager, window: Window, column: Column, oldGrid: Grid) => {
        const target = this.config.emptyDesktopNextToCurrent(below);
        if (target !== null) {
            this.windowMoveToDesktop(target, cm, dm, window, column, oldGrid, follow);
            this.config.releaseNewDesktop();
        }
    };

    private getOtherGrid(desktopIndex: number, dm: DesktopManager, oldGrid: Grid) {
        const kwinDesktop = Workspace.desktops[desktopIndex];
        if (kwinDesktop === undefined) {
            return null;
        }
        const newDesktop = dm.getDesktopInCurrentActivity(kwinDesktop, oldGrid.desktop.outputName);
        if (newDesktop === undefined) {
            return null;
        }
        const newGrid = newDesktop.grid;
        return newGrid === null || newGrid === oldGrid ? null : newGrid;
    }

    private adjacentDesktopIndex(oldGrid: Grid, step: number) {
        const index = Workspace.desktops.indexOf(oldGrid.desktop.kwinDesktop);
        const target = index + step;
        return index < 0 || target < 0 || target >= Workspace.desktops.length ? null : target;
    }

    public readonly windowMoveToNextDesktop = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, oldGrid: Grid, follow = true) => {
        const target = this.adjacentDesktopIndex(oldGrid, 1);
        if (target !== null) {
            this.windowMoveToDesktop(target, cm, dm, window, column, oldGrid, follow);
        }
    };

    public readonly windowMoveToPreviousDesktop = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, oldGrid: Grid, follow = true) => {
        const target = this.adjacentDesktopIndex(oldGrid, -1);
        if (target !== null) {
            this.windowMoveToDesktop(target, cm, dm, window, column, oldGrid, follow);
        }
    };

    public readonly columnMoveToNextDesktop = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, oldGrid: Grid, follow = true) => {
        const target = this.adjacentDesktopIndex(oldGrid, 1);
        if (target !== null) {
            this.columnMoveToDesktop(target, cm, dm, window, column, oldGrid, follow);
        }
    };

    public readonly columnMoveToPreviousDesktop = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, oldGrid: Grid, follow = true) => {
        const target = this.adjacentDesktopIndex(oldGrid, -1);
        if (target !== null) {
            this.columnMoveToDesktop(target, cm, dm, window, column, oldGrid, follow);
        }
    };

    public readonly tailMoveToDesktop = (desktopIndex: number, cm: ClientManager, dm: DesktopManager, window: Window, column: Column, oldGrid: Grid) => {
        desktopIndex = this.config.clampDesktopIndex(desktopIndex);
        const kwinDesktop = Workspace.desktops[desktopIndex];
        if (kwinDesktop === undefined) {
            return;
        }
        const newDesktop = dm.getDesktopInCurrentActivity(kwinDesktop, oldGrid.desktop.outputName);
        if (newDesktop === undefined) {
            return;
        }
        const newGrid = newDesktop.grid;
        if (newGrid === null || newGrid === oldGrid) {
            return;
        }
        oldGrid.evacuateTail(newGrid, column);
    };

    public readonly tailMoveToNextDesktop = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, oldGrid: Grid) => {
        const currentDesktopIndex = Workspace.desktops.indexOf(oldGrid.desktop.kwinDesktop);
        if (currentDesktopIndex < 0) {
            return;
        }
        const targetDesktopIndex = currentDesktopIndex + 1;
        if (targetDesktopIndex >= Workspace.desktops.length) {
            return;
        }
        this.tailMoveToDesktop(targetDesktopIndex, cm, dm, window, column, oldGrid);
    };

    public readonly tailMoveToPreviousDesktop = (cm: ClientManager, dm: DesktopManager, window: Window, column: Column, oldGrid: Grid) => {
        const currentDesktopIndex = Workspace.desktops.indexOf(oldGrid.desktop.kwinDesktop);
        const targetDesktopIndex = currentDesktopIndex - 1;
        if (targetDesktopIndex < 0) {
            return;
        }
        this.tailMoveToDesktop(targetDesktopIndex, cm, dm, window, column, oldGrid);
    };
}

namespace Actions {
    export type MonitorDirection = "left" | "right" | "up" | "down" | "next" | "previous";

    export interface Config {
        manualScrollStep: number;
        floatingPresetWidths: { getOrdered(size: number): number[] };
        floatingPresetHeights: { getOrdered(size: number): number[] };
        columnWidthStep: number;
        windowHeightStep: number;
        verticalResizeStep: number;
        clampDesktopIndex: (index: number) => number;
        emptyDesktopNextToCurrent: (below: boolean) => number|null;
        releaseNewDesktop: () => void;
        columnWidthChanges: (SizeChange|undefined)[];
        windowHeightChanges: (SizeChange|undefined)[];
    }

    export interface ColumnResizer {
        increaseWidth(column: Column): void;
        decreaseWidth(column: Column): void;
        maximizeWidth(column: Column): void;
        minimizeWidth(column: Column): void;
    }
}
