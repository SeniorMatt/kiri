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

#pragma once

// kwineffects
#include "effect/effect.h"
#include "effect/effectwindow.h"
#include "SpringMotion.h"
#include "input_event_spy.h"
#include "../common/NiriSwipe.h"
#include "effect/timeline.h"

#include <QObject>
#include <QString>

namespace KWin
{

/*
 * How it Works:
 *
 * This effect doesn't change the current desktop, only receives changes from the VirtualDesktopManager.
 * The only visually apparent inputs are desktopChanged() and desktopChanging().
 *
 * When responding to desktopChanging(), the draw position is only affected by what's received from there.
 * After desktopChanging() is done, or without desktopChanging() having been called at all, desktopChanged() is called.
 * The desktopChanged() function configures the m_startPos and m_endPos for the animation, and the duration.
 *
 * m_currentPosition and everything else not labeled "drawCoordinate" uses desktops as a unit.
 * Exmp: 1.2 means the desktop at index 1 shifted over by .2 desktops.
 * All coords must be positive.
 *
 * For the wrapping effect, the render loop has to handle desktop coordinates larger than the total grid's width.
 * 1. It uses modulus to keep the desktop coords in the range [0, gridWidth].
 * 2. It will draw the desktop at index 0 at index gridWidth if it has to.
 * I will not draw any thing farther outside the range than that.
 *
 * I've put an explanation of all the important private vars down at the bottom.
 *
 * Good luck :)
 */

class DesktopSwitchEffect;

class DesktopSwitchScreen
{
public:
    DesktopSwitchScreen(DesktopSwitchEffect *parent, LogicalOutput *screen);
    ~DesktopSwitchScreen();
    void reconfigure();

    void prePaintScreen(ScreenPrePaintData &data);
    void paintScreen();
    void postPaintScreen();

    bool paintWindow(const RenderTarget &renderTarget, const RenderViewport &viewport, EffectWindow *w, int mask, const Region &deviceGeometry, WindowPaintData &data);

    bool isActive() const;
    void desktopChanged(VirtualDesktop *old, VirtualDesktop *current, EffectWindow *with);
    void desktopChanging(VirtualDesktop *old, QPointF desktopOffset, EffectWindow *with);
    void desktopChangingCancelled();
    void windowAdded(EffectWindow *w);
    void windowDeleted(EffectWindow *w);
    void finishedSwitching();
    QPointF visualPosition() const;
    // niri's workspace switch swipe: follow the fingers to a (fractional) row of the desktop grid, then
    // spring to a row with the release velocity
    void niriGesture(double row);
    void startNiriAnimation(double fromRow, int toRow, double velocity);

private:
    QPoint getDrawCoords(QPointF pos, LogicalOutput *screen);
    bool isTranslated(const EffectWindow *w) const;
    bool willBePainted(const EffectWindow *w) const;
    bool shouldElevate(const EffectWindow *w) const;
    QPointF moveInsideDesktopGrid(QPointF p);
    QPointF constrainToDrawableRange(QPointF p);
    QPointF forcePositivePosition(QPointF p) const;
    void optimizePath(); // Find the best path to target desktop

    void startAnimation(const QPointF &oldPos, VirtualDesktop *current, EffectWindow *movingWindow = nullptr);
    void prepareSwitching();

private:
    enum class State {
        Inactive,
        ActiveAnimation,
        ActiveGesture,
    };

    State m_state = State::Inactive;
    SpringMotion m_motionX;
    SpringMotion m_motionY;

    // When the desktop isn't desktopChanging(), these two variables are used to control the animation path.
    // They use desktops as a unit.
    QPointF m_startPos;
    QPointF m_endPos;

    QPointF m_gesturePos;
    NiriAnim::Spring m_niriSpring;
    bool m_niriAnim = false;
    double m_niriElapsed = 0.0; // seconds
    double m_niriX = 0.0;
    // where the desktops were on screen relative to the gesture start desktop when the fingers came down
    QPointF m_gestureBase;

    EffectWindow *m_movingWindow = nullptr;
    AnimationClock m_clock;

    struct
    {
        QPointF position;
        bool wrap;
        QList<VirtualDesktop *> visibleDesktops;
    } m_paintCtx;

    struct WindowData
    {
        EffectWindowVisibleRef visibilityRef;
    };

    QList<EffectWindow *> m_elevatedWindows;
    QHash<EffectWindow *, WindowData> m_windowData;
    DesktopSwitchEffect *m_parent;
    LogicalOutput *m_screen;
};

class DesktopSwitchEffect : public Effect, public InputEventSpy
{
    Q_OBJECT
    Q_CLASSINFO("D-Bus Interface", "org.kde.kiri.DesktopSwitch")
    Q_PROPERTY(int horizontalGap READ horizontalGap)
    Q_PROPERTY(int verticalGap READ verticalGap)
    Q_PROPERTY(bool slideBackground READ slideBackground)

public:
    DesktopSwitchEffect();
    ~DesktopSwitchEffect() override;

    void reconfigure(ReconfigureFlags) override;

    void prePaintScreen(ScreenPrePaintData &data) override;
    bool paintScreen(const RenderTarget &renderTarget, const RenderViewport &viewport, int mask, const Region &deviceRegion, LogicalOutput *screen) override;
    void postPaintScreen() override;

    void prePaintWindow(RenderView *view, EffectWindow *w, WindowPrePaintData &data) override;
    bool paintWindow(const RenderTarget &renderTarget, const RenderViewport &viewport, EffectWindow *w, int mask, const Region &deviceGeometry, WindowPaintData &data) override;

    bool isActive() const override;
    int requestedEffectChainPosition() const override;

    static bool supported();

    // niri's three-finger vertical swipe, from the raw touchpad events: the desktops follow the fingers 1:1
    // (300 units per desktop, a rubber band past the first and last one), and on release spring to the
    // desktop niri would pick from the projected velocity. KWin's own gesture (offset capped at its
    // threshold, always the next desktop or none) is ignored for these swipes.
    void swipeGestureBegin(PointerSwipeGestureBeginEvent *event) override;
    void swipeGestureUpdate(PointerSwipeGestureUpdateEvent *event) override;
    void swipeGestureEnd(PointerSwipeGestureEndEvent *event) override;
    void swipeGestureCancelled(PointerSwipeGestureCancelEvent *event) override;
    // niri's Mod+middle drag: a vertical one drags the desktops with the pointer (a desktop is one screen height of travel)
    void pointerButton(PointerButtonEvent *event) override;
    void pointerMotion(PointerMotionEvent *event) override;

    int horizontalGap() const;
    int verticalGap() const;
    bool slideBackground() const;

public Q_SLOTS:
    // Debug interface (nested KWin has no touchpad): drive the gesture code path by hand.
    // debugGesture feeds the same signal Plasma emits while three fingers swipe, offset in desktops
    // (positive y = fingers up = next desktop), debugRelease lifts the fingers without a switch,
    // debugPosition returns the on-screen desktop position (x, y in desktops) or "idle".
    Q_SCRIPTABLE void debugGesture(double x, double y);
    Q_SCRIPTABLE void debugRelease();
    Q_SCRIPTABLE QString debugPosition();

private Q_SLOTS:
    void desktopChanged(VirtualDesktop *old, VirtualDesktop *current, EffectWindow *with, LogicalOutput *output);
    void desktopChanging(VirtualDesktop *old, QPointF desktopOffset, EffectWindow *with, LogicalOutput *output);
    void desktopChangingCancelled();
    void windowAdded(EffectWindow *w);
    void windowDeleted(EffectWindow *w);

private:
    void finishedSwitching(bool releaseFullScreen = true);
    bool eventFilter(QObject *watched, QEvent *event) override;
    DesktopSwitchScreen *getDesktopSwitchScreen(LogicalOutput *screen);
    void swipeFinish(std::chrono::microseconds time);
    void swipeApplyRelease();
    void swipeUpdateScreen(double row);

    enum class SwipePhase { Idle, Pending, Vertical, Other };
    SwipePhase m_swipePhase = SwipePhase::Idle;
    QPointF m_swipeCumulative;
    NiriSwipe::WorkspaceGesture m_swipeGesture;
    int m_swipeCenter = 0;
    bool m_swipeNatural = false;
    NiriSwipe::WorkspaceGesture::Release m_swipeRelease{};
    bool m_swipeReleasePending = false;
    bool m_swipePointer = false; // the swipe is a Mod+middle drag, not fingers

private:
    int m_hGap;
    int m_vGap;
    bool m_slideBackground;

    bool m_switchingActivity = false;
    QHash<LogicalOutput *, DesktopSwitchScreen> m_slideEffectScreens;
};

inline int DesktopSwitchEffect::horizontalGap() const
{
    return m_hGap;
}

inline int DesktopSwitchEffect::verticalGap() const
{
    return m_vGap;
}

inline bool DesktopSwitchEffect::slideBackground() const
{
    return m_slideBackground;
}

inline bool DesktopSwitchEffect::isActive() const
{
    return std::ranges::any_of(m_slideEffectScreens, &DesktopSwitchScreen::isActive);
}

inline bool DesktopSwitchScreen::isActive() const
{
    return m_state != State::Inactive;
}

inline int DesktopSwitchEffect::requestedEffectChainPosition() const
{
    return 50;
}

} // namespace KWin
