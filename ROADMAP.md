# Roadmap

Rough list, in order.

- Touchpad gestures like niri: three fingers left/right to scroll, up/down to switch desktop.
- Virtual desktops as niri's vertical workspaces, with an empty one always at the bottom.
- A key to open KWin's Overview. Maybe a zoomed-out view later.

- Per-monitor desktops (KWin 6.8's PerOutputVirtualDesktops): follow each monitor's own current desktop.
- niri's dynamic desktops: always one empty desktop at the bottom, empty ones removed.
- A niri-style overview as a QML effect: zoomed-out desktops with live thumbnails.

After that:

- Work around the current limitations (gesture tracking, Plasma's own swipe gestures, shortcut edits in Plasma's Shortcuts page).
- Fix the issues copied from Karousel (label `karousel`).

Desktops are shared by all monitors in KWin, so per-monitor workspaces won't be possible.

Merge from Karousel now and then (`upstream` remote).
