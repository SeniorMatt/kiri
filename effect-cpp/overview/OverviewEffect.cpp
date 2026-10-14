/*
    Kiri overview. License: GPL-3.0-or-later.
*/
#include "OverviewEffect.h"

#include "effect/effecthandler.h"

#include <QDBusConnection>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QLoggingCategory>
#include <QTimer>
#include <QUrl>

Q_LOGGING_CATEGORY(KIRI_OVERVIEW, "kiri.overview", QtInfoMsg)

namespace KWin
{

namespace
{
// niri animations.overview-open-close: spring 1.0 / 800 / 0.0001; workspace-switch 1.0 / 1000 / 0.0001;
// horizontal-view-movement 1.0 / 800 / 0.0001
NiriAnim::Spring makeSpring(double from, double to, double velocity, double stiffness)
{
    return NiriAnim::Spring(from, to, velocity, 1.0, stiffness, 0.0001);
}

QString jsonString(const QJsonObject &object)
{
    return QString::fromUtf8(QJsonDocument(object).toJson(QJsonDocument::Compact));
}
} // namespace

OverviewEffect::OverviewEffect()
{
    // keep the views (the QML scene, thumbnails, wallpapers) alive after the overview closes: opening it again right
    // away reuses them instead of building everything again
    setViewCachingEnabled(true);
    m_clock.start();
    QDBusConnection::sessionBus().registerObject(QStringLiteral("/KiriOverview"), this, QDBusConnection::ExportScriptableSlots);
    setSource(QUrl(QStringLiteral("qrc:/kiri/overview/qml/Main.qml")));
    connect(effects, &EffectsHandler::screenAboutToLock, this, [this]() {
        if (isRunning()) {
            m_open = false;
            m_gesture = false;
            m_progress = 0;
            m_progressAnimating = false;
            setRunning(false);
            Q_EMIT progressChanged();
            Q_EMIT closingChanged();
        }
    });
}

OverviewEffect::~OverviewEffect()
{
    QDBusConnection::sessionBus().unregisterObject(QStringLiteral("/KiriOverview"));
}

void OverviewEffect::setSearchText(const QString &text)
{
    if (text != m_searchText) {
        m_searchText = text;
        Q_EMIT searchTextChanged();
    }
}

// ---- animation ---------------------------------------------------------------------------------------------

// the speed of the zoom right now, so that a toggle during the animation turns it around smoothly (in progress
// units per second of spring time, what the Spring takes)
double OverviewEffect::progressVelocity() const
{
    if (!m_progressAnimating) {
        return 0;
    }
    const double s = seconds(m_progressStart);
    constexpr double dt = 0.002;
    return (m_progressSpring.value(s + dt) - m_progressSpring.value(s)) / dt;
}

void OverviewEffect::startProgress(double to, double velocity)
{
    m_progressSpring = makeSpring(m_progress, to, velocity, 800);
    m_progressStart = m_anim;
    m_progressAnimating = true;
    effects->addRepaintFull();
}

void OverviewEffect::startWorkspace(double to)
{
    m_wsTarget = to;
    m_wsSpring = makeSpring(m_wsIndex, to, 0, 1000);
    m_wsStart = m_anim;
    m_wsAnimating = true;
    effects->addRepaintFull();
}

// seconds on a spring that started at `start`; the global animation speed setting scales niri's times
// ("instant" jumps to the end)
double OverviewEffect::seconds(qint64 start) const
{
    const double factor = effects->animationTimeFactor();
    const double speed = factor > 0 ? 1.0 / factor : 1e6;
    return (m_anim - start) / 1000.0 * speed;
}

void OverviewEffect::logFrames()
{
    if (m_frames > 0) {
        // one line per animation, so that a lag on the owner's machine can be read from the journal
        qCInfo(KIRI_OVERVIEW).nospace() << (m_warm ? "warm-up" : "animation") << ": first frame " << m_firstFrameMs << " ms, "
                                        << m_frames << " frames, average " << double(m_frameSum) / m_frames << " ms, max "
                                        << m_frameMax << " ms, " << m_frameSlow << " over 25 ms";
    }
    m_frames = 0;
    m_frameSum = 0;
    m_frameMax = 0;
    m_frameSlow = 0;
    m_firstFrameMs = 0;
    m_lastFrame = 0;
}

// returns true while something still moves
bool OverviewEffect::tick()
{
    const qint64 t = now();
    bool more = false;

    if (m_progressAnimating) {
        const double s = seconds(m_progressStart);
        if (m_progressSpring.isDone(s)) {
            m_progressAnimating = false;
            m_progress = m_progressSpring.to();
        } else {
            m_progress = m_progressSpring.value(s);
            more = true;
        }
        Q_EMIT progressChanged();
        if (!m_progressAnimating && !m_open && !m_gesture) {
            m_progress = 0;
            m_closedZoom = true;
            Q_EMIT progressChanged();
        }
    }

    if (m_wsAnimating) {
        const double s = seconds(m_wsStart);
        if (m_wsSpring.isDone(s)) {
            m_wsAnimating = false;
            m_wsIndex = m_wsSpring.to();
        } else {
            m_wsIndex = m_wsSpring.value(s);
            more = true;
        }
        Q_EMIT wsIndexChanged();
    }

    bool offsetsChanged = false;
    for (auto it = m_scrolls.begin(); it != m_scrolls.end(); ++it) {
        Scroll &sc = it.value();
        if (!sc.animating && t >= sc.localUntil && std::abs(sc.shown - sc.target) > 0.5) {
            sc.spring = makeSpring(sc.shown, sc.target, 0, 800);
            sc.start = m_anim;
            sc.animating = true;
        }
        if (sc.animating) {
            const double s = seconds(sc.start);
            if (sc.spring.isDone(s)) {
                sc.animating = false;
                sc.shown = sc.target;
            } else {
                sc.shown = sc.spring.value(s);
                more = true;
            }
            m_viewOffsets.insert(it.key(), sc.shown);
            offsetsChanged = true;
        }
    }
    if (offsetsChanged) {
        Q_EMIT viewOffsetsChanged();
    }
    if (m_closedZoom && !more && !m_open && !m_gesture && !m_warm) {
        // closed, and the desktops sit where they are on the real screen (the view offsets and the desktop spring have
        // arrived: handing back earlier would show them jumping): hand the screen back
        m_closedZoom = false;
        setRunning(false);
        logFrames();
        return false;
    }
    return more;
}

void OverviewEffect::prePaintScreen(ScreenPrePaintData &data)
{
    if (isRunning()) {
        // frame times while the overview moves, logged per animation (see logFrames); a hitch of up to 2 s counts
        const qint64 t = now();
        if (m_lastFrame > 0 && t - m_lastFrame < 2000) {
            m_frames++;
            m_frameSum += t - m_lastFrame;
            m_frameMax = std::max<qint64>(m_frameMax, t - m_lastFrame);
            if (t - m_lastFrame > 25) {
                m_frameSlow++;
            }
        }
        // The springs run on their own clock that advances at most 100 ms per frame: building the scene
        // on the first frame, or any hitch, must not make the zoom skip ahead (it would look like a teleport).
        m_anim += (m_lastFrame > 0) ? std::min<qint64>(t - m_lastFrame, 100) : 0;
        if (m_lastFrame == 0 && m_openCall > 0) {
            m_firstFrameMs = t - m_openCall;
            m_openCall = 0;
        }
        m_lastFrame = t;
        m_moving = tick();
    } else {
        m_moving = false;
    }
    QuickSceneEffect::prePaintScreen(data);
}

// The next frame is asked for once this one is painted. Asked for in prePaintScreen, the repaint belongs to the
// frame being painted and is used up by it: KWin then draws the next frame only when something else on screen
// changes (an app that redraws all the time, like OBS's preview), and the animation stutters.
void OverviewEffect::postPaintScreen()
{
    if (m_moving && isRunning()) {
        effects->addRepaintFull();
    }
    QuickSceneEffect::postPaintScreen();
}

// ---- layout ------------------------------------------------------------------------------------------------

void OverviewEffect::applyLayout(const QString &layout)
{
    const QJsonDocument doc = QJsonDocument::fromJson(layout.toUtf8());
    if (!doc.isObject()) {
        qCWarning(KIRI_OVERVIEW) << "bad layout json";
        return;
    }
    const QJsonObject obj = doc.object();
    const qint64 t = now();
    const int current = obj.value(QStringLiteral("current")).toInt(0);
    const QJsonArray desktops = obj.value(QStringLiteral("desktops")).toArray();
    m_desktopCount = desktops.size();

    QStringList seen;
    for (const QJsonValue &v : desktops) {
        const QJsonObject d = v.toObject();
        const QString id = d.value(QStringLiteral("id")).toString();
        const double scroll = d.value(QStringLiteral("scroll")).toDouble();
        seen << id;
        auto it = m_scrolls.find(id);
        if (it == m_scrolls.end()) {
            Scroll sc;
            sc.shown = sc.target = scroll;
            it = m_scrolls.insert(id, sc);
            m_viewOffsets.insert(id, scroll);
        } else if (std::abs(scroll - it->target) > 0.5) {
            it->target = scroll;
            if (t >= it->localUntil) {
                it->spring = makeSpring(it->shown, scroll, 0, 800);
                it->start = m_anim;
                it->animating = true;
            }
        }
    }
    for (auto it = m_scrolls.begin(); it != m_scrolls.end();) {
        if (!seen.contains(it.key())) {
            m_viewOffsets.remove(it.key());
            it = m_scrolls.erase(it);
        } else {
            ++it;
        }
    }

    const bool first = m_layoutCurrent < 0;
    if (m_pendingCurrent >= 0 && t < m_pendingUntil) {
        if (current == m_pendingCurrent) {
            m_pendingCurrent = -1;
        }
        // else: the script has not caught up with the desktop the user scrolled to yet
    } else if (first || current != m_layoutCurrent) {
        m_pendingCurrent = -1;
        if (first && !isRunning()) {
            m_wsIndex = m_wsTarget = current;
            m_wsAnimating = false;
            Q_EMIT wsIndexChanged();
        } else {
            startWorkspace(current);
        }
    }
    m_layoutCurrent = current;

    m_layout = layout;
    Q_EMIT layoutChanged();
    Q_EMIT viewOffsetsChanged();
    effects->addRepaintFull();
}

// ---- D-Bus -------------------------------------------------------------------------------------------------

// Starts the scene. Another full-screen effect (the desktop switch animation) would make KWin refuse it, and niri
// cuts such animations short when the overview opens: take its place, it ends itself when it sees that (see
// DesktopSwitchEffect, activeFullScreenEffectChanged).
bool OverviewEffect::acquire()
{
    if (isRunning()) {
        return true;
    }
    // The property change tells the effects that animate (kiri_motion, kiri_desktop_switch) to say where their
    // pictures are right now (they listen for it, see their eventFilter); the zoom starts from there instead of from the end positions, so nothing jumps.
    effects->setProperty("kiriOverviewOpening", true);
    effects->setProperty("kiriOverviewOpening", QVariant());
    if (effects->hasActiveFullScreenEffect() && effects->activeFullScreenEffect() != this) {
        effects->setActiveFullScreenEffect(nullptr);
    }
    const QVariantMap rects = effects->property("kiriMotionRects").toMap();
    const QVariant visual = effects->property("kiriSwitchVisual");
    effects->setProperty("kiriMotionRects", QVariant());
    effects->setProperty("kiriSwitchVisual", QVariant());
    m_openCall = now();
    m_closedZoom = false;
    setRunning(true);
    if (!isRunning()) {
        return false;
    }
    if (visual.isValid()) {
        m_wsIndex = visual.toDouble();
        Q_EMIT wsIndexChanged();
        startWorkspace(m_wsTarget);
    }
    m_startRects = rects;
    Q_EMIT startRectsChanged();
    return true;
}

void OverviewEffect::startOpen()
{
    if (effects->isScreenLocked()) {
        return;
    }
    const bool wasRunning = isRunning();
    m_open = true;
    m_gesture = false;
    m_warm = false;
    m_closedZoom = false;
    if (!wasRunning) {
        m_progress = 0;
        if (!acquire()) {
            // refused: never stay in a state that thinks it is open (Meta+O would then do nothing)
            m_open = false;
            return;
        }
        Q_EMIT progressChanged();
    } else {
        Q_EMIT warmingChanged();
    }
    startProgress(1.0, progressVelocity());
    Q_EMIT closingChanged();
}

// Builds the scene once, invisibly, shortly after login: the first real open otherwise pays for the QML and shader
// compilation, the wallpapers and the window textures while the zoom is running.
QString OverviewEffect::warm(const QString &layout)
{
    if (isRunning() || effects->isScreenLocked() || effects->hasActiveFullScreenEffect()) {
        return QStringLiteral("busy");
    }
    m_layoutCurrent = -1;
    applyLayout(layout);
    m_open = false;
    m_gesture = false;
    m_progress = 0;
    m_warm = true;
    if (!acquire()) {
        m_warm = false;
        return QStringLiteral("refused");
    }
    Q_EMIT warmingChanged();
    effects->addRepaintFull();
    QTimer::singleShot(500, this, [this]() {
        if (m_warm && isRunning() && !m_open && !m_gesture) {
            m_warm = false;
            m_progressAnimating = false;
            setRunning(false);
            logFrames();
            Q_EMIT warmingChanged();
        }
    });
    return QStringLiteral("ok");
}

QString OverviewEffect::open(const QString &layout)
{
    if (!isRunning()) {
        m_layoutCurrent = -1;
    }
    applyLayout(layout);
    // not running counts as closed whatever m_open says (a gesture let go at p = 0 used to leave it set: no open ever)
    if (!isRunning() || !m_open || m_gesture) {
        startOpen();
    }
    return QStringLiteral("ok");
}

QString OverviewEffect::close()
{
    if (isRunning() && (m_open || m_gesture)) {
        m_open = false;
        m_gesture = false;
        startProgress(0.0, progressVelocity());
        Q_EMIT closingChanged();
    } else if (!isRunning()) {
        m_open = false;
        m_gesture = false;
    }
    return QStringLiteral("ok");
}

QString OverviewEffect::toggle(const QString &layout)
{
    if (isRunning() && m_open && !m_gesture) {
        applyLayout(layout);
        return close();
    }
    return open(layout);
}

QString OverviewEffect::setLayout(const QString &layout)
{
    if (isRunning()) {
        applyLayout(layout);
    }
    return QStringLiteral("ok");
}

QString OverviewEffect::gesture(const QString &json)
{
    const QJsonObject obj = QJsonDocument::fromJson(json.toUtf8()).object();
    if (obj.contains(QStringLiteral("layout"))) {
        const QJsonValue l = obj.value(QStringLiteral("layout"));
        if (!isRunning()) {
            m_layoutCurrent = -1;
        }
        applyLayout(l.isString() ? l.toString() : jsonString(l.toObject()));
    }
    if (obj.contains(QStringLiteral("p"))) {
        if (effects->isScreenLocked()) {
            return QStringLiteral("locked");
        }
        const double p = std::clamp(obj.value(QStringLiteral("p")).toDouble(), -0.05, 1.05);
        if (!isRunning() && p != 0 && !acquire()) {
            return QStringLiteral("refused");
        }
        m_gesture = true;
        m_open = true;
        m_progressAnimating = false;
        m_progress = p;
        Q_EMIT progressChanged();
        Q_EMIT closingChanged();
        effects->addRepaintFull();
    }
    if (obj.contains(QStringLiteral("settle"))) {
        const bool open = obj.value(QStringLiteral("settle")).toBool();
        const double v = obj.value(QStringLiteral("v")).toDouble();
        m_gesture = false;
        if (isRunning()) {
            m_open = open;
            startProgress(open ? 1.0 : 0.0, v);
        } else if (open && !effects->isScreenLocked()) {
            // let go at p = 0 on "open": the scene is not up yet
            startOpen();
        } else {
            m_open = false;
        }
        Q_EMIT closingChanged();
    }
    return QStringLiteral("ok");
}

void OverviewEffect::queue(const QString &json)
{
    m_events << json;
    // never grow without bound if nobody polls
    while (m_events.size() > 256) {
        m_events.removeFirst();
    }
}

QString OverviewEffect::poll()
{
    QString out = QStringLiteral("{\"open\":%1,\"p\":%2,\"events\":[")
                      .arg(isRunning() && m_open ? QStringLiteral("true") : QStringLiteral("false"))
                      .arg(m_progress, 0, 'f', 4);
    out += m_events.join(QLatin1Char(','));
    out += QStringLiteral("]}");
    m_events.clear();
    return out;
}

// ---- from QML ---------------------------------------------------------------------------------------------

void OverviewEffect::activateWindow(const QString &windowId, const QString &desktopId, int desktopIndex)
{
    if (now() < m_noCloseUntil) {
        return; // the release of a drag, not a click
    }
    queue(jsonString({{"t", "activate"}, {"w", windowId}, {"d", desktopId}}));
    m_pendingCurrent = desktopIndex;
    m_pendingUntil = now() + 600;
    if (std::abs(m_wsTarget - desktopIndex) > 1e-6) {
        startWorkspace(desktopIndex);
    }
    close();
}

void OverviewEffect::activateDesktop(int desktopIndex)
{
    if (now() < m_noCloseUntil) {
        return;
    }
    queue(jsonString({{"t", "goto"}, {"i", desktopIndex}}));
    m_pendingCurrent = desktopIndex;
    m_pendingUntil = now() + 600;
    if (std::abs(m_wsTarget - desktopIndex) > 1e-6) {
        startWorkspace(desktopIndex);
    }
    close();
}

void OverviewEffect::goToDesktop(int index)
{
    index = std::clamp(index, 0, std::max(0, m_desktopCount - 1));
    if (index == m_pendingCurrent || (m_pendingCurrent < 0 && index == m_layoutCurrent)) {
        return;
    }
    queue(jsonString({{"t", "goto"}, {"i", index}}));
    m_pendingCurrent = index;
    m_pendingUntil = now() + 600;
    startWorkspace(index);
}

void OverviewEffect::dropWindow(const QString &windowId, const QString &desktopId, int column, int tile)
{
    m_noCloseUntil = now() + 700;
    queue(jsonString({{"t", "drop"}, {"w", windowId}, {"d", desktopId}, {"c", column}, {"i", tile}}));
}

void OverviewEffect::scrollView(const QString &desktopId, qreal delta)
{
    auto it = m_scrolls.find(desktopId);
    if (it == m_scrolls.end()) {
        return;
    }
    it->target += delta;
    it->shown = it->target;
    it->animating = false;
    it->localUntil = now() + 400;
    m_viewOffsets.insert(desktopId, it->shown);
    queue(jsonString({{"t", "scroll"}, {"d", desktopId}, {"x", it->target}}));
    Q_EMIT viewOffsetsChanged();
    effects->addRepaintFull();
}

void OverviewEffect::requestClose()
{
    if (now() < m_noCloseUntil) {
        return;
    }
    close();
}

} // namespace KWin
