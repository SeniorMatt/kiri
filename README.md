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

KDE Plasma 6.8 or newer (KWin 6.7.90+; Kubuntu 24.04 and 26.10 are too old). `install.sh` builds the effects against
your KWin and installs the packages itself on Arch and CachyOS; elsewhere it prints the line to run:

- Fedora: `sudo dnf install cmake gcc-c++ make extra-cmake-modules kwin-devel kdecoration-devel kf6-kconfig-devel kf6-kcoreaddons-devel libepoxy-devel libdrm-devel qt6-qtbase-devel qt6-qttools kf6-kpackage`
- openSUSE: `sudo zypper install cmake gcc-c++ make kf6-extra-cmake-modules kwin6-devel kdecoration6-devel kf6-kconfig-devel kf6-kcoreaddons-devel libepoxy-devel libdrm-devel qt6-base-devel qt6-declarative-devel kf6-kwindowsystem-devel qt6-tools-qdbus kf6-kpackage kwin6`
- KDE neon: `sudo apt install build-essential cmake extra-cmake-modules kwin-dev libkdecorations3-dev libkf6config-dev libkf6coreaddons-dev libepoxy-dev libdrm-dev pkgconf qt6-base-dev kpackagetool6 qdbus-qt6`

Run `install.sh` again after KWin updates.

## Limitations

- Desktops are shared by all monitors, so there are no per-monitor workspaces.
- Binds on a bare modifier or on key release (e.g. tapping Mod for the overview) are not possible.

## Build

    make package

## License

GPLv3
