/*
    A spring simulation for the desktop switch effect.
    Copied from KWin's effect/springmotion.{h,cpp}, whose header the KWin development package does not install.
    SPDX-FileCopyrightText: 2022 Vlad Zahorodnii <vlad.zahorodnii@kde.org>
    SPDX-License-Identifier: GPL-2.0-or-later
*/
#pragma once

#include <QtGlobal>
#include <chrono>
#include <cmath>

class SpringMotion
{
public:
    SpringMotion() = default;
    SpringMotion(qreal springConstant, qreal dampingRatio)
        : m_springConstant(springConstant)
        , m_dampingRatio(dampingRatio)
        , m_dampingCoefficient(2 * std::sqrt(springConstant) * dampingRatio)
    {
    }

    bool isMoving() const { return std::fabs(position() - m_anchor) > m_epsilon || std::fabs(velocity()) > m_epsilon; }
    qreal velocity() const { return lerp(m_prev.velocity, m_next.velocity, m_t); }
    void setVelocity(qreal velocity)
    {
        m_next = State{position(), velocity};
        m_t = 1.0;
    }
    qreal position() const { return lerp(m_prev.position, m_next.position, m_t); }
    void setPosition(qreal position)
    {
        m_next = State{position, velocity()};
        m_t = 1.0;
    }
    qreal anchor() const { return m_anchor; }
    void setAnchor(qreal anchor) { m_anchor = anchor; }
    qreal epsilon() const { return m_epsilon; }
    void setEpsilon(qreal epsilon) { m_epsilon = epsilon; }

    void advance(std::chrono::nanoseconds delta)
    {
        if (!isMoving()) {
            return;
        }
        if (std::isinf(m_springConstant)) {
            m_next = State{m_anchor, 0.0};
            return;
        }
        const qreal steps = (delta.count() / 1'000'000'000.0) / m_timestep;
        for (m_t += steps; m_t > 1.0; m_t -= 1.0) {
            m_prev = m_next;
            m_next = integrate(m_next, m_timestep);
        }
    }

private:
    struct State
    {
        qreal position;
        qreal velocity;
    };
    struct Slope
    {
        qreal dp;
        qreal dv;
    };
    static qreal lerp(qreal a, qreal b, qreal t) { return a * (1 - t) + b * t; }
    Slope evaluate(const State &state, qreal dt, const Slope &slope) const
    {
        const State next{state.position + slope.dp * dt, state.velocity + slope.dv * dt};
        return Slope{next.velocity, (m_anchor - next.position) * m_springConstant - next.velocity * m_dampingCoefficient};
    }
    State integrate(const State &state, qreal dt) const
    {
        const Slope k1 = evaluate(state, 0.0, {0, 0});
        const Slope k2 = evaluate(state, 0.5 * dt, k1);
        const Slope k3 = evaluate(state, 0.5 * dt, k2);
        const Slope k4 = evaluate(state, dt, k3);
        const qreal dpdt = (k1.dp + 2 * k2.dp + 2 * k3.dp + k4.dp) / 6.0;
        const qreal dvdt = (k1.dv + 2 * k2.dv + 2 * k3.dv + k4.dv) / 6.0;
        return State{state.position + dpdt * dt, state.velocity + dvdt * dt};
    }

    State m_prev{0, 0};
    State m_next{0, 0};
    qreal m_t = 1.0;
    qreal m_timestep = 1.0 / 100.0;
    qreal m_anchor = 0;
    qreal m_springConstant = 200.0;
    qreal m_dampingRatio = 1.1;
    qreal m_dampingCoefficient = 2 * std::sqrt(200.0) * 1.1;
    qreal m_epsilon = 1.0;
};
