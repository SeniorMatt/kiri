/*
    Kiri touchpad swipe. License: GPL-3.0-or-later.
*/
#include "SwipeEffect.h"

#include "input.h"
#include "input_event.h"
#include "../common/NiriSwipe.h"
#include "../common/TouchpadConfig.h"

namespace KWin
{

// niri: "Threshold copied from GNOME Shell."
static constexpr double AxisLockDistance = 16.0;

SwipeEffect::SwipeEffect()
{
    QDBusConnection::sessionBus().registerObject(QStringLiteral("/KiriSwipe"), this, QDBusConnection::ExportScriptableSlots);
    input()->installInputEventSpy(this);
}

SwipeEffect::~SwipeEffect()
{
    input()->uninstallInputEventSpy(this);
    QDBusConnection::sessionBus().unregisterObject(QStringLiteral("/KiriSwipe"));
}

bool SwipeEffect::supported()
{
    return true;
}

void SwipeEffect::swipeGestureBegin(PointerSwipeGestureBeginEvent *event)
{
    m_queue.clear();
    m_ended = false;
    m_cumulative = QPointF();
    m_unaccel.reset();
    const TouchpadConfig config = TouchpadConfig::read();
    m_unaccel.setProfile(config.flat, config.speed);
    m_natural = config.natural;
    if (event->fingerCount == 3 || event->fingerCount == 4) {
        m_fingers = event->fingerCount;
        m_phase = Phase::Pending;
        m_id++;
    } else {
        m_phase = Phase::Idle;
    }
}

void SwipeEffect::swipeGestureUpdate(PointerSwipeGestureUpdateEvent *event)
{
    // niri reads dx_unaccelerated(); KWin only passes on libinput's accelerated delta, so undo it
    double ux = event->delta.x();
    double uy = event->delta.y();
    if (m_phase != Phase::Idle) {
        m_unaccel.apply(event->delta.x(), event->delta.y(), event->time.count() / 1000.0, ux, uy);
    }
    if (m_phase == Phase::Pending) {
        m_cumulative += QPointF(ux, uy);
        if (m_cumulative.x() * m_cumulative.x() + m_cumulative.y() * m_cumulative.y() >= AxisLockDistance * AxisLockDistance) {
            m_phase = std::abs(m_cumulative.x()) > std::abs(m_cumulative.y()) ? Phase::Horizontal : Phase::Vertical;
            // like niri, the travel before the lock is dropped; the view starts with this event's delta
        }
    }
    // 3 fingers: the horizontal travel scrolls the view; 4 fingers: the vertical travel opens the overview
    if (m_phase == Phase::Horizontal && m_fingers == 3) {
        m_queue.append({event->time.count() / 1000.0, m_natural ? -ux : ux}); // niri inverts the delta with natural scrolling
    } else if (m_phase == Phase::Vertical && m_fingers == 4) {
        // niri's overview gesture uses the delta as the touchpad reports it (uninverted_delta_y), not the natural-scrolling one
        m_queue.append({event->time.count() / 1000.0, uy});
    }
}

void SwipeEffect::finish(std::chrono::microseconds time)
{
    if (m_phase == Phase::Idle) {
        return;
    }
    // niri ends the view gesture on cancel as well
    m_queue.append({time.count() / 1000.0, 0.0});
    m_ended = true;
}

void SwipeEffect::swipeGestureEnd(PointerSwipeGestureEndEvent *event)
{
    finish(event->time);
}

void SwipeEffect::swipeGestureCancelled(PointerSwipeGestureCancelEvent *event)
{
    finish(event->time);
}

QString SwipeEffect::poll()
{
    static const char phases[] = {'i', 'p', 'h', 'v'};
    QString out = QStringLiteral("{\"id\":%1,\"f\":%4,\"phase\":\"%2\",\"end\":%3,\"ev\":[")
                      .arg(m_id)
                      .arg(QLatin1Char(phases[static_cast<int>(m_phase)]))
                      .arg(m_ended ? QStringLiteral("true") : QStringLiteral("false"))
                      .arg(m_fingers);
    for (int i = 0; i < m_queue.size(); i++) {
        out += QStringLiteral("%1[%2,%3]").arg(i ? QStringLiteral(",") : QString()).arg(m_queue[i].ms, 0, 'f', 3).arg(m_queue[i].dx, 0, 'f', 4);
    }
    out += QStringLiteral("]}");
    m_queue.clear();
    if (m_ended) {
        m_phase = Phase::Idle;
        m_ended = false;
    }
    return out;
}

} // namespace KWin
