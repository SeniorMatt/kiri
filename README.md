# Kiri

A scrollable tiling script for KDE Plasma 6 (KWin) that tries to work like [niri](https://github.com/YaLTeR/niri).

Kiri is a fork of [Karousel](https://github.com/peterfajdiga/karousel) by Peter Fajdiga, and most of the code is his. Both are GPLv3. See Karousel's README for how the scrolling layout works.

What's different so far:
- Full-screen and maximized windows stay in the grid, like in niri.
- niri's defaults: 16px gaps, column widths of 1/3, 1/2 and 2/3, and three-finger swipe to scroll.

Kiri has its own script ID, so it can be installed next to Karousel. Only enable one of them.

## Install
Download `kiri_*.tar.gz` from [Releases](https://github.com/SeniorMatt/kiri/releases), then:

    tar -xzf kiri_*.tar.gz
    kpackagetool6 --type=KWin/Script --install ./kiri

Use `--upgrade` instead of `--install` to update. Enable it in System Settings > Window Management > KWin Scripts.

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
    Meta+O                         overview

To use the keys from your niri config, run `tools/niri2kiri.py ~/.config/niri/config.kdl` and paste what it prints over the `[kiri]` section of `~/.config/kglobalshortcutsrc`, then log in again. Kiri has to have been enabled once before.

While Kiri is running, Plasma shortcuts on the same keys are switched off. Nothing is changed in your settings, they work again as soon as Kiri is disabled.

## Building
You need pnpm.

    make package

`make test` runs the tests, `make build` also lints.

Kiri has to be started in a real session or a nested KWin to try it out. If nothing gets tiled in a nested one, start kactivitymanagerd first.

## License
GPLv3, see LICENSE.
