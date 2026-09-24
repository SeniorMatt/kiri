/*
    Kiri overview plugin entry. License: GPL-3.0-or-later.
*/
#include "OverviewEffect.h"

namespace KWin
{

KWIN_EFFECT_FACTORY_SUPPORTED(OverviewEffect,
                              "metadata.json",
                              return true;)

} // namespace KWin

#include "main.moc"
