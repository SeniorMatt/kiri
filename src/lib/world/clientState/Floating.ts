namespace ClientState {
    export class Floating implements State {
        private readonly client: ClientWrapper;
        private readonly config: ClientManager.Config;
        private readonly signalManager: SignalManager;
        private readonly recoverDelayer: Delayer | null = null;

        constructor(world: World, client: ClientWrapper, config: ClientManager.Config, limitHeight: boolean, tileAfterFullScreen = false, recoverTiling = false) {
            this.client = client;
            this.config = config;
            if (config.floatingKeepAbove) {
                client.kwinClient.keepAbove = true;
            }
            if (limitHeight && client.kwinClient.tile === null) {
                Floating.limitHeight(client);
            }
            const kwinClient = client.kwinClient;
            if (recoverTiling) {
                // debounced: a window that is on two desktops for a moment (Pager drag) or on none (lock, sleep)
                this.recoverDelayer = new Delayer(1000, () => {
                    world.do((clientManager, desktopManager) => clientManager.tileClientIfPossible(kwinClient));
                });
            }
            this.signalManager = Floating.initSignalManager(world, kwinClient, tileAfterFullScreen, this.recoverDelayer);
        }

        public destroy(passFocus: FocusPassing.Type) {
            this.signalManager.destroy();
            this.recoverDelayer?.destroy();
        }

        // TODO: move to `Tiled.restoreClientAfterTiling`
        private static limitHeight(client: ClientWrapper) {
            const placementArea = Workspace.clientArea(
                ClientAreaOption.PlacementArea,
                client.kwinClient.output,
                Clients.getKwinDesktopApprox(client.kwinClient),
            );
            const clientRect = client.kwinClient.frameGeometry;
            const width = client.preferredWidth;
            client.place(
                clientRect.x.round(),
                clientRect.y.round(),
                width,
                Math.min(clientRect.height.round(), Math.round(placementArea.height / 2)),
            );
        }

        private static initSignalManager(world: World, kwinClient: KwinClient, tileAfterFullScreen: boolean, recoverDelayer: Delayer | null) {
            const manager = new SignalManager();

            if (recoverDelayer !== null) {
                manager.connect(kwinClient.desktopsChanged, () => recoverDelayer.run());
                manager.connect(kwinClient.activitiesChanged, () => recoverDelayer.run());
            }

            if (tileAfterFullScreen) {
                // floating only because Kiri could not tile it when it appeared (games that are not resizable
                // until they go full-screen, or leave it): try again whenever full-screen mode changes
                manager.connect(kwinClient.fullScreenChanged, () => {
                    world.do((clientManager, desktopManager) => {
                        clientManager.tileClientIfPossible(kwinClient);
                    });
                });
            }

            manager.connect(kwinClient.tileChanged, () => {
                // on X11, this fires after `frameGeometryChanged`
                if (kwinClient.tile !== null) {
                    world.do((clientManager, desktopManager) => {
                        clientManager.pinClient(kwinClient);
                    });
                }
            });

            manager.connect(kwinClient.frameGeometryChanged, () => {
                // on Wayland, this fires after `tileChanged`
                if (kwinClient.tile !== null) {
                    world.do((clientManager, desktopManager) => {
                        clientManager.pinClient(kwinClient);
                    });
                }
            });

            return manager;
        }
    }
}
