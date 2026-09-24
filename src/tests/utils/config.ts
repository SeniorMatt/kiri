function getDefaultConfig(): Config {
    const config: any = {};
    for (const prop of configDef) {
        config[prop.name] = prop.default;
    }
    config.shortcutKeys = {};
    // the tests were written for Karousel's defaults
    config.gapsInnerHorizontal = 8;
    config.gapsInnerVertical = 8;
    config.presetWidths = "50%, 100%";
    config.gestureScroll = false;
    config.centerGridWhenFits = true;
    config.defaultColumnWidth = "";
    config.dropToTile = false;
    config.focusFollowsMouse = false;
    config.hideTitlebars = false; // the tests were written for windows with title bars; hideTitlebars.ts turns it on
    return config;
}
