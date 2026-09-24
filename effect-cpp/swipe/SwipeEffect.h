/*
    Kiri touchpad swipe. License: GPL-3.0-or-later.

    KWin hands scripts a swipe only as `progress`, capped at 200 units of finger travel and split per direction.
    This effect spies on the input events instead (InputEventSpy sees every event, uncapped, and does not
    consume it) and keeps the niri state machine: three fingers only, the axis is chosen once the travel
    reaches 16 units (copied from GNOME Shell by niri), and from then on every horizontal delta is queued.
    The Kiri script polls `poll()` over D-Bus (scripts cannot receive calls) and drives the view itself.
*/
#pragma once

#include "effect/effect.h"
#include "input_event_spy.h"
#include "../common/NiriSwipe.h"

#include <QDBusConnection>
#include <QList>
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

    void swipeGestureBegin(PointerSwipeGestureBeginEvent *event) override;
    void swipeGestureUpdate(PointerSwipeGestureUpdateEvent *event) override;
    void swipeGestureEnd(PointerSwipeGestureEndEvent *event) override;
    void swipeGestureCancelled(PointerSwipeGestureCancelEvent *event) override;

public Q_SLOTS:
    // {"id":<swipe number>,"phase":"i|p|h|v","end":<bool>,"ev":[[ms, dx], ...]}; drains the queue.
    // i idle (no 3-finger swipe), p pending (axis not chosen yet), h horizontal, v vertical.
    Q_SCRIPTABLE QString poll();

private:
    enum class Phase { Idle, Pending, Horizontal, Vertical };
    struct Sample { double ms; double dx; };
    void finish(std::chrono::microseconds time);

    Phase m_phase = Phase::Idle;
    QPointF m_cumulative;
    NiriSwipe::Unaccelerate m_unaccel;
    int m_id = 0;
    bool m_ended = false;
    QList<Sample> m_queue;
};

} // namespace KWin
