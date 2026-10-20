#!/bin/sh
# Test of install.sh, kiri-mode and uninstall.sh against a nested kwin_wayland --virtual with a throwaway HOME.
# Run it inside a container that has KWin, cmake and the KWin headers, with the repository copied to /m:
#   podman cp . ksr-kdelinux:/m; podman exec ksr-kdelinux sh /m/tools/test-mode.sh [/m]
repo=${1:-/m}
[ -n "$KIRI_TEST_INNER" ] || exec env KIRI_TEST_INNER=1 dbus-run-session sh "$0" "$@"
export XDG_RUNTIME_DIR=/tmp/xdg-kiri-mode HOME=/tmp/kiri-mode-home
export KWIN_WAYLAND_NO_PERMISSION_CHECKS=1 QT_QPA_PLATFORM=offscreen
export PATH=$HOME/.local/bin:/usr/sbin:/usr/bin:/bin
rm -rf "$XDG_RUNTIME_DIR" "$HOME"
mkdir -p "$XDG_RUNTIME_DIR" "$HOME/.config"
chmod 700 "$XDG_RUNTIME_DIR"
fail=0
check() { # description condition-command...
    desc=$1; shift
    if "$@" >/dev/null 2>&1; then echo "ok   $desc"; else echo "FAIL $desc"; fail=$((fail + 1)); fi
}
rk() { kreadconfig6 --file kwinrc --group "$1" --key "$2"; }
loaded() { qdbus6 org.kde.KWin /Effects org.kde.kwin.Effects.isEffectLoaded "$1"; }
is_loaded() { [ "$(loaded "$1")" = true ]; }
not_loaded() { [ "$(loaded "$1")" != true ]; }
script_on() { [ "$(qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.isScriptLoaded kiri)" = true ]; }
script_off() { ! script_on; }
eq() { [ "$1" = "$2" ]; }
dump() { for g in Plugins Windows Desktops; do awk -v g="[$g]" '/^\[/ { on = ($0 == g) } on && NF && !/^Id_/' "$HOME/.config/kwinrc" | sort; done; }
wait_effect() { for _ in $(seq 1 30); do is_loaded "$1" && return 0; sleep 0.5; done; return 1; }

# the user's Plasma settings before Kiri: wrap-around on, focus under mouse, fade chosen, one row of three desktops
w() { kwriteconfig6 --file kwinrc --group "$1" --key "$2" "$3"; }
w Windows FocusPolicy FocusUnderMouse; w Windows RollOverDesktops true
w Desktops Number 3; w Desktops Rows 1; w Plugins fadeEnabled true
dump >"$HOME/before.txt"

start_kwin() {
    kwin_wayland --virtual --no-lockscreen --width 1280 --height 720 >"$HOME/kwin.log" 2>&1 &
    echo $! >"$HOME/kwin.pid"
    for _ in $(seq 1 40); do qdbus6 org.kde.KWin /KWin org.kde.KWin.supportInformation >/dev/null 2>&1 && break; sleep 0.5; done
    sleep 3
}
stop_kwin() { kill "$(cat "$HOME/kwin.pid")" 2>/dev/null; sleep 2; }


start_kwin
echo "-- install"
(cd "$repo" && sh tools/install.sh </dev/null >"$HOME/install.log" 2>&1); tail -3 "$HOME/install.log"
sleep 3
check "install: kiri-mode installed" test -x "$HOME/.local/bin/kiri-mode"
check "install: desktop file has the shortcut" grep -q "X-KDE-Shortcuts=Meta+Ctrl+Shift+K" "$HOME/.local/share/applications/kiri-mode.desktop"
check "install: kwinrc does not switch Plasma effects off" eq "$(rk Plugins fadeEnabled)$(rk Plugins slideEnabled)" true
check "install: kiri effects not enabled in kwinrc" eq "$(rk Plugins kiri_motionEnabled)" ""

kiri_state() {
    check "$1: kiri mode" eq "$(rk Plugins kiriEnabled)" true
    check "$1: script loaded" script_on
    check "$1: kiri_motion loaded" is_loaded kiri_motion
    check "$1: kiri_decorations loaded" is_loaded kiri_decorations
    check "$1: slide unloaded" not_loaded slide
    check "$1: fade unloaded" not_loaded fade
    check "$1: focus policy ClickToFocus" eq "$(rk Windows FocusPolicy)" ClickToFocus
    check "$1: rollover false" eq "$(rk Windows RollOverDesktops)" false
    check "$1: rows 3" eq "$(rk Desktops Rows)" 3
    check "$1: user focus policy kept" eq "$(rk Kiri-mode focusPolicy)" FocusUnderMouse
    check "$1: user rollover kept" eq "$(rk Kiri-mode rollOver)" true
    check "$1: user rows kept" eq "$(rk Kiri-mode rows)" 1
}
plasma_state() {
    check "$1: plasma mode" eq "$(rk Plugins kiriEnabled)" false
    check "$1: script not loaded" script_off
    check "$1: kiri_motion unloaded" not_loaded kiri_motion
    check "$1: kiri_decorations unloaded" not_loaded kiri_decorations
    check "$1: kiri_swipe unloaded" not_loaded kiri_swipe
    check "$1: slide loaded" is_loaded slide
    check "$1: fade loaded (user chose it)" is_loaded fade
    check "$1: focus policy back" eq "$(rk Windows FocusPolicy)" FocusUnderMouse
    check "$1: rollover back" eq "$(rk Windows RollOverDesktops)" true
    check "$1: rows back" eq "$(rk Desktops Rows)" 1
    check "$1: saved values gone" eq "$(rk Kiri-mode focusPolicy)$(rk Kiri-mode rows)" ""
}
kiri_state "after install"
for step in plasma kiri plasma; do
    echo "-- kiri-mode $step"
    kiri-mode $step --no-osd
    sleep 1
    if [ $step = kiri ]; then kiri_state "$step"; else plasma_state "$step"; fi
done
echo "-- toggle, status"
kiri-mode toggle --no-osd; sleep 1
kiri_state "toggle"
check "status says kiri" eq "$(kiri-mode status | head -1)" "kiri mode"
echo "-- user changes focus policy in Kiri mode, then switches to Plasma"
w Windows FocusPolicy FocusFollowsMouse
kiri-mode plasma --no-osd; sleep 1
check "a change made in Kiri mode is kept" eq "$(rk Windows FocusPolicy)" FocusFollowsMouse
w Windows FocusPolicy FocusUnderMouse
echo "-- restart of kwin in Plasma mode stays Plasma"
stop_kwin; start_kwin
plasma_state "restart plasma"
echo "-- restart of kwin in Kiri mode comes back as Kiri"
kiri-mode kiri --no-osd; sleep 1
stop_kwin; start_kwin
wait_effect kiri_motion
check "restart kiri: script loaded" script_on
check "restart kiri: kiri_motion loaded" is_loaded kiri_motion
check "restart kiri: slide unloaded" not_loaded slide
check "restart kiri: values saved" eq "$(rk Kiri-mode focusPolicy)" FocusUnderMouse
kiri-mode plasma --no-osd; sleep 1
plasma_state "after restart"
echo "-- uninstall"
kiri-mode kiri --no-osd; sleep 1
(cd "$repo" && sh tools/uninstall.sh --yes </dev/null >"$HOME/uninstall.log" 2>&1); tail -2 "$HOME/uninstall.log"
sleep 1
dump >"$HOME/after.txt"
check "uninstall: kwinrc as before install" diff "$HOME/before.txt" "$HOME/after.txt"
diff "$HOME/before.txt" "$HOME/after.txt"
check "uninstall: kiri-mode removed" test ! -e "$HOME/.local/bin/kiri-mode"
check "uninstall: desktop file removed" test ! -e "$HOME/.local/share/applications/kiri-mode.desktop"
check "uninstall: script not loaded" script_off
check "uninstall: kiri_motion unloaded" not_loaded kiri_motion
check "uninstall: slide loaded" is_loaded slide
echo "-- migration of a 0.10.5 install"
w Windows FocusPolicy ClickToFocus; w Windows RollOverDesktops false; w Desktops Rows 3
kwriteconfig6 --file kwinrc --group Kiri-install --key modeSwitch --delete
w Kiri-install focusPolicyBefore FocusUnderMouse; w Kiri-install rollOverBefore true; w Kiri-install effectsEnabled done
w Plugins slideEnabled false; w Plugins fadeEnabled false; w Plugins kiri_motionEnabled true; w Plugins kiriEnabled true
(cd "$repo" && sh tools/install.sh </dev/null >"$HOME/install2.log" 2>&1); sleep 3
check "migrated: Plasma effect keys gone" eq "$(rk Plugins slideEnabled)$(rk Plugins fadeEnabled)$(rk Plugins kiri_motionEnabled)" ""
check "migrated: focus policy moved" eq "$(rk Kiri-mode focusPolicy)" FocusUnderMouse
check "migrated: rollover moved" eq "$(rk Kiri-mode rollOver)" true
check "migrated: old keys gone" eq "$(rk Kiri-install focusPolicyBefore)$(rk Kiri-install rollOverBefore)" ""
check "migrated: kiri mode" script_on
kiri-mode plasma --no-osd; sleep 1
check "migrated: plasma restores focus policy" eq "$(rk Windows FocusPolicy)" FocusUnderMouse
check "migrated: plasma restores rollover" eq "$(rk Windows RollOverDesktops)" true
stop_kwin
echo "failures: $fail"
exit $fail
