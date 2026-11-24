namespace ClientState {
    export class Tiled implements State {
        public readonly window: Window;
        private readonly defaultState: Tiled.WindowState;
        private readonly signalManager: SignalManager;
        private readonly relayoutDelayer: Delayer;
        private readonly maximizedDelayer: Delayer;
        private readonly fullScreenDelayer: Delayer;
        private pendingMaximized: MaximizedMode | null = null;
        private readonly userResize: { grid: Grid | null } = { grid: null };
        private readonly fullScreenFrame = { pending: false };
        private static readonly maxExternalFrameGeometryChangedIntervalMs = 1000;

        constructor(world: World, client: ClientWrapper, grid: Grid, placement?: Tiled.Placement) {
            if (client.ownNoBorder === null) {
                client.ownNoBorder = client.kwinClient.noBorder;
            }
            this.defaultState = { skipSwitcher: client.kwinClient.skipSwitcher, noBorder: client.ownNoBorder };
            Tiled.prepareClientForTiling(client, grid.config);

            let column: Column;
            let window: Window;
            if (placement !== undefined && placement.column !== null && grid.hasColumn(placement.column)) {
                column = placement.column;
                const after = placement.after === null ? null : column.getWindows().includes(placement.after) ? placement.after : undefined;
                window = new Window(client, column, after);
            } else if (placement !== undefined) {
                const left = placement.leftColumn !== null && grid.hasColumn(placement.leftColumn) ? placement.leftColumn : placement.leftColumn === null && placement.atStart === true ? null : grid.getLastColumn();
                column = new Column(grid, left);
                window = new Window(client, column);
            } else {
                const previousColumn = grid.getLastFocusedColumn();
                const scrollX = grid.desktop.getScrollX();
                column = new Column(grid, previousColumn ?? grid.getLastColumn());
                window = new Window(client, column);
                grid.onColumnOpened(column, previousColumn, scrollX);
            }

            this.window = window;
            this.relayoutDelayer = new Delayer(Tiled.maxExternalFrameGeometryChangedIntervalMs, () => {
                world.do(() => window.column.grid.desktop.onLayoutChanged());
            });
            // KWin does not take a geometry for a window that is being maximized or restored: the layout reacts when it
            // is done
            this.maximizedDelayer = new Delayer(0, () => {
                const mode = this.pendingMaximized;
                this.pendingMaximized = null;
                if (mode !== null) {
                    world.do(() => { window.onMaximizedChanged(mode); });
                }
            });
            // KWin changes the frame of a window entering or leaving full-screen before it sets the flag: the layout
            // waits for the flag
            this.fullScreenDelayer = new Delayer(0, () => {
                this.fullScreenFrame.pending = false;
                world.do(() => window.onFrameGeometryChanged());
            });
            this.signalManager = Tiled.initSignalManager(world, window, grid.config, this.relayoutDelayer, this.maximizedDelayer, this.fullScreenDelayer, this.fullScreenFrame, this.userResize, mode => { this.pendingMaximized = mode; });
        }

        public destroy(passFocus: FocusPassing.Type) {
            this.signalManager.destroy();
            this.relayoutDelayer.destroy();
            this.maximizedDelayer.destroy();
            this.fullScreenDelayer.destroy();
            this.window.client.userResizeIgnored = false;
            if (this.userResize.grid !== null) {
                this.userResize.grid.onUserResizeFinished();
                this.userResize.grid = null;
            }

            const window = this.window;
            const grid = window.column.grid;
            const client = window.client;
            window.destroy(passFocus);

            Tiled.restoreClientAfterTiling(client, grid.config, this.defaultState, grid.desktop.clientArea);
        }

        private static initSignalManager(world: World, window: Window, config: LayoutConfig, relayoutDelayer: Delayer, maximizedDelayer: Delayer, fullScreenDelayer: Delayer, fullScreenFrame: { pending: boolean }, userResize: { grid: Grid | null }, setPendingMaximized: (mode: MaximizedMode) => void) {
            const client = window.client;
            const kwinClient = client.kwinClient;
            const manager = new SignalManager();

            manager.connect(kwinClient.desktopsChanged, () => {
                world.do((clientManager, desktopManager) => {
                    const desktop = desktopManager.getDesktopForClient(kwinClient, window.column.grid.desktop.outputName);
                    if (desktop === undefined) {
                        // windows on multiple desktops are not supported; the window is tiled again when the desktop settles
                        clientManager.floatClient(client, true);
                        return;
                    }
                    Tiled.moveWindowToGrid(window, desktop.grid);
                });
            });

            manager.connect(kwinClient.activitiesChanged, () => {
                world.do((clientManager, desktopManager) => {
                    const desktop = desktopManager.getDesktopForClient(kwinClient, window.column.grid.desktop.outputName);
                    if (desktop === undefined) {
                        // windows on multiple activities are not supported (see above)
                        clientManager.floatClient(client, true);
                        return;
                    }
                    Tiled.moveWindowToGrid(window, desktop.grid);
                });
            });

            manager.connect(kwinClient.minimizedChanged, () => {
                console.assert(kwinClient.minimized);
                world.do((clientManager, desktopManager) => {
                    clientManager.minimizeClient(kwinClient);
                });
            });

            manager.connect(kwinClient.maximizedAboutToChange, (maximizedMode: MaximizedMode) => {
                setPendingMaximized(maximizedMode);
                maximizedDelayer.run();
            });

            let moving = false;
            let resizing = false;
            let resizeStartWidth = 0;
            let resizeNeighbor: { column: Column, startWidth: number } | undefined;
            let resizeRequest: QmlRect | null = null;
            let resizeStart = { x: 0, y: 0 };
            let resizeStepped = false;
            let lastResizeStart: { time: number, edges: number } | null = null;
            let resizeIgnored = false;
            let dragStart: { x: number, y: number } | null = null;
            let dragLimit = 0;
            let dragHome = { x: 0, y: 0 };
            manager.connect(kwinClient.interactiveMoveResizeStarted, () => {
                if (kwinClient.move) {
                    if (config.untileOnDrag) {
                        // niri: the window stays in the grid until the pointer has travelled 256 px
                        dragStart = { x: Workspace.cursorPos.x, y: Workspace.cursorPos.y };
                        dragHome = { x: kwinClient.frameGeometry.x, y: kwinClient.frameGeometry.y };
                        dragLimit = ClientManager.dragStartDistance;
                        // the other mouse button takes it out of the grid at once, as a floating window
                        world.do((clientManager, desktopManager) => clientManager.setDragPending(client, () => {
                            if (dragStart !== null) {
                                dragStart = null;
                                moving = false;
                                clientManager.setDragPending(client, null);
                                clientManager.floatForDrag(client, true);
                            }
                        }));
                    }
                    moving = true;
                    return;
                }

                if (kwinClient.resize) {
                    // niri's double resize-click: the same edge again within 400 ms toggles the full width or resets the
                    // height
                    const edges = Tiled.resizeEdgesUnderCursor(kwinClient);
                    const now = Date.now();
                    const last = lastResizeStart;
                    lastResizeStart = edges === 0 ? null : { time: now, edges: edges };
                    if (edges !== 0 && last !== null && now - last.time <= Tiled.doubleClickTimeMs) {
                        lastResizeStart = null;
                        const common = edges & last.edges;
                        client.userResizeIgnored = true;
                        resizeIgnored = true;
                        world.doResizeEdgeDoubleClick(window, (common & Tiled.edgesLeftRight) !== 0, (common & Tiled.edgesTopBottom) !== 0);
                        return;
                    }
                    resizing = true;
                    resizeRequest = roundQtRect(kwinClient.frameGeometry);
                    resizeStart = resizeRequest;
                    resizeStepped = false;
                    resizeStartWidth = window.column.getWidth();
                    if (config.resizeNeighborColumn) {
                        const resizeNeighborColumn = Tiled.getResizeNeighborColumn(window);
                        if (resizeNeighborColumn !== null) {
                            resizeNeighbor = {
                                column: resizeNeighborColumn,
                                startWidth: resizeNeighborColumn.getWidth(),
                            };
                        }
                    }
                    userResize.grid = window.column.grid;
                    userResize.grid.onUserResizeStarted();
                }
            });

            // like niri, the neighbours get the geometry the pointer asks for before the client has committed it
            manager.connect(kwinClient.interactiveMoveResizeStepped, (geometry: QmlRect) => {
                if (!resizing || resizeRequest === null) {
                    return;
                }
                resizeStepped = true;
                const requested = roundQtRect(geometry);
                const previous = resizeRequest;
                resizeRequest = requested;
                const leftEdge = requested.x !== resizeStart.x;
                let allowed = requested;
                world.do(() => { allowed = window.column.onUserResizeRequested(window, requested, previous, leftEdge); });
                if (allowed.width !== requested.width || allowed.height !== requested.height) {
                    resizeRequest = allowed;
                    client.setFrame(allowed);
                }
            });

            manager.connect(kwinClient.interactiveMoveResizeFinished, () => {
                if (dragStart !== null) {
                    world.do((clientManager, desktopManager) => clientManager.setDragPending(client, null));
                }
                dragStart = null;
                setVisualPosition(String(kwinClient.internalId), null);
                if (moving) {
                    moving = false;
                    world.do(() => window.column.grid.desktop.onLayoutChanged()); // move the dragged window back to its position
                }
                if (resizeIgnored) {
                    resizeIgnored = false;
                    client.userResizeIgnored = false;
                    world.do(() => window.column.grid.desktop.onLayoutChanged());
                }
                if (resizing) {
                    resizing = false;
                    resizeRequest = null;
                    resizeNeighbor = undefined;
                    (userResize.grid ?? window.column.grid).onUserResizeFinished();
                    userResize.grid = null;
                }
            });

            const externalFrameGeometryChangedRateLimiter = new RateLimiter(4, Tiled.maxExternalFrameGeometryChangedIntervalMs);
            manager.connect(kwinClient.frameGeometryChanged, (oldGeometry: QmlRect) => {
                // on Wayland, this fires after `tileChanged`
                if (kwinClient.tile !== null) {
                    world.do((clientManager, desktopManager) => {
                        clientManager.pinClient(kwinClient);
                    });
                    return;
                }

                if (dragStart !== null) {
                    const dx = Workspace.cursorPos.x - dragStart.x;
                    const dy = Workspace.cursorPos.y - dragStart.y;
                    const squared = dx * dx + dy * dy;
                    if (squared >= dragLimit * dragLimit) {
                        dragStart = null;
                        moving = false;
                        world.do((clientManager, desktopManager) => {
                            clientManager.setDragPending(client, null);
                            clientManager.floatForDrag(client);
                        });
                    } else {
                        // niri's rubber band (limit 0.5, stiffness 1): the effect paints the window at (1 - 1 / (2x +
                        // 1)) / 2 of the travel
                        const x = squared / (dragLimit * dragLimit);
                        const factor = (1 - 1 / (2 * x + 1)) / 2;
                        setVisualPosition(String(kwinClient.internalId), [Math.round(dragHome.x + dx * factor), Math.round(dragHome.y + dy * factor)]);
                    }
                    return;
                }

                const newGeometry = roundQtRect(client.kwinClient.frameGeometry);
                if (rectEquals(oldGeometry, newGeometry)) {
                    // no real changes, nothing to do
                    return;
                }

                const oldCenterX = oldGeometry.x + oldGeometry.width/2;
                const oldCenterY = oldGeometry.y + oldGeometry.height/2;
                const newCenterX = newGeometry.x + newGeometry.width/2;
                const newCenterY = newGeometry.y + newGeometry.height/2;
                const dx = Math.round(newCenterX - oldCenterX);
                const dy = Math.round(newCenterY - oldCenterY);
                if (dx !== 0 || dy !== 0) {
                    // TODO: instead of passing dx and dy, remember relative (to the parent) x and y for each
                    // transient window and use them for `moveTransients` and `ensureTransientsVisible`
                    client.moveTransients(dx, dy);
                }

                if (kwinClient.resize) {
                    if (resizeIgnored) {
                        return;
                    }
                    world.do(() => {
                        if (newGeometry.width !== oldGeometry.width) {
                            window.column.onUserResizeWidth(
                                resizeStartWidth,
                                newGeometry.width - resizeStartWidth,
                                newGeometry.x !== oldGeometry.x,
                                resizeNeighbor,
                            );
                        }
                        if (!resizeStepped && newGeometry.height !== oldGeometry.height) {
                            // like niri: the dragged window gets the height under the pointer, the rest shares what is left
                            const top = newGeometry.y !== oldGeometry.y;
                            if (!(top && window.column.isTopWindow(window))) {
                                window.column.setFixedHeight(window, newGeometry.height, null);
                            }
                        }
                    });
                } else if (window.column.grid.isUserResizing() && !client.isManipulatingGeometry(newGeometry)) {
                    world.do(() => window.column.grid.desktop.onLayoutChanged());
                } else if (client.windowedFullScreen && kwinClient.fullScreen && !window.column.grid.isUserResizing() &&
                    Clients.isFrameFullScreenSize(kwinClient)) {
                    world.do(() => window.column.grid.desktop.onLayoutChanged());
                } else if (
                    !window.column.grid.isUserResizing() &&
                    !client.isManipulatingGeometry(newGeometry) &&
                    client.getMaximizedMode() === MaximizedMode.Unmaximized &&
                    // without a title bar a screen-sized frame looks like full-screen geometry, also right after leaving
                    // full-screen mode
                    // not using `kwinClient.fullScreen` because it may not be set yet at this point
                    (!Clients.isFullScreenGeometry(kwinClient) || (config.hideTitlebars && !kwinClient.fullScreen))
                ) {
                    if (kwinClient.fullScreenable && !client.windowedFullScreen && Clients.isFrameFullScreenSize(kwinClient) !== kwinClient.fullScreen) {
                        fullScreenFrame.pending = true;
                        fullScreenDelayer.run();
                        return;
                    }
                    const moved = kwinClient.move ? null : client.getMovedByKwinFrom(newGeometry, oldGeometry);
                    if (moved !== null) {
                        // the position is not Kiri's: put the window back
                        if (Clients.isOnVirtualDesktop(kwinClient, Workspace.currentDesktop)) {
                            client.place(moved.rect.x, moved.rect.y, moved.rect.width, moved.rect.height);
                        } else {
                            window.column.grid.desktop.onLayoutChanged();
                            return;
                        }
                    }
                    if (moved !== null && moved.onlyMoved) {
                        return;
                    }
                    if (client.takeLearnedHeight()) {
                        world.do(() => {
                            window.onFrameGeometryChanged();
                            window.column.resizeWindows();
                        });
                    } else if (externalFrameGeometryChangedRateLimiter.acquire()) {
                        world.do(() => window.onFrameGeometryChanged());
                    } else {
                        relayoutDelayer.run();
                    }
                }
            });

            manager.connect(kwinClient.fullScreenChanged, () => {
                if (fullScreenFrame.pending) {
                    fullScreenFrame.pending = false;
                    fullScreenDelayer.stop();
                    if (!kwinClient.fullScreen) {
                        world.do(() => window.onLeftFullScreenFrame());
                    }
                }
                world.do((clientManager, desktopManager) => {
                    // some clients only turn out to be untileable after exiting full-screen mode
                    if (!Clients.canTileEver(kwinClient)) {
                        clientManager.floatClient(client);
                        return;
                    }

                    window.onFullScreenChanged(kwinClient.fullScreen);
                    if (config.hideTitlebars && !kwinClient.fullScreen) {
                        client.setNoBorder(true);
                    }
                });
            });

            manager.connect(kwinClient.tileChanged, () => {
                // on X11, this fires after `frameGeometryChanged`
                if (kwinClient.tile !== null) {
                    world.do((clientManager, desktopManager) => {
                        clientManager.pinClient(kwinClient);
                    });
                }
            });

            return manager;
        }

        private static readonly doubleClickTimeMs = 400;
        private static readonly edgesLeftRight = 3;
        private static readonly edgesTopBottom = 12;

        // niri's resize_edges_under: the pointer's third of the window says the edges (1 left, 2 right, 4 top, 8 bottom)
        private static resizeEdgesUnderCursor(kwinClient: KwinClient) {
            const frame = kwinClient.frameGeometry;
            const x = Workspace.cursorPos.x - frame.x;
            const y = Workspace.cursorPos.y - frame.y;
            let edges = 0;
            if (x < frame.width / 3) {
                edges |= 1;
            } else if (2 * frame.width / 3 < x) {
                edges |= 2;
            }
            if (y < frame.height / 3) {
                edges |= 4;
            } else if (2 * frame.height / 3 < y) {
                edges |= 8;
            }
            return edges;
        }

        private static getResizeNeighborColumn(window: Window) {
            const eps = 20; // Detect edge near the edge as well
            const kwinClient = window.client.kwinClient;
            const column = window.column;
            if (Workspace.cursorPos.x > rectRightRound(kwinClient.clientGeometry) - eps) {
                return column.grid.getRightColumn(column);
            } else if (Workspace.cursorPos.x < kwinClient.clientGeometry.x.round() + eps) {
                return column.grid.getLeftColumn(column);
            } else {
                return null;
            }
        }

        private static moveWindowToGrid(window: Window, grid: Grid) {
            if (grid === window.column.grid) {
                // window already on the given grid
                return;
            }

            const newColumn = new Column(grid, grid.getLastFocusedColumn() ?? grid.getLastColumn());
            const passFocus = window.isFocused() ? FocusPassing.Type.OnUnfocus : FocusPassing.Type.None;
            window.moveToColumn(newColumn, true, passFocus);
        }

        private static prepareClientForTiling(client: ClientWrapper, config: LayoutConfig) {
            if (config.skipSwitcher) {
                client.kwinClient.skipSwitcher = true;
            }
            if (config.hideTitlebars) {
                client.setNoBorder(true);
            }

            if (client.kwinClient.fullScreen && !config.tileFullScreen) {
                if (config.maximizedKeepAbove) {
                    client.kwinClient.keepAbove = true;
                }
            } else {
                if (config.tiledKeepBelow) {
                    client.kwinClient.keepBelow = true;
                }
                client.kwinClient.keepAbove = false;
            }

            if (client.kwinClient.tile !== null) {
                client.setMaximize(false, true); // disable quick tile mode
            }
            client.setMaximize(false, false);
        }

        private static restoreClientAfterTiling(client: ClientWrapper, config: LayoutConfig, defaultState: Tiled.WindowState, screenSize: QmlRect) {
            if (config.skipSwitcher) {
                client.kwinClient.skipSwitcher = defaultState.skipSwitcher;
            }
            if (config.tiledKeepBelow) {
                client.kwinClient.keepBelow = false;
            }
            if (config.offScreenOpacity < 1.0) {
                client.setBaseOpacity(1.0);
            }
            client.setFullScreen(false);
            if (config.hideTitlebars && !client.keepTitlebarHidden) {
                client.setNoBorder(defaultState.noBorder);
                client.ownNoBorder = null;
            }
            if (client.kwinClient.tile === null) {
                client.setMaximize(false, false);
            }
            if (!client.keepTitlebarHidden) {
                client.ensureVisible(screenSize);
            }
        }
    }

    export namespace Tiled {
        export interface Placement {
            column: Column|null;
            after: Window|null;
            leftColumn: Column|null;
            atStart?: boolean;
        }

        export interface WindowState {
            skipSwitcher: boolean;
            noBorder: boolean;
        }
    }
}
