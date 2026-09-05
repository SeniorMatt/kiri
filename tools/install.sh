#!/bin/sh
# Installs or updates Kiri from a release tarball or the package directory,
# and gives the Kiri group in System Settings > Shortcuts the same icon as Window Management.
set -e
src=${1:-./kiri}
case $src in
*.tar.gz)
    tmp=$(mktemp -d)
    tar -xzf "$src" -C "$tmp"
    src=$tmp/kiri
    effect=$tmp/kiri_animations
    ;;
*)
    effect=$(dirname "$src")/kiri_animations
    [ -d "$effect" ] || effect=$(dirname "$src")/effect
    ;;
esac
kpackagetool6 --type=KWin/Script --upgrade "$src" >/dev/null 2>&1 || kpackagetool6 --type=KWin/Script --install "$src"

# the animation effect (smooth window moves and resizes), enabled once and reloaded on every update
if [ -d "$effect" ]; then
    kpackagetool6 --type=KWin/Effect --upgrade "$effect" >/dev/null 2>&1 || kpackagetool6 --type=KWin/Effect --install "$effect"
    if [ "$(kreadconfig6 --file kwinrc --group Plugins --key kiri_animationsEnabled)" != false ]; then
        kwriteconfig6 --file kwinrc --group Plugins --key kiri_animationsEnabled true
        qdbus6 org.kde.KWin /Effects org.kde.kwin.Effects.unloadEffect kiri_animations >/dev/null 2>&1 || true
        qdbus6 org.kde.KWin /Effects org.kde.kwin.Effects.loadEffect kiri_animations >/dev/null 2>&1 || true
    fi
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
    kwin_icon=$(find /usr/share/icons/hicolor -name 'kwin.png' | sort -V | tail -1)
    if [ -n "$kwin_icon" ]; then
        mkdir -p "$icons/48x48/apps"
        ln -sf "$kwin_icon" "$icons/48x48/apps/kiri.png"
    fi
fi
echo "Kiri installed. Turn it off and on in System Settings > Window Management > KWin Scripts to load the new version."
