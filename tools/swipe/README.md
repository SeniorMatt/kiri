# Touchpad swipe against niri

`ref/` is a small Rust program that runs niri v26.04's own swipe code (SwipeTracker, RubberBand and Spring are
copied unchanged; the 3-finger axis lock, `view_offset_gesture_*` and `workspace_switch_gesture_*` are copied with
the layout reduced to a list of column widths) on a trace and prints what niri does: the view position or the
workspace position after every event, where it settles, and the release spring sampled every 2 ms.

- `gen_traces.py DIR` writes the synthetic finger traces (slow drags, flicks, hesitations, reversals, drift,
  diagonals, past the ends, vertical swipes). Times are milliseconds, deltas are libinput touchpad units
  (what niri sees: `dx_unaccelerated`).
- `cpp_swipe.cpp` (build with `g++ -std=c++20`) runs the effects' Qt-free maths (`effect-cpp/common/NiriSwipe.h`):
  libinput's touchpad acceleration forward (what KWin hands to the effects), the effects' Unaccelerate, and the
  workspace gesture. `--accel-only` writes the traces as KWin delivers them, `--events` after the effect undid it.
- The TypeScript side runs `SWIPE_TRACES=<dir> SWIPE_OUT=<dir> ./run-ts.sh ./src/tests "Gesture swipe: dump"`.
- `cmp.py REF_DIR KIRI_DIR` lists the differences, `plot.py` draws niri against Kiri per trace (matplotlib),
  `make_fixtures.py` makes `src/tests/fixtures/swipe/*.json` (the mock test "Gesture swipe: Kiri matches niri").

Not here: real libinput recordings (none were available), the real-KWin replay (kiri_gesturesim with a `replay`
method that injects the events with their timestamps).
