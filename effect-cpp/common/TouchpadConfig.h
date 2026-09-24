/*
    The touchpad settings the swipe effects need, read from KWin's libinput device (a QObject whose Q_PROPERTYs
    are the settings, see Plasma's touchpad page). Read at the start of every swipe, so a changed setting
    applies to the next one.
*/
#pragma once

#include "core/inputdevice.h"
#include "input.h"

#include <QVariant>

namespace KWin
{

struct TouchpadConfig
{
    bool flat = false;       // acceleration profile
    double speed = 0.0;      // -1 .. 1
    bool natural = false;    // natural scrolling; niri inverts the swipe delta when it is on

    static TouchpadConfig read()
    {
        TouchpadConfig c;
        for (InputDevice *device : input()->devices()) {
            if (!device->isTouchpad()) {
                continue;
            }
            const QVariant flat = device->property("pointerAccelerationProfileFlat");
            const QVariant speed = device->property("pointerAcceleration");
            const QVariant natural = device->property("naturalScroll");
            if (flat.isValid()) {
                c.flat = flat.toBool();
            }
            if (speed.isValid()) {
                c.speed = speed.toDouble();
            }
            if (natural.isValid()) {
                c.natural = natural.toBool();
            }
            break;
        }
        return c;
    }
};

} // namespace KWin
