/*
    Kiri overview. License: GPL-3.0-or-later.
*/
#include "OverviewEffect.h"

#include "effect/effecthandler.h"
#include "effect/effectwindow.h"

#include "core/output.h"
#include "wayland/seat.h"
#include "wayland_server.h"

#include <KConfigGroup>
#include <KSharedConfig>
#include <QDBusConnection>
#include <QDBusMessage>
#include <QDBusPendingCallWatcher>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QLoggingCategory>
#include <QRegularExpression>
#include <algorithm>
#include <QTimer>
#include <QUrl>

Q_LOGGING_CATEGORY(KIRI_OVERVIEW, "kiri.overview", QtInfoMsg)

namespace KWin
{

namespace
{
// niri's animations: overview-open-close (the progress), workspace-switch (the desktops), horizontal-view-movement
// (the view of a desktop); the defaults are springs 1.0 / 800, 1.0 / 1000 and 1.0 / 800, all with epsilon 0.0001
NiriAnim::Anim makeProgress(double from, double to, double velocity)
{
    return NiriAnim::config().overviewOpenClose.make(from, to, velocity);
}
NiriAnim::Anim makeWorkspace(double from, double to, double velocity)
{
    return NiriAnim::config().workspaceSwitch.make(from, to, velocity);
}
NiriAnim::Anim makeView(double from, double to, double velocity)
{
    return NiriAnim::config().horizontalViewMovement.make(from, to, velocity);
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
    connect(effects, &EffectsHandler::windowAdded, this, [this](EffectWindow *w) {
        if (isRunning()) {
            holdWindow(w);
        }
    });
    connect(effects, &EffectsHandler::windowDeleted, this, [this](EffectWindow *w) {
        m_visibleRefs.erase(w);
    });
    // the drag-and-drop of Wayland clients (and Xwayland's) goes through KWin's seat, which no effect hook reports
    if (waylandServer() && waylandServer()->seat()) {
        auto *seat = waylandServer()->seat();
        connect(seat, &SeatInterface::dragStarted, this, [this]() { setSeatDrag(true); });
        connect(seat, &SeatInterface::dragEnded, this, [this]() { setSeatDrag(false); });
        m_dndHoldTimer.setInterval(50);
        connect(&m_dndHoldTimer, &QTimer::timeout, this, &OverviewEffect::dndHoldTick);
    }
    loadHotCorner();
    NiriAnim::load();
    m_watcher = KConfigWatcher::create(KSharedConfig::openConfig(QStringLiteral("kwinrc")));
    connect(m_watcher.data(), &KConfigWatcher::configChanged, this, [this](const KConfigGroup &group) {
        if (group.name() == QLatin1String("Script-kiri") || group.name() == QLatin1String("Plugins")) {
            loadHotCorner();
            NiriAnim::load();
        }
    });
    connect(effects, &EffectsHandler::mouseChanged, this, &OverviewEffect::pointerMoved);
    connect(effects, &EffectsHandler::screenAboutToLock, this, [this]() {
        if (isRunning()) {
            m_open = false;
            m_gesture = false;
            m_progress = 0;
            m_progressAnimating = false;
            m_closedZoom = false;
            run(false);
            effects->addRepaintFull();
            Q_EMIT progressChanged();
            Q_EMIT closingChanged();
        }
    });
}

// ---- hot corner --------------------------------------------------------------------------------------------
// niri's hot corner (src/input/mod.rs, Niri::is_inside_hot_corner): the 1x1 logical pixel at the top-left of an output
// toggles the overview the moment the pointer enters it, once per entry (it re-arms when the pointer has been outside).
// No button may be held (niri: a click grab keeps the pointer focus on the window, so the corner does not fire; a
// window drag does, which is why a held button is not checked once the overview is up: a drag-and-drop across
// desktops needs it) and a full-screen window on the output covers it (niri: render_above_top_layer). It is a pointer
// check, not KWin's screen edge, which has an activation delay and a pushback, and would clash with Plasma's own corner.
// The toggle goes through Kiri's "overview" shortcut so that the script supplies the layout, like Meta+O does.
// "#RRGGBB" or "#RRGGBBAA" (Kiri's settings) -> QColor; `fallback` when it does not parse
static QColor kiriColor(const QString &text, const QColor &fallback)
{
    static const QRegularExpression re(QStringLiteral("^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$"));
    const auto m = re.match(text.trimmed());
    if (!m.hasMatch()) {
        return fallback;
    }
    QColor c(QLatin1Char('#') + m.captured(1));
    if (!m.captured(2).isEmpty()) {
        c.setAlpha(m.captured(2).toInt(nullptr, 16));
    }
    return c;
}

void OverviewEffect::loadHotCorner()
{
    auto config = KSharedConfig::openConfig(QStringLiteral("kwinrc"));
    config->reparseConfiguration();
    const KConfigGroup kiri = config->group(QStringLiteral("Script-kiri"));
    m_hotCorner = config->group(QStringLiteral("Plugins")).readEntry("kiriEnabled", false) && kiri.readEntry("hotCorner", true);
    m_corners[0] = kiri.readEntry("hotCornerTopLeft", true);
    m_corners[1] = kiri.readEntry("hotCornerTopRight", false);
    m_corners[2] = kiri.readEntry("hotCornerBottomLeft", false);
    m_corners[3] = kiri.readEntry("hotCornerBottomRight", false);
    m_cornersOn = m_hotCorner;
    m_outputs.clear();
    const QJsonObject overrides = QJsonDocument::fromJson(kiri.readEntry("outputOverrides", QString()).toUtf8()).object();
    for (auto it = overrides.constBegin(); it != overrides.constEnd(); ++it) {
        const QJsonObject entry = it.value().toObject();
        OutputOptions options;
        options.id = it.key().toLower();
        options.backdrop = kiriColor(entry.value(QStringLiteral("backdropColor")).toString(), QColor());
        if (entry.contains(QStringLiteral("hotCorners"))) {
            const QJsonObject corners = entry.value(QStringLiteral("hotCorners")).toObject();
            options.hasCorners = true;
            options.cornersOn = corners.value(QStringLiteral("enabled")).toBool(true);
            options.corners[0] = corners.value(QStringLiteral("topLeft")).toBool(false);
            options.corners[1] = corners.value(QStringLiteral("topRight")).toBool(false);
            options.corners[2] = corners.value(QStringLiteral("bottomLeft")).toBool(false);
            options.corners[3] = corners.value(QStringLiteral("bottomRight")).toBool(false);
            if (options.cornersOn && config->group(QStringLiteral("Plugins")).readEntry("kiriEnabled", false)) {
                m_hotCorner = true; // an output may have corners that the global setting does not
            }
        }
        m_outputs.push_back(options);
    }
    if (!m_hotCorner) {
        m_insideCorner = false;
    }
    // niri's overview options; the zoom is applied from the next opening, not while it is up
    const qreal zoom = std::clamp(kiri.readEntry("overviewZoom", 0.5), 0.0, 1.0);
    m_backdrop = kiriColor(kiri.readEntry("overviewBackdropColor", QStringLiteral("#262626")), QColor(0x26, 0x26, 0x26));
    m_shadowOn = kiri.readEntry("overviewShadowEnabled", true);
    m_shadowSoftness = kiri.readEntry("overviewShadowSoftness", 40.0);
    m_shadowSpread = kiri.readEntry("overviewShadowSpread", 10.0);
    m_shadowOffsetX = kiri.readEntry("overviewShadowOffsetX", 0.0);
    m_shadowOffsetY = kiri.readEntry("overviewShadowOffsetY", 10.0);
    m_shadowColor = kiriColor(kiri.readEntry("overviewShadowColor", QStringLiteral("#00000050")), QColor(0, 0, 0, 0x50));
    m_dnd = {
        {QStringLiteral("viewWidth"), kiri.readEntry("dndEdgeViewScrollTriggerWidth", 30.0)},
        {QStringLiteral("viewDelay"), kiri.readEntry("dndEdgeViewScrollDelay", 100)},
        {QStringLiteral("viewSpeed"), kiri.readEntry("dndEdgeViewScrollMaxSpeed", 1500.0)},
        {QStringLiteral("wsHeight"), kiri.readEntry("dndEdgeWorkspaceSwitchTriggerHeight", 50.0)},
        {QStringLiteral("wsDelay"), kiri.readEntry("dndEdgeWorkspaceSwitchDelay", 100)},
        {QStringLiteral("wsSpeed"), kiri.readEntry("dndEdgeWorkspaceSwitchMaxSpeed", 1500.0)},
    };
    m_zoomConfig = zoom;
    if (!isRunning()) {
        m_zoom = zoom;
    }
    Q_EMIT optionsChanged();
}

// the first block of the `outputOverrides` setting that is for this output (niri: the first output block that matches)
const OverviewEffect::OutputOptions *OverviewEffect::optionsOf(const QString &outputName) const
{
    for (const OutputOptions &options : m_outputs) {
        if (options.id == outputName.toLower()) {
            return &options;
        }
    }
    return nullptr;
}

QColor OverviewEffect::backdropFor(const QString &outputName) const
{
    const OutputOptions *options = optionsOf(outputName);
    return options && options->backdrop.isValid() ? QColor(options->backdrop.red(), options->backdrop.green(), options->backdrop.blue()) : m_backdrop;
}

bool OverviewEffect::inHotCorner(const QPointF &pos) const
{
    for (LogicalOutput *output : effects->screens()) {
        const RectF g = output->geometry();
        // niri (Niri::is_inside_hot_corner): the 1x1 logical pixel at each enabled corner of the output
        const QPointF corners[4] = {g.topLeft(), QPointF(g.right() - 1, g.top()), QPointF(g.left(), g.bottom() - 1), QPointF(g.right() - 1, g.bottom() - 1)};
        // niri: an output's own hot-corners replace the global ones as a whole
        const OutputOptions *options = optionsOf(output->name());
        const bool *flags = options && options->hasCorners ? options->corners : m_corners;
        const bool on = options && options->hasCorners ? options->cornersOn : m_cornersOn;
        for (int i = 0; i < 4; i++) {
            if (!on || !flags[i] || pos.x() < corners[i].x() || pos.x() >= corners[i].x() + 1 || pos.y() < corners[i].y() || pos.y() >= corners[i].y() + 1) {
                continue;
            }
            if (!isRunning()) {
                for (EffectWindow *w : effects->stackingOrder()) {
                    if (w->isFullScreen() && w->isOnCurrentDesktop() && !w->isMinimized() && w->screen() == output && w->frameGeometry().contains(corners[i] + QPointF(0.5, 0.5))) {
                        return false;
                    }
                }
            }
            return true;
        }
    }
    return false;
}

void OverviewEffect::pointerMoved(const QPointF &pos, const QPointF &, Qt::MouseButtons buttons, Qt::MouseButtons, Qt::KeyboardModifiers, Qt::KeyboardModifiers)
{
    if (!m_hotCorner) {
        return;
    }
    const bool inside = inHotCorner(pos) && (buttons == Qt::NoButton || isRunning());
    const bool was = std::exchange(m_insideCorner, inside);
    if (!inside || was || effects->isScreenLocked()) {
        return;
    }
    invokeKiriAction(QStringLiteral("overview"));
}

// ---- DnD hold ----------------------------------------------------------------------------------------------
// niri (layout/mod.rs, advance_animations): while a drag-and-drop is on, the pointer held over a window for 750 ms
// (the delay is gnome-shell's) activates it; moving to another target restarts the time, there is no distance
// threshold. Only a real drag-and-drop counts, not a window being moved. In the overview the same hold (a window, or
// a desktop) is run by qml/Main.qml; here is the normal view.
void OverviewEffect::setSeatDrag(bool on)
{
    if (m_seatDrag == on) {
        return;
    }
    m_seatDrag = on;
    m_dndHoldTarget.clear();
    if (on) {
        m_dndHoldTimer.start();
    } else {
        m_dndHoldTimer.stop();
    }
    Q_EMIT seatDragChanged();
}

QPointF OverviewEffect::cursorPosition() const
{
    return effects->cursorPos();
}

void OverviewEffect::dndHoldTick()
{
    if (!m_seatDrag || isRunning() || effects->isScreenLocked()) {
        m_dndHoldTarget.clear();
        return;
    }
    // like niri, the hold is only checked when the pointer moves
    const QPointF pos = effects->cursorPos();
    if (pos == m_dndHoldPos) {
        return;
    }
    m_dndHoldPos = pos;
    EffectWindow *hit = nullptr;
    QString target;
    const auto windows = effects->stackingOrder();
    for (auto it = windows.crbegin(); it != windows.crend(); ++it) {
        EffectWindow *w = *it;
        if (w->isNormalWindow() && !w->isMinimized() && w->isOnCurrentDesktop() && w->isOnCurrentActivity()
            && w->frameGeometry().contains(pos)) {
            target = w->internalId().toString();
            hit = w;
            break;
        }
    }
    if (target.isEmpty()) {
        m_dndHoldTarget.clear();
        return;
    }
    if (target != m_dndHoldTarget) {
        m_dndHoldTarget = target;
        m_dndHoldSince = now();
        return;
    }
    if (now() - m_dndHoldSince >= 750) {
        m_dndHoldTarget.clear();
        // the script sees the activation like any other and scrolls the window into view
        qCDebug(KIRI_OVERVIEW) << "dnd hold activates" << hit->caption();
        effects->activateWindow(hit);
    }
}

void OverviewEffect::invokeKiriAction(const QString &action)
{
    QDBusMessage message = QDBusMessage::createMethodCall(QStringLiteral("org.kde.kglobalaccel"), QStringLiteral("/component/kiri"),
                                                          QStringLiteral("org.kde.kglobalaccel.Component"), QStringLiteral("invokeShortcut"));
    message << action;
    auto *watcher = new QDBusPendingCallWatcher(QDBusConnection::sessionBus().asyncCall(message), this);
    connect(watcher, &QDBusPendingCallWatcher::finished, watcher, [action](QDBusPendingCallWatcher *w) {
        if (w->isError()) {
            qCWarning(KIRI_OVERVIEW) << "invoking the Kiri shortcut" << action << "failed:" << w->error().message();
        }
        w->deleteLater();
    });
}

// KWin hides the windows of the other desktops: no frame callbacks, so a video or terminal there freezes. While the
// overview runs every window stays visible to KWin (it is not painted by KWin itself, the scene draws thumbnails of
// them), so the clients keep committing frames from the first frame the overview paints them (niri: live workspaces).
void OverviewEffect::run(bool on)
{
    setRunning(on);
    if (!on) {
        m_visibleRefs.clear();
        return;
    }
    for (EffectWindow *w : effects->stackingOrder()) {
        holdWindow(w);
    }
}

void OverviewEffect::holdWindow(EffectWindow *w)
{
    if (!m_visibleRefs.contains(w)) {
        m_visibleRefs.emplace(w, std::make_unique<EffectWindowVisibleRef>(w, EffectWindow::PAINT_DISABLED_BY_DESKTOP));
    }
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
    m_progressSpring = makeProgress(m_progress, to, velocity);
    m_progressStart = m_anim;
    m_progressAnimating = true;
    effects->addRepaintFull();
}

void OverviewEffect::startWorkspace(double to)
{
    m_wsTarget = to;
    m_wsSpring = makeWorkspace(m_wsIndex, to, 0);
    m_wsStart = m_anim;
    m_wsAnimating = true;
    effects->addRepaintFull();
}

// seconds on a spring that started at `start`; the global animation speed setting scales niri's times
// ("instant" jumps to the end)
double OverviewEffect::seconds(qint64 start) const
{
    const double factor = NiriAnim::timeFactor();
    const double speed = factor > 0 ? 1.0 / factor : 1e6;
    return (m_anim - start) / 1000.0 * speed;
}

void OverviewEffect::logFrames()
{
    if (m_frames > 0) {
        // one line per animation, so that a lag on the owner's machine can be read from the journal
        qCInfo(KIRI_OVERVIEW).nospace() << (m_warm ? "warm-up" : "animation") << ": first frame " << m_firstFrameMs << " ms, "
                                        << m_frames << " frames, average " << double(m_frameSum) / m_frames << " ms, max "
                                        << m_frameMax << " ms, " << m_frameSlow << " over 25 ms, slowest frame took " << m_costMax << " ms";
    }
    m_frames = 0;
    m_frameSum = 0;
    m_frameMax = 0;
    m_frameSlow = 0;
    m_costMax = 0;
    m_prePaint = 0;
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
            sc.spring = makeView(sc.shown, sc.target, 0);
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
    // closed, but the script has not yet moved to the desktop the user chose in the overview: the real screen would
    // show the old one when the scene goes (a jump); wait for it (setLayout moves the scene's desktop to the real one)
    if (m_closedZoom && !m_open && !m_gesture && m_pendingCurrent >= 0 && t < m_pendingUntil) {
        more = true;
    }
    if (m_closedZoom && !more && !m_open && !m_gesture && !m_warm) {
        // closed, and the desktops sit where they are on the real screen (the view offsets and the desktop spring have
        // arrived: handing back earlier would show them jumping): hand the screen back
        // Let KWin hide the windows of the other desktops first, a frame while the scene still covers the screen: when the
        // references go in the same frame that takes the scene away, that frame paints those windows at their own place,
        // on top of the current desktop (a window of desktop 2 flashing on empty desktop 1 after rapid Meta+O)
        if (!m_visibleRefs.empty()) {
            m_visibleRefs.clear();
            return true;
        }
        m_closedZoom = false;
        run(false);
        // the real windows come back on a screen the scene covered: repaint all of it now and once more after this
        // frame, so no region keeps what the overview left
        effects->addRepaintFull();
        m_repaintAfter = true;
        logFrames();
        return false;
    }
    return more;
}

// the invisible warm-up must not take the screen out of direct scan-out: switching the output to composition and back
// is what can blink a real display
bool OverviewEffect::blocksDirectScanout() const
{
    return m_warm && !m_open && !m_gesture ? false : QuickSceneEffect::blocksDirectScanout();
}

void OverviewEffect::prePaintScreen(ScreenPrePaintData &data)
{
    if (isRunning()) {
        // frame times while the overview moves, logged per animation (see logFrames); a hitch of up to 2 s counts
        const qint64 t = now();
        // Only frames the animation asked for count: while the overview sits open nothing is repainted, and the next
        // repaint (a key, the pointer) arrives whenever it arrives. That idle gap used to show up as "max" (166 to
        // 223 ms in the journal) although no frame was late.
        if (m_lastFrame > 0 && m_moving && t - m_lastFrame < 2000) {
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
        m_prePaint = t;
        if (m_lastFrame == 0 && m_openCall > 0) {
            m_firstFrameMs = t - m_openCall;
            m_openCall = 0;
        }
        m_lastFrame = t;
        m_moving = tick();
        static const bool trace = qEnvironmentVariableIsSet("KIRI_OVERVIEW_TRACE");
        if (trace) {
            qCInfo(KIRI_OVERVIEW).nospace() << "TRACE frame running=" << isRunning() << " open=" << m_open << " closedZoom=" << m_closedZoom << " progress=" << m_progress
                                            << " ws=" << m_wsIndex << "->" << m_wsTarget << " layoutCurrent=" << m_layoutCurrent << " pending=" << m_pendingCurrent;
        }
    } else {
        m_moving = false;
    }
    QuickSceneEffect::prePaintScreen(data);
}

// diagnostics (KIRI_OVERVIEW_TRACE=1): a window that is not on the current desktop is about to be painted by KWin itself
void OverviewEffect::prePaintWindow(RenderView *view, EffectWindow *w, WindowPrePaintData &data)
{
    static const bool trace = qEnvironmentVariableIsSet("KIRI_OVERVIEW_TRACE");
    if (trace && w->isNormalWindow() && !w->isOnCurrentDesktop()) {
        qCInfo(KIRI_OVERVIEW).nospace() << "TRACE other-desktop window painted: " << w->caption() << " running=" << isRunning() << " open=" << m_open
                                        << " closedZoom=" << m_closedZoom << " progress=" << m_progress << " ws=" << m_wsIndex << " refs=" << m_visibleRefs.size();
    }
    QuickSceneEffect::prePaintWindow(view, w, data);
}

// The next frame is asked for once this one is painted. Asked for in prePaintScreen, the repaint belongs to the
// frame being painted and is used up by it: KWin then draws the next frame only when something else on screen
// changes (an app that redraws all the time, like OBS's preview), and the animation stutters.
void OverviewEffect::postPaintScreen()
{
    if (isRunning() && m_prePaint > 0) {
        // what this frame cost the compositor (the QML scene is rendered inside it): a real stall, unlike the interval
        const qint64 cost = now() - m_prePaint;
        m_costMax = std::max(m_costMax, cost);
        m_prePaint = 0;
    }
    if ((m_moving && isRunning()) || m_repaintAfter) {
        m_repaintAfter = false;
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

    const bool idle = !isRunning() || (m_warm && !m_open && !m_gesture);
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
        } else if (idle) {
            // nothing of the overview is on screen: the windows are where the script put them, so the first frame
            // must show the strip there too (the offset of the last run is stale once the script scrolled meanwhile)
            it->target = it->shown = scroll;
            it->animating = false;
            it->localUntil = 0;
            m_viewOffsets.insert(id, scroll);
        } else if (std::abs(scroll - it->target) > 0.5) {
            it->target = scroll;
            if (t >= it->localUntil) {
                it->spring = makeView(it->shown, scroll, 0);
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
    if (m_zoom != m_zoomConfig) {
        m_zoom = m_zoomConfig; // the warm-up scene may have been built with an older value; the bindings follow
        Q_EMIT optionsChanged();
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
    m_events.clear(); // answers to an earlier run (a key pressed in its last frames) must not act on this one
    m_pendingCurrent = -1;
    run(true);
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
//
// This blanks the screen: while the scene is up the windows are not painted by KWin and the (invisible, opacity 0.003)
// scene draws nothing at progress 0, so the whole output is black for the length of the warm-up plus the stall of
// building the scene (0.4 to 1.5 s measured in the test session, longer on a slower GPU). The script asks 15 s after
// every load of the effect, so it showed as a random black screen. It is off unless KIRI_OVERVIEW_WARM is set.
QString OverviewEffect::warm(const QString &layout)
{
    if (!qEnvironmentVariableIsSet("KIRI_OVERVIEW_WARM")) {
        return QStringLiteral("disabled");
    }
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
            logFrames(); // while m_warm is still set: the line says "warm-up", not "animation"
            m_warm = false;
            m_progressAnimating = false;
            run(false);
            effects->addRepaintFull();
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
    QString out = QStringLiteral("{\"open\":%1,\"run\":%3,\"p\":%2,\"events\":[")
                      .arg(isRunning() && m_open ? QStringLiteral("true") : QStringLiteral("false"))
                      .arg(m_progress, 0, 'f', 4)
                      .arg(isRunning() ? QStringLiteral("true") : QStringLiteral("false"));
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

// Up/Down/wheel: one desktop from where the view is heading, so fast presses move on instead of repeating the target
void OverviewEffect::stepDesktop(int direction)
{
    goToDesktop(int(std::lround(m_wsTarget)) + direction);
}

void OverviewEffect::dropWindow(const QString &windowId, const QString &desktopId, int column, int tile)
{
    m_noCloseUntil = now() + 700;
    queue(jsonString({{"t", "drop"}, {"w", windowId}, {"d", desktopId}, {"c", column}, {"i", tile}}));
}

// a floating window let go in the overview: it stays floating, on the desktop under the pointer, at x/y (screen space)
void OverviewEffect::dropFloating(const QString &windowId, const QString &desktopId, qreal x, qreal y)
{
    m_noCloseUntil = now() + 700;
    queue(jsonString({{"t", "dropf"}, {"w", windowId}, {"d", desktopId}, {"x", x}, {"y", y}}));
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

void OverviewEffect::focusColumn(const QString &desktopId, int direction)
{
    queue(jsonString({{"t", "focuscol"}, {"d", desktopId}, {"dir", direction}}));
}

// niri's overview_scroll_swipe_gesture + workspace_switch_gesture_* / view_offset_gesture_* for a touchpad: the first
// event of a scroll decides the direction (vertical when dy != 0); a vertical scroll drags the desktops (rubber band
// past the ends, momentum on release), a horizontal one scrolls the view of the desktop under the pointer. A scroll
// ends when the fingers lift, which Qt reports as a pause in the events.
void OverviewEffect::touchpadScroll(qreal right, qreal down, const QString &desktopId)
{
    if (!m_open || m_desktopCount < 1) {
        return;
    }
    if (!m_swipeOn) {
        m_swipeOn = true;
        m_swipeVertical = down != 0;
        m_swipeTracker = NiriSwipe::SwipeTracker();
        m_swipeStart = m_wsIndex;
        m_swipeDesktop = desktopId;
        m_wsAnimating = false;
        m_wsTarget = m_wsIndex;
        m_swipeEnd.setSingleShot(true);
        m_swipeEnd.setInterval(120);
        disconnect(&m_swipeEnd, nullptr, this, nullptr);
        connect(&m_swipeEnd, &QTimer::timeout, this, &OverviewEffect::endTouchpadScroll);
    }
    m_swipeEnd.start();
    if (m_swipeVertical) {
        // monitor.rs workspace_switch_gesture_update: the zoom reduces the effect somewhat
        const double zoom = m_zoom;
        const double scale = (zoom - 1.0) / 2.5 + 1.0;
        m_swipeTracker.push(down / scale, now());
        NiriSwipe::RubberBand band = NiriSwipe::WorkspaceGesture::Band;
        band.limit /= zoom;
        m_wsIndex = band.clamp(0, std::max(0, m_desktopCount - 1), m_swipeStart + m_swipeTracker.pos() / NiriSwipe::WorkspaceGesture::Movement);
        m_wsTarget = m_wsIndex;
        Q_EMIT wsIndexChanged();
        effects->addRepaintFull();
    } else {
        scrollView(m_swipeDesktop, right);
    }
}

void OverviewEffect::endTouchpadScroll()
{
    if (!m_swipeOn) {
        return;
    }
    m_swipeOn = false;
    if (!m_swipeVertical) {
        return;
    }
    // monitor.rs workspace_switch_gesture_end
    m_swipeTracker.push(0.0, now());
    const double zoom = m_zoom;
    NiriSwipe::RubberBand band = NiriSwipe::WorkspaceGesture::Band;
    band.limit /= zoom;
    const double movement = NiriSwipe::WorkspaceGesture::Movement;
    const double hi = std::max(0, m_desktopCount - 1);
    double velocity = m_swipeTracker.velocity() / movement;
    const double currentPos = m_swipeTracker.pos() / movement;
    const double end = std::clamp(m_swipeStart + m_swipeTracker.projectedEndPos() / movement, 0.0, hi);
    velocity *= band.clampDerivative(0, hi, m_swipeStart + currentPos);
    const int target = int(std::lround(end));
    m_wsTarget = target;
    m_wsSpring = makeWorkspace(m_wsIndex, target, velocity);
    m_wsStart = m_anim;
    m_wsAnimating = true;
    queue(jsonString({{"t", "goto"}, {"i", target}}));
    m_pendingCurrent = target;
    m_pendingUntil = now() + 600;
    effects->addRepaintFull();
}

// niri dnd_scroll_gesture_scroll of the monitor: the desktops follow the drag at the top/bottom edge; the gesture
// ends (snaps to the nearest desktop, animated) with dndEdgeEnd
void OverviewEffect::dndEdgeWorkspace(qreal delta)
{
    if (m_desktopCount < 1) {
        return;
    }
    m_wsAnimating = false;
    m_wsIndex = std::clamp(m_wsIndex + delta, 0.0, double(m_desktopCount - 1));
    m_wsTarget = m_wsIndex;
    m_dndWs = true;
    Q_EMIT wsIndexChanged();
    effects->addRepaintFull();
}

void OverviewEffect::dndEdgeEnd()
{
    if (!m_dndWs) {
        return;
    }
    m_dndWs = false;
    const int target = int(std::lround(m_wsIndex));
    startWorkspace(target);
    queue(jsonString({{"t", "goto"}, {"i", target}}));
    m_pendingCurrent = target;
    m_pendingUntil = now() + 600;
}

} // namespace KWin
