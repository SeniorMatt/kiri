class Window {
    public column: Column;
    public readonly client: ClientWrapper;
    public height: number; // the height the column gave the window in its last layout
    // niri's window heights: auto windows share the free space of the column by weight, a window that was resized
    // by hand or with the presets has a fixed height (set-window-height, switch-preset-window-height)
    public heightWeight = 1;
    public fixedHeight: number|null = null;
    public presetHeightIndex: number|null = null;
    public readonly focusedState: Window.State;
    private skipArrange: boolean;

    constructor(client: ClientWrapper, column: Column, after?: Window|null) {
        this.client = client;
        this.height = client.kwinClient.frameGeometry.height.round();

        let maximizedMode = this.client.getMaximizedMode();
        if (maximizedMode === undefined) {
            maximizedMode = MaximizedMode.Unmaximized; // defaulting to unmaximized, as this is set in Tiled.prepareClientForTiling
        }
        this.focusedState = {
            fullScreen: this.client.kwinClient.fullScreen,
            maximizedMode: maximizedMode,
        };

        this.column = column;
        this.skipArrange = this.isMaximizedOutsideGrid();
        this.updateLayering();
        column.onWindowAdded(this, true, after);
    }

    // `after` puts the window right below that window of the target column (null: at the top); without it, `bottom` decides
    public moveToColumn(targetColumn: Column, bottom: boolean, passFocus: FocusPassing.Type, after?: Window|null) {
        if (targetColumn === this.column) {
            return;
        }
        this.column.onWindowRemoved(this, passFocus);
        this.column = targetColumn;
        targetColumn.onWindowAdded(this, bottom, after);
    }

    public setAutoHeight(weight = 1) {
        this.heightWeight = weight;
        this.fixedHeight = null;
        this.presetHeightIndex = null;
    }

    public arrange(x: number, y: number, width: number, height: number) {
        if (this.skipArrange) {
            // window is maximized or full-screen outside of the grid, prevent fighting with the user
            return;
        }
        if (this.client.isFightingLayout()) {
            return; // a game that answers every move with a new full-screen or maximize request stays where it is
        }

        if (this.isFocused() && this.shouldReMaximize()) {
            // do this here rather than in `onFocused` to ensure it happens after placement
            // (otherwise placement may not happen at all)
            this.reMaximize();
            return;
        }

        if (this.fillsWidth() || this.fillsHeight()) {
            const fillArea = this.getFillArea();
            if (this.fillsWidth()) {
                const [overflowLeft, overflowRight] = this.getOverflow();
                x -= overflowLeft;
                width += overflowLeft + overflowRight;
            }
            if (this.fillsHeight()) {
                y = fillArea.y;
                height = fillArea.height;
            }
        }
        this.client.place(x, y, width, height, this.column.grid.isUserResizing());
    }

    private shouldReMaximize() {
        const config = this.column.grid.config;
        return config.reMaximize && (
            (!config.tileMaximized && this.focusedState.maximizedMode !== MaximizedMode.Unmaximized) ||
            (!config.tileFullScreen && this.focusedState.fullScreen)
        );
    }

    private reMaximize() {
        const config = this.column.grid.config;
        if (!config.tileMaximized && this.focusedState.maximizedMode !== MaximizedMode.Unmaximized) {
            this.client.setMaximize(
                this.focusedState.maximizedMode === MaximizedMode.Horizontally || this.focusedState.maximizedMode === MaximizedMode.Maximized,
                this.focusedState.maximizedMode === MaximizedMode.Vertically || this.focusedState.maximizedMode === MaximizedMode.Maximized,
            );
        }
        if (!config.tileFullScreen && this.focusedState.fullScreen) {
            this.client.setFullScreen(true);
        }
    }

    public focus() {
        this.client.focus();
        const kwinClient = this.client.kwinClient;
        if (!this.isFocused()) {
            // in some situations focus assignment just doesn't work, let's do it later
            this.column.grid.focusPasser.request(kwinClient);
        }
    }

    public isFocused() {
        return this.client.isFocused();
    }

    public onFocused() {
        this.updateLayering();
        if (this.shouldReMaximize()) {
            // We need to maximize/fullscreen this window, but we can't do it here.
            // We need to do it in `arrange` to ensure it happens after placement.
            this.column.grid.desktop.forceArrange();
        }
        this.column.onWindowFocused(this);
    }

    public raise() {
        this.client.raise();
    }

    public restoreToTiled() {
        if (this.isFocused()) {
            return;
        }
        const config = this.column.grid.config;
        if (!config.tileFullScreen) {
            this.client.setFullScreen(false);
        }
        if (!config.tileMaximized) {
            this.client.setMaximize(false, false);
        }
        this.updateLayering();
    }

    public onMaximizedChanged(maximizedMode: MaximizedMode) {
        if (this.isFocused()) {
            this.focusedState.maximizedMode = maximizedMode;
        }
        this.onMaximizedOrFullScreenChanged();
    }

    public onFullScreenChanged(fullScreen: boolean) {
        if (this.isFocused()) {
            this.focusedState.fullScreen = fullScreen;
        }
        this.onMaximizedOrFullScreenChanged();
    }

    private onMaximizedOrFullScreenChanged() {
        const scrollBefore = this.column.grid.desktop.getScrollX();
        this.skipArrange = this.isMaximizedOutsideGrid();
        this.updateLayering();
        if ((this.fillsWidth() || this.fillsHeight()) && this.column.getWindowCount() > 1 && !this.column.isTabbed()) {
            // a maximized or full-screen window gets a column of its own (a tabbed column keeps its tabs, like niri)
            const newColumn = new Column(this.column.grid, this.column);
            this.moveToColumn(newColumn, true, FocusPassing.Type.None);
        }
        const backToNormal = this.column.updateSizingMode(scrollBefore); // niri: remember the view when going full-screen
        this.column.grid.onColumnWidthChanged(this.column);
        this.column.grid.desktop.onLayoutChanged();
        if (backToNormal) {
            this.column.grid.onColumnSizingBecameNormal(this.column); // niri: ... and restore it when leaving full-screen
        }
    }

    private updateLayering() {
        const config = this.column.grid.config;
        const outsideGrid = this.isMaximizedOutsideGrid();
        if (config.tiledKeepBelow) {
            // a focused full-screen window must not be kept below, otherwise it doesn't cover panels
            this.client.kwinClient.keepBelow = !outsideGrid && !(this.isFullScreenInGrid() && this.isFocused());
        }
        if (config.maximizedKeepAbove) {
            this.client.kwinClient.keepAbove = outsideGrid;
        }
    }

    private getMaximizedMode() {
        return this.client.getMaximizedMode() ?? MaximizedMode.Unmaximized;
    }

    private isFullScreenInGrid() {
        return this.column.grid.config.tileFullScreen && this.client.kwinClient.fullScreen;
    }

    private getMaximizedModeInGrid() {
        return this.column.grid.config.tileMaximized ? this.getMaximizedMode() : MaximizedMode.Unmaximized;
    }

    // maximized or full-screen windows that are not kept in the grid are left to KWin
    private isMaximizedOutsideGrid() {
        const config = this.column.grid.config;
        return (!config.tileFullScreen && this.client.kwinClient.fullScreen) ||
            (!config.tileMaximized && this.getMaximizedMode() !== MaximizedMode.Unmaximized);
    }

    public fillsWidth() {
        const maximizedMode = this.getMaximizedModeInGrid();
        return this.isFullScreenInGrid() || maximizedMode === MaximizedMode.Horizontally || maximizedMode === MaximizedMode.Maximized;
    }

    public fillsHeight() {
        const maximizedMode = this.getMaximizedModeInGrid();
        return this.isFullScreenInGrid() || maximizedMode === MaximizedMode.Vertically || maximizedMode === MaximizedMode.Maximized;
    }

    // the area a maximized or full-screen window fills, instead of the tiling area
    private getFillArea() {
        const desktop = this.column.grid.desktop;
        return this.isFullScreenInGrid() ? desktop.fullScreenArea : desktop.clientArea;
    }

    // returns how far the window reaches past the left and right edges of its column
    public getOverflow(): [number, number] {
        if (!this.fillsWidth()) {
            return [0, 0];
        }
        const fillArea = this.getFillArea();
        const tilingArea = this.column.grid.desktop.tilingArea;
        return [
            Math.max(0, tilingArea.x - fillArea.x),
            Math.max(0, rectRight(fillArea) - rectRight(tilingArea)),
        ];
    }

    public onFrameGeometryChanged() {
        const newGeometry = this.client.kwinClient.frameGeometry;
        // while outputs come and go KWin squeezes windows into whatever screen is left; their widths are not wanted and
        // must not replace the column's proportion, which brings the width back with the screen
        if (!Clients.isFrameFullScreenSize(this.client.kwinClient) && !this.column.grid.desktop.isScreenSettling()) {
            this.column.setWidth(newGeometry.width.round(), true, true); // the preset stays: clients may snap to a slightly different size
        }
        this.column.grid.desktop.onLayoutChanged();
    }

    public destroy(passFocus: FocusPassing.Type) {
        this.column.onWindowRemoved(this, passFocus);
    }
}

namespace Window {
    export interface State {
        fullScreen: boolean;
        maximizedMode: MaximizedMode;
    }
}
