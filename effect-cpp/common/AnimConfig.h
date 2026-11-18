/*
    niri's `animations` block, as Kiri's settings keep it ([Script-kiri] in kwinrc, see src/lib/config/definition.ts):
    animationsOff, animationsSlowdown and one animation* text per animation (the format is in NiriAnim.h, Spec).
    Every effect plugin loads them into its own copy of NiriAnim::config() and reloads when kwinrc changes.
    License: GPL-3.0-or-later.
*/
#pragma once

#include "NiriAnim.h"

#include <KConfigGroup>
#include <KConfigWatcher>
#include <KSharedConfig>

#include <QObject>
#include <effect/effecthandler.h>

#include <functional>

namespace NiriAnim
{

inline void load()
{
    auto file = KSharedConfig::openConfig(QStringLiteral("kwinrc"));
    file->reparseConfiguration();
    const KConfigGroup g = file->group(QStringLiteral("Script-kiri"));
    static const Config defaults;
    Config &c = config();
    auto spec = [&g](const char *key, const Spec &fallback) {
        return Spec::parse(g.readEntry(key, QString()).toStdString(), fallback);
    };
    c.off = g.readEntry("animationsOff", false);
    c.slowdown = std::clamp(g.readEntry("animationsSlowdown", 1.0), 0.0, 1000.0);
    c.windowOpen = spec("animWindowOpen", defaults.windowOpen);
    c.windowClose = spec("animWindowClose", defaults.windowClose);
    c.horizontalViewMovement = spec("animHorizontalViewMovement", defaults.horizontalViewMovement);
    c.windowMovement = spec("animWindowMovement", defaults.windowMovement);
    c.windowResize = spec("animWindowResize", defaults.windowResize);
    c.workspaceSwitch = spec("animWorkspaceSwitch", defaults.workspaceSwitch);
    c.overviewOpenClose = spec("animOverviewOpenClose", defaults.overviewOpenClose);
    c.rebuild();
}

// Loads the settings now and again whenever they change; `changed` runs after a reload. Keep the result alive.
inline KConfigWatcher::Ptr watch(QObject *parent, std::function<void()> changed = {})
{
    load();
    KConfigWatcher::Ptr watcher = KConfigWatcher::create(KSharedConfig::openConfig(QStringLiteral("kwinrc")));
    QObject::connect(watcher.data(), &KConfigWatcher::configChanged, parent, [changed](const KConfigGroup &group) {
        if (group.name() == QLatin1String("Script-kiri")) {
            load();
            if (changed) {
                changed();
            }
        }
    });
    return watcher;
}

// the divisor of time for every animation: KWin's own animation speed times niri's slowdown; 0 when animations are off
inline double timeFactor()
{
    const double factor = KWin::effects->animationTimeFactor();
    const double scale = config().timeScale();
    return (factor <= 0 || scale <= 0) ? 0.0 : factor / scale;
}

} // namespace NiriAnim
