/*
    Kiri decorations: rounded window corners, focus ring and borders painted with the window.
    See DecorationsEffect.h for credits. License: GPL-3.0-or-later.
*/

#include "DecorationsEffect.h"

#include <core/output.h>
#include <core/pixelgrid.h>
#include <core/renderviewport.h>
#include <effect/effecthandler.h>
#include <effect/effectwindow.h>
#include <opengl/glshader.h>
#include <opengl/glshadermanager.h>
#include <opengl/glutils.h>

#include <KConfigGroup>
#include <KSharedConfig>

#include <QLoggingCategory>
#include <QStandardPaths>
#include <QVector2D>

#include <epoxy/gl.h>

Q_LOGGING_CATEGORY(KIRI_DECO, "kiri.decorations", QtWarningMsg)

namespace KiriDecorations
{

namespace
{
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
    connect(KWin::effects, &KWin::EffectsHandler::windowFrameGeometryChanged, this, [this](KWin::EffectWindow *w, const KWin::RectF &old) {
        // the ring is outside of what KWin repaints for the window itself
        const int reach = m_settings.borderWidth + m_settings.ringWidth + 2;
        KWin::effects->addRepaint(old.adjusted(-reach, -reach, reach, reach));
        repaintAround(w);
    });
    connect(KWin::effects, &KWin::EffectsHandler::windowClosed, this, [this](KWin::EffectWindow *w) {
        if (m_active == w) {
            m_active = nullptr;
        }
    });
}

Effect::~Effect() = default;

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
    m_settings = s;
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
    if (!isActive() || w->isDeleted() || w->isFullScreen() || w->isSpecialWindow()) {
        return false;
    }
    if (!(w->isNormalWindow() || w->isDialog())) {
        return false;
    }
    if (w->caption().startsWith(QLatin1String("kiri-ring-"))) {
        return false; // the fallback ring windows of the Kiri script
    }
    // a window that fills its screen (maximized, or Kiri's "maximized in grid" without gaps) has no corners to show
    if (const auto *output = w->screen()) {
        const KWin::RectF screen = output->geometry();
        const KWin::RectF frame = w->frameGeometry();
        if (frame.width() >= screen.width() - 0.5 && frame.height() >= screen.height() - 0.5) {
            return false;
        }
    }
    return true;
}

int Effect::radiusFor(KWin::EffectWindow *w) const
{
    return decorated(w) ? m_settings.cornerRadius : 0;
}

KWin::RectF Effect::outerBounds(KWin::EffectWindow *w) const
{
    const int reach = m_settings.borderWidth + m_settings.ringWidth + 2;
    return w->frameGeometry().adjusted(-reach, -reach, reach, reach);
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
    OffscreenEffect::prePaintWindow(view, w, data);
}

bool Effect::drawWindow(const KWin::RenderTarget &renderTarget, const KWin::RenderViewport &viewport, KWin::EffectWindow *w, int mask, const KWin::Region &deviceRegion, KWin::WindowPaintData &data)
{
    const int radius = radiusFor(w);
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

    const bool result = OffscreenEffect::drawWindow(renderTarget, viewport, w, mask, deviceRegion, data);

    if (decorated(w) && ((m_settings.borderEnabled && m_settings.borderWidth > 0) || (w == m_active && m_settings.ringEnabled && m_settings.ringWidth > 0))) {
        // where the window really is painted right now, other effects may be moving or scaling it
        const KWin::RectF frame = w->frameGeometry();
        const KWin::RectF visual(frame.x() + data.xTranslation(), frame.y() + data.yTranslation(),
                                 frame.width() * data.xScale(), frame.height() * data.yScale());
        drawRing(viewport, w, visual, deviceRegion, data.opacity());
    }
    return result;
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
