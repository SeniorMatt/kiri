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
// niri's animations: overview-open-close, workspace-switch and horizontal-view-movement, by default springs
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
    // keep the views alive after the overview closes, so opening it again right away reuses them
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
    if (waylandServer() && waylandServer()->seat()) {
        auto *seat = waylandServer()->seat();
        connect(seat, &SeatInterface::dragStarted, this, [this]() { setSeatDrag(true); });
        connect(seat, &SeatInterface::dragEnded, this, [this]() { setSeatDrag(false); });
        m_dndHoldTimer.setInterval(50);
        connect(&m_dndHoldTimer, &QTimer::timeout, this, &OverviewEffect::dndHoldTick);
    }
    m_accent = PlasmaAccent::load();
    loadHotCorner();
    NiriAnim::load();
    // the Plasma accent can change at any time
    m_colorWatcher = KConfigWatcher::create(KSharedConfig::openConfig(QStringLiteral("kdeglobals")));
    connect(m_colorWatcher.data(), &KConfigWatcher::configChanged, this, [this](const KConfigGroup &group) {
        if (PlasmaAccent::isAccentGroup(group.name())) {
            const QColor old = m_accent;
            m_accent = PlasmaAccent::load();
            if (m_accent != old) {
                loadHotCorner();
            }
        }
    });
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

// niri's hot corner: the 1x1 pixel at the top-left of an output toggles the overview once per entry; no button may be held, a full-screen window covers it; a pointer check, not KWin's screen edge; the toggle goes through Kiri's "overview" shortcut
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
                m_hotCorner = true;
            }
        }
        m_outputs.push_back(options);
    }
    if (!m_hotCorner) {
        m_insideCorner = false;
    }
    const qreal zoom = std::clamp(kiri.readEntry("overviewZoom", 0.5), 0.0, 1.0);
    m_backdrop = kiriColor(kiri.readEntry("overviewBackdropColor", QStringLiteral("#262626")), QColor(0x26, 0x26, 0x26));
    m_backdropBlur = kiri.readEntry("overviewBackdropBlur", false);
    m_backdropBlurRadius = std::clamp(kiri.readEntry("overviewBackdropBlurRadius", 48), 0, 64);
    m_shadowOn = kiri.readEntry("overviewShadowEnabled", true);
    m_shadowSoftness = kiri.readEntry("overviewShadowSoftness", 40.0);
    m_shadowSpread = kiri.readEntry("overviewShadowSpread", 10.0);
    m_shadowOffsetX = kiri.readEntry("overviewShadowOffsetX", 0.0);
    m_shadowOffsetY = kiri.readEntry("overviewShadowOffsetY", 10.0);
    m_shadowColor = kiriColor(kiri.readEntry("overviewShadowColor", QStringLiteral("#00000050")), QColor(0, 0, 0, 0x50));
    // niri's overview shows the layout zoomed, so the ring is the normal one, scaled; off when the focus ring is off.
    // A gradient has no single colour here: its first colour stands in for it
    // the script's look (setStyle) wins over kwinrc, which is only the first guess: the settings page saves without telling KWin's watchers
    const auto style = [&](const char *key, const QVariant &fallback) {
        return m_styleSet && m_style.contains(QLatin1String(key)) ? m_style.value(QLatin1String(key)).toVariant() : kiri.readEntry(key, fallback);
    };
    m_ringOn = style("focusRingEnabled", true).toBool();
    m_ringWidth = style("focusRingWidth", 4).toInt();
    m_ringColor = kiriColor(style("focusRingActiveColor", QStringLiteral("#7fc8ff")).toString(), QColor(0x7f, 0xc8, 0xff));
    if (style("focusRingUseAccent", false).toBool() && m_accent.isValid()) {
        m_ringColor = m_accent;
    }
    static const QRegularExpression fromColor(QStringLiteral("from=(#[0-9a-fA-F]{6,8})"));
    if (const auto g = fromColor.match(style("focusRingActiveGradient", QString()).toString()); g.hasMatch()) {
        m_ringColor = kiriColor(g.captured(1), m_ringColor);
    }
    m_hintColor = kiriColor(style("insertHintColor", QStringLiteral("#7fc8ff80")).toString(), QColor(127, 200, 255, 128));
    // the accent gives the colour, the configured colour keeps its transparency; a gradient still wins
    if (style("insertHintUseAccent", false).toBool() && m_accent.isValid() && style("insertHintGradient", QString()).toString().isEmpty()) {
        const int alpha = m_hintColor.alpha();
        m_hintColor = m_accent;
        m_hintColor.setAlpha(alpha);
    }
    qCInfo(KIRI_OVERVIEW) << "overview ring" << m_ringOn << m_ringWidth << m_ringColor.name();
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
        const QPointF corners[4] = {g.topLeft(), QPointF(g.right() - 1, g.top()), QPointF(g.left(), g.bottom() - 1), QPointF(g.right() - 1, g.bottom() - 1)};
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

// niri's DnD hold: the pointer held over a window for 750 ms during a drag-and-drop activates it; in the overview qml/Main.qml does the same
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

// KWin hides the windows of other desktops, which freezes their clients: while the overview runs every window stays visible to KWin
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


// the speed of the zoom now, so that a toggle during the animation turns it around smoothly
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

void OverviewEffect::startWorkspace(Ws &ws, double to)
{
    ws.target = to;
    ws.spring = makeWorkspace(ws.index, to, 0);
    ws.start = m_anim;
    ws.animating = true;
    effects->addRepaintFull();
}

qreal OverviewEffect::wsIndexOf(const QString &outputName) const
{
    const auto it = m_ws.constFind(outputName);
    return it == m_ws.constEnd() ? 0.0 : it->index;
}

// the name of the output whose geometry starts at (x, y), which is how a layout names its screen
QString OverviewEffect::outputNameAt(double x, double y) const
{
    for (LogicalOutput *output : effects->screens()) {
        const auto g = output->geometry();
        if (std::lround(g.x()) == std::lround(x) && std::lround(g.y()) == std::lround(y)) {
            return output->name();
        }
    }
    return QString();
}

void OverviewEffect::resetLayoutCurrent()
{
    for (Ws &ws : m_ws) {
        ws.layoutCurrent = -1;
    }
}

// a desktop switch asked for by the user has not yet shown up in the layout
bool OverviewEffect::pendingSwitch(qint64 t) const
{
    return std::any_of(m_ws.cbegin(), m_ws.cend(), [t](const Ws &ws) {
        return ws.pendingCurrent >= 0 && t < ws.pendingUntil;
    });
}

// seconds on a spring that started at `start`, scaled by the global animation speed
double OverviewEffect::seconds(qint64 start) const
{
    const double factor = NiriAnim::timeFactor();
    const double speed = factor > 0 ? 1.0 / factor : 1e6;
    return (m_anim - start) / 1000.0 * speed;
}

void OverviewEffect::logFrames()
{
    if (m_frames > 0) {
        // one line per animation, so that lag can be read from the journal
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

    bool wsMoved = false;
    for (Ws &ws : m_ws) {
        if (!ws.animating) {
            continue;
        }
        const double s = seconds(ws.start);
        if (ws.spring.isDone(s)) {
            ws.animating = false;
            ws.index = ws.spring.to();
        } else {
            ws.index = ws.spring.value(s);
            more = true;
        }
        wsMoved = true;
    }
    if (wsMoved) {
        m_wsTick++;
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
    // closed, but the script has not yet moved to the chosen desktop: wait for it, or the real screen would jump
    if (m_closedZoom && !m_open && !m_gesture && pendingSwitch(t)) {
        more = true;
    }
    if (m_closedZoom && !more && !m_open && !m_gesture && !m_warm) {
        // closed and the desktops sit where they are on the real screen: hand the screen back, after KWin hid the windows of the other desktops for a frame
        if (!m_visibleRefs.empty()) {
            m_visibleRefs.clear();
            return true;
        }
        m_closedZoom = false;
        run(false);
        // repaint all of the screen now and once more after this frame
        effects->addRepaintFull();
        m_repaintAfter = true;
        logFrames();
        return false;
    }
    return more;
}

// the invisible warm-up must not take the screen out of direct scan-out
bool OverviewEffect::blocksDirectScanout() const
{
    return m_warm && !m_open && !m_gesture ? false : QuickSceneEffect::blocksDirectScanout();
}

void OverviewEffect::prePaintScreen(ScreenPrePaintData &data)
{
    if (isRunning()) {
        const qint64 t = now();
        // only frames the animation asked for count; an idle gap while the overview is open is not a late frame
        if (m_lastFrame > 0 && m_moving && t - m_lastFrame < 2000) {
            m_frames++;
            m_frameSum += t - m_lastFrame;
            m_frameMax = std::max<qint64>(m_frameMax, t - m_lastFrame);
            if (t - m_lastFrame > 25) {
                m_frameSlow++;
            }
        }
        // the springs run on their own clock of at most 100 ms per frame, so a hitch does not make the zoom skip ahead
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
                                            << " ws=" << m_wsTick << " pending=" << pendingSwitch(t);
        }
    } else {
        m_moving = false;
    }
    QuickSceneEffect::prePaintScreen(data);
}

void OverviewEffect::prePaintWindow(RenderView *view, EffectWindow *w, WindowPrePaintData &data)
{
    static const bool trace = qEnvironmentVariableIsSet("KIRI_OVERVIEW_TRACE");
    if (trace && w->isNormalWindow() && !w->isOnCurrentDesktop()) {
        qCInfo(KIRI_OVERVIEW).nospace() << "TRACE other-desktop window painted: " << w->caption() << " running=" << isRunning() << " open=" << m_open
                                        << " closedZoom=" << m_closedZoom << " progress=" << m_progress << " ws=" << m_wsTick << " refs=" << m_visibleRefs.size();
    }
    QuickSceneEffect::prePaintWindow(view, w, data);
}

// the next frame is asked for once this one is painted, or KWin draws it only when something else changes
void OverviewEffect::postPaintScreen()
{
    if (isRunning() && m_prePaint > 0) {
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


void OverviewEffect::applyLayout(const QString &layout)
{
    const QJsonDocument doc = QJsonDocument::fromJson(layout.toUtf8());
    if (!doc.isObject()) {
        qCWarning(KIRI_OVERVIEW) << "bad layout json";
        return;
    }
    const QJsonObject obj = doc.object();
    const qint64 t = now();
    // one layout, or one per screen when the desktops are per screen
    QJsonArray screens = obj.value(QStringLiteral("screens")).toArray();
    if (screens.isEmpty()) {
        screens.append(obj);
    }

    const bool idle = !isRunning() || (m_warm && !m_open && !m_gesture);
    QStringList seen;
    for (const QJsonValue &sv : std::as_const(screens)) {
        const QJsonObject lay = sv.toObject();
        const QJsonObject rect = lay.value(QStringLiteral("screen")).toObject();
        const QString output = outputNameAt(rect.value(QStringLiteral("x")).toDouble(), rect.value(QStringLiteral("y")).toDouble());
        const int current = lay.value(QStringLiteral("current")).toInt(0);
        const QJsonArray desktops = lay.value(QStringLiteral("desktops")).toArray();
        Ws &ws = m_ws[output];
        ws.count = desktops.size();

        for (const QJsonValue &v : desktops) {
            const QJsonObject d = v.toObject();
            const QString id = output + QLatin1Char('/') + d.value(QStringLiteral("id")).toString();
            const double scroll = d.value(QStringLiteral("scroll")).toDouble();
            seen << id;
            auto it = m_scrolls.find(id);
            if (it == m_scrolls.end()) {
                Scroll sc;
                sc.shown = sc.target = scroll;
                it = m_scrolls.insert(id, sc);
                m_viewOffsets.insert(id, scroll);
            } else if (idle) {
                // nothing of the overview is on screen: the first frame must show the strip where the script put it
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

        const bool first = ws.layoutCurrent < 0;
        if (ws.pendingCurrent >= 0 && t < ws.pendingUntil) {
            if (current == ws.pendingCurrent) {
                ws.pendingCurrent = -1;
            }
        } else if (first || current != ws.layoutCurrent) {
            ws.pendingCurrent = -1;
            if (first && !isRunning()) {
                ws.index = ws.target = current;
                ws.animating = false;
                m_wsTick++;
                Q_EMIT wsIndexChanged();
            } else {
                startWorkspace(ws, current);
            }
        }
        ws.layoutCurrent = current;
    }
    for (auto it = m_scrolls.begin(); it != m_scrolls.end();) {
        if (!seen.contains(it.key())) {
            m_viewOffsets.remove(it.key());
            it = m_scrolls.erase(it);
        } else {
            ++it;
        }
    }

    m_layout = layout;
    Q_EMIT layoutChanged();
    Q_EMIT viewOffsetsChanged();
    effects->addRepaintFull();
}


// starts the scene; another full-screen effect (the desktop switch) is taken over, like niri cuts it short
bool OverviewEffect::acquire()
{
    if (isRunning()) {
        return true;
    }
    if (m_zoom != m_zoomConfig) {
        m_zoom = m_zoomConfig;
        Q_EMIT optionsChanged();
    }
    // the zoom starts from where the animating effects' pictures are now, so nothing jumps
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
    m_events.clear();
    for (Ws &ws : m_ws) {
        ws.pendingCurrent = -1;
    }
    run(true);
    if (!isRunning()) {
        return false;
    }
    // each output starts from where its own desktops were; without a per-output position, all from the one there is
    const QVariantMap visuals = effects->property("kiriSwitchVisuals").toMap();
    effects->setProperty("kiriSwitchVisuals", QVariant());
    if (visual.isValid() || !visuals.isEmpty()) {
        for (auto it = m_ws.begin(); it != m_ws.end(); ++it) {
            const auto v = visuals.constFind(it.key());
            if (v != visuals.constEnd()) {
                it->index = v->toDouble();
            } else if (visual.isValid() && visuals.isEmpty()) {
                it->index = visual.toDouble();
            } else {
                continue;
            }
            startWorkspace(*it, it->target);
        }
        m_wsTick++;
        Q_EMIT wsIndexChanged();
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

// builds the scene once, invisibly, shortly after login; it blanks the screen for the length of the warm-up, so it is off unless KIRI_OVERVIEW_WARM is set
QString OverviewEffect::warm(const QString &layout)
{
    if (!qEnvironmentVariableIsSet("KIRI_OVERVIEW_WARM")) {
        return QStringLiteral("disabled");
    }
    if (isRunning() || effects->isScreenLocked() || effects->hasActiveFullScreenEffect()) {
        return QStringLiteral("busy");
    }
    resetLayoutCurrent();
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
            logFrames();
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
        resetLayoutCurrent();
    }
    applyLayout(layout);
    // not running counts as closed whatever m_open says
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
            resetLayoutCurrent();
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


void OverviewEffect::activateWindow(const QString &windowId, const QString &desktopId, int desktopIndex, const QString &output)
{
    if (now() < m_noCloseUntil) {
        return;
    }
    queue(jsonString({{"t", "activate"}, {"w", windowId}, {"d", desktopId}, {"o", output}}));
    Ws &ws = m_ws[output];
    ws.pendingCurrent = desktopIndex;
    ws.pendingUntil = now() + 600;
    if (std::abs(ws.target - desktopIndex) > 1e-6) {
        startWorkspace(ws, desktopIndex);
    }
    close();
}

void OverviewEffect::activateDesktop(int desktopIndex, const QString &output)
{
    if (now() < m_noCloseUntil) {
        return;
    }
    queue(jsonString({{"t", "goto"}, {"i", desktopIndex}, {"o", output}}));
    Ws &ws = m_ws[output];
    ws.pendingCurrent = desktopIndex;
    ws.pendingUntil = now() + 600;
    if (std::abs(ws.target - desktopIndex) > 1e-6) {
        startWorkspace(ws, desktopIndex);
    }
    close();
}

void OverviewEffect::goToDesktop(int index, const QString &output)
{
    Ws &ws = m_ws[output];
    index = std::clamp(index, 0, std::max(0, ws.count - 1));
    if (index == ws.pendingCurrent || (ws.pendingCurrent < 0 && index == ws.layoutCurrent)) {
        return;
    }
    queue(jsonString({{"t", "goto"}, {"i", index}, {"o", output}}));
    ws.pendingCurrent = index;
    ws.pendingUntil = now() + 600;
    startWorkspace(ws, index);
}

void OverviewEffect::stepDesktop(int direction, const QString &output)
{
    goToDesktop(int(std::lround(m_ws[output].target)) + direction, output);
}

// a tiled window is held in the overview: the script takes it out of its column so the others re-lay out
void OverviewEffect::dragStarted(const QString &windowId, const QString &output)
{
    queue(jsonString({{"t", "dragstart"}, {"w", windowId}, {"o", output}}));
}

void OverviewEffect::dragCancelled(const QString &windowId, const QString &output)
{
    queue(jsonString({{"t", "dragend"}, {"w", windowId}, {"o", output}}));
}

void OverviewEffect::dropWindow(const QString &windowId, const QString &desktopId, int column, int tile, const QString &output)
{
    m_noCloseUntil = now() + 700;
    queue(jsonString({{"t", "drop"}, {"w", windowId}, {"d", desktopId}, {"c", column}, {"i", tile}, {"o", output}}));
}

void OverviewEffect::dropFloating(const QString &windowId, const QString &desktopId, qreal x, qreal y, const QString &output)
{
    m_noCloseUntil = now() + 700;
    queue(jsonString({{"t", "dropf"}, {"w", windowId}, {"d", desktopId}, {"x", x}, {"y", y}, {"o", output}}));
}

void OverviewEffect::scrollView(const QString &desktopId, qreal delta, const QString &output)
{
    const QString key = output + QLatin1Char('/') + desktopId;
    auto it = m_scrolls.find(key);
    if (it == m_scrolls.end()) {
        return;
    }
    it->target += delta;
    it->shown = it->target;
    it->animating = false;
    it->localUntil = now() + 400;
    m_viewOffsets.insert(key, it->shown);
    queue(jsonString({{"t", "scroll"}, {"d", desktopId}, {"x", it->target}, {"o", output}}));
    Q_EMIT viewOffsetsChanged();
    effects->addRepaintFull();
}

QString OverviewEffect::setStyle(const QString &json)
{
    const QJsonDocument doc = QJsonDocument::fromJson(json.toUtf8());
    if (doc.isObject()) {
        m_style = doc.object();
        m_styleSet = true;
        loadHotCorner();
    }
    return QString();
}

void OverviewEffect::requestClose()
{
    if (now() < m_noCloseUntil) {
        return;
    }
    close();
}

void OverviewEffect::focusColumn(const QString &desktopId, int direction, const QString &output)
{
    queue(jsonString({{"t", "focuscol"}, {"d", desktopId}, {"dir", direction}, {"o", output}}));
}

// niri's overview_scroll_swipe_gesture for a touchpad: a vertical scroll drags the desktops, a horizontal one scrolls the view; a scroll ends after a pause in the events
void OverviewEffect::touchpadScroll(qreal right, qreal down, const QString &desktopId, const QString &output)
{
    Ws &ws = m_ws[output];
    if (!m_open || ws.count < 1) {
        return;
    }
    if (m_swipeOn && m_swipeOutput != output) {
        // fingers moved to another screen: the scroll on the first one is over
        endTouchpadScroll();
    }
    if (!m_swipeOn) {
        m_swipeOn = true;
        m_swipeVertical = down != 0;
        m_swipeTracker = NiriSwipe::SwipeTracker();
        m_swipeStart = ws.index;
        m_swipeDesktop = desktopId;
        m_swipeOutput = output;
        ws.animating = false;
        ws.target = ws.index;
        m_swipeEnd.setSingleShot(true);
        m_swipeEnd.setInterval(120);
        disconnect(&m_swipeEnd, nullptr, this, nullptr);
        connect(&m_swipeEnd, &QTimer::timeout, this, &OverviewEffect::endTouchpadScroll);
    }
    m_swipeEnd.start();
    if (m_swipeVertical) {
        // like niri's workspace_switch_gesture_update: the zoom reduces the effect somewhat
        const double zoom = m_zoom;
        const double scale = (zoom - 1.0) / 2.5 + 1.0;
        m_swipeTracker.push(down / scale, now());
        NiriSwipe::RubberBand band = NiriSwipe::WorkspaceGesture::Band;
        band.limit /= zoom;
        ws.index = band.clamp(0, std::max(0, ws.count - 1), m_swipeStart + m_swipeTracker.pos() / NiriSwipe::WorkspaceGesture::Movement);
        ws.target = ws.index;
        m_wsTick++;
        Q_EMIT wsIndexChanged();
        effects->addRepaintFull();
    } else {
        scrollView(m_swipeDesktop, right, output);
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
    Ws &ws = m_ws[m_swipeOutput];
    // like niri's workspace_switch_gesture_end
    m_swipeTracker.push(0.0, now());
    const double zoom = m_zoom;
    NiriSwipe::RubberBand band = NiriSwipe::WorkspaceGesture::Band;
    band.limit /= zoom;
    const double movement = NiriSwipe::WorkspaceGesture::Movement;
    const double hi = std::max(0, ws.count - 1);
    double velocity = m_swipeTracker.velocity() / movement;
    const double currentPos = m_swipeTracker.pos() / movement;
    const double end = std::clamp(m_swipeStart + m_swipeTracker.projectedEndPos() / movement, 0.0, hi);
    velocity *= band.clampDerivative(0, hi, m_swipeStart + currentPos);
    const int target = int(std::lround(end));
    ws.target = target;
    ws.spring = makeWorkspace(ws.index, target, velocity);
    ws.start = m_anim;
    ws.animating = true;
    queue(jsonString({{"t", "goto"}, {"i", target}, {"o", m_swipeOutput}}));
    ws.pendingCurrent = target;
    ws.pendingUntil = now() + 600;
    effects->addRepaintFull();
}

// like niri's dnd_scroll_gesture_scroll: the desktops follow the drag at the top/bottom edge
void OverviewEffect::dndEdgeWorkspace(qreal delta, const QString &output)
{
    Ws &ws = m_ws[output];
    if (ws.count < 1) {
        return;
    }
    ws.animating = false;
    ws.index = std::clamp(ws.index + delta, 0.0, double(ws.count - 1));
    ws.target = ws.index;
    m_dndWs = true;
    m_dndOutput = output;
    m_wsTick++;
    Q_EMIT wsIndexChanged();
    effects->addRepaintFull();
}

void OverviewEffect::dndEdgeEnd(const QString &)
{
    if (!m_dndWs) {
        return;
    }
    m_dndWs = false;
    Ws &ws = m_ws[m_dndOutput];
    const int target = int(std::lround(ws.index));
    startWorkspace(ws, target);
    queue(jsonString({{"t", "goto"}, {"i", target}, {"o", m_dndOutput}}));
    ws.pendingCurrent = target;
    ws.pendingUntil = now() + 600;
}

} // namespace KWin
