#!/usr/bin/env python3
"""Compare two result JSONs (niri reference vs Kiri) per trace. usage: cmp.py REFDIR KIRIDIR -> table"""
import json, sys, os, glob
def interp(curve, t):
    if not curve: return None
    if t <= curve[0][0]: return curve[0][1]
    for (t0, v0), (t1, v1) in zip(curve, curve[1:]):
        if t0 <= t <= t1: return v0 + (v1 - v0) * (t - t0) / (t1 - t0 if t1 != t0 else 1)
    return curve[-1][1]
def metrics(a, b):
    r = {"kind": (a["kind"], b["kind"])}
    if a["kind"] != b["kind"] or a["kind"] == "none": return r
    fa = [f for f in a["frames"] if f[1] is not None]; fb = {f[0]: f[1] for f in b["frames"] if f[1] is not None}
    ferr = 0
    for t, v in fa:
        if t in fb and v is not None: ferr = max(ferr, abs(fb[t] - v))
    r["frame_err"] = ferr
    key = "final_col" if a["kind"] == "h" else "final_desk"
    r["final"] = (a.get(key), b.get(key))
    ca, cb = a.get("anim", []), b.get("anim", [])
    ts = [t for t, _ in ca]
    r["anim_err"] = max(abs(interp(cb, t) - v) for t, v in ca) if cb and ca else None
    r["dur"] = (a.get("duration_ms"), b.get("duration_ms"))
    return r
if __name__ == "__main__":
    ref, kir = sys.argv[1], sys.argv[2]
    bad = 0
    for p in sorted(glob.glob(ref + "/*.json")):
        n = os.path.basename(p)
        q = os.path.join(kir, n)
        if not os.path.exists(q): continue
        a = json.load(open(p)); b = json.load(open(q)); m = metrics(a, b)
        flag = "" if m.get("final", (1, 1))[0] == m.get("final", (1, 1))[1] and m.get("frame_err", 0) < 1.0 and (m.get("anim_err") or 0) < 3 else "  <<<"
        if flag: bad += 1
        print(n[:-5].ljust(36), m, flag)
    print("differing:", bad)
