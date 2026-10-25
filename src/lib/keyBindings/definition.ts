function getKeyBindings(world: World, actions: Actions): KeyBinding[] {
    return [
        {
            name: "window-toggle-floating",
            description: "Toggle floating",
            defaultKeys: ["Meta+V"],
            action: () => world.do(actions.windowToggleFloating),
        },
        {
            name: "window-switch-focus-floating-tiling",
            description: "Switch focus between floating and tiled windows",
            defaultKeys: ["Meta+Shift+V"],
            action: () => world.do(actions.switchFocusFloatingTiling),
        },
        {
            name: "focus-left",
            description: "Move focus left",
            defaultKeys: ["Meta+H", "Meta+Left"],
            action: () => world.doFocusInDirection(actions.focusLeft, -1, 0),
        },
        {
            name: "focus-right",
            description: "Move focus right",
            defaultKeys: ["Meta+L", "Meta+Right"],
            action: () => world.doFocusInDirection(actions.focusRight, 1, 0),
        },
        {
            name: "focus-up",
            description: "Move focus up",
            defaultKeys: ["Meta+K", "Meta+Up"],
            action: () => world.doFocusInDirection(actions.focusUp, 0, -1),
        },
        {
            name: "focus-down",
            description: "Move focus down",
            defaultKeys: ["Meta+J", "Meta+Down"],
            action: () => world.doFocusInDirection(actions.focusDown, 0, 1),
        },
        {
            name: "focus-next",
            description: "Move focus to the next window in grid",
            action: () => world.doFocusLayered(actions.focusNext, () => {}),
        },
        {
            name: "focus-previous",
            description: "Move focus to the previous window in grid",
            action: () => world.doFocusLayered(actions.focusPrevious, () => {}),
        },
        {
            name: "focus-start",
            description: "Move focus to start",
            defaultKeys: ["Meta+Home"],
            action: () => world.doFocusLayered(actions.focusStart, (cm, a) => cm.focusFloatingExtreme(a, "left")),
        },
        {
            name: "focus-end",
            description: "Move focus to end",
            defaultKeys: ["Meta+End"],
            action: () => world.doFocusLayered(actions.focusEnd, (cm, a) => cm.focusFloatingExtreme(a, "right")),
        },
        {
            name: "focus-column-right-or-first",
            description: "Focus the column on the right, the first one at the end",
            action: () => world.doFocusLayered(actions.focusColumnRightOrFirst, (cm, a) => cm.focusFloatingDirectional(a, 1, 0) || cm.focusFloatingExtreme(a, "left")),
        },
        {
            name: "focus-column-left-or-last",
            description: "Focus the column on the left, the last one at the start",
            action: () => world.doFocusLayered(actions.focusColumnLeftOrLast, (cm, a) => cm.focusFloatingDirectional(a, -1, 0) || cm.focusFloatingExtreme(a, "right")),
        },
        {
            name: "focus-window-down-or-column-left",
            description: "Focus the window below, or the column on the left",
            action: () => world.doFocusLayered(actions.focusWindowDownOrColumnLeft, (cm, a) => cm.focusFloatingDirectional(a, 0, 1)),
        },
        {
            name: "focus-window-down-or-column-right",
            description: "Focus the window below, or the column on the right",
            action: () => world.doFocusLayered(actions.focusWindowDownOrColumnRight, (cm, a) => cm.focusFloatingDirectional(a, 0, 1)),
        },
        {
            name: "focus-window-up-or-column-left",
            description: "Focus the window above, or the column on the left",
            action: () => world.doFocusLayered(actions.focusWindowUpOrColumnLeft, (cm, a) => cm.focusFloatingDirectional(a, 0, -1)),
        },
        {
            name: "focus-window-up-or-column-right",
            description: "Focus the window above, or the column on the right",
            action: () => world.doFocusLayered(actions.focusWindowUpOrColumnRight, (cm, a) => cm.focusFloatingDirectional(a, 0, -1)),
        },
        {
            name: "focus-window-top",
            description: "Focus the top window of the column",
            action: () => world.doFocusLayered(actions.focusWindowTop, (cm, a) => cm.focusFloatingExtreme(a, "top")),
        },
        {
            name: "focus-window-bottom",
            description: "Focus the bottom window of the column",
            action: () => world.doFocusLayered(actions.focusWindowBottom, (cm, a) => cm.focusFloatingExtreme(a, "bottom")),
        },
        {
            name: "focus-window-down-or-top",
            description: "Focus the window below, the top one at the bottom",
            action: () => world.doFocusLayered(actions.focusWindowDownOrTop, (cm, a) => cm.focusFloatingDirectional(a, 0, 1) || cm.focusFloatingExtreme(a, "top")),
        },
        {
            name: "focus-window-up-or-bottom",
            description: "Focus the window above, the bottom one at the top",
            action: () => world.doFocusLayered(actions.focusWindowUpOrBottom, (cm, a) => cm.focusFloatingDirectional(a, 0, -1) || cm.focusFloatingExtreme(a, "bottom")),
        },
        {
            name: "focus-window-or-desktop-down",
            description: "Focus the window below, or the next desktop",
            action: () => world.doIfTiledFocusedOrEnterGrid(actions.focusWindowOrDesktopDown),
        },
        {
            name: "focus-window-or-desktop-up",
            description: "Focus the window above, or the previous desktop",
            action: () => world.doIfTiledFocusedOrEnterGrid(actions.focusWindowOrDesktopUp),
        },
        {
            name: "focus-window-previous",
            description: "Focus the previously focused window",
            action: () => world.do(actions.focusWindowPrevious),
        },
        {
            name: "focus-floating",
            description: "Focus the floating windows",
            action: () => world.do(actions.focusFloating),
        },
        {
            name: "focus-tiling",
            description: "Focus the tiled windows",
            action: () => world.do(actions.focusTiling),
        },
        {
            name: "window-move-left",
            description: "Move window left",
            action: () => world.doIfTiledFocusedOrMoveFloating(actions.windowMoveLeft, -50, 0),
        },
        {
            name: "window-move-right",
            description: "Move window right",
            defaultKeys: ["Meta+]"],
            action: () => world.doIfTiledFocusedOrMoveFloating(actions.windowMoveRight, 50, 0),
        },
        {
            name: "window-consume-or-expel-left",
            description: "Consume the window into the left column, or expel it to the left",
            defaultKeys: ["Meta+["],
            action: () => world.doIfTiledFocused(actions.windowConsumeOrExpelLeft),
        },
        {
            name: "window-consume-or-expel-right",
            description: "Consume the window into the right column, or expel it to the right",
            defaultKeys: ["Meta+]"],
            action: () => world.doIfTiledFocused(actions.windowConsumeOrExpelRight),
        },
        {
            name: "window-consume-into-column",
            description: "Move the window on the right into this column",
            defaultKeys: ["Meta+,"],
            action: () => world.doIfTiledFocused(actions.windowConsumeIntoColumn),
        },
        {
            name: "window-expel-from-column",
            description: "Move window out of its column",
            defaultKeys: ["Meta+."],
            action: () => world.doIfTiledFocused(actions.windowExpelFromColumn),
        },
        {
            name: "window-move-up",
            description: "Move window up",
            defaultKeys: ["Meta+Ctrl+K", "Meta+Ctrl+Up"],
            action: () => world.doIfTiledFocusedOrMoveFloating(actions.windowMoveUp, 0, -50),
        },
        {
            name: "window-move-down",
            description: "Move window down",
            defaultKeys: ["Meta+Ctrl+J", "Meta+Ctrl+Down"],
            action: () => world.doIfTiledFocusedOrMoveFloating(actions.windowMoveDown, 0, 50),
        },
        {
            name: "window-move-down-or-to-desktop-down",
            description: "Move the window down, or to the next desktop",
            action: () => world.doIfTiledFocused(actions.windowMoveDownOrToDesktopDown),
        },
        {
            name: "window-move-up-or-to-desktop-up",
            description: "Move the window up, or to the previous desktop",
            action: () => world.doIfTiledFocused(actions.windowMoveUpOrToDesktopUp),
        },
        {
            name: "window-swap-left",
            description: "Swap the window with the one in the column on the left",
            action: () => world.doIfTiledFocused(actions.swapWindowLeft),
        },
        {
            name: "window-swap-right",
            description: "Swap the window with the one in the column on the right",
            action: () => world.doIfTiledFocused(actions.swapWindowRight),
        },
        {
            name: "window-move-to-floating",
            description: "Move the window to the floating layer",
            action: () => world.do(actions.windowMoveToFloating),
        },
        {
            name: "window-move-to-tiling",
            description: "Move the window to the tiled layer",
            action: () => world.do(actions.windowMoveToTiling),
        },
        {
            name: "column-display-normal",
            description: "Show the column normally",
            action: () => world.doIfTiledFocused(actions.columnDisplayNormal),
        },
        {
            name: "column-display-tabbed",
            description: "Show the column as tabs",
            action: () => world.doIfTiledFocused(actions.columnDisplayTabbed),
        },
        {
            name: "column-center-visible",
            description: "Center the columns that are on screen",
            defaultKeys: ["Meta+Ctrl+C"],
            action: () => world.doIfTiledFocused(actions.centerVisibleColumns),
        },
        {
            name: "window-height-increase",
            description: "Increase window height by a share of the screen",
            defaultKeys: ["Meta+Shift+="],
            action: () => world.doIfTiledFocusedOrFloating(actions.windowHeightStep.partial(actions.config.windowHeightStep), actions.floatingSizeStep.partial(false, actions.config.windowHeightStep)),
        },
        {
            name: "window-height-decrease",
            description: "Decrease window height by a share of the screen",
            defaultKeys: ["Meta+Shift+-"],
            action: () => world.doIfTiledFocusedOrFloating(actions.windowHeightStep.partial(-actions.config.windowHeightStep), actions.floatingSizeStep.partial(false, -actions.config.windowHeightStep)),
        },
        {
            name: "desktop-previous-used",
            description: "Switch back to the previously used desktop",
            action: () => switchToPreviousDesktop(world),
        },
        {
            name: "window-move-next",
            description: "Move window to the next position in grid",
            action: () => world.doIfTiledFocused(actions.windowMoveNext),
        },
        {
            name: "window-move-previous",
            description: "Move window to the previous position in grid",
            action: () => world.doIfTiledFocused(actions.windowMovePrevious),
        },
        {
            name: "window-move-start",
            description: "Move window to start",
            action: () => world.doIfTiledFocused(actions.windowMoveStart),
        },
        {
            name: "window-move-end",
            description: "Move window to end",
            action: () => world.doIfTiledFocused(actions.windowMoveEnd),
        },
        {
            name: "window-height-increase-up",
            description: "Increase window height upwards",
            action: () => world.doIfTiledFocused(actions.windowHeightIncreaseUp),
        },
        {
            name: "window-height-increase-down",
            description: "Increase window height downwards",
            action: () => world.doIfTiledFocused(actions.windowHeightIncreaseDown),
        },
        {
            name: "column-toggle-tabbed",
            description: "Toggle tabbed column",
            defaultKeys: ["Meta+W"],
            action: () => world.doIfTiledFocused(actions.columnToggleTabbed),
        },
        {
            name: "column-move-left",
            description: "Move column left",
            defaultKeys: ["Meta+Ctrl+H", "Meta+Ctrl+Left"],
            action: () => world.doIfTiledFocusedOrMoveFloating(actions.columnMoveLeft, -50, 0),
        },
        {
            name: "column-move-right",
            description: "Move column right",
            defaultKeys: ["Meta+Ctrl+L", "Meta+Ctrl+Right"],
            action: () => world.doIfTiledFocusedOrMoveFloating(actions.columnMoveRight, 50, 0),
        },
        {
            name: "column-move-start",
            description: "Move column to start",
            defaultKeys: ["Meta+Ctrl+Home"],
            action: () => world.doIfTiledFocused(actions.columnMoveStart),
        },
        {
            name: "column-move-end",
            description: "Move column to end",
            defaultKeys: ["Meta+Ctrl+End"],
            action: () => world.doIfTiledFocused(actions.columnMoveEnd),
        },
        {
            name: "column-move-to-next-desktop",
            description: "Move column to the next desktop",
            defaultKeys: ["Meta+Ctrl+PgDown", "Meta+Ctrl+U"],
            action: () => world.doIfTiledFocused(actions.columnMoveToNextDesktop),
        },
        {
            name: "column-move-to-previous-desktop",
            description: "Move column to the previous desktop",
            defaultKeys: ["Meta+Ctrl+PgUp", "Meta+Ctrl+I"],
            action: () => world.doIfTiledFocused(actions.columnMoveToPreviousDesktop),
        },
        {
            name: "window-move-to-next-desktop",
            description: "Move window to the next desktop",
            defaultKeys: [],
            action: () => world.doIfTiledFocused(actions.windowMoveToNextDesktop),
        },
        {
            name: "window-move-to-previous-desktop",
            description: "Move window to the previous desktop",
            defaultKeys: [],
            action: () => world.doIfTiledFocused(actions.windowMoveToPreviousDesktop),
        },
        {
            name: "column-width-increase",
            description: "Increase column width by a share of the screen",
            defaultKeys: ["Meta+="],
            action: () => world.doIfTiledFocusedOrFloating(actions.columnWidthStep.partial(actions.config.columnWidthStep), actions.floatingSizeStep.partial(true, actions.config.columnWidthStep)),
        },
        {
            name: "column-width-decrease",
            description: "Decrease column width by a share of the screen",
            defaultKeys: ["Meta+-"],
            action: () => world.doIfTiledFocusedOrFloating(actions.columnWidthStep.partial(-actions.config.columnWidthStep), actions.floatingSizeStep.partial(true, -actions.config.columnWidthStep)),
        },
        {
            name: "column-width-fit-increase",
            description: "Increase column width to the next size that fits the visible columns",
            action: () => world.doIfTiledFocused(actions.columnWidthIncrease),
        },
        {
            name: "column-width-fit-decrease",
            description: "Decrease column width to the next size that fits the visible columns",
            action: () => world.doIfTiledFocused(actions.columnWidthDecrease),
        },
        {
            name: "column-width-maximize",
            description: "Maximize column width (toggle)",
            defaultKeys: ["Meta+F"],
            action: () => world.doIfTiledFocused(actions.columnWidthMaximize),
        },
        {
            name: "window-maximize-to-edges",
            description: "Maximize window to the screen edges (toggle)",
            defaultKeys: ["Meta+M"],
            action: () => world.doIfTiledFocused(actions.windowMaximizeToEdges),
        },
        {
            name: "column-width-minimize",
            description: "Decrease column width to minimum",
            action: () => world.doIfTiledFocused(actions.columnWidthMinimize),
        },
        {
            name: "cycle-preset-widths",
            description: "Cycle through preset column widths",
            defaultKeys: ["Meta+R"],
            action: () => world.doIfTiledFocusedOrFloating(actions.cyclePresetWidths, actions.floatingSizePreset.partial(true, true)),
        },
        {
            name: "cycle-preset-widths-reverse",
            description: "Cycle through preset column widths in reverse",
            defaultKeys: ["Meta+Shift+R"],
            action: () => world.doIfTiledFocusedOrFloating(actions.cyclePresetWidthsReverse, actions.floatingSizePreset.partial(true, false)),
        },
        {
            name: "column-width-expand",
            description: "Expand column to available width",
            defaultKeys: ["Meta+Ctrl+F"],
            action: () => world.doIfTiledFocused(actions.columnWidthExpand),
        },
        {
            name: "window-height-cycle-presets",
            description: "Cycle preset window heights",
            defaultKeys: ["Meta+Ctrl+Shift+R"],
            action: () => world.doIfTiledFocusedOrFloating(actions.windowHeightCyclePresets, actions.floatingSizePreset.partial(false, true)),
        },
        {
            name: "window-height-cycle-presets-reverse",
            description: "Cycle preset window heights in reverse",
            action: () => world.doIfTiledFocusedOrFloating(actions.windowHeightCyclePresetsReverse, actions.floatingSizePreset.partial(false, false)),
        },
        {
            name: "window-height-reset",
            description: "Reset window height",
            defaultKeys: ["Meta+Ctrl+R"],
            action: () => world.doIfTiledFocused(actions.windowHeightReset),
        },
        {
            name: "columns-width-equalize",
            description: "Equalize widths of visible columns",
            action: () => world.do(actions.columnsWidthEqualize),
        },
        {
            name: "columns-squeeze-left",
            description: "Squeeze left column onto the screen",
            action: () => world.doIfTiledFocused(actions.columnsSqueezeLeft),
        },
        {
            name: "columns-squeeze-right",
            description: "Squeeze right column onto the screen",
            action: () => world.doIfTiledFocused(actions.columnsSqueezeRight),
        },
        {
            name: "grid-scroll-focused",
            description: "Center focused window",
            defaultKeys: ["Meta+C"],
            action: () => world.doIfTiledFocusedOrFloating(actions.gridScrollFocused, actions.floatingCenter),
        },
        {
            name: "grid-scroll-left-column",
            description: "Scroll one column to the left",
            action: () => world.do(actions.gridScrollLeftColumn),
        },
        {
            name: "grid-scroll-right-column",
            description: "Scroll one column to the right",
            action: () => world.do(actions.gridScrollRightColumn),
        },
        {
            name: "grid-scroll-left",
            description: "Scroll left",
            action: () => world.do(actions.gridScrollLeft),
        },
        {
            name: "grid-scroll-right",
            description: "Scroll right",
            action: () => world.do(actions.gridScrollRight),
        },
        {
            name: "grid-scroll-start",
            description: "Scroll to start",
            action: () => world.do(actions.gridScrollStart),
        },
        {
            name: "grid-scroll-end",
            description: "Scroll to end",
            action: () => world.do(actions.gridScrollEnd),
        },
        {
            name: "screen-switch",
            description: "Move Kiri grid to the current screen",
            action: () => world.do(actions.screenSwitch),
        },
        {
            name: "tail-move-to-next-desktop",
            description: "Move this and all following columns to the next desktop",
            action: () => world.doIfTiledFocused(actions.tailMoveToNextDesktop),
        },
        {
            name: "tail-move-to-previous-desktop",
            description: "Move this and all following columns to the previous desktop",
            action: () => world.doIfTiledFocused(actions.tailMoveToPreviousDesktop),
        },
        {
            name: "desktop-next",
            description: "Switch to the next desktop",
            defaultKeys: ["Meta+PgDown", "Meta+U"],
            action: () => switchToDesktop(currentDesktopIndex() + 1),
        },
        {
            name: "desktop-previous",
            description: "Switch to the previous desktop",
            defaultKeys: ["Meta+PgUp", "Meta+I"],
            action: () => switchToDesktop(currentDesktopIndex() - 1),
        },
        {
            name: "desktop-move-down",
            description: "Move the current desktop down, below the next one",
            defaultKeys: ["Meta+Shift+PgDown", "Meta+Shift+U"],
            action: () => world.do((clientManager, desktopManager) => world.dynamicDesktops.moveCurrent(desktopManager, 1)),
        },
        {
            name: "desktop-move-up",
            description: "Move the current desktop up, above the previous one",
            defaultKeys: ["Meta+Shift+PgUp", "Meta+Shift+I"],
            action: () => world.do((clientManager, desktopManager) => world.dynamicDesktops.moveCurrent(desktopManager, -1)),
        },
        {
            name: "window-close",
            description: "Close window",
            defaultKeys: ["Meta+Q", "Alt+F4"],
            action: () => Workspace.activeWindow?.closeWindow(),
        },
        {
            name: "window-toggle-fullscreen",
            description: "Toggle full-screen",
            defaultKeys: ["Meta+Shift+F"],
            action: () => {
                const window = Workspace.activeWindow;
                if (window !== null && window.fullScreenable) {
                    window.fullScreen = !window.fullScreen;
                }
            },
        },
        {
            name: "overview",
            description: "Toggle the overview",
            defaultKeys: ["Meta+O"],
            action: () => world.toggleOverview(),
        },
    ];
}

function switchToPreviousDesktop(world: World) {
    const previous = world.previousDesktop;
    if (previous !== null && Workspace.desktops.includes(previous)) {
        gotoDesktop(previous, "previous-desktop");
    }
}

function currentDesktopIndex() {
    return Workspace.desktops.indexOf(Workspace.currentDesktop);
}

function switchToDesktop(index: number) {
    const desktop = Workspace.desktops[index];
    if (desktop !== undefined) {
        gotoDesktop(desktop, shortcutEvent === null ? "focus-desktop" : "focus-desktop " + shortcutEvent);
    }
}

function getNumKeyBindings(world: World, actions: Actions): NumKeyBinding[] {
    return [
        {
            name: "desktop-{}",
            description: "Switch to desktop {}",
            defaultModifiers: "Meta",
            action: (i: number) => switchToDesktop(actions.config.clampDesktopIndex(i)),
        },
        {
            name: "focus-{}",
            description: "Move focus to column {}",
            action: (i: number) => world.do(actions.focus.partial(i)),
        },
        {
            name: "focus-window-in-column-{}",
            description: "Move focus to window {} of the column",
            action: (i: number) => world.doFocusLayered(actions.focusWindowInColumn.partial(i), () => {}),
        },
        {
            name: "window-move-to-column-{}",
            description: "Move window to column {}",
            action: (i: number) => world.doIfTiledFocused(actions.windowMoveToColumn.partial(i)),
        },
        {
            name: "column-move-to-column-{}",
            description: "Move column to position {}",
            action: (i: number) => world.doIfTiledFocused(actions.columnMoveToColumn.partial(i)),
        },
        {
            name: "column-move-to-desktop-{}",
            defaultModifiers: "Meta+Ctrl",
            description: "Move column to desktop {}",
            action: (i: number) => world.doIfTiledFocused(actions.columnMoveToDesktop.partial(i)),
        },
        {
            name: "window-move-to-desktop-{}",
            description: "Move window to desktop {}",
            action: (i: number) => world.doIfTiledFocused(actions.windowMoveToDesktop.partial(i)),
        },
        {
            name: "tail-move-to-desktop-{}",
            description: "Move this and all following columns to desktop {}",
            action: (i: number) => world.doIfTiledFocused(actions.tailMoveToDesktop.partial(i)),
        },
    ];
}
