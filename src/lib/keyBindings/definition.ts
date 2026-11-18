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
            // niri's move grab: the other mouse button toggles floating while a window is dragged (kiri_decorations sends it)
            name: "window-drag-toggle-floating",
            description: "Window: toggle floating while dragging (sent by the right mouse button)",
            action: () => world.toggleDragFloating(),
        },
        {
            // niri's Mod+middle drag (kiri_swipe sends it when the drag goes horizontal; the script then asks for the travel)
            name: "view-scroll-pointer",
            description: "Scroll: start the pointer drag of the view (sent by the middle mouse button)",
            action: () => world.startPointerViewScroll(),
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
            name: "focus-window-previous-workspace",
            description: "Focus: previous-used window on this desktop",
            action: () => world.do((cm, dm) => actions.focusWindowPrevious(cm, dm, "workspace", false)),
        },
        {
            name: "focus-window-previous-output",
            description: "Focus: previous-used window on this screen",
            action: () => world.do((cm, dm) => actions.focusWindowPrevious(cm, dm, "output", false)),
        },
        {
            name: "focus-window-previous-app",
            description: "Focus: previous-used window of the same app",
            action: () => world.do((cm, dm) => actions.focusWindowPrevious(cm, dm, "all", true)),
        },
        {
            name: "focus-window-previous-workspace-app",
            description: "Focus: previous-used window of the same app on this desktop",
            action: () => world.do((cm, dm) => actions.focusWindowPrevious(cm, dm, "workspace", true)),
        },
        {
            name: "focus-window-previous-output-app",
            description: "Focus: previous-used window of the same app on this screen",
            action: () => world.do((cm, dm) => actions.focusWindowPrevious(cm, dm, "output", true)),
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
            name: "window-move-up-no-focus",
            description: "Move: window up, keep the focus in place",
            action: () => world.doIfTiledFocusedOrMoveFloating(actions.windowMoveVerticalNoFocus.partial(true), 0, -50),
        },
        {
            name: "window-move-down-no-focus",
            description: "Move: window down, keep the focus in place",
            action: () => world.doIfTiledFocusedOrMoveFloating(actions.windowMoveVerticalNoFocus.partial(false), 0, 50),
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
            name: "window-swap-left-no-focus",
            description: "Move: swap window left, keep the focus in place",
            action: () => world.doIfTiledFocused((cm, dm, window, column, grid) => actions.swapWindowLeft(cm, dm, window, column, grid, false)),
        },
        {
            name: "window-swap-right-no-focus",
            description: "Move: swap window right, keep the focus in place",
            action: () => world.doIfTiledFocused((cm, dm, window, column, grid) => actions.swapWindowRight(cm, dm, window, column, grid, false)),
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
            name: "column-move-left-no-focus",
            description: "Move: column left, keep the focus in place",
            action: () => world.doIfTiledFocusedOrMoveFloating(actions.columnMoveNoFocus.partial("left"), -50, 0),
        },
        {
            name: "column-move-right-no-focus",
            description: "Move: column right, keep the focus in place",
            action: () => world.doIfTiledFocusedOrMoveFloating(actions.columnMoveNoFocus.partial("right"), 50, 0),
        },
        {
            name: "column-move-start-no-focus",
            description: "Move: column to start, keep the focus in place",
            action: () => world.doIfTiledFocused(actions.columnMoveNoFocus.partial("start")),
        },
        {
            name: "column-move-end-no-focus",
            description: "Move: column to end, keep the focus in place",
            action: () => world.doIfTiledFocused(actions.columnMoveNoFocus.partial("end")),
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
            name: "column-move-to-next-desktop-no-focus",
            description: "Desktop: move column to next, stay on this one",
            action: () => world.doIfTiledFocused((cm, dm, window, column, grid) => actions.columnMoveToNextDesktop(cm, dm, window, column, grid, false)),
        },
        {
            name: "column-move-to-previous-desktop-no-focus",
            description: "Desktop: move column to previous, stay on this one",
            action: () => world.doIfTiledFocused((cm, dm, window, column, grid) => actions.columnMoveToPreviousDesktop(cm, dm, window, column, grid, false)),
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
            name: "window-move-to-next-desktop-no-focus",
            description: "Desktop: move window to next, stay on this one",
            action: () => world.doIfTiledFocused((cm, dm, window, column, grid) => actions.windowMoveToNextDesktop(cm, dm, window, column, grid, false)),
        },
        {
            name: "window-move-to-previous-desktop-no-focus",
            description: "Desktop: move window to previous, stay on this one",
            action: () => world.doIfTiledFocused((cm, dm, window, column, grid) => actions.windowMoveToPreviousDesktop(cm, dm, window, column, grid, false)),
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
            name: "column-move-to-new-desktop-below",
            description: "Move column to a new desktop below this one",
            defaultKeys: ["Meta+Ctrl+Shift+PgDown", "Meta+Ctrl+Shift+U"],
            action: () => world.doIfTiledFocused(actions.columnMoveToNewDesktop.partial(true, true)),
        },
        {
            name: "column-move-to-new-desktop-above",
            description: "Move column to a new desktop above this one",
            defaultKeys: ["Meta+Ctrl+Shift+PgUp", "Meta+Ctrl+Shift+I"],
            action: () => world.doIfTiledFocused(actions.columnMoveToNewDesktop.partial(false, true)),
        },
        {
            name: "window-move-to-new-desktop-below",
            description: "Move window to a new desktop below this one",
            action: () => world.doIfTiledFocused(actions.windowMoveToNewDesktop.partial(true, true)),
        },
        {
            name: "window-move-to-new-desktop-above",
            description: "Move window to a new desktop above this one",
            action: () => world.doIfTiledFocused(actions.windowMoveToNewDesktop.partial(false, true)),
        },
        {
            name: "column-move-to-new-desktop-below-no-focus",
            description: "Desktop: move column to new below, stay on this one",
            action: () => world.doIfTiledFocused(actions.columnMoveToNewDesktop.partial(true, false)),
        },
        {
            name: "column-move-to-new-desktop-above-no-focus",
            description: "Desktop: move column to new above, stay on this one",
            action: () => world.doIfTiledFocused(actions.columnMoveToNewDesktop.partial(false, false)),
        },
        {
            name: "window-move-to-new-desktop-below-no-focus",
            description: "Desktop: move window to new below, stay on this one",
            action: () => world.doIfTiledFocused(actions.windowMoveToNewDesktop.partial(true, false)),
        },
        {
            name: "window-move-to-new-desktop-above-no-focus",
            description: "Desktop: move window to new above, stay on this one",
            action: () => world.doIfTiledFocused(actions.windowMoveToNewDesktop.partial(false, false)),
        },
        {
            name: "unset-desktop-name",
            description: "Remove the name of the current desktop (niri's unset-workspace-name)",
            action: () => world.do(() => world.dynamicDesktops.unsetName()),
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
            name: "window-set-fullscreen",
            description: "Window: set full-screen",
            action: () => setFullScreen(world, true),
        },
        {
            name: "window-unset-fullscreen",
            description: "Window: unset full-screen (also windowed full-screen)",
            action: () => setFullScreen(world, false),
        },
        {
            name: "window-set-windowed-fullscreen",
            description: "Window: set windowed full-screen",
            action: () => setWindowedFullScreen(world, true),
        },
        {
            name: "window-unset-windowed-fullscreen",
            description: "Window: unset windowed full-screen",
            action: () => setWindowedFullScreen(world, false),
        },
        {
            name: "window-set-maximized-to-edges",
            description: "Window: set maximized to edges",
            action: () => world.doIfTiledFocused(actions.windowSetMaximizedToEdges.partial(true)),
        },
        {
            name: "window-unset-maximized-to-edges",
            description: "Window: unset maximized to edges",
            action: () => world.doIfTiledFocused(actions.windowSetMaximizedToEdges.partial(false)),
        },
        {
            name: "overview",
            description: "Overview: toggle",
            defaultKeys: ["Meta+O"],
            action: () => world.toggleOverview(),
        },
        {
            name: "show-hotkey-overlay",
            description: "Overview: show the important hotkeys",
            defaultKeys: ["Meta+Shift+/"],
            action: () => world.showHotkeyOverlay(),
        },
        {
            name: "overview-open",
            description: "Overview: open",
            action: () => world.openOverview(),
        },
        {
            name: "overview-close",
            description: "Overview: close",
            action: () => world.closeOverview(),
        },
    ];
}

// niri's set-window-fullscreen and unset-window-fullscreen. A windowed full-screen window becomes full-screen for
// real on set; on unset, windowed full-screen ends (niri: request_windowed_fullscreen(false)).
function setFullScreen(world: World, fullScreen: boolean) {
    const window = Workspace.activeWindow;
    if (window === null || !window.fullScreenable) {
        return;
    }
    let windowed = false;
    world.doIfTiled(window, (cm, dm, tiled) => {
        windowed = tiled.client.windowedFullScreen && window.fullScreen;
        if (windowed && fullScreen) {
            tiled.makeFullScreenReal();
        } else if (windowed) {
            tiled.toggleWindowedFullScreen();
        }
    });
    if (!windowed && window.fullScreen !== fullScreen) {
        window.fullScreen = fullScreen;
    }
}

// niri's set-windowed-fullscreen and unset-windowed-fullscreen: the application thinks it is full-screen, the tile stays
function setWindowedFullScreen(world: World, windowed: boolean) {
    world.doIfTiledFocused((cm, dm, window) => {
        if ((window.client.windowedFullScreen && window.client.kwinClient.fullScreen) !== windowed) {
            window.toggleWindowedFullScreen();
        }
    });
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

// niri's focus-workspace N and focus-workspace "name": with workspace-auto-back-and-forth, asking for the desktop that
// is shown goes to the previous one (monitor.rs switch_workspace_auto_back_and_forth)
function focusDesktop(world: World, index: number) {
    const desktop = Workspace.desktops[index];
    if (desktop === undefined) {
        return;
    }
    if (world.desktopAutoBackAndForth && desktop === Workspace.currentDesktop) {
        switchToPreviousDesktop(world);
    } else {
        switchToDesktop(index);
    }
}

// the desktop a "...-named-N" shortcut means: the Nth name of the niri binds
function boundDesktopIndex(world: World, slot: number) {
    const name = world.desktopBindNames[slot];
    const desktop = name === undefined ? undefined : world.dynamicDesktops.findByName(name);
    return desktop === undefined ? -1 : Workspace.desktops.indexOf(desktop);
}

function getNumKeyBindings(world: World, actions: Actions): NumKeyBinding[] {
    return [
        {
            name: "desktop-{}",
            description: "Desktop: go to {}",
            defaultModifiers: "Meta",
            action: (i: number) => focusDesktop(world, actions.config.clampDesktopIndex(i)),
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
            name: "column-width-set-{}",
            description: "Width: set to entry {} of the list of widths to set",
            action: (i: number) => {
                const change = actions.config.columnWidthChanges[i];
                if (change !== undefined) {
                    world.doIfTiledFocusedOrFloating(actions.columnWidthSet.partial(change), actions.floatingSizeSet.partial(true, change));
                }
            },
        },
        {
            name: "window-height-set-{}",
            description: "Height: set to entry {} of the list of heights to set",
            action: (i: number) => {
                const change = actions.config.windowHeightChanges[i];
                if (change !== undefined) {
                    world.doIfTiledFocusedOrFloating(actions.windowHeightSet.partial(change), actions.floatingSizeSet.partial(false, change));
                }
            },
        },
        {
            name: "column-move-to-column-no-focus-{}",
            description: "Move: column to position {}, keep the focus in place",
            action: (i: number) => world.doIfTiledFocused(actions.columnMoveNoFocus.partial(i)),
        },
        {
            name: "column-move-to-desktop-no-focus-{}",
            description: "Desktop: move column to {}, stay on this one",
            action: (i: number) => world.doIfTiledFocused((cm, dm, window, column, grid) => actions.columnMoveToDesktop(i, cm, dm, window, column, grid, false)),
        },
        {
            name: "window-move-to-desktop-no-focus-{}",
            description: "Desktop: move window to {}, stay on this one",
            action: (i: number) => world.doIfTiledFocused((cm, dm, window, column, grid) => actions.windowMoveToDesktop(i, cm, dm, window, column, grid, false)),
        },
        {
            name: "tail-move-to-desktop-{}",
            description: "Desktop: move this and later columns to {}",
            action: (i: number) => world.doIfTiledFocused(actions.tailMoveToDesktop.partial(i)),
        },
        {
            name: "move-desktop-to-index-{}",
            description: "Move the current desktop to position {} (niri's move-workspace-to-index)",
            action: (i: number) => world.do((clientManager, desktopManager) => world.dynamicDesktops.moveCurrentToIndex(desktopManager, i)),
        },
        {
            name: "desktop-named-{}",
            description: "Switch to the {}th desktop name of the niri binds (niri's focus-workspace \"name\")",
            action: (i: number) => {
                const index = boundDesktopIndex(world, i);
                if (index >= 0) {
                    focusDesktop(world, index);
                }
            },
        },
        {
            name: "column-move-to-desktop-named-{}",
            description: "Move column to the {}th desktop name of the niri binds (niri's move-column-to-workspace \"name\")",
            action: (i: number) => {
                const index = boundDesktopIndex(world, i);
                if (index >= 0) {
                    world.doIfTiledFocused(actions.columnMoveToDesktop.partial(index));
                }
            },
        },
        {
            name: "window-move-to-desktop-named-{}",
            description: "Move window to the {}th desktop name of the niri binds (niri's move-window-to-workspace \"name\")",
            action: (i: number) => {
                const index = boundDesktopIndex(world, i);
                if (index >= 0) {
                    world.doIfTiledFocused(actions.windowMoveToDesktop.partial(index));
                }
            },
        },
        {
            name: "set-desktop-name-{}",
            description: "Name the current desktop with the {}th desktop name of the niri binds (niri's set-workspace-name)",
            action: (i: number) => {
                const name = world.desktopBindNames[i];
                if (name !== undefined) {
                    world.do(() => world.dynamicDesktops.setName(name));
                }
            },
        },
    ];
}

// niri's "Important Hotkeys" list: these actions with the keys they have now (the keys typed into Kiri's settings or imported
// from a niri config, else the default keys)
const IMPORTANT_HOTKEYS: [string, string][] = [
    ["show-hotkey-overlay", "Show Important Hotkeys"],
    ["overview", "Open the Overview"],
    ["window-close", "Close Focused Window"],
    ["focus-left", "Focus Column to the Left"],
    ["focus-right", "Focus Column to the Right"],
    ["focus-down", "Focus Window Below"],
    ["focus-up", "Focus Window Above"],
    ["column-move-left", "Move Column Left"],
    ["column-move-right", "Move Column Right"],
    ["window-move-down", "Move Window Down"],
    ["window-move-up", "Move Window Up"],
    ["desktop-next", "Switch to the Next Desktop"],
    ["desktop-previous", "Switch to the Previous Desktop"],
    ["column-move-to-next-desktop", "Move Column to the Next Desktop"],
    ["column-move-to-previous-desktop", "Move Column to the Previous Desktop"],
    ["cycle-preset-widths", "Switch Preset Column Widths"],
    ["column-width-maximize", "Maximize Column"],
    ["window-toggle-fullscreen", "Full-screen Window"],
    ["window-toggle-floating", "Toggle Floating"],
    ["column-toggle-tabbed", "Toggle Tabbed Column"],
];

function getHotkeyOverlayText(shortcutKeys: Record<string, string[]>) {
    const empty: any = {};
    const defaults = new Map<string, string[]>();
    for (const shortcut of getShortcuts(empty, empty)) {
        defaults.set(shortcut.name, shortcut.defaultKeys);
    }
    const lines: string[] = [];
    for (const [name, title] of IMPORTANT_HOTKEYS) {
        const keys = shortcutKeys[name] ?? defaults.get(name) ?? [];
        if (keys.length > 0) {
            lines.push(`${keys.join(" / ")}: ${title}`);
        }
    }
    return lines.join("\n");
}
