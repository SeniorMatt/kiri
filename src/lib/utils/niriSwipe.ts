// niri's touchpad view gesture, as pure functions: the release spring (src/animation/spring.rs) and the choice of
// where the view comes to rest (src/layout/scrolling.rs view_offset_gesture_end). Positions are niri's: the x of
// the view's left edge in the strip of columns, where a column at screen x = p has view position col_x - p.

// critically damped or not: niri's closed-form damped spring, value only depends on the time since the start
class NiriSpring {
    private readonly damping: number;
    private readonly stiffness: number;
    private readonly epsilon: number;
    public readonly duration: number; // seconds until at rest

    constructor(
        private readonly from: number,
        private readonly to: number,
        private readonly velocity: number, // per second
        dampingRatio: number,
        stiffness: number,
        epsilon: number,
    ) {
        this.stiffness = Math.max(stiffness, 0);
        this.damping = Math.max(dampingRatio, 0) * 2 * Math.sqrt(this.stiffness);
        this.epsilon = Math.max(epsilon, 0);
        this.duration = this.computeDuration();
    }

    public value(t: number) {
        if (t <= 0) {
            return this.from;
        }
        if (t >= this.duration) {
            return this.to;
        }
        return this.oscillate(t);
    }

    private oscillate(t: number) {
        const beta = this.damping / 2;
        const omega0 = Math.sqrt(this.stiffness);
        const x0 = this.from - this.to;
        const envelope = Math.exp(-beta * t);
        if (Math.abs(beta - omega0) <= 1.1920929e-7) {
            return this.to + envelope * (x0 + (beta * x0 + this.velocity) * t);
        } else if (beta < omega0) {
            const omega1 = Math.sqrt(omega0 * omega0 - beta * beta);
            return this.to + envelope * (x0 * Math.cos(omega1 * t) + ((beta * x0 + this.velocity) / omega1) * Math.sin(omega1 * t));
        }
        const omega2 = Math.sqrt(beta * beta - omega0 * omega0);
        const cosh = (Math.exp(omega2 * t) + Math.exp(-omega2 * t)) / 2;
        const sinh = (Math.exp(omega2 * t) - Math.exp(-omega2 * t)) / 2;
        return this.to + envelope * (x0 * cosh + ((beta * x0 + this.velocity) / omega2) * sinh);
    }

    private computeDuration() {
        const delta = 0.001;
        const beta = this.damping / 2;
        if (beta <= 2.220446049250313e-16) {
            return Infinity;
        }
        if (Math.abs(this.to - this.from) <= 2.220446049250313e-16) {
            return 0;
        }
        const omega0 = Math.sqrt(this.stiffness);
        let x0 = -Math.log(this.epsilon) / beta;
        if (Math.abs(beta - omega0) <= 1.1920929e-7 || beta < omega0) {
            return x0;
        }
        let y0 = this.oscillate(x0);
        let m = (this.oscillate(x0 + delta) - y0) / delta;
        let x1 = (this.to - y0 + m * x0) / m;
        let y1 = this.oscillate(x1);
        for (let i = 0; Math.abs(this.to - y1) > this.epsilon; i++) {
            if (i > 1000) {
                return 0;
            }
            x0 = x1;
            y0 = y1;
            m = (this.oscillate(x0 + delta) - y0) / delta;
            x1 = (this.to - y0 + m * x0) / m;
            y1 = this.oscillate(x1);
            if (!isFinite(y1)) {
                return x0;
            }
        }
        return x1;
    }
}

// horizontal-view-movement: spring, damping-ratio 1.0, stiffness 800, epsilon 0.0001
function niriViewSpring(from: number, to: number, velocity: number) {
    return new NiriSpring(from, to, velocity, 1, 800, 0.0001);
}

namespace NiriSnap {
    export interface Column { x: number, width: number }
    export interface Input {
        columns: Column[];
        viewWidth: number;       // niri's working area width
        gaps: number;
        center: "never" | "always" | "on-overflow";
        currentView: number;     // view position at the release
        targetView: number;      // view position after the release velocity decelerated
    }
    export interface Result {
        column: number;          // the column that becomes active
        view: number;            // where the view comes to rest
        retargeted: boolean;     // niri's animate_view_offset_to_column moved the target and dropped the velocity
    }

    function padding(input: Input, width: number) {
        return clamp((input.viewWidth - width) / 2, 0, input.gaps);
    }

    // niri's compute_new_view_offset, as a view position
    function fit(input: Input, curX: number, colX: number, width: number) {
        const viewWidth = input.viewWidth;
        if (viewWidth <= width) {
            return colX;
        }
        const pad = padding(input, width);
        const newX = colX - pad;
        const newRight = colX + width + pad;
        if (curX <= newX && newRight <= curX + viewWidth) {
            return curX;
        }
        const distLeft = Math.abs(curX - newX);
        const distRight = Math.abs((curX + viewWidth) - newRight);
        return distLeft <= distRight ? colX - pad : colX - (viewWidth - pad - width);
    }

    export function choose(input: Input): Result | null {
        const columns = input.columns;
        const n = columns.length;
        if (n === 0) {
            return null;
        }
        const w = input.viewWidth;
        const gaps = input.gaps;
        const centering = input.center === "always";
        const snaps: { view: number, column: number }[] = [];

        if (centering) {
            columns.forEach((c, i) => {
                snaps.push({ view: w <= c.width ? c.x : c.x - (w - c.width) / 2, column: i });
            });
        } else {
            const overflow = input.center === "on-overflow";
            const points = (c: Column, prev: Column|undefined, next: Column|undefined) => {
                const pad = padding(input, c.width);
                const center = w <= c.width ? c.x : c.x - (w - c.width) / 2;
                const isOverflowing = (adj: Column|undefined) => overflow && adj !== undefined && adj.width + 3 * gaps + c.width > w;
                return {
                    left: isOverflowing(next) ? center : c.x - pad,
                    right: isOverflowing(prev) ? center + w : c.x + c.width + pad,
                };
            };
            const leftmost = points(columns[0], undefined, columns[1]).left;
            const rightmost = points(columns[n - 1], columns[n - 2], undefined).right - w;
            snaps.push({ view: leftmost, column: 0 });
            snaps.push({ view: rightmost, column: n - 1 });
            columns.forEach((c, i) => {
                const p = points(c, columns[i - 1], columns[i + 1]);
                if (leftmost < p.left && p.left < rightmost) {
                    snaps.push({ view: p.left, column: i });
                }
                const right = p.right - w;
                if (leftmost < right && right < rightmost) {
                    snaps.push({ view: right, column: i });
                }
            });
        }
        snaps.sort((a, b) => a.view - b.view);
        let target = snaps[0];
        for (const snap of snaps) {
            if (Math.abs(snap.view - input.targetView) < Math.abs(target.view - input.targetView)) {
                target = snap;
            }
        }
        let column = target.column;
        if (!centering) {
            // focus the furthest column towards the direction of the gesture that is still entirely visible
            if (input.targetView >= input.currentView) {
                for (let i = column + 1; i < n; i++) {
                    const c = columns[i];
                    if (target.view + w < c.x + c.width + padding(input, c.width)) {
                        break;
                    }
                    column = i;
                }
            } else {
                for (let i = column - 1; i >= 0; i--) {
                    const c = columns[i];
                    if (c.x - padding(input, c.width) < target.view) {
                        break;
                    }
                    column = i;
                }
            }
        }
        // niri then calls animate_view_offset_to_column for the new column; if the target does not show it
        // fully (a pixel off or more), the animation starts over towards that, without the velocity
        const c = columns[column];
        const fitted = centering && w > c.width ? c.x - (w - c.width) / 2 : fit(input, target.view, c.x, c.width);
        if (Math.abs(fitted - target.view) >= 1) {
            return { column: column, view: fitted, retargeted: true };
        }
        return { column: column, view: target.view, retargeted: false };
    }
}
