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

struct Settings
{
    bool kiriEnabled = false;
    int cornerRadius = 0;
    bool ringEnabled = true;
    int ringWidth = 4;
    QColor ringColor = QColor(QStringLiteral("#7fc8ff"));
    bool borderEnabled = false;
    int borderWidth = 4;
    QColor borderActiveColor = QColor(QStringLiteral("#ffc87f"));
    QColor borderInactiveColor = QColor(QStringLiteral("#505050"));
    bool tabEnabled = true;
    int tabWidth = 4;
    int tabGap = 5;
    double tabLength = 0.5;
    QString tabPosition = QStringLiteral("left");
    bool tabHideWhenSingle = false;
    QColor tabActiveColor = QColor(QStringLiteral("#7fc8ff"));
    QColor tabInactiveColor = QColor(QStringLiteral("#505050"));
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
    // debug: fire wheel bind number i (0..11, in registration order) as if KWin had matched it
    Q_SCRIPTABLE void debugWheel(int i);
    // Kiri's tabbed columns as JSON: [{"windows": ["{uuid}", ...], "active": 0}, ...]
    Q_SCRIPTABLE void setTabGroups(const QString &json);
    // where Kiri wants windows painted while KWin's interactive resize owns their real position:
    // {"{uuid}": [x, y], ...} (absolute frame position, so it stays right whatever KWin does meanwhile)
    Q_SCRIPTABLE void setVisualPositions(const QString &json);
    // where Kiri wants full-screen X11 windows painted while their real place is parked in the bottom-right corner of the
    // screen (see ClientWrapper.park): {"{uuid}": [x, y], ...}. The painted place is animated with niri's movement spring.
    Q_SCRIPTABLE void setParkedPositions(const QString &json);
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
    void registerWheelShortcuts();
    void wheel(Qt::KeyboardModifiers modifiers, KWin::PointerAxisDirection direction, const QString &shortcut, int cooldownMs);
    bool decorated(KWin::EffectWindow *w) const;
    double radiusFor(KWin::EffectWindow *w) const;
    double expandedProgress(KWin::EffectWindow *w) const;
    double tabProgress(const TabGroup &group) const;
    double clock() const;
    KWin::RectF outerBounds(KWin::EffectWindow *w) const;
    void repaintAround(KWin::EffectWindow *w);
    double reach() const;
    const TabGroup *tabGroupOf(KWin::EffectWindow *w) const;
    void drawTabIndicator(const KWin::RenderViewport &viewport, const TabGroup &group, const KWin::RectF &frame, const KWin::Region &deviceRegion, double opacity, double progress);
    void fillRect(const KWin::RenderViewport &viewport, const KWin::RectF &rect, const QColor &color, const KWin::Region &deviceRegion, double opacity);
    void drawRing(const KWin::RenderViewport &viewport, KWin::EffectWindow *w, const KWin::RectF &frame, const KWin::Region &deviceRegion, double opacity);

    Settings m_settings;
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
    std::vector<std::unique_ptr<QAction>> m_wheelActions;
};

} // namespace KiriDecorations
