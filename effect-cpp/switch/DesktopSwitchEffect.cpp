/*
    Kiri desktop switch: a vertical desktop switching animation that follows the touchpad swipe 1:1,
    settles fast when the fingers lift, and never blocks: a new swipe or switch retargets from where the
    desktops are on screen right now.

    This is a fork of KWin's Slide effect (src/plugins/slide):
    SPDX-FileCopyrightText: 2007 Lubos Lunak <l.lunak@kde.org>
    SPDX-FileCopyrightText: 2008 Lucas Murray <lmurray@undefinedfire.com>
    SPDX-FileCopyrightText: 2018 Vlad Zahorodnii <vlad.zahorodnii@kde.org>
    Changes for Kiri: no config, no gaps, a stiffer critically damped spring, gestures that continue from the
    animation in progress, and a debug D-Bus interface. License: GPL-3.0-or-later (GPL-2.0-or-later upstream).
*/

// own
#include "DesktopSwitchEffect.h"
#include "core/output.h"
#include "core/renderviewport.h"
#include "effect/effecthandler.h"

// KConfigSkeleton

#include <QDBusConnection>

#include <cmath>

namespace KWin
{

DesktopSwitchScreen::DesktopSwitchScreen(DesktopSwitchEffect *parent, LogicalOutput *screen)
    : m_parent(parent)
    , m_screen(screen)
{
    reconfigure();
}

DesktopSwitchEffect::DesktopSwitchEffect()
{
    reconfigure(ReconfigureAll);
    QDBusConnection::sessionBus().registerObject(QStringLiteral("/KiriDesktopSwitch"), this, QDBusConnection::ExportScriptableSlots);

    connect(effects, &EffectsHandler::desktopChanged,
            this, &DesktopSwitchEffect::desktopChanged);
    connect(effects, &EffectsHandler::desktopChanging,
            this, &DesktopSwitchEffect::desktopChanging);
    connect(effects, QOverload<>::of(&EffectsHandler::desktopChangingCancelled),
            this, &DesktopSwitchEffect::desktopChangingCancelled);
    connect(effects, &EffectsHandler::windowAdded,
            this, &DesktopSwitchEffect::windowAdded);
    connect(effects, &EffectsHandler::windowDeleted,
            this, &DesktopSwitchEffect::windowDeleted);
    connect(effects, &EffectsHandler::desktopAdded,
            this, &DesktopSwitchEffect::finishedSwitching);
    connect(effects, &EffectsHandler::desktopRemoved,
            this, &DesktopSwitchEffect::finishedSwitching);
    connect(effects, &EffectsHandler::screenAdded,
            this, &DesktopSwitchEffect::finishedSwitching);
    connect(effects, &EffectsHandler::screenRemoved, this, [this](LogicalOutput *screen) {
        m_slideEffectScreens.remove(screen);
        finishedSwitching();
    });
    connect(effects, &EffectsHandler::currentActivityAboutToChange, this, [this]() {
        m_switchingActivity = true;
    });
    connect(effects, &EffectsHandler::currentActivityChanged, this, [this]() {
        m_switchingActivity = false;
    });
}

DesktopSwitchEffect::~DesktopSwitchEffect()
{
    QDBusConnection::sessionBus().unregisterObject(QStringLiteral("/KiriDesktopSwitch"));
    finishedSwitching();
}

DesktopSwitchScreen::~DesktopSwitchScreen()
{
    finishedSwitching();
}

bool DesktopSwitchEffect::supported()
{
    return effects->animationsSupported();
}

void DesktopSwitchEffect::reconfigure(ReconfigureFlags)
{
    for (DesktopSwitchScreen &slideScreen : m_slideEffectScreens) {
        slideScreen.reconfigure();
    }

    m_hGap = 0;
    m_vGap = 0;
    m_slideBackground = true;
}

void DesktopSwitchScreen::reconfigure()
{
    // niri's workspace-switch animation: spring, damping-ratio 1.0, stiffness 1000, epsilon 0.0001 (in workspaces,
    // see setEpsilon below); the animation speed setting scales time
    const qreal factor = std::max(effects->animationTimeFactor(), 0.01);
    const qreal springConstant = 1000.0 / (factor * factor);
    const qreal dampingRatio = 1.0;

    m_motionX = SpringMotion(springConstant, dampingRatio);
    m_motionY = SpringMotion(springConstant, dampingRatio);
}

inline Region buildClipRegion(const QPoint &pos, int w, int h)
{
    const QSize screenSize = effects->virtualScreenSize();
    Region r = Rect(pos, screenSize);
    if (effects->optionRollOverDesktops()) {
        r += (r & Rect(-w, 0, w, h)).translated(w, 0); // W
        r += (r & Rect(w, 0, w, h)).translated(-w, 0); // E

        r += (r & Rect(0, -h, w, h)).translated(0, h); // N
        r += (r & Rect(0, h, w, h)).translated(0, -h); // S

        r += (r & Rect(-w, -h, w, h)).translated(w, h); // NW
        r += (r & Rect(w, -h, w, h)).translated(-w, h); // NE
        r += (r & Rect(w, h, w, h)).translated(-w, -h); // SE
        r += (r & Rect(-w, h, w, h)).translated(w, -h); // SW
    }
    return r;
}

void DesktopSwitchEffect::prePaintScreen(ScreenPrePaintData &data)
{
    if (data.screen) {
        if (DesktopSwitchScreen *slideScreen = getDesktopSwitchScreen(data.screen)) {
            slideScreen->prePaintScreen(data);
        }
    }

    effects->prePaintScreen(data);
}

void DesktopSwitchScreen::prePaintScreen(ScreenPrePaintData &data)
{
    if (m_state == State::Inactive) {
        return;
    }
    const QList<VirtualDesktop *> desktops = effects->desktops();
    const int w = effects->desktopGridWidth();
    const int h = effects->desktopGridHeight();

    switch (m_state) {
    case State::Inactive:
        Q_UNREACHABLE();

    case State::ActiveAnimation: {
        const std::chrono::nanoseconds timeDelta = m_clock.tick(data.view);

        m_motionX.advance(timeDelta);
        m_motionY.advance(timeDelta);

        const QSize virtualSpaceSize = effects->virtualScreenSize();
        m_paintCtx.position = QPointF(m_motionX.position() / virtualSpaceSize.width(), m_motionY.position() / virtualSpaceSize.height());
        break;
    }
    case State::ActiveGesture:
        m_paintCtx.position = m_gesturePos;
        break;
    }

    // Clipping
    m_paintCtx.visibleDesktops.clear();
    m_paintCtx.visibleDesktops.reserve(4); // 4 - maximum number of visible desktops
    bool includedX = false, includedY = false;
    for (VirtualDesktop *desktop : desktops) {
        const QPoint coords = effects->desktopGridCoords(desktop);
        if (coords.x() % w == (int)(m_paintCtx.position.x()) % w) {
            includedX = true;
        } else if (coords.x() % w == ((int)(m_paintCtx.position.x()) + 1) % w) {
            includedX = true;
        }
        if (coords.y() % h == (int)(m_paintCtx.position.y()) % h) {
            includedY = true;
        } else if (coords.y() % h == ((int)(m_paintCtx.position.y()) + 1) % h) {
            includedY = true;
        }

        if (includedX && includedY) {
            m_paintCtx.visibleDesktops << desktop;
        }
    }

    data.mask |= Effect::PAINT_SCREEN_TRANSFORMED;
}

bool DesktopSwitchEffect::paintScreen(const RenderTarget &renderTarget, const RenderViewport &viewport, int mask, const Region &deviceRegion, LogicalOutput *screen)
{
    if (DesktopSwitchScreen *slideScreen = getDesktopSwitchScreen(screen)) {
        slideScreen->paintScreen();
    }
    return effects->paintScreen(renderTarget, viewport, mask, deviceRegion, screen);
}

void DesktopSwitchScreen::paintScreen()
{
    m_paintCtx.wrap = effects->optionRollOverDesktops();
}

QPoint DesktopSwitchScreen::getDrawCoords(QPointF pos, LogicalOutput *screen)
{
    QPoint c = QPoint();
    c.setX(pos.x() * (screen->geometry().width() + m_parent->horizontalGap()));
    c.setY(pos.y() * (screen->geometry().height() + m_parent->verticalGap()));
    return c;
}

/**
 * Decide whether given window @p w should be transformed/translated.
 * @returns @c true if given window @p w should be transformed, otherwise @c false
 */
bool DesktopSwitchScreen::isTranslated(const EffectWindow *w) const
{
    if (m_state == State::Inactive) {
        return false;
    }
    if (w->isOnAllDesktops()) {
        if (w->isDesktop()) {
            return m_parent->slideBackground();
        }
        return false;
    } else if (w == m_movingWindow) {
        return false;
    }
    return true;
}

/**
 * Will a window be painted during this frame?
 */
bool DesktopSwitchScreen::willBePainted(const EffectWindow *w) const
{
    if (m_state == State::Inactive) {
        return true;
    }
    if (w->isOnAllDesktops()) {
        return true;
    }
    if (w == m_movingWindow) {
        return true;
    }
    for (VirtualDesktop *desktop : std::as_const(m_paintCtx.visibleDesktops)) {
        if (w->isOnDesktop(desktop)) {
            return true;
        }
    }
    return false;
}

void DesktopSwitchEffect::prePaintWindow(RenderView *view, EffectWindow *w, WindowPrePaintData &data)
{
    data.setTransformed();
    effects->prePaintWindow(view, w, data);
}

bool DesktopSwitchEffect::paintWindow(const RenderTarget &renderTarget, const RenderViewport &viewport, EffectWindow *w, int mask, const Region &deviceGeometry, WindowPaintData &data)
{
    if (DesktopSwitchScreen *slideScreen = getDesktopSwitchScreen(w->screen())) {
        return slideScreen->paintWindow(renderTarget, viewport, w, mask, deviceGeometry, data);
    } else {
        return effects->paintWindow(renderTarget, viewport, w, mask, deviceGeometry, data);
    }
}

bool DesktopSwitchScreen::paintWindow(const RenderTarget &renderTarget, const RenderViewport &viewport, EffectWindow *w, int mask, const Region &deviceGeometry, WindowPaintData &data)
{
    if (!willBePainted(w)) {
        return true;
    }

    if (!isTranslated(w)) {
        return effects->paintWindow(renderTarget, viewport, w, mask, deviceGeometry, data);
    }

    const int gridWidth = effects->desktopGridWidth();
    const int gridHeight = effects->desktopGridHeight();

    QPointF drawPosition = forcePositivePosition(m_paintCtx.position);
    drawPosition = m_paintCtx.wrap ? constrainToDrawableRange(drawPosition) : drawPosition;

    // If we're wrapping, draw the desktop in the second position.
    const bool wrappingX = drawPosition.x() > gridWidth - 1;
    const bool wrappingY = drawPosition.y() > gridHeight - 1;

    const auto screens = effects->screens();

    for (VirtualDesktop *desktop : std::as_const(m_paintCtx.visibleDesktops)) {
        if (!w->isOnDesktop(desktop)) {
            continue;
        }
        QPointF desktopTranslation = QPointF(effects->desktopGridCoords(desktop)) - drawPosition;
        // Decide if that first desktop should be drawn at 0 or the higher position used for wrapping.
        if (effects->desktopGridCoords(desktop).x() == 0 && wrappingX) {
            desktopTranslation = QPointF(desktopTranslation.x() + gridWidth, desktopTranslation.y());
        }
        if (effects->desktopGridCoords(desktop).y() == 0 && wrappingY) {
            desktopTranslation = QPointF(desktopTranslation.x(), desktopTranslation.y() + gridHeight);
        }

        for (LogicalOutput *screen : screens) {
            QPoint drawTranslation = getDrawCoords(desktopTranslation, screen);
            data += drawTranslation;

            const Rect screenArea = screen->geometry();
            const Rect logicalDamage = screenArea.translated(drawTranslation).intersected(screenArea);

            if (!effects->paintWindow(
                    renderTarget, viewport, w, mask,
                    // Only paint the region that intersects the current screen and desktop.
                    deviceGeometry.intersected(viewport.mapToDeviceCoordinatesAligned(logicalDamage)),
                    data)) {
                return false;
            }

            // Undo the translation for the next screen. I know, it hurts me too.
            data += QPoint(-drawTranslation.x(), -drawTranslation.y());
        }
    }
    return true;
}

void DesktopSwitchEffect::postPaintScreen()
{
    bool allInactive = true;
    for (DesktopSwitchScreen &slideScreen : m_slideEffectScreens) {
        slideScreen.postPaintScreen();
        if (slideScreen.isActive()) {
            allInactive = false;
        }
    }
    if (allInactive) {
        finishedSwitching();
    }

    effects->addRepaintFull();
    effects->postPaintScreen();
}

void DesktopSwitchScreen::postPaintScreen()
{
    if (m_state == State::ActiveAnimation && !m_motionX.isMoving() && !m_motionY.isMoving()) {
        finishedSwitching();
    }
}

/*
 * Negative desktop positions aren't allowed.
 */
QPointF DesktopSwitchScreen::forcePositivePosition(QPointF p) const
{
    if (p.x() < 0) {
        p.setX(p.x() + std::ceil(-p.x() / effects->desktopGridWidth()) * effects->desktopGridWidth());
    }
    if (p.y() < 0) {
        p.setY(p.y() + std::ceil(-p.y() / effects->desktopGridHeight()) * effects->desktopGridHeight());
    }
    return p;
}

bool DesktopSwitchScreen::shouldElevate(const EffectWindow *w) const
{
    // Static docks(i.e. this effect doesn't slide docks) should be elevated
    // so they can properly animate themselves when an user enters or leaves
    // a virtual desktop with a window in fullscreen mode.
    return w->isDock();
}

/*
 * This function is called when the desktop changes.
 * Called AFTER the gesture is released.
 * Sets up animation to round off to the new current desktop.
 */
void DesktopSwitchScreen::startAnimation(const QPointF &oldPos, VirtualDesktop *current, EffectWindow *movingWindow)
{
    if (m_state == State::Inactive) {
        prepareSwitching();
    }

    m_state = State::ActiveAnimation;
    m_movingWindow = movingWindow;

    m_startPos = oldPos;
    m_endPos = effects->desktopGridCoords(current);
    if (effects->optionRollOverDesktops()) {
        optimizePath();
    }

    const QSize virtualSpaceSize = effects->virtualScreenSize();
    m_motionX.setAnchor(m_endPos.x() * virtualSpaceSize.width());
    m_motionX.setPosition(m_startPos.x() * virtualSpaceSize.width());
    m_motionY.setAnchor(m_endPos.y() * virtualSpaceSize.height());
    m_motionY.setPosition(m_startPos.y() * virtualSpaceSize.height());
    // niri restarts the spring from the current position without the old velocity
    m_motionX.setVelocity(0);
    m_motionY.setVelocity(0);
    // niri's epsilon is 0.0001 of a workspace; the springs here run in pixels
    m_motionX.setEpsilon(0.0001 * virtualSpaceSize.width());
    m_motionY.setEpsilon(0.0001 * virtualSpaceSize.height());
    m_clock.reset();

    effects->addRepaint(m_screen->geometry());
}

QPointF DesktopSwitchScreen::visualPosition() const
{
    switch (m_state) {
    case State::ActiveAnimation: {
        const QSize virtualSpaceSize = effects->virtualScreenSize();
        return QPointF(m_motionX.position() / virtualSpaceSize.width(), m_motionY.position() / virtualSpaceSize.height());
    }
    case State::ActiveGesture:
        return m_gesturePos;
    default:
        return QPointF(effects->desktopGridCoords(effects->currentDesktop(m_screen)));
    }
}

void DesktopSwitchScreen::prepareSwitching()
{
    const auto windows = effects->stackingOrder();
    m_windowData.reserve(windows.count());

    for (EffectWindow *w : windows) {
        if (w->screen() != m_screen) {
            continue;
        }
        m_windowData[w] = WindowData{
            .visibilityRef = EffectWindowVisibleRef(w, EffectWindow::PAINT_DISABLED_BY_DESKTOP),
        };

        if (shouldElevate(w)) {
            effects->setElevatedWindow(w, true);
            m_elevatedWindows << w;
        }
    }
}

void DesktopSwitchEffect::finishedSwitching()
{
    for (DesktopSwitchScreen &slideScreen : m_slideEffectScreens) {
        slideScreen.finishedSwitching();
    }
    m_slideEffectScreens.clear();
    const QList<EffectWindow *> windows = effects->stackingOrder();
    for (EffectWindow *w : windows) {
        w->setData(WindowForceBackgroundContrastRole, QVariant());
        w->setData(WindowForceBlurRole, QVariant());
    }
    effects->setActiveFullScreenEffect(nullptr);
}

void DesktopSwitchScreen::finishedSwitching()
{
    if (m_state == State::Inactive) {
        return;
    }

    for (EffectWindow *w : std::as_const(m_elevatedWindows)) {
        effects->setElevatedWindow(w, false);
    }
    m_elevatedWindows.clear();

    m_windowData.clear();
    m_movingWindow = nullptr;
    m_state = State::Inactive;
}

void DesktopSwitchEffect::desktopChanged(VirtualDesktop *old, VirtualDesktop *current, EffectWindow *with, LogicalOutput *screen)
{
    if (m_switchingActivity || (effects->hasActiveFullScreenEffect() && effects->activeFullScreenEffect() != this)) {
        return;
    }
    if (!isActive()) {
        const QList<EffectWindow *> windows = effects->stackingOrder();
        for (EffectWindow *w : windows) {
            w->setData(WindowForceBackgroundContrastRole, QVariant(true));
            w->setData(WindowForceBlurRole, QVariant(true));
        }
    }

    auto slideScreenResult = m_slideEffectScreens.tryEmplace(screen, this, screen);
    slideScreenResult.iterator->desktopChanged(old, current, with);
    effects->setActiveFullScreenEffect(this);
}

void DesktopSwitchScreen::desktopChanged(VirtualDesktop *old, VirtualDesktop *current, EffectWindow *with)
{
    QPointF previousPos;
    switch (m_state) {
    case State::Inactive:
        previousPos = effects->desktopGridCoords(old);
        break;

    case State::ActiveAnimation: {
        const QSize virtualSpaceSize = effects->virtualScreenSize();
        previousPos = QPointF(m_motionX.position() / virtualSpaceSize.width(), m_motionY.position() / virtualSpaceSize.height());
        break;
    }

    case State::ActiveGesture:
        previousPos = m_gesturePos;
        break;
    }

    startAnimation(previousPos, current, with);
}

void DesktopSwitchEffect::desktopChanging(VirtualDesktop *old, QPointF desktopOffset, EffectWindow *with, LogicalOutput *output)
{
    if (effects->hasActiveFullScreenEffect() && effects->activeFullScreenEffect() != this) {
        return;
    }
    if (!isActive()) {
        const QList<EffectWindow *> windows = effects->stackingOrder();
        for (EffectWindow *w : windows) {
            w->setData(WindowForceBackgroundContrastRole, QVariant(true));
            w->setData(WindowForceBlurRole, QVariant(true));
        }
    }

    auto slideScreenResult = m_slideEffectScreens.tryEmplace(output, this, output);
    slideScreenResult.iterator->desktopChanging(old, desktopOffset, with);
    effects->setActiveFullScreenEffect(this);
}

void DesktopSwitchScreen::desktopChanging(VirtualDesktop *old, QPointF desktopOffset, EffectWindow *with)
{
    if (m_state == State::Inactive) {
        prepareSwitching();
    }

    // Fingers coming down while an animation is still running: carry on from where the desktops are now,
    // so nothing jumps, instead of from the (already reached) target desktop.
    QPoint gridPos = effects->desktopGridCoords(old);
    if (m_state == State::ActiveAnimation) {
        m_gestureBase = visualPosition() - QPointF(gridPos);
    } else if (m_state == State::Inactive) {
        m_gestureBase = QPointF();
    }
    m_state = State::ActiveGesture;
    m_movingWindow = with;

    m_gesturePos.setX(gridPos.x() + desktopOffset.x() + m_gestureBase.x());
    m_gesturePos.setY(gridPos.y() + desktopOffset.y() + m_gestureBase.y());

    if (effects->optionRollOverDesktops()) {
        m_gesturePos = forcePositivePosition(m_gesturePos);
    } else {
        m_gesturePos = moveInsideDesktopGrid(m_gesturePos);
    }

    effects->addRepaint(m_screen->geometry());
}

void DesktopSwitchEffect::debugGesture(double x, double y)
{
    LogicalOutput *output = effects->activeScreen();
    desktopChanging(effects->currentDesktop(output), QPointF(x, y), nullptr, output);
}

void DesktopSwitchEffect::debugRelease()
{
    desktopChangingCancelled();
}

QString DesktopSwitchEffect::debugPosition()
{
    DesktopSwitchScreen *s = getDesktopSwitchScreen(effects->activeScreen());
    if (!s || !s->isActive()) {
        return QStringLiteral("idle");
    }
    const QPointF p = s->visualPosition();
    return QStringLiteral("%1 %2").arg(p.x(), 0, 'f', 3).arg(p.y(), 0, 'f', 3);
}

void DesktopSwitchEffect::desktopChangingCancelled()
{
    // If the fingers have been lifted and the current desktop didn't change, start animation
    // to move back to the original virtual desktop.
    if (effects->activeFullScreenEffect() == this) {
        for (DesktopSwitchScreen &slideScreen : m_slideEffectScreens) {
            slideScreen.desktopChangingCancelled();
        }
    }
}

void DesktopSwitchScreen::desktopChangingCancelled()
{
    // Only a gesture of ours can be cancelled. KWin sends the cancel at the end of EVERY desktop swipe,
    // including left/right swipes it ignored because the desktops are in one column (Kiri scrolls columns
    // with those); starting from the stale m_gesturePos then threw the running switch back to the old
    // desktop on every left/right swipe.
    if (m_state == State::ActiveGesture) {
        startAnimation(m_gesturePos, effects->currentDesktop(m_screen), nullptr);
    }
}

QPointF DesktopSwitchScreen::moveInsideDesktopGrid(QPointF p)
{
    if (p.x() < 0) {
        p.setX(0);
    }
    if (p.y() < 0) {
        p.setY(0);
    }
    if (p.x() > effects->desktopGridWidth() - 1) {
        p.setX(effects->desktopGridWidth() - 1);
    }
    if (p.y() > effects->desktopGridHeight() - 1) {
        p.setY(effects->desktopGridHeight() - 1);
    }
    return p;
}

void DesktopSwitchEffect::windowAdded(EffectWindow *w)
{
    if (DesktopSwitchScreen *slideScreen = getDesktopSwitchScreen(w->screen())) {
        slideScreen->windowAdded(w);
    }
    if (isActive()) {
        w->setData(WindowForceBackgroundContrastRole, QVariant(true));
        w->setData(WindowForceBlurRole, QVariant(true));
    }
}

void DesktopSwitchScreen::windowAdded(EffectWindow *w)
{
    if (m_state == State::Inactive) {
        return;
    }
    if (shouldElevate(w)) {
        effects->setElevatedWindow(w, true);
        m_elevatedWindows << w;
    }

    m_windowData[w] = WindowData{
        .visibilityRef = EffectWindowVisibleRef(w, EffectWindow::PAINT_DISABLED_BY_DESKTOP),
    };
}

void DesktopSwitchEffect::windowDeleted(EffectWindow *w)
{
    // It's necessary to delete it in all screens, because the window may have changed screens since it was added. This happens e.g. with the desktop change OSD
    // window if the slide effect is triggered on both screens consecutively: the window is added on the first screen and deleted on the second screen.
    for (DesktopSwitchScreen &slideScreen : m_slideEffectScreens) {
        slideScreen.windowDeleted(w);
    }
}

void DesktopSwitchScreen::windowDeleted(EffectWindow *w)
{
    if (m_state == State::Inactive) {
        return;
    }
    if (w == m_movingWindow) {
        m_movingWindow = nullptr;
    }
    m_elevatedWindows.removeAll(w);
    m_windowData.remove(w);
}

/*
 * Find the fastest path between two desktops.
 * This function decides when it's better to wrap around the grid or not.
 * Only call if wrapping is enabled.
 */
void DesktopSwitchScreen::optimizePath()
{
    int w = effects->desktopGridWidth();
    int h = effects->desktopGridHeight();

    // Keep coordinates as low as possible
    if (m_startPos.x() >= w && m_endPos.x() >= w) {
        m_startPos.setX(fmod(m_startPos.x(), w));
        m_endPos.setX(fmod(m_endPos.x(), w));
    }
    if (m_startPos.y() >= h && m_endPos.y() >= h) {
        m_startPos.setY(fmod(m_startPos.y(), h));
        m_endPos.setY(fmod(m_endPos.y(), h));
    }

    // Is there is a shorter possible route?
    // If the x distance to be traveled is more than half the grid width, it's faster to wrap.
    // To avoid negative coordinates, take the lower coordinate and raise.
    if (std::abs((m_startPos.x() - m_endPos.x())) > w / 2.0) {
        if (m_startPos.x() < m_endPos.x()) {
            while (m_startPos.x() < m_endPos.x()) {
                m_startPos.setX(m_startPos.x() + w);
            }
        } else {
            while (m_endPos.x() < m_startPos.x()) {
                m_endPos.setX(m_endPos.x() + w);
            }
        }
        // Keep coordinates as low as possible
        if (m_startPos.x() >= w && m_endPos.x() >= w) {
            m_startPos.setX(fmod(m_startPos.x(), w));
            m_endPos.setX(fmod(m_endPos.x(), w));
        }
    }

    // Same for y
    if (std::abs((m_endPos.y() - m_startPos.y())) > (double)h / (double)2) {
        if (m_startPos.y() < m_endPos.y()) {
            while (m_startPos.y() < m_endPos.y()) {
                m_startPos.setY(m_startPos.y() + h);
            }
        } else {
            while (m_endPos.y() < m_startPos.y()) {
                m_endPos.setY(m_endPos.y() + h);
            }
        }
        // Keep coordinates as low as possible
        if (m_startPos.y() >= h && m_endPos.y() >= h) {
            m_startPos.setY(fmod(m_startPos.y(), h));
            m_endPos.setY(fmod(m_endPos.y(), h));
        }
    }
}

/*
 * Takes the point and uses modulus to keep draw position within [0, desktopGridWidth]
 * The render loop will draw the first desktop (0) after the last one (at position desktopGridWidth) for the wrap animation.
 * This function finds the true fastest path, regardless of which direction the animation is already going;
 * I was a little upset about this limitation until I realized that MacOS can't even wrap desktops :)
 */
QPointF DesktopSwitchScreen::constrainToDrawableRange(QPointF p)
{
    p.setX(fmod(p.x(), effects->desktopGridWidth()));
    p.setY(fmod(p.y(), effects->desktopGridHeight()));
    return p;
}

DesktopSwitchScreen *DesktopSwitchEffect::getDesktopSwitchScreen(LogicalOutput *screen)
{
    auto it = m_slideEffectScreens.find(screen);
    if (it == m_slideEffectScreens.end()) {
        return nullptr;
    }
    return &(*it);
}

} // namespace KWin

#include "moc_DesktopSwitchEffect.cpp"
