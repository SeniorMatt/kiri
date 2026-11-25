.pragma library

// KWin puts a QML window above every panel, but in niri panels are above windows and their rings.
// The overlays use these helpers to leave out the parts that a panel above the window would cover.

// Rectangles of the visible panels that are stacked above `target`.
// Without a target: above every normal window (for overlays that belong to several windows).
// A panel window can have a transparent margin (a shadow, a floating gap) that nothing paints; the panel's strut is
// what shows, so when `areaOf(panel)` gives the work area, only the part of the window outside of it is used.
function panelsAbove(order, target, areaOf) {
    let from = 0;
    if (target) {
        from = -1;
        for (let i = 0; i < order.length; i++) {
            if (order[i] === target) {
                from = i + 1;
            }
        }
        if (from < 0) {
            return [];
        }
    } else {
        for (let i = 0; i < order.length; i++) {
            // the overlays are windows too, and KWin keeps them above the panels
            if ((order[i].normalWindow || order[i].dialog) && !order[i].caption.startsWith("kiri-ring-")) {
                from = i + 1;
            }
        }
    }
    const out = [];
    for (let i = from; i < order.length; i++) {
        const w = order[i];
        if (w.dock && !w.hidden && !w.minimized && !w.deleted) {
            const g = w.frameGeometry;
            const frame = { x: g.x, y: g.y, width: g.width, height: g.height };
            const shown = areaOf ? subtract(frame, areaOf(w)) : [];
            // a panel that reserves no space (it floats over the windows) is not inside the work area's edge: all of it shows
            Array.prototype.push.apply(out, shown.length > 0 ? shown : [frame]);
        }
    }
    return out;
}

// `p` without the area of `c`, as up to 4 rectangles.
function subtract(p, c) {
    const x0 = Math.max(p.x, c.x), y0 = Math.max(p.y, c.y);
    const x1 = Math.min(p.x + p.width, c.x + c.width), y1 = Math.min(p.y + p.height, c.y + c.height);
    if (x0 >= x1 || y0 >= y1) {
        return [p];
    }
    const out = [];
    if (y0 > p.y) {
        out.push({ x: p.x, y: p.y, width: p.width, height: y0 - p.y });
    }
    if (y1 < p.y + p.height) {
        out.push({ x: p.x, y: y1, width: p.width, height: p.y + p.height - y1 });
    }
    if (x0 > p.x) {
        out.push({ x: p.x, y: y0, width: x0 - p.x, height: y1 - y0 });
    }
    if (x1 < p.x + p.width) {
        out.push({ x: x1, y: y0, width: p.x + p.width - x1, height: y1 - y0 });
    }
    return out;
}

// The parts of a window at (ox, oy) of size w x h that none of the `covers` (screen coordinates) hides,
// in the window's own coordinates.
function visibleParts(ox, oy, w, h, covers) {
    let parts = [{ x: 0, y: 0, width: w, height: h }];
    for (const c of covers) {
        const cut = { x: c.x - ox, y: c.y - oy, width: c.width, height: c.height };
        let next = [];
        for (const p of parts) {
            next = next.concat(subtract(p, cut));
        }
        parts = next;
    }
    return parts;
}
