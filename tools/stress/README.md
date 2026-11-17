# Kiri stress harness

Drives a real nested KWin (virtual output) with Kiri and the compiled effects, in the podman container with the KDE stack.
Real key and pointer events (the `kwin_fake_input` protocol, `inp`), real client windows (`qml6 win.qml`, each paints a
circle of its own colour), and after every scenario:

- every window exists once, is on the expected desktop, has a sane geometry and opacity, tiled windows do not overlap;
- the focused window is visible and on the current desktop; no Kiri effect is still active (overview closed);
- KWin is alive and the log has no script errors or `TRACE other-desktop window painted` lines;
- the screen (ScreenShot2) shows each uncovered window's colour at its centre;
- the visual pass: ScreenShot2 frames captured during and after each key burst (14 to 27 fps here) are checked for black
  frames, windows of other desktops, windows present/absent/present once settled, and unstable settled frames.

`probe/` is a KWin script that logs event-loop stalls (`STFT`), geometry changes (`STGEO`), a JSON dump of all windows
(`STINV`) and runs JS the driver writes to a file (`repeat(ms, n, fn)`, `byName(name)`, `workspace` available).

    ./deploy.sh [effects]      copy harness + built package (+ rebuild the effects with -j1) into the container's /st
    ./run.sh TAG scenario...   run scenarios in one nested KWin; output in /st/run-TAG.out ; `stress.py --list` lists them

`/st` needs once: `cmake` builds of `effect-cpp` into `/st/eb`, the `inp` (inp/ here) and `shot` (shot.cpp) binaries,
`/st/panel` (a layer-shell dock) and `/st/qtplug` (the built plugins). The host side needs `pnpm exec tsc -p src/main` and
the config generator first (see the Makefile) so that `package/` is complete. Never kill other agents' processes.
`niri_fuzz.py` and `src/tests/units/niri/NiriImportOdd.ts` fuzz the niri config importers.
