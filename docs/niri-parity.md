# niri parity checklist

Source: niri `src/layout/{scrolling,workspace,floating,monitor,mod}.rs`, `niri-config`, `resources/default-config.kdl` (cloned 2026-11-23). Status: SAME = already matched, FIXED = changed on this branch with a regression test, OPEN = mismatch found and not fixed yet (proposal), IMPOSSIBLE = KWin can't do it.

## Mismatches found and fixed

| Item | niri | Kiri before | Status |
|---|---|---|---|
| Focus after closing the active window/column | scrolling.rs:1192-1275 remove_column_by_idx: the column that takes its index (right neighbour) is activated, the last column goes left; a window opened right of the active column returns to the column it came from (activate_prev_column_on_removal) with the old view offset | Left neighbour always | FIXED |
| Focus after closing a window inside a column | scrolling.rs:1074-1170 remove_tile_by_idx: the tile below takes the place, the one above only when the bottom one was active | Window above first | FIXED |
| center-focused-column always | scrolling.rs:655-710: centers on every activation, also visible columns | Only centered when the column was not fully visible | FIXED |
| center-focused-column on-overflow | scrolling.rs:668-702: compares with the neighbour on the side the focus came from, fits the target alone, else centers | Compared with the previously focused column and scrolled both into view | FIXED |
| default-column-width | niri-config layout.rs:43 default Some(proportion 0.5); an empty block means the window decides | Default "" (windows kept their own width); empty block import ignored | FIXED (default 50%, empty block imports as "") |
| Lone column / grid that fits the screen | scrolling.rs compute_new_view_offset: a column that fits is left aligned (always-center-single-column off) | centerGridWhenFits defaulted to true (centered) | FIXED (default false) |
| Window heights in a column (auto weights / fixed) | scrolling.rs:4601-4890 update_tile_sizes, 5104 set_window_height, 5198 toggle_window_height, 4475 add_tile_at (new tile auto weight 1), 1119 (lone auto window weight reset) | Every window reset to equal height whenever one came or went; presets only with 2+ windows; cycled by value | FIXED (auto/fixed model, preset index memory, single window presets) |
| Default keys | default-config.kdl binds: Mod+Ctrl+H/J/K/L/arrows move, Mod+Ctrl+Home/End, Mod+Ctrl+U/I/PgUp/PgDn column to workspace, Mod+[ ] consume-or-expel, Mod+, consume-into, Mod+. expel, Mod+Shift+R, Mod+Ctrl+Shift+R, Mod+Ctrl+R, Mod+Ctrl+F, Mod+Ctrl+C, Mod+-/= +-10%, Mod+Shift+-/= height, Alt+F4 | Meta+Shift for moves, Meta+, was consume-or-expel, Meta+[ ] were Karousel's move-left/right, no keys for the rest | FIXED (test compares every mapped bind of niri's default config with Kiri's registered keys) |
| Center column | scrolling.rs:2247 center_column always centers | Karousel toggle: a second press scrolled back | FIXED |
| center-visible-columns | scrolling.rs:2284 | missing | FIXED (`column-center-visible`) |
| set-column-width +-N%, set-window-height +-N% | scrolling.rs:5054, 5104 (proportion of the working area) | Karousel's contextual resizer | FIXED (`column-width-increase/decrease`, `window-height-increase/decrease`, steps in settings; the old resizer stays as `column-width-fit-increase/decrease`) |
| expand-column-to-available-width | scrolling.rs:2833: if only the active column is fully visible it toggles full width | stayed at the same width | FIXED |
| focus-column / focus-window-in-column / move-column-to-index with a too big number | scrolling.rs:1610, 4916 clamp to the last | did nothing | FIXED |
| Fullscreen in a tabbed column | scrolling.rs:2930 set_fullscreen only extracts the window when the column is not tabbed | always expelled | FIXED |
| Missing focus actions | focus-column-right-or-first, -left-or-last, focus-window-down/up-or-column-left/right, focus-window-top/bottom/down-or-top/up-or-bottom, focus-window-in-column N, focus-window-or-workspace-up/down | missing (the niri import mapped the workspace ones to plain focus-up/down) | FIXED |
| Missing move actions | move-window-down/up-or-to-workspace-down/up, swap-window-left/right, set-column-display, move-window-to-floating/tiling, focus-floating/tiling, focus-workspace-previous, focus-window-previous | missing | FIXED (import maps in import.ts and niri2kiri.py updated) |
| Dropping a dragged window | interactive move: insert_position (scrolling.rs:850) puts the window at the closest gap between columns or windows | stayed floating | FIXED (`dropToTile`, default on) |
| Dynamic workspaces | an empty workspace is always at the bottom, empty ones disappear | fixed number of desktops | FIXED as an option (`dynamicDesktops`, default OFF, uses Workspace.createDesktop/removeDesktop; only tested with mocks) |

## Checked and already the same

focus-column-left/right/first/last and focus-window-up/down (no wrapping); focus lands on the column's active window; move-column-left/right/to-first/to-last (the view keeps the column visible); move-window-up/down inside a column; consume-or-expel-window-left/right, consume-window-into-column, expel-window-from-column (done earlier on main); new windows open right of the focused column; preset column widths 1/3, 1/2, 2/3 and the cycling rule (next preset wider than the current width, wrap); preset window heights; gaps 16 and outer gaps; focus ring (width 4, #7fc8ff / #505050), border off, tab indicator defaults (width 4, gap 5, length 0.5, left); fit scrolling (a column that is not fully visible is aligned to the nearest edge); center-focused-column never; always-center-single-column; maximize-column toggles back; maximize-window-to-edges; a full-screen/maximized window gets its own column; toggle-column-tabbed-display; move-column-to-workspace and move-window-to-workspace follow the window and insert right of the active column; toggle-window-floating; floating windows move by 50 px; focus-workspace-up/down; switch-focus-between-floating-and-tiling; floating directional focus (merged from main).

## Open (proposals, not implemented)

- Window heights after a screen size change: niri re-resolves a preset height from the working area, Kiri keeps the pixel value until the next layout.
- A new column's width after consume-or-expel out of a column: niri keeps the source column's width, Kiri uses the window's preferred width for the extracted full-screen/maximized window.
- Floating windows: niri does not clamp a floating window to the working area when it moves by 50 px; Kiri clamps.
- Floating layer for actions other than focus/move: niri's set-column-width, switch-preset-column-width and center-column act on the floating window (preset sizes, centering); Kiri ignores them for floating windows.
- set-column-width / set-window-width / set-window-height with an absolute value (`"50%"`, `"800"`) in binds: need one action per value; skipped by the import.
- switch-preset-window-width (per-window width).
- Mouse wheel binds, `Mod` release toggling the overview: not possible as KWin shortcuts; the wheel ones live in the effect.
- Window rules: open-focused, open-maximized, open-fullscreen, min/max-width, block-out-from: not audited.
- Visual: a window that slides out to the left while a full-screen window slides in is not painted (see below).

## Impossible in KWin

- Per-monitor workspaces and focus-monitor-*, move-*-to-monitor-*, move-workspace-to-monitor-*: desktops are shared by all monitors; the grid sits on one screen.
- move-workspace-up/down, set-workspace-name, empty-workspace-above-first: scripts can create and remove desktops but not reorder or rename them (could be emulated by moving the windows; not done).
- toggle-windowed-fullscreen, spawn, screenshot, power-off-monitors, change-vt, quit, hotkey overlay: not window management or no KWin script API.
- Shortcut on the bare `Mod` key release (overview): Plasma owns it.

## Visual checks in a nested KWin (container ksr-kdelinux, own dirs /parity)

- Full-screen toggle: the old and new contents are stretched and cross-faded like niri's resize animation; the neighbour slides out. Looks right.
- Focusing a full-screen window from its neighbour (focus-right, then focus-left back): in the first frames of the slide the neighbour that is leaving to the left is not painted at all (black strip), it "disappears too early". Windows leaving to the right are painted. Not fixed; KWin's scene paints every window in the transformed-screen path, so the cause is probably in what the motion effect hands to CrossFadeEffect for a window whose real frame is already off screen on the left; needs a debug build of kiri_motion to log drawWindow calls.
- Not re-verified by me: the ring trail while resizing and the desktop switch cancel (both fixed on main with their own proofs).

