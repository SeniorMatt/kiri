#!/usr/bin/env python3
"""Generates package/contents/ui/config.ui (Kiri's settings page) from the two definition files.

    python3 tools/gen_config_ui.py          # run from the repository root

HOW KEYS GET A PLACE ON THE PAGE
  Settings tabs (not Shortcuts) are built from src/lib/config/definition.ts. Every key there ends up in the page:
  1. If the key has a row in FIELDS below, it goes where that row says: (tab, group), in the order of FIELDS.
     The widget kind comes from the key's type in definition.ts (Bool: check box, UInt: spin box, Double: decimal
     spin box, String: line edit, Enum: drop-down). FIELDS only adds the label, tooltip, units and limits.
  2. Else, if the entry in definition.ts has a  section: "Tab/Group"  field (e.g. section: "Appearance/Shadow"),
     it goes there. Use this for new keys, it needs no change in this file. A "// comment" after the entry's name is
     used as its tooltip, and the label is made from the key name (focusRingWidth -> "Focus ring width").
  3. Else it is placed by its name (AUTO_TABS below: gesture* -> Gestures & Overview, shadow* -> Appearance,
     anim*/*Duration -> Animations, *Rules -> Window Rules, ...) in a group called "More" of that tab, and
     anything unknown lands in Advanced > More. Number fields get " ms"/" px"/" %" from the name (*Delay, *Duration,
     ...Width, ...Percent), so the page stays consistent without manual work.
  The script prints the keys it placed by rule 2 or 3 so that they can get a FIELDS row later (optional).
  Tab order is TABS; groups and rows appear in the order of FIELDS (auto-placed ones after them).
  Config key names and stored values never depend on this file: every widget is called kcfg_<key>.

  The Shortcuts tab is built from src/lib/keyBindings/definition.ts: a description "Focus: column left" becomes the
  row "Column left" in the group "Focus" (one page per group, listed on the left). Descriptions without "Group: "
  go to "Other". Numbered bindings ("{}" in name and description) get rows 1 to 9. Group order is SHORTCUT_GROUPS,
  unknown groups follow alphabetically; rows are sorted alphabetically like System Settings does.
"""
import re
from xml.sax.saxutils import escape

PATH = "package/contents/ui/config.ui"
CONFIG_DEF = "src/lib/config/definition.ts"
KEYS_DEF = "src/lib/keyBindings/definition.ts"

# "&" is a mnemonic marker in Qt tab titles, "&&" shows one
TABS = ["Layout", "Focus & Mouse", "Animations", "Appearance", "Gestures & Overview", "Window Rules", "Shortcuts", "Advanced"]
LABEL_WIDTH = 170  # px, the same in every group so the fields line up from group to group
SHORTCUT_GROUPS = ["Focus", "Move", "Column", "Width", "Height", "Window", "Scroll", "Desktop", "Screen", "Overview"]

# name pattern -> tab, for keys that have no FIELDS row and no section field. First match wins.
AUTO_TABS = [
    (r"^(gesture|swipe|pinch|touchpad|hotCorner|overview)", "Gestures & Overview"),
    (r"(anim|Duration|Easing|Spring|Curve)", "Animations"),
    (r"^(focusRing|border|shadow|corner|decoration|tabIndicator|opacity|offScreenOpacity|color|theme|blur)", "Appearance"),
    (r"(Rules?|Classes)$", "Window Rules"),
    (r"^(focus|cursor|mouse|pointer|drag|untile|drop|skip)", "Focus & Mouse"),
    (r"^(gaps?|scroll|center|column|window|width|height|preset|default|tile|manual|vertical|workspace|desktop|strut)", "Layout"),
]

# Extra rows: (key, tab, group, label, tooltip, options). Options: suffix, lo, hi, step, decimals, special (spin box text
# for the lowest value), radio, color, lines (text edit height in lines), placeholder, mono, labels (drop-down texts, in
# the order of the choices), above (label above the field).
def F(key, tab, group, label, tip="", **o):
    return (key, tab, group, label, tip, o)

FMT = " Format: off, or spring DAMPING STIFFNESS EPSILON (niri's spring: 1 800 0.0001), or CURVE MS with the curve one of linear, ease-out-quad, ease-out-cubic, ease-out-expo (ease-out-expo 150), or cubic-bezier MS X1 Y1 X2 Y2"

FIELDS = [
    # Layout
    F("gapsInnerHorizontal", "Layout", "Gaps", "Between columns", "Horizontal gap between neighbouring columns", suffix="px", hi=999),
    F("gapsInnerVertical", "Layout", "Gaps", "Between windows", "Vertical gap between windows in a column", suffix="px", hi=999),
    F("gapsOuterTop", "Layout", "Outer gaps", "Top", "Gap between the windows and the top screen edge", suffix="px", hi=999),
    F("gapsOuterBottom", "Layout", "Outer gaps", "Bottom", "Gap between the windows and the bottom screen edge", suffix="px", hi=999),
    F("gapsOuterLeft", "Layout", "Outer gaps", "Left", "Gap between the windows and the left screen edge", suffix="px", hi=999),
    F("gapsOuterRight", "Layout", "Outer gaps", "Right", "Gap between the windows and the right screen edge", suffix="px", hi=999),
    F("defaultColumnWidth", "Layout", "Column width", "Default width", "Width of new columns, like 50% or 800px. Empty keeps the window's own width", placeholder="window's own width"),
    F("presetWidths", "Layout", "Column width", "Preset widths", "Widths used when cycling the column width. Comma-separated, units: px and %", placeholder="33.333%, 50%, 66.667%"),
    F("columnWidthStep", "Layout", "Column width", "Key step", "Share of the screen a column grows or shrinks by with the width keys (niri: set-column-width \"+10%\")", suffix="%", lo=1, hi=100),
    F("presetHeights", "Layout", "Window height", "Preset heights", "Heights used when cycling the window height. Comma-separated, units: px and %", placeholder="33.333%, 50%, 66.667%"),
    F("columnWidthSet", "Layout", "Column width", "Widths to set", "Sizes for the \"Width: set to entry N\" keys, like niri's set-column-width: 50% or 800 sets the width, +10% or -100 changes it. Comma-separated, entry 1 is the first", placeholder="50%, 800, +10%"),
    F("windowHeightSet", "Layout", "Window height", "Heights to set", "Sizes for the \"Height: set to entry N\" keys, like niri's set-window-height: 50% or 400 sets the height, +10% or -100 changes it. Comma-separated", placeholder="50%, 400, +10%"),
    F("windowHeightStep", "Layout", "Window height", "Key step", "Share of the screen a window grows or shrinks by with the height keys", suffix="%", lo=1, hi=100),
    F("verticalResizeStep", "Layout", "Window height", "Fine key step", "Step when making a window taller or shorter with the up/down resize keys", suffix="px", lo=1, hi=999),
    F("scrollingLazy", "Layout", "Centering", "Focused column", "Move the view just enough to show the focused column (niri: never)", radio=True, label_text="Scroll only as needed (niri)"),
    F("scrollingCentered", "Layout", "Centering", "", "Keep the focused column in the middle of the screen (niri: always)", radio=True, label_text="Always center it"),
    F("scrollingOnOverflow", "Layout", "Centering", "", "No scrolling while the focused column fits next to its neighbours, otherwise center it (niri: on-overflow)", radio=True, label_text="Center it when columns overflow"),
    F("scrollingGrouped", "Layout", "Centering", "", "Center the group of columns that fit on screen", radio=True, label_text="Center all visible columns"),
    F("centerGridWhenFits", "Layout", "Centering", "", "If every column fits on screen, center them instead of aligning to the left", label_text="Center all columns when they fit"),
    F("alwaysCenterSingleColumn", "Layout", "Centering", "", "A lone column is centered even if the other settings would not", label_text="Always center a single column"),
    F("manualScrollStep", "Layout", "Scrolling", "Scroll key distance", "Distance moved by the scroll left/right keys", suffix="px", lo=1, hi=99999),
    F("tabbedColumnsByDefault", "Layout", "Windows", "", "New columns start in tabbed display (only the active window is visible)", label_text="New columns are tabbed"),
    F("tileMaximized", "Layout", "Windows", "", "They stay in their column and fill the work area; they stay maximized when focus moves away", label_text="Keep maximized windows in the grid"),
    F("tileFullScreen", "Layout", "Windows", "", "They stay in their column and fill the screen; you can scroll past them", label_text="Keep full-screen windows in the grid"),
    F("reMaximize", "Layout", "Windows", "", "Re-maximize and re-fullscreen tiled windows when they are focused again", label_text="Restore maximized and full-screen state on focus"),

    # Focus & Mouse
    F("focusFollowsMouse", "Focus & Mouse", "Focus", "", "Like niri: the window under the mouse gets the focus, except while a Plasma popup such as the launcher is open. Kiri sets KWin's focus policy to \"Click to focus\" when installing", label_text="Focus follows mouse"),
    F("focusFollowsMouseMaxScroll", "Focus & Mouse", "Focus", "Max scroll", "Like niri's max-scroll-amount: do not focus a window that needs more scrolling than this to be fully shown, in percent of the screen width", suffix="%", hi=100),
    F("cursorFollowsFocus", "Focus & Mouse", "Focus", "", "Move the mouse cursor to a window focused from the keyboard (niri: warp-mouse-to-focus)", label_text="Cursor follows keyboard focus"),
    F("skipSwitcher", "Focus & Mouse", "Focus", "", "Hide tiled windows from the window switcher", label_text="Hide tiled windows from Alt+Tab"),
    F("pointerBinds", "Focus & Mouse", "Mouse wheel and buttons", "Binds", "Like niri's Mod+WheelScrollDown binds: entries <modifiers>+<trigger>=<Kiri action>[@<cooldown ms>] separated by semicolons. Triggers: WheelScrollUp/Down/Left/Right, MouseLeft/Right/Middle/Back/Forward. The action is a name from the Shortcuts list, like desktop-next", lines=5, above=True),
    F("untileOnDrag", "Focus & Mouse", "Dragging windows", "", "Dragging a tiled window takes it out of the grid", label_text="Float a window when it is dragged"),
    F("dropToTile", "Focus & Mouse", "Dragging windows", "", "Like niri: a window dragged out of the grid goes back in at the gap closest to the cursor when you let go", label_text="Tile a window where it is dropped"),
    F("resizeNeighborColumn", "Focus & Mouse", "Dragging windows", "", "When dragging a column's edge, inversely resize the column on the other side", label_text="Resize the neighbouring column too"),

    # Animations
    F("closeRelayoutDelay", "Animations", "Closing windows", "Delay before the gap closes", "Wait this long before the other columns close the gap, so the closing animation can finish", suffix="ms", hi=5000, special="None"),

    F("animationsOff", "Animations", "All animations", "", "Like niri's `off` in the animations block: every animation ends at once", label_text="Turn off all animations"),
    F("animationsSlowdown", "Animations", "All animations", "Slow down by", "Like niri's `slowdown`: all animations take this many times as long. Below 1 they are faster. It comes on top of Plasma's animation speed", lo=0.0, hi=100.0, step=0.1, decimals=2, suffix="x"),
    F("animWindowOpen", "Animations", "Windows", "Open", "niri's window-open (a new window scales up and fades in)."+FMT, placeholder="ease-out-expo 150"),
    F("animWindowClose", "Animations", "Windows", "Close", "niri's window-close (a closing window shrinks and fades out)."+FMT, placeholder="ease-out-quad 150"),
    F("animWindowMovement", "Animations", "Windows", "Movement", "niri's window-movement (windows that move to a new place; a move that only goes sideways uses the view movement below)."+FMT, placeholder="spring 1 800 0.0001"),
    F("animWindowResize", "Animations", "Windows", "Resize", "niri's window-resize (the old contents cross-fade into the new ones)."+FMT, placeholder="spring 1 800 0.0001"),
    F("animHorizontalViewMovement", "Animations", "View and desktops", "View movement", "niri's horizontal-view-movement (the columns scroll sideways, also where a touchpad swipe settles)."+FMT, placeholder="spring 1 800 0.0001"),
    F("animWorkspaceSwitch", "Animations", "View and desktops", "Desktop switch", "niri's workspace-switch (also where the desktops settle after a swipe or drag)."+FMT, placeholder="spring 1 1000 0.0001"),
    F("animOverviewOpenClose", "Animations", "View and desktops", "Overview", "niri's overview-open-close."+FMT, placeholder="spring 1 800 0.0001"),

    # Appearance
    F("hideTitlebars", "Appearance", "Windows", "", "Like niri: tiled windows lose their title bar and frame (the focus ring is the outline). They get them back when they float or Kiri stops", label_text="Hide title bars of tiled windows"),
    F("cornerRadius", "Appearance", "Windows", "Corner radius", "Rounds window corners, needs the Kiri decorations effect (0 = square, like niri's default)", suffix="px", hi=99),
    F("offScreenOpacity", "Appearance", "Windows", "Off-screen opacity", "Opacity of windows that are not fully visible", suffix="%", hi=100),
    F("focusRingEnabled", "Appearance", "Focus ring", "", "Draw a ring around the focused window", label_text="Show a focus ring around the focused window"),
    F("focusRingWidth", "Appearance", "Focus ring", "Width", "Thickness of the ring", suffix="px", hi=99),
    F("focusRingActiveColor", "Appearance", "Focus ring", "Active color", "Ring color on the active screen", color=True),
    F("focusRingInactiveColor", "Appearance", "Focus ring", "Inactive color", "Ring color when the screen is not active", color=True),
    F("focusRingUrgentColor", "Appearance", "Focus ring", "Urgent color", "Ring color of a window that asks for attention", placeholder="#9b0000"),
    F("focusRingActiveGradient", "Appearance", "Focus ring", "Active gradient", "Overrides the active color. Format: from=COLOR to=COLOR [angle=DEG] [relative-to=workspace-view] [in=oklch longer hue]", placeholder="from=#80c8ff to=#bbddff angle=45"),
    F("focusRingInactiveGradient", "Appearance", "Focus ring", "Inactive gradient", "Overrides the inactive color. Format: from=COLOR to=COLOR [angle=DEG] [relative-to=workspace-view] [in=oklch longer hue]", placeholder="from=#80c8ff to=#bbddff angle=45"),
    F("focusRingUrgentGradient", "Appearance", "Focus ring", "Urgent gradient", "Overrides the urgent color. Format: from=COLOR to=COLOR [angle=DEG] [relative-to=workspace-view] [in=oklch longer hue]", placeholder="from=#80c8ff to=#bbddff angle=45"),
    F("borderEnabled", "Appearance", "Border", "", "Always-visible border, drawn inside the window frame", label_text="Show a border around every window"),
    F("borderWidth", "Appearance", "Border", "Width", "Thickness of the border", suffix="px", hi=99),
    F("borderActiveColor", "Appearance", "Border", "Active color", "Border color of the focused window", color=True),
    F("borderInactiveColor", "Appearance", "Border", "Inactive color", "Border color of other windows", color=True),
    F("borderUrgentColor", "Appearance", "Border", "Urgent color", "Border color of a window that asks for attention", placeholder="#9b0000"),
    F("borderActiveGradient", "Appearance", "Border", "Active gradient", "Overrides the active color. Format: from=COLOR to=COLOR [angle=DEG] [relative-to=workspace-view] [in=oklch longer hue]", placeholder="from=#80c8ff to=#bbddff angle=45"),
    F("borderInactiveGradient", "Appearance", "Border", "Inactive gradient", "Overrides the inactive color. Format: from=COLOR to=COLOR [angle=DEG] [relative-to=workspace-view] [in=oklch longer hue]", placeholder="from=#80c8ff to=#bbddff angle=45"),
    F("borderUrgentGradient", "Appearance", "Border", "Urgent gradient", "Overrides the urgent color. Format: from=COLOR to=COLOR [angle=DEG] [relative-to=workspace-view] [in=oklch longer hue]", placeholder="from=#80c8ff to=#bbddff angle=45"),
    F("tabIndicatorEnabled", "Appearance", "Tab indicator", "", "A strip next to a tabbed column showing its windows", label_text="Show the tab indicator next to tabbed columns"),
    F("tabIndicatorHideWhenSingleTab", "Appearance", "Tab indicator", "", "Hide the strip when the column has only one window", label_text="Hide it when the column has one window"),
    F("tabIndicatorPosition", "Appearance", "Tab indicator", "Position", "Side of the column where the indicator is drawn"),
    F("tabIndicatorWidth", "Appearance", "Tab indicator", "Thickness", "Thickness of the indicator strip", suffix="px", lo=1, hi=99),
    F("tabIndicatorGap", "Appearance", "Tab indicator", "Gap to column", "Distance between the column and the indicator", suffix="px", hi=99),
    F("tabIndicatorLength", "Appearance", "Tab indicator", "Length", "Length of the strip as a share of the column side (1 = full)", lo=0.05, hi=1.0, step=0.05, suffix=""),
    F("tabIndicatorPlaceWithinColumn", "Appearance", "Tab indicator", "", "Shrink the windows so the indicator fits inside the column", label_text="Place it inside the column"),
    F("tabIndicatorGapsBetweenTabs", "Appearance", "Tab indicator", "Gap between tabs", "Space between the tabs of the indicator", suffix="px", hi=99),
    F("tabIndicatorCornerRadius", "Appearance", "Tab indicator", "Corner radius", "Rounding of each tab", suffix="px", hi=99),
    F("tabIndicatorActiveColor", "Appearance", "Tab indicator", "Active color", "Empty uses the focus ring colors", placeholder="focus ring color"),
    F("tabIndicatorInactiveColor", "Appearance", "Tab indicator", "Inactive color", "Empty uses the focus ring colors", placeholder="focus ring color"),
    F("tabIndicatorUrgentColor", "Appearance", "Tab indicator", "Urgent color", "Empty uses the focus ring colors", placeholder="focus ring color"),
    F("tabIndicatorActiveGradient", "Appearance", "Tab indicator", "Active gradient", "Overrides the active color. Format: from=COLOR to=COLOR [angle=DEG] [relative-to=workspace-view] [in=oklch longer hue]", placeholder="from=#80c8ff to=#bbddff angle=45"),
    F("tabIndicatorInactiveGradient", "Appearance", "Tab indicator", "Inactive gradient", "Overrides the inactive color. Format: from=COLOR to=COLOR [angle=DEG] [relative-to=workspace-view] [in=oklch longer hue]", placeholder="from=#80c8ff to=#bbddff angle=45"),
    F("tabIndicatorUrgentGradient", "Appearance", "Tab indicator", "Urgent gradient", "Overrides the urgent color. Format: from=COLOR to=COLOR [angle=DEG] [relative-to=workspace-view] [in=oklch longer hue]", placeholder="from=#80c8ff to=#bbddff angle=45"),
    F("shadowEnabled", "Appearance", "Shadow", "", "A soft shadow under every window, like niri's", label_text="Draw window shadows"),
    F("shadowSoftness", "Appearance", "Shadow", "Softness", "Blur radius of the shadow", suffix="px", hi=999),
    F("shadowSpread", "Appearance", "Shadow", "Spread", "How far the shadow grows past the window", suffix="px", lo=-999, hi=999),
    F("shadowOffsetX", "Appearance", "Shadow", "Offset X", "Horizontal shift of the shadow", suffix="px", lo=-999, hi=999),
    F("shadowOffsetY", "Appearance", "Shadow", "Offset Y", "Vertical shift of the shadow", suffix="px", lo=-999, hi=999),
    F("shadowColor", "Appearance", "Shadow", "Color", "#RRGGBBAA, alpha allowed", placeholder="#00000077"),
    F("shadowInactiveColor", "Appearance", "Shadow", "Inactive color", "Shadow of unfocused windows. Empty uses the color above", placeholder="same as color"),
    F("shadowDrawBehindWindow", "Appearance", "Shadow", "", "Also draw the shadow under the window itself, for see-through windows", label_text="Draw behind the window too"),
    F("insertHintEnabled", "Appearance", "Insert hint", "", "Shows where a dragged window will land", label_text="Show the insert hint"),
    F("insertHintColor", "Appearance", "Insert hint", "Color", "#RRGGBBAA, alpha allowed", placeholder="#7fc8ff80"),
    F("insertHintGradient", "Appearance", "Insert hint", "Gradient", "Overrides the color. Format: from=COLOR to=COLOR [angle=DEG]", placeholder="from=#80c8ff to=#bbddff angle=45"),
    F("backgroundColor", "Appearance", "Background", "Desktop color", "Paints the desktop in one color instead of the wallpaper. Empty keeps the wallpaper", placeholder="wallpaper"),
    F("fullscreenBackdropColor", "Appearance", "Background", "Behind full screen", "Color shown around a full-screen window that does not fill the screen", placeholder="#000000"),

    # Gestures & Overview
    F("gestureScroll", "Gestures & Overview", "Touchpad (Wayland only)", "", "Scroll the columns with a three-finger horizontal swipe", label_text="Scroll the columns with a three-finger horizontal swipe"),
    F("gestureScrollInvert", "Gestures & Overview", "Touchpad (Wayland only)", "", "Invert the swipe direction", label_text="Natural scrolling"),
    F("gestureScrollStep", "Gestures & Overview", "Touchpad (Wayland only)", "Swipe distance", "Distance scrolled by one edge-to-edge swipe", suffix="px", lo=1, hi=99999),
    F("gestureSettleDuration", "Gestures & Overview", "Touchpad (Wayland only)", "Settle time", "How long the view keeps following the fingers' momentum after release", suffix="ms", hi=5000),
    F("gestureDesktopSwitch", "Gestures & Overview", "Touchpad (Wayland only)", "", "Three-finger swipe up/down changes the virtual desktop", label_text="Switch desktops with a three-finger vertical swipe"),
    F("hotCorner", "Gestures & Overview", "Hot corners", "", "Like niri: pushing the pointer into a hot corner of the screen toggles the overview. Off turns every corner off", label_text="Hot corners open the overview"),
    F("hotCornerTopLeft", "Gestures & Overview", "Hot corners", "", "niri's default corner. niri turns it off when other corners are named and top-left is not", label_text="Top-left corner"),
    F("hotCornerTopRight", "Gestures & Overview", "Hot corners", "", "", label_text="Top-right corner"),
    F("hotCornerBottomLeft", "Gestures & Overview", "Hot corners", "", "", label_text="Bottom-left corner"),
    F("hotCornerBottomRight", "Gestures & Overview", "Hot corners", "", "", label_text="Bottom-right corner"),
    F("overviewZoom", "Gestures & Overview", "Overview", "Zoom", "How far the overview zooms out: 0.5 shows every desktop at half size (niri's overview zoom, 0 to 1)", lo=0.0, hi=1.0, step=0.05),
    F("overviewBackdropColor", "Gestures & Overview", "Overview", "Backdrop color", "Color behind the desktops in the overview (niri's backdrop-color)", placeholder="#262626"),
    F("overviewShadowEnabled", "Gestures & Overview", "Desktop shadow", "", "A shadow under every desktop in the overview (niri's workspace-shadow)", label_text="Draw desktop shadows in the overview"),
    F("overviewShadowSoftness", "Gestures & Overview", "Desktop shadow", "Softness", "Blur radius of the shadow", suffix="px", hi=1024),
    F("overviewShadowSpread", "Gestures & Overview", "Desktop shadow", "Spread", "How far the shadow grows past the desktop", suffix="px", lo=-1024, hi=1024),
    F("overviewShadowOffsetX", "Gestures & Overview", "Desktop shadow", "Offset X", "Horizontal shift of the shadow", suffix="px", lo=-999, hi=999),
    F("overviewShadowOffsetY", "Gestures & Overview", "Desktop shadow", "Offset Y", "Vertical shift of the shadow", suffix="px", lo=-999, hi=999),
    F("overviewShadowColor", "Gestures & Overview", "Desktop shadow", "Color", "#RRGGBBAA, alpha allowed", placeholder="#00000050"),
    F("dndEdgeViewScrollTriggerWidth", "Gestures & Overview", "Edge scrolling while dragging", "Side width", "Dragging a window this close to the left or right screen edge scrolls the columns (niri dnd-edge-view-scroll trigger-width)", suffix="px", hi=65535),
    F("dndEdgeViewScrollDelay", "Gestures & Overview", "Edge scrolling while dragging", "Side delay", "How long the pointer must stay in the zone before the columns scroll", suffix="ms", hi=65535),
    F("dndEdgeViewScrollMaxSpeed", "Gestures & Overview", "Edge scrolling while dragging", "Side max speed", "Scroll speed at the very edge", suffix="px/s", hi=1000000),
    F("dndEdgeWorkspaceSwitchTriggerHeight", "Gestures & Overview", "Edge scrolling while dragging", "Top/bottom height", "In the overview, dragging this close to the top or bottom edge scrolls the desktops (niri dnd-edge-workspace-switch trigger-height)", suffix="px", hi=65535),
    F("dndEdgeWorkspaceSwitchDelay", "Gestures & Overview", "Edge scrolling while dragging", "Top/bottom delay", "How long the pointer must stay in the zone before the desktops scroll", suffix="ms", hi=65535),
    F("dndEdgeWorkspaceSwitchMaxSpeed", "Gestures & Overview", "Edge scrolling while dragging", "Top/bottom max speed", "Scroll speed at the very edge", suffix="px/s", hi=1000000),

    # Window Rules
    F("floatClasses", "Window Rules", "Simple rules", "Always float", "Window classes that are never tiled. One per line, regular expressions are allowed", lines=4, above=True, placeholder="calc\nmpv"),
    F("tileClasses", "Window Rules", "Simple rules", "Always tile", "Window classes that are always tiled, even if Kiri would float them. One per line", lines=4, above=True, placeholder="kfind"),
    F("columnWidthRules", "Window Rules", "Simple rules", "Column width", "One class=width per line, like firefox=66.667%", lines=4, above=True, placeholder="firefox=66.667%\norg\\.kde\\.dolphin=800px"),
    F("windowRules", "Window Rules", "JSON rules", "Rules", "A JSON array of rule objects like niri's window-rule, applied together with the simple rules; the last rule that sets a property wins. "
      "Match: class, caption (regexes for the whole string), appId, title (niri's regexes, matching anywhere), isFloating, isActive, isFocused, isActiveInColumn, isUrgent, atStartup; "
      "exclude: a list of such matches. Properties: tile (false = open-floating), width, height, fullscreen, maximized, maximizedToEdges, focused, workspace, columnDisplay, "
      "floatingPosition {x, y, relativeTo}, minWidth, minHeight, maxWidth, maxHeight, opacity, and the looks focusRing, border, shadow, tabIndicator, cornerRadius, clipToGeometry. "
      "Example: {\"appId\": \"^steam$\", \"title\": \"Friends List\", \"tile\": false}", lines=12, above=True),

    # Advanced
    F("tiledKeepBelow", "Advanced", "Stacking order", "Tiled windows", "Sets \"Keep Below\" on tiled windows so floating ones stay on top", radio=True, label_text="Keep below"),
    F("floatingKeepAbove", "Advanced", "Stacking order", "Floating windows", "Sets \"Keep Above\" on floating windows", radio=True, label_text="Keep above"),
    F("noLayering", "Advanced", "Stacking order", "", "Leave the stacking order to KWin", radio=True, label_text="Do not change it"),
    F("dynamicDesktops", "Advanced", "Desktops", "Dynamic desktops", "Experimental, off by default. Like niri's workspaces: there is always one empty desktop at the bottom, and empty desktops are removed when you leave them. Moving a window or column down from the last desktop opens a new one", label_text="Always keep one empty desktop (experimental)"),
    F("emptyDesktopAboveFirst", "Advanced", "Desktops", "", "With dynamic desktops: also keep an empty desktop above the first one (niri: empty-workspace-above-first)", label_text="Keep an empty desktop above the first too"),
    F("desktopAutoBackAndForth", "Advanced", "Desktops", "", "Switching to the desktop you are on goes back to the previous one (niri: workspace-auto-back-and-forth)", label_text="Go back when switching to the current desktop"),
    F("namedDesktops", "Advanced", "Desktops", "Named desktops", "Desktops that always exist, at the top, in this order (niri: workspace \"name\"). A JSON list, e.g. [\"web\", \"chat\"]. The niri import fills it", placeholder='["web", "chat"]'),
    F("desktopBindNames", "Advanced", "Desktops", "Names for shortcuts", "The names the \"Desktop: focus named N\" shortcuts go to, Nth name for N (a JSON list). The niri import fills it", placeholder='["web", "chat"]'),
    F("tiledDesktops", "Advanced", "Desktops", "Tiled desktops", "Regular expression matched against the virtual desktop names. Only matching desktops are tiled", placeholder=".* (all)"),
    F("niriConfigEnabled", "Advanced", "Import niri config", "", "When off, the pasted text is kept but not used", label_text="Use this niri config"),
    F("niriConfig", "Advanced", "Import niri config", "", "Paste your niri config.kdl (usually ~/.config/niri/config.kdl). Kiri reads it every time the settings change and applies it on top of the other tabs, "
      "so the values it sets win. It sets: key binds (keys typed in the Shortcuts tab still win), gaps and struts, center-focused-column, always-center-single-column, preset widths and heights, "
      "default column width and display, focus ring, border, tab indicator, warp-mouse-to-focus, and window rules (every matcher and property of niri's window-rule that KWin can do). "
      "Everything else is ignored; lines Kiri can't use are listed in the KWin log.", lines=14, above=True, placeholder="layout {\n    gaps 16\n}\nbinds {\n    Mod+H { focus-column-left; }\n}"),
]

# One-line hints shown at the top of a group: (tab, group) -> text. Keep them to a line or two, details go in tooltips.
NOTES = {
    ("Window Rules", "Simple rules"): "One window class per line, regular expressions are allowed. Find a class with: qdbus6 org.kde.KWin /KWin org.kde.KWin.queryWindowInfo",
    ("Window Rules", "JSON rules"): "Rules like niri's window-rule, matching the app id and title. Hover over the box for the fields.",
    ("Advanced", "Import niri config"): "Kiri applies the pasted config on top of the other tabs. Hover over the box for what it reads.",
}

# ---------------------------------------------------------------- reading the definition files

def read_config_def():
    """[(name, type, default, choices, section, comment)] in file order"""
    src = open(CONFIG_DEF, encoding="utf-8").read()
    body = src[src.index("const configDef"):]
    entries = []
    for block in re.findall(r"^    \{\n(.*?)^    \},?\n", body, re.M | re.S):
        name = re.search(r'name:\s*"(\w+)",?[ \t]*(?://\s*([^\n]*))?', block)
        typ = re.search(r'type:\s*"(\w+)"', block)
        if not name or not typ:
            continue
        choices = re.search(r"choices:\s*\[(.*?)\]", block, re.S)
        section = re.search(r'section:\s*"([^"]+)"', block)
        default = re.search(r"default:\s*([^\n]*?),?\s*(?://[^\n]*)?\n", block)
        entries.append(dict(
            name=name.group(1), comment=(name.group(2) or "").strip(), type=typ.group(1),
            default=default.group(1) if default else "",
            choices=re.findall(r'"([^"]*)"', choices.group(1)) if choices else None,
            section=section.group(1) if section else None))
    return entries

def read_key_bindings():
    """[(name, description)] in file order; numbered ones keep their "{}" """
    src = open(KEYS_DEF, encoding="utf-8").read()
    # "Kiri internal: ..." are triggers that the effects send to the script; they have no place on the page
    return [(m.group(1), m.group(2)) for m in re.finditer(r'name:\s*"([\w{}-]+)",\s*description:\s*"([^"]*)"', src) if not m.group(2).startswith("Kiri internal")] + \
           [(m.group(1), m.group(2)) for m in re.finditer(r'name:\s*"([\w{}-]+)",\s*defaultModifiers:[^\n]*\n\s*description:\s*"([^"]*)"', src)]

# ---------------------------------------------------------------- XML helpers

def prop(name, inner):
    return f'<property name="{name}">{inner}</property>'

def sprop(name, text):
    return prop(name, f"<string>{escape(text)}</string>")

def tip(t):
    return sprop("toolTip", t) if t else ""

def tab_title(title):
    return title.replace("&", "&&")

def guess_suffix(name):
    if re.search(r"(Delay|Duration|Time|Ms|Millis)$", name):
        return "ms"
    if re.search(r"(Percent|Opacity|Share)$", name):
        return "%"
    if re.search(r"(Width|Height|Gap|Radius|Size|Offset|Spread|Distance|Margin|Step|Thickness|Length|Softness)", name):
        return "px"
    return ""

def humanize(name):
    words = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", name).split()
    return " ".join([words[0].capitalize()] + [w.lower() for w in words[1:]])

def spin(entry, o):
    suffix = o.get("suffix", guess_suffix(entry["name"]))
    sp = sprop("suffix", " " + suffix) if suffix else ""
    if entry["type"] == "Double":
        return (f'<widget class="QDoubleSpinBox" name="kcfg_{entry["name"]}">{prop("decimals", "<number>2</number>")}{sp}'
                f'{prop("minimum", f"<double>{o.get('lo', 0.0)}</double>")}{prop("maximum", f"<double>{o.get('hi', 1000.0)}</double>")}'
                f'{prop("singleStep", f"<double>{o.get('step', 0.1)}</double>")}')
    special = ""
    if "special" in o:
        special = sprop("specialValueText", o["special"])
    return (f'<widget class="QSpinBox" name="kcfg_{entry["name"]}">{sp}{special}'
            f'{prop("minimum", f"<number>{o.get('lo', 0)}</number>")}{prop("maximum", f"<number>{o.get('hi', 9999)}</number>")}')

def field_widget(entry, o, tooltip):
    """XML of the widget for a key, by its type; the closing tag is added here"""
    name, typ = entry["name"], entry["type"]
    t = tip(tooltip)
    if typ == "Bool":
        cls = "QRadioButton" if o.get("radio") else "QCheckBox"
        text = o.get("label_text") or humanize(name)
        return f'<widget class="{cls}" name="kcfg_{name}">{sprop("text", text)}{t}</widget>'
    if typ in ("UInt", "Int", "Double"):
        w = spin(entry, o)
        return w + t + "</widget>"
    if typ == "Enum":
        labels = o.get("labels") or [humanize(c) if c.islower() else c for c in entry["choices"]]
        labels = [l[:1].upper() + l[1:] for l in labels]
        its = "".join(f'<item>{sprop("text", l)}</item>' for l in labels)
        return f'<widget class="QComboBox" name="kcfg_{name}">{t}{its}</widget>'
    if o.get("color"):
        return f'<widget class="KColorButton" name="kcfg_{name}">{t}</widget>'
    if o.get("lines"):
        px = 17 * o["lines"] + 14
        mono = prop("font", "<font><family>Monospace</family></font>")
        ph = sprop("placeholderText", o["placeholder"]) if o.get("placeholder") else ""
        return (f'<widget class="QPlainTextEdit" name="kcfg_{name}">{prop("tabChangesFocus", "<bool>true</bool>")}'
                f'{prop("lineWrapMode", "<enum>QPlainTextEdit::NoWrap</enum>")}{mono}{t}{ph}'
                f'{prop("minimumSize", f"<size><width>0</width><height>{px}</height></size>")}'
                + (prop("maximumSize", f"<size><width>16777215</width><height>{px}</height></size>") if o["lines"] <= 6 else "") + '</widget>')
    ph = sprop("placeholderText", o["placeholder"]) if o.get("placeholder") else ""
    return f'<widget class="QLineEdit" name="kcfg_{name}">{t}{ph}{prop("clearButtonEnabled", "<bool>true</bool>")}</widget>'

# one row of a form: (label, widget xml, tooltip, above)
def group_xml(title, rows):
    out = ['<item><widget class="QGroupBox">', sprop("title", title), '<layout class="QFormLayout">',
           prop("fieldGrowthPolicy", "<enum>QFormLayout::ExpandingFieldsGrow</enum>"),
           prop("labelAlignment", "<set>Qt::AlignRight|Qt::AlignTrailing|Qt::AlignVCenter</set>"),
           prop("verticalSpacing", "<number>6</number>")]
    r = 0
    labelled = any(label for label, _, _, _ in rows if label is not None)  # a group of bare check boxes has no label column
    for label, widget, tooltip, above in rows:
        if label is None:  # a note
            out.append(f'<item row="{r}" column="0" colspan="2"><widget class="QLabel">{sprop("text", widget)}{prop("wordWrap", "<bool>true</bool>")}'
                       '</widget></item>')
            r += 1
            continue
        lab = (f'<widget class="QLabel">{sprop("text", label)}{tip(tooltip)}'
               f'{prop("alignment", "<set>Qt::AlignRight|Qt::AlignTrailing|Qt::AlignVCenter</set>")}'
               f'{prop("minimumSize", "<size><width>%d</width><height>0</height></size>" % LABEL_WIDTH)}</widget>') if label else None
        if above:
            if lab:
                lab = lab.replace("</widget>", prop("alignment", "<set>Qt::AlignLeading|Qt::AlignLeft|Qt::AlignVCenter</set>") + "</widget>")
                out.append(f'<item row="{r}" column="0" colspan="2">{lab}</item>')
                r += 1
            out.append(f'<item row="{r}" column="0" colspan="2">{widget}</item>')
        elif lab:
            out.append(f'<item row="{r}" column="0">{lab}</item>')
            out.append(f'<item row="{r}" column="1">{widget}</item>')
        elif labelled:
            out.append(f'<item row="{r}" column="1">{widget}</item>')
        else:
            out.append(f'<item row="{r}" column="0" colspan="2">{widget}</item>')
        r += 1
    out.append('</layout></widget></item>')
    return "".join(out)

def scroll_page(name, title, groups_xml):
    return (f'<widget class="QWidget" name="tab_{name}"><attribute name="title"><string>{escape(tab_title(title))}</string></attribute>'
            f'<layout class="QVBoxLayout">{prop("margin", "<number>0</number>")}<item><widget class="QScrollArea" name="scroll_{name}">'
            f'{prop("frameShape", "<enum>QFrame::NoFrame</enum>")}{prop("widgetResizable", "<bool>true</bool>")}'
            f'<widget class="QWidget" name="scrollContents_{name}"><layout class="QVBoxLayout">'
            + "".join(groups_xml) +
            f'<item><spacer name="spacer_{name}"><property name="orientation"><enum>Qt::Vertical</enum></property>'
            '<property name="sizeHint" stdset="0"><size><width>20</width><height>20</height></size></property></spacer></item>'
            '</layout></widget></widget></item></layout></widget>')

# ---------------------------------------------------------------- settings tabs

def place_by_name(name):
    for pattern, tab in AUTO_TABS:
        if re.search(pattern, name):
            return tab
    return "Advanced"

def build_settings():
    entries = {e["name"]: e for e in read_config_def()}
    layout = {t: {} for t in TABS}  # tab -> group -> rows
    used, auto, unknown = set(), [], []

    def add(tab, group, entry, o, label, tooltip):
        if tab not in layout:
            layout[tab] = {}
        w = field_widget(entry, o, tooltip)
        layout[tab].setdefault(group, []).append((label, w, tooltip, o.get("above", False)))

    for key, tab, group, label, tooltip, o in FIELDS:
        if key not in entries:
            unknown.append(key)
            continue
        used.add(key)
        add(tab, group, entries[key], o, label, tooltip)
    for e in entries.values():
        if e["name"] in used or e["name"].startswith("key1_") or e["name"].startswith("key2_"):
            continue
        if e["section"]:
            tab, _, group = e["section"].partition("/")
            group = group or "More"
        else:
            tab, group = place_by_name(e["name"]), "More"
        o = {}
        add(tab, group, e, o, humanize(e["name"]) if e["type"] != "Bool" else "", e["comment"])
        auto.append(f'{e["name"]} -> {tab}/{group}')
    return layout, auto, unknown

def settings_page(tab, groups):
    name = re.sub(r"\W+", "", tab)
    return scroll_page(name, tab, [group_xml(g, ([(None, NOTES[(tab, g)], "", False)] if (tab, g) in NOTES else []) + rows) for g, rows in groups.items()])

# ---------------------------------------------------------------- shortcuts tab

def keyfield(row, col, key):
    return (f'<item row="{row}" column="{col}"><widget class="KKeySequenceWidget" name="kcfg_key{col}_{key}">\n'
            '<property name="multiKeyShortcutsAllowed"><bool>false</bool></property>\n'
            '<property name="checkForConflictsAgainst"><set>KKeySequenceWidget::None</set></property>\n'
            '<property name="kcfg_property"><cstring>keySequence</cstring></property>\n'
            '<property name="kcfg_propertyNotify"><cstring>2keySequenceChanged(QKeySequence)</cstring></property>\n'
            '</widget></item>')

def shortcut_rows():
    """{group: [(label, config key)]}, sorted like System Settings sorts them"""
    groups = {}
    for name, desc in read_key_bindings():
        group, sep, label = desc.partition(": ")
        if not sep:
            group, label = "Other", desc
        label = label[:1].upper() + label[1:]
        if "{}" in name:
            for i in range(1, 10):
                groups.setdefault(group, []).append((label.replace("{}", str(i)), name.replace("{}", str(i)).replace("-", "_"), label.replace("{}", "{") , i))
        else:
            groups.setdefault(group, []).append((label, name.replace("-", "_"), label, 0))
    result = {}
    for group, rows in groups.items():
        rows.sort(key=lambda r: (r[2].lower(), r[3]))
        result[group] = [(label, key) for label, key, _, _ in rows]
    order = [g for g in SHORTCUT_GROUPS if g in result] + sorted(g for g in result if g not in SHORTCUT_GROUPS and g != "Other") + \
            (["Other"] if "Other" in result else [])
    return {g: result[g] for g in order}

def shortcuts_page():
    groups = shortcut_rows()
    names = "".join(f'<item><property name="text"><string>{escape(g)}</string></property></item>' for g in groups)
    pages = []
    for index, (group, rows) in enumerate(groups.items()):
        cells = [f'<item row="0" column="1"><widget class="QLabel"><property name="text"><string>Shortcut</string></property></widget></item>',
                 f'<item row="0" column="2"><widget class="QLabel"><property name="text"><string>Alternate</string></property></widget></item>']
        for r, (label, key) in enumerate(rows, 1):
            cells.append(f'<item row="{r}" column="0"><widget class="QLabel"><property name="text"><string>{escape(label)}</string></property></widget></item>')
            cells += [keyfield(r, 1, key), keyfield(r, 2, key)]
        pages.append(
            f'<widget class="QWidget" name="page_shortcuts_{index}"><layout class="QVBoxLayout">{prop("margin", "<number>0</number>")}'
            f'<item><widget class="QScrollArea" name="scroll_shortcuts_{index}">{prop("frameShape", "<enum>QFrame::NoFrame</enum>")}{prop("widgetResizable", "<bool>true</bool>")}'
            f'<widget class="QWidget" name="scrollContents_shortcuts_{index}"><layout class="QVBoxLayout"><item><layout class="QGridLayout" name="grid_shortcuts_{index}">{prop("verticalSpacing", "<number>2</number>")}\n' + "\n".join(cells) + '\n</layout></item>'
            '<item><spacer name="spacer_shortcuts_%d"><property name="orientation"><enum>Qt::Vertical</enum></property>'
            '<property name="sizeHint" stdset="0"><size><width>20</width><height>20</height></size></property></spacer></item>'
            '</layout></widget></widget></item></layout></widget>' % index)
    return ('<widget class="QWidget" name="tab_Shortcuts"><attribute name="title"><string>Shortcuts</string></attribute><layout class="QVBoxLayout">'
            '<item><widget class="QLabel" name="label_shortcutsRule">' +
            sprop("text", "Keys set here are copied to Shortcuts > Kiri in System Settings, without a conflict check. Leave both fields empty to use the keys set there.") +
            '<property name="wordWrap"><bool>true</bool></property></widget></item>'
            '<item><layout class="QHBoxLayout"><item><widget class="QListWidget" name="list_shortcutGroups">'
            '<property name="maximumSize"><size><width>170</width><height>16777215</height></size></property>' + names +
            '</widget></item><item><widget class="QStackedWidget" name="stack_shortcuts">' + "".join(pages) +
            '</widget></item></layout></item></layout></widget>')

# ---------------------------------------------------------------- the document

def main():
    layout, auto, unknown = build_settings()
    pages = []
    for tab in TABS:
        if tab == "Shortcuts":
            pages.append(shortcuts_page())
        elif layout.get(tab):
            pages.append(settings_page(tab, layout[tab]))
    for tab in layout:
        if tab not in TABS and layout[tab]:
            pages.append(settings_page(tab, layout[tab]))  # a section field named a tab that does not exist yet
    doc = ('<?xml version="1.0" encoding="UTF-8"?>\n<ui version="4.0">\n<class>KWin::KarouselConfigForm</class>\n'
           '<widget class="QWidget" name="KWin::KarouselConfigForm"><property name="windowTitle"><string>Kiri</string></property>'
           '<layout class="QVBoxLayout" name="layout_main"><item><widget class="QTabWidget" name="tabContainer">'
           + "".join(pages) +
           '</widget></item></layout></widget>\n'
           '<resources/><connections><connection><sender>list_shortcutGroups</sender><signal>currentRowChanged(int)</signal>'
           '<receiver>stack_shortcuts</receiver><slot>setCurrentIndex(int)</slot></connection></connections></ui>\n')
    open(PATH, "w", encoding="utf-8").write(doc)
    for line in auto:
        print("placed by rule:", line)
    for key in unknown:
        print("FIELDS row for a key that is not in definition.ts:", key)

main()
