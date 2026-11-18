/*
    niri's touchpad swipe maths (GPL-3.0-or-later), ported from niri v26.04:
    src/input/swipe_tracker.rs, src/rubber_band.rs, src/layout/monitor.rs (workspace_switch_gesture_*).
    No Qt, so the same code is checked against niri itself by tools/swipe/ (see there).

    Also here: Unaccelerate, which undoes libinput's touchpad acceleration. niri reads dx_unaccelerated() of
    the libinput swipe event; KWin only passes on the accelerated delta, so the effect has to take it back.
*/
#pragma once

#include "NiriAnim.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <deque>

namespace NiriSwipe
{

// ---- swipe_tracker.rs: times in milliseconds
class SwipeTracker
{
public:
    static constexpr double HistoryLimitMs = 150.0;
    static constexpr double DecelerationTouchpad = 0.997; // per millisecond

    void push(double delta, double timeMs)
    {
        if (!m_history.empty() && timeMs < m_history.back().time) {
            return; // niri ignores events that go back in time
        }
        m_history.push_back({delta, timeMs});
        m_pos += delta;
        while (!m_history.empty() && m_history.back().time > m_history.front().time + HistoryLimitMs) {
            m_history.pop_front();
        }
    }
    double pos() const { return m_pos; }
    // units per second
    double velocity() const
    {
        if (m_history.empty()) {
            return 0.0;
        }
        const double totalTime = (m_history.back().time - m_history.front().time) / 1000.0;
        if (totalTime == 0.0) {
            return 0.0;
        }
        double total = 0.0;
        for (const Event &e : m_history) {
            total += e.delta;
        }
        return total / totalTime;
    }
    double projectedEndPos() const { return m_pos - velocity() / (1000.0 * std::log(DecelerationTouchpad)); }

private:
    struct Event
    {
        double delta;
        double time;
    };
    std::deque<Event> m_history;
    double m_pos = 0.0;
};

// ---- rubber_band.rs
struct RubberBand
{
    double stiffness;
    double limit;

    double band(double x) const { return (1.0 - (1.0 / (x * stiffness / limit + 1.0))) * limit; }
    double derivative(double x) const
    {
        const double d = stiffness * x + limit;
        return stiffness * limit * limit / (d * d);
    }
    double clamp(double min, double max, double x) const
    {
        const double clamped = std::clamp(x, min, max);
        const double sign = x < clamped ? -1.0 : 1.0;
        return clamped + sign * band(std::fabs(x - clamped));
    }
    double clampDerivative(double min, double max, double x) const
    {
        if (min <= x && x <= max) {
            return 1.0;
        }
        return derivative(std::fabs(x - std::clamp(x, min, max)));
    }
};

// ---- monitor.rs: the workspace switch gesture of a touchpad. Positions are fractional workspace indices.
class WorkspaceGesture
{
public:
    static constexpr double Movement = 300.0; // WORKSPACE_GESTURE_MOVEMENT
    static constexpr RubberBand Band{0.5, 0.05};
    static constexpr double Stiffness = NiriAnim::Defaults::workspaceStiffness;

    struct Release
    {
        int target;
        double from;
        double velocity; // workspaces per second
    };

    // `movement`: the delta that is one workspace. A touchpad swipe uses the constant; a pointer drag (niri: not
    // is_touchpad) the height of a workspace
    void begin(int centerIdx, double currentIdx, int count, double movement = Movement)
    {
        m_movement = movement;
        m_tracker = SwipeTracker();
        m_center = centerIdx;
        m_start = currentIdx;
        m_current = currentIdx;
        m_count = count;
    }
    // delta in touchpad units, positive towards the next workspace
    double update(double delta, double timeMs)
    {
        m_tracker.push(delta, timeMs);
        m_current = Band.clamp(min(), max(), m_start + m_tracker.pos() / m_movement);
        return m_current;
    }
    double current() const { return m_current; }
    Release end(double timeMs)
    {
        m_tracker.push(0.0, timeMs);
        double velocity = m_tracker.velocity() / m_movement;
        const double currentPos = m_tracker.pos() / m_movement;
        const double pos = m_tracker.projectedEndPos() / m_movement;
        const double idx = std::clamp(m_start + pos, min(), max());
        velocity *= Band.clampDerivative(min(), max(), m_start + currentPos);
        return {int(std::lround(idx)), m_current, velocity};
    }

private:
    double min() const { return std::max(m_center - 1, 0); }
    double max() const { return std::min(m_center + 1, m_count - 1); }
    SwipeTracker m_tracker;
    double m_movement = Movement;
    int m_center = 0;
    double m_start = 0.0;
    double m_current = 0.0;
    int m_count = 1;
};

// ---- libinput's touchpad acceleration (src/filter-touchpad.c), undone.
// A normalized touchpad delta ("unit") is 1/10.516 mm of finger travel: libinput scales device units to
// 1000 dpi and then by TP_MAGIC_SLOWDOWN (0.2968) and the 0.9 baseline.
// The accelerated delta is the unaccelerated one times factor(speed) / 0.9, with the speed in mm/s of the
// finger. This takes the speed from the last few events (libinput averages its velocity over a few events
// too) and solves delta_accel = delta_unaccel * ratio(speed(delta_unaccel)) for delta_unaccel.
// Follows the touchpad's configuration (setProfile): the adaptive profile is scaled by libinput's speed factor
// pow(speed + 1, 2.38) * 0.95 + 0.05. With the flat profile libinput's "unaccelerated" delta is the very same
// constant-factor delta as the accelerated one (filter-touchpad-flat.c, accelerator_filter_constant_touchpad_flat:
// "gestures end up having the same movement as pointer motion"), so there is nothing to undo, whatever the speed.
class Unaccelerate
{
public:
    static constexpr double UnitsPerMm = 10.516;

    static double ratio(double mmPerSec)
    {
        constexpr double threshold = 130.0, baseline = 0.9;
        double factor;
        if (mmPerSec < 7.0) {
            factor = std::min(baseline, 0.1 * mmPerSec + 0.3);
        } else if (mmPerSec < threshold) {
            factor = baseline;
        } else {
            const double v = std::min(mmPerSec, threshold * 4.0);
            factor = 0.0025 * (v / threshold) * (v - threshold) + baseline;
        }
        return factor / baseline;
    }

    static double speedFactor(double speed) { return std::pow(speed + 1.0, 2.38) * 0.95 + 0.05; }

    // the touchpad's acceleration profile and speed setting (-1 to 1)
    void setProfile(bool flat, double speed)
    {
        m_flat = flat;
        m_speedFactor = speedFactor(std::clamp(speed, -1.0, 1.0));
    }
    void setEnabled(bool on) { m_enabled = on; }
    void reset()
    {
        m_events.clear();
    }

    // accelerated delta of an event at timeMs -> unaccelerated
    void apply(double ax, double ay, double timeMs, double &ux, double &uy)
    {
        ux = ax;
        uy = ay;
        const double a = std::hypot(ax, ay);
        if (!m_enabled || m_flat || a == 0.0) {
            record(0.0, timeMs);
            return;
        }
        // distance and time span of the events in the averaging window, the current one included
        double dist = 0.0;
        double t0 = m_events.empty() ? timeMs - DefaultIntervalMs : m_events.back().time;
        int n = 0;
        for (auto it = m_events.rbegin(); it != m_events.rend() && n < Window - 1; ++it, ++n) {
            dist += it->dist;
            t0 = it->prevTime;
        }
        const double span = std::max(timeMs - t0, 1.0);
        // bisection on |u|: g(u) = u * ratio(speed(u)) increases with u
        auto g = [&](double u) { return u * ratio((dist + u) / UnitsPerMm / (span / 1000.0)) * m_speedFactor; };
        double lo = a / (5.5 * m_speedFactor), hi = a / (0.32 * m_speedFactor);
        for (int i = 0; i < 50; i++) {
            const double mid = 0.5 * (lo + hi);
            (g(mid) < a ? lo : hi) = mid;
        }
        const double u = 0.5 * (lo + hi);
        ux = ax * u / a;
        uy = ay * u / a;
        record(u, timeMs);
    }

private:
    static constexpr int Window = 2;
    static constexpr double DefaultIntervalMs = 8.0;
    struct Ev
    {
        double dist;
        double time;
        double prevTime;
    };
    void record(double u, double timeMs)
    {
        const double prev = m_events.empty() ? timeMs - DefaultIntervalMs : m_events.back().time;
        if (timeMs - prev > 200.0) {
            m_events.clear();
        }
        m_events.push_back({u, timeMs, m_events.empty() ? timeMs - DefaultIntervalMs : prev});
        if (m_events.size() > 16) {
            m_events.pop_front();
        }
    }
    bool m_enabled = true;
    bool m_flat = false;
    double m_speedFactor = 1.0;
    std::deque<Ev> m_events;
};

} // namespace NiriSwipe
