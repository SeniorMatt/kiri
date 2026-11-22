#!/usr/bin/env python3
"""Turn a niri config.kdl into Kiri's shortcuts and settings.

Usage: niri2kiri.py config.kdl [kglobalshortcutsrc]            print the [kiri] shortcut section
       niri2kiri.py config.kdl --settings                      print the [Script-kiri] settings section
       niri2kiri.py config.kdl [kglobalshortcutsrc] --apply    write both with kwriteconfig6
       niri2kiri.py config.kdl --apply                         also makes Plasma command shortcuts of the spawn / spawn-sh binds
                                                               (~/.local/share/applications/kiri-bind-*.desktop with X-KDE-Shortcuts);
                                                               --no-spawn leaves them out, --remove-spawn removes them again and stops
       niri2kiri.py config.kdl --json                          settings, keys and skipped lines as JSON (for tests)
       niri2kiri.py config.kdl --input [--apply]               the niri `input` block for Plasma: show (or, with --apply, write)
                                                               touchpad natural-scroll/tap/accel-profile (kcminputrc), key repeat
                                                               (kcminputrc) and xkb layouts/options (kxkbrc). Only with --input.

With --apply the keys go into Kiri's own key fields (kwinrc [Script-kiri], key1_<action> and key2_<action>), which a
running Kiri picks up like its other settings: no new login needed. Without --apply the [kiri] section for
kglobalshortcutsrc is printed (Kiri has to have run once for that). Things Kiri can't do are listed on stderr.
"""
import colorsys
from decimal import Decimal
import json
import math
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
    "open-overview": "overview-open",
    "toggle-window-rule-opacity": "window-toggle-rule-opacity",
    "close-overview": "overview-close",
    "show-hotkey-overlay": "show-hotkey-overlay",
    # in niri's scrolling layout the width of a window is the width of its column
    "switch-preset-window-width": "cycle-preset-widths",
    "switch-preset-window-width-back": "cycle-preset-widths-reverse",
    "set-window-fullscreen": "window-set-fullscreen",
    "unset-window-fullscreen": "window-unset-fullscreen",
    "set-windowed-fullscreen": "window-set-windowed-fullscreen",
    "unset-windowed-fullscreen": "window-unset-windowed-fullscreen",
    "set-window-maximized-to-edges": "window-set-maximized-to-edges",
    "unset-window-maximized-to-edges": "window-unset-maximized-to-edges",
    # with one output these do what the plain action does (niri: no output in that direction)
    "focus-window-or-monitor-up": "focus-up",
    "focus-window-or-monitor-down": "focus-down",
    "focus-column-or-monitor-left": "focus-left",
    "focus-column-or-monitor-right": "focus-right",
    "move-column-left-or-to-monitor-left": "column-move-left",
    "move-column-right-or-to-monitor-right": "column-move-right",
}
# the same actions with focus=false (the focus stays where it was)
NO_FOCUS = {
    "move-column-left": "column-move-left-no-focus",
    "move-column-right": "column-move-right-no-focus",
    "move-column-to-first": "column-move-start-no-focus",
    "move-column-to-last": "column-move-end-no-focus",
    "move-window-up": "window-move-up-no-focus",
    "move-window-down": "window-move-down-no-focus",
    "swap-window-left": "window-swap-left-no-focus",
    "swap-window-right": "window-swap-right-no-focus",
}
NUMBERED = {
    "focus-workspace": "desktop-{}",
    "move-column-to-workspace": "column-move-to-desktop-{}",
    "move-window-to-workspace": "window-move-to-desktop-{}",
    "focus-column": "focus-{}",
    "focus-window-in-column": "focus-window-in-column-{}",
    "move-column-to-index": "column-move-to-column-{}",
}
NUMBERED_NO_FOCUS = {
    "move-column-to-index": "column-move-to-column-no-focus-{}",
}
NO_FOCUS_SLOTS = 12  # how many numbered no-focus actions Kiri has
SIZE_SLOTS = 12  # how many column-width-set-N and window-height-set-N actions Kiri has
MODIFIERS = {"mod": "Meta", "super": "Meta", "win": "Meta", "ctrl": "Ctrl", "control": "Ctrl", "shift": "Shift", "alt": "Alt"}
KEYS = {
    "page_down": "PgDown", "page_up": "PgUp", "next": "PgDown", "prior": "PgUp",
    "comma": ",", "period": ".", "slash": "/", "backslash": "\\", "minus": "-", "equal": "=", "plus": "+",
    "bracketleft": "[", "bracketright": "]", "semicolon": ";", "apostrophe": "'", "grave": "`",
    "return": "Return", "space": "Space", "tab": "Tab", "escape": "Esc", "backspace": "Backspace",
    "delete": "Del", "insert": "Ins", "home": "Home", "end": "End", "print": "Print",
    "left": "Left", "right": "Right", "up": "Up", "down": "Down",
}


MOD_KEYS = {"super": "Meta", "alt": "Alt", "ctrl": "Ctrl", "shift": "Shift"}  # niri's mod-key names -> Kiri's
# The pointer triggers of niri's binds that Kiri's effect can take: the wheel and the mouse buttons.
# TouchpadScroll* is continuous in KWin (no ticks to count) and TabletStylusButton* has no KWin hook.
POINTER_TRIGGERS = ["WheelScrollDown", "WheelScrollUp", "WheelScrollLeft", "WheelScrollRight",
                    "MouseLeft", "MouseRight", "MouseMiddle", "MouseForward", "MouseBack"]


def convert_key(niri_key, mod="Meta"):
    """`mod` is what niri's Mod stands for (input { mod-key }): Kiri's name of that modifier, Meta (Super) by default."""
    *mods, key = niri_key.split("+")
    out = []
    for m in mods:
        if m.lower() not in MODIFIERS:
            return None
        out.append(mod if m.lower() == "mod" else MODIFIERS[m.lower()])
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


def convert_pointer_key(niri_key, mod="Meta"):
    """"Mod+Ctrl+WheelScrollDown" -> "Meta+Ctrl+WheelScrollDown" (Kiri's pointerBinds setting names triggers like niri does)"""
    *mods, last = niri_key.split("+")
    trigger = next((t for t in POINTER_TRIGGERS if t.lower() == last.lower()), None)
    keys = convert_key("+".join(mods + ["A"]), mod) if trigger else None
    return None if keys is None else keys[:-1] + trigger


# why a niri action has no Kiri action (a regex on the name, the reason that is told)
UNMAPPED = [
    (r"^(spawn|spawn-sh)$", "starts a program: a Plasma command shortcut (tools/niri2kiri.py --apply makes them)"),
    (r"^screenshot", "screenshots are Spectacle's"),
    (r"^(quit|suspend|power-off-monitors|power-on-monitors|change-vt|toggle-touchpad|do-screen-transition)$", "session and hardware actions are Plasma's"),
    (r"^switch-layout$", "keyboard layouts are Plasma's"),
    (r"^toggle-keyboard-shortcuts-inhibit$", "KWin has its own shortcut inhibit key"),
    (r"^(set-dynamic-cast|clear-dynamic-cast|stop-cast)", "screencast targets are Plasma's"),
    (r"^(toggle-debug-tint|debug-toggle)", "niri renderer debugging"),
    (r"monitor", "no monitor concept in Kiri's layout (desktops are shared by every screen; screen-switch moves the grid)"),
    (r"^(focus-workspace|move-(window|column)-to-workspace)$", "this workspace reference is not mapped (a name with focus=false, or more than 12 names)"),
    (r"-by-id$|^focus-window$|^load-config-file$|^mru-", "IPC and window switcher actions cannot be bound"),
]


def unmapped_reason(name, args):
    return next((reason for regex, reason in UNMAPPED if re.search(regex, name)), "Kiri has no such action")


def key_reason(niri_key):
    trigger = niri_key.split("+")[-1]
    if re.match(r"TouchpadScroll", trigger):
        return "touchpad scrolling gives KWin no ticks to bind"
    if re.match(r"TabletStylusButton", trigger):
        return "stylus buttons have no KWin hook"
    if re.fullmatch(r"Mod|Super|Ctrl|Control|Shift|Alt|Win", trigger, re.I):
        return "a modifier on its own cannot be bound"
    if re.match(r"XF86", trigger, re.I):
        return "media and hardware keys are Plasma's (tools/niri2kiri.py --apply makes command shortcuts of the spawn ones)"
    return "key or modifier Kiri does not know"


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
                if end < 0:
                    end = n  # unterminated: the rest of the file is the string
                toks.append(("q", text[m.end():end])); i = end + 1 + len(m.group(1))
            elif c == '"':
                j, out = i + 1, ""
                while j < n and text[j] != '"':
                    if text[j] == "\\" and j + 1 < n:
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


def parse_kdl(path, depth=0):
    path = Path(path).expanduser()
    nodes = []
    try:
        parsed = parse_nodes(tokenize(path.read_text(errors="replace")))[0]
    except (IndexError, ValueError, RecursionError):
        print("# skipped: could not read", path, "(malformed KDL)", file=sys.stderr)
        return []
    for node in parsed:
        if node[0] == "include" and node[1]:
            included = (path.parent / Path(node[1][0]).expanduser())
            if depth > 8:
                print("# skipped: include", node[1][0], "(nested too deeply)", file=sys.stderr)
            elif included.is_file():
                nodes += parse_kdl(included, depth + 1)
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

def declared_workspaces(nodes):
    """workspace "name" { ... } at the top level, in the order of the config"""
    names = []
    for node in find(nodes, "workspace"):
        if node[1] and node[1][0] not in names and len(names) < 12:
            names.append(node[1][0])
    return names


def desktop_action(name, args, props, names):
    """Workspace binds that need more than a name lookup: a workspace by name (the Nth name of the bind list is the
    shortcut "...-named-N", 12 at most), focus=false, new workspaces, move-workspace-to-index."""
    arg = args[0] if args else None
    no_focus_suffix = "-no-focus" if props.get("focus") == "false" else ""

    def slot(workspace):
        if workspace not in names and len(names) < 12:
            names.append(workspace)
        return names.index(workspace) + 1 if workspace in names else 0

    if name in ("focus-workspace", "move-column-to-workspace", "move-window-to-workspace"):
        kind = {"focus-workspace": "desktop", "move-column-to-workspace": "column-move-to-desktop", "move-window-to-workspace": "window-move-to-desktop"}[name]
        if arg is None:
            return None
        if arg.isdigit():
            return None if name == "focus-workspace" else f"{kind}{no_focus_suffix}-{arg}"
        return None if no_focus_suffix or not slot(arg) else f"{kind}-named-{slot(arg)}"
    if name == "set-workspace-name":
        return f"set-desktop-name-{slot(arg)}" if arg is not None and slot(arg) else None
    if name == "unset-workspace-name":
        return "unset-desktop-name" if arg is None else None
    if name == "move-workspace-to-index":
        return f"move-desktop-to-index-{arg}" if arg is not None and arg.isdigit() else None
    if name in ("move-column-to-workspace-down", "move-column-to-workspace-up"):
        return f"column-move-to-{'next' if name.endswith('down') else 'previous'}-desktop-no-focus" if no_focus_suffix else None
    if name in ("move-window-to-workspace-down", "move-window-to-workspace-up"):
        return f"window-move-to-{'next' if name.endswith('down') else 'previous'}-desktop-no-focus" if no_focus_suffix else None
    if name in ("move-column-to-new-workspace-below", "move-column-to-new-workspace-above",
                "move-window-to-new-workspace-below", "move-window-to-new-workspace-above"):
        # a workspace reference is not mapped
        return None if arg is not None else f"{'column' if name.startswith('move-column') else 'window'}-move-to-new-desktop-{'below' if name.endswith('below') else 'above'}{no_focus_suffix}"
    return None


def is_false(value):
    return value in ("false", "#false")


def size_action(niri_name, value, steps, slots):
    """The Kiri action for set-column-width, set-window-width and set-window-height: "+10%" keeps to the width and
    height step keys of the first such bind; any other size gets one of the numbered "set to" actions, with the size
    stored in the columnWidthSet / windowHeightSet setting."""
    kind = "window" if niri_name == "set-window-height" else "column"
    if re.fullmatch(r"[+-]\d+%", value):
        step_name = "columnWidthStep" if kind == "column" else "windowHeightStep"
        step = int(value[1:-1])
        steps.setdefault(step_name, step)
        if steps[step_name] == step:
            return ("column-width" if kind == "column" else "window-height") + ("-decrease" if value.startswith("-") else "-increase")
    lst = slots[kind]
    if value not in lst:
        if len(lst) >= SIZE_SLOTS:
            return None
        lst.append(value)
    return ("column-width-set-" if kind == "column" else "window-height-set-") + str(lst.index(value) + 1)


SIZE_CHANGE = re.compile(r"^[+-]?\d+%$|^[+-]?\d+(px)?$|^[+-]?\d+\.\d+%$")


def focus_previous_action(scope, filt):
    parts = [p for p in (scope if scope in ("workspace", "output") else "", "app" if filt == "app-id" else "") if p]
    return "-".join(["focus-window-previous"] + parts)


def read_binds(path, mod="Meta", nodes=None):
    """-> binds {action: [keys]}, skipped [text], steps {setting: value}, pointer "k=action@ms;..." or None, slots {kind: [sizes]}"""
    binds, skipped, steps, pointer, slots, has_binds = {}, [], {}, [], {"column": [], "window": []}, False
    nodes = nodes if nodes is not None else parse_kdl(path)
    bind_names = declared_workspaces(nodes)  # the names that binds refer to; declared workspaces come first
    for blk in find(nodes, "binds"):
        has_binds = True
        for key, _, bind_props, cmds in blk[3]:
            # `press { action }` is a plain bind; a `release { action }` needs the key release, which kglobalaccel does not give
            if cmds and cmds[0][0] in ("press", "release"):
                cmds = [c for node in cmds for c in (node[3] if node[0] == "press" else [node])]
            else:
                cmds = cmds[:1]
            for cmd in cmds:
                name, args, props = cmd[0], cmd[1], cmd[2]
                action = reason = None
                action = desktop_action(name, args, props, bind_names)
                if action is not None:
                    pass  # a workspace bind
                elif name in NUMBERED and args and args[0].isdigit():
                    no_focus = is_false(props.get("focus"))
                    if no_focus and (name not in NUMBERED_NO_FOCUS or int(args[0]) > NO_FOCUS_SLOTS):
                        reason = f"focus=false only for numbers up to {NO_FOCUS_SLOTS}"
                    else:
                        action = (NUMBERED_NO_FOCUS if no_focus else NUMBERED)[name].format(args[0])
                elif is_false(props.get("focus")) and name in NO_FOCUS:
                    action = NO_FOCUS[name]
                elif re.fullmatch(r"set-(column-width|window-width|window-height)", name) and args and SIZE_CHANGE.match(args[0].strip()):
                    action = size_action(name, args[0].strip(), steps, slots)
                    reason = f"more than {SIZE_SLOTS} different sizes" if action is None else None
                elif name == "set-column-display" and args and args[0] in ("tabbed", "normal"):
                    action = "column-display-" + args[0]
                elif name == "focus-window-previous":
                    action = focus_previous_action(props.get("scope"), props.get("filter"))
                else:
                    action = ACTIONS.get(name)
                description = f"bind {key} {' '.join([name] + args)}"
                kiri_key = convert_key(key, mod)
                pointer_key = convert_pointer_key(key, mod) if kiri_key is None else None
                if name == "release":
                    skipped.append(f"bind {key} release: release actions cannot be bound (kglobalaccel gets no key release)")
                elif action is None:
                    skipped.append(f"{description}: {reason or unmapped_reason(name, args)}")
                elif kiri_key is not None:
                    binds.setdefault(action, []).append(kiri_key)
                elif pointer_key is not None:
                    m = re.match(r"\d+", bind_props.get("cooldown-ms", ""))
                    cooldown = int(m.group()) if m else 0
                    pointer.append(f"{pointer_key}={action}" + (f"@{cooldown}" if cooldown > 0 else ""))
                else:
                    skipped.append(f"{description}: {key_reason(key)}")
    if bind_names:
        steps["desktopBindNames"] = json.dumps(bind_names, separators=(",", ":"))
    return binds, skipped, steps, (";".join(pointer) if has_binds else None), slots


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
    binds, skipped = analyse(config)[0:2]
    skipped = [line for line in skipped if not is_spawn_line(line)]
    entries = read_kiri_section(shortcuts_file)
    if not entries:
        sys.exit(f"no [kiri] section in {shortcuts_file}, enable Kiri once first")
    out = {}
    for name in sorted(entries):
        default, description = entries[name]
        keys = "\\t".join(k.replace(",", "\\,") for k in binds.get(name, [])) or "none"
        out[name] = f"{keys},{default},{description}"
    for line in skipped + [f"bind {a} (not in this Kiri version)" for a in sorted(set(binds) - set(entries))]:
        warn(line)
    return out


# ---- settings ----

COLOR_NAMES = {
    "black": "#000000", "white": "#ffffff", "red": "#ff0000", "green": "#008000", "lime": "#00ff00",
    "blue": "#0000ff", "yellow": "#ffff00", "orange": "#ffa500", "purple": "#800080", "pink": "#ffc0cb",
    "cyan": "#00ffff", "magenta": "#ff00ff", "gray": "#808080", "grey": "#808080", "silver": "#c0c0c0",
    "brown": "#a52a2a", "transparent": "#00000000",
}


def js_round(x):
    """Math.round of the TypeScript importer: halves go up (Python's round() goes to even)"""
    return int(math.floor(x + 0.5))


def byte(x):
    return max(0, min(255, js_round(x)))


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
            out = "#%02x%02x%02x" % tuple(byte(x * 255) for x in (r, g, b))
            return out + ("%02x" % byte(alpha * 255) if alpha < 1 else "")
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
        value = float(args[0])
        if not math.isfinite(value) or value <= 0:
            return None  # niri refuses these too; "inf%" or "0px" would collapse the columns
        if kind == "proportion":
            return f"{value * 100:.3f}".rstrip("0").rstrip(".") + "%"
        if kind == "fixed":
            return f"{int(value)}px"
    except (IndexError, ValueError):
        pass
    return None


def size(node):
    return next(filter(None, (one_size(n[0], n[1]) for n in node[3])), None) if node else None


def sizes(node):
    return ", ".join(filter(None, (one_size(n[0], n[1]) for n in node[3])))


MAX_PIXELS = 10000  # a number from the config is a size in pixels: infinity or 1e300 would put every window off the screen


def number(args):
    try:
        value = float(args[0])
    except (IndexError, ValueError):
        return None
    return max(-MAX_PIXELS, min(MAX_PIXELS, int(value))) if math.isfinite(value) else None


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
                out[key] = js_round(float(offset[2][axis]))
            except (KeyError, ValueError):
                pass
    for name, key in (("softness", "shadowSoftness"), ("spread", "shadowSpread")):
        n = child(node, name)
        if n and n[1]:
            try:
                out[key] = js_round(float(n[1][0]))
            except ValueError:
                pass
    behind = child(node, "draw-behind-window")
    if behind:
        out["shadowDrawBehindWindow"] = (behind[1] or ["true"])[0] != "false"
    color_setting(child(node, "color"), "shadowColor", out, warn)
    color_setting(child(node, "inactive-color"), "shadowInactiveColor", out, warn)


def default_rules():
    """Kiri's built-in windowRules, so ours are added to them instead of replacing them."""
    src = Path(__file__).resolve().parent.parent / "src/lib/config/definition.ts"
    try:
        m = re.search(r"defaultWindowRules = `(.*?)`;", src.read_text(), re.S)
        return json.loads(m.group(1).replace("\\\\", "\\"))
    except (OSError, AttributeError, ValueError):
        return None


KNOWN_MATCHERS = {
    "app-id": "appId", "title": "title", "is-floating": "isFloating", "is-active": "isActive", "is-focused": "isFocused",
    "is-active-in-column": "isActiveInColumn", "is-urgent": "isUrgent", "is-window-cast-target": "isWindowCastTarget",
    "at-startup": "atStartup",
}


def match_of(node, warn):
    """One match or exclude line as a Kiri matcher; None when it uses a matcher Kiri does not know. The regexes are
    kept as niri has them: Kiri's appId and title match anywhere in the string, with Rust's regex syntax."""
    props = node[2]
    unknown = [k for k in props if k not in KNOWN_MATCHERS]
    if unknown:
        warn(f"window-rule/{node[0]}: matcher {', '.join(unknown)} is not supported, a line that uses it is ignored")
        return None
    entry = {}
    for niri, kiri in KNOWN_MATCHERS.items():
        if niri in props:
            if kiri in ("appId", "title"):
                if props[niri]:
                    entry[kiri] = props[niri]
            else:
                entry[kiri] = props[niri] == "true"
    return entry


def flag(node):
    return None if node is None else node[1][:1] != ["false"]


def color_of(node, warn, what):
    if not node or not node[1]:
        return None
    color = parse_color(node[1][0])
    if color is None:
        warn(f"window-rule/{what}: colour {node[1][0]!r} not understood")
    return color


def state_colors(node, out, warn, what):
    """the colour and the gradient of each state of a rule's focus-ring, border or tab-indicator, in the format of the settings"""
    for state in ("active", "inactive", "urgent"):
        color = color_of(child(node, state + "-color"), warn, f"{what} {state}")
        if color:
            out[state + "Color"] = color
        gradient = gradient_string(child(node, state + "-gradient"), warn)
        if gradient:
            out[state + "Gradient"] = gradient


def float_of(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def num(value):
    """an int where the value is whole, like JSON.stringify of a JavaScript number"""
    return int(value) if float(value).is_integer() else value


def ring_rule(node, warn):
    out = {}
    if child(node, "off"):
        out["enabled"] = False
    elif child(node, "on"):
        out["enabled"] = True
    if child(node, "width") and number(child(node, "width")[1]) is not None:
        out["width"] = number(child(node, "width")[1])
    state_colors(node, out, warn, node[0])
    return out or None


def shadow_rule(node, warn):
    out = {}
    if child(node, "off"):
        out["enabled"] = False
    elif child(node, "on"):
        out["enabled"] = True
    for name in ("softness", "spread"):
        c = child(node, name)
        value = float_of(c[1][0]) if c and c[1] else None
        if value is not None:
            out[name] = num(value)
    offset = child(node, "offset")
    if offset:
        for prop, key in (("x", "offsetX"), ("y", "offsetY")):
            value = float_of(offset[2].get(prop))
            if value is not None:
                out[key] = num(value)
    behind = flag(child(node, "draw-behind-window"))
    if behind is not None:
        out["drawBehindWindow"] = behind
    color = color_of(child(node, "color"), warn, "shadow")
    if color:
        out["color"] = color
    inactive = color_of(child(node, "inactive-color"), warn, "shadow inactive")
    if inactive:
        out["inactiveColor"] = inactive
    return out or None


def tab_indicator_rule(node, warn):
    out = {}
    state_colors(node, out, warn, "tab-indicator")
    return out or None


POSITIONS = ("top-left", "top-right", "bottom-left", "bottom-right", "top", "bottom", "left", "right")

def rule_properties(rule, warn, radius_is_global):
    """The properties of one window-rule as the keys of a Kiri rule, in niri's order."""
    out = {}
    floating = flag(child(rule, "open-floating"))
    if floating is not None:
        out["tile"] = not floating
    for niri, kiri in (("default-column-width", "width"), ("default-window-height", "height")):
        node = child(rule, niri)
        if node is not None:
            out[kiri] = size(node) or ""  # an empty block lets the window pick its own size
    for niri, kiri in (("open-fullscreen", "fullscreen"), ("open-maximized", "maximized"),
                       ("open-maximized-to-edges", "maximizedToEdges"), ("open-focused", "focused")):
        value = flag(child(rule, niri))
        if value is not None:
            out[kiri] = value
    workspace = child(rule, "open-on-workspace")
    if workspace and workspace[1]:
        out["workspace"] = workspace[1][0]
    display = child(rule, "default-column-display")
    if display and display[1][:1] in (["tabbed"], ["normal"]):
        out["columnDisplay"] = display[1][0]
    position = child(rule, "default-floating-position")
    if position and float_of(position[2].get("x")) is not None and float_of(position[2].get("y")) is not None:
        out["floatingPosition"] = {"x": num(float_of(position[2]["x"])), "y": num(float_of(position[2]["y"]))}
        relative = position[2].get("relative-to")
        if relative in POSITIONS and relative != "top-left":
            out["floatingPosition"]["relativeTo"] = relative
    for niri, kiri in (("min-width", "minWidth"), ("min-height", "minHeight"), ("max-width", "maxWidth"), ("max-height", "maxHeight")):
        node = child(rule, niri)
        if node and number(node[1]) is not None:
            out[kiri] = max(0, number(node[1]))
    opacity = child(rule, "opacity")
    if opacity and opacity[1] and float_of(opacity[1][0]) is not None:
        out["opacity"] = num(max(0.0, min(1.0, float_of(opacity[1][0]))))
    for niri, kiri, convert in (("focus-ring", "focusRing", ring_rule), ("border", "border", ring_rule),
                                ("shadow", "shadow", shadow_rule), ("tab-indicator", "tabIndicator", tab_indicator_rule)):
        node = child(rule, niri)
        converted = convert(node, warn) if node else None
        if converted:
            out[kiri] = converted
    radius = child(rule, "geometry-corner-radius")
    if radius and not radius_is_global:
        values = [v for v in (float_of(a) for a in radius[1]) if v is not None]
        if len(values) in (1, 4):
            # the effect has one radius per window: niri's four corners (top-left first) give their largest one
            if len(values) == 4 and len(set(values)) > 1:
                warn("window-rule/geometry-corner-radius: different corners are not supported, the largest radius is used for all")
            out["cornerRadius"] = max(0, js_round(max(values)))
    return out


def window_rules(nodes, warn):
    """(Kiri rules, the global geometry-corner-radius or None)"""
    rules = []
    radius = None
    warned = set()
    for rule in find(nodes, "window-rule"):
        matches = find(rule[3], "match")
        exclude_nodes = find(rule[3], "exclude")
        radius_node = child(rule, "geometry-corner-radius")
        # a rule for every window that sets geometry-corner-radius is the global setting
        radius_is_global = not matches and not exclude_nodes and radius_node is not None and len(radius_node[1]) == 1
        if radius_is_global and number(radius_node[1]) is not None:
            radius = max(0, number(radius_node[1]))
        properties = rule_properties(rule, warn, radius_is_global)
        if not properties:
            continue
        excludes = [e for e in (match_of(x, warn) for x in exclude_nodes) if e is not None]
        for m in matches or [None]:  # a rule without match lines applies to every window
            entry = {} if m is None else match_of(m, warn)
            if entry is None:
                continue
            entry.update(properties)
            if excludes:
                entry["exclude"] = excludes
            rules.append(entry)
    return rules, radius


# niri's animations: the setting of each is one text (src/lib/config/definition.ts, animWindowOpen and the others)
ANIMATIONS = [
    ("window-open", "animWindowOpen", "ease-out-expo 150"),
    ("window-close", "animWindowClose", "ease-out-quad 150"),
    ("window-movement", "animWindowMovement", "spring 1 800 0.0001"),
    ("window-resize", "animWindowResize", "spring 1 800 0.0001"),
    ("horizontal-view-movement", "animHorizontalViewMovement", "spring 1 800 0.0001"),
    ("workspace-switch", "animWorkspaceSwitch", "spring 1 1000 0.0001"),
    ("overview-open-close", "animOverviewOpenClose", "spring 1 800 0.0001"),
]
CURVES = ["linear", "ease-out-quad", "ease-out-cubic", "ease-out-expo"]


def format_number(x):
    """the way JavaScript's String(number) writes it (no exponent for the sizes that occur here)"""
    text = format(Decimal(repr(float(x))), "f")
    return text.rstrip("0").rstrip(".") if "." in text else text


def to_float(text):
    """parseFloat of the TypeScript importer: the number a text starts with, or None"""
    m = re.match(r"\s*[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?", text or "")
    return float(m.group()) if m else None


def animation_text(node, fallback, path, warn):
    """niri-config/src/animations.rs Animation::decode_node: `off`, a `spring`, or `duration-ms` and `curve` (the missing
    one of the two from the animation's default easing, or 250 ms / ease-out-cubic when the default is a spring)"""
    if child(node, "custom-shader") is not None:
        warn(f"{path}/custom-shader: niri's custom shaders are GLSL for niri's renderer, not KWin's")
    fallback_kind, *fallback_args = fallback.split(" ")
    spring = child(node, "spring")
    duration = child(node, "duration-ms")
    curve = child(node, "curve")
    if child(node, "off") is not None:
        return "off"
    if spring is not None:
        spring_default = fallback_args if fallback_kind == "spring" else ["1", "800", "0.0001"]
        values = []
        for i, prop in enumerate(("damping-ratio", "stiffness", "epsilon")):
            value = to_float(spring[2].get(prop, ""))
            values.append(spring_default[i] if value is None else format_number(value))
        return "spring " + " ".join(values)
    if duration is None and curve is None:
        return fallback
    easing_default = ["ease-out-cubic", "250"] if fallback_kind == "spring" else [fallback_kind, *fallback_args]
    curve_name, ms = easing_default[0], easing_default[1]
    bezier = []
    if duration is not None and duration[1] and to_float(duration[1][0]) is not None:
        ms = format_number(to_float(duration[1][0]))
    if curve is not None:
        name = curve[1][0] if curve[1] else ""
        points = [to_float(x) for x in curve[1][1:5]]
        if name in CURVES:
            curve_name = name
        elif name == "cubic-bezier" and len(points) == 4 and None not in points:
            curve_name = name
            bezier = [format_number(x) for x in points]
        else:
            warn(f"{path}: unknown curve {name}, niri only has linear, ease-out-quad, ease-out-cubic, ease-out-expo and cubic-bezier with 4 numbers")
    return " ".join([curve_name, ms, *bezier])


# What the importer reads, by path in the config (the blocks that hold options are looked into one level down).
# Everything else is reported as skipped, with the reason from SKIPPED_OPTIONS.
MAPPED_OPTIONS = {
    "binds", "prefer-no-csd", "layout", "input", "gestures", "window-rule", "workspace",
    "layout/gaps", "layout/struts", "layout/center-focused-column", "layout/always-center-single-column",
    "layout/preset-column-widths", "layout/preset-window-heights", "layout/default-column-width",
    "layout/default-column-display", "layout/focus-ring", "layout/border", "layout/tab-indicator", "layout/shadow",
    "layout/insert-hint", "layout/fullscreen-backdrop-color", "layout/background-color", "layout/empty-workspace-above-first",
    "input/warp-mouse-to-focus", "input/focus-follows-mouse", "input/mod-key", "input/workspace-auto-back-and-forth", "gestures/hot-corners",
    "window-rule/match", "window-rule/exclude", "window-rule/open-floating", "window-rule/open-fullscreen",
    "window-rule/default-column-width", "window-rule/default-window-height", "window-rule/geometry-corner-radius",
    "animations/off", "animations/on", "animations/slowdown", "animations/window-open", "animations/window-close",
    "animations/window-movement", "animations/window-resize", "animations/horizontal-view-movement",
    "animations/workspace-switch", "animations/overview-open-close",
    "window-rule/open-maximized", "window-rule/open-maximized-to-edges", "window-rule/open-focused", "window-rule/open-on-workspace",
    "window-rule/default-column-display", "window-rule/default-floating-position", "window-rule/min-width", "window-rule/min-height",
    "window-rule/max-width", "window-rule/max-height", "window-rule/opacity", "window-rule/focus-ring", "window-rule/border",
    "window-rule/shadow", "window-rule/tab-indicator",
    "window-rule/clip-to-geometry",  # Kiri's effect clips every window that has a corner radius to its rounded corners
}
LOOKED_INTO = ["layout", "input", "gestures", "window-rule", "overview", "animations", "hotkey-overlay", "debug"]
SKIPPED_OPTIONS = {
    "include": "KWin scripts cannot read files (tools/niri2kiri.py follows includes)",
    "output": "the display layout is Plasma's (Display settings)",
    "spawn-at-startup": "programs start with Plasma's autostart",
    "spawn-sh-at-startup": "programs start with Plasma's autostart",
    "hotkey-overlay": "Kiri shows no hotkey overlay at startup",
    "screenshot-path": "screenshots are Spectacle's",
    "layer-rule": "layer-shell surfaces (panels, wallpapers) are Plasma's",
    "debug": "niri debug options",
    "environment": "environment variables belong to Plasma (~/.config/plasma-workspace/env)",
    "cursor": "the cursor theme is Plasma's",
    "clipboard": "the clipboard is Klipper's",
    "xwayland-satellite": "KWin runs XWayland itself",
    "switch-events": "KWin scripts get no switch events",
    "recent-windows": "Alt+Tab is KWin's Task Switcher",
    "config-notification": "KWin scripts have no config reload notice",
    "input/keyboard": "Plasma's Keyboard settings (tools/niri2kiri.py --input writes them)",
    "input/touchpad": "Plasma's Touchpad settings (tools/niri2kiri.py --input writes them)",
    "input/mouse": "Plasma's Mouse settings",
    "input/trackpoint": "Plasma's Mouse settings",
    "input/trackball": "Plasma's Mouse settings",
    "input/touch": "Plasma's Touchscreen settings",
    "input/tablet": "Plasma's Drawing Tablet settings",
    "input/mod-key-nested": "only used when niri runs inside another window",
    "overview/zoom": "not configurable yet",
    "overview/backdrop-color": "not configurable yet",
    "overview/workspace-shadow": "not configurable yet",
    "animations/config-notification-open-close": "KWin scripts have no config reload notice to animate",
    "animations/exit-confirmation-open-close": "Kiri has no exit confirmation dialog",
    "animations/screenshot-ui-open": "the screenshot UI is Spectacle's",
    "animations/recent-windows-close": "Alt+Tab is KWin's Task Switcher",
    "window-rule/open-on-output": "Kiri has one layout for all screens",
    "window-rule/on-xdg-activate": "KWin's focus stealing prevention decides",
    "window-rule/block-out-from": "KWin cannot hide a window from screen casts",
    "window-rule/variable-refresh-rate": "adaptive sync is set per output in Plasma's Display settings",
    "window-rule/scroll-factor": "Plasma's input settings; KWin has no per-window scroll scaling",
    "window-rule/pinch-sensitivity": "Plasma's input settings",
    "window-rule/tiled-state": "KWin gives scripts no xdg tiled state",
    "window-rule/background-effect": "the blur effect has no per-window script setting",
    "window-rule/popups": "KWin draws popups itself",
    "window-rule/draw-border-with-background": "the effect draws no background under a border",
    "window-rule/baba-is-float": "the effect has no bobbing animation",
}


def report_unmapped(nodes, warn):
    seen = set()

    def visit(path):
        if path not in seen and path not in MAPPED_OPTIONS:
            seen.add(path)
            warn(f"{path}: {SKIPPED_OPTIONS.get(path, 'not supported by Kiri')}")
    for node in nodes:
        if node[0] in LOOKED_INTO and node[0] not in SKIPPED_OPTIONS:
            for c in node[3]:
                visit(f"{node[0]}/{c[0]}")
        else:
            visit(node[0])


def mod_key(nodes, warn):
    """what niri's Mod stands for: input { mod-key "Alt" }, Super by default"""
    mod = "Meta"
    for blk in find(nodes, "input"):
        node = child(blk, "mod-key")
        if node:
            name = (node[1][0] if node[1] else "Super").lower()
            if name in MOD_KEYS:
                mod = MOD_KEYS[name]
            else:
                warn(f"input/mod-key {node[1][0]}: Kiri cannot bind that modifier, Mod stays Super")
    return mod


def is_spawn_line(line):
    return ": starts a program" in line


def analyse(path):
    """-> binds {action: [keys]}, skipped [text], settings {name: value}"""
    nodes = parse_kdl(path)
    skipped = []
    warn = skipped.append
    binds, bind_skips, steps, pointer, slots = read_binds(path, mod_key(nodes, warn), nodes)
    skipped += bind_skips
    settings = read_settings_inner(nodes, warn)
    settings.update(steps)
    report_unmapped(nodes, warn)
    if pointer is not None:
        # niri has only the binds of the config: the wheel binds Kiri has by default go when the config has none
        settings["pointerBinds"] = pointer
    if slots["column"]:
        settings["columnWidthSet"] = ", ".join(slots["column"])
    if slots["window"]:
        settings["windowHeightSet"] = ", ".join(slots["window"])
    return binds, skipped, settings


def read_settings(path, warn):
    binds, skipped, settings = analyse(path)
    for line in skipped:
        if not is_spawn_line(line):
            warn(line)
    for key, value in list(settings.items()):  # whatever number got through: finite and a sane size
        if isinstance(value, float) and not isinstance(value, bool):
            if math.isfinite(value):
                settings[key] = max(-MAX_PIXELS, min(MAX_PIXELS, value))
            else:
                del settings[key]
        elif isinstance(value, int) and not isinstance(value, bool):
            settings[key] = max(-MAX_PIXELS, min(MAX_PIXELS, value))
    return settings


def read_settings_inner(nodes, warn):
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
        warn("layout/struts: ignored without gaps (Kiri's gaps default is 16, niri's too, so add 'gaps 16' to use them)")
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
    # niri always has dynamic workspaces; Kiri's are an option that stays as the user set it
    if L("empty-workspace-above-first"):
        out["emptyDesktopAboveFirst"] = True
    declared = declared_workspaces(nodes)
    if declared:
        out["namedDesktops"] = json.dumps(declared, separators=(",", ":"))
        if any(node[3] for node in find(nodes, "workspace")):
            warn("workspace blocks: open-on-output and layout are not mapped (the names are)")
    for blk in find(nodes, "input"):
        if child(blk, "warp-mouse-to-focus"):
            out["cursorFollowsFocus"] = True
        if child(blk, "workspace-auto-back-and-forth"):
            out["desktopAutoBackAndForth"] = True
        follows = child(blk, "focus-follows-mouse")
        if follows:
            out["focusFollowsMouse"] = True
            m = re.match(r"\d+(\.\d+)?", follows[2].get("max-scroll-amount", ""))
            # the share of the screen the view may scroll for it; without the property there is no limit
            out["focusFollowsMouseMaxScroll"] = max(0, js_round(float(m.group()))) if m else 100
    for blk in find(nodes, "gestures"):
        corners = child(blk, "hot-corners")
        if corners:
            out["hotCorner"] = child(corners, "off") is None
            named = [child(corners, n) is not None for n in ("top-left", "top-right", "bottom-left", "bottom-right")]
            out["hotCornerTopLeft"] = not any(named) or named[0]
            out["hotCornerTopRight"], out["hotCornerBottomLeft"], out["hotCornerBottomRight"] = named[1:]
        for name, prefix, trigger, size_key in (("dnd-edge-view-scroll", "dndEdgeViewScroll", "trigger-width", "TriggerWidth"),
                                             ("dnd-edge-workspace-switch", "dndEdgeWorkspaceSwitch", "trigger-height", "TriggerHeight")):
            node = child(blk, name)
            for niri, key in ((trigger, prefix + size_key), ("delay-ms", prefix + "Delay"), ("max-speed", prefix + "MaxSpeed")):
                value = child(node, niri)
                if value and value[1]:
                    try:
                        out[key] = js_round(float(value[1][0])) if niri == "delay-ms" else float(value[1][0])
                    except ValueError:
                        pass
    for blk in find(nodes, "animations"):
        # niri: `off` of any block turns the animations off, `on` turns them on again; the last slowdown wins
        if child(blk, "off") is not None:
            out["animationsOff"] = True
        if child(blk, "on") is not None:
            out["animationsOff"] = False
        slowdown = child(blk, "slowdown")
        if slowdown and slowdown[1] and to_float(slowdown[1][0]) is not None:
            out["animationsSlowdown"] = max(0.0, to_float(slowdown[1][0]))
        # an animation node replaces the whole animation of the blocks before it
        for name, key, fallback in ANIMATIONS:
            node = child(blk, name)
            if node is not None:
                out[key] = animation_text(node, fallback, "animations/" + name, warn)
    for blk in find(nodes, "overview"):
        zoom = child(blk, "zoom")
        if zoom and zoom[1]:
            try:
                out["overviewZoom"] = max(0.0, min(1.0, float(zoom[1][0])))
            except ValueError:
                pass
        color_setting(child(blk, "backdrop-color"), "overviewBackdropColor", out, warn)
        shadow = child(blk, "workspace-shadow")
        if shadow:
            if child(shadow, "off"):
                out["overviewShadowEnabled"] = False
            if child(shadow, "on"):
                out["overviewShadowEnabled"] = True
            offset = child(shadow, "offset")
            if offset:
                for axis, key in (("x", "overviewShadowOffsetX"), ("y", "overviewShadowOffsetY")):
                    try:
                        out[key] = float(offset[2][axis])
                    except (KeyError, ValueError):
                        pass
            for name, key in (("softness", "overviewShadowSoftness"), ("spread", "overviewShadowSpread")):
                n = child(shadow, name)
                if n and n[1]:
                    try:
                        out[key] = float(n[1][0])
                    except ValueError:
                        pass
            color_setting(child(shadow, "color"), "overviewShadowColor", out, warn)

    rules, radius = window_rules(nodes, warn)
    if radius is not None:
        out["cornerRadius"] = radius
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
    if not 1 <= len(pos) <= 2 or flags - {"--settings", "--apply", "--input", "--no-spawn", "--remove-spawn", "--json"}:
        sys.exit(__doc__.strip())
    shortcuts_file = pos[1] if len(pos) == 2 else "~/.config/kglobalshortcutsrc"
    warn = lambda msg: print("# skipped:", msg, file=sys.stderr)

    if "--json" in flags:
        # what the TypeScript importer (src/lib/niri/import.ts) makes of the file: settings, keys and the skipped lines
        binds, skipped, settings = analyse(pos[0])
        print(json.dumps({"settings": settings, "shortcutKeys": binds, "skipped": skipped}, sort_keys=True))
        return
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
        binds = analyse(pos[0])[0]
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
