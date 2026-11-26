/*
    Kiri: finds out whether a blur effect will blur a window. License: GPL-3.0-or-later.

    True when the app asked for blur, or Better Blur DX is set to force blur for the window's class (the same match as its
    window_manager.cpp, read from its kwinrc group).
*/
#pragma once

#include <QElapsedTimer>
#include <algorithm>
#include <QList>
#include <QRegularExpression>
#include <QString>
#include <QStringList>
#include <KConfigGroup>
#include <KSharedConfig>
#include <effect/effecthandler.h>
#include <effect/effectwindow.h>
#include <window.h>
#if __has_include(<wayland/surface.h>)
#include <wayland/surface.h>
#define KIRI_SURFACE_BLUR 1
#endif

namespace KWin
{

class BlurMatch
{
public:
    // a blur effect is loaded at all
    static bool anyBlurEffect()
    {
        return effects->isEffectLoaded(QStringLiteral("blur")) || effects->isEffectLoaded(QStringLiteral("better_blur_dx"));
    }

    // the blur effect's strength setting (1 to 15 on a loaded Better Blur DX or KWin's blur), 5 when unknown
    static int strength()
    {
        const bool better = effects->isEffectLoaded(QStringLiteral("better_blur_dx"));
        const auto config = KSharedConfig::openConfig(QStringLiteral("kwinrc"), KConfig::NoGlobals);
        const KConfigGroup group = config->group(better ? QStringLiteral("Effect-better-blur-dx") : QStringLiteral("Effect-blur"));
        return std::clamp(group.readEntry("BlurStrength", 5), 1, 15);
    }

    bool blurs(EffectWindow *w)
    {
        const bool stock = effects->isEffectLoaded(QStringLiteral("blur"));
        const bool better = effects->isEffectLoaded(QStringLiteral("better_blur_dx"));
        if (!stock && !better) {
            return false;
        }
#ifdef KIRI_SURFACE_BLUR
        if (const auto *surface = w->surface(); surface && !surface->blurRegion().isEmpty()) {
            return true;
        }
#endif
        if (!better || !w->window()) {
            return false;
        }
        if (!m_read.isValid() || m_read.elapsed() > 2000) {
            m_read.start();
            const auto config = KSharedConfig::openConfig(QStringLiteral("kwinrc"), KConfig::NoGlobals);
            config->reparseConfiguration();
            const KConfigGroup group = config->group(QStringLiteral("Effect-better-blur-dx"));
            m_classes.clear();
            m_patterns.clear();
            for (const QString &line : group.readEntry("WindowClasses", QStringLiteral("class1\nclass2\nclass3")).split(QLatin1Char('\n'), Qt::SkipEmptyParts)) {
                if (line.length() >= 2 && line.startsWith(QLatin1Char('/')) && line.endsWith(QLatin1Char('/'))) {
                    const QRegularExpression regex(line.sliced(1, line.length() - 2));
                    if (regex.isValid()) {
                        m_patterns.append(regex);
                    }
                } else {
                    m_classes.append(line == QLatin1String("$blank") ? QString() : line);
                }
            }
            m_whitelist = group.readEntry("BlurMatching", true);
        }
        const QString resourceClass = w->window()->resourceClass();
        const QString resourceName = w->window()->resourceName();
        bool matches = m_classes.contains(resourceClass) || m_classes.contains(resourceName);
        for (const QRegularExpression &regex : std::as_const(m_patterns)) {
            matches = matches || regex.match(resourceClass).hasMatch() || regex.match(resourceName).hasMatch();
        }
        return matches == m_whitelist;
    }

private:
    QElapsedTimer m_read;
    QStringList m_classes;
    QList<QRegularExpression> m_patterns;
    bool m_whitelist = true;
};

} // namespace KWin
