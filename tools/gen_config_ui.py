#!/usr/bin/env python3
"""Generates package/contents/ui/config.ui. The Shortcuts tab grid is kept from the existing file."""
import re, sys
from xml.sax.saxutils import escape

PATH = "package/contents/ui/config.ui"
old = open(PATH, encoding="utf-8").read()
start = old.index('<layout class="QGridLayout" name="grid_shortcuts">') + len('<layout class="QGridLayout" name="grid_shortcuts">')
end = re.compile(r"^\s*</layout>", re.M).search(old, start).start()
grid = old[start:end]

# parse the existing grid into sections of (label, key name), so rows can be added and renumbered
sections = []
for m in re.finditer(r'<item row="\d+" column="0"( colspan="3")?><widget class="QLabel"><property name="text"><string>(.*?)</string></property></widget></item>\s*'
                     r'(?:<item row="\d+" column="1"><widget class="KKeySequenceWidget" name="kcfg_key1_(\w+)")?', grid):
    if m.group(1):
        sections.append([m.group(2), []])
    elif m.group(3):
        sections[-1][1].append((m.group(2), m.group(3)))

# actions that had no field yet: (after this key, label, key)
extra_rows = [
    ("cycle_preset_widths_reverse", "Expand column to available width", "column_width_expand"),
    ("window_height_increase_down", "Cycle preset window heights", "window_height_cycle_presets"),
    ("window_height_cycle_presets", "Cycle preset window heights in reverse", "window_height_cycle_presets_reverse"),
    ("window_height_cycle_presets_reverse", "Reset window height", "window_height_reset"),
]
for after, label, key in extra_rows:
    for _, rows in sections:
        names = [k for _, k in rows]
        if key in names:
            break
        if after in names:
            rows.insert(names.index(after) + 1, (label, key))
            break

def keyfield(row, col, key):
    return (f'<item row="{row}" column="{col}"><widget class="KKeySequenceWidget" name="kcfg_key{col}_{key}">\n'
            '<property name="multiKeyShortcutsAllowed"><bool>false</bool></property>\n'
            '<property name="checkForConflictsAgainst"><set>KKeySequenceWidget::None</set></property>\n'
            '<property name="kcfg_property"><cstring>keySequence</cstring></property>\n'
            '<property name="kcfg_propertyNotify"><cstring>2keySequenceChanged(QKeySequence)</cstring></property>\n'
            '</widget></item>')

out = []
row = 0
for title, rows in sections:
    out.append(f'<item row="{row}" column="0" colspan="3"><widget class="QLabel"><property name="text"><string>{title}</string></property></widget></item>')
    row += 1
    if title == sections[0][0]:
        out.append(f'<item row="{row}" column="1"><widget class="QLabel"><property name="text"><string>Key</string></property></widget></item>')
        out.append(f'<item row="{row}" column="2"><widget class="QLabel"><property name="text"><string>Alternate key</string></property></widget></item>')
        row += 1
    for label, key in rows:
        out.append(f'<item row="{row}" column="0"><widget class="QLabel"><property name="text"><string>{label}</string></property></widget></item>')
        out.append(keyfield(row, 1, key))
        out.append(keyfield(row, 2, key))
        row += 1
shortcut_items = "\n".join(out)

def prop(name, inner):
    return f'<property name="{name}">{inner}</property>'

def common(tip):
    return prop("toolTip", f"<string>{escape(tip)}</string>") if tip else ""

class W:
    """a form row: (label, widget xml) or a spanning widget"""

def check(name, text, tip=""):
    return ("span", f'<widget class="QCheckBox" name="kcfg_{name}">{prop("text", f"<string>{escape(text)}</string>")}{common(tip)}</widget>')

def radio(name, text, tip=""):
    return ("span", f'<widget class="QRadioButton" name="kcfg_{name}">{prop("text", f"<string>{escape(text)}</string>")}{common(tip)}</widget>')

def spin(name, label, tip, lo, hi, suffix=" px"):
    w = (f'<widget class="QSpinBox" name="kcfg_{name}">{prop("suffix", f"<string>{escape(suffix)}</string>")}'
         f'{prop("minimum", f"<number>{lo}</number>")}{prop("maximum", f"<number>{hi}</number>")}{common(tip)}</widget>')
    return ("row", label, w, tip)

def dspin(name, label, tip, lo, hi, step, decimals=2):
    w = (f'<widget class="QDoubleSpinBox" name="kcfg_{name}">{prop("decimals", f"<number>{decimals}</number>")}'
         f'{prop("minimum", f"<double>{lo}</double>")}{prop("maximum", f"<double>{hi}</double>")}'
         f'{prop("singleStep", f"<double>{step}</double>")}{common(tip)}</widget>')
    return ("row", label, w, tip)

def line(name, label, tip, placeholder=""):
    w = f'<widget class="QLineEdit" name="kcfg_{name}">{common(tip)}{prop("placeholderText", f"<string>{escape(placeholder)}</string>") if placeholder else ""}</widget>'
    return ("row", label, w, tip)

def color(name, label, tip):
    w = f'<widget class="KColorButton" name="kcfg_{name}">{common(tip)}</widget>'
    return ("row", label, w, tip)

def combo(name, label, tip, items):
    its = "".join(f'<item>{prop("text", f"<string>{escape(i)}</string>")}</item>' for i in items)
    w = f'<widget class="QComboBox" name="kcfg_{name}">{common(tip)}{its}</widget>'
    return ("row", label, w, tip)

def text(name, label, tip, height=90, mono=True, placeholder="", fixed=False):
    f = prop("font", "<font><family>Monospace</family></font>") if mono else ""
    w = (f'<widget class="QPlainTextEdit" name="kcfg_{name}">{prop("tabChangesFocus", "<bool>true</bool>")}'
         f'{prop("lineWrapMode", "<enum>QPlainTextEdit::NoWrap</enum>")}{f}{common(tip)}'
         f'{prop("minimumSize", f"<size><width>0</width><height>{height}</height></size>")}'
         + (prop("maximumSize", f"<size><width>16777215</width><height>{height}</height></size>") if fixed else "")
         + (prop("placeholderText", f"<string>{escape(placeholder)}</string>") if placeholder else "") + '</widget>')
    return ("block", label, w, tip)

def note(t):
    return ("span", f'<widget class="QLabel">{prop("text", f"<string>{escape(t)}</string>")}{prop("wordWrap", "<bool>true</bool>")}</widget>')

def group(title, rows):
    out = ['<item><widget class="QGroupBox">', prop("title", f"<string>{escape(title)}</string>"), '<layout class="QFormLayout">',
           prop("fieldGrowthPolicy", "<enum>QFormLayout::AllNonFixedFieldsGrow</enum>")]
    r = 0
    for row in rows:
        kind = row[0]
        if kind == "span":
            out.append(f'<item row="{r}" column="0" colspan="2">{row[1]}</item>')
        elif kind == "row":
            out.append(f'<item row="{r}" column="0"><widget class="QLabel">{prop("text", f"<string>{escape(row[1])}</string>")}{common(row[3])}</widget></item>')
            out.append(f'<item row="{r}" column="1">{row[2]}</item>')
        else:  # block: label above a wide widget
            out.append(f'<item row="{r}" column="0" colspan="2"><widget class="QLabel">{prop("text", f"<string>{escape(row[1])}</string>")}</widget></item>')
            r += 1
            out.append(f'<item row="{r}" column="0" colspan="2">{row[2]}</item>')
        r += 1
    out.append('</layout></widget></item>')
    return "".join(out)

def tab(name, title, groups):
    return (f'<widget class="QWidget" name="tab_{name}"><attribute name="title"><string>{escape(title)}</string></attribute>'
            f'<layout class="QVBoxLayout">{prop("margin", "<number>0</number>")}<item><widget class="QScrollArea" name="scroll_{name}">'
            f'{prop("frameShape", "<enum>QFrame::NoFrame</enum>")}{prop("widgetResizable", "<bool>true</bool>")}'
            f'<widget class="QWidget" name="scrollContents_{name}"><layout class="QVBoxLayout">'
            + "".join(groups) +
            '<item><spacer name="spacer_' + name + '"><property name="orientation"><enum>Qt::Vertical</enum></property>'
            '<property name="sizeHint" stdset="0"><size><width>20</width><height>20</height></size></property></spacer></item>'
            '</layout></widget></widget></item></layout></widget>')

layout_tab = tab("layout", "Layout", [
    group("Gaps", [
        spin("gapsInnerHorizontal", "Between columns:", "Horizontal gap between neighbouring columns", 0, 999),
        spin("gapsInnerVertical", "Between windows:", "Vertical gap between windows in a column", 0, 999),
        spin("gapsOuterTop", "Top:", "Gap between the windows and the top screen edge", 0, 999),
        spin("gapsOuterBottom", "Bottom:", "Gap between the windows and the bottom screen edge", 0, 999),
        spin("gapsOuterLeft", "Left:", "Gap between the windows and the left screen edge", 0, 999),
        spin("gapsOuterRight", "Right:", "Gap between the windows and the right screen edge", 0, 999),
    ]),
    group("Column width and height", [
        line("defaultColumnWidth", "Default column width:", "Width of new columns, like 50% or 800px. Empty keeps the window's own width", "window's own width"),
        line("presetWidths", "Preset widths:", "Widths used when cycling column width. Comma-separated, units: px and %"),
        line("presetHeights", "Preset heights:", "Heights used when cycling window height. Comma-separated, units: px and %"),
        spin("verticalResizeStep", "Height resize step:", "Step when making a window taller or shorter with a key", 1, 999),
        check("resizeNeighborColumn", "Resize the neighbour column too", "When dragging a column's edge, inversely resize the column on the other side"),
    ]),
    group("Scrolling and centering", [
        radio("scrollingLazy", "Scroll only as needed", "Move the view just enough to show the focused column"),
        radio("scrollingCentered", "Always center the focused column", "Keep the focused column in the middle of the screen"),
        radio("scrollingGrouped", "Center the visible columns", "Center the group of columns that fit on screen"),
        radio("scrollingOnOverflow", "Center only when columns overflow", "Like niri's center-focused-column \"on-overflow\": no scrolling while the focused column fits next to its neighbours"),
        check("centerGridWhenFits", "Center all columns when they fit", "If every column fits on screen, center them instead of aligning to the left"),
        check("alwaysCenterSingleColumn", "Always center a single column", "A lone column is centered even if it is wider than the screen allows otherwise"),
        spin("manualScrollStep", "Manual scroll step:", "Distance moved by the scroll left/right keys", 1, 99999),
    ]),
])

appearance_tab = tab("appearance", "Appearance", [
    group("Focus ring", [
        check("focusRingEnabled", "Draw a ring around the focused window"),
        spin("focusRingWidth", "Width:", "Thickness of the ring", 0, 99),
        color("focusRingActiveColor", "Active color:", "Ring color on the active screen"),
        color("focusRingInactiveColor", "Inactive color:", "Ring color when the screen is not active"),
    ]),
    group("Border", [
        check("borderEnabled", "Draw a border around every window", "Always-visible border, drawn inside the window frame"),
        spin("borderWidth", "Width:", "Thickness of the border", 0, 99),
        color("borderActiveColor", "Active color:", "Border color of the focused window"),
        color("borderInactiveColor", "Inactive color:", "Border color of other windows"),
    ]),
    group("Tab indicator (tabbed columns)", [
        check("tabIndicatorEnabled", "Show the tab indicator", "A strip next to a tabbed column showing its windows"),
        check("tabIndicatorHideWhenSingleTab", "Hide it when the column has one window"),
        combo("tabIndicatorPosition", "Position:", "Side of the column where the indicator is drawn", ["Left", "Right", "Top", "Bottom"]),
        spin("tabIndicatorWidth", "Thickness:", "Thickness of the indicator strip", 1, 99),
        spin("tabIndicatorGap", "Gap to column:", "Distance between the column and the indicator", 0, 99),
        dspin("tabIndicatorLength", "Length:", "Length of the strip as a fraction of the column side (1 = full)", 0.05, 1.0, 0.05),
    ]),
    group("Other", [
        spin("offScreenOpacity", "Off-screen window opacity:", "Opacity of windows that are not fully visible", 0, 100, " %"),
    ]),
])

behavior_tab = tab("behavior", "Behavior", [
    group("Windows", [
        check("untileOnDrag", "Float a window when it is dragged", "Dragging a tiled window takes it out of the grid"),
        check("tabbedColumnsByDefault", "New columns are tabbed", "New columns start in tabbed display (only the active window is visible)"),
        check("cursorFollowsFocus", "Cursor follows focus (experimental)", "Move the mouse cursor to a window when it gains focus"),
        check("skipSwitcher", "Tiled windows skip Alt+Tab", "Hide tiled windows from the window switcher"),
        line("tiledDesktops", "Tiled desktops:", "Regex matched against virtual desktop names. Only matching desktops are tiled"),
    ]),
    group("Maximized and full-screen windows", [
        check("tileMaximized", "Keep maximized windows in the grid", "They stay in their column and fill the work area; they stay maximized when focus moves away"),
        check("tileFullScreen", "Keep full-screen windows in the grid", "They stay in their column and fill the screen; you can scroll past them"),
        check("reMaximize", "Restore maximized state on focus", "Re-maximize and re-fullscreen tiled windows when they are focused again"),
    ]),
    group("Stacking order", [
        radio("tiledKeepBelow", "Tiled windows are kept below", "Sets \"Keep Below\" on tiled windows so floating ones stay on top"),
        radio("floatingKeepAbove", "Floating windows are kept above", "Sets \"Keep Above\" on floating windows"),
        radio("noLayering", "Do not change the stacking order"),
    ]),
])

gestures_tab = tab("gestures", "Gestures and Animations", [
    group("Touchpad gestures (Wayland only)", [
        check("gestureScroll", "Scroll with a three-finger horizontal swipe"),
        check("gestureScrollInvert", "Natural scrolling", "Invert the swipe direction"),
        spin("gestureScrollStep", "Scroll distance per swipe:", "Distance scrolled by one edge-to-edge swipe", 1, 99999),
        spin("gestureSettleDuration", "Settle time:", "How long the view keeps following the fingers' momentum after release", 0, 5000, " ms"),
        check("gestureDesktopSwitch", "Switch desktops with a vertical swipe", "Three-finger swipe up/down changes the virtual desktop"),
    ]),
    group("Animations", [
        spin("closeRelayoutDelay", "Delay after closing a window:", "Wait this long before the other columns close the gap, so the closing animation can finish", 0, 5000, " ms"),
    ]),
])

rules_tab = tab("windowRules", "Window Rules", [
    group("Simple rules", [
        note("One entry per line. Entries are window classes (regular expressions are allowed, e.g. org\\.kde\\..*). "
             "Find a class with: qdbus6 org.kde.KWin /KWin org.kde.KWin.queryWindowInfo"),
        text("floatClasses", "Always float these windows:", "Window classes that are never tiled", 64, placeholder="calc\nmpv", fixed=True),
        text("tileClasses", "Always tile these windows:", "Window classes that are always tiled, even if Kiri would float them", 64, placeholder="kfind", fixed=True),
        text("columnWidthRules", "Column width per window:", "One class=width per line, like firefox=66.667%", 64, placeholder="firefox=66.667%\norg\\.kde\\.dolphin=800px", fixed=True),
    ]),
    group("Advanced: JSON rules", [
        note("Rules with a caption match, applied together with the simple rules above. Fields: class, caption (regexes), tile (true/false), width. "
             "Example: {\"class\": \"steam\", \"caption\": \"Friends List\", \"tile\": false}"),
        text("windowRules", "JSON list:", "A JSON array of rule objects", 220),
    ]),
])

niri_tab = tab("niri", "niri", [
    group("Import niri config", [
        note("Paste the contents of your niri config.kdl (usually ~/.config/niri/config.kdl) below and tick the box. Kiri reads it every time the settings change "
             "and applies it on top of the other tabs, so the values it sets win over the Layout, Appearance and Behavior tabs. "
             "It sets: the key binds (Shortcuts; keys typed in the Shortcuts tab still win), gaps and struts, center-focused-column, always-center-single-column, "
             "preset column widths and window heights, default column width and display, focus ring, border, tab indicator, warp-mouse-to-focus, "
             "and window rules that set open-floating or default-column-width (matched by app-id and title). "
             "Everything else in the file is ignored; lines Kiri can't use are listed in the KWin log."),
        check("niriConfigEnabled", "Use this niri config", "When off, the pasted text is kept but not used"),
        text("niriConfig", "niri config.kdl:", "The text of your niri config", 360, placeholder="layout {\n    gaps 16\n}\nbinds {\n    Mod+H { focus-column-left; }\n}"),
    ]),
])

shortcuts_tab = ('<widget class="QWidget" name="tab_shortcuts"><attribute name="title"><string>Shortcuts</string></attribute><layout class="QVBoxLayout">'
    '<item><widget class="QLabel" name="label_shortcutsRule"><property name="text"><string>Keys set here take priority and are copied to the Kiri group in System Settings &gt; Shortcuts, without a conflict check. Leave both fields empty to use the keys set in System Settings.</string></property><property name="wordWrap"><bool>true</bool></property></widget></item>'
    '<item><widget class="QScrollArea" name="scroll_shortcuts"><property name="frameShape"><enum>QFrame::NoFrame</enum></property><property name="widgetResizable"><bool>true</bool></property>'
    '<widget class="QWidget" name="scrollContents_shortcuts"><layout class="QGridLayout" name="grid_shortcuts">\n' + shortcut_items + '\n</layout></widget></widget></item></layout></widget>')

doc = ('<?xml version="1.0" encoding="UTF-8"?>\n<ui version="4.0">\n<class>KWin::KarouselConfigForm</class>\n'
       '<widget class="QWidget" name="KWin::KarouselConfigForm"><property name="windowTitle"><string>Kiri</string></property>'
       '<layout class="QVBoxLayout" name="layout_main"><item><widget class="QTabWidget" name="tabContainer">'
       + layout_tab + appearance_tab + behavior_tab + gestures_tab + rules_tab + shortcuts_tab + niri_tab +
       '</widget></item><item><widget class="QLabel" name="label"><property name="text"><string>Changes apply as soon as you press Apply.</string></property></widget></item></layout></widget>\n'
       '<resources/><connections/></ui>\n')
open(PATH, "w", encoding="utf-8").write(doc)
