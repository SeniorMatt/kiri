#!/bin/sh
# Removes what install.sh put on this machine: the Kiri script, the kiri_animations effect, the compiled
# effects (kiri_decorations, kiri_desktop_switch, kiri_motion, kiri_swipe, kiri_overview) and the build cache, and turns Plasma's own effects back on.
# It asks first, then asks again whether to delete your Kiri settings and shortcuts too. Keep them if you only
# want Kiri gone for a while: installing it again brings everything back as it was.
#   ./uninstall.sh
#   ./uninstall.sh --yes            no questions, keep the settings
#   ./uninstall.sh --yes --purge    no questions, delete the settings too
set -e

yes=false
purge=ask
for arg in "$@"; do
    case $arg in
        --yes) yes=true ;;
        --purge) purge=true ;;
        *) echo "uninstall.sh: unknown option $arg" >&2; exit 2 ;;
    esac
done

ask() {
    printf '%s [y/N] ' "$1"
    read -r answer </dev/tty || answer=
    case $answer in [yY]*) return 0 ;; *) return 1 ;; esac
}

if ! $yes; then
    [ -r /dev/tty ] || { echo "uninstall.sh: no terminal to ask on; run it with --yes" >&2; exit 2; }
    ask "Remove Kiri (the script, its effects, the compiled plugins and the build files)?" || { echo "Nothing removed."; exit 0; }
    if [ "$purge" = ask ]; then
        if ask "Also delete Kiri's settings and shortcuts? (No keeps them for a reinstall)"; then purge=true; else purge=false; fi
    fi
fi
[ "$purge" = ask ] && purge=false

SUDO=sudo
[ "$(id -u)" = 0 ] && SUDO=
config=${XDG_CONFIG_HOME:-$HOME/.config}
data=${XDG_DATA_HOME:-$HOME/.local/share}
q() { qdbus6 "$@" >/dev/null 2>&1 || true; }
w() { kwriteconfig6 --file kwinrc --group "$1" --key "$2" "$3"; }
d() { kwriteconfig6 --file kwinrc --group "$1" --key "$2" --delete; }

# delete a whole [group] from an ini file
delete_group() {
    [ -f "$1" ] || return 0
    awk -v g="[$2]" '/^\[/ { skip = ($0 == g) } !skip' "$1" >"$1.kiri-tmp" && mv "$1.kiri-tmp" "$1"
}

# ---- stop everything (the script gives Plasma's borrowed shortcuts back when it stops) ------------------
w Plugins kiriEnabled false
for e in kiri_animations kiri_decorations kiri_desktop_switch kiri_motion kiri_swipe kiri_overview; do
    d Plugins ${e}Enabled
    q org.kde.KWin /Effects org.kde.kwin.Effects.unloadEffect $e
done
q org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript kiri

# ---- Plasma's own effects back (their default is on) ---------------------------------------------------
d Plugins slideEnabled
d Plugins kwin4_effect_geometry_changeEnabled
for e in fade scale glide maximize; do
    d Plugins ${e}Enabled
done
# the focus policy Kiri replaced with "Click to focus"
policy=$(kreadconfig6 --file kwinrc --group Kiri-install --key focusPolicyBefore)
if [ -n "$policy" ]; then
    w Windows FocusPolicy "$policy"
    d Kiri-install focusPolicyBefore
fi
d Kiri-install effectsEnabled
d Kiri-install motionEnabled
d Kiri-install swipeEnabled
d Kiri-install overviewEnabled
d Plugins overviewEnabled # Plasma's own Overview is on by default again
q org.kde.KWin /KWin org.kde.KWin.reconfigure
q org.kde.KWin /Effects org.kde.kwin.Effects.loadEffect slide
q org.kde.KWin /Effects org.kde.kwin.Effects.loadEffect kwin4_effect_geometry_change
q org.kde.KWin /Effects org.kde.kwin.Effects.loadEffect overview
for e in scale maximize; do # the ones Plasma has on by default (Fade and Glide are off unless chosen)
    q org.kde.KWin /Effects org.kde.kwin.Effects.loadEffect $e
done

# ---- files -----------------------------------------------------------------------------------------------
kpackagetool6 --type=KWin/Script --remove kiri >/dev/null 2>&1 || true
kpackagetool6 --type=KWin/Effect --remove kiri_animations >/dev/null 2>&1 || true
plugins=$(find /usr/lib/qt6/plugins/kwin/effects/plugins -name 'kiri_*.so' 2>/dev/null || true)
if [ -n "$plugins" ]; then
    echo "Removing the compiled effects (sudo rm):"
    echo "$plugins"
    for f in $plugins; do $SUDO rm -f "$f"; done
fi
rm -rf "${XDG_CACHE_HOME:-$HOME/.cache}/kiri-build"
for icon in "$data/icons/hicolor/scalable/apps/kiri.svg" "$data/icons/hicolor/48x48/apps/kiri.png"; do
    [ -L "$icon" ] && rm -f "$icon"
done

# ---- the command shortcuts niri2kiri.py made from niri's spawn binds --------------------------------------
removed_binds=false
for f in "$data"/applications/kiri-bind-*.desktop; do
    [ -f "$f" ] && grep -q '^X-Kiri-Niri-Bind=true' "$f" || continue
    rm -f "$f"
    removed_binds=true
    # the key the user may have changed in System Settings is stored under [services]
    $purge && delete_group "$config/kglobalshortcutsrc" "services][$(basename "$f")"
done
if $removed_binds; then
    command -v kbuildsycoca6 >/dev/null 2>&1 && kbuildsycoca6 --noincremental >/dev/null 2>&1 || true
    echo "Removed the command shortcuts made from niri's spawn binds."
fi

# ---- settings and shortcuts ------------------------------------------------------------------------------
if $purge; then
    # kglobalaccel forgets shortcuts of a component that is no longer running
    q org.kde.kglobalaccel /component/kiri org.kde.kglobalaccel.Component.cleanUp
    delete_group "$config/kglobalshortcutsrc" kiri
    delete_group "$config/kwinrc" Script-kiri
    delete_group "$config/kwinrc" Kiri-install
    d Plugins kiriEnabled
    q org.kde.KWin /KWin org.kde.KWin.reconfigure
    echo "Deleted Kiri's settings and shortcuts."
else
    echo "Kept Kiri's settings and shortcuts; installing again brings them back."
fi

rows=$(kreadconfig6 --file kwinrc --group Desktops --key Rows --default 1)
[ "$rows" -gt 1 ] && echo "Your desktops stay one above the other ($rows rows); change it in System Settings > Virtual Desktops."
echo "Kiri removed. Log out and log back in to finish."
