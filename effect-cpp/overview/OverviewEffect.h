/*
    Kiri overview. License: GPL-3.0-or-later.

    niri's overview as a KWin effect: every virtual desktop is drawn zoomed out (niri's default zoom 0.5) and
    stacked vertically, with the windows where the Kiri script placed them. The script sends the layout (rects per
    window per desktop) as JSON, opens and closes the overview, and polls for what the user did in it (activate a
    window, drop one, scroll a desktop), because scripts cannot receive calls. The scene is drawn by QML
    (qml/Main.qml) on top of KWin's QuickSceneEffect, which also supplies the window thumbnails; the springs for the
    open/close and desktop-switch animations run here and are niri's (common/NiriAnim.h).
*/
#pragma once

#include "AnimConfig.h"
#include "NiriSwipe.h"
#include "effect/effectwindow.h"
#include "effect/quickeffect.h"

#include <KConfigWatcher>
#include <QColor>
#include <vector>
#include <QElapsedTimer>
#include <QHash>
#include <memory>
#include <unordered_map>
#include <QStringList>
#include <QTimer>
#include <QVariantMap>

namespace KWin
{

class OverviewEffect : public QuickSceneEffect
{
    Q_OBJECT
    Q_CLASSINFO("D-Bus Interface", "org.kde.kiri.Overview")
    Q_PROPERTY(QString layout READ layout NOTIFY layoutChanged)
    // 0 = normal view, 1 = fully zoomed out
    Q_PROPERTY(qreal progress READ progress NOTIFY progressChanged)
    // the (fractional) index of the desktop in the middle
    Q_PROPERTY(qreal wsIndex READ wsIndex NOTIFY wsIndexChanged)
    // desktop id -> horizontal view offset being shown (springs to the layout's scroll)
    Q_PROPERTY(QVariantMap viewOffsets READ viewOffsets NOTIFY viewOffsetsChanged)
    // niri's overview { zoom; backdrop-color; workspace-shadow } from the Kiri settings
    Q_PROPERTY(qreal zoom READ zoom NOTIFY optionsChanged)
    // niri gestures { dnd-edge-view-scroll; dnd-edge-workspace-switch }: viewWidth/viewDelay/viewSpeed, wsHeight/wsDelay/wsSpeed
    Q_PROPERTY(QVariantMap dnd READ dnd NOTIFY optionsChanged)
    Q_PROPERTY(QColor backdropColor READ backdropColor NOTIFY optionsChanged)
    Q_PROPERTY(bool shadowOn READ shadowOn NOTIFY optionsChanged)
    Q_PROPERTY(qreal shadowSoftness READ shadowSoftness NOTIFY optionsChanged)
    Q_PROPERTY(qreal shadowSpread READ shadowSpread NOTIFY optionsChanged)
    Q_PROPERTY(qreal shadowOffsetX READ shadowOffsetX NOTIFY optionsChanged)
    Q_PROPERTY(qreal shadowOffsetY READ shadowOffsetY NOTIFY optionsChanged)
    Q_PROPERTY(QColor shadowColor READ shadowColor NOTIFY optionsChanged)
    Q_PROPERTY(bool closing READ isClosing NOTIFY closingChanged)
    // the invisible first build of the scene (see warm())
    Q_PROPERTY(bool warming READ isWarming NOTIFY warmingChanged)
    // window id -> rect where kiri_motion paints it at the moment the overview opens (see acquire())
    Q_PROPERTY(QVariantMap startRects READ startRects NOTIFY startRectsChanged)
    Q_PROPERTY(QString searchText MEMBER m_searchText WRITE setSearchText NOTIFY searchTextChanged)

public:
    OverviewEffect();
    ~OverviewEffect() override;

    QString layout() const { return m_layout; }
    qreal progress() const { return m_progress; }
    qreal wsIndex() const { return m_wsIndex; }
    QVariantMap viewOffsets() const { return m_viewOffsets; }
    qreal zoom() const { return m_zoom; }
    QVariantMap dnd() const { return m_dnd; }
    QColor backdropColor() const { return m_backdrop; }
    // niri's output { backdrop-color }: the backdrop of the overview on one output
    Q_INVOKABLE QColor backdropFor(const QString &outputName) const;
    bool shadowOn() const { return m_shadowOn; }
    qreal shadowSoftness() const { return m_shadowSoftness; }
    qreal shadowSpread() const { return m_shadowSpread; }
    qreal shadowOffsetX() const { return m_shadowOffsetX; }
    qreal shadowOffsetY() const { return m_shadowOffsetY; }
    QColor shadowColor() const { return m_shadowColor; }
    bool isClosing() const { return !m_open; }
    bool isWarming() const { return m_warm; }
    QVariantMap startRects() const { return m_startRects; }
    void setSearchText(const QString &text);

    void prePaintScreen(ScreenPrePaintData &data) override;
    bool blocksDirectScanout() const override;
    void reconfigure(ReconfigureFlags) override { loadHotCorner(); }
    void postPaintScreen() override;
    void prePaintWindow(RenderView *view, EffectWindow *w, WindowPrePaintData &data) override;
    int requestedEffectChainPosition() const override { return 70; }


public Q_SLOTS:
    // ---- from the Kiri script (D-Bus), every argument a JSON string
    // opens, or closes when it is open; `layout` is the layout JSON
    Q_SCRIPTABLE QString toggle(const QString &layout);
    Q_SCRIPTABLE QString open(const QString &layout);
    // builds the scene invisibly for a moment so that the first real open is smooth
    Q_SCRIPTABLE QString warm(const QString &layout);
    Q_SCRIPTABLE QString close();
    Q_SCRIPTABLE QString setLayout(const QString &layout);
    // {"p":0..1,"layout":{...}} follows the fingers; {"settle":true|false,"v":units/s} lets go
    Q_SCRIPTABLE QString gesture(const QString &json);
    // {"open":bool,"p":progress,"events":[...]}; drains the events
    Q_SCRIPTABLE QString poll();

    // ---- from the QML scene
    void activateWindow(const QString &windowId, const QString &desktopId, int desktopIndex);
    void activateDesktop(int desktopIndex);
    void dropWindow(const QString &windowId, const QString &desktopId, int column, int tile);
    void dropFloating(const QString &windowId, const QString &desktopId, qreal x, qreal y);
    void goToDesktop(int index);
    void stepDesktop(int direction);
    void scrollView(const QString &desktopId, qreal delta);
    void requestClose();
    // niri focus-column-left/right-under-mouse (wheel, Shift+wheel in the overview)
    void focusColumn(const QString &desktopId, int direction);
    // niri overview_scroll_swipe_gesture: two-finger touchpad scroll. `down` is towards the next desktop, `right`
    // scrolls the view of `desktopId` (the one under the pointer) in layout px
    void touchpadScroll(qreal right, qreal down, const QString &desktopId);
    // runs a Kiri action by name (the keys niri hardcodes in the overview: Left/Right/Up/Down)
    void invokeKiriAction(const QString &action);
    // niri dnd-edge-workspace-switch: moves the desktops by `delta` indices while a window is dragged at the top/bottom edge
    void dndEdgeWorkspace(qreal delta);
    void dndEdgeEnd();

Q_SIGNALS:
    void layoutChanged();
    void progressChanged();
    void wsIndexChanged();
    void viewOffsetsChanged();
    void closingChanged();
    void warmingChanged();
    void startRectsChanged();
    void searchTextChanged();
    void optionsChanged();

private:
    struct Scroll
    {
        NiriAnim::Anim spring;
        qint64 start = 0; // ms
        bool animating = false;
        double target = 0;
        double shown = 0;
        qint64 localUntil = 0; // the user is scrolling it: the layout does not move it
    };

    void run(bool on);
    void loadHotCorner();
    bool inHotCorner(const QPointF &pos) const;
    QVariantMap m_dnd;
    bool m_dndWs = false;
    // niri overview_scroll_swipe_gesture (two-finger touchpad scroll in the overview)
    bool m_swipeOn = false;
    bool m_swipeVertical = false;
    double m_swipeStart = 0;
    QString m_swipeDesktop;
    NiriSwipe::SwipeTracker m_swipeTracker;
    QTimer m_swipeEnd;
    void endTouchpadScroll();
    qreal m_zoom = 0.5, m_zoomConfig = 0.5;
    QColor m_backdrop = QColor(0x26, 0x26, 0x26);
    bool m_shadowOn = true;
    qreal m_shadowSoftness = 40, m_shadowSpread = 10, m_shadowOffsetX = 0, m_shadowOffsetY = 10;
    QColor m_shadowColor = QColor(0, 0, 0, 0x50);
    // niri's hot-corners: top-left, top-right, bottom-left, bottom-right
    bool m_corners[4] = {true, false, false, false};
    bool m_cornersOn = true; // the global hot-corners are not off
    // niri's output { backdrop-color; hot-corners }, from the `outputOverrides` setting (JSON, keyed by the output's name)
    struct OutputOptions
    {
        QString id; // lower case: the connector name
        QColor backdrop; // invalid: the global one
        bool hasCorners = false;
        bool cornersOn = true;
        bool corners[4] = {false, false, false, false};
    };
    std::vector<OutputOptions> m_outputs;
    const OutputOptions *optionsOf(const QString &outputName) const;
    void pointerMoved(const QPointF &pos, const QPointF &, Qt::MouseButtons buttons, Qt::MouseButtons, Qt::KeyboardModifiers, Qt::KeyboardModifiers);
    KConfigWatcher::Ptr m_watcher;
    bool m_hotCorner = true;
    bool m_insideCorner = false;
    void holdWindow(EffectWindow *w);
    std::unordered_map<EffectWindow *, std::unique_ptr<EffectWindowVisibleRef>> m_visibleRefs;

    bool acquire();
    void startOpen();
    double progressVelocity() const;
    void startProgress(double to, double velocity);
    void startWorkspace(double to);
    void applyLayout(const QString &layout);
    void queue(const QString &json);
    bool tick();
    qint64 now() const { return m_clock.elapsed(); }
    double seconds(qint64 start) const;
    void logFrames();

    QString m_layout;
    QString m_searchText;
    QStringList m_events;

    bool m_open = false;
    bool m_gesture = false;

    double m_progress = 0;
    NiriAnim::Anim m_progressSpring;
    qint64 m_progressStart = 0;
    bool m_progressAnimating = false;

    double m_wsIndex = 0;
    double m_wsTarget = 0;
    NiriAnim::Anim m_wsSpring;
    qint64 m_wsStart = 0;
    bool m_wsAnimating = false;
    int m_desktopCount = 0;
    int m_layoutCurrent = -1;
    int m_pendingCurrent = -1;
    qint64 m_pendingUntil = 0;

    QHash<QString, Scroll> m_scrolls;
    QVariantMap m_viewOffsets;
    QElapsedTimer m_clock;
    qint64 m_lastFrame = 0;
    qint64 m_prePaint = 0; // when the frame being painted began (0: none)
    qint64 m_costMax = 0;  // the longest prePaint-to-postPaint time of this animation
    bool m_moving = false; // an animation runs: ask for the next frame (see postPaintScreen)
    bool m_warm = false;
    bool m_repaintAfter = false; // one more full repaint after the hand-back frame
    bool m_closedZoom = false; // the zoom is back at 0, the hand-back waits for the desktops to settle
    QVariantMap m_startRects;
    qint64 m_openCall = 0;
    qint64 m_firstFrameMs = 0;
    qint64 m_frameSlow = 0;
    qint64 m_noCloseUntil = 0; // after a drop, a click can not close the overview
    qint64 m_anim = 0; // animation clock (ms), see prePaintScreen
    qint64 m_frames = 0;
    qint64 m_frameSum = 0;
    qint64 m_frameMax = 0;
};

} // namespace KWin
