# Kiri

A scrollable tiling script for KDE Plasma 6 (KWin) that tries to work like [niri](https://github.com/YaLTeR/niri).

Kiri is a fork of [Karousel](https://github.com/peterfajdiga/karousel) by Peter Fajdiga, and most of the code is his. Both are GPLv3. See Karousel's README for how the scrolling layout works.

What's different so far:
- Full-screen and maximized windows stay in the grid, like in niri.
- niri's defaults: 16px gaps, column widths of 1/3, 1/2 and 2/3, and three-finger swipe to scroll.

Kiri has its own script ID, so it can be installed next to Karousel. Only enable one of them.

## Install
Full install (borders and rounded corners that follow animations, a workspace switch that follows the touchpad,
mouse wheel binds, the animation effect): download `kiri_*.tar.gz` from [Releases](https://github.com/SeniorMatt/kiri/releases), extract it and run

    ./install.sh

It builds the compiled effects against your KWin, so run it again after KWin updates. Arch-based systems only for now.

To remove it, run `./uninstall.sh` from the same folder (it switches to Plasma mode first). It asks before removing anything, then asks whether to
also delete your Kiri settings and shortcuts; keep them if you only want Kiri gone for a while.

Script only: download `kiri_*.kwinscript`, then in System Settings > Window Management > KWin Scripts use
"Install from File…", tick Kiri and log in again.

Run it again to update. Then log out and back in, and enable Kiri in System Settings > Window Management > KWin Scripts if it isn't already.

## Switching between Kiri and Plasma
`install.sh` installs `kiri-mode` (in `~/.local/bin`) and a "Switch Kiri / Plasma" entry with the shortcut
Meta+Ctrl+Shift+K (not set if that key is taken). No log out, no uninstall:

    kiri-mode toggle | kiri | plasma | status

Your Plasma settings stay as they are in System Settings (kwinrc). Kiri mode only overrides them while it runs: the Kiri
script unloads Plasma's Slide, Overview, Geometry change, Fade, Scale, Glide and Maximize effects and loads the kiri_*
effects, and `kiri-mode` sets the three settings that have no runtime switch (focus policy "Click to focus", desktop
wrap-around off, desktops in one column) while keeping your values in the `[Kiri-mode]` group of kwinrc. Plasma mode puts
it all back; a message on screen says which mode you are in. The mode is remembered for the next login. If the session
ends in Kiri mode, the saved values survive. A setting you change in System Settings while in Kiri mode is not overwritten
when you go back to Plasma mode. Enabling or disabling only the script in KWin Scripts switches the effects but not these
three settings; use `kiri-mode` for that. Upgrading from 0.10.5 or older: Plasma's effects are back at their defaults
(Kiri could not know which ones you had turned off before it).

## Shortcuts
They're in System Settings > Shortcuts > Kiri, and the defaults follow niri's, except moving uses Meta+Shift instead of Meta+Ctrl:

    Meta+H/J/K/L, Meta+arrows      focus
    Meta+Shift+H/L                 move column
    Meta+Shift+J/K                 move window up/down
    Meta+[ / Meta+]                move window into the column on the left/right
    Meta+Home/End                  focus first/last column
    Meta+U/I, Meta+PgDown/PgUp     next/previous desktop
    Meta+Shift+U/I                 move column to next/previous desktop
    Meta+1..9                      go to desktop
    Meta+Ctrl+1..9                 move column to desktop
    Meta+R                         cycle column widths
    Meta+F                         maximize column
    Meta+Shift+F                   full-screen
    Meta+- / Meta+=                narrower/wider column
    Meta+C                         center column
    Meta+W                         toggle tabbed column
    Meta+V                         toggle floating
    Meta+Q                         close window
    Meta+O                         overview (also: 4-finger swipe up)

To use the keys from your niri config, run `tools/niri2kiri.py ~/.config/niri/config.kdl` and paste what it prints over the `[kiri]` section of `~/.config/kglobalshortcutsrc`, then log in again. Kiri has to have been enabled once before.

To take your niri `layout`, `window-rule`s and keys in one go, run `tools/niri2kiri.py ~/.config/niri/config.kdl --apply`. Settings and shortcut keys apply live. `--settings` prints just the settings (`[Script-kiri]` in `kwinrc`), and anything Kiri can't map is listed on stderr.

While Kiri is running, Plasma shortcuts on the same keys are switched off. Nothing is changed in your settings, they work again as soon as Kiri is disabled.

## Building
You need pnpm.

    make package

`make test` runs the tests, `make build` also lints.

Kiri has to be started in a real session or a nested KWin to try it out. If nothing gets tiled in a nested one, start kactivitymanagerd first.

## License
GPLv3, see LICENSE.

## Animations and gestures

Kiri ships a KWin effect, `kiri_animations`, that animates window moves and resizes (ease-out, 250 ms, retargets smoothly
when interrupted; skipped during mouse move/resize, full-screen toggles and touchpad scrolling). `make install` and
`tools/install.sh` install and enable it; otherwise enable "Kiri animations" in System Settings > Window Management > Desktop
Effects. Don't run another geometry-change effect next to it. After a tiled window closes, Kiri waits `closeRelayoutDelay`
ms (default 150) before re-laying out, so the neighbours slide after the close animation instead of jumping into it.

Three-finger swipes: left/right scroll the columns and snap to a column edge on release (with momentum), up/down switch
to the next/previous desktop. Plasma's own three-finger desktop swipe also fires when the desktop grid has more than one
column (horizontal) or row (vertical); use a single column of desktops (rows = number of desktops) so only Kiri reacts.
