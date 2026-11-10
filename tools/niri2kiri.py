#!/usr/bin/env python3
"""Turn a niri config.kdl into Kiri's shortcuts and settings.

Usage: niri2kiri.py config.kdl [kglobalshortcutsrc]            print the [kiri] shortcut section
       niri2kiri.py config.kdl --settings                      print the [Script-kiri] settings section
       niri2kiri.py config.kdl [kglobalshortcutsrc] --apply    write both with kwriteconfig6
       niri2kiri.py config.kdl --apply                         also makes Plasma command shortcuts of the spawn / spawn-sh binds
                                                               (~/.local/share/applications/kiri-bind-*.desktop with X-KDE-Shortcuts);
                                                               --no-spawn leaves them out, --remove-spawn removes them again and stops
       niri2kiri.py config.kdl --input [--apply]               the niri `input` block for Plasma: show (or, with --apply, write)
                                                               touchpad natural-scroll/tap/accel-profile (kcminputrc), key repeat
                                                               (kcminputrc) and xkb layouts/options (kxkbrc). Only with --input.

With --apply the keys go into Kiri's own key fields (kwinrc [Script-kiri], key1_<action> and key2_<action>), which a
running Kiri picks up like its other settings: no new login needed. Without --apply the [kiri] section for
kglobalshortcutsrc is printed (Kiri has to have run once for that). Things Kiri can't do are listed on stderr.
"""
import colorsys
import json
import os
import re
import shlex
import subprocess
import sys
from pathlib import Path

ACTIONS = {
    "focus-column-left": "focus-left",
    "focus-column-right": "focus-right",
    "focus-window-up": "focus-up",
    "focus-window-down": "focus-down",
    "focus-column-first": "focus-start",
    "focus-column-last": "focus-end",
    "move-column-left": "column-move-left",
    "move-column-right": "column-move-right",
    "move-window-up": "window-move-up",
    "move-window-down": "window-move-down",
    "move-column-to-first": "column-move-start",
    "move-column-to-last": "column-move-end",
    "focus-workspace-down": "desktop-next",
    "focus-workspace-up": "desktop-previous",
    "move-column-to-workspace-down": "column-move-to-next-desktop",
    "move-column-to-workspace-up": "column-move-to-previous-desktop",
    "move-window-to-workspace-down": "window-move-to-next-desktop",
    "move-window-to-workspace-up": "window-move-to-previous-desktop",
    "consume-or-expel-window-left": "window-consume-or-expel-left",
    "consume-or-expel-window-right": "window-consume-or-expel-right",
    "switch-focus-between-floating-and-tiling": "window-switch-focus-floating-tiling",
    "consume-window-into-column": "window-consume-into-column",
    "expel-window-from-column": "window-expel-from-column",
    "switch-preset-column-width": "cycle-preset-widths",
    "switch-preset-column-width-back": "cycle-preset-widths-reverse",
    "maximize-column": "column-width-maximize",
    "maximize-window-to-edges": "window-maximize-to-edges",
    "fullscreen-window": "window-toggle-fullscreen",
    "toggle-windowed-fullscreen": "window-toggle-windowed-fullscreen",
    "center-column": "grid-scroll-focused",
    "toggle-window-floating": "window-toggle-floating",
    "toggle-column-tabbed-display": "column-toggle-tabbed",
    "close-window": "window-close",
    "toggle-overview": "overview",
    "expand-column-to-available-width": "column-width-expand",
    "switch-preset-window-height": "window-height-cycle-presets",
    "switch-preset-window-height-back": "window-height-cycle-presets-reverse",
    "reset-window-height": "window-height-reset",
    "focus-window-or-workspace-up": "focus-window-or-desktop-up",
    "focus-window-or-workspace-down": "focus-window-or-desktop-down",
    "move-window-up-or-to-workspace-up": "window-move-up-or-to-desktop-up",
    "move-window-down-or-to-workspace-down": "window-move-down-or-to-desktop-down",
    "focus-column-right-or-first": "focus-column-right-or-first",
    "focus-column-left-or-last": "focus-column-left-or-last",
    "focus-window-down-or-column-left": "focus-window-down-or-column-left",
    "focus-window-down-or-column-right": "focus-window-down-or-column-right",
    "focus-window-up-or-column-left": "focus-window-up-or-column-left",
    "focus-window-up-or-column-right": "focus-window-up-or-column-right",
    "focus-window-top": "focus-window-top",
    "focus-window-bottom": "focus-window-bottom",
    "focus-window-down-or-top": "focus-window-down-or-top",
    "focus-window-up-or-bottom": "focus-window-up-or-bottom",
    "swap-window-left": "window-swap-left",
    "swap-window-right": "window-swap-right",
    "center-window": "grid-scroll-focused",
    "center-visible-columns": "column-center-visible",
    "focus-workspace-previous": "desktop-previous-used",
    "move-workspace-down": "desktop-move-down",
    "move-workspace-up": "desktop-move-up",
    "move-window-to-floating": "window-move-to-floating",
    "move-window-to-tiling": "window-move-to-tiling",
    "focus-floating": "focus-floating",
    "focus-tiling": "focus-tiling",
    "focus-window-previous": "focus-window-previous",
    "open-overview": "overview",
}
NUMBERED = {
    "focus-workspace": "desktop-{}",
    "move-column-to-workspace": "column-move-to-desktop-{}",
    "move-window-to-workspace": "window-move-to-desktop-{}",
    "focus-column": "focus-{}",
    "focus-window-in-column": "focus-window-in-column-{}",
    "move-column-to-index": "column-move-to-column-{}",
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
    binds, skipped, steps = {}, [], {}
    for blk in find(parse_kdl(path), "binds"):
        for key, _, _, cmds in blk[3]:
            if not cmds:
                continue
            name, args = cmds[0][0], cmds[0][1]
            if name in NUMBERED and args and args[0].isdigit():
                action = NUMBERED[name].format(args[0])
            elif name in ("set-column-width", "set-window-height") and args and re.fullmatch(r"[+-]\d+(\.\d+)?%", args[0]):
                kind = "column-width" if name == "set-column-width" else "window-height"
                action = kind + ("-decrease" if args[0].startswith("-") else "-increase")
                steps.setdefault("columnWidthStep" if kind == "column-width" else "windowHeightStep", round(float(args[0][1:-1])))
            elif name == "set-column-display" and args and args[0] in ("tabbed", "normal"):
                action = "column-display-" + args[0]
            else:
                action = ACTIONS.get(name)
            kiri_key = convert_key(key)
            if name in ("spawn", "spawn-sh"):
                continue  # read_spawns takes these
            if action is None or kiri_key is None:
                skipped.append(f"{key} {' '.join([name] + args)}")
                continue
            binds.setdefault(action, []).append(kiri_key)
    return binds, skipped, steps


def key_fields(binds):
    """kwinrc [Script-kiri] fields for the binds: Kiri has a primary and an alternate key field per action."""
    fields = {}
    for action, keys in binds.items():
        name = action.replace("-", "_")
        for slot, key in enumerate(keys[:2], start=1):
            fields[f"key{slot}_{name}"] = key
        if len(keys) > 2:
            print(f"# skipped: {action} has {len(keys)} keys, Kiri keeps the first two", file=sys.stderr)
    return fields


def stale_key_fields(kwinrc, keep):
    """key fields in kwinrc [Script-kiri] that the niri config no longer sets (an earlier run wrote them)."""
    stale, inside = [], False
    try:
        lines = Path(kwinrc).expanduser().read_text().splitlines()
    except OSError:
        return stale
    for line in lines:
        if line.startswith("["):
            inside = line.strip() == "[Script-kiri]"
        elif inside and re.match(r"key[12]_\w+=", line):
            name = line.split("=", 1)[0]
            if name not in keep:
                stale.append(name)
    return stale


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
    binds, skipped, _ = read_binds(config)
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
    "brown": "#a52a2a", "transparent": "#00000000",
}


def parse_color(value):
    """'#rrggbb', or '#rrggbbaa' when the colour is not opaque (niri's colours are CSS ones)"""
    v = value.strip().lower()
    if v in COLOR_NAMES:
        return COLOR_NAMES[v]
    m = re.fullmatch(r"#([0-9a-f]{3,8})", v)
    if m and len(m.group(1)) in (3, 4, 6, 8):
        h = m.group(1)
        if len(h) in (3, 4):
            h = "".join(c * 2 for c in h)
        return "#" + (h[:6] if len(h) == 8 and h[6:] == "ff" else h)
    m = re.fullmatch(r"(rgba?|hsla?)\((.*)\)", v)
    if m:
        parts = re.findall(r"[\d.]+%?", m.group(2))
        nums = [float(x.rstrip("%")) for x in parts][:3]
        if len(nums) == 3:
            if m.group(1).startswith("rgb"):
                r, g, b = (x / 255 for x in nums)
            else:
                r, g, b = colorsys.hls_to_rgb(nums[0] / 360 % 1, nums[2] / 100, nums[1] / 100)
            alpha = 1.0
            if len(parts) > 3:
                alpha = float(parts[3].rstrip("%")) / (100 if parts[3].endswith("%") else 1)
                alpha = max(0.0, min(1.0, alpha))
            out = "#%02x%02x%02x" % tuple(round(x * 255) for x in (r, g, b))
            return out + ("%02x" % round(alpha * 255) if alpha < 1 else "")
    return None


def gradient_string(node, warn):
    """niri's `active-gradient from=.. to=.. angle=.. relative-to=.. in=..` as one line of the Kiri settings"""
    if node is None:
        return None
    frm = parse_color(node[2].get("from", ""))
    to = parse_color(node[2].get("to", ""))
    if frm is None or to is None:
        warn(f"{node[0]} needs from and to colours")
        return None
    out = f"from={frm} to={to}"
    for name in ("angle", "relative-to", "in"):
        if name in node[2]:
            out += f" {name}={node[2][name]}"
    return out


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


def color_setting(node, key, out, warn):
    if node is None or not node[1]:
        return
    color = parse_color(node[1][0])
    if color:
        out[key] = color
    else:
        warn(f"{key}: colour {node[1][0]!r} not understood")


def color_or_gradient(node, name, key, out, warn):
    color_setting(child(node, name + "-color"), key + "Color", out, warn)
    gradient = gradient_string(child(node, name + "-gradient"), warn)
    if gradient:
        out[key + "Gradient"] = gradient


def ring_settings(node, prefix, out, warn):
    if node is None:
        return
    if child(node, "off"):
        out[prefix + "Enabled"] = False
    elif child(node, "on"):
        out[prefix + "Enabled"] = True
    if child(node, "width") and number(child(node, "width")[1]) is not None:
        out[prefix + "Width"] = number(child(node, "width")[1])
    for state in ("active", "inactive", "urgent"):
        color_or_gradient(node, state, prefix + state.title(), out, warn)


def shadow_settings(node, out, warn):
    if node is None:
        return
    if child(node, "on"):
        out["shadowEnabled"] = True
    if child(node, "off"):
        out["shadowEnabled"] = False
    offset = child(node, "offset")
    if offset:
        for axis, key in (("x", "shadowOffsetX"), ("y", "shadowOffsetY")):
            try:
                out[key] = round(float(offset[2][axis]))
            except (KeyError, ValueError):
                pass
    for name, key in (("softness", "shadowSoftness"), ("spread", "shadowSpread")):
        n = child(node, name)
        if n and n[1]:
            try:
                out[key] = round(float(n[1][0]))
            except ValueError:
                pass
    behind = child(node, "draw-behind-window")
    if behind:
        out["shadowDrawBehindWindow"] = (behind[1] or ["true"])[0] != "false"
    color_setting(child(node, "color"), "shadowColor", out, warn)
    color_setting(child(node, "inactive-color"), "shadowInactiveColor", out, warn)


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


KNOWN_MATCHERS = {"app-id": "class", "title": "caption", "is-floating": "isFloating", "is-active": "isActive", "is-focused": "isFocused"}


def match_of(node, warn):
    """One match or exclude line as a Kiri matcher; None when it uses a matcher Kiri has no data for."""
    props = node[2]
    unknown = [k for k in props if k not in KNOWN_MATCHERS]
    if unknown:
        warn(f"window-rule matcher {', '.join(unknown)} (a {node[0]} line that uses it is ignored)")
        return None
    entry = {}
    for niri, kiri in KNOWN_MATCHERS.items():
        if niri in props:
            if kiri in ("class", "caption"):
                if props[niri]:
                    entry[kiri] = anchored(props[niri])
            else:
                entry[kiri] = props[niri] == "true"
    return entry


def window_rules(nodes, warn):
    rules = []
    for rule in find(nodes, "window-rule"):
        matches = find(rule[3], "match")
        floating = child(rule, "open-floating")
        floating = floating if floating and floating[1][:1] != ["false"] else None
        width = size(child(rule, "default-column-width"))
        height = size(child(rule, "default-window-height"))
        fullscreen = child(rule, "open-fullscreen")
        fullscreen = None if fullscreen is None else fullscreen[1][:1] != ["false"]
        if not matches or not (floating or width or height or fullscreen is not None):
            continue
        excludes = [e for e in (match_of(x, warn) for x in find(rule[3], "exclude")) if e is not None]
        for m in matches:
            entry = match_of(m, warn)
            if entry is None:
                continue
            if floating:
                entry["tile"] = False
            if width:
                entry["width"] = width
            if height:
                entry["height"] = height
            if fullscreen is not None:
                entry["fullscreen"] = fullscreen
            if excludes:
                entry["exclude"] = excludes
            rules.append(entry)
    return rules


def read_settings(path, warn):
    out = read_settings_inner(path, warn)
    out.update(read_binds(path)[2])
    return out


def read_settings_inner(path, warn):
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
    if L("default-column-width"):
        # an empty block lets the windows pick their own width, which is "" for Kiri
        out["defaultColumnWidth"] = size(L("default-column-width")) or ""
    if L("default-column-display"):
        out["tabbedColumnsByDefault"] = (L("default-column-display")[1] or [""])[0] == "tabbed"
    ring_settings(L("focus-ring"), "focusRing", out, warn)
    for rule in find(nodes, "window-rule"):
        node = child(rule, "geometry-corner-radius")
        if node and not find(rule[3], "match") and number(node[1]) is not None:
            out["cornerRadius"] = max(0, number(node[1]))
            break
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
        if child(tab, "place-within-column"):
            out["tabIndicatorPlaceWithinColumn"] = True
        for niri, kiri in (("gaps-between-tabs", "tabIndicatorGapsBetweenTabs"), ("corner-radius", "tabIndicatorCornerRadius")):
            if child(tab, niri) and number(child(tab, niri)[1]) is not None:
                out[kiri] = number(child(tab, niri)[1])
        for state in ("active", "inactive", "urgent"):
            color_or_gradient(tab, state, "tabIndicator" + state.title(), out, warn)

    shadow_settings(L("shadow"), out, warn)
    hint = L("insert-hint")
    if hint:
        if child(hint, "off"):
            out["insertHintEnabled"] = False
        elif child(hint, "on"):
            out["insertHintEnabled"] = True
        color_setting(child(hint, "color"), "insertHintColor", out, warn)
        gradient = gradient_string(child(hint, "gradient"), warn)
        if gradient:
            out["insertHintGradient"] = gradient
    color_setting(L("fullscreen-backdrop-color"), "fullscreenBackdropColor", out, warn)
    color_setting(L("background-color"), "backgroundColor", out, warn)

    out["hideTitlebars"] = bool(find(nodes, "prefer-no-csd"))
    # niri always has dynamic workspaces, but Kiri's are experimental: they stay as the user set them
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


# ---- spawn / spawn-sh binds: Plasma command shortcuts ----
# kglobalacceld turns every application .desktop file that has X-KDE-Shortcuts into a shortcut component while it runs
# (it looks again whenever the service cache changes), so no restart or login is needed. The files are ours alone:
# they carry a marker line, are written only when they change, and each run removes the ones the niri config no longer has.

SPAWN_MARKER = "X-Kiri-Niri-Bind=true"
XF86_KEYS = {
    "xf86audioraisevolume": "Volume Up", "xf86audiolowervolume": "Volume Down", "xf86audiomute": "Volume Mute",
    "xf86audiomicmute": "Microphone Mute", "xf86audioplay": "Media Play", "xf86audiopause": "Media Pause",
    "xf86audiostop": "Media Stop", "xf86audioprev": "Media Previous", "xf86audionext": "Media Next",
    "xf86monbrightnessup": "Monitor Brightness Up", "xf86monbrightnessdown": "Monitor Brightness Down",
    "xf86kbdbrightnessup": "Keyboard Brightness Up", "xf86kbdbrightnessdown": "Keyboard Brightness Down",
    "xf86launch1": "Launch (1)", "xf86mail": "Launch Mail", "xf86calculator": "Launch Calculator",
}


def spawn_key(niri_key):
    """Qt key name for a bind that starts a program; like convert_key, plus the XF86 media keys."""
    key = convert_key(niri_key)
    if key is None:
        *mods, last = niri_key.split("+")
        if last.lower() in XF86_KEYS and all(m.lower() in MODIFIERS for m in mods):
            order = ["Meta", "Ctrl", "Alt", "Shift"]
            key = "+".join(sorted({MODIFIERS[m.lower()] for m in mods}, key=order.index) + [XF86_KEYS[last.lower()]])
    return key


def read_spawns(path, warn):
    """[(kiri_key, args)] of the spawn and spawn-sh binds; args is the command line as a list."""
    spawns = []
    for blk in find(parse_kdl(path), "binds"):
        for key, _, _, cmds in blk[3]:
            if not cmds or cmds[0][0] not in ("spawn", "spawn-sh") or not cmds[0][1]:
                continue
            name, args = cmds[0][0], cmds[0][1]
            kiri_key = spawn_key(key)
            if kiri_key is None or "," in kiri_key:
                warn(f"bind {key} {name} {' '.join(args)}")
                continue
            if name == "spawn-sh":
                args = ["sh", "-c", " ".join(args)]
            elif args[0].startswith("~/"):
                args = [str(Path.home() / args[0][2:])] + args[1:]
            spawns.append((kiri_key, args))
    return spawns


def exec_arg(arg):
    """One argument of a .desktop Exec line: quoted when it needs it (the Desktop Entry rules)."""
    arg = arg.replace("%", "%%")
    if re.fullmatch(r"[A-Za-z0-9_./:=@+,-]+", arg):
        return arg
    return '"' + re.sub(r'(["`$\\])', r"\\\1", arg) + '"'


def desktop_string(value):
    return value.replace("\\", "\\\\")  # the file format reads \\ as one backslash


def spawn_files(spawns):
    """{file name: text}, one per bound key."""
    files = {}
    for kiri_key, args in spawns:
        slug = "".join(c if c.isalnum() else f"_{ord(c):x}_" for c in kiri_key)
        name = f"kiri-bind-{slug}.desktop"
        command = shlex.join(args)
        text = "\n".join([
            "[Desktop Entry]",
            "# Made by niri2kiri.py from a niri bind; rewritten on every run, removed with --remove-spawn.",
            "Type=Application",
            "Name=" + desktop_string(f"{command}"),
            "Exec=" + desktop_string(" ".join(exec_arg(a) for a in args)),
            "NoDisplay=true",
            "StartupNotify=false",
            "X-KDE-GlobalAccel-CommandShortcut=true",
            "X-KDE-Shortcuts=" + kiri_key,
            SPAWN_MARKER,
            "",
        ])
        files[name] = text
    return files


def spawn_dir():
    return Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local/share")) / "applications"


def generated_spawn_files(directory):
    return [f for f in sorted(directory.glob("kiri-bind-*.desktop")) if SPAWN_MARKER in f.read_text()] if directory.is_dir() else []


def apply_spawns(files, dry):
    """Writes the files that changed, removes the stale ones; returns what it did, for printing."""
    directory = spawn_dir()
    done = []
    for old in generated_spawn_files(directory):
        if old.name not in files:
            done.append(f"remove {old}")
            if not dry:
                old.unlink()
    for name, text in files.items():
        target = directory / name
        if not target.exists() or target.read_text() != text:
            done.append(f"write {target}")
            if not dry:
                directory.mkdir(parents=True, exist_ok=True)
                target.write_text(text)
    if done and not dry:
        # kglobalacceld notices the changed service cache and registers (or drops) the shortcuts
        try:
            subprocess.run(["kbuildsycoca6", "--noincremental"], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except FileNotFoundError:
            print("# kbuildsycoca6 not found: the shortcuts appear after the next login", file=sys.stderr)
    return done


# ---- the niri `input` block, only with --input ----

def touchpads():
    """(vendor, product, name) of the touchpads in /proc/bus/input/devices; Plasma keys them by decimal ids."""
    found = []
    try:
        blocks = Path("/proc/bus/input/devices").read_text().split("\n\n")
    except OSError:
        return found
    for block in blocks:
        ident = re.search(r"Vendor=([0-9a-f]+) Product=([0-9a-f]+)", block, re.I)
        name = re.search(r'^N: Name="(.*)"', block, re.M)
        if ident and name and re.search(r"touch\s*pad", name.group(1), re.I) and "mouse" in block:
            found.append((int(ident.group(1), 16), int(ident.group(2), 16), name.group(1)))
    return found


def read_input(path, warn):
    """[(file, [group, ...], key, value)] for kwriteconfig6, from niri's input block."""
    out = []
    for blk in find(parse_kdl(path), "input"):
        kb = child(blk, "keyboard")
        if kb:
            xkb = child(kb, "xkb")
            if xkb:
                layout, variant, options = (child(xkb, n) for n in ("layout", "variant", "options"))
                if layout and layout[1]:
                    count = layout[1][0].count(",") + 1
                    out.append(("kxkbrc", ["Layout"], "Use", True))
                    out.append(("kxkbrc", ["Layout"], "LayoutList", layout[1][0]))
                    out.append(("kxkbrc", ["Layout"], "VariantList", variant[1][0] if variant and variant[1] else "," * (count - 1)))
                if options and options[1]:
                    out.append(("kxkbrc", ["Layout"], "ResetOldOptions", True))
                    out.append(("kxkbrc", ["Layout"], "Options", options[1][0]))
                if child(xkb, "model") or child(xkb, "rules"):
                    warn("input keyboard xkb model/rules (Plasma keeps its own)")
            delay, rate = child(kb, "repeat-delay"), child(kb, "repeat-rate")
            if delay and number(delay[1]) is not None or rate and number(rate[1]) is not None:
                out.append(("kcminputrc", ["Keyboard"], "KeyRepeat", "repeat"))
            if delay and number(delay[1]) is not None:
                out.append(("kcminputrc", ["Keyboard"], "RepeatDelay", number(delay[1])))
            if rate and number(rate[1]) is not None:
                out.append(("kcminputrc", ["Keyboard"], "RepeatRate", number(rate[1])))
        tp = child(blk, "touchpad")
        if tp:
            keys = []
            if child(tp, "natural-scroll"):
                keys.append(("NaturalScroll", True))
            if child(tp, "tap"):
                keys.append(("TapToClick", True))
            profile = child(tp, "accel-profile")
            if profile and profile[1]:
                flat = profile[1][0] == "flat"
                keys += [("PointerAccelerationProfileFlat", flat), ("PointerAccelerationProfileAdaptive", not flat)]
            if keys:
                devices = touchpads()
                if not devices:
                    warn("input touchpad: no touchpad found in /proc/bus/input/devices")
                for vendor, product, name in devices:
                    for key, value in keys:
                        out.append(("kcminputrc", ["Libinput", str(vendor), str(product), name], key, value))
    return out


def fmt(value):
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value).replace("\\", "\\\\")


def kwrite(file, group, key, value):
    groups = [group] if isinstance(group, str) else group
    args = ["kwriteconfig6", "--file", file]
    for g in groups:
        args += ["--group", g]
    args += ["--key", key]
    if isinstance(value, bool):
        args += ["--type", "bool", str(value).lower()]
    else:
        args.append(str(value))
    subprocess.run(args, check=True)


def main():
    argv = sys.argv[1:]
    flags = {a for a in argv if a.startswith("--")}
    pos = [a for a in argv if not a.startswith("--")]
    if not 1 <= len(pos) <= 2 or flags - {"--settings", "--apply", "--input", "--no-spawn", "--remove-spawn"}:
        sys.exit(__doc__.strip())
    shortcuts_file = pos[1] if len(pos) == 2 else "~/.config/kglobalshortcutsrc"
    warn = lambda msg: print("# skipped:", msg, file=sys.stderr)

    if "--remove-spawn" in flags:
        for line in apply_spawns({}, dry=False):
            print(line)
        return
    if "--input" in flags:
        changes = read_input(pos[0], warn)
        for file, groups, key, value in changes:
            print(f"{file} [{']['.join(groups)}] {key}={fmt(value)}")
        if "--apply" in flags:
            for file, groups, key, value in changes:
                kwrite(file, groups, key, value)
            print("\nDone. Key repeat and layouts apply after a new login, touchpad settings at once or after a replug.")
        else:
            print("(nothing written; add --apply)")
        if flags <= {"--input", "--apply"}:
            return
    if "--settings" in flags or "--apply" in flags:
        settings = read_settings(pos[0], warn)
    if "--apply" in flags:
        binds, skipped, _ = read_binds(pos[0])
        for line in skipped:
            warn("bind " + line)
        fields = key_fields(binds)
        stale = stale_key_fields(Path(os.environ.get("XDG_CONFIG_HOME", "~/.config")) / "kwinrc", fields)
        print("kwinrc [Script-kiri]:")
        for key, value in {**settings, **fields}.items():
            print(f"  {key}={fmt(value)}")
        for key in stale:
            print(f"  {key} removed")
        for key, value in {**settings, **fields}.items():
            kwrite("kwinrc", "Script-kiri", key, value)
        for key in stale:
            subprocess.run(["kwriteconfig6", "--file", "kwinrc", "--group", "Script-kiri", "--key", key, "--delete"], check=True)
        if "--no-spawn" not in flags:
            for line in apply_spawns(spawn_files(read_spawns(pos[0], warn)), dry=False):
                print(line)
        print("\nDone. Kiri picks up settings and shortcut keys at once, no new login.")
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
