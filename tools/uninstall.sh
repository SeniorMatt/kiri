#!/bin/sh
# Removes what install.sh put on this machine: the Kiri script, the kiri_animations effect, the compiled
# effects (kiri_decorations, kiri_desktop_switch, kiri_motion, kiri_swipe, kiri_overview) and the build cache, and turns Plasma's own effects back on.
# It lists what it is going to do and asks first, then asks again whether to delete your Kiri settings and
# shortcuts too. Keep them if you only want Kiri gone for a while: installing it again brings everything back as
# it was. At the end it asks to log out when KWin needs a new session.
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

data=${XDG_DATA_HOME:-$HOME/.local/share}
echo "This removes Kiri. It will:"
echo "  - switch back to Plasma mode: Plasma's effects, your focus policy, wrap-around and desktop rows come back"
echo "  - give back the keys Kiri put on KWin's own actions (keys you set yourself stay)"
echo "  - remove the Kiri KWin script, the kiri-mode command and its shortcut"
echo "  - remove Kiri's compiled effects from Qt's plugin folder (sudo) and the build files in ~/.cache/kiri-build"
ls "$data"/applications/kiri-bind-*.desktop >/dev/null 2>&1 &&
    echo "  - remove the command shortcuts niri2kiri.py made from niri's spawn binds"
if [ "$purge" = true ]; then
    echo "  - delete Kiri's settings and shortcuts"
elif [ "$purge" = ask ] && ! $yes; then
    echo "  - and, if you say so, delete Kiri's settings and shortcuts"
fi
if ! $yes; then
    [ -r /dev/tty ] || { echo "uninstall.sh: no terminal to ask on; run it with --yes" >&2; exit 2; }
    ask "Go on?" || { echo "Nothing removed."; exit 0; }
    if [ "$purge" = ask ]; then
        if ask "Also delete Kiri's settings and shortcuts? (No keeps them for a reinstall)"; then purge=true; else purge=false; fi
    fi
fi
[ "$purge" = ask ] && purge=false

SUDO=sudo
[ "$(id -u)" = 0 ] && SUDO=
config=${XDG_CONFIG_HOME:-$HOME/.config}
qdbus=
for c in qdbus6 qdbus-qt6 qdbus; do
    command -v "$c" >/dev/null 2>&1 && { qdbus=$c; break; }
done
if [ -z "$qdbus" ]; then
    for c in /usr/lib*/qt6/bin/qdbus* /usr/lib/*/qt6/bin/qdbus*; do
        [ -x "$c" ] && { qdbus=$c; break; }
    done
fi
# where Qt (and so KWin) looks for plugins (differs per distro)
qt_plugins() {
    for c in qtpaths6 qtpaths-qt6 qmake6 qmake-qt6 qtpaths qmake; do
        command -v "$c" >/dev/null 2>&1 || continue
        d=$("$c" -query QT_INSTALL_PLUGINS 2>/dev/null) || d=
        [ -d "$d" ] || d=$("$c" --query QT_INSTALL_PLUGINS 2>/dev/null) || d=
        [ -d "$d" ] && { echo "$d"; return; }
    done
}
plugindir=$(qt_plugins)
q() { "${qdbus:-false}" "$@" >/dev/null 2>&1 || true; }
w() { kwriteconfig6 --file kwinrc --group "$1" --key "$2" "$3"; }
d() { kwriteconfig6 --file kwinrc --group "$1" --key "$2" --delete; }

# delete a whole [group] from an ini file
delete_group() {
    [ -f "$1" ] || return 0
    awk -v g="[$2]" '/^\[/ { skip = ($0 == g) } !skip' "$1" >"$1.kiri-tmp" && mv "$1.kiri-tmp" "$1"
}

# KWin keeps loaded effects until the next login, and changes it can't be told about wait for one too
relogin=false
"${qdbus:-false}" org.kde.KWin /KWin >/dev/null 2>&1 || relogin=true

# ---- Plasma mode first: the script and the kiri_* effects stop, Plasma's effects and your focus policy, wrap-around
# and rows come back (the script gives Plasma's borrowed shortcuts back when it stops) ----------------------------
kiri_mode=$(command -v kiri-mode || echo "$HOME/.local/bin/kiri-mode")
if [ -x "$kiri_mode" ]; then
    "$kiri_mode" plasma --no-osd || true
else
    w Plugins kiriEnabled false
    q org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript kiri
fi
# ---- the keys Kiri gave to KWin's own actions (Plasma-mode twins): taken back, your own keys stay ----------------
twins="$config/kiri-twins.conf"
if [ -f "$twins" ]; then
    given=$(kreadconfig6 --file "$twins" --group Twins --key given)
    old_ifs=$IFS
    IFS='|'
    for entry in $given; do
        IFS=$old_ifs
        name=${entry%%~*}
        ours=${entry#*~}
        ours=${ours%%~*}
        [ -n "$name" ] && [ "$name" != "$entry" ] || continue
        now=$(dbus-send --session --print-reply --dest=org.kde.kglobalaccel /kglobalaccel org.kde.KGlobalAccel.shortcut \
            "array:string:kwin,$name,KWin,$name" 2>/dev/null | awk '$1 == "int32" { print $2 }') || now=
        left=
        for key in $now; do
            case ".$ours." in *".$key."*) ;; *) left="${left:+$left,}$key" ;; esac
        done
        dbus-send --session --type=method_call --dest=org.kde.kglobalaccel /kglobalaccel org.kde.KGlobalAccel.setForeignShortcut \
            "array:string:kwin,$name,KWin,$name" "array:int32:$left" >/dev/null 2>&1 || true
        IFS='|'
    done
    IFS=$old_ifs
    rm -f "$twins"
fi
for e in kiri_animations kiri_decorations kiri_desktop_switch kiri_motion kiri_swipe kiri_overview; do
    d Plugins ${e}Enabled
    q org.kde.KWin /Effects org.kde.kwin.Effects.unloadEffect $e
done
# what versions up to 0.10.5 left in kwinrc
old_install=false
for k in effectsEnabled motionEnabled swipeEnabled overviewEnabled decorations010; do
    [ -n "$(kreadconfig6 --file kwinrc --group Kiri-install --key $k)" ] && old_install=true
done
if $old_install; then
    for e in slide overview kwin4_effect_geometry_change fade scale glide maximize; do
        d Plugins ${e}Enabled
    done
    for k in effectsEnabled motionEnabled swipeEnabled overviewEnabled decorations010; do
        d Kiri-install $k
    done
fi
policy=$(kreadconfig6 --file kwinrc --group Kiri-install --key focusPolicyBefore)
[ -n "$policy" ] && w Windows FocusPolicy "$policy"
rollover=$(kreadconfig6 --file kwinrc --group Kiri-install --key rollOverBefore)
[ -n "$rollover" ] && w Windows RollOverDesktops "$rollover"
delete_group "$config/kwinrc" Kiri-mode
d Kiri-install focusPolicyBefore
d Kiri-install rollOverBefore
d Plugins kiriEnabled
q org.kde.KWin /KWin org.kde.KWin.reconfigure
rm -f "$HOME/.local/bin/kiri-mode" "$data/applications/kiri-mode.desktop"
$purge && delete_group "$config/kglobalshortcutsrc" "services][kiri-mode.desktop"
command -v kbuildsycoca6 >/dev/null 2>&1 && kbuildsycoca6 --noincremental >/dev/null 2>&1 || true

# ---- files -----------------------------------------------------------------------------------------------
kpackagetool6 --type=KWin/Script --remove kiri >/dev/null 2>&1 || true
kpackagetool6 --type=KWin/Effect --remove kiri_animations >/dev/null 2>&1 || true
# the plugin dir of the Qt tools, plus the usual ones in case the dev tools are gone
plugins=$(find "$plugindir/kwin/effects/plugins" /usr/lib/qt6/plugins/kwin/effects/plugins /usr/lib64/qt6/plugins/kwin/effects/plugins /usr/lib/*/qt6/plugins/kwin/effects/plugins -name 'kiri_*.so' 2>/dev/null | sort -u || true)
if [ -n "$plugins" ]; then
    echo "Removing the compiled effects (sudo rm):"
    echo "$plugins"
    for f in $plugins; do $SUDO rm -f "$f"; done
    relogin=true
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
    d Plugins kiriEnabled
    q org.kde.KWin /KWin org.kde.KWin.reconfigure
    echo "Deleted Kiri's settings and shortcuts."
else
    echo "Kept Kiri's settings and shortcuts; installing again brings them back."
fi

rows=$(kreadconfig6 --file kwinrc --group Desktops --key Rows --default 1)
[ "$rows" -gt 1 ] && echo "Your desktops stay one above the other ($rows rows); change it in System Settings > Virtual Desktops."
echo "Kiri removed."
$relogin || exit 0
echo "Log out and log back in to finish (KWin keeps Kiri's effects loaded until then)."
if ! $yes && [ -r /dev/tty ] && ask "Log out now?"; then
    qb=${qdbus:-false}
    "$qb" org.kde.Shutdown /Shutdown org.kde.Shutdown.logout >/dev/null 2>&1 ||
        "$qb" org.kde.ksmserver /KSMServer org.kde.KSMServerInterface.logout 0 0 0 >/dev/null 2>&1 ||
        echo "Couldn't log out automatically; please log out yourself." >&2
fi
