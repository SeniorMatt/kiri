class Window {
    public column: Column;
    public readonly client: ClientWrapper;
    public height: number;
    // niri's window heights: auto windows share the free space by weight, a resized one has a fixed height
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

    public arrange(x: number, y: number, width: number, height: number, parked = false) {
        const id = String(this.client.kwinClient.internalId);
        if (this.skipArrange) {
            setWindowOutput(id, null);
            return;
        }
        setWindowOutput(id, Workspace.screens.length > 1 ? this.column.grid.desktop.outputName : null);

        if (this.isFocused() && this.shouldReMaximize()) {
            // do this here rather than in `onFocused` to ensure it happens after placement
            // (otherwise placement may not happen at all)
            this.reMaximize();
            return;
        }

        const fillsWidth = this.fillsWidth();
        const fillsHeight = this.fillsHeight();
        if (!fillsWidth && !fillsHeight) {
            this.client.hadSlot = true;
        } else {
            const fillArea = this.getFillArea();
            if (fillsWidth) {
                if (this.isFocused() && this.isColumnInView(x, width) && !this.column.grid.desktop.isGestureScrolling() && !this.column.grid.isUserResizing()) {
                    x = fillArea.x;
                    width = fillArea.width;
                } else {
                    const [overflowLeft, overflowRight] = this.getOverflow();
                    x -= overflowLeft;
                    width += overflowLeft + overflowRight;
                }
            }
            if (fillsHeight) {
                y = fillArea.y;
                height = fillArea.height;
            }
        }
        // a window that cannot be as big as its slot keeps the slot's top-left corner, like niri's tile
        const maxWidth = this.client.getMaxWidth();
        const maxHeight = this.client.getMaxHeight();
        if (!fillsWidth && maxWidth > 0) {
            width = Math.min(width, maxWidth);
        }
        if (!fillsHeight && maxHeight > 0) {
            height = Math.min(height, maxHeight);
        }
        if (parked) {
            y += this.column.grid.desktop.getParkOffset() ?? 0;
        }
        this.client.place(x, y, width, height, this.column.grid.isUserResizing());
    }

    private isColumnInView(x: number, width: number) {
        const tilingArea = this.column.grid.desktop.tilingArea;
        return x < rectRight(tilingArea) && x + width > tilingArea.x;
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
        const wasOutsideGrid = this.isMaximizedOutsideGrid();
        if (!config.tileFullScreen) {
            if (!this.client.windowedFullScreen) {
                this.client.setFullScreen(false);
            }
        }
        if (!config.tileMaximized) {
            this.client.setMaximize(false, false);
        }
        this.updateLayering();
        if (wasOutsideGrid) {
            this.column.grid.desktop.onLayoutChanged();
        }
    }

    public onMaximizedChanged(maximizedMode: MaximizedMode) {
        if (this.isFocused()) {
            this.focusedState.maximizedMode = maximizedMode;
        }
        this.onMaximizedOrFullScreenChanged();
    }

    public toggleWindowedFullScreen() {
        const client = this.client;
        const kwinClient = client.kwinClient;
        if (!kwinClient.fullScreenable) {
            return;
        }
        if (client.windowedFullScreen && kwinClient.fullScreen) {
            client.windowedFullScreen = false;
            kwinClient.fullScreen = false;
        } else {
            client.windowedFullScreen = true;
            if (kwinClient.fullScreen) {
                this.onFullScreenChanged(true);
            } else {
                kwinClient.fullScreen = true;
            }
        }
    }

    public makeFullScreenReal() {
        if (this.client.windowedFullScreen) {
            this.client.windowedFullScreen = false;
            this.onFullScreenChanged(this.client.kwinClient.fullScreen);
        }
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
            const newColumn = new Column(this.column.grid, this.column);
            this.moveToColumn(newColumn, true, FocusPassing.Type.None);
        }
        const backToNormal = this.column.updateSizingMode(scrollBefore);
        this.column.grid.onColumnWidthChanged(this.column);
        this.column.grid.desktop.onLayoutChanged();
        if (backToNormal) {
            this.column.grid.onColumnSizingBecameNormal(this.column);
        }
    }

    private updateLayering() {
        const config = this.column.grid.config;
        const outsideGrid = this.isMaximizedOutsideGrid();
        if (config.tiledKeepBelow) {
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
        return this.column.grid.config.tileFullScreen && this.client.kwinClient.fullScreen && !this.client.windowedFullScreen;
    }

    private getMaximizedModeInGrid() {
        return this.column.grid.config.tileMaximized ? this.getMaximizedMode() : MaximizedMode.Unmaximized;
    }

    private isMaximizedOutsideGrid() {
        const config = this.column.grid.config;
        return (!config.tileFullScreen && this.client.kwinClient.fullScreen && !this.client.windowedFullScreen) ||
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

    // a maximized or full-screen window fills its area, like niri's full-screen tile, not the slot
    public getFilledRect(x: number, y: number, width: number, height: number): number[] {
        if (this.fillsWidth()) {
            const [overflowLeft, overflowRight] = this.getOverflow();
            x -= overflowLeft;
            width += overflowLeft + overflowRight;
        }
        if (this.fillsHeight()) {
            const fillArea = this.getFillArea();
            y = fillArea.y;
            height = fillArea.height;
        }
        return [x, y, width, height];
    }

    private getFillArea() {
        const desktop = this.column.grid.desktop;
        return this.isFullScreenInGrid() ? desktop.fullScreenArea : desktop.clientArea;
    }

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
        this.adoptFrameWidth();
        this.column.grid.desktop.onLayoutChanged();
    }

    private adoptFrameWidth() {
        const newGeometry = this.client.kwinClient.frameGeometry;
        // while outputs come and go KWin squeezes windows into the screen that is left; those widths must not replace
        // the column's
        if (!Clients.isFrameFullScreenSize(this.client.kwinClient) && !this.column.grid.desktop.isScreenSettling()) {
            this.column.setWidth(newGeometry.width.round(), true, true);
        }
    }

    // a window left full-screen: a column that had its slot keeps its width, one that arrived full-screen takes the size
    // KWin restores
    public onLeftFullScreenFrame() {
        if (!this.client.hadSlot) {
            this.adoptFrameWidth();
        }
    }

    public destroy(passFocus: FocusPassing.Type) {
        setWindowOutput(String(this.client.kwinClient.internalId), null);
        this.column.onWindowRemoved(this, passFocus);
    }
}

namespace Window {
    export interface State {
        fullScreen: boolean;
        maximizedMode: MaximizedMode;
    }
}
