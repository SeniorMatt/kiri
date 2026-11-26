/*
    niri's Mod+middle-button drag (input/spatial_movement_grab.rs), the part that two effects share. License: GPL-3.0-or-later.

    Mod is the modifier of Plasma's window actions ([MouseBindings] CommandAllKey, Meta unless the user changed it), the same
    one that makes Mod+left drag move a window. A drag that goes horizontally scrolls the view (kiri_swipe), one that goes
    vertically switches the workspace (kiri_desktop_switch); the axis is chosen after 8 px of travel, like niri.
*/
#pragma once

#include <KConfigGroup>
#include <KSharedConfig>

#include <QRegularExpression>
#include <QString>
#include <Qt>

#include <effect/effecthandler.h>

namespace PointerGrab
{

// niri: "Threshold copied from GTK 4."
static constexpr double AxisLockDistance = 8.0;

inline Qt::KeyboardModifier modifier()
{
    auto config = KSharedConfig::openConfig(QStringLiteral("kwinrc"));
    config->reparseConfiguration();
    const QString name = config->group(QStringLiteral("MouseBindings")).readEntry("CommandAllKey", QStringLiteral("Meta"));
    if (name == QLatin1String("Alt")) {
        return Qt::AltModifier;
    }
    return Qt::MetaModifier;
}

// niri checks the binds first: Mod+MouseMiddle bound to something wins over the drag (kiri's `pointerBinds` setting)
inline bool middleIsBound(Qt::KeyboardModifier mod)
{
    auto config = KSharedConfig::openConfig(QStringLiteral("kwinrc"));
    const QString binds = config->group(QStringLiteral("Script-kiri")).readEntry("pointerBinds", QString());
    for (const QString &entry : binds.split(QRegularExpression(QStringLiteral("[;\r\n]")), Qt::SkipEmptyParts)) {
        const int equals = entry.indexOf(QLatin1Char('='));
        if (equals < 0) {
            continue;
        }
        QStringList keys = entry.left(equals).trimmed().split(QLatin1Char('+'));
        if (keys.takeLast().trimmed() != QLatin1String("MouseMiddle")) {
            continue;
        }
        Qt::KeyboardModifiers modifiers;
        for (const QString &key : std::as_const(keys)) {
            if (key == QLatin1String("Meta")) {
                modifiers |= Qt::MetaModifier;
            } else if (key == QLatin1String("Alt")) {
                modifiers |= Qt::AltModifier;
            } else if (key == QLatin1String("Ctrl")) {
                modifiers |= Qt::ControlModifier;
            } else if (key == QLatin1String("Shift")) {
                modifiers |= Qt::ShiftModifier;
            }
        }
        if (modifiers.testFlag(mod)) {
            return true;
        }
    }
    return false;
}

// kiri's `middleDragScroll` setting (kwinrc [Script-kiri], default on): off gives Mod+middle back to Plasma's window actions
inline bool enabled()
{
    auto config = KSharedConfig::openConfig(QStringLiteral("kwinrc"));
    config->reparseConfiguration();
    return config->group(QStringLiteral("Script-kiri")).readEntry("middleDragScroll", true);
}

// the name of what Plasma does on Mod+middle click ([MouseBindings] CommandAll2)
inline QString clickCommand()
{
    auto config = KSharedConfig::openConfig(QStringLiteral("kwinrc"));
    return config->group(QStringLiteral("MouseBindings")).readEntry("CommandAll2", QStringLiteral("Toggle raise and lower")).toLower();
}

// niri starts it when no grab is going (a window being moved or resized is one) and the overview, the screenshot UI and
// the lock screen are not up
inline bool mayStart(Qt::KeyboardModifiers modifiers)
{
    const Qt::KeyboardModifier mod = modifier();
    if (!modifiers.testFlag(mod) || KWin::effects->isScreenLocked() || !enabled()) {
        return false;
    }
    if (KWin::effects->hasActiveFullScreenEffect()) {
        const KWin::Effect *active = KWin::effects->activeFullScreenEffect();
        if (active && QString::fromLatin1(active->metaObject()->className()).contains(QLatin1String("Overview"))) {
            return false;
        }
    }
    for (KWin::EffectWindow *w : KWin::effects->stackingOrder()) {
        if (w->isUserMove() || w->isUserResize()) {
            return false;
        }
    }
    return !middleIsBound(mod);
}

} // namespace PointerGrab
