/*
    Kiri touchpad swipe plugin entry. License: GPL-3.0-or-later.
*/
#include "SwipeEffect.h"

namespace KWin
{

KWIN_EFFECT_FACTORY_SUPPORTED(SwipeEffect,
                              "metadata.json",
                              return true;)

} // namespace KWin

#include "main.moc"
