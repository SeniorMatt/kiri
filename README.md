# Kiri

[niri](https://github.com/YaLTeR/niri)'s scrolling tiling for KDE Plasma 6.

https://github.com/user-attachments/assets/7be4d139-5198-4f73-94b6-600a1f21a36f

A fork of [Karousel](https://github.com/peterfajdiga/karousel) by Peter Fajdiga.

Windows are tiled in columns on an endless horizontal strip. Opening a window never squeezes the others: each column
keeps the width you gave it, and when the strip gets wider than the screen you scroll through it sideways. The focused
column is kept in view, centered when that makes sense.

Other scrolling window managers: [niri](https://github.com/YaLTeR/niri), [PaperWM](https://github.com/paperwm/PaperWM)
and [Cardboard](https://gitlab.com/cardboardwm/cardboard).

## Multiple monitors

- Every monitor has its own strip of columns, scrolled on its own.
- `Meta+Shift+Left/Right` focuses the next monitor, `Meta+Ctrl+Shift+Left/Right` moves the column there, as in niri.
- For niri's per-monitor workspaces, turn on "Switch desktops independently for each screen" in
  System Settings > Virtual Desktops: each monitor then switches its own desktop.

## Install

Grab the latest tarball from [Releases](https://github.com/SeniorMatt/kiri/releases), then

    ./install.sh

It shows what it's going to change and asks first. `./uninstall.sh` does the same to remove Kiri.

**Atomic distros** (Kinoite, Bazzite, Aurora, Kalpa, KDE Linux): `./install.sh` notices the read-only `/usr` and
builds the effects in a toolbox/distrobox container named `kiri-build` (about 1 GB, no sudo), then installs them
into `~/.local` and tells KWin where to look (`~/.config/environment.d/kiri.conf`). Log out and in once. If the
container's KWin doesn't match yours, Kiri installs without the compiled effects and draws its rings itself.

`kiri-mode toggle` switches between Kiri and plain Plasma.

Already on niri? `./niri2kiri.py ~/.config/niri/config.kdl --apply`

## Settings and shortcuts

There is no separate config file. Open System Settings > Window Management > KWin Scripts and press the settings
button next to Kiri. The Shortcuts tab there lists every shortcut and lets you change it; they are also under "Kiri"
in System Settings > Keyboard > Shortcuts. If a changed shortcut doesn't work right away, log out and in once.

Kiri saves its settings in `~/.config/kwinrc` (group `[Script-kiri]`) and its shortcuts in
`~/.config/kglobalshortcutsrc` (group `[kiri]`).

## Dependencies

Plasma 6.7 or newer. `install.sh` builds the effects against your KWin, so it needs these packages
(on Arch it installs them itself). Run it again after KWin updates, then log out and in: KWin keeps the old
effects loaded until the session restarts.

<details><summary>Arch / CachyOS</summary>

```
sudo pacman -S --needed base-devel cmake extra-cmake-modules kwin libepoxy qt6-base qt6-tools kconfig kconfigwidgets kcmutils kcoreaddons kwindowsystem qt6-declarative wayland libdrm vulkan-headers
```

</details>
<details><summary>Fedora</summary>

```
sudo dnf install cmake gcc-c++ make extra-cmake-modules kwin-devel kdecoration-devel kf6-kconfig-devel kf6-kconfigwidgets-devel kf6-kcmutils-devel kf6-kcoreaddons-devel libepoxy-devel libdrm-devel qt6-qtbase-devel qt6-qttools-devel kf6-kpackage
```

</details>
<details><summary>Kubuntu / KDE neon</summary>

```
sudo apt install build-essential cmake extra-cmake-modules kwin-dev libkdecorations3-dev libkf6config-dev libkf6configwidgets-dev libkf6kcmutils-dev libkf6coreaddons-dev libepoxy-dev libdrm-dev pkgconf qt6-base-dev qt6-tools-dev kpackagetool6 qdbus-qt6
```

</details>
<details><summary>openSUSE</summary>

```
sudo zypper install cmake gcc-c++ make kf6-extra-cmake-modules kwin6-devel kdecoration6-devel kf6-kconfig-devel kf6-kconfigwidgets-devel kf6-kcmutils-devel kf6-kcoreaddons-devel libepoxy-devel libdrm-devel qt6-base-devel qt6-uitools-devel qt6-declarative-devel kf6-kwindowsystem-devel qt6-tools-qdbus kf6-kpackage kwin6
```

</details>
<details><summary>NixOS / Nix</summary>

Use the included flake dev shell or `shell.nix`:

```
nix develop
# or
nix-shell
```

Then build/install as usual (`make package`, `./install.sh`, etc.).

</details>

## Build

    make package

## License

GPLv3
