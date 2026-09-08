/*
    Kiri desktop switch plugin entry. License: GPL-3.0-or-later.
*/

#include "DesktopSwitchEffect.h"

namespace KWin
{

KWIN_EFFECT_FACTORY_SUPPORTED(DesktopSwitchEffect,
                              "metadata.json",
                              return DesktopSwitchEffect::supported();)

} // namespace KWin

#include "main.moc"
