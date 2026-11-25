/*
    Kiri decorations: rounded window corners, focus ring and borders painted with the window.

    The way a window is redirected to an offscreen texture and shaded to cut its corners follows the
    "Rounded Corners" KWin effect (https://github.com/matinlotfali/KDE-Rounded-Corners),
    Copyright 2015 Robert Metsaranta, and 2023-2026 Matin Lotfaliei, GPL-2.0-or-later.
    Everything else was written for Kiri. License: GPL-3.0-or-later.
*/

#pragma once
#include "KwinCompat.h"

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

#include "AnimConfig.h"
#include "PlasmaAccent.h"

#include <memory>

namespace KWin
{
class GLShader;
}

namespace KiriDecorations
{

// a niri gradient: `from` to `to` along `angle` degrees in a colour space; a plain colour has equal ends
struct Gradient
{
    QColor from = QColor(Qt::transparent);
    QColor to = QColor(Qt::transparent);
    double angle = 180;
    bool viewRelative = false;
    int space = 0;
    int hue = 0;
    bool operator==(const Gradient &o) const
    {
        return from == o.from && to == o.to && angle == o.angle && viewRelative == o.viewRelative && space == o.space && hue == o.hue;
    }
};

struct BandStyle
{
    bool enabled = true;
    int width = 4;
    Gradient colors[3];
};

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

struct TabColors
{
    bool set[3] = {false, false, false};
    Gradient colors[3];
};

struct Look
{
    int cornerRadius = 0;
    BandStyle ring{true, 4, {}};
    BandStyle border{false, 4, {}};
    ShadowStyle shadow;
    TabColors tabColors;
    QColor fullscreenBackdrop;
    int background = -1;
    bool baba = false;
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
    QColor background;
    QHash<QString, QColor> outputBackgrounds;
    QString pointerBinds;
};

struct TabGroup
{
    QList<QUuid> windows;
    int active = 0;
};

// how far a window has gone to "expanded" (full screen or maximized to the edges): 0 normal, 1 expanded, like niri's expanded_progress
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
    KIRI_PAINT_RET paintScreen(const KWin::RenderTarget &renderTarget, const KWin::RenderViewport &viewport, int mask, const KWin::Region &deviceRegion, KWin::LogicalOutput *screen) override;
    void prePaintWindow(KWin::RenderView *view, KWin::EffectWindow *w, KWin::WindowPrePaintData &data) override;
    KIRI_PAINT_RET drawWindow(const KWin::RenderTarget &renderTarget, const KWin::RenderViewport &viewport, KWin::EffectWindow *w, int mask, const KWin::Region &deviceRegion, KWin::WindowPaintData &data) override;

    bool isActive() const override;
    bool provides(Feature feature) override;
    int requestedEffectChainPosition() const override;
    bool blocksDirectScanout() const override;

public Q_SLOTS:
    Q_SCRIPTABLE void debugWheel(int i);
    Q_SCRIPTABLE void setTabGroups(const QString &json);
    // where Kiri wants windows painted while KWin's interactive resize owns their real position: {"{uuid}": [x, y]}
    Q_SCRIPTABLE void setVisualPositions(const QString &json);
    // where Kiri wants full-screen X11 windows painted while their real place is parked in the corner: {"{uuid}": [x, y]}
    Q_SCRIPTABLE void setParkedPositions(const QString &json);
    // Kiri's resolved appearance settings as JSON; until the first call the effect reads kwinrc itself
    Q_SCRIPTABLE void setConfig(const QString &json);
    // per-window overrides from niri's window rules, by window id; a missing field keeps the global setting; see WindowDecorationRule in src/lib/Kiri.ts
    Q_SCRIPTABLE void setWindowDecorations(const QString &json);
    Q_SCRIPTABLE void setUrgentWindows(const QString &json);
    // niri's insert hint while a window is dragged: {"r": [x, y, w, h], "w": "{uuid}"} or "null"
    Q_SCRIPTABLE void setInsertHint(const QString &json);
    Q_SCRIPTABLE int pointerButtons();
    // niri's warp-mouse-to-focus: moves the pointer to "x,y" in global logical coordinates
    Q_SCRIPTABLE void warpPointer(const QString &xy);
    Q_SCRIPTABLE bool isX11Window(const QString &id);
    Q_SCRIPTABLE void setDesktopRows(const QString &rows);
    Q_SCRIPTABLE void reloadSettings(const QString &unused);

private:
    void loadSettings();
    void loadAccent();
    Settings parseSettings(const QVariantMap &map, bool kiriEnabled) const;
    Look parseLook(const QVariantMap &map) const;
    void applyOverride(Look &look, const QVariantMap &rule) const;
    const Look &lookOf(KWin::EffectWindow *w) const;
    double babaOffset(KWin::EffectWindow *w) const;
    void updateReach();
    void registerPointerBinds();
    void invokeShortcut(const QString &shortcut);
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
    void drawBackdrop(const KWin::RenderViewport &viewport, KWin::EffectWindow *w, const KWin::RectF &painted, const KWin::Region &deviceRegion, double opacity);
    void setGradient(KWin::GLShader *shader, int layer, const Gradient &gradient, const QRectF &area) const;
    void clickOnTab(const QPointF &pos);
    void fillRect(const KWin::RenderViewport &viewport, const KWin::RectF &rect, const QColor &color, const KWin::Region &deviceRegion, double opacity);
    void drawRing(const KWin::RenderViewport &viewport, KWin::EffectWindow *w, const KWin::RectF &frame, const KWin::Region &deviceRegion, double opacity, bool fill = false);

    Settings m_settings;
    double m_reach = 12;
    QVariantMap m_config;
    bool m_haveConfig = false;
    QVariantMap m_overrides;
    bool m_anyBaba = false;
    QHash<QUuid, Look> m_looks;
    QSet<QUuid> m_urgent;
    struct TabHit
    {
        QList<QUuid> windows;
        QList<QRectF> rects;
    };
    QHash<QUuid, TabHit> m_tabHits;
    std::unique_ptr<KWin::GLShader> m_shadowShader;
    KConfigWatcher::Ptr m_watcher;
    KConfigWatcher::Ptr m_colorWatcher;
    QColor m_accent;
    std::unique_ptr<KWin::GLShader> m_cornerShader;
    std::unique_ptr<KWin::GLShader> m_ringShader;
    KWin::EffectWindow *m_active = nullptr;
    QList<TabGroup> m_tabGroups;
    QHash<QUuid, int> m_tabGroupOf;
    QHash<QUuid, QPointF> m_visualPositions;
    struct VisualRelease
    {
        QPointF offset;
        double start = -1;
        double created = 0;
    };
    struct ParkAnim
    {
        QPointF from;
        QPointF to;
        bool toReal = false;
        double start = 0;
    };
    QHash<QUuid, ParkAnim> m_park;
    QHash<QUuid, QPointF> m_parkPainted;
    QPointF parkedPosition(KWin::EffectWindow *w, const ParkAnim &anim) const;
    bool isParked(KWin::EffectWindow *w) const;
    void clickOnParked(const QPointF &pos);
    QHash<QUuid, QPointF> m_lastVisualOffset;
    QHash<QUuid, VisualRelease> m_releasing;
    KWin::RectF m_insertHint;
    QUuid m_hintWindow;
    struct AlphaAnim
    {
        double from = 1, to = 1, start = 0;
    };
    QHash<QUuid, AlphaAnim> m_alpha;
    double alphaOf(const QUuid &id) const;
    void fadeTo(const QUuid &id, double to);
    void drawInsertHint(const KWin::RenderViewport &viewport, const KWin::Region &deviceRegion);
    QHash<KWin::EffectWindow *, KWin::RectF> m_painted;
    void repaintPainted(KWin::EffectWindow *w);
    mutable QHash<KWin::EffectWindow *, ExpandedState> m_expanded;
    QHash<QUuid, std::pair<double, bool>> m_tabOpen;
    std::chrono::steady_clock::time_point m_clockStart = std::chrono::steady_clock::now();
    double m_frameTime = 0;
    bool m_warmed = false;
    void warmShaders();
    std::vector<std::unique_ptr<QAction>> m_wheelActions;
    bool m_pointerBindsRegistered = false;
};

} // namespace KiriDecorations
