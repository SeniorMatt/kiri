#!/usr/bin/env python3
"""Kiri stress harness driver. Runs INSIDE the container against the nested KWin that start.sh started.

    start.sh stress.py [--list] [scenario ...]        (see run.sh for the host side)

Every scenario is a function s_<name>(h) that drives keys / pointer / windows and ends with h.check(tag). The checks are in
Harness.check: windows present, on the right desktop, not lost, focus visible, no leftover effect state, overview closed,
KWin alive, no errors in the log, and the screenshot shows each window where KWin says it is (every test window paints a
circle of its own colour at its centre).
"""
import subprocess, os, re, sys, time, json, random, signal, threading

ST = os.environ.get('ST', '/st')
XR = '/tmp/xdgst'
TMP = '/tmp/stwork'
LOG = ST + '/kwin.log'
env = dict(os.environ, XDG_RUNTIME_DIR=XR, HOME='/tmp/sthome', PATH=os.environ['PATH'] + ':' + ST)
env['WAYLAND_DISPLAY'] = subprocess.run(['sh', '-c', 'ls %s | grep -m1 "^wayland-[0-9]*$"' % XR], capture_output=True, text=True).stdout.strip()
os.makedirs(TMP, exist_ok=True)

codes = {}
for l in open('/usr/include/linux/input-event-codes.h'):
    m = re.match(r'#define\s+(KEY|BTN)_(\w+)\s+(0x[0-9a-f]+|\d+)', l)
    if m:
        codes[(m.group(1) + '_' + m.group(2)).lower()] = int(m.group(3), 0)
ALIAS = {'pgdown': 'pagedown', 'pgup': 'pageup', 'page_down': 'pagedown', 'page_up': 'pageup', '=': 'equal', '-': 'minus', ',': 'comma',
         '.': 'dot', '[': 'leftbrace', ']': 'rightbrace', 'return': 'enter', 'escape': 'esc', 'meta': 'leftmeta', 'ctrl': 'leftctrl',
         'shift': 'leftshift', 'alt': 'leftalt', 'space': 'space', 'tab': 'tab', '`': 'grave', '/': 'slash', ';': 'semicolon', "'": 'apostrophe',
         '\\': 'backslash', 'del': 'delete', 'ins': 'insert', 'backspace': 'backspace'}


def keycode(tok):
    t = tok.lower()
    t = ALIAS.get(t, t)
    return codes['key_' + t]


SHIFTED = {'_': 'minus', '+': 'equal', '{': 'leftbrace', '}': 'rightbrace', '<': 'comma', '>': 'dot', '?': 'slash', ':': 'semicolon',
           '"': 'apostrophe', '|': 'backslash', '~': 'grave', '!': '1', '@': '2', '#': '3', '$': '4', '%': '5', '^': '6', '&': '7', '*': '8',
           '(': '9', ')': '0'}


def combo_codes(combo):
    toks = re.split(r'\+(?=.)', combo) if combo != '+' else ['+']
    out = []
    shift = False
    for t in toks:
        if t in SHIFTED:
            shift = True
            out.append(codes['key_' + SHIFTED[t]])
        else:
            out.append(keycode(t))
    if shift and codes['key_leftshift'] not in out:
        out.insert(len(out) - 1, codes['key_leftshift'])
    return out


def now_ms():
    return int(time.time() * 1000)


def sh(cmd, **kw):
    kw.setdefault('env', env)
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


def qd(*a):
    return sh(['qdbus6'] + list(a)).stdout.strip()


class Inp:
    """The fake-input helper: lines go in, `t TAG` lines come back with the wall clock when they were executed."""

    def __init__(self):
        self.p = subprocess.Popen([ST + '/inp'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, env=env, text=True, bufsize=1)
        self.pos = [960, 540]
        self.times = {}
        self.n = 0

    def send(self, s):
        self.p.stdin.write(s + '\n')

    def flush(self):
        self.p.stdin.flush()

    def sleep(self, ms):
        self.send('s %d' % ms)

    def mark(self, tag):
        self.send('t ' + tag)

    def sync(self):
        """block until everything queued so far was executed; returns {tag: ms}"""
        self.n += 1
        tag = 'sync%d' % self.n
        self.mark(tag)
        self.flush()
        while True:
            l = self.p.stdout.readline()
            if not l:
                raise RuntimeError('inp died')
            m = re.match(r'T (\d+)\s+(\S+)', l)
            if m:
                self.times[m.group(2)] = int(m.group(1))
                if m.group(2) == tag:
                    return self.times

    def kd(self, c):
        self.send('k %d 1' % c)

    def ku(self, c):
        self.send('k %d 0' % c)

    def warp(self, x, y):
        self.send('m %d %d' % (x, y))
        self.pos[:] = [x, y]

    def close(self):
        try:
            self.send('q'); self.flush(); self.p.wait(3)
        except Exception:
            self.p.kill()


class Win:
    count = 0

    def __init__(self, name):
        self.name = name
        Win.count += 1
        hue = (Win.count * 47) % 360
        import colorsys
        r, g, b = colorsys.hsv_to_rgb(hue / 360.0, 0.95, 1.0)
        self.rgb = (int(r * 255), int(g * 255), int(b * 255))
        self.color = '#%02x%02x%02x' % self.rgb
        self.proc = None
        self.desktop = None   # expected desktop (1-based) when known
        self.closed = False
        self.floating = None  # expected floating state when known

    def start(self):
        self.proc = subprocess.Popen(['qml6', ST + '/win.qml', self.color, self.name], env=dict(env, QT_QPA_PLATFORM='wayland'),
                                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    def kill(self):
        self.closed = True
        if self.proc and self.proc.poll() is None:
            self.proc.terminate()


class Harness:
    def __init__(self):
        self.inp = Inp()
        self.logpos = 0
        self.wins = {}
        self.fails = []
        self.lag = []
        self.keys = {}
        self.floating_known = False
        self.visual = True
        self.vis_pending = None
        self.vis_other_desktop = True
        self.cmdseq = 0
        self.t_scenario = 0
        self.ft = []          # (ts, worst, o16, o33, o100)
        self.geo = []         # (ts, caption)
        self.dump = None
        self.dumpts = 0
        self.reader_pos = 0
        self.load_keys()
        self.tail()
        self.res = (1920, 1080)

    # ---------------------------------------------------------------- log
    def tail(self):
        try:
            with open(LOG, 'rb') as f:
                f.seek(self.reader_pos)
                raw = f.read()
            cut = raw.rfind(b'\n') + 1  # a half-written last line waits for the next call
            self.reader_pos += cut
            data = raw[:cut].decode('utf-8', errors='replace')
        except FileNotFoundError:
            return []
        lines = data.split('\n')
        out = []
        for l in lines:
            if 'STINV ' in l:
                try:
                    j = json.loads(l[l.index('STINV ') + 6:])
                    self.dump = j
                    self.dumpts = j.get('t', now_ms())
                except Exception:
                    pass
            elif 'STSAME ' in l:
                try:
                    self.dumpts = int(l.split('STSAME ')[1].split()[0])
                except Exception:
                    pass
            elif 'STFT ' in l:
                m = re.search(r'STFT (\d+) ticks=(\d+) worst=(\d+) o16=(\d+) o33=(\d+) o100=(\d+)', l)
                if m:
                    self.ft.append(tuple(int(x) for x in m.groups()))
            elif 'STGEO ' in l:
                m = re.search(r'STGEO (\d+) (.*) (-?\d+),(-?\d+) (\d+)x(\d+)$', l)
                if m:
                    self.geo.append((int(m.group(1)), m.group(2), int(m.group(3)), int(m.group(4)), int(m.group(5)), int(m.group(6))))
            elif 'STCMD' in l:
                out.append(l)
            else:
                out.append(l)
        self.loglines = out
        return out

    ERR = re.compile(r'(TypeError|ReferenceError|RangeError|SyntaxError|Uncaught|is not a function|Cannot read|undefined is not|'
                     r'Segmentation|SIGSEGV|SIGABRT|Kiri: Error|Kiri:.*\bat .*main\.js|\.stack|Binding loop|STCMDERR|crash|'
                     r'TRACE other-desktop window painted: .* running=false|Qt Quick.*(error|fail)|file:///.*(Error|error)|Failed to|failed to run|unhandled)', re.I)
    IGNORE = re.compile(r'(Failed to (open|create).*(wayland-|xcb)|bad file descriptor|QFileSystemWatcher|failed to open drm|libEGL|MESA|'
                        r'kwin_scripting: .*?The ts|Failed to connect to kglobalaccel|XDG_SESSION|ksplash|powerdevil|qt\.qpa|'
                        r'Failed to create wl_display|Falling back|libinput|org\.kde\.kactivities|ui_hot_corner|wl_|Gamma)', re.I)

    def errors_since(self):
        lines = self.tail()
        return [l for l in lines if self.ERR.search(l) and not self.IGNORE.search(l)][:15]

    # ---------------------------------------------------------------- setup
    def load_keys(self):
        rc = HOME_RC = '/tmp/sthome/.config/kglobalshortcutsrc'
        sec = None
        try:
            for l in open(rc):
                l = l.strip()
                m = re.match(r'\[(.*)\]', l)
                if m:
                    sec = m.group(1)
                    continue
                if sec == 'kiri' and '=' in l:
                    k, v = l.split('=', 1)
                    cur = re.split(r'\\t|\t', re.split(r'(?<!\\\\),', v)[0])[0].replace('\\\\,', ',')
                    if cur and cur != 'none':
                        self.keys[k] = cur
        except FileNotFoundError:
            pass

    def combo(self, name_or_combo):
        return self.keys.get(name_or_combo, name_or_combo)

    # ---------------------------------------------------------------- keys
    def tap(self, c, gap=0):
        """press and release one combo (a name from the shortcut list or 'Meta+O')"""
        cs = combo_codes(self.combo(c))
        for x in cs:
            self.inp.kd(x)
            self.inp.sleep(2)
        for x in reversed(cs):
            self.inp.ku(x)
            self.inp.sleep(2)
        if gap:
            self.inp.sleep(gap)

    def spam(self, seq, n, gap, hold=True, tag=None):
        """n rounds of the combos in `seq`, `gap` ms between keys. hold: modifiers stay down across the whole spam (a held
        Meta with the other key tapped), like a user mashing; otherwise every key is a full chord. Returns the exec times
        of the key presses (ms)."""
        seq = [seq] if isinstance(seq, str) else seq
        vis = None
        if self.visual:
            dur = len(seq) * n * (gap + 6) + 1800
            nfr = int(max(12, min(70, dur / 1000.0 * 14)))
            vis = self.vis_start(nfr)
            time.sleep(0.1)
        mods_down = []
        t0 = tag or 'k'
        i = 0
        if hold:
            all_mods = set()
            for s in seq:
                cs = combo_codes(self.combo(s))
                all_mods.update(cs[:-1])
            all_mods = sorted(all_mods)
            # modifiers common to all combos stay held
            common = None
            for s in seq:
                cs = set(combo_codes(self.combo(s))[:-1])
                common = cs if common is None else common & cs
            mods_down = sorted(common or [])
            for x in mods_down:
                self.inp.kd(x); self.inp.sleep(2)
        for r in range(n):
            for s in seq:
                cs = combo_codes(self.combo(s))
                self.inp.mark('%s%d' % (t0, i)); i += 1
                extra = [x for x in cs[:-1] if x not in mods_down]
                for x in extra:
                    self.inp.kd(x); self.inp.sleep(1)
                self.inp.kd(cs[-1]); self.inp.sleep(1); self.inp.ku(cs[-1])
                for x in reversed(extra):
                    self.inp.ku(x)
                self.inp.sleep(gap)
        for x in reversed(mods_down):
            self.inp.ku(x); self.inp.sleep(2)
        t = self.inp.sync()
        times = [t['%s%d' % (t0, j)] for j in range(i)]
        if vis:
            self.vis_finish(vis, times[0] if times else now_ms(), times[-1] if times else now_ms())
        return times

    def human(self, seq, n, gap=350):
        return self.spam(seq, n, gap, hold=False)

    # ---------------------------------------------------------------- windows
    def cmd(self, js, wait=3.0):
        """run JS inside KWin (the probe script's command channel); waits for its done marker"""
        self.cmdseq += 1
        i = self.cmdseq
        p = TMP + '/cmd.js'
        open(p + '.tmp', 'w').write('//%d\n' % i + js + '\nconsole.log("STCMD %d done");\n' % i)
        os.replace(p + '.tmp', p)
        t0 = time.time()
        while time.time() - t0 < wait:
            lines = self.tail()
            if any(('STCMD %d done' % i) in l for l in lines):
                return True
            time.sleep(0.03)
        self.fail('cmd', 'command channel did not answer: ' + js[:60])
        return False

    def launch(self, name=None, desktop=None):
        name = name or 'w%d' % (len(self.wins) + 1)
        w = Win(name)
        w.desktop = desktop
        self.wins[name] = w
        w.start()
        return w

    def launch_n(self, n, prefix='w', gap=0.4, wait=True):
        ws = []
        base = len(self.wins)
        for i in range(n):
            ws.append(self.launch('%s%d' % (prefix, base + i + 1), desktop=self.cur_desktop()))
            time.sleep(gap)
        if wait:
            self.wait_windows([w.name for w in ws])
        return ws

    def wait_windows(self, names, timeout=40):
        t0 = time.time()
        while time.time() - t0 < timeout:
            d = self.fresh()
            have = {w['cap'] for w in d['win']}
            if all(n in have for n in names):
                return True
            time.sleep(0.4)
        self.fail('launch', 'windows never appeared: %s' % [n for n in names if n not in have])
        return False

    def kill_all(self):
        for w in self.wins.values():
            w.kill()
        t0 = time.time()
        while time.time() - t0 < 15:
            d = self.fresh()
            if not [x for x in d['win'] if x['normal']]:
                break
            time.sleep(0.5)
        self.wins = {}
        Win.count = Win.count

    def cur_desktop(self):
        d = self.fresh()
        return d['cur']

    # ---------------------------------------------------------------- state
    def fresh(self, timeout=4.0):
        """the newest dump from the probe (it prints one every 500 ms)"""
        t0 = now_ms()
        end = time.time() + timeout
        while time.time() < end:
            self.tail()
            if self.dump is not None and self.dumpts >= t0 - 50 and self.dump:
                return self.dump
            time.sleep(0.05)
        return self.dump or {'win': [], 'cur': 1, 'nd': 3, 'area': [0, 0, 1920, 1080], 'stack': []}

    def active_effects(self):
        r = qd('org.kde.KWin', '/Effects', 'org.kde.kwin.Effects.activeEffects')
        return [x for x in r.split('\n') if x]

    BUSY = ('kiri_overview', 'kiri_desktop_switch', 'kiri_swipe')

    def settle(self, timeout=8.0, quiet=0.35, overview_ok=False):
        """wait until no Kiri effect is active and no window geometry changed for `quiet` seconds; returns seconds waited
        or None (and records a failure) when it never settles"""
        t0 = time.time()
        calm_since = None
        last = 0
        while time.time() - t0 < timeout:
            self.tail()
            g = self.geo[-1][0] if self.geo else 0
            ae = self.active_effects()
            busy = [e for e in ae if e in self.BUSY and not (overview_ok and e == 'kiri_overview')]
            if g != last or busy:
                last = g
                calm_since = None
            elif calm_since is None:
                calm_since = time.time()
            elif time.time() - calm_since >= quiet:
                return time.time() - t0
            time.sleep(0.1)
        self.fail('settle', 'never settled in %.0fs, active: %s' % (timeout, [e for e in self.active_effects() if e in self.BUSY]))
        return None

    def fail(self, tag, msg):
        self.fails.append((self.cur_scn, tag, msg))
        print('  FAIL [%s] %s' % (tag, msg), flush=True)

    def alive(self):
        try:
            pid = int(open(ST + '/kwin.pid').read())
            os.kill(pid, 0)
        except Exception:
            return False
        return bool(qd('org.kde.KWin', '/KWin', 'org.kde.KWin.currentDesktop'))

    def screenshot(self):
        p = TMP + '/s.raw'
        r = sh([ST + '/shot', p], timeout=20, env=dict(env, QT_QPA_PLATFORM='wayland'))
        if r.returncode != 0:
            return None
        f = open(p, 'rb')
        w, h = [int(x) for x in f.readline().split()]
        data = f.read()
        return w, h, data

    @staticmethod
    def pix(shot, x, y):
        w, h, d = shot
        x = max(0, min(w - 1, int(x)))
        y = max(0, min(h - 1, int(y)))
        o = (y * w + x) * 4
        return d[o + 2], d[o + 1], d[o]

    def check(self, tag, expect_overview=False, screen=True, overlap=True, settle=True, expect_desktop=None, extra=None):
        """run every invariant; returns the list of problems found (also recorded in self.fails)"""
        n0 = len(self.fails)
        if settle:
            self.settle(overview_ok=expect_overview)
        if not self.alive():
            self.fail(tag, 'KWIN IS DEAD')
            return self.fails[n0:]
        if not kiri_loaded():
            self.fail(tag, 'the Kiri script is not loaded')
        d = self.fresh()
        wins = d['win']
        ours = {w['cap']: w for w in wins if w['cap'] in self.wins}
        cnt = {}
        for w in wins:
            cnt[w['cap']] = cnt.get(w['cap'], 0) + 1
        nd = d['nd']
        for name, w in self.wins.items():
            if w.closed:
                if name in cnt:
                    self.fail(tag, 'closed window %s still exists' % name)
                continue
            if name not in ours:
                self.fail(tag, 'window %s is missing' % name)
                continue
            x = ours[name]
            if cnt[name] > 1:
                self.fail(tag, 'window %s exists %d times' % (name, cnt[name]))
            if x['min']:
                self.fail(tag, '%s is minimized' % name)
            if abs(x['op'] - 1) > 0.01:
                self.fail(tag, '%s keeps opacity %.2f' % (name, x['op']))
            if len(x['dk']) != 1 or not (1 <= x['dk'][0] <= nd):
                self.fail(tag, '%s on desktops %s (of %d)' % (name, x['dk'], nd))
            elif w.desktop is not None and w.desktop <= nd and x['dk'][0] != w.desktop:
                self.fail(tag, '%s on desktop %d, expected %d' % (name, x['dk'][0], w.desktop))
            if not (x['w'] >= 30 and x['h'] >= 30) or abs(x['x']) > 400000 or abs(x['y']) > 20000:
                self.fail(tag, '%s has a lost geometry %s,%s %sx%s' % (name, x['x'], x['y'], x['w'], x['h']))
        # tiled windows must not partly overlap
        dumped = [False]

        def dump_windows():
            if dumped[0]:
                return
            dumped[0] = True
            print('  DUMP cur=%s nd=%s' % (d['cur'], d['nd']), flush=True)
            for w in sorted(wins, key=lambda w: (w['dk'], w['x'])):
                print('     %-6s %5d,%5d %4dx%4d act=%d dk=%s fs=%d op=%.2f min=%d' % (w['cap'], w['x'], w['y'], w['w'], w['h'], w['act'], w['dk'], w['fs'], w['op'], w['min']), flush=True)
        if overlap:
            by = {}
            for name, x in ours.items():
                if self.wins[name].floating or x['fs'] or x['dk'] != [d['cur']]:
                    continue
                by.setdefault(x['dk'][0], []).append(x)
            for dk, L in by.items():
                for i in range(len(L)):
                    for j in range(i + 1, len(L)):
                        a, b = L[i], L[j]
                        ox = min(a['x'] + a['w'], b['x'] + b['w']) - max(a['x'], b['x'])
                        oy = min(a['y'] + a['h'], b['y'] + b['h']) - max(a['y'], b['y'])
                        if ox > 6 and oy > 6:
                            same = abs(a['x'] - b['x']) < 3 and abs(a['w'] - b['w']) < 3 and abs(a['y'] - b['y']) < 3 and abs(a['h'] - b['h']) < 3
                            if not same and not self.floating_known:
                                dump_windows()
                                self.fail(tag, 'tiled %s and %s overlap on desktop %d by %dx%d' % (a['cap'], b['cap'], dk, ox, oy))
        # focused window visible and on the current desktop
        act = [w for w in wins if w['act']]
        cur = d['cur']
        if act:
            a = act[0]
            if a['cap'] in self.wins and not self.wins[a['cap']].closed:
                if len(a['dk']) == 1 and a['dk'][0] != cur:
                    self.fail(tag, 'active window %s is on desktop %s, current is %d' % (a['cap'], a['dk'], cur))
                vis_w = min(a['x'] + a['w'], self.res[0]) - max(a['x'], 0)
                vis_h = min(a['y'] + a['h'], self.res[1]) - max(a['y'], 0)
                if vis_w < min(200, a['w'] * 0.5) or vis_h < min(200, a['h'] * 0.5):
                    self.fail(tag, 'focused %s not visible: %d,%d %dx%d' % (a['cap'], a['x'], a['y'], a['w'], a['h']))
        else:
            if any(not w.closed for w in self.wins.values() if w.desktop in (None, cur)) and any(x['dk'] == [cur] for x in ours.values()):
                self.fail(tag, 'no active window although the desktop has windows')
        if expect_desktop is not None and cur != expect_desktop:
            self.fail(tag, 'current desktop %d, expected %d' % (cur, expect_desktop))
        ae = self.active_effects()
        if not expect_overview and 'kiri_overview' in ae:
            self.fail(tag, 'overview effect still active: %s' % ae)
        # the screen shows what KWin reports
        if screen and not expect_overview:
            shot = self.screenshot()
            if shot is None:
                self.fail(tag, 'screenshot failed')
            else:
                stack = d['stack']
                bad = []
                for name, x in ours.items():
                    if x['dk'] != [cur] or x['min']:
                        continue
                    cx, cy = x['x'] + x['w'] / 2, x['y'] + x['h'] / 2
                    if not (20 < cx < self.res[0] - 20 and 20 < cy < self.res[1] - 20):
                        continue
                    # covered by a window higher up the stack?
                    covered = False
                    try:
                        si = stack.index(x['id'])
                    except ValueError:
                        si = -1
                    for o in wins:
                        if o['id'] == x['id'] or o['min'] or not (o['dk'] == [cur] or o['dk'] == []):
                            continue
                        if not (o['normal'] or o['dock'] or o['special']):
                            continue
                        try:
                            oi = stack.index(o['id'])
                        except ValueError:
                            oi = -1
                        if oi > si and o['x'] <= cx <= o['x'] + o['w'] and o['y'] <= cy <= o['y'] + o['h']:
                            covered = True
                    if covered:
                        continue
                    best = None
                    # the circle is 160px wide; sample the centre and the 4 points 40px off
                    ok = 0
                    for dx, dy in ((0, 0), (-40, 0), (40, 0), (0, -40), (0, 40)):
                        r, g, b = self.pix(shot, cx + dx, cy + dy)
                        R, G, B = self.wins[name].rgb
                        if abs(r - R) + abs(g - G) + abs(b - B) < 150:
                            ok += 1
                    if ok < 3:
                        r, g, b = self.pix(shot, cx, cy)
                        bad.append('%s at %d,%d paints (%d,%d,%d) not %s' % (name, cx, cy, r, g, b, self.wins[name].rgb))
                if bad:
                    print('  DUMP cur=%s stack=%s' % (cur, [x for x in stack]), flush=True)
                    for w in sorted(wins, key=lambda w: w['x']):
                        print('     %-6s %5d,%5d %4dx%4d act=%d dk=%s fs=%d op=%.2f min=%d id=%s' % (w['cap'], w['x'], w['y'], w['w'], w['h'], w['act'], w['dk'], w['fs'], w['op'], w['min'], w['id'][:6]), flush=True)
                for b in bad[:6]:
                    self.fail(tag, 'screen mismatch: ' + b)
                if len(bad) > 6:
                    self.fail(tag, '... and %d more screen mismatches' % (len(bad) - 6))
        if self.vis_pending:
            self.vis_check(tag, d, ours)
        errs = self.errors_since()
        for e in errs[:6]:
            self.fail(tag, 'log: ' + e[:200])
        if extra:
            extra(self, d)
        return self.fails[n0:]

    # ---------------------------------------------------------------- reset
    def reset(self):
        if not kiri_loaded():
            print('  (Kiri was not loaded; loading it)', flush=True)
            load_kiri()
            time.sleep(3)
        self.inp.warp(960, 540)
        self.tap('Escape')
        self.inp.flush()
        self.kill_all()
        self.cmd('while (workspace.desktops.length > %d) workspace.removeDesktop(workspace.desktops[workspace.desktops.length-1]); '
                 'while (workspace.desktops.length < %d) workspace.createDesktop(workspace.desktops.length, "d"); '
                 'workspace.currentDesktop = workspace.desktops[0];' % (3, 3))
        self.settle(4)
        self.floating_known = False
        self.visual = True
        self.vis_pending = None
        self.vis_other_desktop = True
        self.tail()
        self.ft.clear()
        self.geo.clear()

    # ---------------------------------------------------------------- measurements
    def lag_first_geo(self, t_key, window=1500):
        """ms from a key press to the first geometry change that follows it (None: nothing moved)"""
        self.tail()
        c = [g[0] for g in self.geo if t_key - 20 <= g[0] <= t_key + window]
        return (min(c) - t_key) if c else None

    def lag_settle(self, t_key, window=3000):
        self.tail()
        c = [g[0] for g in self.geo if t_key - 20 <= g[0] <= t_key + window]
        return (max(c) - t_key) if c else None

    def ftstats(self, since_ms):
        r = [f for f in self.ft if f[0] >= since_ms]
        if not r:
            return None
        return dict(worst=max(f[2] for f in r), o16=sum(f[3] for f in r), o33=sum(f[4] for f in r), o100=sum(f[5] for f in r), n=len(r))


    # ---------------------------------------------------------------- visual pass
    def vis_start(self, n):
        prefix = TMP + '/vf'
        p = subprocess.Popen([ST + '/shot', prefix, str(n)], env=dict(env, QT_QPA_PLATFORM='wayland', SHOT_DOWN='2'), stdout=subprocess.PIPE, text=True)
        return (p, prefix, n)

    def vis_finish(self, vis, t_first, t_last):
        p, prefix, n = vis
        out = p.communicate()[0]
        ts = {}
        for l in out.split('\n'):
            if l.strip():
                k, t = l.split()
                ts[int(k)] = int(t)
        frames = [(ts[k], '%s.%d.raw' % (prefix, k)) for k in sorted(ts)]
        self.vis_pending = (frames, t_first, t_last)

    def vis_check(self, tag, d, ours):
        """compare the frames captured around the last burst with what the layout says; see the module docstring"""
        if not self.vis_pending:
            return
        frames, t_first, t_last = self.vis_pending
        self.vis_pending = None
        if len(frames) < 2:
            return
        span = (frames[-1][0] - frames[0][0]) / 1000.0
        fps = (len(frames) - 1) / span if span > 0 else 0
        cur = d['cur']
        settled = [f for f in frames if f[0] >= t_last + 1300]
        # who must be on screen when settled: current-desktop windows whose centre nothing covers
        stack = d['stack']
        must, other = [], []
        for name, x in ours.items():
            wob = self.wins[name]
            if x['dk'] != [cur]:
                other.append(wob)
                continue
            if x['min']:
                continue
            cx, cy = x['x'] + x['w'] / 2, x['y'] + x['h'] / 2
            if not (20 < cx < self.res[0] - 20 and 20 < cy < self.res[1] - 20):
                continue
            si = stack.index(x['id']) if x['id'] in stack else -1
            cov = any(o['id'] != x['id'] and not o['min'] and o['dk'] in ([cur], []) and (o['normal'] or o['dock']) and
                      (stack.index(o['id']) if o['id'] in stack else -1) > si and
                      o['x'] <= cx <= o['x'] + o['w'] and o['y'] <= cy <= o['y'] + o['h'] for o in d['win'])
            if not cov:
                must.append((wob, cx, cy))
        problems = []
        saved = []
        prev_presence = None
        base = None
        n_black = 0
        for idx, (t, path) in enumerate(frames):
            try:
                shot = read_raw(path)
            except Exception:
                continue
            w, h, data = shot
            sc = w / 1920.0
            # black / empty frame: nothing but the black wallpaper and the panel
            lit = 0
            for yy in range(0, h, 12):
                for xx in range(40, w, 12):
                    o = (yy * w + xx) * 4
                    if data[o] + data[o + 1] + data[o + 2] > 40:
                        lit += 1
            if lit == 0 and must and self.vis_other_desktop:
                n_black += 1
                problems.append(('black', t, 'frame %d is empty (black) although %d windows should show' % (idx, len(must))))
                saved.append((idx, 'black'))
            is_settled = t >= t_last + 1300
            if is_settled:
                presence = []
                for wob, cx, cy in must:
                    ok = 0
                    for dx, dy in ((0, 0), (-40, 0), (40, 0), (0, -40), (0, 40)):
                        xx, yy = int((cx + dx) * sc), int((cy + dy) * sc)
                        o = (min(h - 1, yy) * w + min(w - 1, xx)) * 4
                        R, G, B = wob.rgb
                        if abs(data[o + 2] - R) + abs(data[o + 1] - G) + abs(data[o] - B) < 150:
                            ok += 1
                    presence.append(ok >= 3)
                if prev_presence is not None and presence != prev_presence:
                    problems.append(('flicker', t, 'window set on screen changed between settled frames %d and %d: %s -> %s' % (
                        idx - 1, idx, [(m[0].name) for m, a in zip(must, prev_presence) if not a], [(m[0].name) for m, a in zip(must, presence) if not a])))
                    saved.append((idx, 'flicker'))
                if presence and not all(presence) and prev_presence is None:
                    miss = [m[0].name for m, a in zip(must, presence) if not a]
                    problems.append(('missing', t, 'settled frame %d lacks (or shows translucent/misplaced) %s' % (idx, miss)))
                    saved.append((idx, 'missing'))
                prev_presence = presence
                if self.vis_other_desktop:
                    for wob in other:
                        c, bb = find_color(shot, wob.rgb, tol=40, step=6)
                        if c > 3:
                            problems.append(('other-desktop', t, 'settled frame %d shows %s of another desktop (%d px at %s)' % (idx, wob.name, c, bb)))
                            saved.append((idx, 'other-desktop'))
                # stability against the first settled frame
                grid = bytes(data[((yy * w) + xx) * 4 + k] for yy in range(2, h, 20) for xx in range(2, w, 20) for k in (0, 1, 2))
                if base is None:
                    base = grid
                else:
                    diff = sum(1 for a, b in zip(grid, base) if abs(a - b) > 24) / len(grid)
                    if diff > 0.01:
                        problems.append(('unstable', t, 'settled frame %d differs from the first settled frame in %.1f%% of samples' % (idx, diff * 100)))
                        saved.append((idx, 'unstable'))
        print('  VIS %-30s %d frames in %.1fs = %.0f fps, %d settled, %d problems' % (tag, len(frames), span, fps, len(settled), len(problems)), flush=True)
        self.lag.append(('fps:' + tag, round(fps, 1), 0, 0))
        seen = set()
        for kind, t, msg in problems:
            if kind in seen:
                continue
            seen.add(kind)
            self.fail(tag, 'visual %s: %s' % (kind, msg))
        os.makedirs(TMP + '/bugs', exist_ok=True)
        done = set()
        for idx, kind in saved:
            if kind in done:
                continue
            done.add(kind)
            try:
                save_png(read_raw(frames[idx][1]), TMP + '/bugs/%s_%s_%s_f%d.png' % (self.cur_scn, re.sub(r'\W+', '_', tag), kind, idx), down=1)
                if idx > 0:
                    save_png(read_raw(frames[idx - 1][1]), TMP + '/bugs/%s_%s_%s_f%d_prev.png' % (self.cur_scn, re.sub(r'\W+', '_', tag), kind, idx - 1), down=1)
            except Exception:
                pass
        for t, path in frames:
            try:
                os.unlink(path)
            except OSError:
                pass


# ======================================================================================================================
# scenarios
# ======================================================================================================================
SCN = {}


def scn(f):
    SCN[f.__name__[2:]] = f
    return f


def log_lag(h, label, vals):
    vals = [v for v in vals if v is not None]
    if vals:
        vals.sort()
        print('  LAG %-34s n=%d min=%d med=%d max=%d ms' % (label, len(vals), vals[0], vals[len(vals) // 2], vals[-1]), flush=True)
        h.lag.append((label, vals[0], vals[len(vals) // 2], vals[-1]))


def with_ft(h, label, f):
    t0 = now_ms()
    r = f()
    time.sleep(0.7)
    h.tail()
    s = h.ftstats(t0)
    if s:
        print('  FT  %-34s worst=%dms >16ms:%d >33ms:%d >100ms:%d (%d reports)' % (label, s['worst'], s['o16'], s['o33'], s['o100'], s['n']), flush=True)
        h.lag.append(('ft:' + label, s['worst'], s['o16'], s['o33']))
    return r


def read_raw(path):
    f = open(path, 'rb')
    w, h = [int(x) for x in f.readline().split()]
    return w, h, f.read()


def find_color(shot, rgb, tol=60, step=6):
    """count sampled pixels near `rgb` and their bounding box (None when none)"""
    w, h, d = shot
    R, G, B = rgb
    n = 0
    x0 = y0 = 10 ** 9
    x1 = y1 = -1
    for y in range(0, h, step):
        row = y * w * 4
        for x in range(0, w, step):
            o = row + x * 4
            if abs(d[o + 2] - R) + abs(d[o + 1] - G) + abs(d[o] - B) < tol:
                n += 1
                x0 = min(x0, x); y0 = min(y0, y); x1 = max(x1, x); y1 = max(y1, y)
    return (n, (x0, y0, x1, y1)) if n else (0, None)


def save_png(shot, path, down=2):
    """write a raw BGRA shot as an RGB PNG (downscaled by `down`) with zlib only"""
    import zlib, struct
    w, h, d = shot
    ow, oh = w // down, h // down
    rows = []
    for y in range(oh):
        row = bytearray([0])
        base = y * down * w * 4
        for x in range(ow):
            o = base + x * down * 4
            row += bytes((d[o + 2], d[o + 1], d[o]))
        rows.append(bytes(row))
    raw = b''.join(rows)

    def chunk(t, b):
        c = struct.pack('>I', len(b)) + t + b
        return c + struct.pack('>I', zlib.crc32(t + b) & 0xffffffff)
    open(path, 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', ow, oh, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 6)) + chunk(b'IEND', b''))


def shot_loop(n, prefix):
    """start a background loop of n screenshots (about 13 per second); returns the process"""
    return subprocess.Popen([ST + '/shot', prefix, str(n)], env=dict(env, QT_QPA_PLATFORM='wayland'), stdout=subprocess.PIPE, text=True)


def collect_shots(p, prefix, n):
    out = p.communicate()[0]
    ts = {}
    for l in out.split('\n'):
        if l.strip():
            k, t = l.split()
            ts[int(k)] = int(t)
    return [(ts.get(k), '%s.%d.raw' % (prefix, k)) for k in range(n) if k in ts]


@scn
def s_ovleak(h):
    """OWNER BUG: desktop 1 empty, desktop 2 has one window, stand on desktop 1, spam Meta+O ~1 s, stop: a window of desktop 2
    flickers on desktop 1. Screenshots in a tight loop after the spam; the window's colour must not show while the overview
    is closed (and, with the overview open, must not show on desktop 1's row)."""
    h.visual = False
    h.cmd('workspace.currentDesktop = workspace.desktops[1];')
    h.settle(4)
    w = h.launch('w1', desktop=2)
    h.wait_windows(['w1'])
    h.settle(4)
    h.cmd('workspace.currentDesktop = workspace.desktops[0];')
    h.settle(4)
    rgb = w.rgb
    h.check('setup', expect_desktop=1)
    variants = [(5, 'tap', 100), (10, 'tap', 50), (20, 'tap', 25), (35, 'tap', 29), (50, 'tap', 20)]
    cases = []
    for gap, kind, n in variants:
        for cnt in (n, n + 1):
            cases.append((gap, cnt))
    if os.environ.get('OVCASES'):
        cases = [tuple(int(v) for v in c.split(':')) for c in os.environ['OVCASES'].split(',')]
    for gap, cnt in cases:
        N = 45
        prefix = TMP + '/ovl'
        p = shot_loop(N, prefix)
        time.sleep(0.15)
        ts = h.spam('overview', cnt, gap, hold=True)
        t_end = ts[-1]
        info = collect_shots(p, prefix, N)
        bad = []
        for t, path in info:
            c, bb = find_color(read_raw(path), rgb)
            if c > 3 and t is not None and t >= ts[0]:
                bad.append((t - t_end, c, bb))
        final_open = 'kiri_overview' in h.active_effects()
        print('  gap=%dms presses=%d (%s at the end, overview effect active=%s): %d of %d shots show desktop 2\'s window' % (
            gap, cnt, 'odd' if cnt % 2 else 'even', final_open, len(bad), len(info)), flush=True)
        for b in bad[:6]:
            print('     t_end%+dms: %d pixels, bbox %s' % b, flush=True)
        os.makedirs(TMP + '/bugs', exist_ok=True)
        tag = os.environ.get('SAVETAG', 'run')
        for t, path in info:
            if t is None:
                continue
            isbad = any(b[0] == t - t_end for b in bad)
            if isbad:
                save_png(read_raw(path), TMP + '/bugs/ovleak_%s_g%d_n%d_t%+d_BAD.png' % (tag, gap, cnt, t - t_end))
        if info and os.environ.get('SAVEREF'):
            t, path = min([i for i in info if i[0]], key=lambda i: abs(i[0] - t_end - 340))
            save_png(read_raw(path), TMP + '/bugs/ovleak_%s_g%d_n%d_ref_t%+d.png' % (tag, gap, cnt, t - t_end))
        if bad and not (final_open and cnt % 2):
            h.fail('ovleak', 'gap=%d presses=%d: desktop 2 window painted on desktop 1 in %d shots' % (gap, cnt, len(bad)))
        # close it again if it ended open
        if 'kiri_overview' in h.active_effects():
            h.tap('overview'); h.inp.flush(); time.sleep(1.2)
        h.settle(4)
        h.check('after gap=%d n=%d' % (gap, cnt), screen=False)
        for t, path in info:
            try: os.unlink(path)
            except OSError: pass
        h.tap('Escape'); h.inp.flush(); time.sleep(0.3)



def goto(h, n):
    h.cmd('workspace.currentDesktop = workspace.desktops[%d];' % (n - 1))
    h.settle(4)


def populate(h, per_desktop):
    """per_desktop: list of window counts for desktops 1..N; leaves desktop 1 current"""
    for i, c in enumerate(per_desktop):
        goto(h, i + 1)
        h.launch_n(c, prefix='d%dw' % (i + 1))
        h.settle(5)
    goto(h, 1)


def finish_overview(h):
    """close the overview if the burst left it open, and say whether it was open"""
    h.settle(5, overview_ok=True)
    was = 'kiri_overview' in h.active_effects()
    if was:
        h.tap('overview'); h.inp.flush(); time.sleep(1.2)
        h.settle(5)
    return was


@scn
def s_ov_spam(h):
    """Meta+O spam alone, at 5/10/20 ms and at human speed, odd and even counts"""
    h.launch_n(8)
    h.settle(5)
    h.check('8 windows')
    for gap in (5, 10, 20):
        for cnt in (31, 40):
            ts = with_ft(h, 'Meta+O x%d @%dms' % (cnt, gap), lambda: h.spam('overview', cnt, gap, hold=True))
            was = finish_overview(h)
            h.check('ov x%d @%d (was %s)' % (cnt, gap, 'open' if was else 'closed'))
    # human speed: the parity must decide
    for cnt in (4, 5):
        h.human('overview', cnt, 450)
        time.sleep(1.5)
        open_ = 'kiri_overview' in h.active_effects()
        if open_ != bool(cnt % 2):
            h.fail('parity', 'human-speed Meta+O x%d left the overview %s' % (cnt, 'open' if open_ else 'closed'))
        finish_overview(h)
        h.check('human x%d' % cnt)


@scn
def s_ov_mixed(h):
    """Meta+O mixed with Meta+1/2/3 and desktop up/down, windows on all desktops"""
    populate(h, [3, 2, 1])
    h.check('populated')
    rnd = random.Random(7)
    seq = ['overview', 'Meta+1', 'Meta+2', 'Meta+3', 'desktop-next', 'desktop-previous']
    h.vis_other_desktop = False
    for gap in (5, 12, 25):
        for rep in range(3):
            keys = [rnd.choice(seq) for _ in range(24)]
            h.spam(keys, 1, gap, hold=False)
            finish_overview(h)
            h.check('mixed @%dms #%d' % (gap, rep))


@scn
def s_desk_spam(h):
    """desktop switching spam, also across the overview's open and close and desktop slides"""
    populate(h, [2, 2, 2])
    h.vis_other_desktop = False
    for gap in (5, 15, 40):
        h.spam(['desktop-next'], 20, gap, hold=False)
        h.spam(['desktop-previous'], 20, gap, hold=False)
        h.check('next/prev @%d' % gap)
    # switch while the overview opens and closes
    for gap in (10, 30):
        h.spam(['overview', 'desktop-next', 'overview', 'desktop-previous'], 6, gap, hold=False)
        finish_overview(h)
        h.check('overview+desktops @%d' % gap)
    # the overview closing while a slide runs
    h.tap('overview'); h.inp.sleep(500); h.tap('desktop-next'); h.tap('overview'); h.inp.flush()
    time.sleep(0.5)
    finish_overview(h)
    h.check('overview closed mid-slide')


@scn
def s_focus_spam(h):
    """focus left/right spam with 24 windows, then single presses for the lag"""
    h.launch_n(24, gap=0.25)
    h.settle(8)
    h.check('24 windows')
    for gap in (5, 20):
        with_ft(h, 'focus spam @%dms' % gap, lambda: h.spam(['focus-left'], 40, gap, hold=False))
        h.spam(['focus-right'], 60, gap, hold=False)
        h.check('focus @%d' % gap)
    # lag: one key at a time
    lags = []
    for i in range(8):
        h.tail()
        ts = h.spam(['focus-left' if i % 2 else 'focus-right'], 1, 0, hold=False)
        time.sleep(1.0)
        lags.append(h.lag_first_geo(ts[0]))
        if i == 0:
            print('  (geometry events seen so far: %d)' % len(h.geo), flush=True)
    log_lag(h, 'focus key -> first geometry change', lags)
    h.check('after lag probes')


@scn
def s_size_spam(h):
    """width / height steps past their limits, presets"""
    h.launch_n(6)
    h.settle(5)
    for gap in (5, 20):
        for name in ('column-width-increase', 'column-width-decrease', 'window-height-increase', 'window-height-decrease',
                     'cycle-preset-widths', 'column-width-maximize', 'column-width-expand', 'window-height-cycle-presets'):
            h.spam([name], 30, gap, hold=False)
        h.check('size spam @%d' % gap)
    h.spam(['column-width-increase'], 60, 5, hold=False)
    h.check('width to the limit')
    h.spam(['column-width-decrease'], 80, 5, hold=False)
    h.check('width to the minimum')


@scn
def s_column_ops(h):
    """consume / expel / move column / tabbed toggles, seeded random mix"""
    h.launch_n(10)
    h.settle(6)
    ops = ['window-consume-or-expel-left', 'window-consume-or-expel-right', 'window-consume-into-column', 'window-expel-from-column',
           'column-move-left', 'column-move-right', 'column-toggle-tabbed', 'window-move-up', 'window-move-down', 'focus-left', 'focus-right',
           'column-move-start', 'column-move-end', 'focus-up', 'focus-down']
    rnd = random.Random(11)
    for gap in (5, 15, 60):
        for rep in range(3):
            keys = [rnd.choice(ops) for _ in range(40)]
            with_ft(h, 'column ops @%d' % gap, lambda: h.spam(keys, 1, gap, hold=False))
            h.check('column ops @%d #%d' % (gap, rep))


@scn
def s_fullscreen(h):
    """full-screen / maximize / windowed-full-screen toggles, with and without animations in flight"""
    h.launch_n(5)
    h.settle(5)
    for gap in (5, 30, 150):
        h.spam(['window-toggle-fullscreen'], 11, gap, hold=False)
        h.check('fullscreen x11 @%d' % gap)
        h.spam(['window-maximize-to-edges'], 11, gap, hold=False)
        h.check('maximize x11 @%d' % gap)
        h.spam(['window-toggle-windowed-fullscreen'], 11, gap, hold=False)
        h.check('windowed-fs x11 @%d' % gap)
        h.spam(['window-toggle-fullscreen', 'focus-left', 'window-maximize-to-edges', 'focus-right', 'window-toggle-windowed-fullscreen',
                'column-width-increase', 'window-toggle-fullscreen', 'window-maximize-to-edges'], 4, gap, hold=False)
        h.check('mixed @%d' % gap)
    # the app itself toggles full-screen every 40 ms
    h.cmd('const w = workspace.activeWindow; repeat(40, 30, i => { w.fullScreen = (i % 2 === 0); });')
    time.sleep(2.5)
    h.check('app full-screen toggling', overlap=False)


@scn
def s_open_close(h):
    """30 windows at once, closing them at once, during animations and during the overview"""
    ws = h.launch_n(30, gap=0.05, wait=False)
    h.wait_windows([w.name for w in ws], timeout=90)
    h.check('30 windows opened at once')
    h.spam(['focus-left'], 30, 10, hold=False)
    # close ten of them while focus keys run and the overview opens
    h.visual = False
    for w in ws[:10]:
        w.kill()
    h.spam(['focus-right', 'overview'], 5, 12, hold=False)
    time.sleep(1.0)
    finish_overview(h)
    h.check('10 closed during animations')
    h.tap('overview'); h.inp.sleep(900)
    for w in ws[10:20]:
        w.kill()
    h.inp.flush()
    time.sleep(2.5)
    finish_overview(h)
    h.check('10 closed during the overview')
    # open more while closing the rest
    more = h.launch_n(8, prefix='n', gap=0.02, wait=False)
    for w in ws[20:]:
        w.kill()
    h.wait_windows([w.name for w in more], timeout=60)
    h.check('opened 8 while closing 10')


@scn
def s_floating(h):
    """floating toggles"""
    ws = h.launch_n(6)
    h.settle(5)
    h.floating_known = True
    for gap in (5, 20, 100):
        h.spam(['window-toggle-floating'], 12, gap, hold=False)
        h.check('floating x12 @%d' % gap)
        h.spam(['window-toggle-floating', 'focus-left', 'window-toggle-floating', 'window-switch-focus-floating-tiling'], 8, gap, hold=False)
        h.check('floating mix @%d' % gap)


@scn
def s_hotcorner(h):
    """pointer to 0,0 and away, mixed with Meta+O"""
    h.launch_n(5)
    h.settle(5)
    for gap in (10, 40):
        i = h.inp
        t0 = now_ms()
        for k in range(16):
            i.warp(0, 0); i.sleep(gap); i.warp(900, 500); i.sleep(gap)
            if k % 3 == 0:
                i.kd(codes['key_leftmeta']); i.kd(codes['key_o']); i.ku(codes['key_o']); i.ku(codes['key_leftmeta'])
        i.sync()
        h.check_after = None
        finish_overview(h)
        h.check('hot corner @%d' % gap)


@scn
def s_settings(h):
    """change Kiri settings (gaps, widths, animations, focus follows mouse, centering) in the middle of key spam"""
    h.launch_n(8)
    h.settle(5)
    stop = threading.Event()
    changes = [('gapsInnerHorizontal', '8'), ('gapsInnerHorizontal', '24'), ('gapsInnerVertical', '2'), ('gapsOuterLeft', '30'), ('gapsOuterLeft', '4'),
               ('gapsOuterTop', '20'), ('gapsOuterTop', '0'), ('focusFollowsMouse', 'true'), ('focusFollowsMouse', 'false'),
               ('cursorFollowsFocus', 'true'), ('cursorFollowsFocus', 'false'), ('scrollingCentered', 'true'), ('scrollingCentered', 'false'),
               ('scrollingLazy', 'true'), ('scrollingOnOverflow', 'true'), ('scrollingGrouped', 'true'), ('alwaysCenterSingleColumn', 'true'),
               ('borderEnabled', 'false'), ('borderEnabled', 'true'), ('borderWidth', '6'), ('borderWidth', '2'), ('focusRingEnabled', 'false'),
               ('focusRingEnabled', 'true'), ('cornerRadius', '12'), ('cornerRadius', '0'), ('columnWidthStep', '0.1'), ('defaultColumnWidth', '0.33'),
               ('defaultColumnWidth', '0.7'), ('hotCorner', 'false'), ('hotCorner', 'true'), ('tabbedColumnsByDefault', 'true'),
               ('tabbedColumnsByDefault', 'false'), ('dynamicDesktops', 'true'), ('dynamicDesktops', 'false'), ('offScreenOpacity', '0.5'),
               ('hideTitlebars', 'true'), ('hideTitlebars', 'false')]

    def churn():
        rnd = random.Random(3)
        while not stop.is_set():
            k, v = rnd.choice(changes)
            sh(['kwriteconfig6', '--file', 'kwinrc', '--group', 'Script-kiri', '--key', k, v])
            if rnd.random() < 0.5:
                qd('org.kde.KWin', '/KWin', 'reconfigure')
            time.sleep(rnd.random() * 0.4)
    t = threading.Thread(target=churn)
    t.start()
    try:
        for gap in (8, 30):
            h.spam(['focus-left', 'column-width-increase', 'focus-right', 'column-width-decrease', 'overview', 'overview', 'window-consume-or-expel-left'], 8, gap, hold=False)
            finish_overview(h)
    finally:
        stop.set(); t.join()
    time.sleep(1.5)
    h.check('after settings churn')


@scn
def s_mode_switch(h):
    """kiri-mode plasma / kiri while keys spam and animations run"""
    h.launch_n(6)
    h.settle(5)
    for i in range(3):
        h.spam(['focus-left', 'column-width-increase', 'overview', 'overview'], 4, 15, hold=False)
        r = sh([ST + '/kiri-mode', 'plasma', '--no-osd'], timeout=60)
        h.spam(['focus-left', 'focus-right'], 4, 15, hold=False)
        time.sleep(2)
        r2 = sh([ST + '/kiri-mode', 'kiri', '--no-osd'], timeout=60)
        time.sleep(3)
        h.vis_pending = None  # the frames predate the mode change
        h.check('mode round %d' % i, overlap=False)
    h.check('back in kiri mode')


def kiri_loaded():
    return qd('org.kde.KWin', '/Scripting', 'org.kde.kwin.Scripting.isScriptLoaded', 'kiri') == 'true'


def load_kiri():
    qd('org.kde.KWin', '/Scripting', 'org.kde.kwin.Scripting.loadDeclarativeScript', '/tmp/sthome/.local/share/kwin/scripts/kiri/contents/ui/main.qml', 'kiri')
    qd('org.kde.KWin', '/Scripting', 'org.kde.kwin.Scripting.start')


@scn
def s_reload(h):
    """unload and load the script again (savedState), with windows and under key spam"""
    h.launch_n(6)
    h.settle(5)
    for i in range(3):
        qd('org.kde.KWin', '/Scripting', 'org.kde.kwin.Scripting.unloadScript', 'kiri')
        h.spam(['focus-left'], 3, 20, hold=False)
        load_kiri()
        time.sleep(3)
        h.spam(['focus-right', 'column-width-increase'], 4, 20, hold=False)
        h.vis_pending = None
        h.check('reload %d' % i, overlap=False)


@scn
def s_desktops_dyn(h):
    """add and remove desktops while windows animate"""
    populate(h, [2, 2, 2])
    h.vis_other_desktop = False
    for w in h.wins.values():
        w.desktop = None
    rnd = random.Random(5)
    for rep in range(6):
        h.cmd('workspace.createDesktop(workspace.desktops.length, "x"); workspace.createDesktop(workspace.desktops.length, "y");')
        h.spam(['column-width-increase', 'focus-left', 'overview', 'overview', 'desktop-next'], 3, 12, hold=False)
        h.cmd('if (workspace.desktops.length > 3) workspace.removeDesktop(workspace.desktops[workspace.desktops.length-1]);')
        h.spam(['desktop-previous', 'focus-right'], 4, 12, hold=False)
        h.cmd('if (workspace.desktops.length > 3) workspace.removeDesktop(workspace.desktops[1]);')
        finish_overview(h)
        h.check('desktops add/remove #%d' % rep)
    h.cmd('while (workspace.desktops.length > 3) workspace.removeDesktop(workspace.desktops[workspace.desktops.length-1]);')
    h.check('back to 3 desktops')


def frame_lit(shot):
    w, h, data = shot
    lit = 0
    for yy in range(0, h, 12):
        for xx in range(40, w, 12):
            o = (yy * w + xx) * 4
            if data[o] + data[o + 1] + data[o + 2] > 40:
                lit += 1
    return lit


@scn
def s_deskadd(h):
    """OBSERVED: the screen goes black right after desktops are added or removed. Timeline of frames after each change."""
    h.visual = False
    h.launch_n(3)
    h.settle(5)
    for what, js in (('create 1', 'workspace.createDesktop(workspace.desktops.length, "x");'),
                     ('create 2', 'workspace.createDesktop(workspace.desktops.length, "y");'),
                     ('remove last', 'workspace.removeDesktop(workspace.desktops[workspace.desktops.length-1]);'),
                     ('remove last', 'workspace.removeDesktop(workspace.desktops[workspace.desktops.length-1]);')):
        p = subprocess.Popen([ST + '/shot', TMP + '/da', '30'], env=dict(env, QT_QPA_PLATFORM='wayland', SHOT_DOWN='4'), stdout=subprocess.PIPE, text=True)
        time.sleep(0.15)
        t0 = now_ms()
        h.cmd(js)
        out = p.communicate()[0]
        line = []
        for l in out.split('\n'):
            if l.strip():
                k, t = l.split()
                lit = frame_lit(read_raw('%s.%d.raw' % (TMP + '/da', int(k))))
                line.append('%+d:%s' % (int(t) - t0, 'ok' if lit else 'BLACK'))
        print('  %-12s nd=%d  %s' % (what, h.fresh()['nd'], ' '.join(line)), flush=True)
        if any('BLACK' in x for x in line):
            h.fail('deskadd', '%s: black frames: %s' % (what, [x for x in line if 'BLACK' in x][:8]))
        for k in range(30):
            try: os.unlink('%s.%d.raw' % (TMP + '/da', k))
            except OSError: pass
        h.settle(4)
    h.check('after add/remove')


@scn
def s_deskrm(h):
    """windows of a removed desktop move to another desktop (KWin) and must be laid out there with the rest"""
    h.visual = False
    populate(h, [2, 2, 2])
    for w in h.wins.values():
        w.desktop = None
    h.check('before')
    for what, js in (('remove desktop 2', 'workspace.removeDesktop(workspace.desktops[1]);'),
                     ('remove last', 'workspace.removeDesktop(workspace.desktops[workspace.desktops.length-1]);')):
        h.cmd(js)
        time.sleep(1.0)
        h.check(what)
    h.cmd('workspace.createDesktop(workspace.desktops.length, "x");')
    h.settle(4)
    h.tap('desktop-next'); h.inp.flush(); h.settle(4)
    h.check('after create + next')


@scn
def s_backdrop(h):
    """a full-screen window next to normal columns: focus the neighbour (it and its colour must show, not a black backdrop
    over it) and toggle full-screen in and out with frames captured (PNGs in TMP/bugs/backdrop_*)"""
    h.visual = False
    ws = h.launch_n(3)
    h.settle(5)
    os.makedirs(TMP + '/bugs', exist_ok=True)
    h.spam(['window-toggle-fullscreen'], 1, 100, hold=False)
    h.settle(5)
    save_png(h.screenshot(), TMP + '/bugs/backdrop_1_fullscreen.png', down=2)
    h.spam(['focus-left'], 1, 100, hold=False)
    time.sleep(1.5)
    shot = h.screenshot()
    save_png(shot, TMP + '/bugs/backdrop_2_neighbour_focused.png', down=2)
    n, box = find_color(shot, ws[1].rgb)
    if n < 200:
        h.fail('backdrop', 'neighbour %s is not visible next to the full-screen window (%d px)' % (ws[1].name, n))
    for rep in range(2):
        nfr = 30
        p = subprocess.Popen([ST + '/shot', TMP + '/bd', str(nfr)], env=dict(env, QT_QPA_PLATFORM='wayland', SHOT_DOWN='4'), stdout=subprocess.PIPE, text=True)
        time.sleep(0.15)
        h.spam(['window-toggle-fullscreen'], 1, 100, hold=False)
        time.sleep(0.5)
        h.spam(['window-toggle-fullscreen'], 1, 100, hold=False)
        out = p.communicate()[0]
        for l in out.split('\n'):
            if l.strip():
                k = int(l.split()[0])
                fr = read_raw('%s.%d.raw' % (TMP + '/bd', k))
                if k % 4 == 0:
                    save_png(fr, TMP + '/bugs/backdrop_3_toggle%d_f%d.png' % (rep, k), down=1)
                os.unlink('%s.%d.raw' % (TMP + '/bd', k))
        h.settle(5)
    h.check('end')


@scn
def s_fsblack(h):
    """OBSERVED: an empty (black) frame in the middle of full-screen / maximize / focus toggling at 150 ms. Frame timeline plus the
    geometry changes around it."""
    h.visual = False
    h.launch_n(5)
    h.settle(5)
    ops = ['window-toggle-fullscreen', 'focus-left', 'window-maximize-to-edges', 'focus-right', 'window-toggle-windowed-fullscreen',
           'column-width-increase', 'window-toggle-fullscreen', 'window-maximize-to-edges']
    nblack = 0
    for rep in range(6):
        nfr = 70
        p = subprocess.Popen([ST + '/shot', TMP + '/fb', str(nfr)], env=dict(env, QT_QPA_PLATFORM='wayland', SHOT_DOWN='4'), stdout=subprocess.PIPE, text=True)
        time.sleep(0.15)
        h.tail(); h.geo.clear()
        ts = h.spam(ops, 3, 150, hold=False)
        out = p.communicate()[0]
        h.tail()
        fr = []
        for l in out.split('\n'):
            if l.strip():
                k, t = l.split()
                fr.append((int(t), int(k)))
        line = []
        for t, k in fr:
            lit = frame_lit(read_raw('%s.%d.raw' % (TMP + '/fb', k)))
            line.append((t, k, lit))
        blacks = [x for x in line if x[2] == 0]
        print('  rep %d: %d frames, %d black %s' % (rep, len(line), len(blacks), [(x[1], x[0] - ts[0]) for x in blacks][:6]), flush=True)
        for t, k, lit in blacks[:2]:
            nblack += 1
            for g in h.geo:
                if t - 250 <= g[0] <= t + 60:
                    print('       geo %+5dms %s %d,%d %dx%d' % (g[0] - t, g[1], g[2], g[3], g[4], g[5]), flush=True)
            os.makedirs(TMP + '/bugs', exist_ok=True)
            for kk in (k - 1, k, k + 1):
                if 0 <= kk < nfr:
                    try: save_png(read_raw('%s.%d.raw' % (TMP + '/fb', kk)), TMP + '/bugs/fsblack_r%d_f%d%s.png' % (rep, kk, '_BLACK' if kk == k else ''), down=1)
                    except Exception: pass
        for k in range(nfr):
            try: os.unlink('%s.%d.raw' % (TMP + '/fb', k))
            except OSError: pass
        h.settle(5)
    if nblack:
        h.fail('fsblack', '%d empty frames while toggling full-screen/maximize with 5 windows' % nblack)
    h.check('end')


@scn
def s_lag(h):
    """single-key lag: key press -> first geometry change of any window -> last one (layout settled), with 3 and 24 windows"""
    h.visual = False
    for count in (3, 24):
        for w in list(h.wins.values()):
            w.kill()
        h.kill_all()
        h.launch_n(count, prefix='L%d_' % count, gap=0.2)
        h.settle(8)
        h.spam(['focus-start'], 1, 0, hold=False)
        time.sleep(1.5)
        for name in ('focus-right', 'focus-left', 'column-width-increase', 'column-width-decrease', 'window-toggle-fullscreen', 'window-toggle-fullscreen',
                     'overview', 'overview', 'desktop-next', 'desktop-previous'):
            h.tail()
            ts = h.spam([name], 1, 0, hold=False, tag='lag')
            time.sleep(1.6)
            h.tail()
            ev = [g[0] - ts[0] for g in h.geo if ts[0] - 20 <= g[0] <= ts[0] + 1500]
            ae = h.active_effects()
            print('  LAG %2d windows %-26s first geometry change: %s ms, last: %s ms (%d events)' % (
                count, name, min(ev) if ev else '-', max(ev) if ev else '-', len(ev)), flush=True)
            if ev:
                h.lag.append(('%d win %s' % (count, name), min(ev), max(ev), len(ev)))
            h.settle(5, overview_ok=True)
            if 'kiri_overview' in h.active_effects():
                h.tap('overview'); h.inp.flush(); time.sleep(1.2)
    h.check('end')


def sim(method, *a):
    return qd('org.kde.KWin', '/KiriGestureSim', 'org.kde.kwin.KWin.GestureSim.' + method, *[str(x) for x in a])


@scn
def s_swipe(h):
    """touchpad swipes simulated by the test-only kiri_gesturesim effect (3 and 4 fingers, all directions, slow and flicks), alone and
    over key spam"""
    populate(h, [3, 2, 2])
    h.vis_other_desktop = False
    for w in h.wins.values():
        w.desktop = None
    rnd = random.Random(9)
    dirs = [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, 0.3)]
    for rep in range(18):
        f = rnd.choice((3, 4))
        dx, dy = rnd.choice(dirs)
        n = rnd.choice((4, 12, 30))
        step = rnd.choice((4.0, 15.0, 40.0))
        ms = rnd.choice((8, 16, 33))
        hold = rnd.choice((0, 60, 300))
        sim('swipePath', f, ';'.join('%g,%g' % (dx * step, dy * step) for _ in range(n)), ms, hold)
        if rep % 3 == 2:
            h.spam(['focus-left', 'column-width-increase', 'overview', 'focus-right'], 3, 15, hold=False)
        time.sleep(n * ms / 1000.0 + hold / 1000.0 + 0.9)
        if rep % 6 == 5:
            finish_overview(h)
            h.vis_pending = None
            h.check('swipes up to #%d' % rep)
    finish_overview(h)
    h.vis_pending = None
    h.check('after swipes')

@scn
def s_smoke(h):
    h.launch_n(4)
    h.settle()
    h.check('4 windows')
    h.tap('focus-left'); h.inp.flush(); h.settle()
    h.check('focus-left')
    h.tap('overview'); h.inp.sleep(900); h.inp.flush(); time.sleep(1.5)
    h.check('overview open', expect_overview=True, screen=False)
    h.tap('overview'); h.inp.flush()
    h.check('overview closed')


def main():
    args = sys.argv[1:]
    h = Harness()
    h.cur_scn = 'init'
    names = [a for a in args if not a.startswith('-') and not a.endswith('.py')]
    if '--list' in args:
        print(' '.join(SCN)); return 0
    names = names or list(SCN)
    # wait for the probe
    for _ in range(40):
        h.tail()
        if h.dump is not None:
            break
        time.sleep(0.5)
    else:
        print('probe never reported; kwin.log tail:')
        print(open(LOG, errors='replace').read()[-2000:])
        return 2
    h.cmd('1', wait=15)
    h.fails.clear()
    h.load_keys()
    print('keys loaded: %d  overview=%s' % (len(h.keys), h.keys.get('overview')), flush=True)
    time.sleep(2)
    h.cur_scn = 'init'
    rc = 0
    for n in names:
        if n not in SCN:
            print('no scenario', n); continue
        h.cur_scn = n
        print('=== %s' % n, flush=True)
        t0 = time.time()
        n0 = len(h.fails)
        try:
            h.reset()
            SCN[n](h)
        except Exception as e:
            import traceback; traceback.print_exc()
            h.fail('exception', repr(e))
        nf = len(h.fails) - n0
        print('--- %s: %s (%d problems, %.0fs)' % (n, 'PASS' if nf == 0 else 'FAIL', nf, time.time() - t0), flush=True)
        if nf:
            rc = 1
        if not h.alive():
            print('KWin died; stopping'); break
    h.kill_all()
    h.inp.close()
    json.dump({'fails': h.fails, 'lag': h.lag}, open(TMP + '/result.json', 'w'))
    print('RESULT', 'FAIL' if rc else 'PASS')
    return rc


if __name__ == '__main__':
    sys.exit(main())
