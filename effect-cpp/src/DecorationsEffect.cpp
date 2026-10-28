/*
    Kiri decorations: rounded window corners, focus ring and borders painted with the window.
    See DecorationsEffect.h for credits. License: GPL-3.0-or-later.
*/

#include "DecorationsEffect.h"

#include <core/output.h>
#include <input.h>
#include <virtualdesktops.h>
#include <core/pixelgrid.h>
#include <core/renderviewport.h>
#include <effect/effecthandler.h>
#include <effect/effectwindow.h>
#include <opengl/glshader.h>
#include <opengl/glshadermanager.h>
#include <opengl/glutils.h>

#include <KConfigGroup>
#include <KSharedConfig>

#include <QDateTime>
#include <QDBusConnection>
#include <QDBusMessage>
#include <QDBusPendingCall>
#include <QDBusPendingCallWatcher>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QLoggingCategory>
#include <QStandardPaths>
#include <QVector2D>

#include <epoxy/gl.h>

Q_LOGGING_CATEGORY(KIRI_DECO, "kiri.decorations", QtWarningMsg)
Q_LOGGING_CATEGORY(KIRI_PAINT, "kiri.decorations.paint", QtWarningMsg) // per-frame painted geometry, for measuring

namespace KiriDecorations
{

namespace
{
constexpr int CaptureRole = 0x4B495249; // set by kiri_motion while it snapshots a window
// set here on a parked window (see setParkedPositions): the QPointF from its real top-left corner to where it is painted
constexpr int ParkedOffsetRole = 0x4B495250;
QString shaderPath(const QString &name)
{
    return QStandardPaths::locate(QStandardPaths::GenericDataLocation, QStringLiteral("kwin/shaders/") + name);
}

QColor readColor(const KConfigGroup &group, const char *key, const QColor &fallback)
{
    const QColor color(group.readEntry(key, QString()));
    return color.isValid() ? color : fallback;
}
} // namespace

double Effect::clock() const
{
    return std::chrono::duration<double>(std::chrono::steady_clock::now() - m_clockStart).count();
}

// niri's expanded_progress: a spring (window-resize parameters) from 0 to 1 when the window becomes full screen or
// reaches the screen edges, from 1 to 0 when it stops being so
double Effect::expandedProgress(KWin::EffectWindow *w) const
{
    bool expanded = w->isFullScreen();
    if (!expanded) {
        if (const auto *output = w->screen()) {
            const KWin::RectF screen = output->geometry();
            const KWin::RectF frame = w->frameGeometry();
            expanded = frame.width() >= screen.width() - 0.5 && frame.height() >= screen.height() - 0.5;
            if (!expanded && w->isNormalWindow()) {
                // maximized next to a panel: the frame fills the work area, not the screen
                const auto area = KWin::effects->clientArea(KWin::MaximizeArea, w);
                expanded = area.width() > 0 && frame.width() >= area.width() - 0.5 && frame.height() >= area.height() - 0.5
                    && frame.left() <= area.left() + 0.5 && frame.top() <= area.top() + 0.5;
            }
        }
    }
    ExpandedState &s = m_expanded[w];
    const double t = m_frameTime;
    const double target = expanded ? 1.0 : 0.0;
    const double factor = KWin::effects->animationTimeFactor();
    const double speed = factor > 0 ? 1.0 / factor : 0;
    auto value = [&]() {
        if (speed <= 0) {
            return s.to;
        }
        return s.from + (s.to - s.from) * NiriAnim::resizeSpring().value((t - s.start) * speed);
    };
    if (!s.known) {
        s = ExpandedState{target, target, t, true};
    } else if (s.to != target) {
        s = ExpandedState{value(), target, t, true};
    }
    return value();
}

// niri's tab indicator open animation: the tabs grow from nothing, with window-movement's spring when a column
// becomes tabbed, with window-open's 150 ms ease-out-expo when its first window appears as a tab
double Effect::tabProgress(const TabGroup &group) const
{
    const auto it = m_tabOpen.constFind(group.windows.first());
    if (it == m_tabOpen.constEnd()) {
        return 1.0;
    }
    const double factor = KWin::effects->animationTimeFactor();
    const double speed = factor > 0 ? 1.0 / factor : 0;
    const double t = (m_frameTime - it->first) * speed;
    if (speed <= 0) {
        return 1.0;
    }
    if (it->second) {
        return std::max(0.0, NiriAnim::easeOutExpo(std::clamp(t / (NiriAnim::Defaults::openMs / 1000), 0.0, 1.0)));
    }
    static const NiriAnim::Spring spring(0, 1, 0, NiriAnim::Defaults::moveDamping, NiriAnim::Defaults::moveStiffness, NiriAnim::Defaults::moveEpsilon);
    return std::max(0.0, spring.value(t));
}

void Effect::prePaintScreen(KWin::ScreenPrePaintData &data)
{
    m_frameTime = clock();
    KWin::OffscreenEffect::prePaintScreen(data);
}

// The first draw with a shader makes the driver finish compiling it for the render target in use, which costs
// 10-30 ms in the middle of the first window's paint. Done once, a few seconds after load (the first frames at login are
// not touched), into a 64x64 texture that is thrown away. The GL context is current in postPaintScreen.
void Effect::warmShaders()
{
    m_warmed = true;
    if (!m_cornerShader || !m_ringShader || !KWin::effects->isOpenGLCompositing()) {
        return;
    }
    const auto texture = KWin::GLTexture::allocate(GL_RGBA8, QSize(64, 64));
    if (!texture) {
        return;
    }
    KWin::GLFramebuffer fbo(texture.get());
    if (!fbo.valid()) {
        return;
    }
    GLint viewportBefore[4];
    glGetIntegerv(GL_VIEWPORT, viewportBefore);
    GLint drawFboBefore = 0, readFboBefore = 0;
    glGetIntegerv(GL_DRAW_FRAMEBUFFER_BINDING, &drawFboBefore);
    glGetIntegerv(GL_READ_FRAMEBUFFER_BINDING, &readFboBefore);
    KWin::GLFramebuffer::pushFramebuffer(&fbo);
    glViewport(0, 0, 64, 64);
    QMatrix4x4 projection;
    projection.ortho(0, 64, 64, 0, -1, 1);
    glEnable(GL_BLEND);
    glBlendFunc(GL_ONE, GL_ONE_MINUS_SRC_ALPHA);
    KWin::ShaderManager::instance()->pushShader(m_cornerShader.get());
    m_cornerShader->setUniform(KWin::GLShader::Mat4Uniform::ModelViewProjectionMatrix, projection);
    m_cornerShader->setUniform("radius", 8.0f);
    m_cornerShader->setUniform("windowSize", QVector2D(64, 64));
    m_cornerShader->setUniform("windowExpandedSize", QVector2D(64, 64));
    m_cornerShader->setUniform("windowTopLeft", QVector2D(0, 0));
    texture->render(QSizeF(64, 64));
    KWin::ShaderManager::instance()->popShader();
    KWin::ShaderManager::instance()->pushShader(m_ringShader.get());
    m_ringShader->setUniform(KWin::GLShader::Mat4Uniform::ModelViewProjectionMatrix, projection);
    m_ringShader->setUniform("rect", QVector4D(8, 8, 48, 48));
    m_ringShader->setUniform("radius", 8.0f);
    m_ringShader->setUniform("borderWidth", 2.0f);
    m_ringShader->setUniform("ringWidth", 2.0f);
    m_ringShader->setUniform("borderColor", QVector4D(0, 0, 0, 0));
    m_ringShader->setUniform("ringColor", QVector4D(0, 0, 0, 0));
    m_ringShader->setUniform("fillColor", QVector4D(0, 0, 0, 0));
    m_ringShader->setUniform("pixel", 1.0f);
    const std::vector<QVector2D> vertices{{0, 0}, {64, 0}, {0, 64}, {0, 64}, {64, 0}, {64, 64}};
    KWin::GLVertexBuffer *vbo = KWin::GLVertexBuffer::streamingBuffer();
    vbo->reset();
    vbo->setVertices(vertices);
    vbo->render(GL_TRIANGLES);
    KWin::ShaderManager::instance()->popShader();
    glDisable(GL_BLEND);
    KWin::GLFramebuffer::popFramebuffer();
    glViewport(viewportBefore[0], viewportBefore[1], viewportBefore[2], viewportBefore[3]);
    // leave the framebuffer bindings exactly as they were (popFramebuffer has nothing to go back to when KWin has none
    // pushed between frames), and say so in the journal if anything was off
    GLint drawFboAfter = 0, readFboAfter = 0;
    glGetIntegerv(GL_DRAW_FRAMEBUFFER_BINDING, &drawFboAfter);
    glGetIntegerv(GL_READ_FRAMEBUFFER_BINDING, &readFboAfter);
    if (drawFboAfter != drawFboBefore || readFboAfter != readFboBefore) {
        qCWarning(KIRI_DECO) << "shader warm-up changed the framebuffer binding" << drawFboBefore << readFboBefore << "->" << drawFboAfter << readFboAfter << "(restored)";
        glBindFramebuffer(GL_DRAW_FRAMEBUFFER, drawFboBefore);
        glBindFramebuffer(GL_READ_FRAMEBUFFER, readFboBefore);
    }
    if (const GLenum error = glGetError(); error != GL_NO_ERROR) {
        qCWarning(KIRI_DECO) << "shader warm-up left GL error" << Qt::hex << error;
    }
}

void Effect::postPaintScreen()
{
    if (!m_warmed && std::chrono::steady_clock::now() - m_clockStart > std::chrono::seconds(6)) {
        warmShaders();
    }
    const double factor = KWin::effects->animationTimeFactor();
    const double speed = factor > 0 ? 1.0 / factor : 0;
    bool again = false;
    for (auto it = m_expanded.begin(); it != m_expanded.end();) {
        if (it.key()->isDeleted() && it->to == 1) { // closed but still fading out
            it = m_expanded.erase(it);
            continue;
        }
        if (it->from != it->to && !NiriAnim::resizeSpring().isDone((m_frameTime - it->start) * speed)) {
            again = true;
        }
        ++it;
    }
    for (auto it = m_park.begin(); it != m_park.end();) {
        const bool done = factor <= 0 || NiriAnim::moveSpring().isDone((m_frameTime - it->start) * speed);
        if (it->toReal && done) {
            m_parkPainted.remove(it.key());
            it = m_park.erase(it);
            again = true; // one more frame at the real place
            continue;
        }
        if (!done) {
            again = true;
        }
        ++it;
    }
    for (auto it = m_tabOpen.begin(); it != m_tabOpen.end();) {
        const double length = it->second ? NiriAnim::Defaults::openMs / 1000 : NiriAnim::moveSpring().duration();
        if (speed <= 0 || (m_frameTime - it->first) * speed >= length) {
            it = m_tabOpen.erase(it);
        } else {
            again = true;
            ++it;
        }
    }
    for (auto it = m_releasing.begin(); it != m_releasing.end();) {
        if (it->start < 0 && m_frameTime - it->created > 0.3) {
            it->start = m_frameTime; // the window never moved: the offset runs out where it is
        }
        if (it->start >= 0 && (speed <= 0 || NiriAnim::moveSpring().isDone((m_frameTime - it->start) * speed))) {
            it = m_releasing.erase(it);
        } else {
            again = true;
            ++it;
        }
    }
    if (again) {
        KWin::effects->addRepaintFull();
    }
    KWin::OffscreenEffect::postPaintScreen();
}

Effect::Effect()
{
    m_cornerShader = KWin::ShaderManager::instance()->generateShaderFromFile(
        KWin::ShaderTrait::MapTexture | KWin::ShaderTrait::RoundedCorners, QString(), shaderPath(QStringLiteral("kiri_corners_core.frag")));
    m_ringShader = KWin::ShaderManager::instance()->generateShaderFromFile(
        KWin::ShaderTraits(), shaderPath(QStringLiteral("kiri_ring_core.vert")), shaderPath(QStringLiteral("kiri_ring_core.frag")));
    if (!m_cornerShader || !m_ringShader) {
        qCCritical(KIRI_DECO) << "Kiri decorations: shaders not found or not valid, the effect does nothing";
    }

    loadSettings();
    registerWheelShortcuts();
    if (!QDBusConnection::sessionBus().registerObject(QStringLiteral("/KiriDecorations"), this, QDBusConnection::ExportScriptableSlots)) {
        qCWarning(KIRI_DECO) << "could not register the debug D-Bus object";
    }
    m_watcher = KConfigWatcher::create(KSharedConfig::openConfig(QStringLiteral("kwinrc")));
    connect(m_watcher.data(), &KConfigWatcher::configChanged, this, [this](const KConfigGroup &group) {
        if (group.name() == QLatin1String("Script-kiri") || group.name() == QLatin1String("Plugins")) {
            loadSettings();
            KWin::effects->addRepaintFull();
        }
    });

    m_active = KWin::effects->activeWindow();
    connect(KWin::effects, &KWin::EffectsHandler::windowActivated, this, [this](KWin::EffectWindow *w) {
        KWin::EffectWindow *previous = std::exchange(m_active, w);
        if (previous && !previous->isDeleted()) {
            repaintAround(previous);
        }
        if (w) {
            repaintAround(w);
        }
    });
    auto watch = [this](KWin::EffectWindow *w) {
        // the contents of a parked window are painted far from where KWin thinks they are: the damage must follow
        connect(w, &KWin::EffectWindow::windowDamaged, this, [this](KWin::EffectWindow *w) {
            if (!m_park.isEmpty()) {
                if (const auto it = m_parkPainted.constFind(w->internalId()); it != m_parkPainted.constEnd()) {
                    KWin::effects->addRepaint(KWin::RectF(*it, w->frameGeometry().size()));
                }
            }
        });
        // The pointer was let go: Kiri puts the window in its place and clears the visual position by D-Bus, which can arrive
        // after the real geometry has changed (and kiri_motion has started to animate it). The offset between where the
        // window was painted and its real place is taken here, while that real place is still the one it was painted for.
        connect(w, &KWin::EffectWindow::windowFinishUserMovedResized, this, [this](KWin::EffectWindow *w) {
            const QUuid id = w->internalId();
            if (m_visualPositions.contains(id) && m_lastVisualOffset.contains(id)) {
                m_releasing.insert(id, VisualRelease{m_lastVisualOffset.value(id), -1, clock()});
                m_visualPositions.remove(id);
                m_lastVisualOffset.remove(id);
                KWin::effects->addRepaintFull();
            }
        });
        connect(w, &KWin::EffectWindow::windowFrameGeometryChanged, this, [this](KWin::EffectWindow *w, const KWin::RectF &old) {
            if (auto release = m_releasing.find(w->internalId()); release != m_releasing.end() && release->start < 0 && old.topLeft() != w->frameGeometry().topLeft()) {
                release->start = clock(); // the real window is where it belongs now: the offset to the old place runs out from here
            }
            // Kiri has parked the window (moved it to the bottom-right corner): it stays painted where it was until the place
            // Kiri wants for it arrives (by D-Bus, a moment later)
            if (w->isX11Client() && w->isFullScreen() && !m_park.contains(w->internalId())) {
                const QRectF screen = w->screen() ? QRectF(w->screen()->geometry()) : QRectF();
                const QPointF parkPoint(screen.right() - 1, screen.bottom() - 1);
                if (screen.isValid() && qFuzzyCompare(w->frameGeometry().x() + 1, parkPoint.x() + 1) && qFuzzyCompare(w->frameGeometry().y() + 1, parkPoint.y() + 1)) {
                    const QPointF there = m_parkPainted.value(w->internalId(), old.topLeft());
                    m_park.insert(w->internalId(), ParkAnim{there, there, false, clock()});
                }
            }
            // the ring is outside of what KWin repaints for the window itself
            const double reach = this->reach();
            KWin::effects->addRepaint(old.adjusted(-reach, -reach, reach, reach));
            repaintPainted(w);
            repaintAround(w);
        });
    };
    connect(KWin::effects, &KWin::EffectsHandler::mouseChanged, this, [this](const QPointF &pos, const QPointF &, Qt::MouseButtons buttons, Qt::MouseButtons oldButtons, Qt::KeyboardModifiers, Qt::KeyboardModifiers) {
        if ((buttons & Qt::LeftButton) && !(oldButtons & Qt::LeftButton) && !m_park.isEmpty()) {
            clickOnParked(pos);
        }
    });
    connect(KWin::effects, &KWin::EffectsHandler::windowAdded, this, watch);
    for (KWin::EffectWindow *w : KWin::effects->stackingOrder()) {
        watch(w);
    }
    connect(KWin::effects, &KWin::EffectsHandler::windowClosed, this, [this](KWin::EffectWindow *w) {
        if (m_active == w) {
            m_active = nullptr;
        }
    });
    connect(KWin::effects, &KWin::EffectsHandler::windowDeleted, this, [this](KWin::EffectWindow *w) {
        repaintPainted(w);
        if (m_active == w) {
            m_active = nullptr;
        }
        m_park.remove(w->internalId());
        m_parkPainted.remove(w->internalId());
        m_painted.remove(w);
        m_expanded.remove(w); // KWin frees the window right after this
    });
}

Effect::~Effect()
{
    QDBusConnection::sessionBus().unregisterObject(QStringLiteral("/KiriDecorations"));
}

// Mouse wheel navigation like niri's binds. KWin scripts can't bind the wheel, so this effect does and asks
// Kiri's own shortcuts to do the work through kglobalaccel. Every bind has its own cooldown like niri's
// `cooldown-ms` (150 ms on the workspace binds in niri's default config, none on the horizontal ones).
void Effect::wheel(Qt::KeyboardModifiers modifiers, KWin::PointerAxisDirection direction, const QString &shortcut, int cooldownMs)
{
    auto action = std::make_unique<QAction>();
    auto cooldown = std::make_shared<QElapsedTimer>();
    connect(action.get(), &QAction::triggered, this, [this, shortcut, cooldown, cooldownMs] {
        qCDebug(KIRI_DECO) << "wheel" << shortcut << m_settings.kiriEnabled;
        if (!m_settings.kiriEnabled || (cooldownMs > 0 && cooldown->isValid() && cooldown->elapsed() < cooldownMs)) {
            return;
        }
        cooldown->start();
        QDBusMessage message = QDBusMessage::createMethodCall(QStringLiteral("org.kde.kglobalaccel"), QStringLiteral("/component/kiri"),
                                                              QStringLiteral("org.kde.kglobalaccel.Component"), QStringLiteral("invokeShortcut"));
        message << shortcut;
        auto *watcher = new QDBusPendingCallWatcher(QDBusConnection::sessionBus().asyncCall(message), this);
        connect(watcher, &QDBusPendingCallWatcher::finished, watcher, [shortcut](QDBusPendingCallWatcher *w) {
            if (w->isError()) {
                qCWarning(KIRI_DECO) << "invoking" << shortcut << "failed:" << w->error().message();
            }
            w->deleteLater();
        });
        qCDebug(KIRI_DECO) << "invoked" << shortcut;
    });
    KWin::effects->registerAxisShortcut(modifiers, direction, action.get());
    m_wheelActions.push_back(std::move(action));
}

void Effect::debugWheel(int i)
{
    if (i >= 0 && i < int(m_wheelActions.size())) {
        m_wheelActions[i]->trigger();
    }
}

void Effect::registerWheelShortcuts()
{
    const Qt::KeyboardModifiers meta = Qt::MetaModifier;
    const Qt::KeyboardModifiers metaCtrl = Qt::MetaModifier | Qt::ControlModifier;
    const Qt::KeyboardModifiers metaShift = Qt::MetaModifier | Qt::ShiftModifier;
    const Qt::KeyboardModifiers metaCtrlShift = Qt::MetaModifier | Qt::ControlModifier | Qt::ShiftModifier;
    wheel(meta, KWin::PointerAxisDown, QStringLiteral("desktop-next"), 150);
    wheel(meta, KWin::PointerAxisUp, QStringLiteral("desktop-previous"), 150);
    wheel(metaCtrl, KWin::PointerAxisDown, QStringLiteral("column-move-to-next-desktop"), 150);
    wheel(metaCtrl, KWin::PointerAxisUp, QStringLiteral("column-move-to-previous-desktop"), 150);
    wheel(meta, KWin::PointerAxisRight, QStringLiteral("focus-right"), 0);
    wheel(meta, KWin::PointerAxisLeft, QStringLiteral("focus-left"), 0);
    wheel(metaCtrl, KWin::PointerAxisRight, QStringLiteral("column-move-right"), 0);
    wheel(metaCtrl, KWin::PointerAxisLeft, QStringLiteral("column-move-left"), 0);
    wheel(metaShift, KWin::PointerAxisDown, QStringLiteral("focus-right"), 0);
    wheel(metaShift, KWin::PointerAxisUp, QStringLiteral("focus-left"), 0);
    wheel(metaCtrlShift, KWin::PointerAxisDown, QStringLiteral("column-move-right"), 0);
    wheel(metaCtrlShift, KWin::PointerAxisUp, QStringLiteral("column-move-left"), 0);
}

bool Effect::supported()
{
    return KWin::effects->isOpenGLCompositing();
}

void Effect::loadSettings()
{
    auto config = KSharedConfig::openConfig(QStringLiteral("kwinrc"));
    config->reparseConfiguration();
    const KConfigGroup kiri = config->group(QStringLiteral("Script-kiri"));
    Settings s;
    s.kiriEnabled = config->group(QStringLiteral("Plugins")).readEntry("kiriEnabled", false);
    s.cornerRadius = int(kiri.readEntry("cornerRadius", 0u));
    s.ringEnabled = kiri.readEntry("focusRingEnabled", true);
    s.ringWidth = int(kiri.readEntry("focusRingWidth", 4u));
    s.ringColor = readColor(kiri, "focusRingActiveColor", s.ringColor);
    s.borderEnabled = kiri.readEntry("borderEnabled", false);
    s.borderWidth = int(kiri.readEntry("borderWidth", 4u));
    s.borderActiveColor = readColor(kiri, "borderActiveColor", s.borderActiveColor);
    s.borderInactiveColor = readColor(kiri, "borderInactiveColor", s.borderInactiveColor);
    s.tabEnabled = kiri.readEntry("tabIndicatorEnabled", true);
    s.tabWidth = int(kiri.readEntry("tabIndicatorWidth", 4u));
    s.tabGap = int(kiri.readEntry("tabIndicatorGap", 5u));
    s.tabLength = std::clamp(kiri.readEntry("tabIndicatorLength", 0.5), 0.0, 1.0);
    // an enum is stored by the name of its choice, or by its number
    static const QStringList positions = {QStringLiteral("left"), QStringLiteral("right"), QStringLiteral("top"), QStringLiteral("bottom")};
    const QString position = kiri.readEntry("tabIndicatorPosition", QStringLiteral("left"));
    bool isNumber = false;
    const int number = position.toInt(&isNumber);
    s.tabPosition = isNumber ? positions.value(number, QStringLiteral("left")) : (positions.contains(position) ? position : QStringLiteral("left"));
    s.tabHideWhenSingle = kiri.readEntry("tabIndicatorHideWhenSingleTab", false);
    s.tabActiveColor = readColor(kiri, "focusRingActiveColor", s.tabActiveColor);
    s.tabInactiveColor = readColor(kiri, "focusRingInactiveColor", s.tabInactiveColor);
    m_settings = s;
}

void Effect::reloadSettings(const QString &)
{
    loadSettings();
    KWin::effects->addRepaintFull();
}

int Effect::pointerButtons()
{
    return KWin::input() ? int(KWin::input()->qtButtonStates()) : 0;
}

void Effect::setDesktopRows(const QString &rows)
{
    bool ok = false;
    const uint n = rows.toUInt(&ok);
    auto *manager = KWin::VirtualDesktopManager::self();
    if (ok && n > 0 && n <= manager->count() && manager->rows() != n) {
        manager->setRows(n);
    }
}

bool Effect::isX11Window(const QString &id)
{
    const KWin::EffectWindow *w = KWin::effects->findWindow(QUuid(id));
    return w && w->isX11Client();
}

void Effect::setInsertHint(const QString &json)
{
    // {"r": [x, y, w, h], "w": "{uuid}"}: the hint rectangle and the window being dragged; anything else clears it
    const QJsonObject object = QJsonDocument::fromJson(json.toUtf8()).object();
    const QJsonArray a = object.value(QStringLiteral("r")).toArray();
    const KWin::RectF hint = a.size() == 4 ? KWin::RectF(a[0].toDouble(), a[1].toDouble(), a[2].toDouble(), a[3].toDouble()) : KWin::RectF();
    const QUuid dragged = QUuid::fromString(object.value(QStringLiteral("w")).toString());
    if (hint == m_insertHint && dragged == m_hintWindow) {
        return;
    }
    if (!m_insertHint.isEmpty()) {
        KWin::effects->addRepaint(m_insertHint);
    }
    m_insertHint = hint;
    m_hintWindow = dragged;
    if (!m_insertHint.isEmpty()) {
        KWin::effects->addRepaint(m_insertHint);
    }
}

// niri's insert hint (config insert-hint, default colour rgba(127, 200, 255, 128)): filled, with the dragged
// window's corner radius plus its border width, drawn with the ring shader's fill mode.
void Effect::drawInsertHint(const KWin::RenderViewport &viewport, const KWin::Region &deviceRegion)
{
    if (m_insertHint.isEmpty() || deviceRegion.isEmpty()) {
        return;
    }
    const double radius = std::min<double>(m_settings.cornerRadius + (m_settings.borderEnabled ? m_settings.borderWidth : 0),
                                           std::min(m_insertHint.width(), m_insertHint.height()) / 2);
    KWin::ShaderManager::instance()->pushShader(m_ringShader.get());
    m_ringShader->setUniform(KWin::GLShader::Mat4Uniform::ModelViewProjectionMatrix, viewport.projectionMatrix());
    m_ringShader->setUniform("rect", QVector4D(m_insertHint.x(), m_insertHint.y(), m_insertHint.width(), m_insertHint.height()));
    m_ringShader->setUniform("radius", float(radius));
    m_ringShader->setUniform("borderWidth", 0.0f);
    m_ringShader->setUniform("ringWidth", 0.0f);
    m_ringShader->setUniform("borderColor", QVector4D(0, 0, 0, 0));
    m_ringShader->setUniform("ringColor", QVector4D(0, 0, 0, 0));
    m_ringShader->setUniform("fillColor", QVector4D(127 / 255.0, 200 / 255.0, 1.0, 128 / 255.0));
    m_ringShader->setUniform("pixel", float(1.0 / viewport.scale()));
    std::vector<QVector2D> vertices;
    for (const KWin::Rect &deviceRect : deviceRegion.rects()) {
        const KWin::RectF part = viewport.mapFromDeviceCoordinates(KWin::RectF(deviceRect)).intersected(m_insertHint);
        if (part.isEmpty()) {
            continue;
        }
        const QVector2D tl(part.left(), part.top()), tr(part.right(), part.top());
        const QVector2D bl(part.left(), part.bottom()), br(part.right(), part.bottom());
        for (const QVector2D &v : {tl, tr, bl, bl, tr, br}) {
            vertices.push_back(v);
        }
    }
    if (!vertices.empty()) {
        KWin::GLVertexBuffer *vbo = KWin::GLVertexBuffer::streamingBuffer();
        vbo->reset();
        vbo->setVertices(vertices);
        glEnable(GL_BLEND);
        glBlendFunc(GL_ONE, GL_ONE_MINUS_SRC_ALPHA);
        vbo->render(GL_TRIANGLES);
        glDisable(GL_BLEND);
    }
    m_ringShader->setUniform("fillColor", QVector4D(0, 0, 0, 0));
    KWin::ShaderManager::instance()->popShader();
}

// The hint is drawn over everything except the dragged window (drawWindow draws it under that one, so the
// window, translucent while it is loose, stays on top of its own hint like in niri).
bool Effect::paintScreen(const KWin::RenderTarget &renderTarget, const KWin::RenderViewport &viewport, int mask, const KWin::Region &deviceRegion, KWin::LogicalOutput *screen)
{
    const bool result = OffscreenEffect::paintScreen(renderTarget, viewport, mask, deviceRegion, screen);
    if (!m_insertHint.isEmpty() && isActive()) {
        KWin::Region region = deviceRegion;
        if (!m_hintWindow.isNull()) {
            for (KWin::EffectWindow *w : KWin::effects->stackingOrder()) {
                if (w->internalId() == m_hintWindow) {
                    region = region.subtracted(viewport.mapToDeviceCoordinatesAligned(w->frameGeometry()));
                }
            }
        }
        drawInsertHint(viewport, region);
    }
    return result;
}

void Effect::setTabGroups(const QString &json)
{
    QList<TabGroup> groups;
    QHash<QUuid, int> index;
    const QJsonArray array = QJsonDocument::fromJson(json.toUtf8()).array();
    for (const QJsonValue &value : array) {
        const QJsonObject object = value.toObject();
        TabGroup group;
        for (const QJsonValue &id : object.value(QStringLiteral("windows")).toArray()) {
            const QUuid uuid(id.toString());
            if (!uuid.isNull()) {
                group.windows.push_back(uuid);
            }
        }
        group.active = std::clamp(object.value(QStringLiteral("active")).toInt(), 0, std::max(0, int(group.windows.size()) - 1));
        if (group.windows.isEmpty()) {
            continue;
        }
        for (const QUuid &uuid : std::as_const(group.windows)) {
            index.insert(uuid, groups.size());
        }
        groups.push_back(group);
    }
    // repaint the columns that changed, and the ones that are gone
    auto repaint = [this](const QList<TabGroup> &list) {
        for (const TabGroup &group : list) {
            for (const QUuid &uuid : group.windows) {
                if (KWin::EffectWindow *w = KWin::effects->findWindow(uuid)) {
                    repaintAround(w);
                }
            }
        }
    };
    if (groups.size() != m_tabGroups.size() || !std::equal(groups.begin(), groups.end(), m_tabGroups.begin(), [](const TabGroup &a, const TabGroup &b) { return a.windows == b.windows && a.active == b.active; })) {
        repaint(m_tabGroups);
        // a column that was not tabbed before (none of its windows had an indicator) gets the open animation
        for (const TabGroup &group : std::as_const(groups)) {
            const bool known = std::any_of(group.windows.begin(), group.windows.end(), [this](const QUuid &id) { return m_tabGroupOf.contains(id); });
            if (!known && m_frameTime > 0) {
                m_tabOpen.insert(group.windows.first(), {clock(), group.windows.size() == 1});
            }
        }
        m_tabGroups = groups;
        m_tabGroupOf = index;
        repaint(m_tabGroups);
    }
}

QPointF Effect::parkedPosition(KWin::EffectWindow *w, const ParkAnim &anim) const
{
    const QPointF target = anim.toReal ? w->frameGeometry().topLeft() : anim.to;
    const double factor = KWin::effects->animationTimeFactor();
    // niri's spring runs from 1 (at the start) to 0: the part of the way that is still to go
    const double k = factor > 0 ? NiriAnim::moveSpring().value((m_frameTime - anim.start) / factor) : 0.0;
    return target + (anim.from - target) * k;
}

bool Effect::isParked(KWin::EffectWindow *w) const
{
    const auto it = m_park.constFind(w->internalId());
    return it != m_park.constEnd() && !it->toReal;
}

// A parked window has no place of its own on the screen, so a click on where it is painted goes to nothing: focus it
// (Kiri scrolls it into view when it is activated), unless another window is above it there.
void Effect::clickOnParked(const QPointF &pos)
{
    const auto windows = KWin::effects->stackingOrder();
    for (auto it = windows.crbegin(); it != windows.crend(); ++it) {
        KWin::EffectWindow *w = *it;
        if (w->isDeleted() || w->isHidden() || w->isMinimized() || !w->isOnCurrentDesktop() || !w->isVisible() || !(w->isNormalWindow() || w->isDock())) {
            continue;
        }
        if (isParked(w)) {
            const auto painted = m_parkPainted.constFind(w->internalId());
            if (painted != m_parkPainted.constEnd() && KWin::RectF(*painted, w->frameGeometry().size()).contains(pos)) {
                KWin::effects->activateWindow(w);
                return;
            }
        } else if (w->frameGeometry().contains(pos)) {
            return;
        }
    }
}

void Effect::setParkedPositions(const QString &json)
{
    const QJsonObject object = QJsonDocument::fromJson(json.toUtf8()).object();
    QSet<QUuid> wanted;
    for (auto it = object.begin(); it != object.end(); ++it) {
        const QJsonArray xy = it.value().toArray();
        const QUuid uuid(it.key());
        KWin::EffectWindow *w = uuid.isNull() ? nullptr : KWin::effects->findWindow(uuid);
        if (!w || xy.size() != 2) {
            continue;
        }
        wanted.insert(uuid);
        const QPointF to(xy.at(0).toDouble(), xy.at(1).toDouble());
        const auto old = m_park.constFind(uuid);
        if (old != m_park.constEnd() && !old->toReal && old->to == to) {
            continue;
        }
        // while kiri_swipe paints a touchpad swipe it compensates for every change of the real places at once: so must this
        const bool instant = KWin::effects->property("kiriSwipeVisual").toBool();
        const QPointF from = instant ? to : (m_parkPainted.contains(uuid) ? m_parkPainted.value(uuid) : w->frameGeometry().topLeft());
        m_park.insert(uuid, ParkAnim{from, to, false, clock()});
    }
    for (auto it = m_park.begin(); it != m_park.end(); ++it) {
        if (!wanted.contains(it.key()) && !it->toReal) {
            if (KWin::EffectWindow *w = KWin::effects->findWindow(it.key())) {
                const QPointF from = m_parkPainted.contains(it.key()) ? m_parkPainted.value(it.key()) : w->frameGeometry().topLeft();
                *it = ParkAnim{from, from, true, clock()};
            }
        }
    }
    KWin::effects->addRepaintFull();
}

void Effect::setVisualPositions(const QString &json)
{
    QHash<QUuid, QPointF> positions;
    const QJsonObject object = QJsonDocument::fromJson(json.toUtf8()).object();
    for (auto it = object.begin(); it != object.end(); ++it) {
        const QJsonArray xy = it.value().toArray();
        const QUuid uuid(it.key());
        if (!uuid.isNull() && xy.size() == 2) {
            positions.insert(uuid, QPointF(xy.at(0).toDouble(), xy.at(1).toDouble()));
        }
    }
    auto repaint = [this](const QHash<QUuid, QPointF> &list) {
        for (auto it = list.begin(); it != list.end(); ++it) {
            if (KWin::EffectWindow *w = KWin::effects->findWindow(it.key())) {
                const double reach = this->reach();
                const KWin::RectF f = w->frameGeometry();
                KWin::effects->addRepaint(KWin::RectF(it.value().x(), it.value().y(), f.width(), f.height()).adjusted(-reach, -reach, reach, reach));
                repaintPainted(w);
                repaintAround(w);
            }
        }
    };
    repaint(m_visualPositions);
    // niri's animate_move_from: when the painted place stops being decided by Kiri (the pointer let go, or the window
    // left the grid), what is left of the offset to the real place is animated away
    for (auto it = m_visualPositions.cbegin(); it != m_visualPositions.cend(); ++it) {
        if (!positions.contains(it.key()) && m_lastVisualOffset.contains(it.key())) {
            m_releasing.insert(it.key(), VisualRelease{m_lastVisualOffset.value(it.key()), -1, clock()});
        }
    }
    for (auto it = positions.cbegin(); it != positions.cend(); ++it) {
        m_releasing.remove(it.key());
    }
    for (auto it = m_lastVisualOffset.begin(); it != m_lastVisualOffset.end();) {
        it = positions.contains(it.key()) ? std::next(it) : m_lastVisualOffset.erase(it);
    }
    m_visualPositions = positions;
    repaint(m_visualPositions);
    if (!m_releasing.isEmpty()) {
        KWin::effects->addRepaintFull();
    }
}

double Effect::reach() const
{
    double reach = m_settings.borderWidth + m_settings.ringWidth + 2;
    if (m_settings.tabEnabled) {
        reach = std::max<double>(reach, m_settings.tabGap + m_settings.tabWidth + 2);
    }
    return reach;
}

const TabGroup *Effect::tabGroupOf(KWin::EffectWindow *w) const
{
    const auto it = m_tabGroupOf.constFind(w->internalId());
    return it == m_tabGroupOf.constEnd() ? nullptr : &m_tabGroups[it.value()];
}

void Effect::reconfigure(ReconfigureFlags)
{
    loadSettings();
}

bool Effect::isActive() const
{
    return m_cornerShader && m_ringShader && m_settings.kiriEnabled;
}

bool Effect::provides(Feature feature)
{
    return feature == Nothing;
}

int Effect::requestedEffectChainPosition() const
{
    return 99; // late, so it sees the final position and scale other effects give the window
}

bool Effect::blocksDirectScanout() const
{
    return false;
}

// Windows that get a ring, a border and rounded corners. Kiri tiles most normal windows and floats the
// rest; niri decorates floating windows too, so this does not try to tell them apart. Menus, panels,
// pop-ups and windows that skip the taskbar (krunner and the like) are left alone.
bool Effect::decorated(KWin::EffectWindow *w) const
{
    if (!isActive() || w->isSpecialWindow()) {
        return false;
    }
    if (!(w->isNormalWindow() || w->isDialog())) {
        return false;
    }
    if (w->caption().startsWith(QLatin1String("kiri-ring-"))) {
        return false; // the fallback ring windows of the Kiri script
    }
    // a window that is full screen or fills its screen (maximized, or Kiri's "maximized in grid" without gaps) has no
    // corners, ring or border once the fade out is done
    return expandedProgress(w) < 1.0;
}

double Effect::radiusFor(KWin::EffectWindow *w) const
{
    return decorated(w) ? m_settings.cornerRadius * (1.0 - expandedProgress(w)) : 0;
}

KWin::RectF Effect::outerBounds(KWin::EffectWindow *w) const
{
    const double reach = this->reach();
    return w->frameGeometry().adjusted(-reach, -reach, reach, reach);
}

void Effect::repaintPainted(KWin::EffectWindow *w)
{
    const auto it = m_painted.constFind(w);
    if (it != m_painted.constEnd()) {
        KWin::effects->addRepaint(*it);
    }
}

void Effect::repaintAround(KWin::EffectWindow *w)
{
    if (!w->isDeleted()) {
        KWin::effects->addRepaint(outerBounds(w));
    }
}

void Effect::prePaintWindow(KWin::RenderView *view, KWin::EffectWindow *w, KWin::WindowPrePaintData &data)
{
    if (radiusFor(w) > 0) {
        data.setTranslucent(); // the cut corners show what is behind the window
    }
    if (m_visualPositions.contains(w->internalId()) || m_releasing.contains(w->internalId()) || m_park.contains(w->internalId())) {
        data.setTransformed(); // painted somewhere else than where KWin thinks it is
    }
    // kiri_swipe (which paints before this effect) reads where a parked window is painted: it has to be this frame's place, not
    // the last frame's, or the window jumps for one frame when it gets parked or unparked or its place changes
    if (const auto parkIt = m_park.constFind(w->internalId()); parkIt != m_park.constEnd()) {
        w->setData(ParkedOffsetRole, parkedPosition(w, *parkIt) - w->frameGeometry().topLeft());
    } else if (w->data(ParkedOffsetRole).isValid()) {
        w->setData(ParkedOffsetRole, QVariant());
    }
    OffscreenEffect::prePaintWindow(view, w, data);
}

bool Effect::drawWindow(const KWin::RenderTarget &renderTarget, const KWin::RenderViewport &viewport, KWin::EffectWindow *w, int mask, const KWin::Region &deviceRegion, KWin::WindowPaintData &data)
{
    const double radius = radiusFor(w);
    if (radius > 0) {
        const double scale = w->screen()->scale();
        const auto frame = KWin::snapToPixels(w->frameGeometry(), scale) * scale;
        const auto expanded = KWin::snapToPixels(w->expandedGeometry(), scale) * scale;
        redirect(w);
        setShader(w, m_cornerShader.get());
        KWin::ShaderManager::instance()->pushShader(m_cornerShader.get());
        m_cornerShader->setUniform("radius", float(radius * scale));
        m_cornerShader->setUniform("windowSize", QVector2D(frame.width(), frame.height()));
        m_cornerShader->setUniform("windowExpandedSize", QVector2D(expanded.width(), expanded.height()));
        m_cornerShader->setUniform("windowTopLeft", QVector2D(frame.x() - expanded.x(), frame.y() - expanded.y()));
        KWin::ShaderManager::instance()->popShader();
    } else {
        unredirect(w);
    }

    if (const auto parkIt = m_park.constFind(w->internalId()); parkIt != m_park.constEnd()) {
        const QPointF at = parkedPosition(w, *parkIt);
        data.setXTranslation(data.xTranslation() + at.x() - w->frameGeometry().x());
        data.setYTranslation(data.yTranslation() + at.y() - w->frameGeometry().y());
        m_parkPainted.insert(w->internalId(), at);
        w->setData(ParkedOffsetRole, at - w->frameGeometry().topLeft());
    } else if (w->data(ParkedOffsetRole).isValid()) {
        w->setData(ParkedOffsetRole, QVariant());
    }
    // Kiri moves the painted window instead of the real one while the user resizes it
    const auto visualIt = m_visualPositions.constFind(w->internalId());
    if (visualIt != m_visualPositions.constEnd()) {
        data.setXTranslation(data.xTranslation() + visualIt->x() - w->frameGeometry().x());
        data.setYTranslation(data.yTranslation() + visualIt->y() - w->frameGeometry().y());
        m_lastVisualOffset.insert(w->internalId(), QPointF(visualIt->x() - w->frameGeometry().x(), visualIt->y() - w->frameGeometry().y()));
    } else if (const auto releaseIt = m_releasing.constFind(w->internalId()); releaseIt != m_releasing.constEnd()) {
        const double factor = KWin::effects->animationTimeFactor();
        const double k = releaseIt->start < 0 ? 1.0 : (factor > 0 ? NiriAnim::moveSpring().value((m_frameTime - releaseIt->start) / factor) : 0);
        data.setXTranslation(data.xTranslation() + releaseIt->offset.x() * k);
        data.setYTranslation(data.yTranslation() + releaseIt->offset.y() * k);
    }

    if (!m_insertHint.isEmpty() && !m_hintWindow.isNull() && w->internalId() == m_hintWindow && isActive() && !w->data(CaptureRole).toBool()) {
        drawInsertHint(viewport, deviceRegion); // under the dragged window
    }
    if (KIRI_PAINT().isDebugEnabled() && w->isNormalWindow() && !w->data(CaptureRole).toBool()) {
        // where the window really ends up on screen (after the visual position and kiri_motion's animation), for measuring
        const KWin::RectF f = w->frameGeometry();
        qCDebug(KIRI_PAINT).noquote() << "PD" << QDateTime::currentMSecsSinceEpoch() << qint64(m_frameTime * 1000) << w->caption()
                                      << qRound(f.x() + data.xTranslation()) << qRound(f.y() + data.yTranslation())
                                      << qRound(f.width() * data.xScale()) << qRound(f.height() * data.yScale())
                                      << "frame" << qRound(f.x()) << qRound(f.y()) << qRound(f.width()) << qRound(f.height())
                                      << "cur" << qRound(KWin::effects->cursorPos().x()) << qRound(KWin::effects->cursorPos().y());
    }
    const bool result = OffscreenEffect::drawWindow(renderTarget, viewport, w, mask, deviceRegion, data);
    if (w->data(CaptureRole).toBool()) {
        return result; // kiri_motion is taking a snapshot of the window: the ring and tab indicator are not part of it
    }

    {
        // where the window and its ring are drawn this frame; when that changes (a resize, the visual offset,
        // another effect moving it), the old place is cleared, or the ring stays behind as a trail
        const KWin::RectF frame = w->frameGeometry();
        const double reach = this->reach();
        const KWin::RectF painted = KWin::RectF(frame.x() + data.xTranslation(), frame.y() + data.yTranslation(),
                                                frame.width() * data.xScale(), frame.height() * data.yScale())
                                        .adjusted(-reach, -reach, reach, reach);
        const auto previous = m_painted.constFind(w);
        if (previous != m_painted.constEnd() && *previous != painted) {
            KWin::effects->addRepaint(*previous);
        }
        m_painted.insert(w, painted);
    }

    const double fade = decorated(w) ? 1.0 - expandedProgress(w) : 0.0;
    if (decorated(w) && ((m_settings.borderEnabled && m_settings.borderWidth > 0) || (w == m_active && m_settings.ringEnabled && m_settings.ringWidth > 0))) {
        // where the window really is painted right now, other effects may be moving or scaling it
        const KWin::RectF frame = w->frameGeometry();
        const KWin::RectF visual(frame.x() + data.xTranslation(), frame.y() + data.yTranslation(),
                                 frame.width() * data.xScale(), frame.height() * data.yScale());
        drawRing(viewport, w, visual, deviceRegion, data.opacity() * fade);
    }
    // the tab indicator of a tabbed column belongs to its shown window
    if (m_settings.tabEnabled && isActive() && fade > 0) {
        if (const TabGroup *group = tabGroupOf(w); group && group->windows.value(group->active) == w->internalId()
            && (group->windows.size() >= 2 || !m_settings.tabHideWhenSingle)) {
            const KWin::RectF frame = w->frameGeometry();
            const KWin::RectF visual(frame.x() + data.xTranslation(), frame.y() + data.yTranslation(),
                                     frame.width() * data.xScale(), frame.height() * data.yScale());
            drawTabIndicator(viewport, *group, visual, deviceRegion, data.opacity() * fade, tabProgress(*group));
        }
    }
    return result;
}

void Effect::fillRect(const KWin::RenderViewport &viewport, const KWin::RectF &rect, const QColor &color, const KWin::Region &deviceRegion, double opacity)
{
    std::vector<QVector2D> vertices;
    for (const KWin::Rect &deviceRect : deviceRegion.rects()) {
        const KWin::RectF part = viewport.mapFromDeviceCoordinates(KWin::RectF(deviceRect)).intersected(rect);
        if (part.isEmpty()) {
            continue;
        }
        const QVector2D tl(part.left(), part.top()), tr(part.right(), part.top());
        const QVector2D bl(part.left(), part.bottom()), br(part.right(), part.bottom());
        for (const QVector2D &v : {tl, tr, bl, bl, tr, br}) {
            vertices.push_back(v);
        }
    }
    if (vertices.empty()) {
        return;
    }
    const double alpha = color.alphaF() * opacity;
    KWin::GLShader *shader = KWin::ShaderManager::instance()->pushShader(KWin::ShaderTrait::UniformColor);
    shader->setUniform(KWin::GLShader::Mat4Uniform::ModelViewProjectionMatrix, viewport.projectionMatrix());
    shader->setUniform(KWin::GLShader::ColorUniform::Color, QVector4D(color.redF() * alpha, color.greenF() * alpha, color.blueF() * alpha, alpha));
    KWin::GLVertexBuffer *vbo = KWin::GLVertexBuffer::streamingBuffer();
    vbo->reset();
    vbo->setVertices(vertices);
    glEnable(GL_BLEND);
    glBlendFunc(GL_ONE, GL_ONE_MINUS_SRC_ALPHA);
    vbo->render(GL_TRIANGLES);
    glDisable(GL_BLEND);
    KWin::ShaderManager::instance()->popShader();
}

// niri's tab indicator: a bar beside the column, split into one segment per window, the shown one highlighted.
// Same geometry as the script's fallback (Column.getTabIndicator), but taken from where the window is painted now.
void Effect::drawTabIndicator(const KWin::RenderViewport &viewport, const TabGroup &group, const KWin::RectF &frame, const KWin::Region &deviceRegion, double opacity, double progress)
{
    const QString &position = m_settings.tabPosition;
    const bool vertical = position == QLatin1String("left") || position == QLatin1String("right");
    const double thickness = m_settings.tabWidth;
    const double total = vertical ? frame.height() : frame.width();
    const double length = std::max(1.0, std::round(total * m_settings.tabLength * progress));
    const double start = std::round((vertical ? frame.y() : frame.x()) + (total - length) / 2);
    double x, y;
    if (position == QLatin1String("right")) {
        x = frame.x() + frame.width() + m_settings.tabGap;
        y = start;
    } else if (position == QLatin1String("top")) {
        x = start;
        y = frame.y() - m_settings.tabGap - thickness;
    } else if (position == QLatin1String("bottom")) {
        x = start;
        y = frame.y() + frame.height() + m_settings.tabGap;
    } else {
        x = frame.x() - m_settings.tabGap - thickness;
        y = start;
    }
    x = std::round(x);
    y = std::round(y);
    const int count = group.windows.size();
    for (int i = 0; i < count; ++i) {
        const double from = std::round(i * length / count);
        const double to = std::round((i + 1) * length / count);
        const KWin::RectF segment = vertical ? KWin::RectF(x, y + from, thickness, to - from) : KWin::RectF(x + from, y, to - from, thickness);
        fillRect(viewport, segment, i == group.active ? m_settings.tabActiveColor : m_settings.tabInactiveColor, deviceRegion, opacity);
    }
}

void Effect::drawRing(const KWin::RenderViewport &viewport, KWin::EffectWindow *w, const KWin::RectF &frame, const KWin::Region &deviceRegion, double opacity)
{
    const bool active = w == m_active;
    // like in niri, the ring goes around the border; a hidden tab right under the active window must not cover its border
    bool border = m_settings.borderEnabled && m_settings.borderWidth > 0;
    if (border && !active && m_active && m_active->frameGeometry() == w->frameGeometry()) {
        border = false;
    }
    const bool ring = active && m_settings.ringEnabled && m_settings.ringWidth > 0;
    if (!border && !ring) {
        return;
    }
    const int borderWidth = m_settings.borderEnabled ? m_settings.borderWidth : 0;
    const int ringWidth = ring ? m_settings.ringWidth : 0;
    const double reach = borderWidth + ringWidth + 2;
    const KWin::RectF bounds = frame.adjusted(-reach, -reach, reach, reach);

    auto premultiplied = [opacity](const QColor &c) {
        return QVector4D(c.redF(), c.greenF(), c.blueF(), c.alphaF() * opacity);
    };
    const QColor &borderColor = active ? m_settings.borderActiveColor : m_settings.borderInactiveColor;

    KWin::ShaderManager::instance()->pushShader(m_ringShader.get());
    m_ringShader->setUniform(KWin::GLShader::Mat4Uniform::ModelViewProjectionMatrix, viewport.projectionMatrix());
    m_ringShader->setUniform("rect", QVector4D(frame.x(), frame.y(), frame.width(), frame.height()));
    m_ringShader->setUniform("radius", float(std::min<double>(radiusFor(w), std::min(frame.width(), frame.height()) / 2)));
    m_ringShader->setUniform("borderWidth", float(border ? borderWidth : 0));
    m_ringShader->setUniform("ringWidth", float(ringWidth));
    m_ringShader->setUniform("borderColor", premultiplied(borderColor));
    m_ringShader->setUniform("ringColor", premultiplied(m_settings.ringColor));
    m_ringShader->setUniform("fillColor", QVector4D(0, 0, 0, 0));
    m_ringShader->setUniform("pixel", float(1.0 / viewport.scale()));

    // only the parts of the ring KWin is repainting right now, so nothing is blended twice
    std::vector<QVector2D> vertices;
    for (const KWin::Rect &deviceRect : deviceRegion.rects()) {
        const KWin::RectF part = viewport.mapFromDeviceCoordinates(KWin::RectF(deviceRect)).intersected(bounds);
        if (part.isEmpty()) {
            continue;
        }
        const QVector2D tl(part.left(), part.top()), tr(part.right(), part.top());
        const QVector2D bl(part.left(), part.bottom()), br(part.right(), part.bottom());
        for (const QVector2D &v : {tl, tr, bl, bl, tr, br}) {
            vertices.push_back(v);
        }
    }
    if (!vertices.empty()) {
        KWin::GLVertexBuffer *vbo = KWin::GLVertexBuffer::streamingBuffer();
        vbo->reset();
        vbo->setVertices(vertices);
        glEnable(GL_BLEND);
        glBlendFunc(GL_ONE, GL_ONE_MINUS_SRC_ALPHA);
        vbo->render(GL_TRIANGLES);
        glDisable(GL_BLEND);
    }
    KWin::ShaderManager::instance()->popShader();
}

} // namespace KiriDecorations
