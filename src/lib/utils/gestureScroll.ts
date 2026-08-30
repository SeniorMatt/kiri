// Pure helpers for touchpad scrolling: velocity estimate, snapping, easing.

class VelocityTracker {
    private samples: { time: number, value: number }[] = [];

    constructor(
        private readonly windowMs: number,
        private readonly staleMs: number,
    ) {}

    public reset() {
        this.samples = [];
    }

    public add(time: number, value: number) {
        this.samples.push({ time: time, value: value });
        while (this.samples.length > 2 && time - this.samples[0].time > this.windowMs) {
            this.samples.shift();
        }
    }

    // units per millisecond; 0 if the fingers rested before `now`
    public getVelocity(now: number) {
        if (this.samples.length < 2) {
            return 0;
        }
        const first = this.samples[0];
        const last = this.samples[this.samples.length - 1];
        if (now - last.time > this.staleMs || last.time - first.time < 5) {
            return 0;
        }
        return (last.value - first.value) / (last.time - first.time);
    }
}

// Picks the candidate closest to where the scroll position would coast to.
function pickSnapTarget(candidates: number[], position: number, velocity: number, projectionMs: number) {
    const projected = position + velocity * projectionMs;
    let best = position;
    let bestDistance = Infinity;
    for (const candidate of candidates) {
        const distance = Math.abs(candidate - projected);
        if (distance < bestDistance) {
            best = candidate;
            bestDistance = distance;
        }
    }
    return best;
}

function easeOutCubic(t: number) {
    const u = 1 - clamp(t, 0, 1);
    return 1 - u * u * u;
}
