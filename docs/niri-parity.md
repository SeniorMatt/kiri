# niri parity list for Kiri 1.0

Goal: every niri feature, behaving like niri. Source of truth: niri `main` (release v26.04 line): `niri-config/src/*.rs`,
`src/layout/*.rs`, `src/input/*.rs`, `docs/wiki/*.md`, `resources/default-config.kdl`. Line numbers are niri `main` as read on
2026-11-24 and drift; function names are stable. Kiri checked at commit 7ddc096 (0.10.10).

Status: **done** = same behaviour; **partial** = works but differs or lacks options (the Kiri column says what);
**missing** = not implemented, feasible in KWin; **impossible** = KWin gives scripts/effects no way (reason given);
**n/a** = not window management, or Plasma owns it.

Kiri places: `TS` = `src/lib/...`; `FX` = `effect-cpp/<name>/`; `QML` = `package/contents/ui/` or `effect-cpp/overview/qml/`.
Tests: names are files in `src/tests/flows/` (`units/` for units); "-" = no test (visual or KWin-only).

Counts: done 89, partial 32, missing 50, impossible 8, n/a 30 (209 rows).

The subtle behaviours are in these rows: focus after close, new-window placement and column width rounding (3.1), scroll
animations and gesture scrolling (3.1), interactive move and resize (3.2), workspace creation, removal and back-and-forth (4),
overview interactions (5).

This replaces the earlier checklist (which had a few stale entries: the wheel binds, `move-workspace-up/down`, the hot corner and
`toggle-windowed-fullscreen` are now implemented).

## 1. Layout options (`layout {}`)

| Item | niri behaviour | niri source | Status | Kiri | Test |
|---|---|---|---|---|---|
| gaps | one number: inner gap and outer gap | layout.rs `gaps`; scrolling.rs `resolve_column_width` 4579 | done | `gapsInner*`/`gapsOuter*` (two inner, four outer) in config/definition.ts; superset | layout, columnWidthView |
| struts | extra outer space per side (may be negative) added to gaps | layout.rs `Struts` | partial | native: `gapsOuter*` (no negative values: UInt); import adds strut to gap (niri/import.ts) | NiriImport |
| focus-ring on/off/width/active-color/inactive-color | ring around the focused window, width 4, #7fc8ff / #505050 | appearance.rs `FocusRing` 232 | done | `focusRing*`; QML Ring.qml, FX src/ (kiri_decorations) | focusMatrix (ring rule) |
| focus-ring urgent-color, gradients (`from/to/angle/relative-to/in`) | urgent window ring #9b0000; linear gradients with colour-space interpolation | appearance.rs 87-142, 232 | done | `focusRing{Active,Inactive,Urgent}{Color,Gradient}`; gradient math is niri's border.frag ported (shaders/kiri_ring_core.frag: srgb, srgb-linear, oklab, oklch with hue interpolation, window or workspace-view area); urgent from KWin `demandsAttention` (Kiri.ts `setWindowUrgent`) | decorations, NiriImport |
| border on/off/width/colours | border inside the tile, off by default, #ffc87f / #505050 | appearance.rs `Border` 259 | done | `border*`; FX src/ | - |
| border urgent colour, gradients | as for focus-ring | appearance.rs 259 | done | `border{Urgent,Active,Inactive}{Color,Gradient}`, same shader | decorations, NiriImport |
| shadow (on, offset, softness, spread, draw-behind-window, color, inactive-color) | drop shadow under tiled and floating windows, off by default | appearance.rs `Shadow` 342; layout/shadow.rs | done | `shadow*` keys; shaders/kiri_shadow_core.frag is niri's shadow.frag (Evan Wallace's gaussian box shadow), geometry as layout/shadow.rs; FX drawShadow | decorations, NiriImport |
| tab-indicator off/on, width, gap, length total-proportion, position, hide-when-single-tab | bar of tabs at the side of a tabbed column | appearance.rs `TabIndicator` 459; layout/tab_indicator.rs | done | `tabIndicator*`; FX src/ + QML TabIndicator.qml + Column.ts tab geometry | tabbed |
| tab-indicator place-within-column, gaps-between-tabs, corner-radius, active/inactive/urgent colour and gradient | window shrinks to make room; spaced tabs; own colours | appearance.rs 459-561 | done | `tabIndicator*` keys; Column.ts `tabRects` / `tabIndicatorExtra` and FX `tabRects` are niri's tab_rects / extra_size; colours fall back to the focus ring's (or the border's) like TabInfo::from_tile; a click on a tab (FX clickOnTab) shows its window; inactive columns dim to 50% alpha | decorations |
| insert-hint (on/off, color, gradient) | translucent rectangle where a dragged window will land, default rgba(127,200,255,128) | appearance.rs `InsertHint` 580; layout/insert_hint_element.rs | done | `insertHint{Enabled,Color,Gradient}`; FX drawInsertHint is a gradient fill like insert_hint_element.rs (a focus ring of width 0) | decorations, dragTiled, overview |
| preset-column-widths | list of `proportion`/`fixed`, default 1/3, 1/2, 2/3 | layout.rs `PresetSize` | done | `presetWidths` ("33.333%, 50%, 66.667%", `px` too); behavior/PresetWidths.ts | presetWidths, units/behavior/PresetWidths |
| preset-window-heights | same for heights | layout.rs | done | `presetHeights`; Column.ts | windowHeights |
| default-column-width | initial width; empty block = window decides; default proportion 0.5 | layout.rs 43, `DefaultPresetSize` | done | `defaultColumnWidth` ("" = window's own); import handles the empty block | behaviorOptions |
| center-focused-column never/always/on-overflow | when to centre on focus change | scrolling.rs 655-710 | done | `scrollingLazy/Centered/OnOverflow` (+ Kiri-only `scrollingGrouped`); behavior/scroller/*.ts | behaviorOptions, centerFocused |
| always-center-single-column | lone column centred | scrolling.rs `compute_new_view_offset` 5647 | done | `alwaysCenterSingleColumn`; scrollClamper/*.ts | singleColumnResize |
| empty-workspace-above-first | extra empty workspace above the first one too | layout.rs; monitor.rs `clean_up_workspaces` 664 | done | `emptyDesktopAboveFirst` (needs `dynamicDesktops`); DynamicDesktops.ts `ensureEmptyDesktops`, `cleanup` incl. niri's two-empty special case | workspaces |
| default-column-display normal/tabbed | new columns tabbed | layout.rs; scrolling.rs | done | `tabbedColumnsByDefault`; Column.ts | tabbed |
| background-color | colour behind the workspace (wallpaper replaced) | layout.rs; appearance.rs `DEFAULT_BACKGROUND_COLOR` | done | `backgroundColor` (empty keeps the wallpaper). The wallpaper is Plasma's desktop window, which the FX paints as a solid colour instead of drawing it (drawWindow on `isDesktop()`), so desktop icons and widgets go too. Not exercised visually: the nested KWin has no plasmashell | decorations (config only) |
| fullscreen-backdrop-color | solid backdrop behind a full-screen window (default black; transparent lets it see through) | layout.rs; tile.rs 1285; wiki Fullscreen-and-Maximize | done | `fullscreenBackdropColor`; FX drawBackdrop paints it over the whole screen under a full-screen window, faded in with the expand spring | decorations (config only) |
| Per-workspace `layout {}` override | named workspace with its own layout options | workspace.rs `WorkspaceLayoutPart` | missing | config is global (`Config`) | - |
| Per-output `layout {}` / `background-color` / `backdrop-color` / `hot-corners` | per monitor override | output.rs | missing | single global config | - |

## 2. Column and window sizing, actions (`binds {}`)

Action list = niri `Action` enum, `niri-config/src/binds.rs` 240-540 (every variant, including those marked `skip` = IPC only).

### 2.1 Focus

| Item | niri behaviour | niri source | Status | Kiri | Test |
|---|---|---|---|---|---|
| focus-column-left/right, first/last | no wrapping | scrolling.rs `focus_left` etc. | done | `focus-left/right/start/end`; Grid.ts, World.ts `doFocusInDirection` | layout, focusMatrix |
| focus-column-right-or-first, left-or-last | wraps | scrolling.rs | done | same names in keyBindings/definition.ts | nirActions |
| focus-column N | clamps to the last | scrolling.rs 1610 | done | `focus-{}` | nirActions |
| focus-window-up/down | in the column; tabs in tabbed columns | scrolling.rs | done | `focus-up/down` | layout |
| focus-window-down-or-column-left/right, up-or-column-left/right | at column end, go to neighbour column | scrolling.rs | done | `focus-window-*-or-column-*` | nirActions |
| focus-window-top/bottom, down-or-top, up-or-bottom | | scrolling.rs | done | `focus-window-top` etc. | nirActions |
| focus-window-in-column N | 1-based, clamps | scrolling.rs 1618 | done | `focus-window-in-column-{}` | nirActions |
| focus-window-or-workspace-up/down | window, else workspace | layout/mod.rs | done | `focus-window-or-desktop-up/down` | nirActions |
| focus-window-previous (scope, filter props) | go to the previously focused window (MRU) | niri.rs `focus_window_previous`; ui/mru.rs | done | `focus-window-previous` and the `scope`/`filter` variants `focus-window-previous-{workspace,output,app,workspace-app,output-app}` (ClientManager.findPreviousFocused); the import picks the variant | nirActions, niriSizeActions |
| focus-window-or-monitor-up/down, focus-column-or-monitor-left/right | window/column, else monitor | layout/mod.rs | done | one output only: the import maps them to `focus-up/down`, `focus-left/right` (niri does exactly that when no output lies in that direction); other monitors do not exist for Kiri (see focus-monitor) | NiriImport |
| focus-floating, focus-tiling, switch-focus-between-floating-and-tiling | layer focus | layout/workspace.rs | done | `focus-floating`, `focus-tiling`, `window-switch-focus-floating-tiling` | floatingKeys, leaveUntiled |
| focus-workspace-down/up, N, previous | | monitor.rs | done | `desktop-next/previous`, `desktop-{}`, `desktop-previous-used`; DesktopManager.ts, DynamicDesktops.ts `clampIndex` | keyBindings, dynamicDesktops |
| focus-workspace "name" | by workspace name | layout/mod.rs `find_workspace_by_name` | done | `desktop-named-N` (the Nth name of `desktopBindNames`, which the importer fills); DynamicDesktops.ts `findByName` | workspaces |
| focus-monitor-left/right/up/down/next/previous/NAME | | layout/mod.rs | n/a | desktops are shared by every output; Kiri keeps one grid per desktop on the chosen screen. `screen-switch` is the nearest thing | - |
| focus-window ID (IPC) | | binds.rs `skip` | n/a | no IPC | - |

### 2.2 Move

| Item | niri behaviour | niri source | Status | Kiri | Test |
|---|---|---|---|---|---|
| move-column-left/right, to-first/last, to-index | keeps the column in view; `focus=false` property | scrolling.rs | done | `column-move-*` and `column-move-to-column-{}` keep niri's focus; `focus=false` is `column-move-{left,right,start,end}-no-focus` and `column-move-to-column-no-focus-{}` (Actions.columnMoveNoFocus: the column that took the place gets the focus); the import maps `focus=false` | layout, nirActions, niriSizeActions, NiriImport |
| move-window-up/down | inside the column; `focus` property | scrolling.rs | done | `window-move-up/down`; `focus=false` is `window-move-{up,down}-no-focus` (Actions.windowMoveVerticalNoFocus); `swap-window-left/right focus=false` is `window-swap-{left,right}-no-focus` | layout, niriSizeActions, NiriImport |
| move-window-down-or-to-workspace-down, up | | layout/mod.rs | done | `window-move-down-or-to-desktop-down` etc. | nirActions |
| consume-or-expel-window-left/right, consume-window-into-column, expel-window-from-column | | scrolling.rs | done | `window-consume-or-expel-*`, `window-consume-into-column`, `window-expel-from-column` | layout |
| swap-window-left/right | swap with the neighbour column's window | scrolling.rs | done | `window-swap-left/right` | nirActions |
| move-column-left-or-to-monitor-left, right | move, else to monitor | layout/mod.rs | done | one output only: the import maps them to `column-move-left/right`, which is what niri does with no output in that direction | NiriImport |
| move-column-to-workspace-down/up/N | follows the column unless `focus=false` | layout/mod.rs | done | `column-move-to-*desktop*`; `focus=false`: `column-move-to-next/previous-desktop-no-focus`, `column-move-to-desktop-no-focus-N` | columnMoveToDesktop, followWindowToDesktop, workspaces |
| move-window-to-workspace-down/up/N | same for a window | layout/mod.rs | done | `window-move-to-*desktop*`; `focus=false`: `window-move-to-next/previous-desktop-no-focus`, `window-move-to-desktop-no-focus-N` | followWindowToDesktop, workspaces |
| move-column-to-workspace "name", move-window-to-workspace "name" | | layout/mod.rs | done | `column-move-to-desktop-named-N`, `window-move-to-desktop-named-N` (see focus-workspace "name"); `focus=false` with a name is not mapped | workspaces |
| move-window-to-new-workspace-below/above, move-column-to-new-workspace-below/above | new workspace next to the current one | layout/mod.rs | done | `window/column-move-to-new-desktop-below/above` (+ `-no-focus`); the empty desktop at the bottom/top is reused like `add_or_reuse_empty_workspace_at`; a workspace reference argument is not mapped | workspaces |
| move-window/column-to-monitor-* | | layout/mod.rs | n/a | see focus-monitor | - |
| move-workspace-down/up | reorder workspaces | monitor.rs `move_workspace_down` 1257 | done | `desktop-move-down/up` emulated by replacing the neighbour desktop (DynamicDesktops.moveCurrent: columns, view and focus move along, named stays named, previous desktop follows); KWin cannot reorder | dynamicDesktops, workspaces |
| move-workspace-to-index N | | monitor.rs | done | `move-desktop-to-index-N`, the same emulation repeated | workspaces |
| move-workspace-to-monitor-* | | layout/mod.rs | n/a | no monitors | - |
| set-workspace-name / unset-workspace-name | name a workspace | layout/mod.rs 4683 | done | `set-desktop-name-N` (the Nth of `desktopBindNames`), `unset-desktop-name`; the script sets `desktop.name` (works on a live KWin). A named desktop counts as occupied; its id is kept in Kiri's saved state. The `reference` variants are not mapped | workspaces |

### 2.3 Sizes, display, state

| Item | niri behaviour | niri source | Status | Kiri | Test |
|---|---|---|---|---|---|
| switch-preset-column-width, -back | next preset wider than now, wraps | scrolling.rs `toggle_width` 4991 | done | `cycle-preset-widths`, `-reverse`; PresetWidths.ts | presetWidths |
| switch-preset-window-width, -back | the column width cycles through the presets, measured at that window | scrolling.rs 2691 | done | in niri's scrolling layout a window's width is its column's (`toggle_window_width` calls the column's `toggle_width`), so the actions are `cycle-preset-widths(-reverse)`; the import maps both names | presetWidths, NiriImport |
| switch-preset-window-height, -back | | scrolling.rs 5198 | done | `window-height-cycle-presets(-reverse)` | windowHeights |
| reset-window-height | back to auto | scrolling.rs | done | `window-height-reset` | windowHeights |
| maximize-column | toggle full width (proportion 1.0), restores | scrolling.rs `toggle_full_width` 5042 | done | `column-width-maximize` | maximizeToggles |
| maximize-window-to-edges | toggle maximize to work-area edges | scrolling.rs 2961 | done | `window-maximize-to-edges` | maximizeToggles |
| expand-column-to-available-width | | scrolling.rs 2833 | done | `column-width-expand` | behaviorOptions |
| set-column-width "+10%" / "-10%" | proportion step of the working area | scrolling.rs 5054 | done | `column-width-increase/decrease`, step `columnWidthStep` | nirActions, columnWidthView |
| set-column-width "50%" / "800" (absolute) | set exactly | scrolling.rs 5054 | done | `column-width-set-{}`: entry N of the new setting `columnWidthSet` ("50%, 800, +100, -5%", niri's SizeChange syntax, px or %, set or change); tiled and floating windows; the import fills the setting and binds the slot (12 slots) | niriSizeActions, NiriImport |
| set-window-width (absolute or relative) | per window | scrolling.rs | done | same as set-column-width: niri's scrolling layout sets the column's width (`Scrolling::set_window_width` calls `Column::set_column_width`); the import maps it to the same slots | niriSizeActions, NiriImport |
| set-window-height "+-10%" | | scrolling.rs 5104 | done | `window-height-increase/decrease` | nirActions |
| set-window-height "50%" / "400" (absolute) |  | scrolling.rs 5104 | done | `window-height-set-{}`: entry N of the setting `windowHeightSet`, same syntax; tiled and floating windows; the import fills it (12 slots) | niriSizeActions, NiriImport |
| toggle-column-tabbed-display, set-column-display normal/tabbed | | scrolling.rs 2208 | done | `column-toggle-tabbed`, `column-display-normal/tabbed` | tabbed, nirActions |
| center-column, center-window | centre the column (floating: centre the window) | scrolling.rs 2247; workspace.rs 1199 | done | `grid-scroll-focused`; floating via windowRules | centerFocused, windowRules |
| center-visible-columns | centre the group of visible columns | scrolling.rs 2284 | done | `column-center-visible` | centerFocused |
| fullscreen-window (toggle) | | layout/mod.rs; scrolling.rs 2930 | done | `window-toggle-fullscreen` | fullScreenToggle |
| set-window-fullscreen, unset-window-fullscreen | explicit, not toggling | binds.rs 296-301 | done | `window-set-fullscreen`, `window-unset-fullscreen` (a windowed full-screen window becomes real on set; unset ends windowed full-screen too, like niri's `set_fullscreen`) | niriSizeActions, NiriImport |
| toggle-windowed-fullscreen | app thinks full-screen, window keeps its tile | wiki Fullscreen-and-Maximize | done | `window-toggle-windowed-fullscreen` | windowedFullScreen |
| set/unset-windowed-fullscreen, set/unset-window-maximized-to-edges | explicit | binds.rs 302-313 | done | `window-set-windowed-fullscreen`, `window-unset-windowed-fullscreen`, `window-set-maximized-to-edges`, `window-unset-maximized-to-edges` | niriSizeActions, NiriImport |
| toggle-window-floating, move-window-to-floating, move-window-to-tiling | | layout/mod.rs | done | `window-toggle-floating`, `window-move-to-floating/tiling` | floatingKeys |
| move-floating-window -x -y (relative or absolute) | position a floating window | binds.rs `MoveFloatingWindowById` | n/a | `MoveFloatingWindowById` is `knuffel(skip)`: only `niri msg action move-floating-window` (IPC) has it, a config bind cannot; the arrow keys move floating windows by 50 px | floatingKeys |
| close-window | | | done | `window-close` | closePick |
| toggle-overview, open-overview, close-overview |  | layout/mod.rs 4758 | done | `overview` toggles, `overview-open` and `overview-close` do nothing when the overview is already in that state | overview, niriSizeActions |
| toggle-window-rule-opacity | flips the rule's opacity | binds.rs | done | `window-toggle-rule-opacity` (no default key, like niri) | windowRules |
| set-dynamic-cast-window/monitor, clear-dynamic-cast-target, stop-cast | screencast target | binds.rs | n/a | Plasma screencasts through KWin/xdg-portal | - |
| switch-layout | keyboard layout | binds.rs | n/a | Plasma keyboard KCM | - |
| show-hotkey-overlay | list of binds | binds.rs; ui/hotkey_overlay.rs | partial | `show-hotkey-overlay`: a notification ("Important Hotkeys") with the keys the important actions have now (Kiri's settings, an imported niri config, else the defaults); keys set only on Plasma's Shortcuts page are not seen; not a QML overlay | niriSizeActions |
| spawn, spawn-sh, spawn-at-startup | run commands | binds.rs, misc.rs | n/a | Plasma custom shortcuts and autostart | - |
| screenshot, screenshot-screen, screenshot-window, screenshot-path | | binds.rs, misc.rs | n/a | Spectacle | - |
| quit, suspend, power-off/on-monitors, change-vt, toggle-touchpad, do-screen-transition | session and hardware | binds.rs | n/a | Plasma | - |
| toggle-keyboard-shortcuts-inhibit | | binds.rs | n/a | KWin's own inhibit key | - |
| toggle-debug-tint, debug-toggle-opaque-regions, debug-toggle-damage | | binds.rs | n/a | niri renderer debugging | - |
| load-config-file, mru-* (skip) | | binds.rs | n/a | | - |
| `*-by-id` variants (IPC) | | binds.rs `skip` | n/a | niri has an IPC socket; Kiri only has D-Bus debug hooks in the effects | - |

### 2.4 Bind syntax

| Item | niri behaviour | niri source | Status | Kiri | Test |
|---|---|---|---|---|---|
| Key triggers with Mod/Super/Ctrl/Shift/Alt | | binds.rs `Trigger` | done | kglobalaccel via KGlobalAccelBridge.qml; keySequence.ts; import convertKey | keyBindings, units/niri/NiriImport |
| `Mod` = Super (mod-key / mod-key-nested) | configurable | input.rs `ModKey` | done | the import reads `input { mod-key }` (Super, Alt, Ctrl, Shift; the ISO_Level shifts have no Qt modifier and are reported) and makes `Mod` that modifier in the keys it writes; Kiri's own default keys stay on Meta; `mod-key-nested` is only for nested niri | NiriImportConfigs |
| Mouse-wheel triggers WheelScroll up/down/left/right with `cooldown-ms` | binds | binds.rs `Trigger` | done | the setting `pointerBinds` ("Meta+WheelScrollDown=desktop-next@150;...", default: niri's default config's twelve binds); the effect registers them (DecorationsEffect.cpp `registerPointerBinds`, re-registered when the setting changes), `cooldown-ms` is the `@ms`; the import writes the setting from the wheel binds (none in the config: none left, like niri); checked in a nested KWin with injected wheel events | NiriImportConfigs (import); nested KWin (effect) |
| Mouse-button triggers (MouseLeft, ...), TouchpadScroll*, TabletStylusButton* | binds | binds.rs | partial | MouseLeft/Right/Middle/Back/Forward with modifiers work like the wheel binds (`registerPointerShortcut`; `pointerBinds`; imported); TouchpadScroll* has no KWin hook (`registerAxisShortcut` gives neither the source nor ticks, so it cannot tell a touchpad from a wheel), TabletStylusButton* has none either | NiriImportConfigs; nested KWin |
| `repeat=false`, `allow-when-locked`, `allow-inhibiting`, `hotkey-overlay-title`, `cooldown-ms` | bind properties | binds.rs 209-233 | partial | keys repeat per action (the NO_REPEAT list: close, toggles, overview), not per bind; `cooldown-ms` works on wheel and mouse button binds (`@ms` in `pointerBinds`, imported) but not on keys; `allow-when-locked`, `allow-inhibiting`, `hotkey-overlay-title` are not read (the import ignores them: they change nothing Kiri can do) | floatingKeys ("A held key repeats move keys but not toggles") |
| `Mod release { toggle-overview }` | action on release | binds.rs `BoundAction::Release` | impossible | kglobalaccel cannot bind a bare modifier or a release; Plasma uses it for the launcher | - |
| Press and Release actions |  | binds.rs | impossible | same; a `press { action }` block is imported as a plain bind, a `release` one is reported as skipped | - |
| niri `include` | split config | wiki Configuration:-Include | impossible | KWin scripts cannot read files; use `tools/niri2kiri.py`, which reads the file and writes kwinrc | - |
| Import: paste a config.kdl into settings | n/a for niri |  | done | niri/import.ts, niri/kdl.ts, tools/niri2kiri.py (the same result: `--json` prints it, the test compares both); every bind and option of a config is mapped or reported on stderr as `<path>: <reason>` (`SKIPPED_OPTIONS`, `UNMAPPED` in both importers) | units/niri/NiriImport, NiriImportConfigs (the owner's config and niri's default config) |

## 3. Scrolling, animation, input behaviour

### 3.1 Scrolling and layout behaviours

| Item | niri behaviour | niri source | Status | Kiri | Test |
|---|---|---|---|---|---|
| Focus after closing a column | the column that takes its index (right neighbour) gets focus, the last goes left; a window opened right of the active column returns focus to its origin with the old view | scrolling.rs `remove_column_by_idx` 1192 | done | Grid.ts `onColumnRemoved`, FocusPassing.ts | closeFocus |
| Focus after closing a window in a column | tile below, else above | scrolling.rs `remove_tile_by_idx` 1074 | done | Column.ts, FocusPassing.ts | closeFocus |
| Focus after closing a floating or full-screen window | | layout/mod.rs; workspace.rs | done | ClientManager.ts | closeFullScreen, closePick |
| New window placement | new column right of the active column; width from default-column-width / rule; window rule heights | scrolling.rs `add_tile` 903, `new_window_size` 516 | done | ClientManager.ts `addClient`, Tiled.ts, Grid.ts | layout, windowRules |
| New window opens floating if it has a parent or has a fixed height | | window/mod.rs `compute_open_floating` 377 | done | a dialog with a parent floats; so does a window whose min and max height are the same (rules/WindowRuleEnforcer.ts `hasFixedHeight`); windows that cannot be resized at all (Clients.canTileEver) float as well; `open-floating false` tiles a dialog or fixed-height window that can be resized | leaveUntiled, windowRules |
| New window gets focus; `open-focused` rule; `on-xdg-activate`; debug `strict-new-window-focus-policy` | | handlers/compositor.rs 148-153; window_rule.rs | partial | KWin's focus-stealing prevention decides; Kiri marks and warps the pointer to a new activated window; `open-focused` is done (the focus goes back to the previous window for false); on-xdg-activate is impossible | cursorFollowsFocus, windowRules |
| Column width formula | `(working_w - gaps) * proportion - gaps - extra`; window sizes floor to integer | scrolling.rs `resolve_column_width` 4579, `new_window_size` 547 | done | PresetWidths.ts `getRatioFunction` (same formula when outer gap = inner gap, floor) | units/behavior/PresetWidths, presetWidths |
| Preset cycle with a client that rounds the width | cycles by index after a preset was applied | scrolling.rs `toggle_width` 4991 | done | PresetWidths.ts | presetWidths |
| Window heights: auto weights and fixed, last window takes the remainder, integer rounding | | scrolling.rs `update_tile_sizes` 4601-4890 | done | Column.ts 330-470 | windowHeights |
| View offset rules: fit, centre, on-overflow | | scrolling.rs `compute_new_view_offset` 5647 | done | behavior/scroller/*.ts, scrollClamper/*.ts | lazyScroller, behaviorOptions |
| View offset after width change keeps the left edge of the active column | | scrolling.rs `update_window` 1278-1437 | done | Grid.ts `onColumnWidthChanged` | columnWidthView |
| View offset restored after leaving full-screen / unmaximize | | scrolling.rs | done | Grid.ts view restore | viewRestore |
| Horizontal view movement animation | spring damping 1.0, stiffness 800, epsilon 0.0001 | animations.rs `HorizontalViewMovementAnim` | partial | `animHorizontalViewMovement` (any of niri's forms, see section 9). It sets where a swipe settles (FX swipe/, utils/niriSwipe.ts `niriViewAnimation`), the view of a desktop in the overview, and the move of a window that only slides sideways (FX motion/: a window's own move is painted with it when the window keeps its y and size). The windows of a layout change that only slides columns (a column closing) cannot be told from a scroll in an effect, so they use it too, where niri uses window-movement for them | gestureScroll (niriAnimation), NiriImportAnimations |
| Window movement animation | spring 1.0 / 800 / 0.0001 | animations.rs | done | `animWindowMovement`; FX motion/MotionEffect.cpp, common/NiriAnim.h | NiriImportAnimations |
| Window resize animation | spring 1.0 / 800 / 0.0001, cross-fade of old and new contents | animations.rs; tile.rs | done | `animWindowResize`; FX motion/MotionEffect.cpp | NiriImportAnimations |
| Window open (150 ms ease-out-expo, scale+fade), close (150 ms ease-out-quad) | | animations.rs | done | `animWindowOpen`, `animWindowClose`; FX motion/; the scale uses the unclamped progress, the fade the clamped one, like opening_window.rs / closing_window.rs | NiriImportAnimations |
| Workspace switch animation | spring 1.0 / 1000 / 0.0001 | animations.rs 108 | done | `animWorkspaceSwitch`; FX switch/DesktopSwitchEffect.cpp (a spring or easing, or `off`; an easing runs only along a column of desktops, with desktops side by side the switch is instant) | NiriImportAnimations |
| Overview open/close | spring 1.0 / 800 / 0.0001 | animations.rs | done | `animOverviewOpenClose`; FX overview/ `m_progressSpring` (the desktops inside it use `animWorkspaceSwitch`, the view of a desktop `animHorizontalViewMovement`, like niri) | overview, NiriImportAnimations |
| Mouse wheel scroll (Mod+wheel binds) | focus-column / workspace with cooldown | default-config.kdl wheel binds | done | FX src/ `registerWheelShortcuts` | - |
| Touchpad 3-finger horizontal swipe: view scroll with rubber band, velocity projection, release spring | | scrolling.rs `view_offset_gesture_*` 3119-3268; input/swipe_tracker.rs | done | FX swipe/, common/NiriSwipe.h, utils/gestureScroll.ts, utils/niriSwipe.ts, verified against niri's own Rust (tools/swipe/) | gestureNiri, gestureScroll, units/utils/gestureScroll |
| Touchpad 3-finger vertical swipe: workspace switch gesture | | monitor.rs `workspace_switch_gesture_*` 1864-2051 | done | FX switch/ | gestureNiri |
| Touchpad 4-finger vertical swipe: overview | | layout/mod.rs 3895-3931 | done | FX overview/ | overview |
| Touchscreen swipes (one finger scroll, long-press move, Mod+drag) | | input/touch_overview_grab.rs; wiki Gestures | missing | KWin passes touch to clients; touchscreen edge/3-4 finger gestures would use `registerTouchscreenSwipeShortcut` | - |
| Scroll factor / `scroll-factor` rule, `pinch-sensitivity` | | window_rule.rs | n/a | Plasma input / client side | - |

### 3.2 Interactive move and resize

| Item | niri behaviour | niri source | Status | Kiri | Test |
|---|---|---|---|---|---|
| Mod+left drag moves a window | needs `Mod`; the tile stays until the pointer is 256 px away, rubber-banded | layout/mod.rs `interactive_move_begin` 3966, `_update` 4027; input/move_grab.rs | partial | KWin's own drag (Meta+drag is set by Plasma "Window Actions"); 256 px threshold in Tiled.ts `dragLimit`; Kiri does not configure the Plasma window-action modifier. The window keeps its place on the way out (no push back into the screen, Tiled.ts `restoreClientAfterTiling`), glides from the rubber-banded place to the pointer with the window-movement spring and fades to alpha 0.75 with it (FX src/ `setInsertHint`, `m_alpha`), and glides into its slot on the drop. The ring, border and tab indicator are painted by kiri_decorations at the painted place in every frame (it marks the window transformed: KWin clips an untransformed window without a shadow to its frame, which cut the ring off). `kiri-mode` turns off Plasma's snapping while Kiri mode runs (snap zones, edge tiling and maximizing; the Shift-drag tile editor only acts when custom tiles exist) | dragTiled |
| Insert hint while dragging; drop at the closest gap (between columns, in a column) | | scrolling.rs `insert_position` 836; layout/mod.rs `interactive_move_end` 4254 | done | ClientManager.ts hint + `dropToTile`; FX src/ draws the hint | dragTiled, overview |
| Right click during a move toggles floating | the other button of the grab: a tiled window dragged as tiled (translucent, insert hint, drop in the grid) becomes a floating drag (opaque, no hint, no edge scroll, floating size back, drop floats), and back; before the 256 px it leaves the grid at once; a floating window's drag turns into a tiled one | input/move_grab.rs `on_toggle_floating` 262; layout/mod.rs `toggle_window_floating` 3275 | done | FX src/ sees the right button press while a window is being moved (`mouseChanged`) and runs the internal shortcut `window-drag-toggle-floating`; ClientManager.ts `toggleDragFloating`/`startDrag`, Tiled.ts (before 256 px), Floating.ts (floating drag). A touchscreen second finger is not handled (no touch drags) | dragToggleFloating |
| Dragging a floating window | follows pointer at once | layout/mod.rs | done | KWin | floatingKeys |
| Drag a tiled window against the view edge: view scrolls | | input/move_grab.rs `begin_view_offset` 140; scrolling.rs 3204 | done | DndEdgeScroll.ts (see section 7); stops while the drag is a floating one, like niri | dragTiled |
| Mod+right drag resizes | width of column, height of window, neighbours move | scrolling.rs `interactive_resize_*` 3607-3720; input/resize_grab.rs | done | Tiled.ts interactiveMoveResizeStepped path, Grid.ts | userResize, columnWidthView, verticalResize |
| Resize keeps view frozen, centred lone column stays centred | | scrolling.rs 3607-3720 | partial | the centred-column growth by 2*dx is impossible (KWin sizes the dragged window from the pointer); rest done | singleColumnResize, userResize |
| Double click on a left/right resize edge: toggle full width; top/bottom: reset window height | | input/mod.rs 3446 | missing | an effect could see button events on the frame; KWin handles titlebar double click itself | - |
| Mod+middle drag: scroll view horizontally, vertically: workspace | after 8 px the axis is chosen; the view follows the pointer 1:1 (is_touchpad false) and settles with the swipe's momentum and snapping; vertically the desktops follow it, one screen height per desktop; never over the overview, a user bind on Mod+MouseMiddle wins; the press is not passed on and does not activate the window | input/spatial_movement_grab.rs; input/mod.rs 3355 | done | FX swipe/ (input spy and filter; KWin's Meta+middle "toggle raise and lower" does not run), FX switch/ (vertical), common/PointerGrab.h; the script drives the settle like a touchpad swipe (World.gestureRaw `ptr`). Mod is the Plasma window-action key (`[MouseBindings] CommandAllKey`, Meta by default, which is niri's Super; neither install.sh nor kiri-mode changes it). Mod+wheel is `pointerBinds` | gestureNiri (pointer drag) |

## 4. Workspaces

| Item | niri behaviour | niri source | Status | Kiri | Test |
|---|---|---|---|---|---|
| One empty workspace always at the bottom | filling it creates a new empty one below | monitor.rs `clean_up_workspaces` 664; wiki Workspaces | done | `dynamicDesktops` option, OFF by default (owner's decision for 1.0: fixed desktops unless chosen); DynamicDesktops.ts. Nothing is added or removed while a desktop switch animates (KWin effects end their animation on a desktop change), so there is no jump; kiri-mode puts the user's own desktops back in Plasma mode | dynamicDesktops, workspaces |
| Empty workspace in the middle is removed when switching away | | monitor.rs 664 | done | same option; removed 500 ms after the last switch (niri: when the animation ends) | dynamicDesktops, workspaces |
| workspace-auto-back-and-forth | `focus-workspace N` on the current workspace goes to the previous one | input.rs `workspace_auto_back_and_forth`; layout/mod.rs 2354; monitor.rs 1025 | done | `desktopAutoBackAndForth`; applies to `desktop-N` and `desktop-named-N` | workspaces |
| focus-workspace-previous | | monitor.rs 1037 | done | `desktop-previous-used` | keyBindings |
| Workspaces per monitor, move between monitors | | wiki Workspaces | n/a | KWin desktops are global; outputs share them | - |
| Named workspaces (`workspace "name" {}`, open-on-output, layout) | persist when empty, addressable by name | workspace.rs; wiki Configuration:-Named-Workspaces; layout/mod.rs `ensure_named_workspace` 3046 | partial | `namedDesktops` (JSON list; the importer maps `workspace "name"`): created at the top in config order at start, never removed (also with dynamic desktops off). `open-on-output` and the per-workspace `layout {}` are not mapped. For `open-on-workspace` (WP3): `world.dynamicDesktops.findByName(name)` returns the KwinDesktop to put `kwinClient.desktops` on | workspaces |
| Workspace index addressing (`focus-workspace 2` = whatever is 2nd) | | wiki Workspaces | done | desktop order | keyBindings |
| Workspace switch with a window moved along | | layout/mod.rs | done | `window-move-to-*desktop` + follow | followWindowToDesktop |
| Windows keep their layout on other desktops | | | done | World.ts / DesktopManager.ts | otherDesktopLayout |

## 5. Overview

| Item | niri behaviour | niri source | Status | Kiri | Test |
|---|---|---|---|---|---|
| Overview: workspaces stacked, zoom 0.5, gap 0.1*height, active centred | | monitor.rs `set_overview_progress` 1393; misc.rs `Overview` | done | FX overview/ + QML overview/qml/Main.qml | overview |
| `overview { zoom }` | 0..1 | misc.rs | done | `overviewZoom` (kwinrc Script-kiri), read by FX overview/ (`m_zoom`, applied at the next opening) | NiriImport overview and dnd edge options |
| `overview { backdrop-color }` | default #262626 | misc.rs | done | `overviewBackdropColor`; Main.qml `backdropColor` | NiriImport overview and dnd edge options |
| `overview { workspace-shadow }` (off, offset, softness, spread, color) | default 0/10, 40, 10, #00000050 | appearance.rs 393 | done | `overviewShadow{Enabled,OffsetX,OffsetY,Softness,Spread,Color}`; Main.qml ShadowedRectangle | NiriImport overview and dnd edge options |
| Click a window: activate and close overview | | layout/mod.rs; input/mod.rs | done | Main.qml | overview |
| Click a workspace: go to it | | | done | Main.qml | overview |
| Wheel scrolls workspaces without Mod; right-drag scrolls the view | | wiki Overview | done | plain wheel: one desktop per notch, 50 ms cooldown; Shift+wheel and the horizontal wheel: focus column left/right of the desktop under the pointer (`focuscol` event); right-drag scrolls the view (Main.qml WheelHandler) | - |
| Two-finger touchpad scroll like the 3-finger gestures | | wiki Overview | done | `OverviewEffect::touchpadScroll`: vertical drags the desktops (rubber band, momentum like workspace_switch_gesture_end), horizontal scrolls the view of the desktop under the pointer; the end of a scroll is a 120 ms pause (no ScrollEnd from Qt). Not verified with a real touchpad | - |
| Drag a window: rubber band, 256 px, insert hint, drop in column / new column / other workspace / floating | | layout/mod.rs 4027-4254 | done | Main.qml, Overview.ts, ClientManager.ts | overview |
| Drop a window onto the space between workspaces: new workspace | | layout/mod.rs `InsertWorkspace` | partial | needs dynamic desktops: not done (old doc: "no new desktop by dropping between desktops") | - |
| DnD edge workspace switch (`dnd-edge-workspace-switch`: trigger-height 50, delay-ms 100, max-speed 1500) | | gestures.rs; layout/mod.rs `dnd_update` 4517 | done | `dndEdgeWorkspaceSwitch{TriggerHeight,Delay,MaxSpeed}`; Main.qml Timer `dndEdge` + `dndEdgeWorkspace`/`dndEdgeEnd`, overview drags only (niri: only when the overview is open) | - |
| DnD edge view scroll (`dnd-edge-view-scroll`: trigger-width 30, delay-ms 100, max-speed 1500) | | gestures.rs; scrolling.rs 3204 | done | `dndEdgeViewScroll{TriggerWidth,Delay,MaxSpeed}`; DndEdgeScroll.ts for a window dragged on the strip, Main.qml `dndEdge` for a drag in the overview. A drag from another application (a real DnD) is not seen by KWin scripts: not done | DndEdgeScroll zone |
| DnD hold to activate (a window, a workspace) | | wiki Gestures | missing | | - |
| Hot corners | top-left default; `off`, `top-left/right`, `bottom-left/right`; toggles overview, works while dragging | gestures.rs `HotCorners`; input/mod.rs 3081 | done | `hotCorner` (all off) + `hotCornerTopLeft/TopRight/BottomLeft/BottomRight`, importer sets them like niri (none named = top-left); FX overview/ `inHotCorner`; works while dragging in the overview | NiriImport hot corners |
| Keys while the overview is open (all binds keep working) | | wiki Overview | done | Left/Right/Up/Down run focus-left/right, focus-window-or-desktop-up/down; Enter/Escape/Meta+O close; other binds are kglobalaccel shortcuts and keep working | - |
| Floating windows in the overview | | | done | Main.qml | overview |
| Layer rules: place-within-backdrop; top/overlay layers stay above | | layer_rule.rs | n/a | Plasma panels and wallpaper are KWin-managed | - |
| No cursor warp / focus follows mouse while the overview is up | | | done | | overview |

## 6. Input config (`input {}`)

| Item | niri behaviour | niri source | Status | Kiri | Test |
|---|---|---|---|---|---|
| focus-follows-mouse (max-scroll-amount, outputs-only) | focus under the pointer, no scrolling beyond the limit | input.rs `FocusFollowsMouse` 396; input/mod.rs 3052 | partial | `focusFollowsMouse`, `focusFollowsMouseMaxScroll`; `outputs-only` n/a; needs KWin "click to focus" (install.sh) | focusFollowsMouse |
| warp-mouse-to-focus (mode center-xy, center-xy-always) | pointer to the focused window | input.rs 404 | partial | `cursorFollowsFocus` bool: no mode choice | cursorFollowsFocus |
| workspace-auto-back-and-forth | | input.rs | done | see section 4 | workspaces |
| mod-key, mod-key-nested | | input.rs | partial | fixed to Meta | - |
| disable-power-key-handling | | input.rs | n/a | Plasma | - |
| keyboard (xkb, repeat, numlock, track-layout), touchpad, mouse, trackpoint, trackball, tablet, touch, scroll-factor | device settings | input.rs 94-410 | n/a | Plasma System Settings | - |

## 7. Window rules (`window-rule {}`)

Kiri's rules are the JSON list `windowRules` (Window Rules tab); the niri importer fills it from `window-rule` blocks. A block
without `match` lines applies to every window, several `match` lines become one Kiri rule each. All matching rules are merged in
order and the last one that sets a property wins (niri's `ResolvedWindowRules::compute`).
`appId` and `title` are niri's regexes: Rust `regex` syntax, matching anywhere in the app id (resource class) and title
(rules/RustRegex.ts translates inline flags, `\A`, `\z`, `(?P<n>)`, `\x{..}`, POSIX classes, `\pL` and punctuation escapes; class
intersection and `\b{..}` are errors, which drop the rule with a log line). Kiri's older `class` and `caption` match the whole string.

Matchers (`match` / `exclude`, window_rule.rs; window/mod.rs `window_matches`):

| Item | niri behaviour | niri source | Status | Kiri | Test |
|---|---|---|---|---|---|
| app-id, title (regex, matches anywhere) | | window_rule.rs `Match` | done | `appId`, `title` (and the older whole-string `class`, `caption`, which also match `resourceName`) | rules/RustRegex, rules/WindowRuleEnforcer, windowRules |
| is-active, is-focused, is-floating | not for a window that is still opening | window/mod.rs 189-330 | done | rules/WindowRuleEnforcer.ts `RuleMatcher`; opening windows get false (floating, active, focused) | windowRules |
| is-active-in-column | true for an opening window | window/mod.rs `is_active_in_column` | done | `isActiveInColumn`, ClientManager.ts `isActiveInColumn` | windowRules, rules/WindowRuleEnforcer |
| is-urgent | | window/mod.rs | done | `isUrgent`: KWin `demandsAttention` (and its signal) | windowRules |
| is-window-cast-target | | window/mod.rs | impossible | KWin does not tell which windows are screen cast targets, so `is-window-cast-target=true` never matches and `=false` always does | rules/WindowRuleEnforcer |
| at-startup (first 60 s) | | niri.rs 2882 | done | `atStartup`: 60 s after Kiri started (not after a settings reload); the rules are evaluated again when they are over | windowRules |
| Multiple match / exclude lines, no match line = every window | | window/mod.rs 205-218 | done | `exclude` list; importer | rules/WindowRuleEnforcer, NiriImport |
| Rules are evaluated again when title, app-id, focus, active window of the column, floating state or urgency change | | window/mod.rs `recompute_window_rules`; niri.rs `refresh_window_rules` | done | `ClientManager.refreshRules` (after every action, only when a rule uses a dynamic matcher; on caption, class and urgency signals) | windowRules |

Properties:

| Item | niri behaviour | niri source | Status | Kiri | Test |
|---|---|---|---|---|---|
| open-floating (and false) | false tiles a window that has a parent or a fixed height | window/mod.rs `compute_open_floating` 377 | done | `tile: false/true` | windowRules |
| Windows that open floating without a rule | a window with a parent (dialog) or a fixed height (min height = max height after the min/max-height rules) | window/mod.rs 377-395 | done | WindowRuleEnforcer.shouldTile: transient or modal windows float, `hasFixedHeight` floats the rest. KWin's own X11 window types (utility, splash, ...) also float, niri has no such types | windowRules, rules/WindowRuleEnforcer |
| default-column-width, default-window-height | `{}` lets the window pick | window/mod.rs; workspace.rs `resolve_default_width` 819 | done | `width`, `height` (`""` is the empty block) | windowRules |
| open-fullscreen (and false) | false refuses the window's own request | handlers/xdg_shell.rs 1191 | done | `fullscreen` | windowRules |
| open-maximized | the new column opens at the full width (maximize-column goes back) | xdg_shell.rs 1175 | done | `maximized`; Column.widthBeforeMaximize | windowRules |
| open-maximized-to-edges | | xdg_shell.rs 1191 | done | `maximizedToEdges` | windowRules |
| open-focused | false: the window opens without the focus | compositor.rs 153 | done | `focused`: the focus goes back to the window that had it, or to the new one for `true` | windowRules |
| open-on-workspace | by name | xdg_shell.rs 1119 | done | `workspace`: the desktop with that name, else the desktop at the place of that name among the `workspace "name"` lines of the pasted niri config. A window on a desktop that is not the current one does not take the focus (unless open-focused true) | windowRules |
| open-on-output | | | n/a | Kiri has one layout for all screens; the importer lists it | - |
| on-xdg-activate (ignore, set-urgent, focus) | | | impossible | KWin's focus stealing prevention decides, a script cannot tell an activation request from a click | - |
| min-width, min-height, max-width, max-height | applied on top of the client's own limits; a fixed height (min = max) makes a tile fixed | window/mod.rs `apply_min_size`, `apply_max_size`; scrolling.rs 4774 | done | `minWidth`, ..., ClientWrapper `getMinWidth` etc. used by Column.ts; floating windows are fitted at open | windowRules |
| default-column-display | tabbed for the column the window opens | scrolling.rs 499 | done | `columnDisplay` | windowRules |
| default-floating-position (x, y, relative-to) | | floating.rs `stored_or_default_tile_pos` 1297 | done | `floatingPosition`; ClientManager.floatingPositionIn | windowRules |
| opacity, toggle-window-rule-opacity | opacity applies to the window; the action turns it off and on for the focused window | tile.rs; binds.rs | done | `opacity`: KWin's window opacity (multiplied with offScreenOpacity); `window-toggle-rule-opacity` | windowRules |
| focus-ring / border / shadow / tab-indicator rules | per-window overrides of the global options | window_rule.rs; tile.rs 190 | done | the rules are merged per window (colour replaces gradient and the other way round) and given to the effect with `setWindowDecorations(id, rule)` (Kiri.ts, D-Bus `setWindowDecorations` of kiri_decorations) | windowRules, decorations |
| geometry-corner-radius | per window | layout/mod.rs 318 | partial | same channel, one radius per window; niri's four corners give their largest one (the effect's corner shader and ring have one radius). A rule without match lines is the global `cornerRadius` | windowRules |
| clip-to-geometry | clips the window to its rounded corners | tile.rs 1115 | partial | the effect clips every window that has a corner radius, whether the rule says so or not; the importer accepts the property | - |
| draw-border-with-background, baba-is-float | | | missing | the importer lists them; the effect draws no background under the border and has no bobbing animation | - |
| scroll-factor, pinch-sensitivity | | window_rule.rs | n/a | Plasma's input settings; KWin has no per-window scroll scaling. The importer lists them | - |
| variable-refresh-rate | | window_rule.rs `VrrRule` | n/a | Plasma's display settings (adaptive sync is per output); the importer lists it | - |
| block-out-from (screencast, screen-capture) | | | impossible | KWin offers no per-window exclusion from screen casts | - |
| tiled-state | tell the client it is tiled | | impossible | KWin does not expose xdg tiled states to scripts | - |
| background-effect (blur, xray, noise, saturation) and top-level `blur {}` | | appearance.rs 1025-1100 | impossible | the blur effect is Plasma's and has no per-window script API | - |
| popups { opacity, corner-radius, background-effect } | | window_rule.rs `PopupsRule` | impossible | KWin draws popups itself | - |
| Rule order: later rules win, merged | | window/mod.rs | done | `WindowRuleEnforcer.resolve` | rules/WindowRuleEnforcer |
| Kiri-only rules: `tile`, class lists, `columnWidthRules`, defaults for Plasma's windows | | | n/a | config/definition.ts | windowRules |

The look fields of a rule (`cornerRadius`, `focusRing`, `border`, `shadow`, `tabIndicator`, with the colour and gradient strings of
the settings) are those of `WindowDecorationRule` in Kiri.ts; the window's merged ones go to the effect with `setWindowDecorations`.

Layer rules (layer_rule.rs: opacity, block-out-from, shadow, geometry-corner-radius, place-within-backdrop, focus-on-type-in-overview, baba-is-float, background-effect, popups): **n/a**, layer-shell surfaces are managed by KWin and Plasma.

## 8. Floating windows

| Item | niri behaviour | niri source | Status | Kiri | Test |
|---|---|---|---|---|---|
| Floating always above tiled; own focus layer; layer-bound focus keys | | wiki Floating-Windows; floating.rs | done | `floatingKeepAbove` / `tiledKeepBelow`; World.ts `doFocusLayered` | floatingKeys, layering, leaveUntiled |
| Move floating windows by keys (50 px) | | floating.rs `move_by` 938 | partial | keys move by 50 px; Kiri clamps to the work area, niri does not | floatingKeys |
| Resize floating windows by keys, preset sizes, centre-window | | floating.rs | partial | set-column-width etc. do not act on floating windows | floatingKeys |
| New floating window size from rule, centred | | floating.rs `new_window_size` 1262 | done | ClientManager.ts `applyOpenRules` | windowRules |
| Full-screen / maximize of a floating window goes into the grid and returns | | wiki Fullscreen-and-Maximize | done | Floating.ts, Tiled.ts | fullScreenToggle, leaveUntiled |
| Floating windows keep position per desktop on reload | | | done | state save in ClientManager.ts | stateReload |

## 9. Gestures, misc config

| Item | niri behaviour | niri source | Status | Kiri | Test |
|---|---|---|---|---|---|
| animations off / slowdown | global | animations.rs `Animations` | done | `animationsOff`, `animationsSlowdown`; every effect scales its time by 1 / slowdown (on top of Plasma's animation speed) and `off` ends every animation at once; imported (`off` of any block, `on`, the last `slowdown`) | NiriImportAnimations |
| Per-animation `off`, spring (damping-ratio, stiffness, epsilon), easing (duration-ms, curve ease-out-quad/cubic/expo/linear/cubic-bezier) for workspace-switch, window-open, window-close, horizontal-view-movement, window-movement, window-resize, overview-open-close | | animations.rs | done | one text per animation (`animWindowOpen` and the others, defaults niri's: "off", "spring 1 800 0.0001", "ease-out-expo 150", "cubic-bezier 150 0.05 0.7 0.1 1"), on the Animations tab; read by the effects from kwinrc (common/AnimConfig.h); both importers write it the way niri decodes a node (a lone `duration-ms` keeps the default curve, a spring needs no easing defaults, 250 ms ease-out-cubic when an easing replaces a spring); niri's limits apply (damping 0.1 to 10, stiffness at least 1, epsilon 0.00001 to 0.1) | NiriImportAnimations, gestureScroll |
| animations `custom-shader` (open, close, resize) | | animations.rs | missing | feasible in the effects (GLSL) but niri's shader contract differs from KWin's | - |
| config-notification / exit-confirmation / screenshot-ui / recent-windows-close animations | | animations.rs | n/a | no such UI: the importers skip them with a reason (KWin scripts have no config reload notice, Kiri has no exit confirmation, the screenshot UI is Spectacle's, Alt+Tab is KWin's) | NiriImportAnimations |
| prefer-no-csd | server-side decorations | lib.rs | partial | `hideTitlebars` hides title bars on tiled windows (default on); does not ask clients to drop CSD | hideTitlebars |
| cursor { xcursor-theme, size, hide-when-typing, hide-after-inactive-ms } | | misc.rs | n/a | Plasma | - |
| screenshot-path, clipboard, hotkey-overlay options, config-notification, environment, xwayland-satellite, spawn-at-startup | | misc.rs | n/a | | - |
| recent-windows (alt-tab MRU UI: debounce, open-delay, highlight, previews, binds) | | recent_windows.rs; ui/mru.rs | n/a | KWin's Alt+Tab is Plasma's; `focus-window-previous` covers the quick toggle | nirActions |
| switch-events (lid, tablet mode) | | wiki Configuration:-Switch-Events | n/a | Plasma power management | - |
| outputs (mode, scale, transform, position, vrr, focus-at-startup) | | output.rs | n/a | Plasma Display settings | - |
| debug {} options (all 22) | renderer / DRM / pipewire switches | debug.rs | n/a | none apply to KWin | - |
| IPC (`niri msg`, event stream) | | wiki IPC | n/a | | - |
| Accessibility, screencasting, xwayland, layer-shell wiki pages | | wiki | n/a | KWin / Plasma | - |
