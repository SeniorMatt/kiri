/*
    niri's animation maths, ported from niri (GPL-3.0-or-later): src/animation/{mod,spring}.rs.
    The spring is the closed-form damped oscillator (based on libadwaita's AdwSpringAnimation, LGPL-2.1-or-later),
    so a value only depends on the time since the start, exactly like in niri.
*/
#pragma once

#include <algorithm>
#include <cmath>
#include <limits>

namespace NiriAnim
{

// niri's defaults (niri-config/src/animations.rs)
struct Defaults
{
    // window-movement, window-resize, horizontal-view-movement: spring 1.0 / 800 / 0.0001
    static constexpr double moveDamping = 1.0, moveStiffness = 800, moveEpsilon = 0.0001;
    static constexpr double resizeDamping = 1.0, resizeStiffness = 800, resizeEpsilon = 0.0001;
    // workspace-switch: spring 1.0 / 1000 / 0.0001
    static constexpr double workspaceDamping = 1.0, workspaceStiffness = 1000, workspaceEpsilon = 0.0001;
    // window-open: 150 ms ease-out-expo, window-close: 150 ms ease-out-quad
    static constexpr double openMs = 150, closeMs = 150;
};

inline double easeOutExpo(double x)
{
    return 1.0 - std::pow(2.0, -10.0 * x);
}
inline double easeOutQuad(double x)
{
    return 1.0 - (1.0 - x) * (1.0 - x);
}
inline double easeOutCubic(double x)
{
    const double u = 1.0 - x;
    return 1.0 - u * u * u;
}

class Spring
{
public:
    Spring() = default;
    Spring(double from, double to, double initialVelocity, double dampingRatio, double stiffness, double epsilon)
        : m_from(from)
        , m_to(to)
        , m_v0(initialVelocity)
        , m_damping(std::max(dampingRatio, 0.0) * 2.0 * std::sqrt(std::max(stiffness, 0.0)))
        , m_stiffness(std::max(stiffness, 0.0))
        , m_epsilon(std::max(epsilon, 0.0))
    {
        m_duration = computeDuration();
        m_clampedDuration = computeClampedDuration();
    }

    // seconds until the spring is at rest
    double duration() const { return m_duration; }
    // seconds until the spring first reaches its target
    double clampedDuration() const { return m_clampedDuration; }
    double to() const { return m_to; }
    double from() const { return m_from; }

    // like niri's Animation::value_at / clamped_value, t in seconds since the start
    double value(double t) const
    {
        if (t <= 0) {
            return m_from;
        }
        if (t >= m_duration) {
            return m_to;
        }
        return oscillate(t);
    }
    double clampedValue(double t) const
    {
        if (t >= m_clampedDuration) {
            return m_to;
        }
        return value(t);
    }
    bool isDone(double t) const { return t >= m_duration; }

private:
    double oscillate(double t) const
    {
        const double m = 1.0;
        const double beta = m_damping / (2.0 * m);
        const double omega0 = std::sqrt(m_stiffness / m);
        const double x0 = m_from - m_to;
        const double envelope = std::exp(-beta * t);
        if (std::fabs(beta - omega0) <= double(std::numeric_limits<float>::epsilon())) {
            return m_to + envelope * (x0 + (beta * x0 + m_v0) * t);
        } else if (beta < omega0) {
            const double omega1 = std::sqrt(omega0 * omega0 - beta * beta);
            return m_to + envelope * (x0 * std::cos(omega1 * t) + ((beta * x0 + m_v0) / omega1) * std::sin(omega1 * t));
        }
        const double omega2 = std::sqrt(beta * beta - omega0 * omega0);
        return m_to + envelope * (x0 * std::cosh(omega2 * t) + ((beta * x0 + m_v0) / omega2) * std::sinh(omega2 * t));
    }

    double computeDuration() const
    {
        const double delta = 0.001;
        const double beta = m_damping / 2.0;
        if (std::fabs(beta) <= std::numeric_limits<double>::epsilon() || beta < 0) {
            return std::numeric_limits<double>::infinity();
        }
        if (std::fabs(m_to - m_from) <= std::numeric_limits<double>::epsilon()) {
            return 0;
        }
        const double omega0 = std::sqrt(m_stiffness);
        double x0 = -std::log(m_epsilon) / beta;
        if (std::fabs(beta - omega0) <= double(std::numeric_limits<float>::epsilon()) || beta < omega0) {
            return x0;
        }
        double y0 = oscillate(x0);
        double m = (oscillate(x0 + delta) - y0) / delta;
        double x1 = (m_to - y0 + m * x0) / m;
        double y1 = oscillate(x1);
        int i = 0;
        while (std::fabs(m_to - y1) > m_epsilon) {
            if (i > 1000) {
                return 0;
            }
            x0 = x1;
            y0 = y1;
            m = (oscillate(x0 + delta) - y0) / delta;
            x1 = (m_to - y0 + m * x0) / m;
            y1 = oscillate(x1);
            if (!std::isfinite(y1)) {
                return x0;
            }
            ++i;
        }
        return x1;
    }

    double computeClampedDuration() const
    {
        const double beta = m_damping / 2.0;
        if (std::fabs(beta) <= std::numeric_limits<double>::epsilon() || beta < 0) {
            return std::numeric_limits<double>::infinity();
        }
        if (std::fabs(m_to - m_from) <= std::numeric_limits<double>::epsilon()) {
            return 0;
        }
        int i = 1;
        double y = oscillate(i / 1000.0);
        const double eps = std::numeric_limits<double>::epsilon();
        while ((m_to - m_from > eps && m_to - y > m_epsilon) || (m_from - m_to > eps && y - m_to > m_epsilon)) {
            if (i > 3000) {
                return m_duration;
            }
            ++i;
            y = oscillate(i / 1000.0);
        }
        return i / 1000.0;
    }

    double m_from = 0, m_to = 0, m_v0 = 0;
    double m_damping = 0, m_stiffness = 0, m_epsilon = 0;
    double m_duration = 0, m_clampedDuration = 0;
};

// niri's spring animation with its default parameters for moving (1 -> 0 offset multiplier) and resizing (0 -> 1 progress)
inline const Spring &moveSpring()
{
    static const Spring s(1.0, 0.0, 0.0, Defaults::moveDamping, Defaults::moveStiffness, Defaults::moveEpsilon);
    return s;
}
inline const Spring &resizeSpring()
{
    static const Spring s(0.0, 1.0, 0.0, Defaults::resizeDamping, Defaults::resizeStiffness, Defaults::resizeEpsilon);
    return s;
}

} // namespace NiriAnim
