// Plasma 6.7's "Switch desktops independently for each screen" (kwinrc [Desktops] PerOutputVirtualDesktops).
// Off: every desktop switch moves all screens, as always. On: a switch moves only one screen, like niri's
// per-monitor workspaces.
#pragma once
#include "effect/effecthandler.h"
#include "virtualdesktops.h"
#include <QPoint>

namespace KWin
{
namespace PerScreen
{

inline bool enabled()
{
    const VirtualDesktopManager *manager = VirtualDesktopManager::self();
    return manager && manager->isPerOutputVirtualDesktops();
}

// the screen a workspace gesture acts on: niri uses the output under the pointer; without per-screen desktops it
// stays the active screen
inline LogicalOutput *gestureOutput()
{
    if (enabled()) {
        if (LogicalOutput *output = effects->screenAt(effects->cursorPos().toPoint())) {
            return output;
        }
    }
    return effects->activeScreen();
}

} // namespace PerScreen
} // namespace KWin
