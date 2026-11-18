/*
    niri's animation maths, ported from niri (GPL-3.0-or-later): src/animation/{mod,spring}.rs.
    The spring is the closed-form damped oscillator (based on libadwaita's AdwSpringAnimation, LGPL-2.1-or-later),
    so a value only depends on the time since the start, exactly like in niri.
*/
#pragma once

#include <algorithm>
#include <cmath>
#include <limits>
#include <sstream>
#include <string>
#include <vector>

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

// niri's easing curves (niri-config Curve, src/animation/{mod,bezier}.rs)
struct Curve
{
    enum class Kind { Linear, EaseOutQuad, EaseOutCubic, EaseOutExpo, CubicBezier };
    Kind kind = Kind::EaseOutCubic;
    double x1 = 0, y1 = 0, x2 = 0, y2 = 0;

    double y(double x) const
    {
        x = std::clamp(x, 0.0, 1.0);
        switch (kind) {
        case Kind::Linear:
            return x;
        case Kind::EaseOutQuad:
            return easeOutQuad(x);
        case Kind::EaseOutCubic:
            return easeOutCubic(x);
        case Kind::EaseOutExpo:
            return easeOutExpo(x);
        case Kind::CubicBezier:
            return bezier(x);
        }
        return x;
    }

private:
    // based on libadwaita, like niri's bezier.rs
    static double point(double t, double a, double b)
    {
        const double omt = 1.0 - t;
        return 3.0 * omt * omt * t * a + 3.0 * omt * t * t * b + t * t * t;
    }
    double bezier(double x) const
    {
        if (x <= std::numeric_limits<double>::epsilon()) {
            return 0.0;
        }
        if (1.0 - std::numeric_limits<double>::epsilon() <= x) {
            return 1.0;
        }
        double lo = 0.0, hi = 1.0;
        for (int i = 0; i <= 30; i++) {
            const double guess = (lo + hi) / 2.0;
            if (x < point(guess, x1, x2)) {
                hi = guess;
            } else {
                lo = guess;
            }
        }
        return point((lo + hi) / 2.0, y1, y2);
    }
};

// One animation as niri's config describes it (`off`, `spring ...`, or `duration-ms` and `curve`), from `from` to `to`.
// The same calls as Spring has, so that the effects take either. Times are seconds since the start.
class Anim
{
public:
    Anim() = default;
    static Anim off(double from, double to)
    {
        Anim a;
        a.m_off = true;
        a.m_from = from;
        a.m_to = to;
        return a;
    }
    static Anim spring(double from, double to, double initialVelocity, double dampingRatio, double stiffness, double epsilon)
    {
        Anim a;
        a.m_spring = Spring(from, to, initialVelocity, dampingRatio, stiffness, epsilon);
        a.m_isSpring = true;
        a.m_from = from;
        a.m_to = to;
        return a;
    }
    static Anim easing(double from, double to, double durationMs, const Curve &curve)
    {
        Anim a;
        a.m_curve = curve;
        a.m_duration = std::max(durationMs, 0.0) / 1000.0;
        a.m_from = from;
        a.m_to = to;
        return a;
    }

    bool isOff() const { return m_off; }
    double duration() const { return m_off ? 0.0 : (m_isSpring ? m_spring.duration() : m_duration); }
    // like niri's Animation::value_at / clamped_value
    double value(double t) const
    {
        if (m_off) {
            return t <= 0 ? m_from : m_to;
        }
        if (m_isSpring) {
            return m_spring.value(t);
        }
        if (t <= 0) {
            return m_from;
        }
        if (t >= m_duration) {
            return m_to; // niri: after the duration the animation is at its target, whatever the curve gives at 1
        }
        return m_curve.y(t / m_duration) * (m_to - m_from) + m_from;
    }
    double clampedValue(double t) const { return m_isSpring ? m_spring.clampedValue(t) : value(t); }
    bool isDone(double t) const { return m_off || (m_isSpring ? m_spring.isDone(t) : t >= m_duration); }
    double from() const { return m_from; }
    double to() const { return m_to; }

private:
    bool m_off = false;
    bool m_isSpring = false;
    Spring m_spring;
    Curve m_curve;
    double m_duration = 0;
    double m_from = 0, m_to = 0;
};

// One animation setting, as Kiri's config keeps it (the text that tools/niri2kiri.py and the importer write):
//   "off"
//   "spring <damping-ratio> <stiffness> <epsilon>"
//   "<linear|ease-out-quad|ease-out-cubic|ease-out-expo> <duration-ms>"
//   "cubic-bezier <duration-ms> <x1> <y1> <x2> <y2>"
struct Spec
{
    enum class Kind { Off, Spring, Easing };
    Kind kind = Kind::Spring;
    double damping = 1.0, stiffness = 800, epsilon = 0.0001;
    double ms = 150;
    Curve curve;

    static Spec springSpec(double damping, double stiffness, double epsilon)
    {
        Spec s;
        s.kind = Kind::Spring;
        s.damping = damping;
        s.stiffness = stiffness;
        s.epsilon = epsilon;
        return s;
    }
    static Spec easingSpec(Curve::Kind curve, double ms)
    {
        Spec s;
        s.kind = Kind::Easing;
        s.curve.kind = curve;
        s.ms = ms;
        return s;
    }

    // a text that is not understood leaves `fallback`
    static Spec parse(const std::string &text, const Spec &fallback)
    {
        std::istringstream in(text);
        std::string word;
        if (!(in >> word)) {
            return fallback;
        }
        Spec s = fallback;
        std::vector<double> n;
        double v;
        while (in >> v) {
            n.push_back(v);
        }
        if (word == "off") {
            s.kind = Kind::Off;
        } else if (word == "spring" && n.size() == 3) {
            // niri: damping-ratio 0.1 to 10, stiffness at least 1, epsilon 0.00001 to 0.1
            s = springSpec(std::clamp(n[0], 0.1, 10.0), std::max(n[1], 1.0), std::clamp(n[2], 0.00001, 0.1));
        } else if (word == "cubic-bezier" && n.size() == 5) {
            s.kind = Kind::Easing;
            s.ms = std::max(n[0], 0.0);
            s.curve = Curve{Curve::Kind::CubicBezier, std::clamp(n[1], 0.0, 1.0), n[2], std::clamp(n[3], 0.0, 1.0), n[4]};
        } else if (n.size() == 1 && (word == "linear" || word == "ease-out-quad" || word == "ease-out-cubic" || word == "ease-out-expo")) {
            s.kind = Kind::Easing;
            s.ms = std::max(n[0], 0.0);
            s.curve.kind = word == "linear" ? Curve::Kind::Linear : word == "ease-out-quad" ? Curve::Kind::EaseOutQuad : word == "ease-out-cubic" ? Curve::Kind::EaseOutCubic : Curve::Kind::EaseOutExpo;
        }
        return s;
    }

    // `timeFactor` stretches the time (KWin's animation speed setting, niri's slowdown): a spring gets 1 / factor^2 of its
    // stiffness and the velocity per second shrinks with it, an easing lasts factor times as long
    Anim make(double from, double to, double initialVelocity = 0.0, double timeFactor = 1.0) const
    {
        switch (kind) {
        case Kind::Off:
            return Anim::off(from, to);
        case Kind::Spring:
            return Anim::spring(from, to, initialVelocity / timeFactor, damping, stiffness / (timeFactor * timeFactor), epsilon);
        case Kind::Easing:
            return Anim::easing(from, to, ms * timeFactor, curve);
        }
        return Anim::off(from, to);
    }
};

// The `animations` block, per effect plugin (every plugin has its own copy and loads it from kwinrc, see AnimConfig.h)
struct Config
{
    bool off = false;       // niri: animations { off }
    double slowdown = 1.0;  // niri: animations { slowdown N }
    Spec windowOpen = Spec::easingSpec(Curve::Kind::EaseOutExpo, Defaults::openMs);
    Spec windowClose = Spec::easingSpec(Curve::Kind::EaseOutQuad, Defaults::closeMs);
    Spec horizontalViewMovement = Spec::springSpec(1.0, 800, 0.0001);
    Spec windowMovement = Spec::springSpec(Defaults::moveDamping, Defaults::moveStiffness, Defaults::moveEpsilon);
    Spec windowResize = Spec::springSpec(Defaults::resizeDamping, Defaults::resizeStiffness, Defaults::resizeEpsilon);
    Spec workspaceSwitch = Spec::springSpec(Defaults::workspaceDamping, Defaults::workspaceStiffness, Defaults::workspaceEpsilon);
    Spec overviewOpenClose = Spec::springSpec(1.0, 800, 0.0001);

    // the clock rate niri gives every animation: 1 / slowdown, and no time at all when they are off
    double timeScale() const { return off ? 0.0 : 1.0 / std::max(slowdown, 0.001); }

    // built once per change of the settings (a spring works out its duration with a loop)
    Anim move;      // window-movement, offset multiplier 1 -> 0
    Anim viewMove;  // horizontal-view-movement, the same
    Anim resize;    // window-resize, 0 -> 1
    Anim open;      // window-open, 0 -> 1
    Anim close;     // window-close, 0 -> 1
    void rebuild()
    {
        open = windowOpen.make(0.0, 1.0);
        close = windowClose.make(0.0, 1.0);
        move = windowMovement.make(1.0, 0.0);
        viewMove = horizontalViewMovement.make(1.0, 0.0);
        resize = windowResize.make(0.0, 1.0);
    }
    Config() { rebuild(); }
};

inline Config &config()
{
    static Config c;
    return c;
}

// niri's animations for moving (offset multiplier 1 -> 0), for the view moving, and for resizing (0 -> 1)
inline const Anim &moveSpring() { return config().move; }
inline const Anim &viewMoveSpring() { return config().viewMove; }
inline const Anim &resizeSpring() { return config().resize; }
inline const Anim &openAnim() { return config().open; }
inline const Anim &closeAnim() { return config().close; }

} // namespace NiriAnim
