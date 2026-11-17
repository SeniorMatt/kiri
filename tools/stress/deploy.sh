#!/bin/sh
# host side: copy the harness, the built script package and (optionally) the effects into the container's /st
# usage: deploy.sh [effects]    effects: also rebuild the C++ effects in the container (-j1, nice) and install them into /st/qtplug
here=$(cd "$(dirname "$0")" && pwd); root=$(cd "$here/../.." && pwd); C=${C:-ksr-kdelinux}
podman exec $C sh -c 'ulimit -c 0; mkdir -p /st'
podman exec $C sh -c 'rm -rf /st/package /st/probe'
podman cp "$root/package" $C:/st/package
podman cp "$here/probe" $C:/st/probe
for f in stress.py idle.py start.sh win.qml; do podman cp "$here/$f" $C:/st/$f; done
podman cp "$here/../kiri-mode" $C:/st/kiri-mode
podman exec $C sh -c 'ulimit -c 0; chmod +x /st/start.sh; rm -rf /st/package/contents/code/*.map'
if [ "$1" = effects ]; then
  podman exec $C sh -c 'ulimit -c 0; rm -rf /st/effect-cpp'
  podman cp "$root/effect-cpp" $C:/st/effect-cpp
  podman exec $C sh -c 'ulimit -c 0; cd /st && nice -n 15 cmake --build /st/eb -j1 >/st/eb.build.log 2>&1 && rm -rf /st/inst && DESTDIR=/st/inst cmake --install /st/eb >/dev/null && cp /st/inst/usr/lib/qt6/plugins/kwin/effects/plugins/*.so /st/qtplug/kwin/effects/plugins/ && echo effects installed || tail -20 /st/eb.build.log'
fi
