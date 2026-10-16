/*
    Kiri touchpad swipe. License: GPL-3.0-or-later.
*/
#include "SwipeEffect.h"

#include "input.h"
#include "input_event.h"
#include "../common/NiriSwipe.h"
#include "../common/TouchpadConfig.h"

#include <effect/effecthandler.h>
#include <effect/effectwindow.h>

#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QLoggingCategory>
#include <QUuid>

Q_LOGGING_CATEGORY(KIRI_SWIPE, "kiri.swipe", QtWarningMsg)

namespace KWin
{

// niri: "Threshold copied from GNOME Shell."
static constexpr double AxisLockDistance = 16.0;
// kiri_decorations paints a parked full-screen X11 window (see its setParkedPositions) somewhere else than its real place and
// publishes the offset as window data; the swipe moves the window from where it is painted
static constexpr int ParkedOffsetRole = 0x4B495250;
static double paintedX(const EffectWindow *w)
{
    const QVariant offset = w->data(ParkedOffsetRole);
    return w->frameGeometry().x() + (offset.isValid() ? offset.toPointF().x() : 0.0);
}
// the release has to arrive from the script within this, or the picture is dropped
static constexpr double HeldTimeout = 0.5;

static QString plainId(const QString &id)
{
    QString s = id;
    s.remove(QLatin1Char('{')).remove(QLatin1Char('}'));
    return s.toLower();
}

SwipeEffect::SwipeEffect()
{
    QDBusConnection::sessionBus().registerObject(QStringLiteral("/KiriSwipe"), this, QDBusConnection::ExportScriptableSlots);
    input()->installInputEventSpy(this);
}

SwipeEffect::~SwipeEffect()
{
    effects->setProperty("kiriSwipeVisual", false);
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
            if (m_phase == Phase::Horizontal && m_fingers == 3) {
                lockVisual();
            }
            // like niri, the travel before the lock is dropped; the view starts with this event's delta
        }
    }
    // 3 fingers: the horizontal travel scrolls the view; 4 fingers: the vertical travel opens the overview
    if (m_phase == Phase::Horizontal && m_fingers == 3) {
        const double dx = m_natural ? -ux : ux; // niri inverts the delta with natural scrolling
        m_queue.append({event->time.count() / 1000.0, dx});
        m_pos += dx;
        qCDebug(KIRI_SWIPE) << "in" << std::chrono::duration_cast<std::chrono::microseconds>(std::chrono::steady_clock::now().time_since_epoch()).count() << "pos" << m_pos << "shift" << shift();
        if (m_visual == Visual::Drag) {
            effects->addRepaintFull();
        }
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
    if (m_visual == Visual::Drag) {
        // the picture waits where the fingers left it for the script to say how the view settles
        m_sEnd = shift();
        m_visual = Visual::Held;
        m_since = nowSeconds();
        effects->addRepaintFull();
    }
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
    QString out = QStringLiteral("{\"id\":%1,\"f\":%4,\"phase\":\"%2\",\"end\":%3,\"d0\":%5,\"ev\":[")
                      .arg(m_id)
                      .arg(QLatin1Char(phases[static_cast<int>(m_phase)]))
                      .arg(m_ended ? QStringLiteral("true") : QStringLiteral("false"))
                      .arg(m_fingers)
                      .arg(m_d0, 0, 'f', 3);
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

double SwipeEffect::nowSeconds()
{
    return std::chrono::duration<double>(std::chrono::steady_clock::now().time_since_epoch()).count();
}

bool SwipeEffect::isActive() const
{
    return m_visual != Visual::Off;
}

int SwipeEffect::requestedEffectChainPosition() const
{
    return 97; // before kiri_motion (98) and kiri_decorations (99), which then see the shifted windows
}

// the swipe locked horizontally: remember where the windows are, and where the picture is if it still settles
void SwipeEffect::lockVisual()
{
    m_d0 = 0.0;
    double s0 = 0.0;
    if (m_visual != Visual::Off) {
        for (auto it = m_g0.cbegin(); it != m_g0.cend(); ++it) {
            if (scrolls(it.key())) {
                s0 = it.value() + shift() - paintedX(it.key());
                break;
            }
        }
    }
    m_g0.clear();
    for (EffectWindow *w : effects->stackingOrder()) {
        m_g0.insert(w, paintedX(w));
    }
    m_s0 = s0;
    m_d0 = -s0; // the script's view starts where the picture is
    m_pos = 0.0;
    m_began = false;
    m_visual = Visual::Drag;
    effects->setProperty("kiriSwipeVisual", true);
}

void SwipeEffect::stopVisual()
{
    m_visual = Visual::Off;
    m_g0.clear();
    m_began = false;
    effects->setProperty("kiriSwipeVisual", false);
    effects->addRepaintFull();
}

double SwipeEffect::shift() const
{
    switch (m_visual) {
    case Visual::Drag:
        return m_s0 - m_scale * m_pos;
    case Visual::Held:
        return m_sEnd;
    case Visual::Settle:
        return m_sEnd - (m_spring.value(m_frameTime - m_since) - m_springFrom);
    case Visual::Off:
        break;
    }
    return 0.0;
}

bool SwipeEffect::scrolls(EffectWindow *w) const
{
    return m_ids.contains(plainId(w->internalId().toString())) || w->caption().startsWith(QLatin1String("kiri-ring-"));
}

// how far the window has to be painted from its frame: where the swipe says it belongs minus where it is
double SwipeEffect::windowOffset(EffectWindow *w) const
{
    const auto it = m_g0.constFind(w);
    if (it == m_g0.constEnd() || !scrolls(w)) {
        return 0.0;
    }
    return it.value() + shift() - paintedX(w);
}

bool SwipeEffect::command(const QString &json)
{
    const QJsonObject o = QJsonDocument::fromJson(json.toUtf8()).object();
    const QString m = o.value(QStringLiteral("m")).toString();
    if (m == QLatin1String("begin")) {
        if (m_visual != Visual::Drag) {
            return false;
        }
        m_scale = o.value(QStringLiteral("scale")).toDouble();
        m_ids.clear();
        for (const QJsonValue &v : o.value(QStringLiteral("ids")).toArray()) {
            m_ids.insert(plainId(v.toString()));
        }
        const bool off = qEnvironmentVariableIsSet("KIRI_SWIPE_NOVISUAL"); // for measuring what the script alone does
        m_began = !off;
        qCDebug(KIRI_SWIPE) << "begin" << m_scale << m_ids.size();
        effects->addRepaintFull();
        return !off;
    }
    if (m == QLatin1String("release") && m_began && (m_visual == Visual::Held || m_visual == Visual::Drag)) {
        const double from = o.value(QStringLiteral("from")).toDouble();
        const double to = o.value(QStringLiteral("to")).toDouble();
        if (m_visual == Visual::Drag) {
            m_sEnd = shift();
        }
        m_spring = NiriAnim::Spring(from, to, o.value(QStringLiteral("v")).toDouble(), 1.0, 800.0, 0.0001);
        m_springFrom = from;
        m_since = m_frameTime = nowSeconds();
        m_visual = Visual::Settle;
        effects->addRepaintFull();
        return true;
    }
    if (m == QLatin1String("cancel")) {
        stopVisual();
        return true;
    }
    return false;
}

void SwipeEffect::prePaintScreen(ScreenPrePaintData &data)
{
    m_frameTime = nowSeconds();
    if (m_visual == Visual::Held && m_frameTime - m_since > HeldTimeout) {
        stopVisual();
    }
    if (m_visual != Visual::Off && m_began) {
        data.mask |= PAINT_SCREEN_WITH_TRANSFORMED_WINDOWS;
    }
    if (m_visual != Visual::Off) {
        if (KIRI_SWIPE().isDebugEnabled()) {
            for (auto it = m_g0.cbegin(); it != m_g0.cend(); ++it) {
                if (scrolls(it.key())) {
                    qCDebug(KIRI_SWIPE) << "frame" << std::chrono::duration_cast<std::chrono::microseconds>(std::chrono::steady_clock::now().time_since_epoch()).count()
                                        << "g0" << it.value() << "frame" << it.key()->frameGeometry().x() << "painted" << it.key()->frameGeometry().x() + (m_began ? windowOffset(it.key()) : 0.0) << "scale" << m_scale;
                    break;
                }
            }
        }
    }
    effects->prePaintScreen(data);
}

void SwipeEffect::prePaintWindow(RenderView *view, EffectWindow *w, WindowPrePaintData &data)
{
    if (m_visual != Visual::Off && m_began && windowOffset(w) != 0.0) {
        data.setTransformed();
    }
    effects->prePaintWindow(view, w, data);
}

bool SwipeEffect::drawWindow(const RenderTarget &renderTarget, const RenderViewport &viewport, EffectWindow *w, int mask, const Region &deviceRegion, WindowPaintData &data)
{
    if (m_visual != Visual::Off && m_began) {
        data.setXTranslation(data.xTranslation() + windowOffset(w));
    }
    return effects->drawWindow(renderTarget, viewport, w, mask, deviceRegion, data);
}

void SwipeEffect::postPaintScreen()
{
    if (m_visual == Visual::Settle && m_frameTime - m_since >= m_spring.duration()) {
        stopVisual(); // the script has long moved the windows to where the spring ends
    } else if (m_visual != Visual::Off) {
        effects->addRepaintFull();
    }
    effects->postPaintScreen();
}

} // namespace KWin
