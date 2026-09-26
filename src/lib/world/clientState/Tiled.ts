namespace ClientState {
    export class Tiled implements State {
        public readonly window: Window;
        private readonly defaultState: Tiled.WindowState;
        private readonly signalManager: SignalManager;
        private readonly relayoutDelayer: Delayer;
        private static readonly maxExternalFrameGeometryChangedIntervalMs = 1000;

        // `placement` puts the window where a window that was just closed and mapped again was
        constructor(world: World, client: ClientWrapper, grid: Grid, placement?: Tiled.Placement) {
            if (client.ownNoBorder === null) {
                client.ownNoBorder = client.kwinClient.noBorder; // kept while a drag takes the window out of the grid and back
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
            // one relayout after a burst of external geometry changes that was rate limited
            this.relayoutDelayer = new Delayer(Tiled.maxExternalFrameGeometryChangedIntervalMs, () => {
                world.do(() => window.column.grid.desktop.onLayoutChanged());
            });
            this.signalManager = Tiled.initSignalManager(world, window, grid.config, this.relayoutDelayer);
        }

        public destroy(passFocus: FocusPassing.Type) {
            this.signalManager.destroy();
            this.relayoutDelayer.destroy();

            const window = this.window;
            const grid = window.column.grid;
            const client = window.client;
            window.destroy(passFocus);

            Tiled.restoreClientAfterTiling(client, grid.config, this.defaultState, grid.desktop.clientArea);
        }

        private static initSignalManager(world: World, window: Window, config: LayoutConfig, relayoutDelayer: Delayer) {
            const client = window.client;
            const kwinClient = client.kwinClient;
            const manager = new SignalManager();

            manager.connect(kwinClient.desktopsChanged, () => {
                world.do((clientManager, desktopManager) => {
                    const desktop = desktopManager.getDesktopForClient(kwinClient);
                    if (desktop === undefined) {
                        // windows on multiple desktops are not supported; it may only be a transient state (lock,
                        // sleep, the Pager), so the window is tiled again when the desktop settles
                        clientManager.floatClient(client, true);
                        return;
                    }
                    Tiled.moveWindowToGrid(window, desktop.grid);
                });
            });

            manager.connect(kwinClient.activitiesChanged, () => {
                world.do((clientManager, desktopManager) => {
                    const desktop = desktopManager.getDesktopForClient(kwinClient);
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
                world.do(() => {
                    window.onMaximizedChanged(maximizedMode);
                });
            });

            let moving = false;
            let resizing = false;
            let resizeStartWidth = 0;
            let resizeNeighbor: { column: Column, startWidth: number } | undefined;
            let resizeRequest: QmlRect | null = null; // the geometry the pointer asked for at the last step
            let resizeStepped = false; // KWin reports the pointer's steps; the committed geometry is then only used for the width
            let dragStart: { x: number, y: number } | null = null;
            let dragLimit = 0;
            let dragHome = { x: 0, y: 0 };
            manager.connect(kwinClient.interactiveMoveResizeStarted, () => {
                if (kwinClient.move) {
                    if (config.untileOnDrag) {
                        // niri: the window stays in the grid until the pointer has travelled 256 px, then it follows the pointer
                        dragStart = { x: Workspace.cursorPos.x, y: Workspace.cursorPos.y };
                        dragHome = { x: kwinClient.frameGeometry.x, y: kwinClient.frameGeometry.y };
                        dragLimit = ClientManager.dragStartDistance;
                    }
                    moving = true;
                    return;
                }

                if (kwinClient.resize) {
                    resizing = true;
                    resizeRequest = roundQtRect(kwinClient.frameGeometry);
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
                    window.column.grid.onUserResizeStarted();
                }
            });

            // niri sends the new sizes of all the windows of a column together, as soon as the pointer moves. KWin only
            // tells about the resized window's new size when its client has committed it, which is later, and the
            // neighbours would then start only from there. The step has the geometry the pointer asks for.
            manager.connect(kwinClient.interactiveMoveResizeStepped, (geometry: QmlRect) => {
                if (!resizing || resizeRequest === null) {
                    return;
                }
                resizeStepped = true;
                const requested = roundQtRect(geometry);
                const previous = resizeRequest;
                resizeRequest = requested;
                world.do(() => window.column.onUserResizeRequested(window, requested, previous));
            });

            manager.connect(kwinClient.interactiveMoveResizeFinished, () => {
                dragStart = null;
                setVisualPosition(String(kwinClient.internalId), null);
                if (moving) {
                    moving = false;
                    world.do(() => window.column.grid.desktop.onLayoutChanged()); // move the dragged window back to its position
                }
                if (resizing) {
                    resizing = false;
                    resizeRequest = null;
                    resizeNeighbor = undefined;
                    window.column.grid.onUserResizeFinished();
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
                            clientManager.floatForDrag(client);
                        });
                    } else {
                        // niri's rubber band (limit 0.5, stiffness 1): KWin moves the window with the pointer, the effect
                        // paints it at (1 - 1 / (2x + 1)) / 2 of the travel, x = squared distance / threshold squared
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
                            // like niri: the dragged window gets the height under the pointer and the rest of
                            // the column shares what is left; the top edge of the first window does nothing
                            const top = newGeometry.y !== oldGeometry.y;
                            if (!(top && window.column.isTopWindow(window))) {
                                window.column.setFixedHeight(window, newGeometry.height, null);
                            }
                        }
                    });
                } else if (window.column.grid.isUserResizing() && !client.isManipulatingGeometry(newGeometry)) {
                    // this window has committed a size it was sent while another one is being resized: it may have a newer one waiting
                    world.do(() => window.column.grid.desktop.onLayoutChanged());
                } else if (
                    !window.column.grid.isUserResizing() &&
                    !client.isManipulatingGeometry(newGeometry) &&
                    client.getMaximizedMode() === MaximizedMode.Unmaximized &&
                    // Without a title bar the client area is the whole frame, so a screen-sized frame looks like full-screen
                    // geometry even when the window has just left full-screen mode (KWin can still restore a screen-sized
                    // frame then); KWin sets the full-screen flag before the frame of a window that enters it.
                    (!Clients.isFullScreenGeometry(kwinClient) || (config.hideTitlebars && !kwinClient.fullScreen)) // not using `kwinClient.fullScreen` because it may not be set yet at this point
                ) {
                    const placed = kwinClient.move ? null : client.getMovedByKwinFrom(newGeometry);
                    if (placed !== null) {
                        // only the position changed, to a place that is not Kiri's: put the window back, the rest of the
                        // layout is fine (and the rate limit below must not leave the other windows of the burst misplaced)
                        if (Clients.isOnVirtualDesktop(kwinClient, Workspace.currentDesktop)) {
                            client.place(placed.x, placed.y, placed.width, placed.height);
                        } else {
                            // not shown now (KWin does this to the desktop it leaves): the next arrange puts it back
                            window.column.grid.desktop.onLayoutChanged();
                        }
                    } else if (externalFrameGeometryChangedRateLimiter.acquire()) {
                        world.do(() => window.onFrameGeometryChanged());
                    } else {
                        relayoutDelayer.run();
                    }
                }
            });

            manager.connect(kwinClient.fullScreenChanged, () => {
                world.do((clientManager, desktopManager) => {
                    // some clients only turn out to be untileable after exiting full-screen mode
                    if (!Clients.canTileEver(kwinClient)) {
                        clientManager.floatClient(client);
                        return;
                    }

                    window.onFullScreenChanged(kwinClient.fullScreen);
                    // KWin brings the title bar back when a window leaves full-screen mode
                    if (config.hideTitlebars && !kwinClient.fullScreen) {
                        client.setNoBorder(true);
                    }
                });
                // The pass above has placed the window at its slot. Leaving full-screen mode can leave the pointer
                // over a neighbour or in a gap, where focus-follows-mouse takes the focus away at the next pointer
                // movement; the pointer goes with the window.
                if (!kwinClient.fullScreen && Workspace.activeWindow === kwinClient &&
                    !rectContainsPoint(roundQtRect(kwinClient.frameGeometry), Workspace.cursorPos)) {
                    moveCursorToFocus.call();
                }
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
                client.kwinClient.opacity = 1.0;
            }
            client.setFullScreen(false);
            if (config.hideTitlebars && !client.keepTitlebarHidden) {
                client.setNoBorder(defaultState.noBorder);
                client.ownNoBorder = null;
            }
            if (client.kwinClient.tile === null) {
                client.setMaximize(false, false);
            }
            client.ensureVisible(screenSize);
        }
    }

    export namespace Tiled {
        export interface Placement {
            column: Column|null; // the column the window was in, if it still exists and the window was not alone in it
            after: Window|null; // the window above it in that column
            leftColumn: Column|null; // otherwise: the column to the left of where its own column was
            atStart?: boolean; // there was none: its own column was the first one
        }

        export interface WindowState {
            skipSwitcher: boolean;
            noBorder: boolean;
        }
    }
}
