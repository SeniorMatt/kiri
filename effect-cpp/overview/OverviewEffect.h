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

#include "NiriAnim.h"
#include "effect/quickeffect.h"

#include <QElapsedTimer>
#include <QHash>
#include <QStringList>
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
    Q_PROPERTY(qreal zoom READ zoom CONSTANT)
    Q_PROPERTY(bool closing READ isClosing NOTIFY closingChanged)
    // the invisible first build of the scene (see warm())
    Q_PROPERTY(bool warming READ isWarming NOTIFY warmingChanged)
    Q_PROPERTY(QString searchText MEMBER m_searchText WRITE setSearchText NOTIFY searchTextChanged)

public:
    OverviewEffect();
    ~OverviewEffect() override;

    QString layout() const { return m_layout; }
    qreal progress() const { return m_progress; }
    qreal wsIndex() const { return m_wsIndex; }
    QVariantMap viewOffsets() const { return m_viewOffsets; }
    qreal zoom() const { return Zoom; }
    bool isClosing() const { return !m_open; }
    bool isWarming() const { return m_warm; }
    void setSearchText(const QString &text);

    void prePaintScreen(ScreenPrePaintData &data) override;
    void postPaintScreen() override;
    int requestedEffectChainPosition() const override { return 70; }

    // niri: overview { zoom 0.5 }
    static constexpr qreal Zoom = 0.5;

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
    void goToDesktop(int index);
    void scrollView(const QString &desktopId, qreal delta);
    void requestClose();

Q_SIGNALS:
    void layoutChanged();
    void progressChanged();
    void wsIndexChanged();
    void viewOffsetsChanged();
    void closingChanged();
    void warmingChanged();
    void searchTextChanged();

private:
    struct Scroll
    {
        NiriAnim::Spring spring;
        qint64 start = 0; // ms
        bool animating = false;
        double target = 0;
        double shown = 0;
        qint64 localUntil = 0; // the user is scrolling it: the layout does not move it
    };

    bool acquire();
    void startOpen();
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
    NiriAnim::Spring m_progressSpring;
    qint64 m_progressStart = 0;
    bool m_progressAnimating = false;

    double m_wsIndex = 0;
    double m_wsTarget = 0;
    NiriAnim::Spring m_wsSpring;
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
    bool m_moving = false; // an animation runs: ask for the next frame (see postPaintScreen)
    bool m_warm = false;
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
