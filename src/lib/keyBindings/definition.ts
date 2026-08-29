function getKeyBindings(world: World, actions: Actions): KeyBinding[] {
    return [
        {
            name: "window-toggle-floating",
            description: "Toggle floating",
            defaultKeys: ["Meta+V"],
            action: () => world.do(actions.windowToggleFloating),
        },
        {
            name: "focus-left",
            description: "Move focus left",
            defaultKeys: ["Meta+H", "Meta+Left"],
            action: () => world.doIfTiledFocused(actions.focusLeft),
        },
        {
            name: "focus-right",
            description: "Move focus right",
            defaultKeys: ["Meta+L", "Meta+Right"],
            action: () => world.doIfTiledFocused(actions.focusRight),
        },
        {
            name: "focus-up",
            description: "Move focus up",
            defaultKeys: ["Meta+K", "Meta+Up"],
            action: () => world.doIfTiledFocused(actions.focusUp),
        },
        {
            name: "focus-down",
            description: "Move focus down",
            defaultKeys: ["Meta+J", "Meta+Down"],
            action: () => world.doIfTiledFocused(actions.focusDown),
        },
        {
            name: "focus-next",
            description: "Move focus to the next window in grid",
            action: () => world.doIfTiledFocused(actions.focusNext),
        },
        {
            name: "focus-previous",
            description: "Move focus to the previous window in grid",
            action: () => world.doIfTiledFocused(actions.focusPrevious),
        },
        {
            name: "focus-start",
            description: "Move focus to start",
            defaultKeys: ["Meta+Home"],
            action: () => world.do(actions.focusStart),
        },
        {
            name: "focus-end",
            description: "Move focus to end",
            defaultKeys: ["Meta+End"],
            action: () => world.do(actions.focusEnd),
        },
        {
            name: "window-move-left",
            description: "Move window left",
            defaultKeys: ["Meta+["],
            action: () => world.doIfTiledFocused(actions.windowMoveLeft),
        },
        {
            name: "window-move-right",
            description: "Move window right",
            defaultKeys: ["Meta+]"],
            action: () => world.doIfTiledFocused(actions.windowMoveRight),
        },
        {
            name: "window-move-up",
            description: "Move window up",
            defaultKeys: ["Meta+Shift+K", "Meta+Shift+Up"],
            action: () => world.doIfTiledFocused(actions.windowMoveUp),
        },
        {
            name: "window-move-down",
            description: "Move window down",
            defaultKeys: ["Meta+Shift+J", "Meta+Shift+Down"],
            action: () => world.doIfTiledFocused(actions.windowMoveDown),
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
            name: "column-toggle-stacked",
            description: "Toggle stacked layout for focused column",
            defaultKeys: ["Meta+W"],
            action: () => world.doIfTiledFocused(actions.columnToggleStacked),
        },
        {
            name: "column-move-left",
            description: "Move column left",
            defaultKeys: ["Meta+Shift+H", "Meta+Shift+Left"],
            action: () => world.doIfTiledFocused(actions.columnMoveLeft),
        },
        {
            name: "column-move-right",
            description: "Move column right",
            defaultKeys: ["Meta+Shift+L", "Meta+Shift+Right"],
            action: () => world.doIfTiledFocused(actions.columnMoveRight),
        },
        {
            name: "column-move-start",
            description: "Move column to start",
            defaultKeys: ["Meta+Shift+Home"],
            action: () => world.doIfTiledFocused(actions.columnMoveStart),
        },
        {
            name: "column-move-end",
            description: "Move column to end",
            defaultKeys: ["Meta+Shift+End"],
            action: () => world.doIfTiledFocused(actions.columnMoveEnd),
        },
        {
            name: "column-move-to-next-desktop",
            description: "Move column to the next desktop",
            defaultKeys: ["Meta+Shift+PgDown", "Meta+Shift+U"],
            action: () => world.doIfTiledFocused(actions.columnMoveToNextDesktop),
        },
        {
            name: "column-move-to-previous-desktop",
            description: "Move column to the previous desktop",
            defaultKeys: ["Meta+Shift+PgUp", "Meta+Shift+I"],
            action: () => world.doIfTiledFocused(actions.columnMoveToPreviousDesktop),
        },
        {
            name: "column-width-increase",
            description: "Increase column width",
            defaultKeys: ["Meta+="],
            action: () => world.doIfTiledFocused(actions.columnWidthIncrease),
        },
        {
            name: "column-width-decrease",
            description: "Decrease column width",
            defaultKeys: ["Meta+-"],
            action: () => world.doIfTiledFocused(actions.columnWidthDecrease),
        },
        {
            name: "column-width-maximize",
            description: "Increase column width to maximum",
            defaultKeys: ["Meta+F"],
            action: () => world.doIfTiledFocused(actions.columnWidthMaximize),
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
            action: () => world.doIfTiledFocused(actions.cyclePresetWidths),
        },
        {
            name: "cycle-preset-widths-reverse",
            description: "Cycle through preset column widths in reverse",
            action: () => world.doIfTiledFocused(actions.cyclePresetWidthsReverse),
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
            action: () => world.doIfTiledFocused(actions.gridScrollFocused),
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
            name: "window-close",
            description: "Close window",
            defaultKeys: ["Meta+Q"],
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
            description: "Open the overview",
            defaultKeys: ["Meta+O"],
            action: () => kglobalaccel.call("/component/kwin", "org.kde.kglobalaccel.Component", "invokeShortcut", ["s"], ["Overview"], () => {}),
        },
    ];
}

function currentDesktopIndex() {
    return Workspace.desktops.indexOf(Workspace.currentDesktop);
}

function switchToDesktop(index: number) {
    const desktop = Workspace.desktops[index];
    if (desktop !== undefined) {
        Workspace.currentDesktop = desktop;
    }
}

function getNumKeyBindings(world: World, actions: Actions): NumKeyBinding[] {
    return [
        {
            name: "desktop-{}",
            description: "Switch to desktop {}",
            defaultModifiers: "Meta",
            action: (i: number) => switchToDesktop(i),
        },
        {
            name: "focus-{}",
            description: "Move focus to column {}",
            action: (i: number) => world.do(actions.focus.partial(i)),
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
            name: "tail-move-to-desktop-{}",
            description: "Move this and all following columns to desktop {}",
            action: (i: number) => world.doIfTiledFocused(actions.tailMoveToDesktop.partial(i)),
        },
    ];
}
