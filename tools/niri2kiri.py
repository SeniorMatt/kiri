#!/usr/bin/env python3
"""Turn the binds of a niri config.kdl into a [kiri] section for kglobalshortcutsrc.

Usage: niri2kiri.py ~/.config/niri/config.kdl [~/.config/kglobalshortcutsrc]

Kiri has to have run once, so its actions are already in kglobalshortcutsrc.
Prints the new [kiri] section; paste it over the old one and log in again.
"""
import re
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
    "toggle-column-tabbed-display": "column-toggle-stacked",
    "close-window": "window-close",
    "toggle-overview": "overview",
    "expand-column-to-available-width": "column-expand",
    "switch-preset-window-height": "cycle-preset-heights",
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


def strip_comments(text):
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    return "\n".join(line.split("//", 1)[0] for line in text.splitlines())


def read_binds(path):
    text = strip_comments(Path(path).expanduser().read_text())
    start = re.search(r"^\s*binds\s*\{", text, re.M)
    if start is None:
        sys.exit("no binds section in " + str(path))
    binds, skipped = {}, []
    for line in text[start.end():].splitlines():
        line = line.strip()
        if line == "}":
            break
        if not line or line.startswith("/-"):
            continue
        m = re.match(r"(\S+)[^{]*\{\s*([^;}]+);?\s*\}", line)
        if m is None:
            continue
        key, command = m.group(1), m.group(2).split()
        name, args = command[0], [a.strip('"') for a in command[1:]]
        if name in NUMBERED and args and args[0].isdigit():
            action = NUMBERED[name].format(args[0])
        elif name == "set-column-width" and args:
            action = "column-width-decrease" if args[0].startswith("-") else "column-width-increase"
        else:
            action = ACTIONS.get(name)
        kiri_key = convert_key(key)
        if action is None or kiri_key is None:
            skipped.append(f"{key} {' '.join(command)}")
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


def main():
    if len(sys.argv) not in (2, 3):
        sys.exit(__doc__.strip())
    shortcuts_file = sys.argv[2] if len(sys.argv) == 3 else "~/.config/kglobalshortcutsrc"
    binds, skipped = read_binds(sys.argv[1])
    entries = read_kiri_section(shortcuts_file)
    if not entries:
        sys.exit(f"no [kiri] section in {shortcuts_file}, enable Kiri once first")

    print("[kiri]")
    print("_k_friendly_name=Kiri")
    for name in sorted(entries):
        default, description = entries[name]
        keys = "\\t".join(k.replace(",", "\\,") for k in binds.get(name, [])) or "none"
        print(f"{name}={keys},{default},{description}")

    missing = sorted(set(binds) - set(entries))
    for line in skipped + [f"{a} (not in this Kiri version)" for a in missing]:
        print("# skipped:", line, file=sys.stderr)


if __name__ == "__main__":
    main()
