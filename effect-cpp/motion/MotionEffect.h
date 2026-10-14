/*
    Kiri motion: niri's window animations for KWin. Windows that Kiri moves and resizes follow niri's
    window-movement / window-resize springs, new windows open and closing windows close with niri's
    window-open / window-close animations, and a resized window shows its old contents cross-faded into the new
    ones like niri does. License: GPL-3.0-or-later; the maths is niri's (see NiriAnim.h).
*/

#pragma once

#include <chrono>
#include <memory>
#include <optional>
#include <effect/effect.h>
#include <effect/effectwindow.h>
#include <effect/offscreeneffect.h>
#include <scene/item.h>

#include <QHash>
#include <QString>
#include <QPointF>
#include <QSizeF>

#include "NiriAnim.h"

namespace KiriMotion
{

struct WindowState
{
    // move: the window is painted at its real place plus from * spring(1 -> 0), per axis
    QPointF moveFrom;
    double moveStart = 0; // seconds on the effect's clock
    bool moving = false;

    // resize: the painted size goes from sizeFrom to the real size with spring(0 -> 1); the old contents are
    // cross-faded into the new ones with the same progress
    QSizeF sizeFrom;
    double resizeStart = 0;
    bool resizing = false;
    bool snapshot = false;
    double snapshotSince = 0; // when it was taken; a snapshot nobody used for a while is dropped
    double lastRequest = -1;
    int requestStreak = 0;

    // open (150 ms ease-out-expo) and close (150 ms ease-out-quad)
    double openStart = -1;
    double closeStart = -1;
    std::optional<KWin::EffectWindowDeletedRef> deletedRef;
    std::shared_ptr<KWin::ItemEffect> itemEffect;
    KWin::RectF closedFrame;
    int pid = 0; // of a closing window, to find the window that replaces it
    QString windowClass;

    double created = 0;
    double lastChange = -1;
    double streamStart = 0; // when the current chain of closely spaced changes began
    int streak = 0;
    QSizeF lastSize;
};

class Effect final : public KWin::CrossFadeEffect
{
    Q_OBJECT

public:
    Effect();
    ~Effect() override;

    static bool supported();

    void reconfigure(ReconfigureFlags flags) override;
    void prePaintScreen(KWin::ScreenPrePaintData &data) override;
    void prePaintWindow(KWin::RenderView *view, KWin::EffectWindow *w, KWin::WindowPrePaintData &data) override;
    bool drawWindow(const KWin::RenderTarget &renderTarget, const KWin::RenderViewport &viewport, KWin::EffectWindow *w, int mask, const KWin::Region &deviceRegion, KWin::WindowPaintData &data) override;
    void postPaintScreen() override;

    bool isActive() const override;
    int requestedEffectChainPosition() const override;
    bool blocksDirectScanout() const override;

private:
    void manage(KWin::EffectWindow *w);
    bool anyUserResize() const;
    void onGeometryChanged(KWin::EffectWindow *w, const KWin::RectF &old);
    void onAboutToChange(KWin::EffectWindow *w);
    void onClosed(KWin::EffectWindow *w);
    void onAdded(KWin::EffectWindow *w);
    bool eventFilter(QObject *watched, QEvent *event) override;
    void stopWindow(KWin::EffectWindow *w, WindowState &s);
    void takeSnapshot(KWin::EffectWindow *w, WindowState &s);
    bool animatable(KWin::EffectWindow *w) const;
    double now() const;
    bool windowActive(const WindowState &s, double t) const;
    QPointF moveOffset(const WindowState &s, double t) const;
    QSizeF paintedSize(const WindowState &s, const KWin::RectF &frame, double t) const;

    QHash<KWin::EffectWindow *, WindowState> m_windows;
    std::chrono::steady_clock::time_point m_start = std::chrono::steady_clock::now();
    double m_frameTime = 0;
    bool m_capturing = false;
    double m_speed = 1;
    KWin::EffectWindow *m_resizedWindow = nullptr; // the window the user is resizing (or was, until windowDeleted)
    double m_userResizeEnd = -1; // when the last interactive resize ended
    bool resizeSettling(double t) const;
};

} // namespace KiriMotion
