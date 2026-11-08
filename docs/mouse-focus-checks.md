# Cursor follows focus and focus follows mouse: checks against niri

Source of truth: niri (YaLTeR/niri, main) `src/input/mod.rs`, `src/niri.rs`, `src/handlers/*.rs`, `src/layout/*.rs`, and the wiki page
Configuration:-Input. "Test" names are in `src/tests/flows/cursorFollowsFocus.ts` (CFF), `focusFollowsMouse.ts` (FFM) and
`floatingKeys.ts`. "changed" marks the lines where Kiri's behaviour was changed to match niri.

## How niri decides where the pointer goes (warp-mouse-to-focus)

- `maybe_warp_cursor_to_focus` (niri.rs) runs `move_cursor_to_focused_tile` -> `move_cursor_to_rect`. Default mode (no `mode=`):
  `CenterCoords::Separately`. The target rectangle is `active_window_visual_rectangle()`: the focused window at its FINAL place
  (view offset target, animations ignored) intersected with the output view, so only the visible part counts.
  If the pointer is inside the rectangle (bounds inclusive) nothing happens; if only one coordinate is outside, only that
  coordinate moves, to the middle of the rectangle (the other keeps its value); if both are outside, the middle.
  `center-xy` (`Both`) and `center-xy-always` are not defaults and not implemented in Kiri.
- Not done when the keyboard focus is not on the layout (overview, MRU, lock screen: `keyboard_focus.is_layout()`), and in the
  overview there is no visual rectangle. Not done while a tablet is in use.
- `maybe_warp_cursor_to_focus_centered` (used after a move to another monitor) is mode `Both`: the middle when the pointer is outside.
- The warp itself moves the pointer without running focus-follows-mouse (`move_cursor` does not call `handle_focus_follows_mouse`).

## Checklist: cursor follows focus

| Situation | niri | niri source | Kiri test | Kiri |
|---|---|---|---|---|
| focus-left/right/up/down, focus-column-first/last, focus-window-top/bottom/..., focus-column-or-first, focus-window-or-workspace-* | warp (Separately) after the action, even when the focus did not change | input/mod.rs `Action::FocusColumnLeft` ... `FocusWindowUpOrBottom` | "Cursor follows focus", "only the coordinate outside the window moves", "a key that does not change the focus still brings the pointer back" | changed (axis-wise, final rect, also without a focus change) |
| Pointer already inside the target window | no warp | `move_cursor_to_rect` | "Cursor follows focus" | same |
| Pointer outside on one axis | only that axis moves to the middle of the visible part | `CenterCoords::Separately` | "only the coordinate outside the window moves" | changed (was: always the window centre) |
| Window partly off screen | the middle of the visible part | `active_window_visual_rectangle` (`view.intersection`) | "the warp goes to the visible part" | changed |
| Warp target while the view scrolls | final place of the window, not the animated one | `scrolling.rs active_window_visual_rectangle` (`view_offset.target()`) | CFF tests (the warp runs after the arrange) | changed (warp is done at the end of the layout pass) |
| focus to another workspace/desktop (keyboard) | warp to the window that is focused there | `FocusWorkspace*`, `FocusWorkspacePrevious` | "Cursor follows focus" desktop cases in focusMatrix | same (waits for the focus to arrive) |
| workspace switch from a bar / IPC (`switch_workspace` in handlers/mod.rs) | NO warp ("assuming the layer-shell bar use-case") | handlers/mod.rs `workspace_activate`-style handler | not applicable (Kiri has no such entry) | n/a |
| focus-monitor-*, move-*-to-monitor-* | `Both` mode | `maybe_warp_cursor_to_focus_centered` | `screen-switch` uses `both` | changed |
| window opens and gets the focus | warp | handlers/compositor.rs (`new_focus == Some(&window)` -> `maybe_warp_cursor_to_focus`) | "a window that opens and takes the focus gets the pointer" | changed (bug 1: KWin activates the window before the script hears about it) |
| window opens in the background / unfocused | no warp | same condition | same test | same |
| window closes and the focus passes | warp only if the closed window was the focused one | handlers/xdg_shell.rs `toplevel_destroyed` (`if was_active`) | "the window that gets the focus when one closes gets the pointer" | same |
| focused floating window closes (tiled or floating focus before) | the topmost floating window that is left gets the focus; without one the tiling layer's active window (the one focused before the floating window); never the window under the pointer | layout/floating.rs `remove_tile_by_idx` (topmost tile active), workspace.rs `remove_tile` + `update_focus_floating_tiling_after_removing` | "Closing a floating window gives the focus back to the tiling layer's active window, not the one under the pointer" and 3 more in floatingKeys.ts | changed (bug 2: with `[Windows] NextFocusPrefersMouse=true` KWin picks the window under the pointer; Kiri now overrides the pick,) |
| dialog / floating app window closes | same as a floating window (niri has no dialog layer) | same | same tests | changed |
| unfocused floating window closes | no focus change | `was_active` checks | "Closing an unfocused floating window does not move the focus" | same |
| move-column-left/right/first/last, move-window-up/down, swap, consume-or-expel-*, expel-window-from-column, column display, move to workspace | warp | input/mod.rs `MoveColumn*`, `MoveWindow*`, `ConsumeOrExpel*`, `ExpelWindowFromColumn`, `Swap*`, `ToggleColumnTabbedDisplay`, `SetColumnDisplay` | "moving a column warps, resizing and toggling do not" | changed (moves did not warp) |
| consume-window-into-column | no warp (no call in the arm) | input/mod.rs `Action::ConsumeWindowIntoColumn` | not in warping list | same |
| width/height presets, set-column-width, expand, center-column/window, maximize-column, maximize-to-edges | no warp | input/mod.rs (no call) | "moving a column warps, resizing and toggling do not" | same |
| fullscreen / windowed fullscreen / maximize toggles | no warp | input/mod.rs (no call) | same test | changed (Kiri warped when leaving full-screen) |
| toggle floating, move to floating / tiling | no warp | input/mod.rs (no call) | not in the warping list | same |
| focus-floating / focus-tiling / switch-focus-between-floating-and-tiling | warp | input/mod.rs | "Switch focus to floating moves the cursor" | same |
| focus-window-previous, alt-tab (MRU confirm) | warp (`focus_window`) | niri.rs `focus_window`, `confirm_mru` | "Cursor follows focus" (previous) | same |
| scroll by touchpad gesture / swipe | no warp | gesture handlers (no call) | gesture tests do not warp | same |
| overview open / close / pick with the pointer | no warp (pick is a click; no visual rectangle while open) | input/mod.rs `ToggleOverview`; `on_pointer_button` | overview.ts | same |
| focus by clicking | no warp | `on_pointer_button` | "pointer focus never warps" | same |
| focus by hovering (focus-follows-mouse) | no warp | `handle_focus_follows_mouse` | "pointer focus never warps" | same |
| app activation (xdg-activation), taskbar activate (foreign toplevel) | no warp | handlers/mod.rs `activate`, xdg_shell.rs `XdgActivationHandler` | "an app activating itself" in "pointer focus never warps" | same |
| warp does not echo into focus-follows-mouse | no refocus | `move_cursor` | "a cursor warp does not focus what is above the focused window" | same |

## Checklist: focus follows mouse

niri: `handle_focus_follows_mouse` (niri.rs) is called only from pointer motion (relative and absolute) and tablet events, and only when
`!pointer.is_grabbed()` (input/mod.rs). It is never run from the layout, from window opening/closing or from a warp.

| Situation | niri | niri source | Kiri test | Kiri |
|---|---|---|---|---|
| Still pointer while the layout moves under it (scroll, new window, close, move) | no focus change | called from motion events only | "a still pointer never changes the focus when the layout moves", "a window that slid under a still pointer is not entered by a small move" | same |
| Window left is looked up with the layout now | `contents_under(prev_location)` is recomputed | niri.rs `handle_focus_follows_mouse` | "slid under a still pointer" | same |
| Only a change of the window under the pointer focuses | `current_focus.window != new window` | same | same | same |
| Button held (drag, drag and drop) | nothing | `!pointer.is_grabbed()` | "ignores the pointer while a button is held" | same |
| Focus given after the pointer event (new window, key) | stays: niri decides inside the event | the call is synchronous | "a late answer does not take away a focus given after the pointer event" | changed (Kiri asks the effect for the buttons asynchronously; an answer that came after another focus change took the focus back, probable cause of bug 2) |
| After a warp | no echo refocus | `move_cursor` | "a cursor warp does not focus what is above the focused window" | same |
| max-scroll-amount | skip when `scroll_amount_to_activate(window) > threshold` (fraction of the working area) | `layout.scroll_amount_to_activate`, `ffm.max_scroll_amount` | "max-scroll-amount stops hovering a window that needs a big scroll" | approximated: part of the window off screen / screen width (niri uses the view offset the focus would need) |
| Tab indicator of a tabbed column | skipped | `HitType::Activate { is_tab_indicator }` | tabs tests | same |
| Overview open | skipped | `!is_overview_open()` | overview.ts | same |
| Plasma popup open | (no niri equivalent: layer surfaces keep on-demand focus) | `layer_shell_on_demand_focus` | popup test | Kiri extra |
| Other output | pointer onto another output focuses it even outside windows | `layout.focus_output` | none | not implemented |

Not verified on hardware / not implemented: `mode="center-xy"`, `center-xy-always`, `outputs-only`, tablets, `workspace-auto-back-and-forth` interplay, exact niri `scroll_amount_to_activate` for centered columns.
