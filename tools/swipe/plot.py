#!/usr/bin/env python3
"""Kiri vs niri curves per trace. usage: plot.py REF_DIR OUT_DIR NAME=DIR ... (e.g. before=base_accel after=new_chain)
Needs matplotlib. Draws the position over time: the finger-following part and the release spring."""
import json, sys, os, glob
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
ref, out = sys.argv[1], sys.argv[2]
series = [a.split("=") for a in sys.argv[3:]]
os.makedirs(out, exist_ok=True)
colors = {"niri": "#222222"}
palette = ["#d1495b", "#2e86ab", "#e08e0b"]
def curve(d):
    pts = [(t, v) for t, v in d.get("frames", []) if v is not None] + [(t, v) for t, v in d.get("anim", [])]
    return sorted(pts)
def final(d):
    return d.get("final_col", d.get("final_desk"))
names = [os.path.basename(p)[:-5] for p in sorted(glob.glob(ref + "/*.json"))]
for n in names:
    r = json.load(open(f"{ref}/{n}.json"))
    if r["kind"] in ("none",): continue
    fig, ax = plt.subplots(figsize=(7, 3.4), dpi=110)
    c = curve(r)
    ax.plot([t for t, _ in c], [v for _, v in c], color="#222222", lw=2.4, label=f"niri (lands on {final(r)})")
    for i, (label, d) in enumerate(series):
        p = os.path.join(os.path.dirname(ref.rstrip("/")), d, n + ".json")
        if not os.path.exists(p): continue
        k = json.load(open(p))
        if k["kind"] != r["kind"]:
            ax.plot([], [], color=palette[i], label=f"{label}: axis {k['kind']}"); continue
        kc = curve(k)
        ax.plot([t for t, _ in kc], [v for _, v in kc], color=palette[i], lw=1.4, ls="--" if i == 0 else "-", label=f"Kiri {label} (lands on {final(k)})")
    unit = "screen x of column 0, px" if r["kind"] == "h" else "desktop index"
    ax.set_title(n, fontsize=10); ax.set_xlabel("ms"); ax.set_ylabel(unit); ax.grid(alpha=.25)
    ax.axvline(r.get("frames", [[0]])[-1][0] if r.get("frames") else 0, color="#999", lw=.6)
    ax.legend(fontsize=7, loc="best")
    fig.tight_layout(); fig.savefig(f"{out}/{n}.png"); plt.close(fig)
print(len(names), "plots")
