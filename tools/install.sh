#!/bin/sh
# Installs or updates Kiri on this machine. Run it from the extracted release (kiri_X.tar.gz) or a git checkout:
#   ./install.sh
# It builds the compiled KWin effects against the KWin you have installed (so run it again after a KWin
# update), installs the Kiri script and the kiri_animations effect for your user, turns everything on and does
# the one-time setup (Plasma's Slide, Fade, Scale, Glide and Maximize effects off, desktops in one column). If the build fails, Kiri still works:
# it draws its rings itself and the old Slide stays.
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
        for e in kiri_decorations kiri_desktop_switch kiri_motion; do
            qdbus6 org.kde.KWin /Effects org.kde.kwin.Effects.unloadEffect $e >/dev/null 2>&1 || true
        done
        # remove first: a new file instead of overwriting one KWin may have mapped
        for f in $(find /usr/lib/qt6/plugins/kwin/effects/plugins -name 'kiri_*.so' 2>/dev/null); do
            $SUDO rm -f "$f"
        done
        $SUDO cmake --install "$builddir" >>"$builddir/log.txt" 2>&1
        compiled=true
        echo "Built and installed the compiled effects (kiri_decorations, kiri_desktop_switch, kiri_motion)."
    else
        echo "Building the compiled effects failed, see $builddir/log.txt. Kiri still works without them." >&2
    fi
fi

# ---- the script and the animation effect ---------------------------------------------------------------
kpackagetool6 --type=KWin/Script --upgrade "$root/package" >/dev/null 2>&1 || kpackagetool6 --type=KWin/Script --install "$root/package"
kpackagetool6 --type=KWin/Effect --upgrade "$effect" >/dev/null 2>&1 || kpackagetool6 --type=KWin/Effect --install "$effect"

# ---- turn things on ------------------------------------------------------------------------------------
w() { kwriteconfig6 --file kwinrc --group "$1" --key "$2" "$3"; }
w Plugins kiriEnabled true
if [ "$(kreadconfig6 --file kwinrc --group Plugins --key kiri_animationsEnabled)" != false ]; then
    w Plugins kiri_animationsEnabled true
fi
if $compiled && [ "$(kreadconfig6 --file kwinrc --group Kiri-install --key effectsEnabled)" != done ]; then
    # the first install turns them on; after that the user's choice stays
    w Plugins kiri_decorationsEnabled true
    w Plugins kiri_desktop_switchEnabled true
    w Plugins slideEnabled false
    w Kiri-install effectsEnabled done
fi
if $compiled; then
    # kiri_motion does what the kiri_animations script effect does, with niri's springs, open/close and cross-faded
    # resizes; two of them would animate every window twice. kiri_animations stays installed as the fallback
    # for systems where the compiled effects can't be built.
    if [ "$(kreadconfig6 --file kwinrc --group Kiri-install --key motionEnabled)" != done ]; then
        w Plugins kiri_motionEnabled true
        w Plugins kiri_animationsEnabled false
        # Plasma's own window open/close and maximize animations would play on top of niri's: Fade, Scale,
        # Glide (the choices for "Window open/close animation") and Maximize
        for e in fade scale glide maximize; do
            w Plugins "${e}Enabled" false
        done
        w Kiri-install motionEnabled done
    fi
fi
# Plasma's "Geometry change" effect also animates every frame change and fights kiri_animations (windows
# jump back and forth), so it goes off
w Plugins kwin4_effect_geometry_changeEnabled false
# desktops one above the other, like niri's workspaces. Plasma writes Rows=1 (one horizontal row), which
# makes KWin's own 3/4-finger left/right swipe switch desktops and fight Kiri's horizontal swipe
number=$(kreadconfig6 --file kwinrc --group Desktops --key Number --default 1)
rows=$(kreadconfig6 --file kwinrc --group Desktops --key Rows --default 1)
if [ "$number" -gt 1 ] && [ "$rows" -lt "$number" ]; then
    echo "Setting the desktops to $number rows (one above the other), was $rows."
    w Desktops Rows "$number"
fi

# ---- apply without logging out where KWin allows it ----------------------------------------------------
applied=false
if qdbus6 org.kde.KWin /KWin org.kde.KWin.reconfigure >/dev/null 2>&1; then
    applied=true
    rows=$(kreadconfig6 --file kwinrc --group Desktops --key Rows --default 0)
    qdbus6 org.kde.KWin /Effects org.kde.kwin.Effects.unloadEffect kwin4_effect_geometry_change >/dev/null 2>&1 || true
    [ "$rows" -gt 0 ] && dbus-send --session --type=method_call --dest=org.kde.KWin /VirtualDesktopManager org.freedesktop.DBus.Properties.Set string:org.kde.KWin.VirtualDesktopManager string:rows variant:uint32:"$rows" >/dev/null 2>&1 || true
    if $compiled; then
        for e in slide fade scale glide maximize; do
            [ "$(kreadconfig6 --file kwinrc --group Plugins --key ${e}Enabled)" = false ] &&
                qdbus6 org.kde.KWin /Effects org.kde.kwin.Effects.unloadEffect $e >/dev/null 2>&1 || true
        done
    fi
    for e in kiri_animations kiri_decorations kiri_desktop_switch kiri_motion; do
        qdbus6 org.kde.KWin /Effects org.kde.kwin.Effects.unloadEffect $e >/dev/null 2>&1 || true
        # only the ones that are switched on (the script effect is the fallback and stays off beside kiri_motion)
        [ "$(kreadconfig6 --file kwinrc --group Plugins --key ${e}Enabled)" = false ] && continue
        qdbus6 org.kde.KWin /Effects org.kde.kwin.Effects.loadEffect $e >/dev/null 2>&1 || true
    done
    # a new version of the script: stop the running one, reconfigure starts it again
    qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript kiri >/dev/null 2>&1 || true
    qdbus6 org.kde.KWin /KWin org.kde.KWin.reconfigure >/dev/null 2>&1 || true
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
    echo "Kiri installed and running."
fi
echo "Done. Log out and log back in to finish."
