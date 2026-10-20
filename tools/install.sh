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

# ---- the compiled effects ----------------------------------------------------------------------------
compiled=false
if $build && [ -d "$cpp" ]; then
    missing=false
    command -v cmake >/dev/null 2>&1 || missing=true
    command -v g++ >/dev/null 2>&1 || missing=true
    [ -d /usr/share/ECM ] || missing=true
    [ -f /usr/include/kwin/effect/effecthandler.h ] || missing=true
    [ -f /usr/include/epoxy/gl.h ] || missing=true
    if $missing; then
        if command -v pacman >/dev/null 2>&1; then
            echo "Installing build tools and KWin headers (sudo pacman -S --needed) ..."
            $SUDO pacman -S --needed --noconfirm base-devel cmake extra-cmake-modules kwin libepoxy qt6-base kconfig kcoreaddons kwindowsystem qt6-declarative wayland libdrm vulkan-headers
        else
            echo "Missing cmake, a C++ compiler, extra-cmake-modules or the KWin headers; skipping the compiled effects." >&2
        fi
    fi
    builddir=${XDG_CACHE_HOME:-$HOME/.cache}/kiri-build
    rm -rf "$builddir"
    mkdir -p "$builddir"
    if cmake -S "$cpp" -B "$builddir" -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX=/usr >"$builddir/log.txt" 2>&1 &&
        cmake --build "$builddir" -j "$(nproc)" >>"$builddir/log.txt" 2>&1; then
        # let KWin let go of the old plugins before replacing the files
        for e in kiri_decorations kiri_desktop_switch kiri_motion kiri_swipe kiri_overview; do
            qdbus6 org.kde.KWin /Effects org.kde.kwin.Effects.unloadEffect $e >/dev/null 2>&1 || true
        done
        # remove first: a new file instead of overwriting one KWin may have mapped
        for f in $(find /usr/lib/qt6/plugins/kwin/effects/plugins -name 'kiri_*.so' 2>/dev/null); do
            $SUDO rm -f "$f"
        done
        $SUDO cmake --install "$builddir" >>"$builddir/log.txt" 2>&1
        compiled=true
        echo "Built and installed the compiled effects (kiri_decorations, kiri_desktop_switch, kiri_motion, kiri_swipe, kiri_overview)."
    else
        echo "Building the compiled effects failed, see $builddir/log.txt. Kiri still works without them." >&2
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
if qdbus6 org.kde.KWin /KWin org.kde.KWin.reconfigure >/dev/null 2>&1; then
    applied=true
    for e in kiri_animations kiri_decorations kiri_desktop_switch kiri_motion kiri_swipe kiri_overview; do
        qdbus6 org.kde.KWin /Effects org.kde.kwin.Effects.unloadEffect $e >/dev/null 2>&1 || true
    done
    # a new version of the script: stop the running one, kiri-mode starts it again
    qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript kiri >/dev/null 2>&1 || true
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
if [ -r /dev/tty ]; then
    printf 'Log out now? [y/N] '
    read -r answer </dev/tty || answer=
    case $answer in
        [yY]*)
            qdbus6 org.kde.Shutdown /Shutdown org.kde.Shutdown.logout >/dev/null 2>&1 ||
                qdbus6 org.kde.ksmserver /KSMServer org.kde.KSMServerInterface.logout 0 0 0 >/dev/null 2>&1 ||
                echo "Couldn't log out automatically; please log out yourself." >&2
            ;;
    esac
fi
