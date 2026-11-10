# niri parity list for Kiri 1.0

Goal: every niri feature, behaving like niri. Source of truth: niri `main` (release v26.04 line): `niri-config/src/*.rs`,
`src/layout/*.rs`, `src/input/*.rs`, `docs/wiki/*.md`, `resources/default-config.kdl`. Line numbers are niri `main` as read on
2026-11-24 and drift; function names are stable. Kiri checked at commit 7ddc096 (0.10.10).

Status: **done** = same behaviour; **partial** = works but differs or lacks options (the Kiri column says what);
**missing** = not implemented, feasible in KWin; **impossible** = KWin gives scripts/effects no way (reason given);
**n/a** = not window management, or Plasma owns it.

Kiri places: `TS` = `src/lib/...`; `FX` = `effect-cpp/<name>/`; `QML` = `package/contents/ui/` or `effect-cpp/overview/qml/`.
Tests: names are files in `src/tests/flows/` (`units/` for units); "-" = no test (visual or KWin-only).

Counts: done 84, partial 33, missing 54, impossible 8, n/a 30 (209 rows).

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
| empty-workspace-above-first | extra empty workspace above the first one too | layout.rs; monitor.rs `clean_up_workspaces` 664 | missing | DynamicDesktops.ts only keeps one empty desktop at the bottom; feasible with `Workspace.createDesktop(0)` | - |
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
| focus-window-previous (scope, filter props) | go to the previously focused window (MRU) | niri.rs `focus_window_previous`; ui/mru.rs | partial | `focus-window-previous`; no `scope`/`filter` | nirActions |
| focus-window-or-monitor-up/down, focus-column-or-monitor-left/right | window/column, else monitor | layout/mod.rs | partial | no monitor concept in Kiri's layout; on one output they equal plain focus; import skips them | - |
| focus-floating, focus-tiling, switch-focus-between-floating-and-tiling | layer focus | layout/workspace.rs | done | `focus-floating`, `focus-tiling`, `window-switch-focus-floating-tiling` | floatingKeys, leaveUntiled |
| focus-workspace-down/up, N, previous | | monitor.rs | done | `desktop-next/previous`, `desktop-{}`, `desktop-previous-used`; DesktopManager.ts, DynamicDesktops.ts `clampIndex` | keyBindings, dynamicDesktops |
| focus-workspace "name" | by workspace name | layout/mod.rs `find_workspace_by_name` | missing | no named workspaces (see section 5) | - |
| focus-monitor-left/right/up/down/next/previous/NAME | | layout/mod.rs | n/a | desktops are shared by every output; Kiri keeps one grid per desktop on the chosen screen. `screen-switch` is the nearest thing | - |
| focus-window ID (IPC) | | binds.rs `skip` | n/a | no IPC | - |

### 2.2 Move

| Item | niri behaviour | niri source | Status | Kiri | Test |
|---|---|---|---|---|---|
| move-column-left/right, to-first/last, to-index | keeps the column in view; `focus=false` property | scrolling.rs | partial | `column-move-*`, `column-move-to-column-{}`; no `focus=false` | layout, nirActions |
| move-window-up/down | inside the column; `focus` property | scrolling.rs | partial | `window-move-up/down`; no `focus=false` | layout |
| move-window-down-or-to-workspace-down, up | | layout/mod.rs | done | `window-move-down-or-to-desktop-down` etc. | nirActions |
| consume-or-expel-window-left/right, consume-window-into-column, expel-window-from-column | | scrolling.rs | done | `window-consume-or-expel-*`, `window-consume-into-column`, `window-expel-from-column` | layout |
| swap-window-left/right | swap with the neighbour column's window | scrolling.rs | done | `window-swap-left/right` | nirActions |
| move-column-left-or-to-monitor-left, right | move, else to monitor | layout/mod.rs | partial | on one output these equal move-column-left/right; not mapped by import | - |
| move-column-to-workspace-down/up/N | follows the column unless `focus=false` | layout/mod.rs | partial | `column-move-to-*desktop*`; no `focus=false` | columnMoveToDesktop, followWindowToDesktop |
| move-window-to-workspace-down/up/N | same for a window | layout/mod.rs | partial | `window-move-to-*desktop*`; no `focus=false` | followWindowToDesktop |
| move-column-to-workspace "name", move-window-to-workspace "name" | | layout/mod.rs | missing | no names | - |
| move-window-to-new-workspace-below/above, move-column-to-new-workspace-below/above | new workspace next to the current one | layout/mod.rs | missing | feasible with `Workspace.createDesktop(index)` (as DynamicDesktops.moveCurrent does) | - |
| move-window/column-to-monitor-* | | layout/mod.rs | n/a | see focus-monitor | - |
| move-workspace-down/up | reorder workspaces | monitor.rs `move_workspace_down` 1257 | partial | `desktop-move-down/up` emulated by replacing the neighbour desktop (DynamicDesktops.moveCurrent); KWin cannot reorder | dynamicDesktops |
| move-workspace-to-index N | | monitor.rs | missing | feasible with the same emulation | - |
| move-workspace-to-monitor-* | | layout/mod.rs | n/a | no monitors | - |
| set-workspace-name / unset-workspace-name | name a workspace | layout/mod.rs 4683 | missing | `Workspace.createDesktop(index, name)` names new desktops and KWin's D-Bus `VirtualDesktopManager` has `setDesktopName` (check on a live KWin); the old checklist called it impossible | - |

### 2.3 Sizes, display, state

| Item | niri behaviour | niri source | Status | Kiri | Test |
|---|---|---|---|---|---|
| switch-preset-column-width, -back | next preset wider than now, wraps | scrolling.rs `toggle_width` 4991 | done | `cycle-preset-widths`, `-reverse`; PresetWidths.ts | presetWidths |
| switch-preset-window-width, -back | per window width inside a column | scrolling.rs 2691 | missing | no per-window width | - |
| switch-preset-window-height, -back | | scrolling.rs 5198 | done | `window-height-cycle-presets(-reverse)` | windowHeights |
| reset-window-height | back to auto | scrolling.rs | done | `window-height-reset` | windowHeights |
| maximize-column | toggle full width (proportion 1.0), restores | scrolling.rs `toggle_full_width` 5042 | done | `column-width-maximize` | maximizeToggles |
| maximize-window-to-edges | toggle maximize to work-area edges | scrolling.rs 2961 | done | `window-maximize-to-edges` | maximizeToggles |
| expand-column-to-available-width | | scrolling.rs 2833 | done | `column-width-expand` | behaviorOptions |
| set-column-width "+10%" / "-10%" | proportion step of the working area | scrolling.rs 5054 | done | `column-width-increase/decrease`, step `columnWidthStep` | nirActions, columnWidthView |
| set-column-width "50%" / "800" (absolute) | set exactly | scrolling.rs 5054 | missing | import skips; needs a bind with an argument (one action per value, or a settings list) | - |
| set-window-width (absolute or relative) | per window | scrolling.rs | missing | | - |
| set-window-height "+-10%" | | scrolling.rs 5104 | done | `window-height-increase/decrease` | nirActions |
| set-window-height "50%" / "400" (absolute) | | scrolling.rs 5104 | missing | as set-column-width | - |
| toggle-column-tabbed-display, set-column-display normal/tabbed | | scrolling.rs 2208 | done | `column-toggle-tabbed`, `column-display-normal/tabbed` | tabbed, nirActions |
| center-column, center-window | centre the column (floating: centre the window) | scrolling.rs 2247; workspace.rs 1199 | done | `grid-scroll-focused`; floating via windowRules | centerFocused, windowRules |
| center-visible-columns | centre the group of visible columns | scrolling.rs 2284 | done | `column-center-visible` | centerFocused |
| fullscreen-window (toggle) | | layout/mod.rs; scrolling.rs 2930 | done | `window-toggle-fullscreen` | fullScreenToggle |
| set-window-fullscreen, unset-window-fullscreen | explicit, not toggling | binds.rs 296-301 | missing | trivial wrappers over the toggle | - |
| toggle-windowed-fullscreen | app thinks full-screen, window keeps its tile | wiki Fullscreen-and-Maximize | done | `window-toggle-windowed-fullscreen` | windowedFullScreen |
| set/unset-windowed-fullscreen, set/unset-window-maximized-to-edges | explicit | binds.rs 302-313 | missing | trivial wrappers | - |
| toggle-window-floating, move-window-to-floating, move-window-to-tiling | | layout/mod.rs | done | `window-toggle-floating`, `window-move-to-floating/tiling` | floatingKeys |
| move-floating-window -x -y (relative or absolute) | position a floating window | binds.rs `MoveFloatingWindowById` | missing | arrow keys move by 50 px only (`window-move-*` on floating); no absolute move | floatingKeys |
| close-window | | | done | `window-close` | closePick |
| toggle-overview, open-overview, close-overview | | layout/mod.rs 4758 | partial | `overview` toggles only; import maps open-overview to the toggle | overview |
| toggle-window-rule-opacity | flips the rule's opacity | binds.rs | missing | no opacity rule | - |
| set-dynamic-cast-window/monitor, clear-dynamic-cast-target, stop-cast | screencast target | binds.rs | n/a | Plasma screencasts through KWin/xdg-portal | - |
| switch-layout | keyboard layout | binds.rs | n/a | Plasma keyboard KCM | - |
| show-hotkey-overlay | list of binds | binds.rs; ui/hotkey_overlay.rs | missing | feasible as a QML overlay listing Kiri's keys | - |
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
| `Mod` = Super (mod-key / mod-key-nested) | configurable | input.rs `ModKey` | partial | fixed to Meta; import maps Mod/Super/Win to Meta | - |
| Mouse-wheel triggers WheelScroll up/down/left/right with `cooldown-ms` | binds | binds.rs `Trigger` | partial | the 12 default-config wheel binds are hard-coded in FX src/ `registerWheelShortcuts` (cooldowns 150/0 like niri); not rebindable, import skips wheel keys | - (debugWheel hook only) |
| Mouse-button triggers (MouseLeft, ...), TouchpadScroll*, TabletStylusButton* | binds | binds.rs | missing | `registerPointerShortcut` is available to effects; stylus n/a | - |
| `repeat=false`, `allow-when-locked`, `allow-inhibiting`, `hotkey-overlay-title`, `cooldown-ms` | bind properties | binds.rs 209-233 | partial | held keys: move keys repeat, toggles do not (done by Kiri per action); no per-bind properties | floatingKeys ("A held key repeats move keys but not toggles") |
| `Mod release { toggle-overview }` | action on release | binds.rs `BoundAction::Release` | impossible | kglobalaccel cannot bind a bare modifier or a release; Plasma uses it for the launcher | - |
| Press and Release actions | | binds.rs | impossible | same | - |
| niri `include` | split config | wiki Configuration:-Include | impossible | KWin scripts cannot read files; use `tools/niri2kiri.py`, which reads the file and writes kwinrc | - |
| Import: paste a config.kdl into settings | n/a for niri | | done | niri/import.ts, niri/kdl.ts, tools/niri2kiri.py | units/niri/NiriImport |

## 3. Scrolling, animation, input behaviour

### 3.1 Scrolling and layout behaviours

| Item | niri behaviour | niri source | Status | Kiri | Test |
|---|---|---|---|---|---|
| Focus after closing a column | the column that takes its index (right neighbour) gets focus, the last goes left; a window opened right of the active column returns focus to its origin with the old view | scrolling.rs `remove_column_by_idx` 1192 | done | Grid.ts `onColumnRemoved`, FocusPassing.ts | closeFocus |
| Focus after closing a window in a column | tile below, else above | scrolling.rs `remove_tile_by_idx` 1074 | done | Column.ts, FocusPassing.ts | closeFocus |
| Focus after closing a floating or full-screen window | | layout/mod.rs; workspace.rs | done | ClientManager.ts | closeFullScreen, closePick |
| New window placement | new column right of the active column; width from default-column-width / rule; window rule heights | scrolling.rs `add_tile` 903, `new_window_size` 516 | done | ClientManager.ts `addClient`, Tiled.ts, Grid.ts | layout, windowRules |
| New window opens floating if it has a parent or has a fixed size | | window/mod.rs `compute_open_floating` 377 | partial | fixed-size windows float (Clients.canTileEver needs resizeable); a dialog with a parent is tiled unless a rule floats it | leaveUntiled |
| New window gets focus; `open-focused` rule; `on-xdg-activate`; debug `strict-new-window-focus-policy` | | handlers/compositor.rs 148-153; window_rule.rs | partial | KWin's focus-stealing prevention decides; Kiri marks and warps the pointer to a new activated window | cursorFollowsFocus |
| Column width formula | `(working_w - gaps) * proportion - gaps - extra`; window sizes floor to integer | scrolling.rs `resolve_column_width` 4579, `new_window_size` 547 | done | PresetWidths.ts `getRatioFunction` (same formula when outer gap = inner gap, floor) | units/behavior/PresetWidths, presetWidths |
| Preset cycle with a client that rounds the width | cycles by index after a preset was applied | scrolling.rs `toggle_width` 4991 | done | PresetWidths.ts | presetWidths |
| Window heights: auto weights and fixed, last window takes the remainder, integer rounding | | scrolling.rs `update_tile_sizes` 4601-4890 | done | Column.ts 330-470 | windowHeights |
| View offset rules: fit, centre, on-overflow | | scrolling.rs `compute_new_view_offset` 5647 | done | behavior/scroller/*.ts, scrollClamper/*.ts | lazyScroller, behaviorOptions |
| View offset after width change keeps the left edge of the active column | | scrolling.rs `update_window` 1278-1437 | done | Grid.ts `onColumnWidthChanged` | columnWidthView |
| View offset restored after leaving full-screen / unmaximize | | scrolling.rs | done | Grid.ts view restore | viewRestore |
| Horizontal view movement animation | spring damping 1.0, stiffness 800, epsilon 0.0001 | animations.rs `HorizontalViewMovementAnim` | partial | each window animates its own move with the same spring (FX motion/ `moveSpring`); equal motion for default settings, not configurable | - |
| Window movement animation | spring 1.0 / 800 / 0.0001 | animations.rs | done | FX motion/MotionEffect.cpp, common/NiriAnim.h | - |
| Window resize animation | spring 1.0 / 800 / 0.0001, cross-fade of old and new contents | animations.rs; tile.rs | done | FX motion/MotionEffect.cpp 498 | - |
| Window open (150 ms ease-out-expo, scale+fade), close (150 ms ease-out-quad) | | animations.rs | done | FX motion/ | - |
| Workspace switch animation | spring 1.0 / 1000 / 0.0001 | animations.rs 108 | done | FX switch/DesktopSwitchEffect.cpp | - |
| Overview open/close | spring 1.0 / 800 / 0.0001 | animations.rs | done | FX overview/ `m_progressSpring` | overview |
| Mouse wheel scroll (Mod+wheel binds) | focus-column / workspace with cooldown | default-config.kdl wheel binds | done | FX src/ `registerWheelShortcuts` | - |
| Touchpad 3-finger horizontal swipe: view scroll with rubber band, velocity projection, release spring | | scrolling.rs `view_offset_gesture_*` 3119-3268; input/swipe_tracker.rs | done | FX swipe/, common/NiriSwipe.h, utils/gestureScroll.ts, utils/niriSwipe.ts, verified against niri's own Rust (tools/swipe/) | gestureNiri, gestureScroll, units/utils/gestureScroll |
| Touchpad 3-finger vertical swipe: workspace switch gesture | | monitor.rs `workspace_switch_gesture_*` 1864-2051 | done | FX switch/ | gestureNiri |
| Touchpad 4-finger vertical swipe: overview | | layout/mod.rs 3895-3931 | done | FX overview/ | overview |
| Touchscreen swipes (one finger scroll, long-press move, Mod+drag) | | input/touch_overview_grab.rs; wiki Gestures | missing | KWin passes touch to clients; touchscreen edge/3-4 finger gestures would use `registerTouchscreenSwipeShortcut` | - |
| Scroll factor / `scroll-factor` rule, `pinch-sensitivity` | | window_rule.rs | n/a | Plasma input / client side | - |

### 3.2 Interactive move and resize

| Item | niri behaviour | niri source | Status | Kiri | Test |
|---|---|---|---|---|---|
| Mod+left drag moves a window | needs `Mod`; the tile stays until the pointer is 256 px away, rubber-banded | layout/mod.rs `interactive_move_begin` 3966, `_update` 4027; input/move_grab.rs | partial | KWin's own drag (Meta+drag is set by Plasma "Window Actions"); 256 px threshold in Tiled.ts `dragLimit`; Kiri does not configure the Plasma window-action modifier | dragTiled |
| Insert hint while dragging; drop at the closest gap (between columns, in a column) | | scrolling.rs `insert_position` 836; layout/mod.rs `interactive_move_end` 4254 | done | ClientManager.ts hint + `dropToTile`; FX src/ draws the hint | dragTiled, overview |
| Right click during a move toggles floating | | input/move_grab.rs `on_toggle_floating` 262 | missing | no hook on the right button during a KWin move; an effect could watch `pointerButtonEvent` | - |
| Dragging a floating window | follows pointer at once | layout/mod.rs | done | KWin | floatingKeys |
| Drag a tiled window against the view edge: view scrolls | | input/move_grab.rs `begin_view_offset` 140; scrolling.rs 3204 | missing | no edge scroll during a move | - |
| Mod+right drag resizes | width of column, height of window, neighbours move | scrolling.rs `interactive_resize_*` 3607-3720; input/resize_grab.rs | done | Tiled.ts interactiveMoveResizeStepped path, Grid.ts | userResize, columnWidthView, verticalResize |
| Resize keeps view frozen, centred lone column stays centred | | scrolling.rs 3607-3720 | partial | the centred-column growth by 2*dx is impossible (KWin sizes the dragged window from the pointer); rest done | singleColumnResize, userResize |
| Double click on a left/right resize edge: toggle full width; top/bottom: reset window height | | input/mod.rs 3446 | missing | an effect could see button events on the frame; KWin handles titlebar double click itself | - |
| Mod+middle drag / wheel drag: scroll view horizontally, vertically: workspace | | wiki Gestures; input/mod.rs | missing | no pointer shortcut for middle drag | - |

## 4. Workspaces

| Item | niri behaviour | niri source | Status | Kiri | Test |
|---|---|---|---|---|---|
| One empty workspace always at the bottom | filling it creates a new empty one below | monitor.rs `clean_up_workspaces` 664; wiki Workspaces | partial | `dynamicDesktops` option, default OFF and marked experimental; DynamicDesktops.ts; install.sh switched it off for existing users | dynamicDesktops |
| Empty workspace in the middle is removed when switching away | | monitor.rs 664 | partial | same option | dynamicDesktops |
| workspace-auto-back-and-forth | `focus-workspace N` on the current workspace goes to the previous one | input.rs `workspace_auto_back_and_forth`; layout/mod.rs 2354; monitor.rs 1025 | missing | `desktop-previous-used` exists; the option does not | - |
| focus-workspace-previous | | monitor.rs 1037 | done | `desktop-previous-used` | keyBindings |
| Workspaces per monitor, move between monitors | | wiki Workspaces | n/a | KWin desktops are global; outputs share them | - |
| Named workspaces (`workspace "name" {}`, open-on-output, layout) | persist when empty, addressable by name | workspace.rs; wiki Configuration:-Named-Workspaces; layout/mod.rs `ensure_named_workspace` 3046 | missing | create named desktops at start with `Workspace.createDesktop(i, name)` and exempt them from removal in DynamicDesktops | - |
| Workspace index addressing (`focus-workspace 2` = whatever is 2nd) | | wiki Workspaces | done | desktop order | keyBindings |
| Workspace switch with a window moved along | | layout/mod.rs | done | `window-move-to-*desktop` + follow | followWindowToDesktop |
| Windows keep their layout on other desktops | | | done | World.ts / DesktopManager.ts | otherDesktopLayout |

## 5. Overview

| Item | niri behaviour | niri source | Status | Kiri | Test |
|---|---|---|---|---|---|
| Overview: workspaces stacked, zoom 0.5, gap 0.1*height, active centred | | monitor.rs `set_overview_progress` 1393; misc.rs `Overview` | done | FX overview/ + QML overview/qml/Main.qml | overview |
| `overview { zoom }` | 0..1 | misc.rs | missing | `Zoom` constant in OverviewEffect.h | - |
| `overview { backdrop-color }` | default #262626 | misc.rs | missing | constant in Main.qml | - |
| `overview { workspace-shadow }` (off, offset, softness, spread, color) | default 0/10, 40, 10, #00000050 | appearance.rs 393 | partial | drawn with the defaults (Main.qml 337-345); no options | - |
| Click a window: activate and close overview | | layout/mod.rs; input/mod.rs | done | Main.qml | overview |
| Click a workspace: go to it | | | done | Main.qml | overview |
| Wheel scrolls workspaces without Mod; right-drag scrolls the view | | wiki Overview | done | Main.qml WheelHandler | overview |
| Two-finger touchpad scroll like the 3-finger gestures | | wiki Overview | missing | wheel only | - |
| Drag a window: rubber band, 256 px, insert hint, drop in column / new column / other workspace / floating | | layout/mod.rs 4027-4254 | done | Main.qml, Overview.ts, ClientManager.ts | overview |
| Drop a window onto the space between workspaces: new workspace | | layout/mod.rs `InsertWorkspace` | partial | needs dynamic desktops: not done (old doc: "no new desktop by dropping between desktops") | - |
| DnD edge workspace switch (`dnd-edge-workspace-switch`: trigger-height 50, delay-ms 100, max-speed 1500) | | gestures.rs; layout/mod.rs `dnd_update` 4517 | missing | | - |
| DnD edge view scroll (`dnd-edge-view-scroll`: trigger-width 30, delay-ms 100, max-speed 1500) | | gestures.rs; scrolling.rs 3204 | missing | | - |
| DnD hold to activate (a window, a workspace) | | wiki Gestures | missing | | - |
| Hot corners | top-left default; `off`, `top-left/right`, `bottom-left/right`; toggles overview, works while dragging | gestures.rs `HotCorners`; input/mod.rs 3081 | partial | only the top-left, on/off (`hotCorner`); FX overview/ `inHotCorner`; also during DnD: no | NiriImport (hot corners) |
| Keys while the overview is open (all binds keep working) | | wiki Overview | partial | only Up/Down, Enter, Esc, Meta+O and the search; the others do not reach Kiri | - |
| Floating windows in the overview | | | done | Main.qml | overview |
| Layer rules: place-within-backdrop; top/overlay layers stay above | | layer_rule.rs | n/a | Plasma panels and wallpaper are KWin-managed | - |
| No cursor warp / focus follows mouse while the overview is up | | | done | | overview |

## 6. Input config (`input {}`)

| Item | niri behaviour | niri source | Status | Kiri | Test |
|---|---|---|---|---|---|
| focus-follows-mouse (max-scroll-amount, outputs-only) | focus under the pointer, no scrolling beyond the limit | input.rs `FocusFollowsMouse` 396; input/mod.rs 3052 | partial | `focusFollowsMouse`, `focusFollowsMouseMaxScroll`; `outputs-only` n/a; needs KWin "click to focus" (install.sh) | focusFollowsMouse |
| warp-mouse-to-focus (mode center-xy, center-xy-always) | pointer to the focused window | input.rs 404 | partial | `cursorFollowsFocus` bool: no mode choice | cursorFollowsFocus |
| workspace-auto-back-and-forth | | input.rs | missing | see section 4 | - |
| mod-key, mod-key-nested | | input.rs | partial | fixed to Meta | - |
| disable-power-key-handling | | input.rs | n/a | Plasma | - |
| keyboard (xkb, repeat, numlock, track-layout), touchpad, mouse, trackpoint, trackball, tablet, touch, scroll-factor | device settings | input.rs 94-410 | n/a | Plasma System Settings | - |

## 7. Window rules (`window-rule {}`)

Matchers (`match` / `exclude`, window_rule.rs):

| Item | niri behaviour | niri source | Status | Kiri | Test |
|---|---|---|---|---|---|
| app-id, title (regex, matches anywhere) | | window_rule.rs `Match` | done | `class`, `caption`, plus `resourceName`; matches the whole string, so import wraps with `.*` (niri/import.ts `anchored`) | rules/WindowRuleEnforcer, windowRules |
| is-active, is-focused, is-floating | | | done | rules/WindowRuleEnforcer.ts | windowRules |
| is-active-in-column | | | missing | feasible from Column.ts | - |
| is-urgent | | | missing | KWin `demandsAttention` | - |
| is-window-cast-target | | | n/a | | - |
| at-startup (first 60 s) | | | missing | feasible: time since login | - |
| Multiple match / exclude lines | | | done | `exclude` list | rules/WindowRuleEnforcer |

Properties:

| Item | niri behaviour | niri source | Status | Kiri | Test |
|---|---|---|---|---|---|
| open-floating (and false) | | window_rule.rs | done | `tile: false/true` | windowRules |
| default-column-width, default-window-height | | | done | `width`, `height` | windowRules |
| open-fullscreen | | | done | `fullscreen` | windowRules |
| open-maximized (full-width column) | | | missing | | - |
| open-maximized-to-edges | | | missing | | - |
| open-focused | open without taking focus | compositor.rs 153 | missing | KWin may activate regardless; can re-activate the old window | - |
| open-on-workspace, open-on-output | | | missing | feasible: `kwinClient.desktops` on `clientAdded` (workspace by name needs section 4) | - |
| on-xdg-activate (ignore, set-urgent, focus) | | | missing | KWin policy | - |
| min-width, min-height, max-width, max-height | | | missing | clients' own limits are read (Clients.ts, Column.ts); rule limits are not | - |
| default-column-display | tabbed for this window | | missing | | - |
| default-floating-position (x, y, relative-to) | | | missing | float rules centre the window (ClientManager.ts `applyOpenRules`) | windowRules |
| focus-ring / border / shadow / tab-indicator rules | per-window overrides | | partial | the effect side is done: D-Bus `setWindowDecorations` on kiri_decorations, called by `setWindowDecorations(id, rule)` in Kiri.ts (rule shape: `WindowDecorationRule`, also `cornerRadius`); matching the rules and calling it is the window-rules work | decorations |
| opacity | | | missing | feasible in the motion effect (`setOpacity`) | - |
| geometry-corner-radius, clip-to-geometry | | | partial | global `cornerRadius` only (kiri_corners shader) | - |
| draw-border-with-background | | | missing | | - |
| block-out-from (screencast, screen-capture) | | | impossible | KWin offers no per-window exclusion from screen casts | - |
| variable-refresh-rate | | | n/a | Plasma output settings | - |
| baba-is-float | joke: windows float | | missing | trivial with the float animation; low priority | - |
| tiled-state | tell the client it is tiled | | impossible | KWin does not expose xdg tiled states to scripts | - |
| background-effect (blur, xray, noise, saturation) and top-level `blur {}` | | appearance.rs 1025-1100 | impossible | the blur effect is Plasma's and has no per-window script API | - |
| popups { opacity, corner-radius, background-effect } | | window_rule.rs `PopupsRule` | impossible | KWin draws popups itself | - |
| Rule order: later rules win, merged | | window_rule.rs | done | rules/WindowRuleEnforcer.ts | windowRules |
| Kiri-only rules: `tile`, class lists, `columnWidthRules`, defaults for Plasma's windows | | | n/a | config/definition.ts | windowRules |

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
| animations off / slowdown | global | animations.rs `Animations` | partial | follows KWin's animation speed (`animationTimeFactor`, "instant" turns Kiri's animations off); no Kiri-own option | - |
| Per-animation `off`, spring (damping-ratio, stiffness, epsilon), easing (duration-ms, curve ease-out-quad/cubic/expo/linear/cubic-bezier) for workspace-switch, window-open, window-close, horizontal-view-movement, window-movement, window-resize, overview-open-close | | animations.rs | missing | constants in common/NiriAnim.h `Defaults`; the effects read kwinrc `Script-kiri` for other options, so a config is feasible | - |
| animations `custom-shader` (open, close, resize) | | animations.rs | missing | feasible in the effects (GLSL) but niri's shader contract differs from KWin's | - |
| config-notification / exit-confirmation / screenshot-ui / recent-windows-close animations | | animations.rs | n/a | no such UI | - |
| prefer-no-csd | server-side decorations | lib.rs | partial | `hideTitlebars` hides title bars on tiled windows (default on); does not ask clients to drop CSD | hideTitlebars |
| cursor { xcursor-theme, size, hide-when-typing, hide-after-inactive-ms } | | misc.rs | n/a | Plasma | - |
| screenshot-path, clipboard, hotkey-overlay options, config-notification, environment, xwayland-satellite, spawn-at-startup | | misc.rs | n/a | | - |
| recent-windows (alt-tab MRU UI: debounce, open-delay, highlight, previews, binds) | | recent_windows.rs; ui/mru.rs | n/a | KWin's Alt+Tab is Plasma's; `focus-window-previous` covers the quick toggle | nirActions |
| switch-events (lid, tablet mode) | | wiki Configuration:-Switch-Events | n/a | Plasma power management | - |
| outputs (mode, scale, transform, position, vrr, focus-at-startup) | | output.rs | n/a | Plasma Display settings | - |
| debug {} options (all 22) | renderer / DRM / pipewire switches | debug.rs | n/a | none apply to KWin | - |
| IPC (`niri msg`, event stream) | | wiki IPC | n/a | | - |
| Accessibility, screencasting, xwayland, layer-shell wiki pages | | wiki | n/a | KWin / Plasma | - |
