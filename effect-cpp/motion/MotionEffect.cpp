/*
    Kiri motion. See MotionEffect.h. License: GPL-3.0-or-later.
*/

#include <utility>
#include "MotionEffect.h"

#include <core/output.h>
#include <effect/effecthandler.h>
#include <scene/windowitem.h>

#include <QDynamicPropertyChangeEvent>
#include <QLoggingCategory>

Q_LOGGING_CATEGORY(KIRI_MOTION, "kiri.motion", QtWarningMsg)

namespace KiriMotion
{

namespace
{
// the decorations effect leaves its ring and tab indicator out of the old-contents snapshot when this is set
constexpr int CaptureRole = 0x4B495249;
constexpr double ResizeThreshold = 10; // px, niri's RESIZE_ANIMATION_THRESHOLD
constexpr double StreamGap = 0.030; // changes closer than this count as one continuous stream (touchpad scrolling)
constexpr int StreamLength = 2;
constexpr double StreamMinDuration = 0.060; // a chain shorter than this is a few layout passes of one action, not a scroll
constexpr double SettleAfterUserResize = 0.3; // clients still commit the last sizes of an interactive resize this long after the button is released
constexpr double SettleAfterOpen = 0.05; // Kiri places a new window right after it appears; that is no movement
// SDL on X11 unmaps and maps a window again when a game goes full-screen: KWin closes the window and opens a new one.
// An X11 window that is full-screen or was opened a moment ago keeps its last picture, unchanged, this long before it
// closes (a Wayland window never does); a window of the same process and class that is mapped meanwhile replaces it without any animation.
constexpr double RemapHold = 0.3;
constexpr double RemapRecent = 2.0;
} // namespace

// the Kiri overview is the full-screen effect that is running (not the desktop switch, which comes and goes with
// every desktop change and moves nothing but its own picture)
static bool overviewUp()
{
    const KWin::Effect *e = KWin::effects->activeFullScreenEffect();
    return e && QByteArrayView(e->metaObject()->className()) == QByteArrayView("KWin::OverviewEffect");
}

Effect::Effect()
{
    reconfigure(ReconfigureAll);
    connect(KWin::effects, &KWin::EffectsHandler::windowAdded, this, &Effect::onAdded);
    connect(KWin::effects, &KWin::EffectsHandler::windowClosed, this, &Effect::onClosed);
    connect(KWin::effects, &KWin::EffectsHandler::windowDeleted, this, [this](KWin::EffectWindow *w) {
        m_windows.remove(w);
        if (w == m_resizedWindow) {
            m_resizedWindow = nullptr;
        }
    });
    // A full-screen effect (the overview) takes over: it zooms out from what is on screen at this moment, so it is told
    // where each animated window is painted now. Changes of the windows while it is up are not animated here: it
    // animates the thumbnails itself.
    KWin::effects->installEventFilter(this);
    for (KWin::EffectWindow *w : KWin::effects->stackingOrder()) {
        manage(w);
    }
}

Effect::~Effect()
{
    // dropping the last reference to a closed window deletes it and emits windowDeleted, which must not reach
    // this half-destroyed effect
    disconnect(KWin::effects, nullptr, this, nullptr);
    QHash<KWin::EffectWindow *, WindowState> windows = std::exchange(m_windows, {});
    for (auto it = windows.begin(); it != windows.end(); ++it) {
        if (it->snapshot) {
            unredirect(it.key());
        }
        it->itemEffect.reset();
    }
    windows.clear();
}

bool Effect::supported()
{
    return KWin::effects->isOpenGLCompositing() && KWin::effects->animationsSupported();
}

void Effect::reconfigure(ReconfigureFlags)
{
    // the global animation speed setting scales niri's times; "instant" turns the animations off
    const double factor = KWin::effects->animationTimeFactor();
    m_speed = factor > 0 ? 1.0 / factor : 0;
    qCDebug(KIRI_MOTION) << "animation time factor" << factor;
}

double Effect::now() const
{
    return std::chrono::duration<double>(std::chrono::steady_clock::now() - m_start).count();
}

bool Effect::isActive() const
{
    return m_speed > 0;
}

int Effect::requestedEffectChainPosition() const
{
    return 98; // just before kiri_decorations (99), which then paints the ring around the animated window
}

bool Effect::blocksDirectScanout() const
{
    return false;
}

// A window that is entirely off every screen cannot be seen, so neither a snapshot of it nor an animation is needed.
// Kiri parks most of the columns off screen and moves them with every scroll.
// a window that is told it is full-screen but stays a tile (niri's toggle-windowed-fullscreen) is not one of the parked ones
static bool coversScreen(const KWin::EffectWindow *w)
{
    const auto *output = w->screen();
    return !output || (w->frameGeometry().width() >= output->geometry().width() - 0.5 && w->frameGeometry().height() >= output->geometry().height() - 0.5);
}

static bool offScreen(const KWin::RectF &frame)
{
    const KWin::Rect screens = KWin::effects->virtualScreenGeometry();
    return frame.right() <= screens.left() || frame.left() >= screens.right() + 1 || frame.bottom() <= screens.top() || frame.top() >= screens.bottom() + 1;
}

bool Effect::animatable(KWin::EffectWindow *w) const
{
    if (!w->isManaged() || w->isPopupWindow() || w->isLockScreen() || w->isOutline() || w->isSpecialWindow()) {
        return false;
    }
    if (w->caption().startsWith(QLatin1String("kiri-ring-"))) {
        return false; // the fallback ring and tab indicator windows follow their target themselves
    }
    const QString windowClass = w->windowClass();
    if (windowClass == QLatin1String("plasmashell plasmashell") || windowClass == QLatin1String("plasmashell org.kde.plasmashell")) {
        return w->hasDecoration();
    }
    return w->isNormalWindow() || w->isDialog();
}

void Effect::manage(KWin::EffectWindow *w)
{
    if (m_windows.contains(w)) {
        return;
    }
    WindowState &s = m_windows[w];
    s.created = now();
    s.lastSize = w->frameGeometry().size();
    connect(w, &KWin::EffectWindow::windowFrameGeometryAboutToChange, this, &Effect::onAboutToChange);
    connect(w, &KWin::EffectWindow::windowFrameGeometryChanged, this, &Effect::onGeometryChanged);
    connect(w, &KWin::EffectWindow::windowStartUserMovedResized, this, [this](KWin::EffectWindow *w) {
        if (auto it = m_windows.find(w); it != m_windows.end()) {
            stopWindow(w, *it);
        }
        if (w->isUserResize()) {
            m_resizedWindow = w;
        }
    });
    connect(w, &KWin::EffectWindow::windowFinishUserMovedResized, this, [this](KWin::EffectWindow *w) {
        if (w == m_resizedWindow) {
            m_resizedWindow = nullptr;
            m_userResizeEnd = now();
        }
    });
}

bool Effect::eventFilter(QObject *watched, QEvent *event)
{
    if (watched == KWin::effects && event->type() == QEvent::DynamicPropertyChange
        && static_cast<QDynamicPropertyChangeEvent *>(event)->propertyName() == "kiriOverviewOpening" && KWin::effects->property("kiriOverviewOpening").toBool()) {
        const double t = now();
        QVariantMap rects;
        for (auto it = m_windows.begin(); it != m_windows.end(); ++it) {
            WindowState &s = it.value();
            if (s.moving || s.resizing) {
                const KWin::RectF frame = it.key()->frameGeometry();
                const QPointF offset = moveOffset(s, t);
                const QSizeF size = paintedSize(s, frame, t);
                rects.insert(it.key()->internalId().toString(), QRectF(frame.x() + offset.x(), frame.y() + offset.y(), size.width(), size.height()));
            }
            stopWindow(it.key(), s);
        }
        if (!rects.isEmpty()) {
            KWin::effects->setProperty("kiriMotionRects", rects);
        }
        KWin::effects->addRepaintFull();
    }
    return false;
}

void Effect::stopWindow(KWin::EffectWindow *w, WindowState &s)
{
    if (s.moving || s.resizing) {
        qCDebug(KIRI_MOTION) << "stop" << w->caption() << "moving" << s.moving << "resizing" << s.resizing << "swipe" << KWin::effects->property("kiriSwipeVisual").toBool();
    }
    if (s.moving || s.resizing) {
        // the window was painted somewhere else than its real place: KWin only knows the real place, so the painted one is cleared here
        KWin::effects->addRepaintFull();
    }
    s.moving = false;
    s.resizing = false;
    if (s.snapshot) {
        unredirect(w);
        s.snapshot = false;
    }
}

void Effect::takeSnapshot(KWin::EffectWindow *w, WindowState &s)
{
    if (s.snapshot) {
        unredirect(w);
    }
    m_capturing = true;
    w->setData(CaptureRole, true);
    redirect(w);
    w->setData(CaptureRole, QVariant());
    m_capturing = false;
    s.snapshot = true;
    s.snapshotSince = now();
}

// Kiri has asked for a new geometry. A resize only takes effect when the client commits a buffer of the new size,
// and by then the old contents are gone, so they are saved now, while the old buffer is still there.
void Effect::onAboutToChange(KWin::EffectWindow *w)
{
    if (KWin::effects->property("kiriSwipeVisual").toBool()) {
        return; // kiri_swipe paints a touchpad swipe itself, frame by frame
    }
    auto it = m_windows.find(w);
    if (it == m_windows.end()) {
        return;
    }
    WindowState &s = *it;
    const double t = now();
    const bool fast = s.lastRequest >= 0 && t - s.lastRequest < StreamGap;
    s.lastRequest = t;
    s.requestStreak = fast ? s.requestStreak + 1 : 0;
    if (m_speed <= 0 || s.snapshot || s.closeStart >= 0 || s.requestStreak >= StreamLength || t - s.created < SettleAfterOpen
        || anyUserResize() || resizeSettling(t) // the other windows get their sizes at once while a resize goes on
        || (w->isX11Client() && w->isFullScreen() && coversScreen(w)) // Kiri parks these and kiri_decorations paints them (see setParkedPositions)
        || !animatable(w) || !w->isVisible() || !w->isOnCurrentDesktop() || w->isMinimized() || w->isUserMove() || w->isUserResize()
        || (!s.moving && !s.resizing && offScreen(w->frameGeometry()))) {
        return;
    }
    takeSnapshot(w, s);
}

void Effect::onAdded(KWin::EffectWindow *w)
{
    manage(w);
    // the same window mapped again: the old picture goes at once and the new window does not animate its opening
    const double t = now();
    KWin::EffectWindow *old = nullptr;
    for (auto it = m_windows.begin(); it != m_windows.end(); ++it) {
        const WindowState &o = it.value();
        if (it.key() != w && o.closeStart > t && o.pid > 0 && o.pid == w->pid() && o.windowClass == w->windowClass()) {
            old = it.key();
            break;
        }
    }
    if (old) {
        WindowState &o = m_windows[old];
        o.closeStart = -1;
        o.itemEffect.reset();
        old->setData(KWin::WindowClosedGrabRole, QVariant());
        o.deletedRef.reset(); // windowDeleted erases the state
        KWin::effects->addRepaintFull(); // the old picture goes at once
        return;
    }
    if (m_speed <= 0 || !animatable(w) || !w->isVisible() || KWin::effects->activeFullScreenEffect()) {
        return;
    }
    if (w->data(KWin::WindowAddedGrabRole).value<void *>()) {
        return;
    }
    WindowState &s = m_windows[w];
    s.openStart = now();
    s.itemEffect = std::make_shared<KWin::ItemEffect>(w->windowItem());
    w->setData(KWin::WindowAddedGrabRole, QVariant::fromValue(static_cast<void *>(this)));
    KWin::effects->addRepaintFull();
}

void Effect::onClosed(KWin::EffectWindow *w)
{
    auto it = m_windows.find(w);
    if (it == m_windows.end()) {
        return;
    }
    WindowState &s = *it;
    // a window that was opening is just closed
    s.openStart = -1;
    if (m_speed <= 0 || !animatable(w) || !w->isVisible() || w->skipsCloseAnimation() || KWin::effects->activeFullScreenEffect()
        || w->data(KWin::WindowClosedGrabRole).value<void *>()) {
        stopWindow(w, s);
        s.itemEffect.reset();
        KWin::effects->addRepaintFull();
        return;
    }
    // a movement or resize that is running goes on under the closing animation, so the window does not jump to its
    // real place for the first frame of the close
    s.deletedRef.emplace(w);
    s.closeStart = now();
    s.pid = w->pid();
    s.windowClass = w->windowClass();
    if (s.pid > 0 && w->isX11Client() && (w->isFullScreen() || s.closeStart - s.created < RemapRecent)) {
        s.closeStart += RemapHold; // painted as it was until then: the close animation starts when no window came back
    }
    if (!s.itemEffect) {
        s.itemEffect = std::make_shared<KWin::ItemEffect>(w->windowItem());
    }
    w->setData(KWin::WindowClosedGrabRole, QVariant::fromValue(static_cast<void *>(this)));
    KWin::effects->addRepaintFull();
}

QPointF Effect::moveOffset(const WindowState &s, double t) const
{
    if (!s.moving) {
        return QPointF();
    }
    const double k = NiriAnim::moveSpring().value((t - s.moveStart) * m_speed);
    return s.moveFrom * k;
}

QSizeF Effect::paintedSize(const WindowState &s, const KWin::RectF &frame, double t) const
{
    if (!s.resizing) {
        return frame.size();
    }
    const double p = NiriAnim::resizeSpring().value((t - s.resizeStart) * m_speed);
    return QSizeF(std::max(1.0, s.sizeFrom.width() + (frame.width() - s.sizeFrom.width()) * p),
                  std::max(1.0, s.sizeFrom.height() + (frame.height() - s.sizeFrom.height()) * p));
}

// the sizes that the windows around a resized one still have to commit after the pointer is let go are not animated: like
// niri's interactive resize, they just are the new size (the view moving to show the column afterwards still is animated)
bool Effect::resizeSettling(double t) const
{
    return m_userResizeEnd >= 0 && t - m_userResizeEnd < SettleAfterUserResize;
}

bool Effect::anyUserResize() const
{
    for (auto it = m_windows.cbegin(); it != m_windows.cend(); ++it) {
        if (it.key()->isUserResize()) {
            return true;
        }
    }
    return false;
}

void Effect::onGeometryChanged(KWin::EffectWindow *w, const KWin::RectF &old)
{
    auto it = m_windows.find(w);
    if (it == m_windows.end()) {
        return;
    }
    WindowState &s = *it;
    const double t = now();
    const KWin::RectF frame = w->frameGeometry();
    if (KWin::effects->property("kiriSwipeVisual").toBool()) {
        // kiri_swipe paints the scrolling view. A window that only moves with the view keeps the animation it has (niri: the
        // view offset gesture never touches the tiles' move and resize animations; they run on under the moving view)
        if (frame.size() != old.size() || !(s.moving || s.resizing)) {
            stopWindow(w, s);
        }
        s.lastChange = t;
        s.lastSize = frame.size();
        return;
    }

    const bool fast = s.lastChange >= 0 && t - s.lastChange < StreamGap;
    s.lastChange = t;
    s.streak = fast ? s.streak + 1 : 0;
    if (!fast) {
        s.streamStart = t;
    }

    if (m_speed <= 0 || !animatable(w) || !w->isVisible() || !w->isOnCurrentDesktop() || w->isMinimized() || w->isUserMove() || w->isUserResize()
        || (w->isX11Client() && w->isFullScreen() && coversScreen(w)) // parked by Kiri and painted by kiri_decorations
        || (!s.moving && !s.resizing && offScreen(old) && offScreen(frame)) // moving between two places nobody sees
        || overviewUp() || anyUserResize() // like niri's interactive resize (animate = false): the neighbours follow the mouse at once
        || s.closeStart >= 0 || t - s.created < SettleAfterOpen || (s.streak >= StreamLength && t - s.streamStart >= StreamMinDuration) || old.isEmpty() || frame.isEmpty()) {
        stopWindow(w, s);
        return;
    }

    qCDebug(KIRI_MOTION) << "geometry" << w->caption() << old << "->" << frame << "snapshot" << s.snapshot;
    // where the window is painted right now, by the old animation
    const QPointF offset = moveOffset(s, t);
    const QSizeF visualSize = s.resizing ? paintedSize(s, old, t) : old.size();

    // move: niri's animate_move_from: the new offset is the jump of the layout position plus what is left of the old offset
    const QPointF newOffset = old.topLeft() - frame.topLeft() + offset;
    if (std::fabs(newOffset.x()) >= 0.5 || std::fabs(newOffset.y()) >= 0.5) {
        s.moving = true;
        s.moveFrom = newOffset;
        s.moveStart = t;
    } else {
        s.moving = false;
    }

    // resize: only when the size changed by more than niri's threshold; the old contents are kept as a snapshot
    const double change = std::max(std::fabs(frame.width() - visualSize.width()), std::fabs(frame.height() - visualSize.height()));
    if (resizeSettling(t)) {
        s.resizing = false;
        if (s.snapshot) {
            unredirect(w);
            s.snapshot = false;
        }
    } else if (change > ResizeThreshold) {
        if (!s.snapshot) {
            takeSnapshot(w, s); // no request was seen: this is as good as it gets (the new buffer may already be in)
        }
        s.resizing = true;
        s.sizeFrom = visualSize;
        s.resizeStart = t;
    } else if (!s.resizing && s.snapshot) {
        unredirect(w);
        s.snapshot = false;
    }
    s.lastSize = frame.size();
    KWin::effects->addRepaintFull();
}

void Effect::prePaintScreen(KWin::ScreenPrePaintData &data)
{
    m_frameTime = now();
    if (!m_windows.isEmpty()) {
        for (const WindowState &s : std::as_const(m_windows)) {
            if (s.moving || s.resizing || s.openStart >= 0 || s.closeStart >= 0) {
                data.mask |= KWin::Effect::PAINT_SCREEN_WITH_TRANSFORMED_WINDOWS;
                break;
            }
        }
    }
    KWin::CrossFadeEffect::prePaintScreen(data);
}

void Effect::prePaintWindow(KWin::RenderView *view, KWin::EffectWindow *w, KWin::WindowPrePaintData &data)
{
    const auto it = m_windows.constFind(w);
    if (it != m_windows.constEnd() && (it->moving || it->resizing || it->openStart >= 0 || it->closeStart >= 0)) {
        data.setTransformed();
        data.setTranslucent();
    }
    KWin::CrossFadeEffect::prePaintWindow(view, w, data);
}

bool Effect::drawWindow(const KWin::RenderTarget &renderTarget, const KWin::RenderViewport &viewport, KWin::EffectWindow *w, int mask, const KWin::Region &deviceRegion, KWin::WindowPaintData &data)
{
    auto it = m_windows.find(w);
    if (m_capturing || it == m_windows.end()) {
        return KWin::CrossFadeEffect::drawWindow(renderTarget, viewport, w, mask, deviceRegion, data);
    }
    const WindowState &s = *it;
    const double t = m_frameTime;
    const KWin::RectF frame = w->frameGeometry();
    if (frame.isEmpty()) {
        return KWin::CrossFadeEffect::drawWindow(renderTarget, viewport, w, mask, deviceRegion, data);
    }

    const QPointF offset = moveOffset(s, t);
    const QSizeF size = paintedSize(s, frame, t);
    double x = frame.x() + offset.x();
    double y = frame.y() + offset.y();
    double width = size.width();
    double height = size.height();
    double opacity = 1;

    // window-open: scale (progress / 2 + 0.5) around the centre and fade in with the progress, 150 ms ease-out-expo
    // window-close: scale ((1 - progress) / 5 + 0.8) around the centre and fade out, 150 ms ease-out-quad
    double zoom = 1;
    if (s.closeStart >= 0) {
        const double p = NiriAnim::easeOutQuad(std::clamp((t - s.closeStart) * m_speed / (NiriAnim::Defaults::closeMs / 1000), 0.0, 1.0));
        opacity = 1 - p;
        zoom = std::max((1 - p) / 5 + 0.8, 0.0);
    } else if (s.openStart >= 0) {
        const double p = NiriAnim::easeOutExpo(std::clamp((t - s.openStart) * m_speed / (NiriAnim::Defaults::openMs / 1000), 0.0, 1.0));
        opacity = std::clamp(p, 0.0, 1.0);
        zoom = std::max(p / 2 + 0.5, 0.0);
    }
    if (zoom != 1) {
        x += width * (1 - zoom) / 2;
        y += height * (1 - zoom) / 2;
        width *= zoom;
        height *= zoom;
    }

    data.setXScale(data.xScale() * width / frame.width());
    data.setYScale(data.yScale() * height / frame.height());
    data.setXTranslation(data.xTranslation() + x - frame.x());
    data.setYTranslation(data.yTranslation() + y - frame.y());
    data.multiplyOpacity(opacity);
    if (s.snapshot) {
        // before the client's new contents are there only the old ones show; then they cross-fade with the resize spring
        data.setCrossFadeProgress(s.resizing ? NiriAnim::resizeSpring().clampedValue((t - s.resizeStart) * m_speed) : 1.0);
    }
    return KWin::CrossFadeEffect::drawWindow(renderTarget, viewport, w, mask, deviceRegion, data);
}

void Effect::postPaintScreen()
{
    const double t = m_frameTime;
    bool again = false;
    for (auto it = m_windows.begin(); it != m_windows.end();) {
        WindowState &s = *it;
        KWin::EffectWindow *w = it.key();
        if (s.moving && (t - s.moveStart) * m_speed >= NiriAnim::moveSpring().duration()) {
            s.moving = false;
            again = true; // one more frame with the window exactly in place
        }
        if (s.resizing && (t - s.resizeStart) * m_speed >= NiriAnim::resizeSpring().duration()) {
            s.resizing = false;
            again = true;
            if (s.snapshot) {
                unredirect(w);
                s.snapshot = false;
            }
        }
        // a snapshot that was taken for a request and not used by a resize: the request changed nothing or the
        // client is not answering any more
        if (!s.resizing && s.snapshot && t - s.snapshotSince > 4.0) {
            unredirect(w);
            s.snapshot = false;
            again = true;
        }
        if (s.openStart >= 0 && (t - s.openStart) * m_speed >= NiriAnim::Defaults::openMs / 1000) {
            s.openStart = -1;
            if (s.closeStart < 0) {
                s.itemEffect.reset();
            }
            w->setData(KWin::WindowAddedGrabRole, QVariant());
            again = true;
        }
        if (s.closeStart >= 0 && (t - s.closeStart) * m_speed >= NiriAnim::Defaults::closeMs / 1000) {
            s.closeStart = -1;
            s.itemEffect.reset();
            w->setData(KWin::WindowClosedGrabRole, QVariant());
            s.deletedRef.reset(); // the window is gone for real now; windowDeleted erases its state, so stop here
            again = true;
            break;
        }
        again = again || s.moving || s.resizing || s.openStart >= 0 || s.closeStart >= 0;
        ++it;
    }
    if (again) {
        KWin::effects->addRepaintFull();
    }
    KWin::CrossFadeEffect::postPaintScreen();
}

} // namespace KiriMotion
