function loadConfig(): Config {
    const config: any = {};
    for (const entry of configDef) {
        config[entry.name] = KWin.readConfig(entry.name, entry.default);
    }
    config.shortcutKeys = readShortcutKeys(name => KWin.readConfig(name, ""));
    return config;
}

function setRingConfig(config: Config) {
    if (typeof qmlBase === "undefined") {
        return; // tests
    }
    (qmlBase as any).ringConfig = {
        focusRingEnabled: config.focusRingEnabled,
        focusRingWidth: config.focusRingWidth,
        focusRingActiveColor: config.focusRingActiveColor,
        focusRingInactiveColor: config.focusRingInactiveColor,
        borderEnabled: config.borderEnabled,
        borderWidth: config.borderWidth,
        borderActiveColor: config.borderActiveColor,
        borderInactiveColor: config.borderInactiveColor,
        tabIndicatorEnabled: config.tabIndicatorEnabled,
        tabIndicatorHideWhenSingleTab: config.tabIndicatorHideWhenSingleTab,
        tabIndicatorActiveColor: config.focusRingActiveColor,
        tabIndicatorInactiveColor: config.focusRingInactiveColor,
    };
}

// geometry of the current desktop's tab indicators, drawn by main.qml
interface TabIndicator {
    x: number;
    y: number;
    width: number;
    height: number;
    vertical: boolean;
    count: number;
    active: number;
}

let lastTabIndicatorsJson = "[]";

function publishTabIndicators(indicators: TabIndicator[]) {
    if (typeof qmlBase === "undefined") {
        return; // tests
    }
    const json = JSON.stringify(indicators);
    if (json !== lastTabIndicatorsJson) {
        lastTabIndicatorsJson = json;
        (qmlBase as any).tabIndicators = indicators;
    }
}

// Owns the World and rebuilds it when the settings change
class Kiri {
    private world: World;
    private configJson: string;

    constructor(private config: Config, world = new World(config)) {
        setRingConfig(config);
        this.configJson = JSON.stringify(config);
        this.world = world;
    }

    public gestureScroll(amount: number) {
        this.world.gestureScroll(amount);
    }

    public gestureScrollFinish(delayed: boolean) {
        this.world.gestureScrollFinish(delayed);
    }

    public gestureSwitchDesktop(offset: number) {
        this.world.gestureSwitchDesktop(offset);
    }

    // Re-reads the settings and, if any changed, rebuilds the World with the same layout.
    // The shortcuts stay registered in kglobalaccel, only their actions are pointed at the new World.
    public reloadConfig() {
        const config = loadConfig();
        const configJson = JSON.stringify(config);
        if (configJson === this.configJson) {
            return false;
        }
        log("settings changed, reloading");

        const layout = this.world.captureLayout();
        let keyBindings: KeyBindings|null = this.world.releaseKeyBindings();
        if (JSON.stringify(config.shortcutKeys) !== JSON.stringify(this.config.shortcutKeys)) {
            // the keys changed, so register the shortcuts again
            keyBindings.destroy();
            keyBindings = null;
        }
        this.world.destroy();
        try {
            this.world = new World(config, keyBindings, layout);
            this.config = config;
            this.configJson = configJson;
            setRingConfig(config);
        } catch (error: any) {
            log("failed to apply the new settings, going back to the old ones:", error, error.stack);
            this.world = new World(this.config, keyBindings, layout);
        }
        return true;
    }

    public destroy() {
        this.world.destroy();
    }
}
