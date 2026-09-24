#![allow(dead_code)]
// Reference harness: niri v26.04 touchpad 3-finger swipe handling, copied from
// src/input/mod.rs (on_gesture_swipe_*), src/layout/scrolling.rs (view_offset_gesture_*),
// src/layout/monitor.rs (workspace_switch_gesture_*), with the unmodified SwipeTracker,
// RubberBand and Spring files. Only the layout bookkeeping is reduced to what the gesture needs.
macro_rules! trace { ($($t:tt)*) => {}; }
mod rubber_band;
mod spring;
mod swipe_tracker;
use rubber_band::RubberBand;
use spring::{Spring, SpringParams};
use std::time::Duration;
use swipe_tracker::SwipeTracker;

const VIEW_GESTURE_WORKING_AREA_MOVEMENT: f64 = 1200.;
const WORKSPACE_GESTURE_MOVEMENT: f64 = 300.;
const WORKSPACE_GESTURE_RUBBER_BAND: RubberBand = RubberBand { stiffness: 0.5, limit: 0.05 };

struct Trace {
    name: String,
    w: f64,
    gaps: f64,
    cols: Vec<f64>,
    start_col: usize,
    start_view_pos: Option<f64>,
    desks: usize,
    start_desk: usize,
    natural: bool,
    center: String, // never | always | on-overflow
    events: Vec<(f64, f64, f64)>, // t_ms dx dy
    end_ms: f64,
}

fn parse(path: &str) -> Trace {
    let txt = std::fs::read_to_string(path).unwrap();
    let mut t = Trace { name: String::new(), w: 1600., gaps: 16., cols: vec![800.; 4], start_col: 0, start_view_pos: None, desks: 4, start_desk: 1, natural: false, center: "never".into(), events: vec![], end_ms: 0. };
    for l in txt.lines() {
        let p: Vec<&str> = l.split_whitespace().collect();
        if p.is_empty() { continue; }
        match p[0] {
            "name" => t.name = p[1].into(),
            "width" => t.w = p[1].parse().unwrap(),
            "gaps" => t.gaps = p[1].parse().unwrap(),
            "cols" => t.cols = p[1..].iter().map(|x| x.parse().unwrap()).collect(),
            "start_col" => t.start_col = p[1].parse().unwrap(),
            "start_view_pos" => t.start_view_pos = Some(p[1].parse().unwrap()),
            "desks" => { t.desks = p[1].parse().unwrap(); t.start_desk = p[2].parse().unwrap(); }
            "natural" => t.natural = p[1] == "1",
            "center" => t.center = p[1].into(),
            "e" => t.events.push((p[1].parse().unwrap(), p[2].parse().unwrap(), p[3].parse().unwrap())),
            "end" => t.end_ms = p[1].parse().unwrap(),
            _ => {}
        }
    }
    t
}

fn dur(ms: f64) -> Duration { Duration::from_secs_f64(ms / 1000.) }

struct Layout<'a> { t: &'a Trace }
impl<'a> Layout<'a> {
    fn col_x(&self, i: usize) -> f64 { self.t.cols.iter().take(i).fold(0., |x, w| x + w + self.t.gaps) }
}

fn compute_new_view_offset(cur_x: f64, view_width: f64, new_col_x: f64, new_col_width: f64, gaps: f64) -> f64 {
    if view_width <= new_col_width { return 0.; }
    let padding = ((view_width - new_col_width) / 2.).clamp(0., gaps);
    let new_x = new_col_x - padding;
    let new_right_x = new_col_x + new_col_width + padding;
    if cur_x <= new_x && new_right_x <= cur_x + view_width { return -(new_col_x - cur_x); }
    let dist_to_left = (cur_x - new_x).abs();
    let dist_to_right = ((cur_x + view_width) - new_right_x).abs();
    if dist_to_left <= dist_to_right { -padding } else { -(view_width - padding - new_col_width) }
}

fn anim_params(stiffness: f64) -> SpringParams { SpringParams::new(1., stiffness, 0.0001) }

fn sample(sp: &Spring, end_ms: f64, out: &mut String, scale: f64, sign: f64) {
    // frames every 2 ms until the spring is at rest (+ 20 ms)
    let d = sp.duration().as_secs_f64() * 1000.;
    let mut first = true;
    let mut t = 0.;
    out.push('[');
    loop {
        let v = if t >= d { sp.to } else { sp.value_at(dur(t)) };
        if !first { out.push(','); }
        first = false;
        out.push_str(&format!("[{:.1},{:.4}]", end_ms + t, sign * v * scale));
        if t >= d + 20. { break; }
        t += 2.;
    }
    out.push(']');
}

fn view_gesture(t: &Trace, lock_idx: usize, out: &mut String) {
    let lay = Layout { t };
    let n = t.cols.len();
    let w = t.w; let gaps = t.gaps;
    let active = t.start_col;
    let view_width = w;
    let start_pos = t.start_view_pos.unwrap_or_else(|| {
        // rest: column start_col left-aligned (fit), clamped to the strip
        let rightmost = lay.col_x(n - 1) + t.cols[n - 1] + gaps - view_width;
        (lay.col_x(active) - gaps).min(rightmost.max(-gaps)).max(-gaps)
    });
    let delta_from_tracker = start_pos - lay.col_x(active); // view offset relative to the active column
    let mut tracker = SwipeTracker::new();
    let norm = w / VIEW_GESTURE_WORKING_AREA_MOVEMENT;
    let mut cur = start_pos;
    out.push_str("\"frames\":[");
    for (i, e) in t.events.iter().enumerate() {
        if i > 0 { out.push(','); }
        if i < lock_idx { out.push_str(&format!("[{:.3},null]", e.0)); continue; }
        let mut dx = e.1;
        if t.natural { dx = -dx; }
        tracker.push(dx, dur(e.0));
        cur = tracker.pos() * norm + delta_from_tracker + lay.col_x(active);
        out.push_str(&format!("[{:.3},{:.4}]", e.0, -cur));
    }
    out.push_str("],");
    // ---- end
    tracker.push(0., dur(t.end_ms));
    let velocity = tracker.velocity() * norm;
    let pos = tracker.pos() * norm;
    let current_view_offset = pos + delta_from_tracker;
    let end_pos = tracker.projected_end_pos() * norm;
    let target_view_offset = end_pos + delta_from_tracker;
    struct Snap { view_pos: f64, col_idx: usize }
    let mut sp: Vec<Snap> = vec![];
    let centering = t.center == "always" || n <= 1 && false;
    if centering {
        let mut col_x = 0.;
        for (ci, &cw) in t.cols.iter().enumerate() {
            let view_pos = if w <= cw { col_x } else { col_x - (w - cw) / 2. };
            sp.push(Snap { view_pos, col_idx: ci });
            col_x += cw + gaps;
        }
    } else {
        let overflow = t.center == "on-overflow";
        let snap_points = |col_x: f64, cw: f64, prev: Option<f64>, next: Option<f64>| {
            let padding = ((w - cw) / 2.).clamp(0., gaps);
            let center = if w <= cw { col_x } else { col_x - (w - cw) / 2. };
            let ov = |adj: Option<f64>| overflow && adj.filter(|a| a + 3.0 * gaps + cw > w).is_some();
            let left = if ov(next) { center } else { col_x - padding };
            let right = if ov(prev) { center + view_width } else { col_x + cw + padding };
            (left, right)
        };
        let width_of = |i: usize| t.cols.get(i).copied();
        let leftmost_snap = snap_points(0., t.cols[0], None, width_of(1)).0;
        let last = n - 1;
        let rightmost_snap = snap_points(lay.col_x(last), t.cols[last], last.checked_sub(1).and_then(|i| width_of(i)), None).1 - view_width;
        sp.push(Snap { view_pos: leftmost_snap, col_idx: 0 });
        sp.push(Snap { view_pos: rightmost_snap, col_idx: last });
        let mut col_x = 0.;
        for ci in 0..n {
            let (left, right) = snap_points(col_x, t.cols[ci], ci.checked_sub(1).and_then(|i| width_of(i)), width_of(ci + 1));
            if leftmost_snap < left && left < rightmost_snap { sp.push(Snap { view_pos: left, col_idx: ci }); }
            let right = right - view_width;
            if leftmost_snap < right && right < rightmost_snap { sp.push(Snap { view_pos: right, col_idx: ci }); }
            col_x += t.cols[ci] + gaps;
        }
    }
    sp.sort_by(|a, b| a.view_pos.partial_cmp(&b.view_pos).unwrap());
    let active_col_x = lay.col_x(active);
    let target_view_pos = active_col_x + target_view_offset;
    let target_snap = sp.iter().min_by(|a, b| (a.view_pos - target_view_pos).abs().partial_cmp(&(b.view_pos - target_view_pos).abs()).unwrap()).unwrap();
    let mut new_col_idx = target_snap.col_idx;
    if !centering {
        if target_view_offset >= current_view_offset {
            for ci in (new_col_idx + 1)..n {
                let col_x = lay.col_x(ci); let cw = t.cols[ci];
                let padding = ((w - cw) / 2.).clamp(0., gaps);
                if target_snap.view_pos + w < col_x + cw + padding { break; }
                new_col_idx = ci;
            }
        } else {
            for ci in (0..new_col_idx).rev() {
                let col_x = lay.col_x(ci); let cw = t.cols[ci];
                let padding = ((w - cw) / 2.).clamp(0., gaps);
                if col_x - padding < target_snap.view_pos { break; }
                new_col_idx = ci;
            }
        }
    }
    let new_col_x = lay.col_x(new_col_idx);
    let delta = active_col_x - new_col_x;
    let mut from = current_view_offset + delta;
    let mut to = target_snap.view_pos - new_col_x;
    let mut vel = velocity;
    // HACK in niri: animate_view_offset_to_column(None, new_col_idx, None)
    let tv = new_col_x + to; // target_view_pos()
    let (cw, cx) = (t.cols[new_col_idx], new_col_x);
    let nvo = if t.center == "always" {
        if w <= cw { compute_new_view_offset(tv, w, cx, cw, gaps) } else { -(w - cw) / 2. }
    } else { compute_new_view_offset(tv, w, cx, cw, gaps) };
    let mut retargeted = false;
    if (nvo - to).abs() >= 1. { from = from; to = nvo; vel = 0.; retargeted = true; }
    let spring = Spring { from, to, initial_velocity: vel, params: anim_params(800.) };
    // screen x of column 0 = -(col_x(new) + offset)
    out.push_str(&format!("\"final_col\":{},\"retargeted\":{},\"vel\":{:.4},\"from\":{:.4},\"to\":{:.4},\"proj_target\":{:.4},\"duration_ms\":{:.1},\"anim\":", new_col_idx, retargeted, vel, -(new_col_x + from), -(new_col_x + to), -target_view_pos, spring.duration().as_secs_f64() * 1000.));
    let mut s = String::new();
    // absolute view position = new_col_x + offset; screen x of col0 = -that
    let abs = Spring { from: new_col_x + from, to: new_col_x + to, initial_velocity: vel, params: anim_params(800.) };
    sample(&abs, t.end_ms, &mut s, 1., -1.);
    out.push_str(&s);
}

fn workspace_gesture(t: &Trace, lock_idx: usize, out: &mut String) {
    let center_idx = t.start_desk;
    let start_idx = center_idx as f64;
    let mut cur_idx = start_idx;
    let mut tracker = SwipeTracker::new();
    let rb = WORKSPACE_GESTURE_RUBBER_BAND;
    let (min, max) = (center_idx.saturating_sub(1) as f64, (center_idx + 1).min(t.desks - 1) as f64);
    out.push_str("\"frames\":[");
    for (i, e) in t.events.iter().enumerate() {
        if i > 0 { out.push(','); }
        if i < lock_idx { out.push_str(&format!("[{:.3},null]", e.0)); continue; }
        let mut dy = e.2;
        if t.natural { dy = -dy; }
        tracker.push(dy, dur(e.0));
        let pos = tracker.pos() / WORKSPACE_GESTURE_MOVEMENT;
        cur_idx = rb.clamp(min, max, start_idx + pos);
        out.push_str(&format!("[{:.3},{:.5}]", e.0, cur_idx));
    }
    out.push_str("],");
    tracker.push(0., dur(t.end_ms));
    let mut velocity = tracker.velocity() / WORKSPACE_GESTURE_MOVEMENT;
    let current_pos = tracker.pos() / WORKSPACE_GESTURE_MOVEMENT;
    let pos = tracker.projected_end_pos() / WORKSPACE_GESTURE_MOVEMENT;
    let new_idx = (start_idx + pos).clamp(min, max).round() as usize;
    velocity *= rb.clamp_derivative(min, max, start_idx + current_pos);
    let spring = Spring { from: cur_idx, to: new_idx as f64, initial_velocity: velocity, params: anim_params(1000.) };
    out.push_str(&format!("\"final_desk\":{},\"vel\":{:.5},\"from\":{:.5},\"to\":{:.5},\"duration_ms\":{:.1},\"anim\":", new_idx, velocity, cur_idx, new_idx, spring.duration().as_secs_f64() * 1000.));
    let mut s = String::new();
    sample(&spring, t.end_ms, &mut s, 1., 1.);
    out.push_str(&s);
}

fn main() {
    let t = parse(&std::env::args().nth(1).unwrap());
    let mut out = String::new();
    // 3-finger axis lock (on_gesture_swipe_update): cumulative >= 16 units, the locking event is used
    let (mut cx, mut cy) = (0., 0.);
    let mut lock: Option<(usize, bool)> = None;
    for (i, e) in t.events.iter().enumerate() {
        let (mut dx, mut dy) = (e.1, e.2);
        if t.natural { dx = -dx; dy = -dy; }
        cx += dx; cy += dy;
        if cx * cx + cy * cy >= 256. { lock = Some((i, cx.abs() > cy.abs())); break; }
    }
    out.push_str(&format!("{{\"name\":\"{}\",", t.name));
    match lock {
        None => out.push_str("\"kind\":\"none\",\"frames\":[]"),
        Some((i, true)) => { out.push_str("\"kind\":\"h\",\"lock\":"); out.push_str(&i.to_string()); out.push(','); view_gesture(&t, i, &mut out); }
        Some((i, false)) => { out.push_str("\"kind\":\"v\",\"lock\":"); out.push_str(&i.to_string()); out.push(','); workspace_gesture(&t, i, &mut out); }
    }
    out.push('}');
    println!("{}", out);
}
