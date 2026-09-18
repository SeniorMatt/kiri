"use strict";

// Animates frame geometry changes of normal windows (position and size) with an ease-out curve.
// An interrupted animation continues from where the window visually is, not from its old geometry.
// Skipped during interactive move/resize, full-screen toggles, and while geometry changes arrive
// in a rapid stream (touchpad scrolling), where the window just follows the input.

// Fallback for systems without the compiled kiri_motion effect, which does this with niri's exact springs.
// niri's window-movement spring (stiffness 800, critically damped) is 95 % done after about 200 ms and rests
// at 325 ms; OutCubic over 260 ms is the closest QEasingCurve.
const DURATION = 260;
const STREAM_GAP = 30; // ms between changes below which they count as one continuous stream
const STREAM_LENGTH = 2; // fast changes in a row before animations are skipped
const MIN_DELTA = 1; // px

function easeOut(t) {
    // QEasingCurve.OutCubic
    const u = 1 - t;
    return 1 - u * u * u;
}

class KiriAnimations {
    constructor() {
        effects.windowAdded.connect(this.manage.bind(this));
        effects.windowAdded.connect(this.opened.bind(this));
        effects.windowClosed.connect(this.closed.bind(this));
        effects.stackingOrder.forEach(this.manage.bind(this));
        effect.configChanged.connect(this.loadConfig.bind(this));
        this.loadConfig();
    }

    loadConfig() {
        this.duration = animationTime(effect.readConfig("Duration", DURATION));
    }

    manage(window) {
        window.kiriAnim = { created: Date.now(), lastChange: 0, streak: 0, ids: [], visual: null, start: 0, from: null, fullScreenChange: false };
        window.windowFrameGeometryChanged.connect(this.onGeometryChanged.bind(this));
        window.windowFullScreenChanged.connect(w => { w.kiriAnim.fullScreenChange = true; });
        window.windowStartUserMovedResized.connect(w => this.stop(w));
    }

    animatable(window) {
        return window.managed && window.visible && !window.popupWindow && (window.normalWindow || window.dialog) &&
            !window.caption.startsWith("kiri-ring-");
    }

    // niri's window-open: 150 ms ease-out-expo, scale 0.5 -> 1 around the centre while fading in
    opened(window) {
        if (this.duration <= 0 || !this.animatable(window)) {
            return;
        }
        animate({
            window: window,
            duration: animationTime(150),
            curve: QEasingCurve.OutExpo,
            animations: [
                { type: Effect.Scale, from: 0.5, to: 1 },
                { type: Effect.Opacity, from: 0, to: 1 },
            ],
        });
    }

    // niri's window-close: 150 ms ease-out-quad, scale 1 -> 0.8 while fading out
    closed(window) {
        if (this.duration <= 0 || !this.animatable(window)) {
            return;
        }
        animate({
            window: window,
            duration: animationTime(150),
            curve: QEasingCurve.OutQuad,
            animations: [
                { type: Effect.Scale, from: 1, to: 0.8 },
                { type: Effect.Opacity, from: 1, to: 0 },
            ],
        });
    }

    stop(window) {
        const data = window.kiriAnim;
        if (data.ids.length > 0) {
            cancel(data.ids);
            data.ids = [];
        }
        data.from = null;
    }

    // the rectangle the window currently appears at while an animation of it runs
    currentVisual(window) {
        const data = window.kiriAnim;
        if (data.from === null) {
            return null;
        }
        const t = (Date.now() - data.start) / data.duration;
        if (t >= 1) {
            return null;
        }
        const k = easeOut(Math.max(t, 0));
        const g = data.to;
        const f = data.from;
        return {
            x: f.x + (g.x - f.x) * k,
            y: f.y + (g.y - f.y) * k,
            width: f.width + (g.width - f.width) * k,
            height: f.height + (g.height - f.height) * k,
        };
    }

    onGeometryChanged(window, oldGeometry) {
        const data = window.kiriAnim;
        const now = Date.now();
        const visual = this.currentVisual(window);
        const fullScreenChange = data.fullScreenChange;
        data.fullScreenChange = false;

        const fast = now - data.lastChange < STREAM_GAP;
        data.lastChange = now;
        data.streak = fast ? data.streak + 1 : 0;

        this.stop(window);

        const g = window.geometry;
        if (
            !window.managed || !window.visible || !window.onCurrentDesktop || window.minimized ||
            !window.normalWindow ||
            window.caption.startsWith("kiri-ring-") || // the fallback ring and tab indicator windows follow their target themselves
            window.move || window.resize ||
            fullScreenChange || window.fullScreen ||
            now - data.created < 10 ||
            data.streak >= STREAM_LENGTH ||
            this.duration <= 0
        ) {
            return;
        }

        const from = visual !== null ? visual : { x: oldGeometry.x, y: oldGeometry.y, width: oldGeometry.width, height: oldGeometry.height };
        if (
            Math.abs(from.x - g.x) < MIN_DELTA && Math.abs(from.y - g.y) < MIN_DELTA &&
            Math.abs(from.width - g.width) < MIN_DELTA && Math.abs(from.height - g.height) < MIN_DELTA
        ) {
            return;
        }

        const dx = from.x + from.width / 2 - (g.x + g.width / 2);
        const dy = from.y + from.height / 2 - (g.y + g.height / 2);
        const ids = animate({
            window: window,
            duration: this.duration,
            curve: QEasingCurve.OutCubic,
            animations: [
                { type: Effect.Translation, from: { value1: dx, value2: dy }, to: { value1: 0, value2: 0 } },
                { type: Effect.Scale, from: { value1: from.width / g.width, value2: from.height / g.height }, to: { value1: 1, value2: 1 } },
            ],
        });
        data.ids = Array.isArray(ids) ? ids : [ids];
        data.from = from;
        data.to = { x: g.x, y: g.y, width: g.width, height: g.height };
        data.start = now;
        data.duration = this.duration;
    }
}

new KiriAnimations();
