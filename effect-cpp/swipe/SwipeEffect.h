/*
    Kiri touchpad swipe. License: GPL-3.0-or-later.

    KWin hands scripts a swipe only as `progress`, capped at 200 units of finger travel and split per direction.
    This effect spies on the input events instead (InputEventSpy sees every event, uncapped, and does not
    consume it) and keeps the niri state machine: three fingers (horizontal travel) or four (vertical travel, the overview), the axis is chosen once the travel
    reaches 16 units (copied from GNOME Shell by niri), and from then on every horizontal delta is queued.
    The Kiri script polls `poll()` over D-Bus (scripts cannot receive calls) and drives the view itself, but that
    takes a round trip and a layout pass per poll, so the effect also paints the windows where the fingers put
    them, every frame, by shifting each tiled window from where the script has put it to where the swipe says it
    belongs (the shift drops to zero as the script catches up). The script tells the effect the scroll per unit
    of travel and which windows scroll (`command` begin), and how the release settles (`command` release); the
    effect then runs the settle spring itself, while the script has already moved the windows to where it ends.
*/
#pragma once

#include "effect/effect.h"
#include "input_event_spy.h"
#include "../common/NiriSwipe.h"

#include "../common/NiriAnim.h"

#include <QDBusConnection>
#include <QHash>
#include <QList>
#include <QSet>
#include <chrono>
#include <QPointF>
#include <QString>

namespace KWin
{

class SwipeEffect : public Effect, public InputEventSpy
{
    Q_OBJECT
public:
    SwipeEffect();
    ~SwipeEffect() override;

    static bool supported();

    bool isActive() const override;
    int requestedEffectChainPosition() const override;
    void prePaintScreen(ScreenPrePaintData &data) override;
    void prePaintWindow(RenderView *view, EffectWindow *w, WindowPrePaintData &data) override;
    bool drawWindow(const RenderTarget &renderTarget, const RenderViewport &viewport, EffectWindow *w, int mask, const Region &deviceRegion, WindowPaintData &data) override;
    void postPaintScreen() override;

    void swipeGestureBegin(PointerSwipeGestureBeginEvent *event) override;
    void swipeGestureUpdate(PointerSwipeGestureUpdateEvent *event) override;
    void swipeGestureEnd(PointerSwipeGestureEndEvent *event) override;
    void swipeGestureCancelled(PointerSwipeGestureCancelEvent *event) override;

public Q_SLOTS:
    // {"id":<swipe number>,"f":<fingers>,"phase":"i|p|h|v","end":<bool>,"ev":[[ms, dx or dy], ...]}; drains the queue.
    // i idle (no 3-finger swipe), p pending (axis not chosen yet), h horizontal, v vertical.
    Q_SCRIPTABLE QString poll();
    // {"m":"begin","scale":<scroll px per unit of travel, signed>,"ids":[<window ids that scroll>]}
    // {"m":"release","from":F,"to":T,"v":V} (scroll positions in px, V in px/s) or {"m":"cancel"}
    Q_SCRIPTABLE bool command(const QString &json);

private:
    enum class Phase { Idle, Pending, Horizontal, Vertical };
    struct Sample { double ms; double dx; };
    void finish(std::chrono::microseconds time);

    // what is painted: every scrolling window at its frame x when the swipe locked + shift()
    enum class Visual { Off, Drag, Held, Settle };
    void lockVisual();
    void stopVisual();
    double shift() const;
    double windowOffset(EffectWindow *w) const;
    bool scrolls(EffectWindow *w) const;
    static double nowSeconds();

    Visual m_visual = Visual::Off;
    QHash<EffectWindow *, double> m_g0; // frame x of every window when the swipe locked
    QSet<QString> m_ids;
    bool m_began = false; // the script's begin arrived
    double m_scale = 0.0;
    double m_pos = 0.0; // travel since the lock
    double m_s0 = 0.0;  // the shift when the swipe locked (a swipe that lands on a settling view)
    double m_sEnd = 0.0;
    double m_since = 0.0; // start of the Held / Settle state
    double m_frameTime = 0.0;
    NiriAnim::Spring m_spring;
    double m_springFrom = 0.0;
    double m_d0 = 0.0; // reported to the script with the first events

    Phase m_phase = Phase::Idle;
    int m_fingers = 3;
    QPointF m_cumulative;
    bool m_natural = false;
    int m_id = 0;
    bool m_ended = false;
    QList<Sample> m_queue;
};

} // namespace KWin
