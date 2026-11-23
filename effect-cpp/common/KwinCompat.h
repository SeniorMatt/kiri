// KWin 6.7 (Plasma 6.7, e.g. Kubuntu 26.10) against KWin 6.8: the paint hooks returned void before 6.8 and
// bool after, and the geometry helpers returned QRectF instead of KWin::RectF. KIRI_KWIN_OLD is set by CMake.
#pragma once
#include <QRectF>

#ifdef KIRI_KWIN_OLD
#define KIRI_PAINT_RET void
#define KIRI_CALL(expr) ((expr), true)
#define KIRI_RET(v) return
template<typename R>
inline QRectF kiriScaled(const R &r, double s)
{
    return QRectF(r.x() * s, r.y() * s, r.width() * s, r.height() * s);
}
#else
#define KIRI_PAINT_RET bool
#define KIRI_CALL(expr) (expr)
#define KIRI_RET(v) return v
template<typename R>
inline auto kiriScaled(const R &r, double s)
{
    return r * s;
}
#endif
