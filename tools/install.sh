#!/bin/sh
# Installs or updates Kiri on this machine. Run it from the extracted release (kiri_X.tar.gz) or a git checkout:
#   ./install.sh
# It builds the compiled KWin effects against the KWin you have installed (so run it again after a KWin
# update), installs the Kiri script for your user (and the kiri_animations effect if the build fails) and the
# kiri-mode switch (Meta+Ctrl+Shift+K), and starts in Kiri mode. Plasma's own settings stay as they are in kwinrc.
# If the build fails, Kiri still works: it draws its rings itself.
#   ./install.sh --no-build    skip the compiled effects
set -e

here=$(cd "$(dirname "$0")" && pwd)
root=$here
[ -d "$root/package" ] || root=$(dirname "$here")
[ -d "$root/package" ] || { echo "install.sh: can't find the package/ directory next to this script" >&2; exit 1; }
effect=$root/effect
cpp=$root/effect-cpp
build=true
[ "$1" = --no-build ] && build=false

SUDO=sudo
[ "$(id -u)" = 0 ] && SUDO=

# qdbus is called qdbus6 (Arch, Kubuntu), qdbus-qt6 (Fedora, openSUSE) or lives only in Qt's own bin dir
qdbus=
for c in qdbus6 qdbus-qt6 qdbus; do
    command -v "$c" >/dev/null 2>&1 && { qdbus=$c; break; }
done
if [ -z "$qdbus" ]; then
    for c in /usr/lib*/qt6/bin/qdbus* /usr/lib/*/qt6/bin/qdbus*; do
        [ -x "$c" ] && { qdbus=$c; break; }
    done
fi
qd() { if [ -n "$qdbus" ]; then "$qdbus" "$@"; else return 127; fi; }

# where Qt (and so KWin) looks for plugins: /usr/lib/qt6/plugins, /usr/lib64/qt6/plugins, /usr/lib/x86_64-linux-gnu/qt6/plugins ...
qt_plugins() {
    for c in qtpaths6 qtpaths-qt6 qmake6 qmake-qt6 qtpaths qmake; do
        command -v "$c" >/dev/null 2>&1 || continue
        d=$("$c" -query QT_INSTALL_PLUGINS 2>/dev/null) || d=
        [ -d "$d" ] || d=$("$c" --query QT_INSTALL_PLUGINS 2>/dev/null) || d=
        [ -d "$d" ] && { echo "$d"; return; }
    done
}
plugindir=$(qt_plugins)
if [ -z "$plugindir" ]; then
    for c in /usr/lib*/qt6/plugins /usr/lib/*/qt6/plugins; do
        [ -d "$c/kwin" ] && { plugindir=$c; break; }
    done
fi
effectdir=$plugindir/kwin/effects/plugins

# which package manager line installs the build dependencies
distro=
[ -r /etc/os-release ] && distro=$(. /etc/os-release; echo "$ID $ID_LIKE")
dep_hint() {
    case " $distro " in
        *" arch "*|*" cachyos "*|*" manjaro "*|*" endeavouros "*)
            echo "sudo pacman -S --needed base-devel cmake extra-cmake-modules kwin libepoxy qt6-base qt6-tools kconfig kcoreaddons kwindowsystem qt6-declarative wayland libdrm vulkan-headers" ;;
        *" fedora "*|*" rhel "*)
            echo "sudo dnf install cmake gcc-c++ make extra-cmake-modules kwin-devel kdecoration-devel kf6-kconfig-devel kf6-kcoreaddons-devel libepoxy-devel libdrm-devel qt6-qtbase-devel qt6-qttools kf6-kpackage" ;;
        *" suse "*|*" opensuse "*|*" opensuse-tumbleweed "*)
            echo "sudo zypper install cmake gcc-c++ make kf6-extra-cmake-modules kwin6-devel kdecoration6-devel kf6-kconfig-devel kf6-kcoreaddons-devel libepoxy-devel libdrm-devel qt6-base-devel qt6-declarative-devel kf6-kwindowsystem-devel qt6-tools-qdbus kf6-kpackage kwin6" ;;
        *" debian "*|*" ubuntu "*|*" neon "*)
            echo "sudo apt install build-essential cmake extra-cmake-modules kwin-dev libkdecorations3-dev libkf6config-dev libkf6coreaddons-dev libepoxy-dev libdrm-dev pkgconf qt6-base-dev kpackagetool6 qdbus-qt6" ;;
        *) echo "install cmake, a C++ compiler, extra-cmake-modules, the KWin and KDecoration development packages, KF6 Config and CoreAddons, libepoxy and Qt6 base development files" ;;
    esac
}

# the effects use KWin 6.8 API (6.7.90 is the 6.8 beta); an older KWin keeps the script and the script effect
kwinver=
for c in /usr/lib*/cmake/KWin/KWinConfigVersion.cmake /usr/lib/*/cmake/KWin/KWinConfigVersion.cmake; do
    [ -f "$c" ] && { kwinver=$(sed -n 's/^set(PACKAGE_VERSION "\(.*\)")/\1/p' "$c" | head -1); break; }
done
if [ -n "$kwinver" ] && [ "$(printf '%s\n6.7.90\n' "$kwinver" | sort -V | head -1)" != 6.7.90 ]; then
    echo "KWin $kwinver is older than 6.7.90 (Plasma 6.8): skipping the compiled effects; Kiri draws its rings itself." >&2
    build=false
fi

# ---- the compiled effects ----------------------------------------------------------------------------
compiled=false
if $build && [ -d "$cpp" ]; then
    missing=
    command -v cmake >/dev/null 2>&1 || missing="$missing cmake"
    command -v g++ >/dev/null 2>&1 || command -v c++ >/dev/null 2>&1 || missing="$missing a-C++-compiler"
    [ -d /usr/share/ECM ] || missing="$missing extra-cmake-modules"
    [ -f /usr/include/kwin/effect/effecthandler.h ] || missing="$missing kwin-headers"
    [ -f /usr/include/epoxy/gl.h ] || missing="$missing libepoxy"
    [ -n "$plugindir" ] || missing="$missing qtpaths6/qmake6"
    if [ -n "$missing" ]; then
        if command -v pacman >/dev/null 2>&1; then
            echo "Installing build tools and KWin headers (sudo pacman -S --needed) ..."
            $SUDO pacman -S --needed --noconfirm base-devel cmake extra-cmake-modules kwin libepoxy qt6-base qt6-tools kconfig kcoreaddons kwindowsystem qt6-declarative wayland libdrm vulkan-headers
            plugindir=$(qt_plugins)
            effectdir=$plugindir/kwin/effects/plugins
        else
            echo "Missing:$missing. Skipping the compiled effects; to build them, run" >&2
            echo "    $(dep_hint)" >&2
            echo "and then ./install.sh again." >&2
            build=false
        fi
    fi
fi
if $build && [ -d "$cpp" ]; then
    builddir=${XDG_CACHE_HOME:-$HOME/.cache}/kiri-build
    rm -rf "$builddir"
    mkdir -p "$builddir"
    if cmake -S "$cpp" -B "$builddir" -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX=/usr -DKDE_INSTALL_QTPLUGINDIR="$plugindir" >"$builddir/log.txt" 2>&1 &&
        cmake --build "$builddir" -j "$(nproc)" >>"$builddir/log.txt" 2>&1; then
        # let KWin let go of the old plugins before replacing the files
        for e in kiri_decorations kiri_desktop_switch kiri_motion kiri_swipe kiri_overview; do
            qd org.kde.KWin /Effects org.kde.kwin.Effects.unloadEffect $e >/dev/null 2>&1 || true
        done
        # remove first: a new file instead of overwriting one KWin may have mapped
        for f in $(find "$effectdir" -name 'kiri_*.so' 2>/dev/null); do
            $SUDO rm -f "$f"
        done
        $SUDO cmake --install "$builddir" >>"$builddir/log.txt" 2>&1
        compiled=true
        echo "Built and installed the compiled effects (kiri_decorations, kiri_desktop_switch, kiri_motion, kiri_swipe, kiri_overview)."
    else
        echo "Building the compiled effects failed ($(grep -m1 -i 'error' "$builddir/log.txt" | cut -c1-150)), see $builddir/log.txt. Kiri still works without them." >&2
    fi
fi

# kwinrc writer (defined before first use: /usr/bin/w exists, so a late definition fails silently)
w() { kwriteconfig6 --file kwinrc --group "$1" --key "$2" "$3"; }
d() { kwriteconfig6 --file kwinrc --group "$1" --key "$2" --delete; }

# ---- the script and the animation effect ---------------------------------------------------------------
kpackagetool6 --type=KWin/Script --upgrade "$root/package" >/dev/null 2>&1 || kpackagetool6 --type=KWin/Script --install "$root/package"
if $compiled; then
    # kiri_motion replaces the kiri_animations script effect; with both on every window animates twice, so the
    # fallback is not installed at all and doesn't show up in Desktop Effects
    kpackagetool6 --type=KWin/Effect --remove kiri_animations >/dev/null 2>&1 || true
    kwriteconfig6 --file kwinrc --group Plugins --key kiri_animationsEnabled --delete
else
    kpackagetool6 --type=KWin/Effect --upgrade "$effect" >/dev/null 2>&1 || kpackagetool6 --type=KWin/Effect --install "$effect"
fi

# 0.10.3: Spectacle is not tiled by default; a saved list of window rules (changed in the settings) gets the rule once
if [ "$(kreadconfig6 --file kwinrc --group Kiri-install --key spectacleRule)" != done ]; then
    rules=$(kreadconfig6 --file kwinrc --group Script-kiri --key windowRules)
    if [ -n "$rules" ] && ! printf '%s' "$rules" | grep -qi spectacle; then
        rules=$(printf '%s' "$rules" | sed '0,/\[/s//[\n    {\n        "class": "(org\\\\.kde\\\\.)?spectacle",\n        "tile": false\n    },/')
        w Script-kiri windowRules "$rules"
    fi
    w Kiri-install spectacleRule done
fi
# 0.10.4: dynamic desktops are experimental and off by default; turned off once for those who had them on
if [ "$(kreadconfig6 --file kwinrc --group Kiri-install --key dynamicDesktopsOff)" != done ]; then
    w Script-kiri dynamicDesktops false
    w Kiri-install dynamicDesktopsOff done
fi
# ---- 0.10.6: the mode switch -----------------------------------------------------------------------------
# Up to 0.10.5 install.sh wrote Kiri's choices into kwinrc: Plasma's effects off, the kiri_* effects on, the focus
# policy, wrap-around and rows. Now kwinrc keeps the user's settings and Kiri mode applies its own at runtime
# (kiri-mode), so those entries go: Plasma's effects are back at their defaults (we can't know which ones the user
# had off before Kiri) and the kiri_* effects are no longer switched on in kwinrc, the script loads them.
old_install=false
for k in effectsEnabled motionEnabled swipeEnabled overviewEnabled decorations010 focusPolicyBefore rollOverBefore; do
    [ -n "$(kreadconfig6 --file kwinrc --group Kiri-install --key $k)" ] && old_install=true
done
if [ "$(kreadconfig6 --file kwinrc --group Kiri-install --key modeSwitch)" != done ]; then
    if $old_install; then for e in slide overview kwin4_effect_geometry_change fade scale glide maximize kiri_animations kiri_decorations kiri_desktop_switch kiri_motion kiri_swipe kiri_overview; do
        d Plugins ${e}Enabled
    done; fi
    # the values saved by older versions are the user's, now kept in [Kiri-mode]
    policy=$(kreadconfig6 --file kwinrc --group Kiri-install --key focusPolicyBefore)
    if [ -n "$policy" ]; then
        w Kiri-mode focusPolicy "$policy"
        w Kiri-mode focusPolicyApplied ClickToFocus
    fi
    rollover=$(kreadconfig6 --file kwinrc --group Kiri-install --key rollOverBefore)
    if [ -n "$rollover" ]; then
        w Kiri-mode rollOver "$rollover"
        w Kiri-mode rollOverApplied false
    fi
    d Kiri-install focusPolicyBefore
    d Kiri-install rollOverBefore
    for k in effectsEnabled motionEnabled swipeEnabled overviewEnabled decorations010; do
        d Kiri-install $k
    done
    w Kiri-install modeSwitch done
fi

# ---- the switch: kiri-mode and its shortcut ------------------------------------------------------------------
bin=$HOME/.local/bin
apps=${XDG_DATA_HOME:-$HOME/.local/share}/applications
mkdir -p "$bin" "$apps"
install -m 755 "$here/kiri-mode" "$bin/kiri-mode" 2>/dev/null || install -m 755 "$root/tools/kiri-mode" "$bin/kiri-mode"
# Meta+Ctrl+Shift+K, unless something else already has it (kglobalacceld takes the shortcut from a .desktop file with X-KDE-Shortcuts)
shortcut=Meta+Ctrl+Shift+K
if [ ! -f "$apps/kiri-mode.desktop" ] && grep -rqs -- "$shortcut" "${XDG_CONFIG_HOME:-$HOME/.config}/kglobalshortcutsrc"; then
    shortcut=
fi
cat >"$apps/kiri-mode.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Switch Kiri / Plasma
Comment=Switch between Kiri mode and Plasma mode
Icon=kiri
Exec=$bin/kiri-mode toggle
Terminal=false
StartupNotify=false
Categories=Utility;
X-KDE-GlobalAccel-CommandShortcut=true
${shortcut:+X-KDE-Shortcuts=$shortcut}
DESKTOP
command -v kbuildsycoca6 >/dev/null 2>&1 && kbuildsycoca6 --noincremental >/dev/null 2>&1 || true

# ---- start in Kiri mode (settings and effects switch at runtime where KWin allows it) ----------------------------
applied=false
if qd org.kde.KWin /KWin org.kde.KWin.reconfigure >/dev/null 2>&1; then
    applied=true
    for e in kiri_animations kiri_decorations kiri_desktop_switch kiri_motion kiri_swipe kiri_overview; do
        qd org.kde.KWin /Effects org.kde.kwin.Effects.unloadEffect $e >/dev/null 2>&1 || true
    done
    # a new version of the script: stop the running one, kiri-mode starts it again
    qd org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript kiri >/dev/null 2>&1 || true
    "$bin/kiri-mode" kiri || true
else
    w Plugins kiriEnabled true
fi

# the Shortcuts page looks up an icon named after the shortcut group, "kiri"
icons=${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor
for kwin_icon in /usr/share/icons/breeze/apps/48/kwin.svg /usr/share/icons/hicolor/scalable/apps/kwin.svg; do
    if [ -f "$kwin_icon" ]; then
        mkdir -p "$icons/scalable/apps"
        ln -sf "$kwin_icon" "$icons/scalable/apps/kiri.svg"
        break
    fi
done
if [ ! -e "$icons/scalable/apps/kiri.svg" ]; then
    kwin_icon=$(find /usr/share/icons/hicolor -name 'kwin.png' 2>/dev/null | sort -V | tail -1)
    if [ -n "$kwin_icon" ]; then
        mkdir -p "$icons/48x48/apps"
        ln -sf "$kwin_icon" "$icons/48x48/apps/kiri.png"
    fi
fi

if $applied; then
    echo "Kiri installed and running. Switch between Kiri and Plasma with Meta+Ctrl+Shift+K or: kiri-mode toggle"
    exit 0
fi
echo "Done. Log out and log back in to finish."
if [ -r /dev/tty ] && (: </dev/tty) 2>/dev/null; then
    printf 'Log out now? [y/N] '
    read -r answer </dev/tty || answer=
    case $answer in
        [yY]*)
            qd org.kde.Shutdown /Shutdown org.kde.Shutdown.logout >/dev/null 2>&1 ||
                qd org.kde.ksmserver /KSMServer org.kde.KSMServerInterface.logout 0 0 0 >/dev/null 2>&1 ||
                echo "Couldn't log out automatically; please log out yourself." >&2
            ;;
    esac
fi
