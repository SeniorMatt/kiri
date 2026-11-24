#!/usr/bin/env python3
"""Odd and mutated niri configs through tools/niri2kiri.py: it must never raise and never produce non-finite numbers.
   niri_fuzz.py [config.kdl ...]      (the TS importer has the same cases in src/tests/units/niri/NiriImportOdd.ts)"""
import importlib.util, math, os, random, sys, tempfile, traceback
here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('niri2kiri', os.path.join(here, '..', 'niri2kiri.py'))
n2k = importlib.util.module_from_spec(spec); spec.loader.exec_module(n2k)

odd = ["", " ", "{", "}", "a {", "a }", "\"unterminated", "#\"raw", "/*", "/-", "binds {", "binds { Mod+ { } }", "binds { \"\" { focus-column-left; } }",
       "binds { Mod+H { } }", "binds { Mod+H }", "binds { Mod+Nonsense+H { focus-column-left; } }", "layout { gaps -5 }", "layout { gaps \"x\" }",
       "layout { gaps 1e999 }", "layout { gaps nan }", "layout { gaps 99999999999999999999 }", "layout { gaps }", "layout { preset-column-widths { proportion } }",
       "layout { preset-column-widths { proportion 0 proportion -1 proportion 1e9 fixed 0 fixed -3 } }", "layout { default-column-width { proportion 0 } }",
       "layout { focus-ring { width 99999 active-color \"#zzz\" inactive-color \"rgb(1,2)\" } }", "layout { focus-ring { active-color \"hsl(400 200% 300%)\" } border { width -1 } }",
       "window-rule { match app-id=\"(\" ; open-floating true }", "window-rule { }", "window-rule { match; exclude; geometry-corner-radius -1 }",
       "window-rule { geometry-corner-radius 1e99 }", "output \"X\" { scale 0 mode \"0x0@0\" }", "animations { off slowdown 0 }",
       "input { touchpad { accel-speed 1e999 } keyboard { repeat-delay -1 repeat-rate 0 xkb { layout \"\" } } }", "input { touchpad { tap; natural-scroll; accel-profile \"x\" } }",
       "\ufeffbinds {}", "\u0000\u0001\u0002", "a 0x10 0o7 0b101 1_000 1.5e3", "x" * 100000, "{" * 3000 + "}" * 3000, "binds {" + " Mod+H { focus-column-left; }" * 3000 + "}",
       "binds { Mod+Return { spawn \"a\" \"b\"; } Mod+E { spawn-sh \"x | y\"; } Mod+X { spawn; } }"]

import time
def check_file(path, label):
    t0 = time.time()
    msgs = []
    warn = msgs.append
    for name, fn in (('read_settings', lambda: n2k.read_settings(path, warn)), ('read_binds', lambda: n2k.read_binds(path)),
                     ('read_spawns', lambda: n2k.read_spawns(path, warn)), ('read_input', lambda: n2k.read_input(path, warn))):
        try:
            r = fn()
        except Exception:
            print('RAISED', name, label); traceback.print_exc(limit=3); return 1
        if name == 'read_settings':
            for k, v in r.items():
                if isinstance(v, float) and not math.isfinite(v):
                    print('NONFINITE', label, k, v); return 1
                if isinstance(v, int) and not isinstance(v, bool) and abs(v) > 100000:
                    print('HUGE', label, k, v); return 1
    if time.time() - t0 > 2:
        print('SLOW %.1fs' % (time.time() - t0), label)
    return 0

bad = 0
rnd = random.Random(1)
srcs = [open(a).read() for a in sys.argv[1:]]
with tempfile.TemporaryDirectory() as d:
    p = os.path.join(d, 'c.kdl')
    def run(text, label):
        global bad
        open(p, 'w').write(text)
        bad += check_file(p, label)
    for i, t in enumerate(odd):
        run(t, 'odd #%d' % i)
    for si, src in enumerate(srcs):
        run(src, 'source %d' % si)
        for n in range(300):
            a = rnd.randrange(len(src) + 1); b = min(len(src), a + rnd.randrange(200)); k = rnd.randrange(5)
            t = src[:a] if k == 0 else src[:a] + src[b:] if k == 1 else src[:b] + src[a:b] + src[b:] if k == 2 else src[:a] + rnd.choice('{}"\\/*#;()=') + src[a:]
            if k == 4:
                import re
                t = re.sub(r'\d+', lambda m: str(rnd.randrange(10**12) - 5 * 10**11) if rnd.random() < 0.3 else m.group(0), src)
            run(t, 'mutation %d/%d of source %d' % (n, k, si))
print('niri2kiri fuzz:', 'FAIL (%d)' % bad if bad else 'ok')
sys.exit(1 if bad else 0)
