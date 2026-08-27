# Handoff (2026-11-23)
- kniri = Karousel fork (GPLv3, credits Peter Fajdiga), private repo SeniorMatt/kniri, branch main.
- Script ID "kniri", shortcuts "kniri-*", so it installs next to Karousel. Enable only one of them at a time.
- Includes the full-screen/maximized-in-grid feature (Karousel issue 135), on by default here.
  The owner tested it on CachyOS + Plasma 6 and it works.
- Build: `CI=true make build` / `make package` (needs pnpm 10). CI: .github/workflows/build.yml uploads the package.
- Live testing: nested KWin 6.8 in the podman container ksr-kdelinux. Start kactivitymanagerd first, or nothing gets tiled.
  Scripts: scratchpad e2e/run.sh pattern (kwin_wayland --virtual + weston-terminal + a driver script).
  KWin keeps 100 px of normal windows on screen (that's normal); full-screen windows aren't clamped.
- Next: ROADMAP.md, item 1 (key bindings).
