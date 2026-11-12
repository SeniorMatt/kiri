/*
    Kiri decorations: rounded window corners, focus ring and borders painted with the window.

    The way a window is redirected to an offscreen texture and shaded to cut its corners follows the
    "Rounded Corners" KWin effect (https://github.com/matinlotfali/KDE-Rounded-Corners),
    Copyright 2015 Robert Metsaranta, and 2023-2026 Matin Lotfaliei, GPL-2.0-or-later.
    Everything else was written for Kiri. License: GPL-3.0-or-later.
*/

#pragma once

#include <QAction>
#include <QElapsedTimer>
#include <memory>
#include <vector>
#include <effect/offscreeneffect.h>

#include <QColor>
#include <QHash>
#include <QList>
#include <QSet>
#include <QVariantMap>
#include <QUuid>
#include <KConfigWatcher>
#include <chrono>

#include "NiriAnim.h"

#include <memory>

namespace KWin
{
class GLShader;
}

namespace KiriDecorations
{

// a niri gradient (niri-config Gradient): `from` to `to` along `angle` degrees (niri's: 0 up, 90 right, 180 down, the default),
// in a colour space. A plain colour is a gradient whose ends are equal.
struct Gradient
{
    QColor from = QColor(Qt::transparent);
    QColor to = QColor(Qt::transparent);
    double angle = 180;
    bool viewRelative = false; // relative-to="workspace-view": the gradient spans the whole screen, not the window
    int space = 0;             // srgb, srgb-linear, oklab, oklch
    int hue = 0;               // oklch hue interpolation: shorter, longer, increasing, decreasing
    bool operator==(const Gradient &o) const
    {
        return from == o.from && to == o.to && angle == o.angle && viewRelative == o.viewRelative && space == o.space && hue == o.hue;
    }
};

// the focus ring and the border: colours for active, inactive and urgent windows (index 0, 1, 2)
struct BandStyle
{
    bool enabled = true;
    int width = 4;
    Gradient colors[3];
};

// niri's shadow (niri-config Shadow)
struct ShadowStyle
{
    bool on = false;
    double offsetX = 0, offsetY = 5;
    double softness = 30, spread = 5;
    bool drawBehindWindow = false;
    QColor color = QColor(0, 0, 0, 0x77);
    bool hasInactiveColor = false;
    QColor inactiveColor;
};

// what a window rule can change per window (see setWindowDecorations): the tab indicator's colours, set or not (niri's
// TabIndicatorRule); the indicator's geometry is global
struct TabColors
{
    bool set[3] = {false, false, false};
    Gradient colors[3];
};

// everything a window is decorated with. Settings holds the global one; a window with overrides from window rules has its own
struct Look
{
    int cornerRadius = 0;
    BandStyle ring{true, 4, {}};
    BandStyle border{false, 4, {}};
    ShadowStyle shadow;
    TabColors tabColors;
};

struct Settings
{
    bool kiriEnabled = false;
    Look look;
    bool tabEnabled = true;
    int tabWidth = 4;
    int tabGap = 5;
    int tabGapsBetween = 0;
    int tabCornerRadius = 0;
    double tabLength = 0.5;
    QString tabPosition = QStringLiteral("left");
    bool tabHideWhenSingle = false;
    bool insertHintEnabled = true;
    Gradient insertHint;
    QColor fullscreenBackdrop = QColor(Qt::black);
    QColor background; // invalid: the wallpaper stays
    QString pointerBinds; // Kiri's `pointerBinds` setting: the wheel and mouse button binds
};

// a tabbed column as Kiri reports it: its windows in tab order and the shown one
struct TabGroup
{
    QList<QUuid> windows;
    int active = 0;
};

// how far a window has gone to "expanded" (full screen or maximized to the edges): 0 normal, 1 expanded. niri fades
// the ring, border and rounded corners out with the window-resize spring when that happens and back in when it ends.
struct ExpandedState
{
    double from = 0, to = 0, start = 0;
    bool known = false;
};

class Effect final : public KWin::OffscreenEffect
{
    Q_OBJECT
    Q_CLASSINFO("D-Bus Interface", "org.kde.kiri.Decorations")

public:
    Effect();
    ~Effect() override;

    static bool supported();

    void reconfigure(ReconfigureFlags flags) override;
    void prePaintScreen(KWin::ScreenPrePaintData &data) override;
    void postPaintScreen() override;
    bool paintScreen(const KWin::RenderTarget &renderTarget, const KWin::RenderViewport &viewport, int mask, const KWin::Region &deviceRegion, KWin::LogicalOutput *screen) override;
    void prePaintWindow(KWin::RenderView *view, KWin::EffectWindow *w, KWin::WindowPrePaintData &data) override;
    bool drawWindow(const KWin::RenderTarget &renderTarget, const KWin::RenderViewport &viewport, KWin::EffectWindow *w, int mask, const KWin::Region &deviceRegion, KWin::WindowPaintData &data) override;

    bool isActive() const override;
    bool provides(Feature feature) override;
    int requestedEffectChainPosition() const override;
    bool blocksDirectScanout() const override;

public Q_SLOTS:
    // debug: fire pointer bind number i (in the order of the pointerBinds setting) as if KWin had matched it
    Q_SCRIPTABLE void debugWheel(int i);
    // Kiri's tabbed columns as JSON: [{"windows": ["{uuid}", ...], "active": 0}, ...]
    Q_SCRIPTABLE void setTabGroups(const QString &json);
    // where Kiri wants windows painted while KWin's interactive resize owns their real position:
    // {"{uuid}": [x, y], ...} (absolute frame position, so it stays right whatever KWin does meanwhile)
    Q_SCRIPTABLE void setVisualPositions(const QString &json);
    // where Kiri wants full-screen X11 windows painted while their real place is parked in the bottom-right corner of the
    // screen (see ClientWrapper.park): {"{uuid}": [x, y], ...}. The painted place is animated with niri's movement spring.
    Q_SCRIPTABLE void setParkedPositions(const QString &json);
    // Kiri's resolved appearance settings as JSON (the keys of the config, niri import included); until the first call the effect
    // reads them from kwinrc itself
    Q_SCRIPTABLE void setConfig(const QString &json);
    // Per-window overrides from niri's window rules: {"{uuid}": {"cornerRadius": 12, "focusRing": {"enabled": false, "width": 2,
    // "activeColor": "#f00", "activeGradient": "from=#f00 to=#00f angle=45"}, "border": {...same...}, "shadow": {"enabled": true,
    // "offsetX", "offsetY", "softness", "spread", "drawBehindWindow", "color", "inactiveColor"}, "tabIndicator": {"activeColor",
    // "inactiveColor", "urgentColor", "activeGradient", ...}}, ...}. A field that is missing keeps the global setting; the whole
    // map is replaced by every call. See WindowDecorationRule in src/lib/Kiri.ts.
    Q_SCRIPTABLE void setWindowDecorations(const QString &json);
    // ids of the windows that ask for attention (niri's urgent): ["{uuid}", ...]
    Q_SCRIPTABLE void setUrgentWindows(const QString &json);
    // niri's insert hint while a window is dragged: {"r": [x, y, w, h] (screen coordinates), "w": "{uuid}" of the dragged window}, or "null"
    Q_SCRIPTABLE void setInsertHint(const QString &json);
    // the pointer buttons held right now (Qt::MouseButtons bits), for Kiri's focus-follows-mouse: niri ignores the pointer while it is grabbed
    Q_SCRIPTABLE int pointerButtons();
    // niri's warp-mouse-to-focus: moves the pointer to "x,y" in global logical coordinates, like a warp by the
    // compositor (no motion is sent from a device)
    Q_SCRIPTABLE void warpPointer(const QString &xy);
    // whether the window "{uuid}" is an X11 (Xwayland) window: scripts cannot tell
    Q_SCRIPTABLE bool isX11Window(const QString &id);
    // KWin shrinks its desktop grid's row count when desktops are removed and never grows it back, so
    // desktops Kiri adds end up side by side; Kiri sets one row per desktop (niri's vertical workspaces)
    Q_SCRIPTABLE void setDesktopRows(const QString &rows);
    // re-read Kiri's settings: KWin's settings page writes them without telling anyone, Kiri calls this after
    Q_SCRIPTABLE void reloadSettings(const QString &unused);

private:
    void loadSettings();
    Settings parseSettings(const QVariantMap &map, bool kiriEnabled) const;
    Look parseLook(const QVariantMap &map) const;
    void applyOverride(Look &look, const QVariantMap &rule) const;
    const Look &lookOf(KWin::EffectWindow *w) const;
    void updateReach();
    void registerPointerBinds();
    void bind(Qt::KeyboardModifiers modifiers, const QString &trigger, const QString &shortcut, int cooldownMs);
    bool decorated(KWin::EffectWindow *w) const;
    double radiusFor(KWin::EffectWindow *w) const;
    double expandedProgress(KWin::EffectWindow *w) const;
    double tabProgress(const TabGroup &group) const;
    double clock() const;
    KWin::RectF outerBounds(KWin::EffectWindow *w) const;
    void repaintAround(KWin::EffectWindow *w);
    double reach() const;
    const TabGroup *tabGroupOf(KWin::EffectWindow *w) const;
    void drawTabIndicator(const KWin::RenderViewport &viewport, const TabGroup &group, KWin::EffectWindow *active, const KWin::RectF &frame, const KWin::Region &deviceRegion, double opacity, double progress);
    void drawShadow(const KWin::RenderViewport &viewport, KWin::EffectWindow *w, const KWin::RectF &frame, const KWin::Region &deviceRegion, double opacity);
    void drawBackdrop(const KWin::RenderViewport &viewport, KWin::EffectWindow *w, const KWin::Region &deviceRegion, double opacity);
    void setGradient(KWin::GLShader *shader, int layer, const Gradient &gradient, const QRectF &area) const;
    void clickOnTab(const QPointF &pos);
    void fillRect(const KWin::RenderViewport &viewport, const KWin::RectF &rect, const QColor &color, const KWin::Region &deviceRegion, double opacity);
    void drawRing(const KWin::RenderViewport &viewport, KWin::EffectWindow *w, const KWin::RectF &frame, const KWin::Region &deviceRegion, double opacity);

    Settings m_settings;
    double m_reach = 12;
    QVariantMap m_config;      // the settings the script sent (setConfig); empty: read kwinrc
    bool m_haveConfig = false;
    QVariantMap m_overrides;   // setWindowDecorations, by window id
    QHash<QUuid, Look> m_looks; // m_settings.look with the override of each window applied
    QSet<QUuid> m_urgent;
    // where the tabs of a tab indicator were last drawn, for clicks: the group's windows in tab order and their rectangles
    struct TabHit
    {
        QList<QUuid> windows;
        QList<QRectF> rects;
    };
    QHash<QUuid, TabHit> m_tabHits; // by the shown window of the column
    std::unique_ptr<KWin::GLShader> m_shadowShader;
    KConfigWatcher::Ptr m_watcher;
    std::unique_ptr<KWin::GLShader> m_cornerShader;
    std::unique_ptr<KWin::GLShader> m_ringShader;
    KWin::EffectWindow *m_active = nullptr;
    QList<TabGroup> m_tabGroups;
    QHash<QUuid, int> m_tabGroupOf;
    QHash<QUuid, QPointF> m_visualPositions;
    // where a window was painted relative to its real place when its visual position ended (a drag that was let go
    // or went past the threshold): the offset runs out with niri's window-movement spring instead of snapping
    struct VisualRelease
    {
        QPointF offset;
        double start = -1; // -1: waiting for the real window to move (Kiri puts it in its place a moment after the release)
        double created = 0;
    };
    // a parked window (see setParkedPositions) is painted at a place that moves from `from` to `to` (to the real place of
    // the window when `toReal`: it is not parked any more)
    struct ParkAnim
    {
        QPointF from;
        QPointF to;
        bool toReal = false;
        double start = 0;
    };
    QHash<QUuid, ParkAnim> m_park;
    QHash<QUuid, QPointF> m_parkPainted; // where each parked window was painted last (absolute top-left)
    QPointF parkedPosition(KWin::EffectWindow *w, const ParkAnim &anim) const;
    bool isParked(KWin::EffectWindow *w) const;
    void clickOnParked(const QPointF &pos);
    QHash<QUuid, QPointF> m_lastVisualOffset;
    QHash<QUuid, VisualRelease> m_releasing;
    KWin::RectF m_insertHint; // empty = none
    QUuid m_hintWindow;       // the window being dragged
    // niri's moving-window alpha: a window that leaves the grid for a drag fades to 0.75 with the window-movement spring,
    // and back to 1 when it is dropped
    struct AlphaAnim
    {
        double from = 1, to = 1, start = 0;
    };
    QHash<QUuid, AlphaAnim> m_alpha;
    double alphaOf(const QUuid &id) const;
    void fadeTo(const QUuid &id, double to);
    void drawInsertHint(const KWin::RenderViewport &viewport, const KWin::Region &deviceRegion);
    // where each window's ring/border was last drawn: repainted when it moves, or the old one stays as a trail
    QHash<KWin::EffectWindow *, KWin::RectF> m_painted;
    void repaintPainted(KWin::EffectWindow *w);
    mutable QHash<KWin::EffectWindow *, ExpandedState> m_expanded;
    // tab indicator open animations by the first window of the column: start time and whether it is the window-open one
    QHash<QUuid, std::pair<double, bool>> m_tabOpen;
    std::chrono::steady_clock::time_point m_clockStart = std::chrono::steady_clock::now();
    double m_frameTime = 0;
    // the shaders get their first real draw (the driver's final compile) a few seconds after load, into a tiny texture
    bool m_warmed = false;
    void warmShaders();
    std::vector<std::unique_ptr<QAction>> m_wheelActions; // the wheel and mouse button binds
    bool m_pointerBindsRegistered = false;
};

} // namespace KiriDecorations
