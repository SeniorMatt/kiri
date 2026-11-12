/*
    Kiri decorations: rounded window corners, focus ring and borders painted with the window.
    See DecorationsEffect.h for credits. License: GPL-3.0-or-later.
*/

#include "DecorationsEffect.h"

#include <core/output.h>
#include <input.h>
#include <pointer_input.h>
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
#include <QRegularExpression>
#include <QLoggingCategory>
#include <QRegularExpression>
#include <QStandardPaths>
#include <QVector2D>
#include <QVector3D>

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
constexpr double DraggedAlpha = 0.75; // niri's INTERACTIVE_MOVE_ALPHA
QString shaderPath(const QString &name)
{
    return QStandardPaths::locate(QStandardPaths::GenericDataLocation, QStringLiteral("kwin/shaders/") + name);
}

// niri's colours are CSS ones: "#rgb", "#rgba", "#rrggbb", "#rrggbbaa" (the alpha comes last, Qt's own parser takes it first),
// rgb()/rgba()/hsl()/hsla(), and names
bool parseColor(const QString &text, QColor &out)
{
    const QString s = text.trimmed().toLower();
    if (s.isEmpty()) {
        return false;
    }
    if (s.startsWith(QLatin1Char('#'))) {
        QString h = s.mid(1);
        bool ok = false;
        if (h.size() == 3 || h.size() == 4) {
            QString full;
            for (const QChar c : h) {
                full += c;
                full += c;
            }
            h = full;
        }
        if (h.size() != 6 && h.size() != 8) {
            return false;
        }
        const uint v = h.toUInt(&ok, 16);
        if (!ok) {
            return false;
        }
        if (h.size() == 6) {
            out = QColor::fromRgb((v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff, 255);
        } else {
            out = QColor::fromRgb((v >> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff);
        }
        return true;
    }
    static const QRegularExpression func(QStringLiteral("^(rgba?|hsla?)\\((.*)\\)$"));
    if (const auto m = func.match(s); m.hasMatch()) {
        static const QRegularExpression number(QStringLiteral("[\\d.]+%?"));
        QList<double> values;
        QList<bool> percent;
        for (auto it = number.globalMatch(m.captured(2)); it.hasNext();) {
            const QString n = it.next().captured(0);
            percent.push_back(n.endsWith(QLatin1Char('%')));
            values.push_back(QString(n).remove(QLatin1Char('%')).toDouble());
        }
        if (values.size() < 3) {
            return false;
        }
        double alpha = 1;
        if (values.size() > 3) {
            alpha = std::clamp(percent[3] ? values[3] / 100 : values[3], 0.0, 1.0);
        }
        if (m.captured(1).startsWith(QLatin1String("rgb"))) {
            auto channel = [&](int i) { return std::clamp(percent[i] ? values[i] * 2.55 : values[i], 0.0, 255.0); };
            out = QColor::fromRgbF(channel(0) / 255, channel(1) / 255, channel(2) / 255, alpha);
        } else {
            out = QColor::fromHslF(std::fmod(std::fmod(values[0], 360) + 360, 360) / 360, std::clamp(values[1] / 100, 0.0, 1.0), std::clamp(values[2] / 100, 0.0, 1.0), alpha);
        }
        return true;
    }
    const QColor named(s);
    if (named.isValid()) {
        out = named;
        return true;
    }
    return false;
}

QColor colorOr(const QString &text, const QColor &fallback)
{
    QColor c;
    return parseColor(text, c) ? c : fallback;
}

Gradient solid(const QColor &color)
{
    Gradient g;
    g.from = g.to = color;
    g.angle = 0;
    return g;
}

// niri's gradient properties on one line: "from=#80c8ff to=#bbddff angle=45 relative-to=workspace-view in=oklch longer hue"
bool parseGradient(const QString &text, Gradient &out)
{
    static const QRegularExpression key(QStringLiteral("(?:^|\\s)(from|to|angle|relative-to|in)="));
    QList<std::pair<QString, QString>> parts;
    QList<QRegularExpressionMatch> matches;
    for (auto it = key.globalMatch(text); it.hasNext();) {
        matches.push_back(it.next());
    }
    for (int i = 0; i < matches.size(); ++i) {
        const int start = matches[i].capturedEnd(0);
        const int end = i + 1 < matches.size() ? matches[i + 1].capturedStart(0) : text.size();
        parts.push_back({matches[i].captured(1), text.mid(start, end - start).trimmed()});
    }
    Gradient g;
    bool haveFrom = false, haveTo = false;
    for (const auto &[name, value] : parts) {
        if (name == QLatin1String("from")) {
            haveFrom = parseColor(value, g.from);
        } else if (name == QLatin1String("to")) {
            haveTo = parseColor(value, g.to);
        } else if (name == QLatin1String("angle")) {
            g.angle = value.toDouble();
        } else if (name == QLatin1String("relative-to")) {
            g.viewRelative = value == QLatin1String("workspace-view");
        } else if (name == QLatin1String("in")) {
            const QStringList words = value.split(QLatin1Char(' '), Qt::SkipEmptyParts);
            static const QStringList spaces = {QStringLiteral("srgb"), QStringLiteral("srgb-linear"), QStringLiteral("oklab"), QStringLiteral("oklch")};
            static const QStringList hues = {QStringLiteral("shorter"), QStringLiteral("longer"), QStringLiteral("increasing"), QStringLiteral("decreasing")};
            if (!words.isEmpty()) {
                g.space = std::max(0, int(spaces.indexOf(words[0])));
            }
            if (words.size() > 1) {
                g.hue = std::max(0, int(hues.indexOf(words[1])));
            }
        }
    }
    if (!haveFrom || !haveTo) {
        return false;
    }
    out = g;
    return true;
}

QString str(const QVariantMap &m, const char *key, const QString &def = QString())
{
    const auto it = m.constFind(QLatin1String(key));
    return it == m.constEnd() ? def : it->toString();
}
bool flag(const QVariantMap &m, const char *key, bool def)
{
    const auto it = m.constFind(QLatin1String(key));
    if (it == m.constEnd()) {
        return def;
    }
    const QString s = it->toString().toLower();
    return !(s == QLatin1String("false") || s == QLatin1String("0") || s.isEmpty());
}
int integer(const QVariantMap &m, const char *key, int def)
{
    const auto it = m.constFind(QLatin1String(key));
    bool ok = false;
    const double v = it == m.constEnd() ? def : it->toDouble(&ok);
    return it == m.constEnd() || !ok ? def : int(std::lround(v));
}
double real(const QVariantMap &m, const char *key, double def)
{
    const auto it = m.constFind(QLatin1String(key));
    bool ok = false;
    const double v = it == m.constEnd() ? def : it->toDouble(&ok);
    return it == m.constEnd() || !ok ? def : v;
}

// the colour and the gradient of a state: niri's gradient wins when both are set
Gradient paint(const QVariantMap &m, const QString &colorKey, const QString &gradientKey, const QColor &fallback)
{
    Gradient g;
    if (parseGradient(m.value(gradientKey).toString(), g)) {
        return g;
    }
    return solid(colorOr(m.value(colorKey).toString(), fallback));
}

// the two triangles of the parts of `rect` that KWin is repainting
void appendQuads(std::vector<QVector2D> &vertices, const KWin::RenderViewport &viewport, const KWin::Region &deviceRegion, const KWin::RectF &rect)
{
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
}

void renderBlended(const std::vector<QVector2D> &vertices)
{
    if (vertices.empty()) {
        return;
    }
    KWin::GLVertexBuffer *vbo = KWin::GLVertexBuffer::streamingBuffer();
    vbo->reset();
    vbo->setVertices(vertices);
    glEnable(GL_BLEND);
    glBlendFunc(GL_ONE, GL_ONE_MINUS_SRC_ALPHA);
    vbo->render(GL_TRIANGLES);
    glDisable(GL_BLEND);
}

// niri's tab_indicator.rs `tab_rects`: the rectangle of every tab of an indicator beside `area` (a column's tile), in the
// coordinates of `area`. `scale` is the output scale (niri rounds to physical pixels), `progress` the open animation.
QList<QRectF> tabRects(const Settings &s, int count, const QRectF &area, double scale, double progress)
{
    auto round = [scale](double v) { return std::round(v * scale) / scale; };
    auto round1 = [scale](double v) { return std::max(1 / scale, std::round(v * scale) / scale); };
    auto floor1 = [scale](double v) { return std::max(1 / scale, std::floor(v * scale) / scale); };
    const double width = round1(s.tabWidth);
    const double gap = std::copysign(round1(std::abs(double(s.tabGap))), double(s.tabGap));
    const double gapsShortest = round1(s.tabGapsBetween);
    const bool vertical = s.tabPosition == QLatin1String("left") || s.tabPosition == QLatin1String("right");
    const double side = vertical ? area.height() : area.width();
    const double minLength = round(side * std::clamp(s.tabLength, 0.0, 2.0));
    const double pixel = 1 / scale;
    // px_per_tab is worked out before the animation touches gaps_between, so that it does not grow and shrink over the animation
    const double shortest = count * (pixel + gapsShortest) - gapsShortest;
    const double requested = std::max(minLength, shortest);
    double perTab = (requested + gapsShortest) / count - gapsShortest;
    perTab *= progress;
    const double gapsBetween = round(s.tabGapsBetween * progress);
    const double length = count * (perTab + gapsBetween) - gapsBetween;
    perTab = floor1(perTab);
    const double floored = count * (perTab + gapsBetween) - gapsBetween;
    int onesLeft = std::max(0, int(std::lround((length - floored) / pixel)));
    const double across = -gap - width;
    const double along = round((side - length) / 2);
    double x, y;
    if (s.tabPosition == QLatin1String("right")) {
        x = area.width() + gap;
        y = along;
    } else if (s.tabPosition == QLatin1String("top")) {
        x = along;
        y = across;
    } else if (s.tabPosition == QLatin1String("bottom")) {
        x = along;
        y = area.height() + gap;
    } else {
        x = across;
        y = along;
    }
    x += area.x();
    y += area.y();
    QList<QRectF> rects;
    for (int i = 0; i < count; ++i) {
        double size = perTab;
        if (onesLeft > 0) {
            --onesLeft;
            size += pixel;
        }
        rects.push_back(vertical ? QRectF(x, y, width, size) : QRectF(x, y, size, width));
        if (vertical) {
            y += size + gapsBetween;
        } else {
            x += size + gapsBetween;
        }
    }
    return rects;
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
    // a window that is only told it is full-screen (niri's toggle-windowed-fullscreen) stays a tile: expanded needs the frame to cover the screen
    bool expanded = w->isFullScreen() && !w->screen();
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
    if (!m_cornerShader || !m_ringShader || !m_shadowShader || !KWin::effects->isOpenGLCompositing()) {
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
    m_ringShader->setUniform("radii", QVector4D(8, 8, 8, 8));
    m_ringShader->setUniform("bands", QVector2D(2, 2));
    m_ringShader->setUniform("layers", QVector3D(1, 1, 1));
    m_ringShader->setUniform("pixel", 1.0f);
    m_ringShader->setUniform("alpha", 0.0f);
    for (int i = 0; i < 3; ++i) {
        setGradient(m_ringShader.get(), i, Gradient(), QRectF(0, 0, 64, 64));
    }
    const std::vector<QVector2D> vertices{{0, 0}, {64, 0}, {0, 64}, {0, 64}, {64, 0}, {64, 64}};
    KWin::GLVertexBuffer *vbo = KWin::GLVertexBuffer::streamingBuffer();
    vbo->reset();
    vbo->setVertices(vertices);
    vbo->render(GL_TRIANGLES);
    KWin::ShaderManager::instance()->popShader();
    KWin::ShaderManager::instance()->pushShader(m_shadowShader.get());
    m_shadowShader->setUniform(KWin::GLShader::Mat4Uniform::ModelViewProjectionMatrix, projection);
    m_shadowShader->setUniform("box", QVector4D(8, 8, 48, 48));
    m_shadowShader->setUniform("boxRadius", 8.0f);
    m_shadowShader->setUniform("sigma", 4.0f);
    m_shadowShader->setUniform("window", QVector4D(8, 8, 48, 48));
    m_shadowShader->setUniform("windowRadii", QVector4D(8, 8, 8, 8));
    m_shadowShader->setUniform("cutout", 1.0f);
    m_shadowShader->setUniform("color", QVector4D(0, 0, 0, 0));
    m_shadowShader->setUniform("pixel", 1.0f);
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
        if (it->from != it->to && speed > 0 && !NiriAnim::resizeSpring().isDone((m_frameTime - it->start) * speed)) {
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
    for (auto it = m_alpha.begin(); it != m_alpha.end();) {
        const bool done = speed <= 0 || NiriAnim::moveSpring().isDone((m_frameTime - it->start) * speed);
        if (done && it->to == 1.0) {
            it = m_alpha.erase(it);
            again = true; // one more frame at full opacity
        } else {
            again = again || !done;
            ++it;
        }
    }
    for (auto it = m_tabOpen.begin(); it != m_tabOpen.end();) {
        const double length = it->second ? NiriAnim::Defaults::openMs / 1000 : NiriAnim::moveSpring().duration();
        if (speed <= 0 || (m_frameTime - it->first) * speed >= length) {
            it = m_tabOpen.erase(it);
            again = true; // one more frame with the finished indicator
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
            again = true; // one more frame at the real place
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
    m_shadowShader = KWin::ShaderManager::instance()->generateShaderFromFile(
        KWin::ShaderTraits(), shaderPath(QStringLiteral("kiri_ring_core.vert")), shaderPath(QStringLiteral("kiri_shadow_core.frag")));
    if (!m_cornerShader || !m_ringShader || !m_shadowShader) {
        qCCritical(KIRI_DECO) << "Kiri decorations: shaders not found or not valid, the effect does nothing";
    }

    loadSettings();
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
        // the ring is outside of the window: when the window stops being painted (minimized, hidden, on another desktop)
        // KWin repaints the window's own area only, and the ring stays on the screen
        auto stateChanged = [this](KWin::EffectWindow *w) {
            repaintAround(w);
        };
        connect(w, &KWin::EffectWindow::minimizedChanged, this, stateChanged);
        connect(w, &KWin::EffectWindow::windowDesktopsChanged, this, stateChanged);
        connect(w, &KWin::EffectWindow::windowHiddenChanged, this, stateChanged);
        connect(w, &KWin::EffectWindow::windowFullScreenChanged, this, stateChanged);
        connect(w, &KWin::EffectWindow::windowMaximizedStateChanged, this, [this](KWin::EffectWindow *w) {
            repaintAround(w);
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
        if ((buttons & Qt::LeftButton) && !(oldButtons & Qt::LeftButton)) {
            if (!m_park.isEmpty()) {
                clickOnParked(pos);
            }
            if (!m_tabHits.isEmpty() && isActive()) {
                clickOnTab(pos);
            }
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
        m_alpha.remove(w->internalId());
        m_expanded.remove(w); // KWin frees the window right after this
    });
}

Effect::~Effect()
{
    QDBusConnection::sessionBus().unregisterObject(QStringLiteral("/KiriDecorations"));
}

// Mouse wheel and mouse button binds like niri's (Mod+WheelScrollDown, Mod+MouseMiddle). KWin scripts can't bind them,
// so this effect does and asks Kiri's own shortcuts to do the work through kglobalaccel. Every bind has its own
// cooldown like niri's `cooldown-ms` (150 ms on the workspace binds in niri's default config, none on the others).
void Effect::bind(Qt::KeyboardModifiers modifiers, const QString &trigger, const QString &shortcut, int cooldownMs)
{
    static const QHash<QString, KWin::PointerAxisDirection> axes = {
        {QStringLiteral("WheelScrollDown"), KWin::PointerAxisDown}, {QStringLiteral("WheelScrollUp"), KWin::PointerAxisUp},
        {QStringLiteral("WheelScrollLeft"), KWin::PointerAxisLeft}, {QStringLiteral("WheelScrollRight"), KWin::PointerAxisRight},
    };
    static const QHash<QString, Qt::MouseButton> buttons = {
        {QStringLiteral("MouseLeft"), Qt::LeftButton}, {QStringLiteral("MouseRight"), Qt::RightButton}, {QStringLiteral("MouseMiddle"), Qt::MiddleButton},
        {QStringLiteral("MouseBack"), Qt::BackButton}, {QStringLiteral("MouseForward"), Qt::ForwardButton},
    };
    if (!axes.contains(trigger) && !buttons.contains(trigger)) {
        qCWarning(KIRI_DECO) << "pointerBinds: unknown trigger" << trigger;
        return;
    }
    auto action = std::make_unique<QAction>();
    auto cooldown = std::make_shared<QElapsedTimer>();
    connect(action.get(), &QAction::triggered, this, [this, shortcut, cooldown, cooldownMs] {
        qCDebug(KIRI_DECO) << "pointer bind" << shortcut << m_settings.kiriEnabled;
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
    if (axes.contains(trigger)) {
        KWin::effects->registerAxisShortcut(modifiers, axes.value(trigger), action.get());
    } else {
        KWin::effects->registerPointerShortcut(modifiers, buttons.value(trigger), action.get());
    }
    m_wheelActions.push_back(std::move(action));
}

void Effect::debugWheel(int i)
{
    if (i >= 0 && i < int(m_wheelActions.size())) {
        m_wheelActions[i]->trigger();
    }
}

// The binds are the `pointerBinds` setting: "Meta+Ctrl+WheelScrollDown=column-move-to-next-desktop@150;..."
// (<modifiers>+<trigger>=<Kiri shortcut>[@<cooldown ms>], separated by ; or new lines). KWin drops a shortcut when
// its QAction is destroyed, so a changed setting just starts over.
void Effect::registerPointerBinds()
{
    m_wheelActions.clear();
    for (const QString &entry : m_settings.pointerBinds.split(QRegularExpression(QStringLiteral("[;\n]")), Qt::SkipEmptyParts)) {
        const int equals = entry.indexOf(QLatin1Char('='));
        if (equals < 0) {
            continue;
        }
        QStringList keys = entry.left(equals).trimmed().split(QLatin1Char('+'));
        QString shortcut = entry.mid(equals + 1).trimmed();
        int cooldown = 0;
        if (shortcut.contains(QLatin1Char('@'))) {
            cooldown = shortcut.section(QLatin1Char('@'), 1).toInt();
            shortcut = shortcut.section(QLatin1Char('@'), 0, 0);
        }
        const QString trigger = keys.takeLast().trimmed();
        Qt::KeyboardModifiers modifiers;
        bool valid = !shortcut.isEmpty();
        for (const QString &key : std::as_const(keys)) {
            if (key == QLatin1String("Meta")) {
                modifiers |= Qt::MetaModifier;
            } else if (key == QLatin1String("Ctrl")) {
                modifiers |= Qt::ControlModifier;
            } else if (key == QLatin1String("Alt")) {
                modifiers |= Qt::AltModifier;
            } else if (key == QLatin1String("Shift")) {
                modifiers |= Qt::ShiftModifier;
            } else {
                valid = false;
            }
        }
        if (valid) {
            bind(modifiers, trigger, shortcut, cooldown);
        } else {
            qCWarning(KIRI_DECO) << "pointerBinds: cannot read" << entry;
        }
    }
    m_pointerBindsRegistered = true;
}

bool Effect::supported()
{
    return KWin::effects->isOpenGLCompositing();
}

// the look of a window from a settings map: the keys of Kiri's config (src/lib/config/definition.ts)
Look Effect::parseLook(const QVariantMap &m) const
{
    Look look;
    look.cornerRadius = std::max(0, integer(m, "cornerRadius", 0));
    auto band = [&](BandStyle &b, const QString &prefix, bool enabled, const char *active, const char *inactive) {
        b.enabled = flag(m, qPrintable(prefix + QLatin1String("Enabled")), enabled);
        b.width = std::max(0, integer(m, qPrintable(prefix + QLatin1String("Width")), 4));
        b.colors[0] = paint(m, prefix + QLatin1String("ActiveColor"), prefix + QLatin1String("ActiveGradient"), QColor(QLatin1String(active)));
        b.colors[1] = paint(m, prefix + QLatin1String("InactiveColor"), prefix + QLatin1String("InactiveGradient"), QColor(QLatin1String(inactive)));
        b.colors[2] = paint(m, prefix + QLatin1String("UrgentColor"), prefix + QLatin1String("UrgentGradient"), QColor(0x9b, 0, 0));
    };
    band(look.ring, QStringLiteral("focusRing"), true, "#7fc8ff", "#505050");
    band(look.border, QStringLiteral("border"), false, "#ffc87f", "#505050");

    ShadowStyle &sh = look.shadow;
    sh.on = flag(m, "shadowEnabled", false);
    sh.offsetX = real(m, "shadowOffsetX", 0);
    sh.offsetY = real(m, "shadowOffsetY", 5);
    sh.softness = std::max(0.0, real(m, "shadowSoftness", 30));
    sh.spread = real(m, "shadowSpread", 5);
    sh.drawBehindWindow = flag(m, "shadowDrawBehindWindow", false);
    sh.color = colorOr(str(m, "shadowColor", QStringLiteral("#00000077")), QColor(0, 0, 0, 0x77));
    sh.hasInactiveColor = parseColor(str(m, "shadowInactiveColor"), sh.inactiveColor);

    static const char *states[3] = {"Active", "Inactive", "Urgent"};
    for (int i = 0; i < 3; ++i) {
        const QString color = QStringLiteral("tabIndicator") + QLatin1String(states[i]) + QLatin1String("Color");
        const QString gradient = QStringLiteral("tabIndicator") + QLatin1String(states[i]) + QLatin1String("Gradient");
        Gradient g;
        if (parseGradient(m.value(gradient).toString(), g)) {
            look.tabColors.set[i] = true;
            look.tabColors.colors[i] = g;
        } else if (QColor c; parseColor(m.value(color).toString(), c)) {
            look.tabColors.set[i] = true;
            look.tabColors.colors[i] = solid(c);
        }
    }
    return look;
}

// niri's window-rule merge: the rule's fields replace the look's, a colour replaces a gradient and the other way round
void Effect::applyOverride(Look &look, const QVariantMap &rule) const
{
    if (rule.contains(QStringLiteral("cornerRadius"))) {
        look.cornerRadius = std::max(0, integer(rule, "cornerRadius", look.cornerRadius));
    }
    auto colors = [](const QVariantMap &g, const QString &state, bool &set, Gradient &target) {
        Gradient parsed;
        QColor c;
        if (parseColor(g.value(state + QLatin1String("Color")).toString(), c)) {
            set = true;
            target = solid(c);
        }
        if (parseGradient(g.value(state + QLatin1String("Gradient")).toString(), parsed)) {
            set = true;
            target = parsed;
        }
    };
    auto band = [&](BandStyle &b, const QVariantMap &g) {
        if (g.isEmpty()) {
            return;
        }
        b.enabled = flag(g, "enabled", b.enabled);
        b.width = std::max(0, integer(g, "width", b.width));
        static const QString names[3] = {QStringLiteral("active"), QStringLiteral("inactive"), QStringLiteral("urgent")};
        for (int i = 0; i < 3; ++i) {
            bool set = false;
            colors(g, names[i], set, b.colors[i]);
        }
    };
    band(look.ring, rule.value(QStringLiteral("focusRing")).toMap());
    band(look.border, rule.value(QStringLiteral("border")).toMap());
    if (const QVariantMap g = rule.value(QStringLiteral("shadow")).toMap(); !g.isEmpty()) {
        ShadowStyle &sh = look.shadow;
        sh.on = flag(g, "enabled", sh.on);
        sh.offsetX = real(g, "offsetX", sh.offsetX);
        sh.offsetY = real(g, "offsetY", sh.offsetY);
        sh.softness = std::max(0.0, real(g, "softness", sh.softness));
        sh.spread = real(g, "spread", sh.spread);
        sh.drawBehindWindow = flag(g, "drawBehindWindow", sh.drawBehindWindow);
        if (QColor c; parseColor(str(g, "color"), c)) {
            sh.color = c;
        }
        if (QColor c; parseColor(str(g, "inactiveColor"), c)) {
            sh.hasInactiveColor = true;
            sh.inactiveColor = c;
        }
    }
    if (const QVariantMap g = rule.value(QStringLiteral("tabIndicator")).toMap(); !g.isEmpty()) {
        static const QString names[3] = {QStringLiteral("active"), QStringLiteral("inactive"), QStringLiteral("urgent")};
        for (int i = 0; i < 3; ++i) {
            colors(g, names[i], look.tabColors.set[i], look.tabColors.colors[i]);
        }
    }
}

Settings Effect::parseSettings(const QVariantMap &m, bool kiriEnabled) const
{
    Settings s;
    s.kiriEnabled = kiriEnabled;
    s.look = parseLook(m);
    s.tabEnabled = flag(m, "tabIndicatorEnabled", true);
    s.tabWidth = std::max(0, integer(m, "tabIndicatorWidth", 4));
    s.tabGap = integer(m, "tabIndicatorGap", 5);
    s.tabGapsBetween = std::max(0, integer(m, "tabIndicatorGapsBetweenTabs", 0));
    s.tabCornerRadius = std::max(0, integer(m, "tabIndicatorCornerRadius", 0));
    s.tabLength = std::clamp(real(m, "tabIndicatorLength", 0.5), 0.0, 2.0);
    // an enum is stored by the name of its choice, or by its number
    static const QStringList positions = {QStringLiteral("left"), QStringLiteral("right"), QStringLiteral("top"), QStringLiteral("bottom")};
    const QString position = str(m, "tabIndicatorPosition", QStringLiteral("left"));
    bool isNumber = false;
    const int number = position.toInt(&isNumber);
    s.tabPosition = isNumber ? positions.value(number, QStringLiteral("left")) : (positions.contains(position) ? position : QStringLiteral("left"));
    s.tabHideWhenSingle = flag(m, "tabIndicatorHideWhenSingleTab", false);
    s.insertHintEnabled = flag(m, "insertHintEnabled", true);
    s.insertHint = paint(m, QStringLiteral("insertHintColor"), QStringLiteral("insertHintGradient"), QColor(127, 200, 255, 128));
    s.fullscreenBackdrop = colorOr(str(m, "fullscreenBackdropColor", QStringLiteral("#000000")), QColor(Qt::black));
    QColor background;
    if (parseColor(str(m, "backgroundColor"), background)) {
        s.background = background;
    }
    // the default is niri's default config's wheel binds (keep in step with `pointerBinds` in src/lib/config/definition.ts)
    s.pointerBinds = str(m, "pointerBinds", QStringLiteral(
        "Meta+WheelScrollDown=desktop-next@150;Meta+WheelScrollUp=desktop-previous@150;"
        "Meta+Ctrl+WheelScrollDown=column-move-to-next-desktop@150;Meta+Ctrl+WheelScrollUp=column-move-to-previous-desktop@150;"
        "Meta+WheelScrollRight=focus-right;Meta+WheelScrollLeft=focus-left;"
        "Meta+Ctrl+WheelScrollRight=column-move-right;Meta+Ctrl+WheelScrollLeft=column-move-left;"
        "Meta+Shift+WheelScrollDown=focus-right;Meta+Shift+WheelScrollUp=focus-left;"
        "Meta+Ctrl+Shift+WheelScrollDown=column-move-right;Meta+Ctrl+Shift+WheelScrollUp=column-move-left"));
    return s;
}

void Effect::loadSettings()
{
    auto config = KSharedConfig::openConfig(QStringLiteral("kwinrc"));
    config->reparseConfiguration();
    const bool enabled = config->group(QStringLiteral("Plugins")).readEntry("kiriEnabled", false);
    QVariantMap map = m_config;
    if (!m_haveConfig) {
        const KConfigGroup kiri = config->group(QStringLiteral("Script-kiri"));
        for (const QString &key : kiri.keyList()) {
            map.insert(key, kiri.readEntry(key, QString()));
        }
    }
    const QString oldBinds = m_settings.pointerBinds;
    const bool oldEnabled = m_settings.kiriEnabled;
    m_settings = parseSettings(map, enabled);
    if (!m_pointerBindsRegistered || m_settings.pointerBinds != oldBinds || enabled != oldEnabled) {
        registerPointerBinds();
    }
    // the looks of the windows with overrides follow the global one
    m_looks.clear();
    for (auto it = m_overrides.constBegin(); it != m_overrides.constEnd(); ++it) {
        const QUuid id(it.key());
        if (!id.isNull()) {
            Look look = m_settings.look;
            applyOverride(look, it.value().toMap());
            m_looks.insert(id, look);
        }
    }
    updateReach();
}

void Effect::setConfig(const QString &json)
{
    const QJsonDocument doc = QJsonDocument::fromJson(json.toUtf8());
    if (!doc.isObject()) {
        return;
    }
    m_config = doc.object().toVariantMap();
    m_haveConfig = true;
    loadSettings();
    KWin::effects->addRepaintFull();
}

void Effect::setWindowDecorations(const QString &json)
{
    const QJsonDocument doc = QJsonDocument::fromJson(json.toUtf8());
    m_overrides = doc.isObject() ? doc.object().toVariantMap() : QVariantMap();
    loadSettings();
    KWin::effects->addRepaintFull();
}

void Effect::setUrgentWindows(const QString &json)
{
    QSet<QUuid> urgent;
    for (const QJsonValue &id : QJsonDocument::fromJson(json.toUtf8()).array()) {
        const QUuid uuid(id.toString());
        if (!uuid.isNull()) {
            urgent.insert(uuid);
        }
    }
    const QSet<QUuid> changed = (urgent - m_urgent) | (m_urgent - urgent);
    m_urgent = urgent;
    for (const QUuid &id : changed) {
        if (KWin::EffectWindow *w = KWin::effects->findWindow(id)) {
            repaintAround(w);
        }
    }
}

const Look &Effect::lookOf(KWin::EffectWindow *w) const
{
    if (!m_looks.isEmpty()) {
        const auto it = m_looks.constFind(w->internalId());
        if (it != m_looks.constEnd()) {
            return *it;
        }
    }
    return m_settings.look;
}

// how far the decorations reach beyond a window's frame: the repaint area around it
void Effect::updateReach()
{
    auto reachOf = [](const Look &look) {
        double reach = (look.border.enabled ? look.border.width : 0) + (look.ring.enabled ? look.ring.width : 0) + 2;
        if (look.shadow.on) {
            const double sigma = look.shadow.softness / 2;
            reach = std::max(reach, std::ceil(sigma * 3) + std::max(std::abs(look.shadow.offsetX), std::abs(look.shadow.offsetY)) + std::max(look.shadow.spread, 0.0) + 3);
        }
        return reach;
    };
    double reach = reachOf(m_settings.look);
    for (const Look &look : std::as_const(m_looks)) {
        reach = std::max(reach, reachOf(look));
    }
    if (m_settings.tabEnabled) {
        reach = std::max<double>(reach, std::abs(m_settings.tabGap) + m_settings.tabWidth + 3);
    }
    m_reach = reach;
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

void Effect::warpPointer(const QString &xy)
{
    const QStringList parts = xy.split(QLatin1Char(','));
    bool okX = false;
    bool okY = false;
    const double x = parts.value(0).toDouble(&okX);
    const double y = parts.value(1).toDouble(&okY);
    if (okX && okY && KWin::input() && KWin::input()->pointer()) {
        KWin::input()->pointer()->warp(QPointF(x, y));
    }
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
    if (dragged != m_hintWindow) {
        if (!m_hintWindow.isNull()) {
            fadeTo(m_hintWindow, 1.0);
        }
        if (!dragged.isNull()) {
            fadeTo(dragged, DraggedAlpha);
        }
    }
    m_hintWindow = dragged;
    if (!m_insertHint.isEmpty()) {
        KWin::effects->addRepaint(m_insertHint);
    }
}

// niri's insert hint (config insert-hint): filled with a colour or gradient, with the dragged window's corner radius plus
// its border width, drawn like niri does it (insert_hint_element.rs is a focus ring of width 0 that fills its rectangle).
void Effect::drawInsertHint(const KWin::RenderViewport &viewport, const KWin::Region &deviceRegion)
{
    if (m_insertHint.isEmpty() || deviceRegion.isEmpty() || !m_settings.insertHintEnabled) {
        return;
    }
    const Look &look = m_settings.look;
    const double radius = std::min<double>(look.cornerRadius + (look.border.enabled ? look.border.width : 0),
                                           std::min(m_insertHint.width(), m_insertHint.height()) / 2);
    KWin::ShaderManager::instance()->pushShader(m_ringShader.get());
    m_ringShader->setUniform(KWin::GLShader::Mat4Uniform::ModelViewProjectionMatrix, viewport.projectionMatrix());
    m_ringShader->setUniform("rect", QVector4D(m_insertHint.x(), m_insertHint.y(), m_insertHint.width(), m_insertHint.height()));
    m_ringShader->setUniform("radii", QVector4D(radius, radius, radius, radius));
    m_ringShader->setUniform("bands", QVector2D(0, 0));
    m_ringShader->setUniform("layers", QVector3D(0, 0, 1));
    m_ringShader->setUniform("pixel", float(1.0 / viewport.scale()));
    m_ringShader->setUniform("alpha", 1.0f);
    QRectF area(m_insertHint.x(), m_insertHint.y(), m_insertHint.width(), m_insertHint.height());
    if (m_settings.insertHint.viewRelative) {
        // niri: the view of the workspace, which is the screen the hint is on
        for (KWin::LogicalOutput *output : KWin::effects->screens()) {
            if (QRectF(output->geometry()).intersects(area)) {
                area = QRectF(output->geometry());
                break;
            }
        }
    }
    setGradient(m_ringShader.get(), 2, m_settings.insertHint, area);
    std::vector<QVector2D> vertices;
    appendQuads(vertices, viewport, deviceRegion, m_insertHint);
    renderBlended(vertices);
    KWin::ShaderManager::instance()->popShader();
}

// niri's border.rs gradient parameters: the gradient vector for an angle over the gradient area, the colours and the space
void Effect::setGradient(KWin::GLShader *shader, int layer, const Gradient &g, const QRectF &area) const
{
    const double angle = (g.angle - 90) * M_PI / 180;
    const QPointF dir(std::cos(angle), std::sin(angle));
    QPointF diag(area.width(), area.height());
    if ((dir.x() < 0 && 0 <= dir.y()) || (0 <= dir.x() && dir.y() < 0)) {
        diag.setX(-area.width());
    }
    const double along = diag.x() * dir.x() + diag.y() * dir.y(); // dir has length 1
    QPointF vec(dir.x() * along, dir.y() * along);
    if (dir.y() < 0) {
        vec = -vec;
    }
    const QByteArray n = QByteArray::number(layer);
    shader->setUniform(("gFrom[" + n + "]").constData(), QVector4D(g.from.redF(), g.from.greenF(), g.from.blueF(), g.from.alphaF()));
    shader->setUniform(("gTo[" + n + "]").constData(), QVector4D(g.to.redF(), g.to.greenF(), g.to.blueF(), g.to.alphaF()));
    shader->setUniform(("gArea[" + n + "]").constData(), QVector4D(area.x(), area.y(), area.width(), area.height()));
    shader->setUniform(("gMisc[" + n + "]").constData(), QVector4D(vec.x(), vec.y(), g.space, g.hue));
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

double Effect::alphaOf(const QUuid &id) const
{
    const auto it = m_alpha.constFind(id);
    if (it == m_alpha.constEnd()) {
        return 1.0;
    }
    const double factor = KWin::effects->animationTimeFactor();
    const double k = factor > 0 ? NiriAnim::moveSpring().value((m_frameTime - it->start) / factor) : 0.0;
    return it->to + (it->from - it->to) * k;
}

void Effect::fadeTo(const QUuid &id, double to)
{
    const double from = alphaOf(id);
    if (from == to) {
        if (to == 1.0) {
            m_alpha.remove(id);
        }
        return;
    }
    m_alpha.insert(id, AlphaAnim{from, to, clock()});
    KWin::effects->addRepaintFull();
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
        for (auto it = m_tabHits.begin(); it != m_tabHits.end();) {
            const bool alive = std::any_of(groups.begin(), groups.end(), [&](const TabGroup &g) { return g.windows.first() == it.key(); });
            it = alive ? std::next(it) : m_tabHits.erase(it);
        }
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
    return m_reach;
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
    return m_cornerShader && m_ringShader && m_shadowShader && m_settings.kiriEnabled;
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
    return decorated(w) ? lookOf(w).cornerRadius * (1.0 - expandedProgress(w)) : 0;
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
        // a tab indicator can be longer than the window (length total-proportion up to 2)
        if (const TabGroup *group = tabGroupOf(w)) {
            if (const auto it = m_tabHits.constFind(group->windows.first()); it != m_tabHits.constEnd()) {
                for (const QRectF &rect : it->rects) {
                    KWin::effects->addRepaint(KWin::RectF(rect).adjusted(-2, -2, 2, 2));
                }
            }
        }
    }
    repaintPainted(w); // where the ring was drawn last may be somewhere else (an animation moves the window)
}

void Effect::prePaintWindow(KWin::RenderView *view, KWin::EffectWindow *w, KWin::WindowPrePaintData &data)
{
    if (radiusFor(w) > 0 || (decorated(w) && lookOf(w).shadow.on)) {
        data.setTranslucent(); // the cut corners show what is behind the window, and so does a shadow that is not under it
    }
    if (decorated(w)) {
        // The ring, border and tab indicator are outside of the window. KWin paints a window that is not transformed
        // only inside its bounding rect (the frame and its shadow, and a window without a title bar has none), which
        // cut the ring away whenever the window had no shadow, as a window that is dragged out of the layout has not.
        data.setTransformed();
    }
    if (m_visualPositions.contains(w->internalId()) || m_releasing.contains(w->internalId()) || m_park.contains(w->internalId())) {
        data.setTransformed(); // painted somewhere else than where KWin thinks it is
    }
    if (m_alpha.contains(w->internalId())) {
        data.setTranslucent();
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
    // niri's layout background-color: the wallpaper is Plasma's desktop window, which is painted as a solid colour instead
    if (w->isDesktop() && isActive() && m_settings.background.isValid() && !w->data(CaptureRole).toBool()) {
        fillRect(viewport, KWin::RectF(w->frameGeometry()), m_settings.background, deviceRegion, data.opacity());
        return true;
    }
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

    if (!m_alpha.isEmpty()) {
        data.multiplyOpacity(alphaOf(w->internalId()));
    }
    if (isActive() && !w->data(CaptureRole).toBool() && (w->isNormalWindow() || w->isDialog())) {
        drawBackdrop(viewport, w, deviceRegion, data.opacity());
        if (decorated(w) && lookOf(w).shadow.on) {
            // under the window, where the window is painted now (other effects may be moving or scaling it)
            const KWin::RectF f = w->frameGeometry();
            drawShadow(viewport, w, KWin::RectF(f.x() + data.xTranslation(), f.y() + data.yTranslation(), f.width() * data.xScale(), f.height() * data.yScale()),
                       deviceRegion, data.opacity() * (1.0 - expandedProgress(w)));
        }
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
    const Look &look = lookOf(w);
    if (decorated(w) && ((look.border.enabled && look.border.width > 0) || (w == m_active && look.ring.enabled && look.ring.width > 0))) {
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
            drawTabIndicator(viewport, *group, w, visual, deviceRegion, data.opacity() * fade, tabProgress(*group));
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

// niri's tab indicator (tab_indicator.rs): one rectangle per window beside the column, each with the gradient of its window's
// state (urgent, active, inactive), dimmed when the column is not the active one. `frame` is where the shown window is painted
// now, which is niri's tab indicator area.
void Effect::drawTabIndicator(const KWin::RenderViewport &viewport, const TabGroup &group, KWin::EffectWindow *active, const KWin::RectF &frame, const KWin::Region &deviceRegion, double opacity, double progress)
{
    const int count = group.windows.size();
    const double scale = active->screen() ? active->screen()->scale() : 1.0;
    const QList<QRectF> rects = tabRects(m_settings, count, QRectF(frame.x(), frame.y(), frame.width(), frame.height()), scale, progress);
    TabHit &hit = m_tabHits[group.windows.first()];
    hit.windows = group.windows;
    hit.rects = rects;

    const bool columnActive = m_active && group.windows.contains(m_active->internalId());
    const bool vertical = m_settings.tabPosition == QLatin1String("left") || m_settings.tabPosition == QLatin1String("right");
    const bool shared = m_settings.tabGapsBetween == 0 && count > 1;
    const double r = m_settings.tabCornerRadius;
    QRectF viewArea = QRectF(frame.x(), frame.y(), frame.width(), frame.height());
    if (const auto *output = active->screen()) {
        viewArea = QRectF(output->geometry());
    }

    KWin::ShaderManager::instance()->pushShader(m_ringShader.get());
    m_ringShader->setUniform(KWin::GLShader::Mat4Uniform::ModelViewProjectionMatrix, viewport.projectionMatrix());
    m_ringShader->setUniform("bands", QVector2D(0, 0));
    m_ringShader->setUniform("layers", QVector3D(0, 0, 1));
    m_ringShader->setUniform("pixel", float(1.0 / viewport.scale()));
    m_ringShader->setUniform("alpha", float(opacity));
    for (int i = 0; i < count; ++i) {
        const QRectF rect = rects[i];
        KWin::EffectWindow *tabWindow = KWin::effects->findWindow(group.windows[i]);
        const Look &look = tabWindow ? lookOf(tabWindow) : m_settings.look;
        const int state = m_urgent.contains(group.windows[i]) ? 2 : (i == group.active ? 0 : 1);
        // the rule's colour, then the tab indicator's, then the focus ring's (or the border's when the ring is off)
        Gradient g = look.tabColors.set[state] ? look.tabColors.colors[state] : (look.ring.enabled ? look.ring.colors[state] : look.border.colors[state]);
        if (!columnActive) {
            g.from.setAlphaF(g.from.alphaF() * 0.5);
            g.to.setAlphaF(g.to.alphaF() * 0.5);
        }
        // tabs that touch share the rounded corners: only the ends of the strip are round
        double tl = r, tr = r, br = r, bl = r;
        if (shared) {
            if (i == 0) {
                if (vertical) {
                    br = bl = 0;
                } else {
                    tr = br = 0;
                }
            } else if (i == count - 1) {
                if (vertical) {
                    tl = tr = 0;
                } else {
                    tl = bl = 0;
                }
            } else {
                tl = tr = br = bl = 0;
            }
        }
        // CornerRadius::fit_to
        const double reduction = std::min(1.0, std::min(std::min(rect.width() / std::max(tl + tr, 1e-6), rect.width() / std::max(bl + br, 1e-6)),
                                                        std::min(rect.height() / std::max(tl + bl, 1e-6), rect.height() / std::max(tr + br, 1e-6))));
        m_ringShader->setUniform("rect", QVector4D(rect.x(), rect.y(), rect.width(), rect.height()));
        m_ringShader->setUniform("radii", QVector4D(tl * reduction, tr * reduction, br * reduction, bl * reduction));
        setGradient(m_ringShader.get(), 2, g, g.viewRelative ? viewArea : QRectF(frame.x(), frame.y(), frame.width(), frame.height()));
        std::vector<QVector2D> vertices;
        appendQuads(vertices, viewport, deviceRegion, KWin::RectF(rect).adjusted(-1, -1, 1, 1));
        renderBlended(vertices);
    }
    KWin::ShaderManager::instance()->popShader();
}

// a click on a tab of the indicator shows that window
void Effect::clickOnTab(const QPointF &pos)
{
    for (auto it = m_tabHits.constBegin(); it != m_tabHits.constEnd(); ++it) {
        for (int i = 0; i < it->rects.size(); ++i) {
            if (!it->rects[i].contains(pos)) {
                continue;
            }
            // only a tab that is shown: its column is on the current desktop and not minimized
            KWin::EffectWindow *shown = KWin::effects->findWindow(it->windows.first());
            if (!shown || shown->isDeleted() || shown->isMinimized() || !shown->isOnCurrentDesktop() || !shown->isVisible()) {
                continue;
            }
            if (KWin::EffectWindow *target = KWin::effects->findWindow(it->windows[i]); target && target != KWin::effects->activeWindow()) {
                KWin::effects->activateWindow(target);
            }
            return;
        }
    }
}

// niri's focus ring and border (focus_ring.rs, border.frag): the border is a band along the window's rounded frame, the ring a
// band around it (and around the border), both filled with the gradient of the window's state
void Effect::drawRing(const KWin::RenderViewport &viewport, KWin::EffectWindow *w, const KWin::RectF &frame, const KWin::Region &deviceRegion, double opacity)
{
    const Look &look = lookOf(w);
    const bool active = w == m_active;
    const bool urgent = m_urgent.contains(w->internalId());
    // like in niri, the ring goes around the border; a hidden tab right under the active window must not cover its border
    bool border = look.border.enabled && look.border.width > 0;
    if (border && !active && m_active && m_active->frameGeometry() == w->frameGeometry()) {
        border = false;
    }
    const bool ring = active && look.ring.enabled && look.ring.width > 0;
    if (!border && !ring) {
        return;
    }
    const int borderWidth = look.border.enabled ? look.border.width : 0;
    const int ringWidth = ring ? look.ring.width : 0;
    const double reach = borderWidth + ringWidth + 2;
    const KWin::RectF bounds = frame.adjusted(-reach, -reach, reach, reach);
    const double radius = std::min<double>(radiusFor(w), std::min(frame.width(), frame.height()) / 2);
    const QRectF frameF(frame.x(), frame.y(), frame.width(), frame.height());
    QRectF viewArea = frameF;
    if (const auto *output = w->screen()) {
        viewArea = QRectF(output->geometry());
    }

    KWin::ShaderManager::instance()->pushShader(m_ringShader.get());
    m_ringShader->setUniform(KWin::GLShader::Mat4Uniform::ModelViewProjectionMatrix, viewport.projectionMatrix());
    m_ringShader->setUniform("rect", QVector4D(frame.x(), frame.y(), frame.width(), frame.height()));
    m_ringShader->setUniform("radii", QVector4D(radius, radius, radius, radius));
    m_ringShader->setUniform("bands", QVector2D(borderWidth, ringWidth)); // the ring starts where the border ends, shown or not
    m_ringShader->setUniform("layers", QVector3D(border ? 1 : 0, ring ? 1 : 0, 0));
    m_ringShader->setUniform("pixel", float(1.0 / viewport.scale()));
    m_ringShader->setUniform("alpha", float(opacity));
    if (border) {
        const Gradient &g = look.border.colors[urgent ? 2 : (active ? 0 : 1)];
        setGradient(m_ringShader.get(), 0, g, g.viewRelative ? viewArea : frameF.adjusted(-borderWidth, -borderWidth, borderWidth, borderWidth));
    }
    if (ring) {
        const Gradient &g = look.ring.colors[urgent ? 2 : 0];
        const int outer = (border ? borderWidth : 0) + ringWidth;
        setGradient(m_ringShader.get(), 1, g, g.viewRelative ? viewArea : frameF.adjusted(-outer, -outer, outer, outer));
    }
    // only the parts of the ring KWin is repainting right now, so nothing is blended twice
    std::vector<QVector2D> vertices;
    if (KIRI_PAINT().isDebugEnabled()) {
        const auto r = viewport.mapFromDeviceCoordinates(KWin::RectF(deviceRegion.boundingRect()));
        qCDebug(KIRI_PAINT).noquote() << "RING region" << r.x() << r.y() << r.width() << r.height() << "frame" << frame.x() << frame.y() << frame.width() << frame.height()
                                      << "expanded" << w->expandedGeometry().x() << w->expandedGeometry().y() << w->expandedGeometry().width() << w->expandedGeometry().height();
    }
    appendQuads(vertices, viewport, deviceRegion, bounds);
    renderBlended(vertices);
    KWin::ShaderManager::instance()->popShader();
}

// niri's shadow (layout/shadow.rs and shadow.frag): a blurred rounded box under the window, offset and grown by the spread
void Effect::drawShadow(const KWin::RenderViewport &viewport, KWin::EffectWindow *w, const KWin::RectF &frame, const KWin::Region &deviceRegion, double opacity)
{
    const Look &look = lookOf(w);
    const ShadowStyle &sh = look.shadow;
    const bool active = w == m_active;
    // a hidden tab under the active window casts the same shadow again
    if (!sh.on || opacity <= 0 || (!active && m_active && m_active->frameGeometry() == w->frameGeometry())) {
        return;
    }
    const double scale = viewport.scale();
    auto ceilPx = [scale](double v) { return std::ceil(v * scale) / scale; };
    const double sigma = sh.softness / 2; // like CSS box-shadow
    const double width = ceilPx(sigma * 3);
    double offX = ceilPx(sh.offsetX), offY = ceilPx(sh.offsetY);
    const double spread = std::copysign(ceilPx(std::abs(sh.spread)), sh.spread);
    offX -= spread;
    offY -= spread;
    const double radius = std::min<double>(radiusFor(w), std::min(frame.width(), frame.height()) / 2);
    const double boxW = spread >= 0 ? frame.width() + 2 * spread : std::max(0.0, frame.width() - 2 * -spread);
    const double boxH = spread >= 0 ? frame.height() + 2 * spread : std::max(0.0, frame.height() - 2 * -spread);
    const double boxRadius = radius > 0 ? std::max(0.0, radius + spread) : 0.0;
    const QRectF box(frame.x() + offX, frame.y() + offY, boxW, boxH);
    const QRectF bounds = box.adjusted(-width, -width, width, width);
    QColor color = sh.color;
    if (!active) {
        // niri: slightly more transparent by default
        if (sh.hasInactiveColor) {
            color = sh.inactiveColor;
        } else {
            color.setAlphaF(color.alphaF() * 0.75);
        }
    }
    const double alpha = color.alphaF() * opacity;
    if (alpha <= 0) {
        return;
    }

    KWin::ShaderManager::instance()->pushShader(m_shadowShader.get());
    m_shadowShader->setUniform(KWin::GLShader::Mat4Uniform::ModelViewProjectionMatrix, viewport.projectionMatrix());
    m_shadowShader->setUniform("box", QVector4D(box.x(), box.y(), box.width(), box.height()));
    m_shadowShader->setUniform("boxRadius", float(boxRadius));
    m_shadowShader->setUniform("sigma", float(sigma));
    m_shadowShader->setUniform("window", QVector4D(frame.x(), frame.y(), frame.width(), frame.height()));
    m_shadowShader->setUniform("windowRadii", QVector4D(radius, radius, radius, radius));
    m_shadowShader->setUniform("cutout", sh.drawBehindWindow ? 0.0f : 1.0f);
    m_shadowShader->setUniform("color", QVector4D(color.redF() * alpha, color.greenF() * alpha, color.blueF() * alpha, alpha));
    m_shadowShader->setUniform("pixel", float(1.0 / scale));

    std::vector<QVector2D> vertices;
    if (sh.drawBehindWindow) {
        appendQuads(vertices, viewport, deviceRegion, KWin::RectF(bounds));
    } else {
        // not under the window: the shader cuts the rounded frame out, so only the part around the frame (without the
        // part that is surely inside it) has to be shaded
        const double inset = std::ceil(radius) + 1;
        const QRectF inner = QRectF(frame.x(), frame.y(), frame.width(), frame.height()).adjusted(inset, inset, -inset, -inset);
        const QRectF i = inner.intersected(bounds);
        if (inner.width() <= 0 || inner.height() <= 0 || i.isEmpty()) {
            appendQuads(vertices, viewport, deviceRegion, KWin::RectF(bounds));
        } else {
            appendQuads(vertices, viewport, deviceRegion, KWin::RectF(bounds.left(), bounds.top(), bounds.width(), i.top() - bounds.top()));
            appendQuads(vertices, viewport, deviceRegion, KWin::RectF(bounds.left(), i.bottom(), bounds.width(), bounds.bottom() - i.bottom()));
            appendQuads(vertices, viewport, deviceRegion, KWin::RectF(bounds.left(), i.top(), i.left() - bounds.left(), i.height()));
            appendQuads(vertices, viewport, deviceRegion, KWin::RectF(i.right(), i.top(), bounds.right() - i.right(), i.height()));
        }
    }
    renderBlended(vertices);
    KWin::ShaderManager::instance()->popShader();
}

// niri's fullscreen-backdrop-color: a solid rectangle behind a full-screen window, over its whole screen; it fades in with the
// window's expand animation
void Effect::drawBackdrop(const KWin::RenderViewport &viewport, KWin::EffectWindow *w, const KWin::Region &deviceRegion, double opacity)
{
    if (!w->isFullScreen() || !w->screen() || m_settings.fullscreenBackdrop.alphaF() <= 0) {
        return;
    }
    const double progress = expandedProgress(w);
    if (progress > 0) {
        fillRect(viewport, KWin::RectF(w->screen()->geometry()), m_settings.fullscreenBackdrop, deviceRegion, opacity * progress);
    }
}

} // namespace KiriDecorations
