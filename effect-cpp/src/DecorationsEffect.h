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

class Effect final : public KWin::OffscreenEffect
{
    Q_OBJECT
    Q_CLASSINFO("D-Bus Interface", "org.kde.kiri.Decorations")

public:
    Effect();
    ~Effect() override;

    static bool supported();

    void reconfigure(ReconfigureFlags flags) override;
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

private:
    void loadSettings();
    void registerWheelShortcuts();
    void wheel(Qt::KeyboardModifiers modifiers, KWin::PointerAxisDirection direction, const QString &shortcut);
    bool decorated(KWin::EffectWindow *w) const;
    int radiusFor(KWin::EffectWindow *w) const;
    KWin::RectF outerBounds(KWin::EffectWindow *w) const;
    void repaintAround(KWin::EffectWindow *w);
    double reach() const;
    const TabGroup *tabGroupOf(KWin::EffectWindow *w) const;
    void drawTabIndicator(const KWin::RenderViewport &viewport, const TabGroup &group, const KWin::RectF &frame, const KWin::Region &deviceRegion, double opacity);
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
    std::vector<std::unique_ptr<QAction>> m_wheelActions;
    QElapsedTimer m_wheelCooldown;
};

} // namespace KiriDecorations
