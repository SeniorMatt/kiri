#!/usr/bin/env python3
"""Synthetic 3-finger swipe traces that copy human fingers (touchpad units as libinput hands them out)."""
import math, random, os, sys
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

def minjerk(s): return 10*s**3 - 15*s**4 + 6*s**5  # position fraction
def ease_in(s): return s**2 * (3 - 2*s)

def profile(total, dur, kind="minjerk"):
    f = {"minjerk": minjerk, "slowstart": lambda s: s**2.2, "faststart": lambda s: 1-(1-s)**2.5,
         "linear": lambda s: s}[kind]
    return lambda t: total * f(min(max(t/dur, 0), 1))

def emit(segments, rng, dt_mean=8.3, dt_jit=2.2, dy_frac=0.0, dy_drift=0.0, noise=0.0, t0=0.0):
    """segments: list of (func(t)->x position, duration, y_func or None). Returns events [t,dx,dy]."""
    ev = []; t = t0; px = 0.0; py = 0.0
    tt = 0.0
    for fx, dur, fy in segments:
        local = 0.0
        while local < dur:
            dt = max(4.0, rng.gauss(dt_mean, dt_jit))
            local = min(local + dt, dur); t += dt
            x = fx(local); y = fy(local) if fy else 0.0
            dx = x - px; dy = y - py; px = x; py = y
            dx += rng.gauss(0, noise); dy += rng.gauss(0, noise*0.5)
            ev.append([round(t, 3), round(dx, 4), round(dy + dy_frac*dx, 4)])
        # carry positions: next segment starts from its own origin -> shift
        px = 0.0; py = 0.0
    return ev, t

def seg(total, dur, kind="minjerk", ytotal=0.0):
    fx = profile(total, dur, kind); fy = (profile(ytotal, dur, kind) if ytotal else None)
    return (fx, dur, fy)

def hold(dur, jitter=0.3):
    return (lambda t: 0.0, dur, None)

LAYOUTS = {
    "L5": dict(cols=[800, 640, 960, 700, 1000], start=1),
    "L5s0": dict(cols=[800, 640, 960, 700, 1000], start=0),
    "L5e": dict(cols=[800, 640, 960, 700, 1000], start=4),
    "L8": dict(cols=[760]*8, start=3),
    "L2fit": dict(cols=[600, 700], start=0),
    "L3wide": dict(cols=[900, 1568, 900, 700], start=1),
    "L1": dict(cols=[1000], start=0),
    # the owner's laptop: 1872 px working width, gaps 8, mixed widths and 50% columns
    "O1": dict(cols=[920, 1050, 936, 936, 920], start=1, width=1872, gaps=8),
    "O2": dict(cols=[936, 936, 936, 936], start=0, width=1872, gaps=8),
    "O3": dict(cols=[936, 936, 936, 936], start=2, width=1872, gaps=8),
    "O4": dict(cols=[936], start=0, width=1872, gaps=8),
}

def write(name, layout, ev, end_gap, natural=0, center="never", extra=None, desks=None):
    L = LAYOUTS[layout] if layout else None
    last = ev[-1][0] if ev else 0
    with open(os.path.join(OUT, name + ".trace"), "w") as f:
        W = L.get("width", 1600) if L else 1600
        G = L.get("gaps", 16) if L else 16
        f.write(f"name {name}\nwidth {W}\ngaps {G}\n")
        if L:
            f.write("cols " + " ".join(map(str, L["cols"])) + f"\nstart_col {L['start']}\n")
            cx = lambda i: sum(w + G for w in L["cols"][:i])
            rightmost = cx(len(L["cols"]) - 1) + L["cols"][-1] + G - W
            f.write(f"start_view_pos {max(-G, min(cx(L['start']) - G, max(rightmost, -G)))}\n")
        if desks:
            f.write(f"desks {desks[0]} {desks[1]}\n")
        f.write(f"natural {natural}\ncenter {center}\n")
        if extra: f.write(extra)
        for t, dx, dy in ev:
            f.write(f"e {t} {dx} {dy}\n")
        f.write(f"end {round(last + end_gap, 3)}\n")

def vert(ev):  # swap axes
    return [[t, dy, dx] for t, dx, dy in ev]

n = 0
rng = random.Random(1337)
H = []
def add(name, layout, segments, end_gap, sign=1, dy_frac=0.0, noise=0.0, natural=0, center="never", dt=8.3, desks=None, vertical=False):
    ev, _ = emit(segments, rng, dt_mean=dt, dy_frac=dy_frac, noise=noise)
    ev = [[t, dx*sign, dy*sign] for t, dx, dy in ev]
    if vertical: ev = vert(ev); natural = 1
    write(name, layout, ev, end_gap, natural, center, desks=desks)

for L in ["L5", "L8", "L3wide", "L2fit"]:
    for d, sg in (("r", 1), ("l", -1)):
        add(f"slow_short_{L}_{d}", L, [seg(140, 700), hold(120)], 130, sg, noise=0.15, dt=11)
        add(f"slow_long_{L}_{d}", L, [seg(650, 1500, "linear"), hold(80)], 90, sg, noise=0.25)
        add(f"flick_{L}_{d}", L, [seg(260, 130, "faststart")], 8, sg, noise=0.3, dt=7.5)
        add(f"medium_{L}_{d}", L, [seg(420, 380)], 12, sg, dy_frac=0.08, noise=0.2)
        add(f"hesitate_{L}_{d}", L, [seg(180, 300), hold(320), seg(240, 260)], 14, sg, noise=0.2)
        add(f"reverse_{L}_{d}", L, [seg(330, 260), hold(60), seg(-230, 300)], 15, sg, noise=0.2)
        add(f"flick_then_rest_{L}_{d}", L, [seg(320, 160, "faststart"), hold(220)], 230, sg, noise=0.2, dt=8)
        add(f"fling_long_{L}_{d}", L, [seg(900, 240, "faststart")], 10, sg, noise=0.4, dt=7.5)
        add(f"slowstart_{L}_{d}", L, [seg(520, 600, "slowstart")], 9, sg, noise=0.2)
for L in ["L5s0", "L5e"]:
    for d, sg in (("r", 1), ("l", -1)):
        add(f"past_end_hold_{L}_{d}", L, [seg(520, 500), hold(150)], 160, sg, noise=0.2)
        add(f"past_end_flick_{L}_{d}", L, [seg(380, 180, "faststart")], 8, sg, noise=0.3)
add("drift_H_L5", "L5", [seg(360, 340, "minjerk", ytotal=70)], 11, 1, noise=0.2)
add("drift_H_L5_up", "L5", [seg(360, 340, "minjerk", ytotal=-95)], 11, -1, noise=0.2)
add("diag_h_L5", "L5", [seg(300, 300, "minjerk", ytotal=240)], 12, 1, noise=0.2)
add("diag_v_L5", "L5", [seg(220, 300, "minjerk", ytotal=300)], 12, 1, noise=0.2)
add("tiny_L5", "L5", [seg(9, 80)], 10, 1, noise=0.05)
add("lockedge_L5", "L5", [seg(17, 60), hold(200)], 210, 1, noise=0.05)
add("natural_flick_L5", "L5", [seg(260, 130, "faststart")], 8, 1, noise=0.3, natural=1)
add("center_always_L5", "L5", [seg(350, 300)], 11, 1, noise=0.2, center="always")
add("center_overflow_L5", "L5", [seg(350, 300)], 11, 1, noise=0.2, center="on-overflow")
add("center_always_flick_L8", "L8", [seg(500, 200, "faststart")], 9, 1, noise=0.2, center="always")
add("center_overflow_flick_L8", "L8", [seg(500, 200, "faststart")], 9, -1, noise=0.2, center="on-overflow")
for L in ["O1", "O2", "O3"]:
    for d, sg in (("r", 1), ("l", -1)):
        add(f"own_slow_short_{L}_{d}", L, [seg(140, 700), hold(120)], 130, sg, noise=0.15, dt=11)
        add(f"own_slow_long_{L}_{d}", L, [seg(650, 1500, "linear"), hold(80)], 90, sg, noise=0.25)
        add(f"own_flick_{L}_{d}", L, [seg(260, 130, "faststart")], 8, sg, noise=0.3, dt=7.5)
        add(f"own_medium_{L}_{d}", L, [seg(420, 380)], 12, sg, dy_frac=0.08, noise=0.2)
        add(f"own_between_{L}_{d}", L, [seg(300, 420), hold(60)], 70, sg, noise=0.2)
        add(f"own_fling_{L}_{d}", L, [seg(900, 240, "faststart")], 10, sg, noise=0.4, dt=7.5)
        add(f"own_hesitate_{L}_{d}", L, [seg(180, 300), hold(320), seg(240, 260)], 14, sg, noise=0.2)
for d, sg in (("r", 1), ("l", -1)):
    add(f"own_single_O4_{d}", "O4", [seg(300, 300)], 11, sg, noise=0.2, center="always")
    add(f"own_single_flick_O4_{d}", "O4", [seg(260, 130, "faststart")], 8, sg, noise=0.3, center="always")
# slow dt (touchpads at ~100Hz with scheduling hiccups)
add("hiccup_L5", "L5", [seg(300, 400)], 20, 1, noise=0.2, dt=14)
# vertical (workspace) traces: 4 desks, start on desk 1 and edge desks
for st in (1, 0, 3):
    for d, sg in (("down", 1), ("up", -1)):
        add(f"v_slow_small_s{st}_{d}", None, [seg(90, 600), hold(100)], 110, sg, noise=0.15, desks=(4, st), vertical=True, dt=10)
        add(f"v_slow_half_s{st}_{d}", None, [seg(170, 800, "linear"), hold(90)], 100, sg, noise=0.2, desks=(4, st), vertical=True)
        add(f"v_flick_s{st}_{d}", None, [seg(160, 110, "faststart")], 8, sg, noise=0.3, desks=(4, st), vertical=True, dt=7.5)
        add(f"v_long_s{st}_{d}", None, [seg(520, 600)], 10, sg, noise=0.3, desks=(4, st), vertical=True)
        add(f"v_hesitate_s{st}_{d}", None, [seg(100, 250), hold(300), seg(140, 220)], 12, sg, noise=0.2, desks=(4, st), vertical=True)
        add(f"v_reverse_s{st}_{d}", None, [seg(190, 260), seg(-150, 260)], 12, sg, noise=0.2, desks=(4, st), vertical=True)
        add(f"v_rubber_hold_s{st}_{d}", None, [seg(420, 500), hold(180)], 190, sg, noise=0.2, desks=(4, st), vertical=True)
add("v_drift_s1", None, [seg(180, 300, "minjerk", ytotal=0)], 10, 1, dy_frac=0.0, noise=0.2, desks=(4, 1), vertical=True)
print(len(os.listdir(OUT)), "traces")
