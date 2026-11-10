const defaultWindowRules = `[
    {
        "class": "(org\\\\.kde\\\\.)?plasmashell",
        "tile": false
    },
    {
        "class": "(org\\\\.kde\\\\.)?polkit-kde-authentication-agent-1",
        "tile": false
    },
    {
        "class": "(org\\\\.kde\\\\.)?kded6",
        "tile": false
    },
    {
        "class": "(org\\\\.kde\\\\.)?kcalc",
        "tile": false
    },
    {
        "class": "(org\\\\.kde\\\\.)?kfind",
        "tile": true
    },
    {
        "class": "(org\\\\.kde\\\\.)?kruler",
        "tile": false
    },
    {
        "class": "(org\\\\.kde\\\\.)?krunner",
        "tile": false
    },
    {
        "class": "(org\\\\.kde\\\\.)?yakuake",
        "tile": false
    },
    {
        "class": "(org\\\\.kde\\\\.)?spectacle",
        "tile": false
    },
    {
        "class": "wl-copy|wl-paste",
        "caption": "wl-clipboard",
        "tile": false
    },
    {
        "class": "steam",
        "caption": "Steam Big Picture Mode",
        "tile": false
    },
    {
        "class": "zoom",
        "caption": "Zoom Cloud Meetings|zoom|zoom <2>",
        "tile": false
    },
    {
        "class": "jetbrains-.*",
        "caption": "splash",
        "tile": false
    },
    {
        "class": "jetbrains-.*",
        "caption": "Unstash Changes|Paths Affected by stash@.*",
        "tile": true
    }
]`;

// Where a key goes in the settings page is decided by tools/gen_config_ui.py (see the comment at its top). A new key
// needs nothing here, but may say  section: "Appearance/Shadow"  (tab/group) to choose its place; a "// comment" after its
// name becomes its tooltip.
const configDef = [
    {
        name: "gapsOuterTop",
        type: "UInt",
        default: 16,
    },
    {
        name: "gapsOuterBottom",
        type: "UInt",
        default: 16,
    },
    {
        name: "gapsOuterLeft",
        type: "UInt",
        default: 16,
    },
    {
        name: "gapsOuterRight",
        type: "UInt",
        default: 16,
    },
    {
        name: "gapsInnerHorizontal",
        type: "UInt",
        default: 16,
    },
    {
        name: "gapsInnerVertical",
        type: "UInt",
        default: 16,
    },
    {
        name: "manualScrollStep",
        type: "UInt",
        default: 200,
    },
    {
        name: "presetWidths",
        type: "String",
        default: "33.333%, 50%, 66.667%",
    },
    {
        name: "columnWidthStep",
        type: "UInt",
        default: 10,
    },
    {
        name: "windowHeightStep",
        type: "UInt",
        default: 10,
    },
    {
        name: "verticalResizeStep",
        type: "UInt",
        default: 32,
    },
    {
        name: "offScreenOpacity",
        type: "UInt",
        default: 100,
    },
    {
        name: "untileOnDrag",
        type: "Bool",
        default: true,
    },
    {
        name: "dropToTile",
        type: "Bool",
        default: true,
    },
    {
        name: "focusFollowsMouse", // needs KWin's focus policy on "Click to focus" (install.sh sets it)
        type: "Bool",
        default: true,
    },
    {
        name: "focusFollowsMouseMaxScroll", // niri's max-scroll-amount, percent of the screen width; 100 = no limit
        type: "UInt",
        default: 100,
    },
    {
        name: "cursorFollowsFocus",
        type: "Bool",
        default: false,
    },
    {
        name: "hotCorner",
        type: "Bool",
        default: true,
    },
    {
        name: "tabbedColumnsByDefault",
        type: "Bool",
        default: false,
    },
    {
        name: "tabIndicatorEnabled",
        type: "Bool",
        default: true,
    },
    {
        name: "tabIndicatorWidth",
        type: "UInt",
        default: 4,
    },
    {
        name: "tabIndicatorGap",
        type: "Int",
        default: 5,
    },
    {
        name: "tabIndicatorLength",
        type: "Double",
        default: 0.5,
    },
    {
        name: "tabIndicatorPosition",
        type: "Enum",
        default: "left",
        choices: ["left", "right", "top", "bottom"],
    },
    {
        name: "tabIndicatorHideWhenSingleTab",
        type: "Bool",
        default: false,
    },
    {
        name: "tabIndicatorPlaceWithinColumn",
        type: "Bool",
        default: false,
    },
    {
        name: "tabIndicatorGapsBetweenTabs",
        type: "UInt",
        default: 0,
    },
    {
        name: "tabIndicatorCornerRadius",
        type: "UInt",
        default: 0,
    },
    {
        name: "tabIndicatorActiveColor",
        type: "String",
        default: "",
    },
    {
        name: "tabIndicatorInactiveColor",
        type: "String",
        default: "",
    },
    {
        name: "tabIndicatorUrgentColor",
        type: "String",
        default: "",
    },
    {
        name: "tabIndicatorActiveGradient",
        type: "String",
        default: "",
    },
    {
        name: "tabIndicatorInactiveGradient",
        type: "String",
        default: "",
    },
    {
        name: "tabIndicatorUrgentGradient",
        type: "String",
        default: "",
    },
    {
        name: "resizeNeighborColumn",
        type: "Bool",
        default: false,
    },
    {
        name: "reMaximize",
        type: "Bool",
        default: false,
    },
    {
        name: "tileMaximized",
        type: "Bool",
        default: true,
    },
    {
        name: "tileFullScreen",
        type: "Bool",
        default: true,
    },
    {
        name: "hideTitlebars",
        type: "Bool",
        default: true,
    },
    {
        name: "skipSwitcher",
        type: "Bool",
        default: false,
    },
    {
        name: "scrollingLazy",
        type: "Bool",
        default: true,
    },
    {
        name: "scrollingCentered",
        type: "Bool",
        default: false,
    },
    {
        name: "scrollingGrouped",
        type: "Bool",
        default: false,
    },
    {
        name: "scrollingOnOverflow",
        type: "Bool",
        default: false,
    },
    {
        name: "centerGridWhenFits",
        type: "Bool",
        default: false,
    },
    {
        name: "alwaysCenterSingleColumn",
        type: "Bool",
        default: false,
    },
    {
        name: "defaultColumnWidth",
        type: "String",
        default: "50%",
    },
    {
        name: "presetHeights",
        type: "String",
        default: "33.333%, 50%, 66.667%",
    },
    {
        name: "gestureScroll",
        type: "Bool",
        default: true,
    },
    {
        name: "gestureScrollInvert",
        type: "Bool",
        default: false,
    },
    {
        name: "gestureScrollStep",
        type: "UInt",
        default: 1920,
    },
    {
        name: "gestureSettleDuration",
        type: "UInt",
        default: 250,
    },
    {
        name: "gestureDesktopSwitch",
        type: "Bool",
        default: true,
    },
    {
        name: "closeRelayoutDelay",
        type: "UInt",
        default: 0,
    },
    {
        name: "tiledKeepBelow",
        type: "Bool",
        default: true,
    },
    {
        name: "floatingKeepAbove",
        type: "Bool",
        default: false,
    },
    {
        name: "noLayering",
        type: "Bool",
        default: false,
    },
    {
        name: "cornerRadius",
        type: "UInt",
        default: 0,
    },
    {
        name: "focusRingEnabled",
        type: "Bool",
        default: true,
    },
    {
        name: "focusRingWidth",
        type: "UInt",
        default: 4,
    },
    {
        name: "focusRingActiveColor",
        type: "String",
        default: "#7fc8ff",
    },
    {
        name: "focusRingInactiveColor",
        type: "String",
        default: "#505050",
    },
    {
        name: "focusRingUrgentColor",
        type: "String",
        default: "#9b0000",
    },
    {
        name: "focusRingActiveGradient",
        type: "String",
        default: "",
    },
    {
        name: "focusRingInactiveGradient",
        type: "String",
        default: "",
    },
    {
        name: "focusRingUrgentGradient",
        type: "String",
        default: "",
    },
    {
        name: "borderEnabled",
        type: "Bool",
        default: false,
    },
    {
        name: "borderWidth",
        type: "UInt",
        default: 4,
    },
    {
        name: "borderActiveColor",
        type: "String",
        default: "#ffc87f",
    },
    {
        name: "borderInactiveColor",
        type: "String",
        default: "#505050",
    },
    {
        name: "borderUrgentColor",
        type: "String",
        default: "#9b0000",
    },
    {
        name: "borderActiveGradient",
        type: "String",
        default: "",
    },
    {
        name: "borderInactiveGradient",
        type: "String",
        default: "",
    },
    {
        name: "borderUrgentGradient",
        type: "String",
        default: "",
    },
    {
        name: "shadowEnabled",
        type: "Bool",
        default: false,
    },
    {
        name: "shadowOffsetX",
        type: "Int",
        default: 0,
    },
    {
        name: "shadowOffsetY",
        type: "Int",
        default: 5,
    },
    {
        name: "shadowSoftness",
        type: "UInt",
        default: 30,
    },
    {
        name: "shadowSpread",
        type: "Int",
        default: 5,
    },
    {
        name: "shadowDrawBehindWindow",
        type: "Bool",
        default: false,
    },
    {
        name: "shadowColor",
        type: "String",
        default: "#00000077",
    },
    {
        name: "shadowInactiveColor",
        type: "String",
        default: "",
    },
    {
        name: "insertHintEnabled",
        type: "Bool",
        default: true,
    },
    {
        name: "insertHintColor",
        type: "String",
        default: "#7fc8ff80",
    },
    {
        name: "insertHintGradient",
        type: "String",
        default: "",
    },
    {
        name: "fullscreenBackdropColor",
        type: "String",
        default: "#000000",
    },
    {
        name: "backgroundColor",
        type: "String",
        default: "",
    },
    {
        name: "floatClasses",
        type: "String",
        default: "",
    },
    {
        name: "tileClasses",
        type: "String",
        default: "",
    },
    {
        name: "columnWidthRules",
        type: "String",
        default: "",
    },
    {
        name: "windowRules",
        type: "String",
        default: defaultWindowRules,
    },
    {
        name: "dynamicDesktops",
        type: "Bool",
        default: false, // experimental
    },
    {
        name: "tiledDesktops",
        type: "String",
        default: ".*",
    },
    {
        name: "niriConfigEnabled",
        type: "Bool",
        default: false,
    },
    {
        name: "niriConfig",
        type: "String",
        default: "",
    },
];

// a function, so that code in files that come before this one can ask for the list without a use-before-declaration
function getConfigDef() {
    return configDef;
}
