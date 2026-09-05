#!/usr/bin/env python3
"""Turn a niri config.kdl into Kiri's shortcuts and settings.

Usage: niri2kiri.py config.kdl [kglobalshortcutsrc]            print the [kiri] shortcut section
       niri2kiri.py config.kdl --settings                      print the [Script-kiri] settings section
       niri2kiri.py config.kdl [kglobalshortcutsrc] --apply    write both with kwriteconfig6

Kiri has to have run once, so its actions are already in kglobalshortcutsrc.
Settings apply live; shortcuts need a new login. Things Kiri can't do are listed on stderr.
"""
import colorsys
import json
import re
import subprocess
import sys
from pathlib import Path

ACTIONS = {
    "focus-column-left": "focus-left",
    "focus-column-right": "focus-right",
    "focus-window-up": "focus-up",
    "focus-window-down": "focus-down",
    "focus-window-or-workspace-up": "focus-up",
    "focus-window-or-workspace-down": "focus-down",
    "focus-column-first": "focus-start",
    "focus-column-last": "focus-end",
    "move-column-left": "column-move-left",
    "move-column-right": "column-move-right",
    "move-window-up": "window-move-up",
    "move-window-down": "window-move-down",
    "move-window-up-or-to-workspace-up": "window-move-up",
    "move-window-down-or-to-workspace-down": "window-move-down",
    "move-column-to-first": "column-move-start",
    "move-column-to-last": "column-move-end",
    "focus-workspace-down": "desktop-next",
    "focus-workspace-up": "desktop-previous",
    "move-column-to-workspace-down": "column-move-to-next-desktop",
    "move-column-to-workspace-up": "column-move-to-previous-desktop",
    "consume-or-expel-window-left": "window-move-left",
    "consume-or-expel-window-right": "window-move-right",
    "switch-preset-column-width": "cycle-preset-widths",
    "switch-preset-column-width-back": "cycle-preset-widths-reverse",
    "maximize-column": "column-width-maximize",
    "fullscreen-window": "window-toggle-fullscreen",
    "center-column": "grid-scroll-focused",
    "toggle-window-floating": "window-toggle-floating",
    "toggle-column-tabbed-display": "column-toggle-tabbed",
    "close-window": "window-close",
    "toggle-overview": "overview",
    "expand-column-to-available-width": "column-width-expand",
    "switch-preset-window-height": "window-height-cycle-presets",
    "switch-preset-window-height-back": "window-height-cycle-presets-reverse",
    "reset-window-height": "window-height-reset",
}
NUMBERED = {
    "focus-workspace": "desktop-{}",
    "move-column-to-workspace": "column-move-to-desktop-{}",
    "focus-column": "focus-{}",
}
MODIFIERS = {"mod": "Meta", "super": "Meta", "win": "Meta", "ctrl": "Ctrl", "control": "Ctrl", "shift": "Shift", "alt": "Alt"}
KEYS = {
    "page_down": "PgDown", "page_up": "PgUp", "next": "PgDown", "prior": "PgUp",
    "comma": ",", "period": ".", "slash": "/", "backslash": "\\", "minus": "-", "equal": "=", "plus": "+",
    "bracketleft": "[", "bracketright": "]", "semicolon": ";", "apostrophe": "'", "grave": "`",
    "return": "Return", "space": "Space", "tab": "Tab", "escape": "Esc", "backspace": "Backspace",
    "delete": "Del", "insert": "Ins", "home": "Home", "end": "End", "print": "Print",
    "left": "Left", "right": "Right", "up": "Up", "down": "Down",
}


def convert_key(niri_key):
    *mods, key = niri_key.split("+")
    out = []
    for mod in mods:
        if mod.lower() not in MODIFIERS:
            return None
        out.append(MODIFIERS[mod.lower()])
    if re.fullmatch(r"F\d{1,2}", key, re.I):
        key = key.upper()
    elif len(key) == 1:
        key = key.upper()
    elif key.lower() in KEYS:
        key = KEYS[key.lower()]
    else:
        return None  # mouse wheel, XF86 keys etc.
    order = ["Meta", "Ctrl", "Alt", "Shift"]
    return "+".join(sorted(set(out), key=order.index) + [key])



# ---- KDL parsing: a node is (name, args, props, children) ----

def tokenize(text):
    """Tokens: ("s", string) for words and quoted strings, ("q", string) for quoted ones, or one of { } ; = \\n /-"""
    toks, i, n = [], 0, len(text)
    while i < n:
        c = text[i]
        if text.startswith("//", i):
            i = text.find("\n", i)
            i = n if i < 0 else i
        elif text.startswith("/*", i):
            depth, i = 1, i + 2
            while i < n and depth:
                if text.startswith("/*", i): depth, i = depth + 1, i + 2
                elif text.startswith("*/", i): depth, i = depth - 1, i + 2
                else: i += 1
        elif text.startswith("/-", i):
            toks.append(("/-", "")); i += 2
        elif c == "\n":
            toks.append(("\n", "")); i += 1
        elif c.isspace():
            i += 1
        elif c == "\\" and text[i + 1:i + 2] in ("\n", "\r"):
            i = text.find("\n", i) + 1  # line continuation
        elif c in "{};=":
            toks.append((c, "")); i += 1
        elif c == "(":  # type annotation like (u8)
            i = text.find(")", i) + 1
        else:
            m = re.compile(r'r(#*)"').match(text, i)
            if m:
                end = text.find('"' + m.group(1), m.end())
                toks.append(("q", text[m.end():end])); i = end + 1 + len(m.group(1))
            elif c == '"':
                j, out = i + 1, ""
                while text[j] != '"':
                    if text[j] == "\\":
                        j += 1
                        out += {"n": "\n", "t": "\t"}.get(text[j], text[j])
                    else:
                        out += text[j]
                    j += 1
                toks.append(("q", out)); i = j + 1
            else:
                m = re.compile(r'[^\s{};="/\\]+(?:/(?!\*|/)[^\s{};="/\\]*)*').match(text, i)
                if not m:
                    i += 1
                    continue
                toks.append(("s", m.group())); i = m.end()
    return toks


def parse_nodes(toks, pos=0):
    nodes = []
    while pos < len(toks) and toks[pos][0] != "}":
        kind = toks[pos][0]
        if kind in "\n;":
            pos += 1
            continue
        skip = kind == "/-"
        pos += skip
        name, args, props, children = toks[pos][1], [], {}, []
        pos += 1
        skip_children = False
        while pos < len(toks) and toks[pos][0] not in ("\n", ";", "}"):
            kind = toks[pos][0]
            if kind == "/-":
                pos += 1
                if toks[pos][0] == "{":
                    _, pos = parse_nodes(toks, pos + 1); pos += 1
                elif pos + 1 < len(toks) and toks[pos + 1][0] == "=":
                    pos += 3
                else:
                    pos += 1
            elif kind == "{":
                children, pos = parse_nodes(toks, pos + 1)
                pos += 1
                break  # the node ends with its children
            elif pos + 1 < len(toks) and toks[pos + 1][0] == "=":
                props[toks[pos][1]] = toks[pos + 2][1]; pos += 3
            else:
                args.append(toks[pos][1]); pos += 1
        if not skip:
            nodes.append((name, args, props, children))
    return nodes, pos


def parse_kdl(path):
    path = Path(path).expanduser()
    nodes = []
    for node in parse_nodes(tokenize(path.read_text()))[0]:
        if node[0] == "include" and node[1]:
            included = (path.parent / Path(node[1][0]).expanduser())
            if included.exists():
                nodes += parse_kdl(included)
            else:
                print("# skipped: include", node[1][0], "(not found)", file=sys.stderr)
            continue
        nodes.append(node)
    return nodes


def find(nodes, name):
    return [n for n in nodes if n[0] == name]


def child(node, name):
    found = find(node[3], name) if node else []
    return found[-1] if found else None


# ---- shortcuts ----

def read_binds(path):
    binds, skipped = {}, []
    for blk in find(parse_kdl(path), "binds"):
        for key, _, _, cmds in blk[3]:
            if not cmds:
                continue
            name, args = cmds[0][0], cmds[0][1]
            if name in NUMBERED and args and args[0].isdigit():
                action = NUMBERED[name].format(args[0])
            elif name == "set-column-width" and args:
                action = "column-width-decrease" if args[0].startswith("-") else "column-width-increase"
            else:
                action = ACTIONS.get(name)
            kiri_key = convert_key(key)
            if action is None or kiri_key is None:
                skipped.append(f"{key} {' '.join([name] + args)}")
                continue
            binds.setdefault(action, []).append(kiri_key)
    return binds, skipped


def read_kiri_section(path):
    entries, inside = {}, False
    for line in Path(path).expanduser().read_text().splitlines():
        if line.startswith("["):
            inside = line.strip() == "[kiri]"
            continue
        if inside and "=" in line and not line.startswith("_k_"):
            name, value = line.split("=", 1)
            fields = re.split(r"(?<!\\),", value, maxsplit=2)
            if len(fields) == 3:
                entries[name] = (fields[1], fields[2])
    return entries


def shortcut_lines(config, shortcuts_file, warn):
    binds, skipped = read_binds(config)
    entries = read_kiri_section(shortcuts_file)
    if not entries:
        sys.exit(f"no [kiri] section in {shortcuts_file}, enable Kiri once first")
    out = {}
    for name in sorted(entries):
        default, description = entries[name]
        keys = "\\t".join(k.replace(",", "\\,") for k in binds.get(name, [])) or "none"
        out[name] = f"{keys},{default},{description}"
    for line in skipped + [f"{a} (not in this Kiri version)" for a in sorted(set(binds) - set(entries))]:
        warn("bind " + line)
    return out


# ---- settings ----

COLOR_NAMES = {
    "black": "#000000", "white": "#ffffff", "red": "#ff0000", "green": "#008000", "lime": "#00ff00",
    "blue": "#0000ff", "yellow": "#ffff00", "orange": "#ffa500", "purple": "#800080", "pink": "#ffc0cb",
    "cyan": "#00ffff", "magenta": "#ff00ff", "gray": "#808080", "grey": "#808080", "silver": "#c0c0c0",
    "brown": "#a52a2a", "transparent": "#000000",
}


def parse_color(value):
    v = value.strip().lower()
    if v in COLOR_NAMES:
        return COLOR_NAMES[v]
    m = re.fullmatch(r"#([0-9a-f]{3,8})", v)
    if m and len(m.group(1)) in (3, 4, 6, 8):
        h = m.group(1)
        if len(h) in (3, 4):
            h = "".join(c * 2 for c in h)
        return "#" + h[:6]
    m = re.fullmatch(r"(rgba?|hsla?)\((.*)\)", v)
    if m:
        nums = [float(x.rstrip("%")) for x in re.findall(r"[\d.]+%?", m.group(2))][:3]
        if len(nums) == 3:
            if m.group(1).startswith("rgb"):
                r, g, b = (x / 255 for x in nums)
            else:
                r, g, b = colorsys.hls_to_rgb(nums[0] / 360 % 1, nums[2] / 100, nums[1] / 100)
            return "#%02x%02x%02x" % tuple(round(x * 255) for x in (r, g, b))
    return None


def one_size(kind, args):
    """proportion 0.5 -> '50%', fixed 800 -> '800px'"""
    try:
        if kind == "proportion":
            return f"{float(args[0]) * 100:.3f}".rstrip("0").rstrip(".") + "%"
        if kind == "fixed":
            return f"{int(float(args[0]))}px"
    except (IndexError, ValueError):
        pass
    return None


def size(node):
    return next(filter(None, (one_size(n[0], n[1]) for n in node[3])), None) if node else None


def sizes(node):
    return ", ".join(filter(None, (one_size(n[0], n[1]) for n in node[3])))


def number(args):
    try:
        return int(float(args[0]))
    except (IndexError, ValueError):
        return None


def ring_settings(node, prefix, out, warn):
    if node is None:
        return
    if child(node, "off"):
        out[prefix + "Enabled"] = False
    elif child(node, "on"):
        out[prefix + "Enabled"] = True
    if child(node, "width") and number(child(node, "width")[1]) is not None:
        out[prefix + "Width"] = number(child(node, "width")[1])
    for state in ("active", "inactive"):
        c = child(node, state + "-color")
        grad = child(node, state + "-gradient")
        raw = c[1][0] if c and c[1] else grad[2].get("from") if grad else None
        if raw is None:
            continue
        color = parse_color(raw)
        if color:
            out[f"{prefix}{state.title()}Color"] = color
        else:
            warn(f"{prefix} {state} colour {raw!r} not understood")


def anchored(regex):
    """niri regexes match anywhere in the string; Kiri's match the whole string."""
    if regex.endswith("$") and not regex.endswith("\\$"):
        regex = regex[:-1]
    else:
        regex += ".*"
    return regex[1:] if regex.startswith("^") else ".*" + regex


def default_rules():
    """Kiri's built-in windowRules, so ours are added to them instead of replacing them."""
    src = Path(__file__).resolve().parent.parent / "src/lib/config/definition.ts"
    try:
        m = re.search(r"defaultWindowRules = `(.*?)`;", src.read_text(), re.S)
        return json.loads(m.group(1).replace("\\\\", "\\"))
    except (OSError, AttributeError, ValueError):
        return None


def window_rules(nodes, warn):
    rules = []
    for rule in find(nodes, "window-rule"):
        matches = find(rule[3], "match")
        floating = child(rule, "open-floating")
        floating = floating if floating and floating[1][:1] != ["false"] else None
        width = size(child(rule, "default-column-width"))
        if child(rule, "exclude") or find(rule[3], "exclude"):
            warn("window-rule 'exclude' lines ignored")
        if not matches or not (floating or width):
            continue
        for m in matches:
            props = m[2]
            entry = {"class": anchored(props["app-id"]) if "app-id" in props else None,
                     "caption": anchored(props["title"]) if "title" in props else None}
            entry = {k: v for k, v in entry.items() if v}
            if floating:
                entry["tile"] = False
            if width:
                entry["width"] = width
            rules.append(entry)
    return rules


def read_settings(path, warn):
    nodes = parse_kdl(path)
    out = {}
    layout = {}
    for blk in find(nodes, "layout"):
        layout.update({n[0]: n for n in blk[3]})
    L = lambda name: layout.get(name)

    if L("gaps") and number(L("gaps")[1]) is not None:
        gap = number(L("gaps")[1])
        out["gapsInnerHorizontal"] = out["gapsInnerVertical"] = gap
        struts = L("struts")
        for side in ("top", "bottom", "left", "right"):
            s = child(struts, side)
            out["gapsOuter" + side.title()] = gap + (number(s[1]) or 0 if s else 0)
    elif L("struts"):
        warn("struts without gaps ignored (Kiri's gaps default is 16, niri's too, so add 'gaps 16' to use them)")
    if L("center-focused-column"):
        mode = (L("center-focused-column")[1] or ["never"])[0]
        modes = {"never": "scrollingLazy", "always": "scrollingCentered", "on-overflow": "scrollingOnOverflow"}
        if mode in modes:
            for key in modes.values():
                out[key] = key == modes[mode]
            out["scrollingGrouped"] = False
    if L("always-center-single-column"):
        out["alwaysCenterSingleColumn"] = True
    if L("preset-column-widths") and sizes(L("preset-column-widths")):
        out["presetWidths"] = sizes(L("preset-column-widths"))
    if L("preset-window-heights") and sizes(L("preset-window-heights")):
        out["presetHeights"] = sizes(L("preset-window-heights"))
    if L("default-column-width") and size(L("default-column-width")):
        out["defaultColumnWidth"] = size(L("default-column-width"))
    if L("default-column-display"):
        out["tabbedColumnsByDefault"] = (L("default-column-display")[1] or [""])[0] == "tabbed"
    ring_settings(L("focus-ring"), "focusRing", out, warn)
    ring_settings(L("border"), "border", out, warn)

    tab = L("tab-indicator")
    if tab:
        if child(tab, "off"):
            out["tabIndicatorEnabled"] = False
        elif child(tab, "on"):
            out["tabIndicatorEnabled"] = True
        for niri, kiri in (("width", "tabIndicatorWidth"), ("gap", "tabIndicatorGap")):
            if child(tab, niri) and number(child(tab, niri)[1]) is not None:
                out[kiri] = number(child(tab, niri)[1])
        if child(tab, "length") and "total-proportion" in child(tab, "length")[2]:
            out["tabIndicatorLength"] = float(child(tab, "length")[2]["total-proportion"])
        if child(tab, "position") and child(tab, "position")[1]:
            out["tabIndicatorPosition"] = child(tab, "position")[1][0]
        if child(tab, "hide-when-single-tab"):
            out["tabIndicatorHideWhenSingleTab"] = True
        if any(child(tab, c) for c in ("active-color", "inactive-color", "active-gradient", "inactive-gradient", "place-within-column")):
            warn("tab-indicator colours and place-within-column (Kiri has no such options)")

    for blk in find(nodes, "input"):
        if child(blk, "warp-mouse-to-focus"):
            out["cursorFollowsFocus"] = True
    if find(nodes, "gestures"):
        warn("gestures block (Kiri has no matching options)")

    rules = window_rules(nodes, warn)
    if rules:
        base = default_rules()
        if base is None:
            warn("could not read Kiri's default windowRules, yours replace them")
        out["windowRules"] = json.dumps(rules + (base or []), separators=(",", ":"))
    return out


def fmt(value):
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value).replace("\\", "\\\\")


def kwrite(file, group, key, value):
    args = ["kwriteconfig6", "--file", file, "--group", group, "--key", key]
    if isinstance(value, bool):
        args += ["--type", "bool", str(value).lower()]
    else:
        args.append(str(value))
    subprocess.run(args, check=True)


def main():
    argv = sys.argv[1:]
    flags = {a for a in argv if a.startswith("--")}
    pos = [a for a in argv if not a.startswith("--")]
    if not 1 <= len(pos) <= 2 or flags - {"--settings", "--apply"}:
        sys.exit(__doc__.strip())
    shortcuts_file = pos[1] if len(pos) == 2 else "~/.config/kglobalshortcutsrc"
    warn = lambda msg: print("# skipped:", msg, file=sys.stderr)

    if "--settings" in flags or "--apply" in flags:
        settings = read_settings(pos[0], warn)
    if "--apply" in flags:
        shortcuts = shortcut_lines(pos[0], shortcuts_file, warn)
        print("kwinrc [Script-kiri]:")
        for key, value in settings.items():
            print(f"  {key}={fmt(value)}")
        print("kglobalshortcutsrc [kiri]:")
        for key, value in shortcuts.items():
            if not value.startswith("none,"):
                print(f"  {key}={value}")
        for key, value in settings.items():
            kwrite("kwinrc", "Script-kiri", key, value)
        for key, value in shortcuts.items():
            kwrite("kglobalshortcutsrc", "kiri", key, value)
        print("\nDone. Settings apply live; shortcuts need a new login.")
    elif "--settings" in flags:
        print("[Script-kiri]")
        for key, value in settings.items():
            print(f"{key}={fmt(value)}")
    else:
        print("[kiri]\n_k_friendly_name=Kiri")
        for key, value in shortcut_lines(pos[0], shortcuts_file, warn).items():
            print(f"{key}={value}")


if __name__ == "__main__":
    main()
