// The Plasma accent colour, shared by the effects.
#pragma once
#include <KConfigGroup>
#include <KSharedConfig>
#include <QColor>
#include <QGuiApplication>
#include <QPalette>
#include <QString>

namespace PlasmaAccent
{
// the accent colour picked in System Settings; without one, the colour scheme's highlight colour
inline QColor load()
{
    auto config = KSharedConfig::openConfig(QStringLiteral("kdeglobals"));
    config->reparseConfiguration();
    QColor c = config->group(QStringLiteral("General")).readEntry("AccentColor", QColor());
    if (!c.isValid()) {
        c = config->group(QStringLiteral("Colors:Selection")).readEntry("BackgroundNormal", QColor());
    }
    return c.isValid() ? c : QGuiApplication::palette().highlight().color();
}

// the kdeglobals groups whose change can mean a new accent. The Colors settings page writes AccentColor and the
// Colors:* groups without notifying, then notifies only KDE, WM and ColorEffects:*, so those count too.
inline bool isAccentGroup(const QString &name)
{
    return name == QLatin1String("General") || name == QLatin1String("KDE") || name == QLatin1String("WM")
        || name.startsWith(QLatin1String("Colors:")) || name.startsWith(QLatin1String("ColorEffects:"));
}
}
