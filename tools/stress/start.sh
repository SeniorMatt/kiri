#!/bin/sh
# Inside the container (ksr-kdelinux). Starts a nested virtual KWin with Kiri and the compiled effects in a throwaway HOME,
# runs the python driver against it, then stops everything it started.
#   start.sh stress.py scenario [scenario...]        ST=/st is the work dir (see run.sh for what it holds)
ST=${ST:-/st}
export XDG_RUNTIME_DIR=/tmp/xdgst HOME=/tmp/sthome
rm -rf $XDG_RUNTIME_DIR $HOME; mkdir -p $XDG_RUNTIME_DIR $HOME/.config; chmod 700 $XDG_RUNTIME_DIR
export KWIN_SCREENSHOT_NO_PERMISSION_CHECKS=1 KWIN_WAYLAND_NO_PERMISSION_CHECKS=1
export KIRI_OVERVIEW_TRACE=1
export QT_PLUGIN_PATH=$ST/qtplug QML_XHR_ALLOW_FILE_READ=1
export QT_LOGGING_RULES="js=true;kwin_scripting=true;kwin_*.debug=false" QT_FORCE_STDERR_LOGGING=1
W=${W:-1920}; H=${H:-1080}
w() { kwriteconfig6 --file kwinrc --group "$1" --key "$2" "$3"; }
w Plugins kiriEnabled true; w Plugins stprobeEnabled true; w Plugins kiri_gesturesimEnabled true
for e in decorations motion swipe overview desktop_switch; do w Plugins kiri_${e}Enabled true; done
for e in slide kwin4_effect_geometry_change fade scale glide maximize overview; do w Plugins ${e}Enabled false; done
w Script-kiri borderEnabled true
mkdir -p /tmp/stwork
w Desktops Number ${DESKTOPS:-3}; w Desktops Rows 1
w Windows FocusPolicy ${FOCUS:-ClickToFocus}
[ -n "$EXTRA" ] && eval "$EXTRA"
exec dbus-run-session sh -c '
timeout 60 kpackagetool6 --type=KWin/Script --install '$ST'/package >/dev/null 2>&1
timeout 60 kpackagetool6 --type=KWin/Script --install '$ST'/probe >/dev/null 2>&1
QT_QPA_PLATFORM=offscreen /usr/lib/kactivitymanagerd >/dev/null 2>&1 &
KACT=$!
sleep 2
kwin_wayland ${XWL:+--xwayland} --virtual --no-lockscreen --width '$W' --height '$H' > '$ST'/kwin.log 2>&1 &
KW=$!
echo $KW > '$ST'/kwin.pid
for i in $(seq 1 60); do qdbus6 org.kde.KWin /KWin org.kde.KWin.supportInformation >/dev/null 2>&1 && break; sleep 0.5; done
sleep 8
export WAYLAND_DISPLAY=$(ls $XDG_RUNTIME_DIR | grep -m1 "^wayland-[0-9]*$")
(QT_QPA_PLATFORM=wayland '$ST'/panel >/dev/null 2>&1 & echo $! > '$ST'/panel.pid)
sleep 2
python3 '$ST'/${DRIVER:-stress.py} "$@"
RC=$?

kill $(cat '$ST'/panel.pid) $KW $KACT 2>/dev/null
sleep 1
exit $RC
' sh "$@"
