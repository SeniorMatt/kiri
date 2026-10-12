#!/usr/bin/env python3
"""Turns the gesture events libinput made of a real recording (li_replay output: B/U/E lines) into traces.
usage: real_traces.py gestures.txt ACCEL_DIR UNACCEL_DIR
ACCEL_DIR gets what KWin hands the effect (dx, dy), UNACCEL_DIR what niri reads (dx_unaccelerated)."""
import os, sys
src, adir, udir = sys.argv[1:4]
os.makedirs(adir, exist_ok=True); os.makedirs(udir, exist_ok=True)
swipes, cur = [], None
for line in open(src):
    p = line.split()
    if p[0] == "B": cur = {"t0": int(p[1]), "ev": []}
    elif p[0] == "U": cur["ev"].append([int(p[1])] + [float(v) for v in p[3:7]])
    elif p[0] == "E": cur["end"] = int(p[1]); swipes.append(cur)
W, GAPS = 1920, 16
LAYOUTS = {"A3": ([960, 1280, 800], 0), "B3": ([960, 1280, 800], 1), "C4": ([900, 1100, 700, 1300], 1),
           "D5": ([800, 640, 960, 700, 1000], 2), "E5": ([700, 1000, 1500, 800, 900], 0), "F5": ([800, 640, 960, 700, 1000], 4)}
def write(path, name, lay, ev, end, which):
    cols, start = LAYOUTS[lay]
    cx = lambda i: sum(w + GAPS for w in cols[:i])
    rightmost = cx(len(cols) - 1) + cols[-1] + GAPS - W
    with open(path, "w") as f:
        f.write(f"name {name}\nwidth {W}\ngaps {GAPS}\ncols {' '.join(map(str, cols))}\nstart_col {start}\n")
        f.write(f"start_view_pos {max(-GAPS, min(cx(start) - GAPS, max(rightmost, -GAPS)))}\nnatural 0\ncenter never\n")
        for e in ev:
            f.write("e %.3f %.5f %.5f\n" % ((e[0] - t0) / 1000.0, e[1 + 2 * which], e[2 + 2 * which]))
        f.write("end %.3f\n" % ((end - t0) / 1000.0))
for i, s in enumerate(swipes):
    t0 = s["t0"]
    for lay in LAYOUTS:
        name = f"real{i:02d}_{lay}"
        write(f"{adir}/{name}.trace", name, lay, s["ev"], s["end"], 0)
        write(f"{udir}/{name}.trace", name, lay, s["ev"], s["end"], 1)
print(len(swipes), "swipes")
