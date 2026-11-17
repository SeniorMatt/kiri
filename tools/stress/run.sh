#!/bin/sh
# host side: run scenarios in the container, one nested KWin session for the whole list; output in /st/run-<tag>.out
#   run.sh TAG scenario [scenario...]        (deploy.sh first)
C=${C:-ksr-kdelinux}; tag=$1; shift
podman exec -e SAVETAG -e SAVEREF -e OVCASES -e EXTRA -e DESKTOPS -e W -e H $C sh -c "ulimit -c 0; cd /st && timeout 3000 ./start.sh stress.py $* 2>&1 | grep --line-buffered -v -E 'dbus-daemon|portal|^\$|fuse' > /st/run-$tag.out"
