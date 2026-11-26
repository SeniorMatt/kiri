# Kiri

[niri](https://github.com/YaLTeR/niri)'s scrolling tiling for KDE Plasma 6.

https://github.com/user-attachments/assets/7be4d139-5198-4f73-94b6-600a1f21a36f

A fork of [Karousel](https://github.com/peterfajdiga/karousel) by Peter Fajdiga.

Windows are tiled in columns on an endless horizontal strip. Opening a window never squeezes the others: each column
keeps the width you gave it, and when the strip gets wider than the screen you scroll through it sideways. The focused
column is kept in view, centered when that makes sense.

Multiple monitors are fully supported: each monitor scrolls its own columns.

Other scrolling window managers: [niri](https://github.com/YaLTeR/niri), [PaperWM](https://github.com/paperwm/PaperWM)
and [Cardboard](https://gitlab.com/cardboardwm/cardboard).

## Install

Needs Plasma 6.7 or newer.

### Arch / CachyOS

[kwin-kiri](https://aur.archlinux.org/packages/kwin-kiri) on the AUR, packaged by Joaquim Monteiro:

    yay -S kwin-kiri

### Other distros

Download `kiri_<version>.tar.gz` from [Releases](https://github.com/SeniorMatt/kiri/releases) (not "Source code"),
unpack it and run:

    ./install.sh

It shows what it will change and asks first. `./uninstall.sh` removes Kiri again.

### After installing

`kiri-mode toggle` switches between Kiri and plain Plasma. Coming from niri?
`niri2kiri ~/.config/niri/config.kdl --apply` brings your settings over.

Kiri's effects are built against your KWin, so after a KWin update rebuild Kiri and log out and in.

## Build

    make package

## License

GPLv3
