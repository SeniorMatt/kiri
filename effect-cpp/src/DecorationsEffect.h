/*
    Kiri decorations: rounded window corners, focus ring and borders painted with the window.

    The way a window is redirected to an offscreen texture and shaded to cut its corners follows the
    "Rounded Corners" KWin effect (https://github.com/matinlotfali/KDE-Rounded-Corners),
    Copyright 2015 Robert Metsaranta, and 2023-2026 Matin Lotfaliei, GPL-2.0-or-later.
    Everything else was written for Kiri. License: GPL-3.0-or-later.
*/

#pragma once

#include <effect/offscreeneffect.h>

#include <QColor>
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
};

class Effect final : public KWin::OffscreenEffect
{
    Q_OBJECT

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

private:
    void loadSettings();
    bool decorated(KWin::EffectWindow *w) const;
    int radiusFor(KWin::EffectWindow *w) const;
    KWin::RectF outerBounds(KWin::EffectWindow *w) const;
    void repaintAround(KWin::EffectWindow *w);
    void drawRing(const KWin::RenderViewport &viewport, KWin::EffectWindow *w, const KWin::RectF &frame, const KWin::Region &deviceRegion, double opacity);

    Settings m_settings;
    KConfigWatcher::Ptr m_watcher;
    std::unique_ptr<KWin::GLShader> m_cornerShader;
    std::unique_ptr<KWin::GLShader> m_ringShader;
    KWin::EffectWindow *m_active = nullptr;
};

} // namespace KiriDecorations
