namespace ClientState {
    export class Floating implements State {
        private readonly client: ClientWrapper;
        private readonly config: ClientManager.Config;
        private readonly signalManager: SignalManager;

        constructor(world: World, client: ClientWrapper, config: ClientManager.Config, limitHeight: boolean, tileAfterFullScreen = false) {
            this.client = client;
            this.config = config;
            if (config.floatingKeepAbove) {
                client.kwinClient.keepAbove = true;
            }
            if (limitHeight && client.kwinClient.tile === null) {
                Floating.limitHeight(client);
            }
            this.signalManager = Floating.initSignalManager(world, client.kwinClient, tileAfterFullScreen);
        }

        public destroy(passFocus: FocusPassing.Type) {
            this.signalManager.destroy();
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

        private static initSignalManager(world: World, kwinClient: KwinClient, tileAfterFullScreen: boolean) {
            const manager = new SignalManager();

            if (tileAfterFullScreen) {
                // untileable only because it started full-screen (games): tile it when it leaves full-screen mode
                manager.connect(kwinClient.fullScreenChanged, () => {
                    if (!kwinClient.fullScreen) {
                        world.do((clientManager, desktopManager) => {
                            clientManager.tileClientIfPossible(kwinClient);
                        });
                    }
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
