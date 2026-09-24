// Checks the Qt-free swipe maths of the effects (effect-cpp/common/NiriSwipe.h) on a trace file.
//   cpp_swipe TRACE            -> JSON like the niri reference (tools/swipe/ref), vertical swipes only
//   cpp_swipe --events TRACE   -> the trace with the events after "libinput accelerates, the effect undoes it"
//   cpp_swipe --accel-only TRACE -> the trace as KWin gets it (accelerated), for replaying into a real KWin
// The traces hold what niri sees (unaccelerated deltas). This first runs libinput's touchpad acceleration
// (filter-touchpad.c, filter.c) forward, which is what KWin hands to the effect, then the effect's Unaccelerate.
#include "../../effect-cpp/common/NiriSwipe.h"

#include <cstdio>
#include <cstring>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

struct Ev { double t, x, y; };
struct Trace { std::string name; int desks = 4, startDesk = 1; bool natural = false; std::vector<Ev> ev; double end = 0; std::vector<std::string> header; };

static Trace parse(const char *path)
{
    Trace t; std::ifstream f(path); std::string line;
    while (std::getline(f, line)) {
        std::istringstream s(line); std::string k; s >> k;
        if (k == "e") { Ev e; s >> e.t >> e.x >> e.y; t.ev.push_back(e); }
        else if (k == "end") s >> t.end;
        else {
            t.header.push_back(line);
            if (k == "name") s >> t.name;
            else if (k == "desks") s >> t.desks >> t.startDesk;
            else if (k == "natural") { int n; s >> n; t.natural = n; }
        }
    }
    return t;
}

// libinput's trackers (filter.c), speeds in mm/ms
namespace Li {
struct Tr { double t = 0, dx = 0, dy = 0; unsigned dir = 0; };
static unsigned direction(double x, double y)
{
    if (x == 0 && y == 0) return 0xff;
    double a = std::atan2(y, x) * 180 / M_PI; // -180..180
    unsigned bits = 0;
    for (int s = 0; s < 8; s++) {
        double c = s * 45.0 - 180.0 + 0; // sector centre
        double d = std::fabs(std::remainder(a - c, 360.0));
        if (d <= 22.5 + 15.0) bits |= 1u << s;
    }
    return bits;
}
struct Filter {
    static constexpr int N = 16;
    Tr tr[N]; int cur = 0; double lastVelocity = 0;
    Filter() { for (auto &x : tr) { x = Tr(); } tr[0].dir = 0xff; }
    Tr &by(int off) { return tr[(cur + N - off) % N]; }
    // mm per ms deltas; returns accel ratio (factor/0.9)
    double feed(double dxmm, double dymm, double tms)
    {
        for (auto &x : tr) { x.dx += dxmm; x.dy += dymm; }
        cur = (cur + 1) % N; tr[cur].dx = tr[cur].dy = 0; tr[cur].t = tms; tr[cur].dir = direction(dxmm, dymm);
        const double MAXDIFF = 25.4 / 1000.0 * 1000.0; // 1 unit/ms at 1000 dpi in mm/s -> use mm/s below
        double result = 0, initial = 0; unsigned dir = by(0).dir;
        for (int off = 1; off < N; off++) {
            Tr &x = by(off);
            if (x.t > tms) break;
            double td = tms - x.t;
            if (td > 1000.0) { if (off == 1) result = std::hypot(x.dx, x.dy) / (1000.0 + 0.001) * 1000.0; break; }
            double v = std::hypot(x.dx, x.dy) / (td + 0.001) * 1000.0; // mm/s
            dir &= x.dir;
            if (dir == 0) { if (off == 1) result = v; break; }
            if (initial == 0.0 || off <= 2) { result = initial = v; }
            else { if (std::fabs(initial - v) > 25.4) break; result = v; }
        }
        double v = result;
        auto prof = [](double s) { return NiriSwipe::Unaccelerate::ratio(s); };
        double f = (prof(v) + prof(lastVelocity) + 4 * prof((lastVelocity + v) / 2)) / 6.0;
        lastVelocity = v;
        return f;
    }
    void reset(double tms) { *this = Filter(); tr[0].t = tms; }
};
}

static void emitAnim(const NiriAnim::Spring &sp, double endMs, std::ostream &o)
{
    double d = sp.duration() * 1000.0; o << '[';
    for (double t = 0; ; t += 2) {
        double v = t >= d ? sp.to() : sp.value(t / 1000.0);
        if (t > 0) o << ',';
        char b[64]; std::snprintf(b, sizeof b, "[%.1f,%.4f]", endMs + t, v); o << b;
        if (t >= d + 20) break;
    }
    o << ']';
}

// For each trace: accelerate like libinput for the given profile and speed, undo it like the effects do, and compare.
// Flat has to be exact; adaptive is an estimate (libinput averages its velocity over a variable number of events),
// so the events may be off by 15 % of the travel in sum and the net travel by 6 %.
static int runCheck(const std::vector<const char *> &paths, bool flat, double speed)
{
    double worstTotal = 0, worstNet = 0; int bad = 0;
    for (const char *p : paths) {
        Trace t = parse(p);
        Li::Filter lf; lf.reset(t.ev.empty() ? 0 : t.ev[0].t - 8);
        NiriSwipe::Unaccelerate un; un.setProfile(flat, speed);
        double sumTrue = 0, sumErr = 0, net = 0, netTrue = 0;
        for (const Ev &e : t.ev) {
            double ax = e.x, ay = e.y;
            if (!flat) {
                double r = lf.feed(e.x / NiriSwipe::Unaccelerate::UnitsPerMm, e.y / NiriSwipe::Unaccelerate::UnitsPerMm, e.t) * NiriSwipe::Unaccelerate::speedFactor(speed);
                ax *= r; ay *= r;
            }
            double ux, uy; un.apply(ax, ay, e.t, ux, uy);
            sumTrue += std::fabs(e.x); sumErr += std::fabs(ux - e.x); net += ux; netTrue += e.x;
            if (flat && (ux != e.x || uy != e.y)) bad++;
        }
        double total = sumTrue > 0 ? sumErr / sumTrue : 0;
        worstTotal = std::max(worstTotal, total);
        const double netErr = sumTrue > 0 ? std::fabs(net - netTrue) / sumTrue : 0;
        worstNet = std::max(worstNet, netErr);
        if (!flat && (total > 0.15 || netErr > 0.06)) bad++;
    }
    std::printf("%s speed %.2f: %zu traces, worst per-event error %.3f of the travel, worst net error %.3f, %s\n", flat ? "flat" : "adaptive", speed, paths.size(), worstTotal, worstNet, bad ? "FAIL" : "ok");
    return bad ? 1 : 0;
}

int main(int argc, char **argv)
{
    bool events = false, accelOnly = false, check = false, flat = false; double speed = 0.0; std::vector<const char *> paths; const char *path = nullptr; bool unaccel = true; bool accel = true;
    for (int i = 1; i < argc; i++) {
        if (!std::strcmp(argv[i], "--events")) events = true;
        else if (!std::strcmp(argv[i], "--no-unaccel")) unaccel = false;
        else if (!std::strcmp(argv[i], "--no-accel")) accel = false;
        else if (!std::strcmp(argv[i], "--flat")) flat = true;
        else if (!std::strcmp(argv[i], "--speed") && i + 1 < argc) speed = std::atof(argv[++i]);
        else if (!std::strcmp(argv[i], "--check")) check = true;
        else if (!std::strcmp(argv[i], "--accel-only")) { accelOnly = true; events = true; unaccel = false; }
        else { path = argv[i]; paths.push_back(argv[i]); }
    }
    if (check) return runCheck(paths, flat, speed);
    Trace t = parse(path);
    Li::Filter lf; lf.reset(t.ev.empty() ? 0 : t.ev[0].t - 8);
    NiriSwipe::Unaccelerate un; un.setEnabled(unaccel); un.setProfile(flat, speed);
    std::vector<Ev> out; double maxrel = 0;
    for (const Ev &e : t.ev) {
        double ax = e.x, ay = e.y;
        if (accel && !flat) { // the flat filter's "unaccelerated" delta is its accelerated one
            double r = lf.feed(e.x / NiriSwipe::Unaccelerate::UnitsPerMm, e.y / NiriSwipe::Unaccelerate::UnitsPerMm, e.t)
                * NiriSwipe::Unaccelerate::speedFactor(speed);
            ax *= r; ay *= r;
        }
        double ux, uy; un.apply(ax, ay, e.t, ux, uy);
        out.push_back({e.t, ux, uy});
        double m = std::hypot(e.x, e.y);
        if (m > 3) maxrel = std::max(maxrel, std::fabs(std::hypot(ux, uy) - m) / m);
    }
    if (events) {
        for (const auto &h : t.header) std::cout << h << "\n";
        for (const auto &e : out) std::printf("e %.3f %.4f %.4f\n", e.t, e.x, e.y);
        std::printf("end %.3f\n", t.end);
        std::fprintf(stderr, "%s max relative error %.3f\n", t.name.c_str(), maxrel);
        return 0;
    }
    // axis lock on the undone deltas, like niri's on_gesture_swipe_update
    double cx = 0, cy = 0; int lock = -1; bool horizontal = false;
    for (size_t i = 0; i < out.size(); i++) {
        double dx = t.natural ? -out[i].x : out[i].x, dy = t.natural ? -out[i].y : out[i].y;
        cx += dx; cy += dy;
        if (cx * cx + cy * cy >= 256) { lock = int(i); horizontal = std::fabs(cx) > std::fabs(cy); break; }
    }
    std::cout << "{\"name\":\"" << t.name << "\",";
    if (lock < 0 || horizontal) { std::cout << "\"kind\":\"" << (lock < 0 ? "none" : "h") << "\",\"frames\":[]}\n"; return 0; }
    NiriSwipe::WorkspaceGesture g; g.begin(t.startDesk, t.startDesk, t.desks);
    std::cout << "\"kind\":\"v\",\"lock\":" << lock << ",\"frames\":[";
    for (size_t i = 0; i < out.size(); i++) {
        if (i) std::cout << ',';
        char b[96];
        if (int(i) < lock) { std::snprintf(b, sizeof b, "[%.3f,null]", out[i].t); std::cout << b; continue; }
        double dy = t.natural ? -out[i].y : out[i].y;
        double idx = g.update(dy, out[i].t);
        std::snprintf(b, sizeof b, "[%.3f,%.5f]", out[i].t, idx); std::cout << b;
    }
    auto rel = g.end(t.end);
    NiriAnim::Spring sp(rel.from, rel.target, rel.velocity, 1.0, NiriSwipe::WorkspaceGesture::Stiffness, 0.0001);
    std::printf("],\"final_desk\":%d,\"vel\":%.5f,\"from\":%.5f,\"to\":%d,\"duration_ms\":%.1f,\"max_unaccel_err\":%.4f,\"anim\":", rel.target, rel.velocity, rel.from, rel.target, sp.duration() * 1000, maxrel);
    emitAnim(sp, t.end, std::cout); std::cout << "}\n";
}
