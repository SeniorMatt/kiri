#!/bin/sh
# host side: stop the stress session(s) this harness started in the container (only the process trees under `./start.sh stress.py`)
C=${C:-ksr-kdelinux}
podman exec -i $C python3 - <<'PY'
import subprocess, os, signal, time
rows = {}
kids = {}
for l in subprocess.run(['ps', '-eo', 'pid,ppid,args'], capture_output=True, text=True).stdout.split('\n')[1:]:
    p = l.split(None, 2)
    if len(p) < 3: continue
    rows[int(p[0])] = p[2]; kids.setdefault(int(p[1]), []).append(int(p[0]))
roots = [pid for pid, a in rows.items() if a.startswith('sh -c ulimit -c 0; cd /st && timeout')]
mine = []
for r in roots:
    st = [r]
    while st:
        x = st.pop(); mine.append(x); st += kids.get(x, [])
# orphans of an earlier chain: python / inp / shot / panel / kwin started from /st
for pid, a in rows.items():
    if pid not in mine and (a.startswith('python3 /st/') or a.startswith('/st/inp') or a.startswith('/st/shot') or a.startswith('/st/panel')):
        mine.append(pid)
for sig in (signal.SIGTERM, signal.SIGKILL):
    for p in reversed(mine):
        try: os.kill(p, sig)
        except Exception: pass
    time.sleep(2)
print('stopped', len(mine))
PY
