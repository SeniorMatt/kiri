namespace ClientState {
    export class TiledMinimized implements State {
        private readonly signalManager: SignalManager;

        constructor(world: World, client: ClientWrapper, slot: { grid: Grid, placement: Tiled.Placement } | null = null) {
            this.signalManager = TiledMinimized.initSignalManager(world, client, slot);
        }

        public destroy(passFocus: FocusPassing.Type) {
            this.signalManager.destroy();
        }

        private static initSignalManager(world: World, client: ClientWrapper, slot: { grid: Grid, placement: Tiled.Placement } | null) {
            const manager = new SignalManager();

            manager.connect(client.kwinClient.minimizedChanged, () => {
                console.assert(!client.kwinClient.minimized);
                world.do((clientManager, desktopManager) => {
                    const desktop = desktopManager.getDesktopForClient(client.kwinClient, slot?.grid.desktop.outputName);
                    if (desktop !== undefined) {
                        clientManager.tileClient(client, desktop.grid, slot !== null && slot.grid === desktop.grid ? slot.placement : undefined);
                    } else {
                        clientManager.floatClient(client);
                    }
                });
            });

            return manager;
        }
    }
}
