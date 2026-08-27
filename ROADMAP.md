# kniri roadmap

Goal: make KWin scrollable tiling feel like niri, on top of Karousel.

## Done
- Full-screen and maximized windows stay in the grid (on by default).

## Next
1. **Key bindings that are easy to change.**
   KWin puts every script shortcut into the big "KWin" list in System Settings, and a script can't make its own group there.
   All kniri shortcuts start with "kniri:", so searching "kniri" lists them together.
   Plan: add a "Key bindings" page to kniri's own settings, with simple `Meta+H = focus-left` lines, like niri's config file.
   To research first: how this works together with KDE's global shortcut storage (kglobalaccel), so the two don't fight.
2. **niri default bindings.** Use niri's default keys (Mod+H/J/K/L, Mod+Ctrl+H/L, Mod+R for preset widths, Mod+F to maximize a column, and so on), wherever they don't clash with Plasma.
3. **Vertical workspaces.** Use KWin virtual desktops in one vertical column, with an empty one always at the bottom and empty ones removed automatically, plus niri's workspace keys.
   Limitation: KWin desktops are shared by all monitors, while niri has separate workspaces per monitor.
4. **Overview.** First, a kniri binding that opens KWin's built-in Overview. Later, maybe a niri-like zoomed-out view, which needs a KWin QML effect (a bigger job).

## Keeping up with Karousel
`upstream` points to peterfajdiga/karousel. Merge upstream changes from time to time.
