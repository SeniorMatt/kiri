// Descriptions are what Plasma's Shortcuts page shows, sorted alphabetically, and they also make the pages in Kiri's own
// settings (tools/gen_config_ui.py): write "Group: what it does", with a group that already exists when one fits (Focus,
// Move, Column, Width, Height, Window, Scroll, Desktop, Screen, Overview), niri's action wording and a lower-case rest,
// like "Focus: column left", "Desktop: move column to 3", "Width: next preset". The `name` (the kglobalaccel id) must
// never change, users' keys are stored under it.
function getKeyBindings(world: World, actions: Actions): KeyBinding[] {
    return [
        {
            name: "window-toggle-floating",
            description: "Window: toggle floating",
            defaultKeys: ["Meta+V"],
            action: () => world.do(actions.windowToggleFloating),
        },
        {
            name: "window-switch-focus-floating-tiling",
            description: "Focus: switch between floating and tiled",
            defaultKeys: ["Meta+Shift+V"],
            action: () => world.do(actions.switchFocusFloatingTiling),
        },
        {
            name: "focus-left",
            description: "Focus: column left",
            defaultKeys: ["Meta+H", "Meta+Left"],
            action: () => world.doFocusInDirection(actions.focusLeft, -1, 0),
        },
        {
            name: "focus-right",
            description: "Focus: column right",
            defaultKeys: ["Meta+L", "Meta+Right"],
            action: () => world.doFocusInDirection(actions.focusRight, 1, 0),
        },
        {
            name: "focus-up",
            description: "Focus: window up",
            defaultKeys: ["Meta+K", "Meta+Up"],
            action: () => world.doFocusInDirection(actions.focusUp, 0, -1),
        },
        {
            name: "focus-down",
            description: "Focus: window down",
            defaultKeys: ["Meta+J", "Meta+Down"],
            action: () => world.doFocusInDirection(actions.focusDown, 0, 1),
        },
        {
            name: "focus-next",
            description: "Focus: next window",
            action: () => world.doFocusLayered(actions.focusNext, () => {}),
        },
        {
            name: "focus-previous",
            description: "Focus: previous window",
            action: () => world.doFocusLayered(actions.focusPrevious, () => {}),
        },
        {
            name: "focus-start",
            description: "Focus: first column",
            defaultKeys: ["Meta+Home"],
            action: () => world.doFocusLayered(actions.focusStart, (cm, a) => cm.focusFloatingExtreme(a, "left")),
        },
        {
            name: "focus-end",
            description: "Focus: last column",
            defaultKeys: ["Meta+End"],
            action: () => world.doFocusLayered(actions.focusEnd, (cm, a) => cm.focusFloatingExtreme(a, "right")),
        },
        {
            name: "focus-column-right-or-first",
            description: "Focus: column right or first",
            action: () => world.doFocusLayered(actions.focusColumnRightOrFirst, (cm, a) => cm.focusFloatingDirectional(a, 1, 0) || cm.focusFloatingExtreme(a, "left")),
        },
        {
            name: "focus-column-left-or-last",
            description: "Focus: column left or last",
            action: () => world.doFocusLayered(actions.focusColumnLeftOrLast, (cm, a) => cm.focusFloatingDirectional(a, -1, 0) || cm.focusFloatingExtreme(a, "right")),
        },
        {
            name: "focus-window-down-or-column-left",
            description: "Focus: window down or column left",
            action: () => world.doFocusLayered(actions.focusWindowDownOrColumnLeft, (cm, a) => cm.focusFloatingDirectional(a, 0, 1)),
        },
        {
            name: "focus-window-down-or-column-right",
            description: "Focus: window down or column right",
            action: () => world.doFocusLayered(actions.focusWindowDownOrColumnRight, (cm, a) => cm.focusFloatingDirectional(a, 0, 1)),
        },
        {
            name: "focus-window-up-or-column-left",
            description: "Focus: window up or column left",
            action: () => world.doFocusLayered(actions.focusWindowUpOrColumnLeft, (cm, a) => cm.focusFloatingDirectional(a, 0, -1)),
        },
        {
            name: "focus-window-up-or-column-right",
            description: "Focus: window up or column right",
            action: () => world.doFocusLayered(actions.focusWindowUpOrColumnRight, (cm, a) => cm.focusFloatingDirectional(a, 0, -1)),
        },
        {
            name: "focus-window-top",
            description: "Focus: top window",
            action: () => world.doFocusLayered(actions.focusWindowTop, (cm, a) => cm.focusFloatingExtreme(a, "top")),
        },
        {
            name: "focus-window-bottom",
            description: "Focus: bottom window",
            action: () => world.doFocusLayered(actions.focusWindowBottom, (cm, a) => cm.focusFloatingExtreme(a, "bottom")),
        },
        {
            name: "focus-window-down-or-top",
            description: "Focus: window down or top",
            action: () => world.doFocusLayered(actions.focusWindowDownOrTop, (cm, a) => cm.focusFloatingDirectional(a, 0, 1) || cm.focusFloatingExtreme(a, "top")),
        },
        {
            name: "focus-window-up-or-bottom",
            description: "Focus: window up or bottom",
            action: () => world.doFocusLayered(actions.focusWindowUpOrBottom, (cm, a) => cm.focusFloatingDirectional(a, 0, -1) || cm.focusFloatingExtreme(a, "bottom")),
        },
        {
            name: "focus-window-or-desktop-down",
            description: "Focus: window or desktop down",
            action: () => world.doIfTiledFocusedOrEnterGrid(actions.focusWindowOrDesktopDown),
        },
        {
            name: "focus-window-or-desktop-up",
            description: "Focus: window or desktop up",
            action: () => world.doIfTiledFocusedOrEnterGrid(actions.focusWindowOrDesktopUp),
        },
        {
            name: "focus-window-previous",
            description: "Focus: previous-used window",
            action: () => world.do(actions.focusWindowPrevious),
        },
        {
            name: "focus-floating",
            description: "Focus: floating windows",
            action: () => world.do(actions.focusFloating),
        },
        {
            name: "focus-tiling",
            description: "Focus: tiled windows",
            action: () => world.do(actions.focusTiling),
        },
        {
            name: "window-move-left",
            description: "Move: window left",
            action: () => world.doIfTiledFocusedOrMoveFloating(actions.windowMoveLeft, -50, 0),
        },
        {
            name: "window-move-right",
            description: "Move: window right",
            action: () => world.doIfTiledFocusedOrMoveFloating(actions.windowMoveRight, 50, 0),
        },
        {
            name: "window-consume-or-expel-left",
            description: "Move: consume or expel window left",
            defaultKeys: ["Meta+["],
            action: () => world.doIfTiledFocused(actions.windowConsumeOrExpelLeft),
        },
        {
            name: "window-consume-or-expel-right",
            description: "Move: consume or expel window right",
            defaultKeys: ["Meta+]"],
            action: () => world.doIfTiledFocused(actions.windowConsumeOrExpelRight),
        },
        {
            name: "window-consume-into-column",
            description: "Move: consume window into column",
            defaultKeys: ["Meta+,"],
            action: () => world.doIfTiledFocused(actions.windowConsumeIntoColumn),
        },
        {
            name: "window-expel-from-column",
            description: "Move: expel window from column",
            defaultKeys: ["Meta+."],
            action: () => world.doIfTiledFocused(actions.windowExpelFromColumn),
        },
        {
            name: "window-move-up",
            description: "Move: window up",
            defaultKeys: ["Meta+Ctrl+K", "Meta+Ctrl+Up"],
            action: () => world.doIfTiledFocusedOrMoveFloating(actions.windowMoveUp, 0, -50),
        },
        {
            name: "window-move-down",
            description: "Move: window down",
            defaultKeys: ["Meta+Ctrl+J", "Meta+Ctrl+Down"],
            action: () => world.doIfTiledFocusedOrMoveFloating(actions.windowMoveDown, 0, 50),
        },
        {
            name: "window-move-down-or-to-desktop-down",
            description: "Move: window down or to desktop below",
            action: () => world.doIfTiledFocused(actions.windowMoveDownOrToDesktopDown),
        },
        {
            name: "window-move-up-or-to-desktop-up",
            description: "Move: window up or to desktop above",
            action: () => world.doIfTiledFocused(actions.windowMoveUpOrToDesktopUp),
        },
        {
            name: "window-swap-left",
            description: "Move: swap window left",
            action: () => world.doIfTiledFocused(actions.swapWindowLeft),
        },
        {
            name: "window-swap-right",
            description: "Move: swap window right",
            action: () => world.doIfTiledFocused(actions.swapWindowRight),
        },
        {
            name: "window-move-to-floating",
            description: "Window: move to floating layer",
            action: () => world.do(actions.windowMoveToFloating),
        },
        {
            name: "window-move-to-tiling",
            description: "Window: move to tiled layer",
            action: () => world.do(actions.windowMoveToTiling),
        },
        {
            name: "column-display-normal",
            description: "Column: display normal",
            action: () => world.doIfTiledFocused(actions.columnDisplayNormal),
        },
        {
            name: "column-display-tabbed",
            description: "Column: display tabbed",
            action: () => world.doIfTiledFocused(actions.columnDisplayTabbed),
        },
        {
            name: "column-center-visible",
            description: "Scroll: center visible columns",
            defaultKeys: ["Meta+Ctrl+C"],
            action: () => world.doIfTiledFocused(actions.centerVisibleColumns),
        },
        {
            name: "window-height-increase",
            description: "Height: increase",
            defaultKeys: ["Meta+Shift+="],
            action: () => world.doIfTiledFocusedOrFloating(actions.windowHeightStep.partial(actions.config.windowHeightStep), actions.floatingSizeStep.partial(false, actions.config.windowHeightStep)),
        },
        {
            name: "window-height-decrease",
            description: "Height: decrease",
            defaultKeys: ["Meta+Shift+-"],
            action: () => world.doIfTiledFocusedOrFloating(actions.windowHeightStep.partial(-actions.config.windowHeightStep), actions.floatingSizeStep.partial(false, -actions.config.windowHeightStep)),
        },
        {
            name: "desktop-previous-used",
            description: "Desktop: go to last used",
            action: () => switchToPreviousDesktop(world),
        },
        {
            name: "window-move-next",
            description: "Move: window to next position",
            action: () => world.doIfTiledFocused(actions.windowMoveNext),
        },
        {
            name: "window-move-previous",
            description: "Move: window to previous position",
            action: () => world.doIfTiledFocused(actions.windowMovePrevious),
        },
        {
            name: "window-move-start",
            description: "Move: window to start",
            action: () => world.doIfTiledFocused(actions.windowMoveStart),
        },
        {
            name: "window-move-end",
            description: "Move: window to end",
            action: () => world.doIfTiledFocused(actions.windowMoveEnd),
        },
        {
            name: "window-height-increase-up",
            description: "Height: increase upwards",
            action: () => world.doIfTiledFocused(actions.windowHeightIncreaseUp),
        },
        {
            name: "window-height-increase-down",
            description: "Height: increase downwards",
            action: () => world.doIfTiledFocused(actions.windowHeightIncreaseDown),
        },
        {
            name: "column-toggle-tabbed",
            description: "Column: toggle tabbed",
            defaultKeys: ["Meta+W"],
            action: () => world.doIfTiledFocused(actions.columnToggleTabbed),
        },
        {
            name: "column-move-left",
            description: "Move: column left",
            defaultKeys: ["Meta+Ctrl+H", "Meta+Ctrl+Left"],
            action: () => world.doIfTiledFocusedOrMoveFloating(actions.columnMoveLeft, -50, 0),
        },
        {
            name: "column-move-right",
            description: "Move: column right",
            defaultKeys: ["Meta+Ctrl+L", "Meta+Ctrl+Right"],
            action: () => world.doIfTiledFocusedOrMoveFloating(actions.columnMoveRight, 50, 0),
        },
        {
            name: "column-move-start",
            description: "Move: column to start",
            defaultKeys: ["Meta+Ctrl+Home"],
            action: () => world.doIfTiledFocused(actions.columnMoveStart),
        },
        {
            name: "column-move-end",
            description: "Move: column to end",
            defaultKeys: ["Meta+Ctrl+End"],
            action: () => world.doIfTiledFocused(actions.columnMoveEnd),
        },
        {
            name: "column-move-to-next-desktop",
            description: "Desktop: move column to next",
            defaultKeys: ["Meta+Ctrl+PgDown", "Meta+Ctrl+U"],
            action: () => world.doIfTiledFocused(actions.columnMoveToNextDesktop),
        },
        {
            name: "column-move-to-previous-desktop",
            description: "Desktop: move column to previous",
            defaultKeys: ["Meta+Ctrl+PgUp", "Meta+Ctrl+I"],
            action: () => world.doIfTiledFocused(actions.columnMoveToPreviousDesktop),
        },
        {
            name: "window-move-to-next-desktop",
            description: "Desktop: move window to next",
            defaultKeys: [],
            action: () => world.doIfTiledFocused(actions.windowMoveToNextDesktop),
        },
        {
            name: "window-move-to-previous-desktop",
            description: "Desktop: move window to previous",
            defaultKeys: [],
            action: () => world.doIfTiledFocused(actions.windowMoveToPreviousDesktop),
        },
        {
            name: "column-width-increase",
            description: "Width: increase",
            defaultKeys: ["Meta+="],
            action: () => world.doIfTiledFocusedOrFloating(actions.columnWidthStep.partial(actions.config.columnWidthStep), actions.floatingSizeStep.partial(true, actions.config.columnWidthStep)),
        },
        {
            name: "column-width-decrease",
            description: "Width: decrease",
            defaultKeys: ["Meta+-"],
            action: () => world.doIfTiledFocusedOrFloating(actions.columnWidthStep.partial(-actions.config.columnWidthStep), actions.floatingSizeStep.partial(true, -actions.config.columnWidthStep)),
        },
        {
            name: "column-width-fit-increase",
            description: "Width: increase to fit visible columns",
            action: () => world.doIfTiledFocused(actions.columnWidthIncrease),
        },
        {
            name: "column-width-fit-decrease",
            description: "Width: decrease to fit visible columns",
            action: () => world.doIfTiledFocused(actions.columnWidthDecrease),
        },
        {
            name: "column-width-maximize",
            description: "Width: toggle maximized",
            defaultKeys: ["Meta+F"],
            action: () => world.doIfTiledFocused(actions.columnWidthMaximize),
        },
        {
            name: "window-maximize-to-edges",
            description: "Window: toggle maximized to edges",
            defaultKeys: ["Meta+M"],
            action: () => world.doIfTiledFocused(actions.windowMaximizeToEdges),
        },
        {
            name: "column-width-minimize",
            description: "Width: minimize",
            action: () => world.doIfTiledFocused(actions.columnWidthMinimize),
        },
        {
            name: "cycle-preset-widths",
            description: "Width: next preset",
            defaultKeys: ["Meta+R"],
            action: () => world.doIfTiledFocusedOrFloating(actions.cyclePresetWidths, actions.floatingSizePreset.partial(true, true)),
        },
        {
            name: "cycle-preset-widths-reverse",
            description: "Width: previous preset",
            defaultKeys: ["Meta+Shift+R"],
            action: () => world.doIfTiledFocusedOrFloating(actions.cyclePresetWidthsReverse, actions.floatingSizePreset.partial(true, false)),
        },
        {
            name: "column-width-expand",
            description: "Width: expand to available space",
            defaultKeys: ["Meta+Ctrl+F"],
            action: () => world.doIfTiledFocused(actions.columnWidthExpand),
        },
        {
            name: "window-height-cycle-presets",
            description: "Height: next preset",
            defaultKeys: ["Meta+Ctrl+Shift+R"],
            action: () => world.doIfTiledFocusedOrFloating(actions.windowHeightCyclePresets, actions.floatingSizePreset.partial(false, true)),
        },
        {
            name: "window-height-cycle-presets-reverse",
            description: "Height: previous preset",
            action: () => world.doIfTiledFocusedOrFloating(actions.windowHeightCyclePresetsReverse, actions.floatingSizePreset.partial(false, false)),
        },
        {
            name: "window-height-reset",
            description: "Height: reset",
            defaultKeys: ["Meta+Ctrl+R"],
            action: () => world.doIfTiledFocused(actions.windowHeightReset),
        },
        {
            name: "columns-width-equalize",
            description: "Width: equalize visible columns",
            action: () => world.do(actions.columnsWidthEqualize),
        },
        {
            name: "columns-squeeze-left",
            description: "Scroll: squeeze left column onto screen",
            action: () => world.doIfTiledFocused(actions.columnsSqueezeLeft),
        },
        {
            name: "columns-squeeze-right",
            description: "Scroll: squeeze right column onto screen",
            action: () => world.doIfTiledFocused(actions.columnsSqueezeRight),
        },
        {
            name: "grid-scroll-focused",
            description: "Scroll: center focused window",
            defaultKeys: ["Meta+C"],
            action: () => world.doIfTiledFocusedOrFloating(actions.gridScrollFocused, actions.floatingCenter),
        },
        {
            name: "grid-scroll-left-column",
            description: "Scroll: one column left",
            action: () => world.do(actions.gridScrollLeftColumn),
        },
        {
            name: "grid-scroll-right-column",
            description: "Scroll: one column right",
            action: () => world.do(actions.gridScrollRightColumn),
        },
        {
            name: "grid-scroll-left",
            description: "Scroll: left",
            action: () => world.do(actions.gridScrollLeft),
        },
        {
            name: "grid-scroll-right",
            description: "Scroll: right",
            action: () => world.do(actions.gridScrollRight),
        },
        {
            name: "grid-scroll-start",
            description: "Scroll: to start",
            action: () => world.do(actions.gridScrollStart),
        },
        {
            name: "grid-scroll-end",
            description: "Scroll: to end",
            action: () => world.do(actions.gridScrollEnd),
        },
        {
            name: "screen-switch",
            description: "Screen: move grid to this screen",
            action: () => world.do(actions.screenSwitch),
        },
        {
            name: "tail-move-to-next-desktop",
            description: "Desktop: move this and later columns to next",
            action: () => world.doIfTiledFocused(actions.tailMoveToNextDesktop),
        },
        {
            name: "tail-move-to-previous-desktop",
            description: "Desktop: move this and later columns to previous",
            action: () => world.doIfTiledFocused(actions.tailMoveToPreviousDesktop),
        },
        {
            name: "desktop-next",
            description: "Desktop: go to next",
            defaultKeys: ["Meta+PgDown", "Meta+U"],
            action: () => switchToDesktop(currentDesktopIndex() + 1),
        },
        {
            name: "desktop-previous",
            description: "Desktop: go to previous",
            defaultKeys: ["Meta+PgUp", "Meta+I"],
            action: () => switchToDesktop(currentDesktopIndex() - 1),
        },
        {
            name: "desktop-move-down",
            description: "Desktop: move down",
            defaultKeys: ["Meta+Shift+PgDown", "Meta+Shift+U"],
            action: () => world.do((clientManager, desktopManager) => world.dynamicDesktops.moveCurrent(desktopManager, 1)),
        },
        {
            name: "desktop-move-up",
            description: "Desktop: move up",
            defaultKeys: ["Meta+Shift+PgUp", "Meta+Shift+I"],
            action: () => world.do((clientManager, desktopManager) => world.dynamicDesktops.moveCurrent(desktopManager, -1)),
        },
        {
            name: "window-close",
            description: "Window: close",
            defaultKeys: ["Meta+Q", "Alt+F4"],
            action: () => Workspace.activeWindow?.closeWindow(),
        },
        {
            name: "window-toggle-fullscreen",
            description: "Window: toggle full-screen",
            defaultKeys: ["Meta+Shift+F"],
            action: () => {
                const window = Workspace.activeWindow;
                if (window !== null && window.fullScreenable) {
                    // a windowed full-screen window (niri's toggle-windowed-fullscreen) becomes full-screen for real
                    let wasWindowed = false;
                    world.doIfTiled(window, (cm, dm, tiled) => {
                        wasWindowed = tiled.client.windowedFullScreen && window.fullScreen;
                        if (wasWindowed) {
                            tiled.makeFullScreenReal();
                        }
                    });
                    if (!wasWindowed) {
                        window.fullScreen = !window.fullScreen;
                    }
                }
            },
        },
        {
            name: "window-toggle-windowed-fullscreen",
            description: "Window: toggle windowed full-screen",
            defaultKeys: ["Meta+Ctrl+Shift+F"],
            action: () => world.doIfTiledFocused(actions.windowToggleWindowedFullScreen),
        },
        {
            name: "overview",
            description: "Overview: toggle",
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
            description: "Desktop: go to {}",
            defaultModifiers: "Meta",
            action: (i: number) => switchToDesktop(actions.config.clampDesktopIndex(i)),
        },
        {
            name: "focus-{}",
            description: "Focus: column {}",
            action: (i: number) => world.do(actions.focus.partial(i)),
        },
        {
            name: "focus-window-in-column-{}",
            description: "Focus: window {} in column",
            action: (i: number) => world.doFocusLayered(actions.focusWindowInColumn.partial(i), () => {}),
        },
        {
            name: "window-move-to-column-{}",
            description: "Move: window to column {}",
            action: (i: number) => world.doIfTiledFocused(actions.windowMoveToColumn.partial(i)),
        },
        {
            name: "column-move-to-column-{}",
            description: "Move: column to position {}",
            action: (i: number) => world.doIfTiledFocused(actions.columnMoveToColumn.partial(i)),
        },
        {
            name: "column-move-to-desktop-{}",
            defaultModifiers: "Meta+Ctrl",
            description: "Desktop: move column to {}",
            action: (i: number) => world.doIfTiledFocused(actions.columnMoveToDesktop.partial(i)),
        },
        {
            name: "window-move-to-desktop-{}",
            description: "Desktop: move window to {}",
            action: (i: number) => world.doIfTiledFocused(actions.windowMoveToDesktop.partial(i)),
        },
        {
            name: "tail-move-to-desktop-{}",
            description: "Desktop: move this and later columns to {}",
            action: (i: number) => world.doIfTiledFocused(actions.tailMoveToDesktop.partial(i)),
        },
    ];
}
