# Kiri

[niri](https://github.com/YaLTeR/niri)'s scrolling tiling for KDE Plasma 6.

A fork of [Karousel](https://github.com/peterfajdiga/karousel) by Peter Fajdiga.

## Install

Grab the latest tarball from [Releases](https://github.com/SeniorMatt/kiri/releases), then

    ./install.sh

and log back in.

`kiri-mode toggle` switches between Kiri and plain Plasma.

Already on niri? `./niri2kiri.py ~/.config/niri/config.kdl --apply`

## Dependencies

KDE Plasma 6.8 or newer. `install.sh` builds the effects against your KWin, so it needs cmake, extra-cmake-modules,
a C++ compiler, libepoxy and the KWin, Qt 6 and KF6 development headers. On Arch it installs them itself.
Run it again after KWin updates.

## Limitations

- Desktops are shared by all monitors, so there are no per-monitor workspaces.
- Binds on a bare modifier or on key release (e.g. tapping Mod for the overview) are not possible.

## Build

    make package

## License

GPLv3
