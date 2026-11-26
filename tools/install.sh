#!/bin/sh
# Installs or updates Kiri on this machine. Run it from the extracted release (kiri_X.tar.gz) or a git checkout:
#   ./install.sh
# It builds the compiled KWin effects against the KWin you have installed (so run it again after a KWin
# update), installs the Kiri script for your user (and the kiri_animations effect if the build fails) and the
# kiri-mode switch (Meta+Ctrl+Shift+K), and starts in Kiri mode. Plasma's own settings stay as they are in kwinrc.
# If the build fails, Kiri still works: it draws its rings itself.
# On atomic distros (Kinoite, Bazzite, Aurora, Kalpa, KDE Linux; /usr is read-only) nothing goes into /usr and no
# sudo is needed: the effects are built in a toolbox/distrobox container called kiri-build, installed into
# ~/.local/lib/qt6/plugins and made visible to KWin with QT_PLUGIN_PATH (a new login is needed once).
# It lists what it is going to do and asks first, and asks to log out at the end when KWin needs a new session.
#   ./install.sh --no-build    skip the compiled effects
#   ./install.sh --yes         no questions
set -e

here=$(cd "$(dirname "$0")" && pwd)
root=$here
[ -d "$root/package" ] || root=$(dirname "$here")
[ -d "$root/package" ] || { echo "install.sh: can't find the package/ directory next to this script" >&2; exit 1; }
effect=$root/effect
cpp=$root/effect-cpp
build=true
yes=false
for arg in "$@"; do
    case $arg in
        --no-build) build=false ;;
        --yes) yes=true ;;
        *) echo "install.sh: unknown option $arg" >&2; exit 2 ;;
    esac
done

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

# atomic distro: /usr is read-only and there is no compiler on the host (KIRI_ATOMIC=1 or 0 overrides the guess)
atomic=false
case ${KIRI_ATOMIC:-auto} in
    1) atomic=true ;;
    0) ;;
    *)
        [ -e /run/ostree-booted ] && atomic=true
        case ",$(findmnt -T /usr -no OPTIONS 2>/dev/null)," in *,ro,*) atomic=true ;; esac
        case " $(. /etc/os-release 2>/dev/null; echo "$ID $VARIANT_ID $ID_LIKE") " in
            *" kinoite "*|*" bazzite "*|*" aurora "*|*" kalpa "*|*" kde-linux "*|*" kdelinux "*|*" opensuse-microos "*|*" microos "*) atomic=true ;;
        esac
        ;;
esac

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
if $atomic; then
    plugindir=$HOME/.local/lib/qt6/plugins
    SUDO=
fi
effectdir=$plugindir/kwin/effects/plugins

# which package manager line installs the build dependencies
distro=
[ -r /etc/os-release ] && distro=$(. /etc/os-release; echo "$ID $ID_LIKE")
dep_hint() {
    case " $distro " in
        *" arch "*|*" cachyos "*|*" manjaro "*|*" endeavouros "*)
            echo "sudo pacman -S --needed base-devel cmake extra-cmake-modules kwin libepoxy qt6-base qt6-tools kconfig kconfigwidgets kcmutils kcoreaddons kwindowsystem qt6-declarative wayland libdrm vulkan-headers" ;;
        *" fedora "*|*" rhel "*)
            echo "sudo dnf install cmake gcc-c++ make extra-cmake-modules kwin-devel kdecoration-devel kf6-kconfig-devel kf6-kconfigwidgets-devel kf6-kcmutils-devel kf6-kcoreaddons-devel libepoxy-devel libdrm-devel qt6-qtbase-devel qt6-qttools-devel kf6-kpackage" ;;
        *" suse "*|*" opensuse "*|*" opensuse-tumbleweed "*)
            echo "sudo zypper install cmake gcc-c++ make kf6-extra-cmake-modules kwin6-devel kdecoration6-devel kf6-kconfig-devel kf6-kconfigwidgets-devel kf6-kcmutils-devel kf6-kcoreaddons-devel libepoxy-devel libdrm-devel qt6-base-devel qt6-uitools-devel qt6-declarative-devel kf6-kwindowsystem-devel qt6-tools-qdbus kf6-kpackage kwin6" ;;
        *" debian "*|*" ubuntu "*|*" neon "*)
            echo "sudo apt install build-essential cmake extra-cmake-modules kwin-dev libkdecorations3-dev libkf6config-dev libkf6configwidgets-dev libkf6kcmutils-dev libkf6coreaddons-dev libepoxy-dev libdrm-dev pkgconf qt6-base-dev qt6-tools-dev kpackagetool6 qdbus-qt6" ;;
        *" nixos "*)
            echo "use nix develop or nix-shell in the repo (flake.nix / shell.nix provided)" ;;
        *) echo "install cmake, a C++ compiler, extra-cmake-modules, the KWin and KDecoration development packages, KF6 Config, ConfigWidgets, KCMUtils and CoreAddons, libepoxy and Qt6 base and UiTools development files" ;;
    esac
}

# the effects build against KWin 6.7 and 6.8 (the paint hooks differ, effect-cpp/common/KwinCompat.h); an older KWin keeps the script and the script effect
kwinver=
for c in /usr/lib*/cmake/KWin/KWinConfigVersion.cmake /usr/lib/*/cmake/KWin/KWinConfigVersion.cmake; do
    [ -f "$c" ] && { kwinver=$(sed -n 's/^set(PACKAGE_VERSION "\(.*\)")/\1/p' "$c" | head -1); break; }
done
# on an atomic host there are no KWin headers; ask the running KWin
if [ -z "$kwinver" ] && $atomic; then
    kwinver=$({ kwin_wayland --version 2>/dev/null || /usr/bin/kwin_wayland --version 2>/dev/null; } | sed -n 's/^kwin[a-z_]* \([0-9][0-9.]*\).*/\1/p' | head -1)
fi
if [ -n "$kwinver" ] && [ "$(printf '%s\n6.7.0\n' "$kwinver" | sort -V | head -1)" != 6.7.0 ]; then
    echo "KWin $kwinver is older than 6.7 (Plasma 6.7): skipping the compiled effects; Kiri draws its rings itself." >&2
    build=false
fi

tty=false
[ -r /dev/tty ] && (: </dev/tty) 2>/dev/null && tty=true

# the container the effects are built in on atomic distros: toolbox for Fedora-based ones, distrobox for the rest
box=kiri-build
boxtool=
boximage=
if $atomic && $build && [ -d "$cpp" ]; then
    . /etc/os-release 2>/dev/null || true
    case " $distro " in
        *" fedora "*|*" rhel "*) boxfamily=fedora; boximage=registry.fedoraproject.org/fedora-toolbox:${VERSION_ID:-rawhide} ;;
        *" suse "*|*" opensuse "*|*" opensuse-tumbleweed "*|*" kalpa "*|*" microos "*) boxfamily=suse; boximage=registry.opensuse.org/opensuse/distrobox:latest ;;
        *" arch "*|*" kde-linux "*|*" kdelinux "*) boxfamily=arch; boximage=quay.io/toolbx/arch-toolbox:latest ;;
        *) boxfamily= ;;
    esac
    if [ "$boxfamily" = fedora ] && command -v toolbox >/dev/null 2>&1; then boxtool=toolbox
    elif command -v distrobox >/dev/null 2>&1; then boxtool=distrobox
    elif command -v toolbox >/dev/null 2>&1; then boxtool=toolbox
    fi
fi

missing=
if $atomic && $build && [ -d "$cpp" ]; then
    [ -n "$KIRI_BUILD_CMD" ] && boxtool=custom
    [ -n "$boxtool" ] || missing="$missing toolbox-or-distrobox"
    [ -n "$boximage" ] || [ -n "$KIRI_BUILD_CMD" ] || missing="$missing a-known-distro-image"
    [ -n "$kwinver" ] || missing="$missing the-KWin-version"
elif $build && [ -d "$cpp" ]; then
    command -v cmake >/dev/null 2>&1 || missing="$missing cmake"
    command -v g++ >/dev/null 2>&1 || command -v c++ >/dev/null 2>&1 || missing="$missing a-C++-compiler"
    [ -d /usr/share/ECM ] || missing="$missing extra-cmake-modules"
    [ -f /usr/include/kwin/effect/effecthandler.h ] || missing="$missing kwin-headers"
    [ -f /usr/include/epoxy/gl.h ] || missing="$missing libepoxy"
    [ -n "$plugindir" ] || missing="$missing qtpaths6/qmake6"
fi
# effects of an earlier install: KWin keeps the loaded ones until the next login
old_effects=$(find "$effectdir" -name 'kiri_*.so' 2>/dev/null | head -1)
data=${XDG_DATA_HOME:-$HOME/.local/share}

# ---- what is going to happen ---------------------------------------------------------------------------
if [ -d "$data/kwin/scripts/kiri" ]; then echo "This updates Kiri. It will:"; else echo "This installs Kiri. It will:"; fi
if $atomic && $build && [ -d "$cpp" ] && [ -z "$missing" ]; then
    boxname=$boxtool
    [ "$boxtool" = custom ] && boxname=build
    echo "  - build Kiri's effects for your KWin $kwinver inside a $boxname container named $box (about 1 GB download the"
    echo "    first time, kept for later updates; your system is not touched, no sudo) and put them in $plugindir/kwin"
    echo "  - add ~/.config/environment.d/kiri.conf so KWin and System Settings find them (needs one new login)"
elif $build && [ -d "$cpp" ] && { [ -z "$missing" ] || command -v pacman >/dev/null 2>&1; }; then
    [ -n "$missing" ] && echo "  - install the build tools and KWin headers it needs with pacman (sudo)"
    echo "  - build Kiri's effects (borders, animations, gestures, overview, desktop switch, settings page) for your KWin"
    echo "    and put them in ${plugindir:-the Qt plugin folder}/kwin/effects/plugins (sudo)"
elif $build && [ -d "$cpp" ]; then
    echo "  - skip Kiri's compiled effects, these are missing:$missing"
fi
echo "  - install the Kiri KWin script into $data/kwin/scripts/kiri"
echo "  - add the kiri-mode command to ~/.local/bin and a \"Switch Kiri / Plasma\" shortcut (Meta+Ctrl+Shift+K)"
echo "  - switch to Kiri mode. Your Plasma settings stay as they are; Kiri's own apply only in Kiri mode,"
echo "    and kiri-mode plasma (or uninstall.sh) brings Plasma's back"
if ! $yes && $tty; then
    printf 'Go on? [Y/n] '
    read -r answer </dev/tty || answer=
    case $answer in [nN]*) echo "Nothing changed."; exit 0 ;; esac
fi
echo

# ---- the compiled effects ----------------------------------------------------------------------------
compiled=false
if $build && [ -d "$cpp" ]; then
    if $atomic; then
        [ -z "$missing" ] || { echo "Missing:$missing. Skipping the compiled effects." >&2; build=false; }
    elif [ -n "$missing" ]; then
        if command -v pacman >/dev/null 2>&1; then
            echo "Installing build tools and KWin headers (sudo pacman -S --needed) ..."
            $SUDO pacman -S --needed --noconfirm base-devel cmake extra-cmake-modules kwin libepoxy qt6-base qt6-tools kconfig kconfigwidgets kcmutils kcoreaddons kwindowsystem qt6-declarative wayland libdrm vulkan-headers
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
# make KWin and System Settings look in a plugin dir under your home: environment.d (read at login by Plasma's
# systemd session) and Plasma's own env script as a second way; an existing QT_PLUGIN_PATH is kept
use_plugin_path() {
    envd=${XDG_CONFIG_HOME:-$HOME/.config}/environment.d
    mkdir -p "$envd" "${XDG_CONFIG_HOME:-$HOME/.config}/plasma-workspace/env"
    # shellcheck disable=SC2016
    printf 'QT_PLUGIN_PATH=%s${QT_PLUGIN_PATH:+:$QT_PLUGIN_PATH}\n' "$1" >"$envd/kiri.conf"
    # shellcheck disable=SC2016
    printf 'case ":$QT_PLUGIN_PATH:" in *":%s:"*) ;; *) export QT_PLUGIN_PATH="%s${QT_PLUGIN_PATH:+:$QT_PLUGIN_PATH}" ;; esac\n' "$1" "$1" >"${XDG_CONFIG_HOME:-$HOME/.config}/plasma-workspace/env/kiri.sh"
    case ":$QT_PLUGIN_PATH:" in *":$1:"*) ;; *) need_login=true ;; esac
}
need_login=false

# builds in the container (atomic distros); the files land in $builddir/stage and are copied to ~/.local after
build_in_box() {
    case $boxtool in
        toolbox)
            toolbox list -c 2>/dev/null | awk -v b="$box" '$2 == b { f = 1 } END { exit !f }' ||
                toolbox create --assumeyes --image "$boximage" "$box" || return 1
            boxrun="toolbox run --container $box" ;;
        distrobox)
            distrobox list 2>/dev/null | awk -F'|' -v b="$box" '{ gsub(/ /, "", $2) } $2 == b { f = 1 } END { exit !f }' ||
                distrobox create --yes --name "$box" --image "$boximage" || return 1
            boxrun="distrobox enter --name $box --" ;;
        custom) boxrun=$KIRI_BUILD_CMD ;;
    esac
    cat >"$builddir/box-build.sh" <<'BOXSCRIPT'
#!/bin/sh
# runs inside the container: $1 distro family, $2 KWin version of the host, $3 sources, $4 build dir, $5 plugin dir
set -e
family=$1 want=$2 src=$3 bd=$4 plug=$5
ulimit -c 0
S=sudo
[ "$(id -u)" = 0 ] && S=
case $family in
    fedora)
        pkgs="cmake gcc-c++ make extra-cmake-modules kdecoration-devel kf6-kconfig-devel kf6-kconfigwidgets-devel kf6-kcmutils-devel kf6-kcoreaddons-devel libepoxy-devel libdrm-devel qt6-qtbase-devel qt6-qttools-devel kf6-kpackage"
        $S dnf install -y --setopt=install_weak_deps=False $pkgs "kwin-devel-$want" ||
            $S dnf install -y --setopt=install_weak_deps=False $pkgs kwin-devel ;;
    suse)
        pkgs="cmake gcc-c++ make kf6-extra-cmake-modules kdecoration6-devel kf6-kconfig-devel kf6-kconfigwidgets-devel kf6-kcmutils-devel kf6-kcoreaddons-devel libepoxy-devel libdrm-devel qt6-base-devel qt6-uitools-devel qt6-declarative-devel kf6-kwindowsystem-devel qt6-tools-qdbus kf6-kpackage"
        $S zypper --non-interactive install --no-recommends $pkgs "kwin6-devel=$want" ||
            $S zypper --non-interactive install --no-recommends $pkgs kwin6-devel ;;
    arch)
        $S pacman -Syu --needed --noconfirm base-devel cmake extra-cmake-modules kwin libepoxy qt6-base qt6-tools kconfig kconfigwidgets kcmutils kcoreaddons kwindowsystem qt6-declarative wayland libdrm vulkan-headers ;;
esac
have=
for c in /usr/lib*/cmake/KWin/KWinConfigVersion.cmake /usr/lib/*/cmake/KWin/KWinConfigVersion.cmake; do
    [ -f "$c" ] && { have=$(sed -n 's/^set(PACKAGE_VERSION "\(.*\)")/\1/p' "$c" | head -1); break; }
done
if [ "$have" != "$want" ]; then
    echo "KIRI-VERSION-MISMATCH container=$have host=$want"
    exit 3
fi
cmake -S "$src" -B "$bd" -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX="$HOME/.local" -DKDE_INSTALL_QTPLUGINDIR="$plug"
cmake --build "$bd" -j "$(nproc)"
DESTDIR="$bd/stage" cmake --install "$bd"
BOXSCRIPT
    # shellcheck disable=SC2086
    $boxrun sh "$builddir/box-build.sh" "$boxfamily" "$kwinver" "$cpp" "$builddir/b" "$plugindir" >>"$builddir/log.txt" 2>&1
}

try_build() {
    if $atomic; then
        build_in_box
    else
        cmake -S "$cpp" -B "$builddir" -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX=/usr -DKDE_INSTALL_QTPLUGINDIR="$plugindir" >"$builddir/log.txt" 2>&1 &&
            cmake --build "$builddir" -j "$(nproc)" >>"$builddir/log.txt" 2>&1
    fi
}
if $build && [ -d "$cpp" ]; then
    builddir=${XDG_CACHE_HOME:-$HOME/.cache}/kiri-build
    rm -rf "$builddir"
    mkdir -p "$builddir"
    $atomic && echo "Building in the $boxname container $box (the first time this downloads the image and the KDE development packages) ..."
    if try_build; then
        # let KWin let go of the old plugins before replacing the files
        for e in kiri_decorations kiri_desktop_switch kiri_motion kiri_swipe kiri_overview; do
            qd org.kde.KWin /Effects org.kde.kwin.Effects.unloadEffect $e >/dev/null 2>&1 || true
        done
        # remove first: a new file instead of overwriting one KWin may have mapped
        for f in $(find "$effectdir" -name 'kiri_*.so' 2>/dev/null) "$plugindir/kwin/effects/configs/kcm_kiri.so"; do
            $SUDO rm -f "$f"
        done
        if $atomic; then
            mkdir -p "$HOME/.local"
            cp -a "$builddir/b/stage$HOME/.local/." "$HOME/.local/"
            use_plugin_path "$plugindir"
        else
            $SUDO cmake --install "$builddir" >>"$builddir/log.txt" 2>&1
        fi
        compiled=true
        echo "Built and installed the compiled effects (kiri_decorations, kiri_desktop_switch, kiri_motion, kiri_swipe, kiri_overview)."
    elif $atomic && grep -q KIRI-VERSION-MISMATCH "$builddir/log.txt"; then
        echo "The $boxtool container has $(grep -o 'container=[^ ]*' "$builddir/log.txt" | head -1 | cut -d= -f2) but your KWin is $kwinver: an effect built for another KWin can crash it, so none was installed." >&2
        echo "Kiri still works without the compiled effects (it draws its rings itself). Try again after your system or the container image catches up." >&2
    else
        echo "Building the compiled effects failed ($(grep -m1 -i 'error' "$builddir/log.txt" | cut -c1-150)), see $builddir/log.txt. Kiri still works without them." >&2
    fi
fi

# kwinrc writer (defined before first use: /usr/bin/w exists, so a late definition fails silently)
w() { kwriteconfig6 --file kwinrc --group "$1" --key "$2" "$3"; }
d() { kwriteconfig6 --file kwinrc --group "$1" --key "$2" --delete; }

# ---- the script and the animation effect ---------------------------------------------------------------
kpackagetool6 --type=KWin/Script --upgrade "$root/package" >/dev/null 2>&1 || kpackagetool6 --type=KWin/Script --install "$root/package"
# the settings page with reset buttons is a compiled plugin; without it KWin's generic page shows the same settings
if [ -f "$data/kwin/scripts/kiri/metadata.json" ]; then
    if [ ! -f "$plugindir/kwin/effects/configs/kcm_kiri.so" ]; then
        sed -i 's#kwin/effects/configs/kcm_kiri#kwin/effects/configs/kcm_kwin4_genericscripted#' "$data/kwin/scripts/kiri/metadata.json"
    elif $atomic; then
        # a full path, so System Settings finds the page even before QT_PLUGIN_PATH reaches the session
        sed -i "s#\"kwin/effects/configs/kcm_kiri\"#\"$plugindir/kwin/effects/configs/kcm_kiri\"#" "$data/kwin/scripts/kiri/metadata.json"
    fi
fi
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
# 1.0: the wheel and mouse button binds are one per line in the settings; a saved list from before is converted once
binds=$(kreadconfig6 --file kwinrc --group Script-kiri --key pointerBinds)
case "$binds" in
    *\;*) w Script-kiri pointerBinds "$(printf '%s' "$binds" | tr ';' '\n' | sed 's/^ *//; s/ *$//; /^$/d')" ;;
esac
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

relogin=false
$applied || relogin=true
$compiled && [ -n "$old_effects" ] && relogin=true
$need_login && relogin=true
if $need_login && $atomic; then
    echo "KWin needs a new login to find the effects in $plugindir. Until then Kiri's settings show KWin's plain page;"
    echo "after logging in, run ./install.sh again to get the settings page with the reset buttons."
fi
if $applied; then
    echo "Kiri installed and running. Switch between Kiri and Plasma with Meta+Ctrl+Shift+K or: kiri-mode toggle"
fi
$relogin || exit 0
if $applied; then
    echo "KWin keeps the old effects until you log in again: log out and back in to use the new ones."
else
    echo "Done. Log out and log back in to finish."
fi
if ! $yes && $tty; then
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
