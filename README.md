# Kiri

A scrollable tiling script for KDE Plasma 6 (KWin) that tries to work like [niri](https://github.com/YaLTeR/niri).

Kiri is a fork of [Karousel](https://github.com/peterfajdiga/karousel) by Peter Fajdiga, and most of the code is his. Both are GPLv3. See Karousel's README for how the scrolling layout works.

What's different so far:
- Full-screen and maximized windows stay in the grid, like in niri.

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

While Kiri is running, Plasma shortcuts on the same keys are switched off. Nothing is changed in your settings, they work again as soon as Kiri is disabled.

## Building
You need pnpm.

    make package

Tests run with `make test`. `make build` only compiles.

Kiri has to be started in a real session or a nested KWin to try it out. If nothing gets tiled in a nested one, start kactivitymanagerd first.

## License
GPLv3, see LICENSE.
