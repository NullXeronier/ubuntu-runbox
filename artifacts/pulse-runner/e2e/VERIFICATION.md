# Browser regression verification — 2026-10-14

## Cross-engine extension: implemented, execution blocked on this host

The default configuration now invokes the same four journeys in 12 projects
(48 cases): Chromium, Firefox and WebKit, each with keyboard/375px trusted-touch
input and explicit native-WebGL2/forced-Canvas2D coverage. The original Chromium
names are preserved. Firefox's narrow touch viewport is not Android mobile
layout emulation; Playwright does not support Firefox `isMobile`. WebKit
automation is engine coverage, not branded Safari or real iPhone certification.

### Checks performed

- The updated renderer/context-denial instrumentation ran all **16 Chromium
  cases successfully** before adding the independent native-audio preflight.
  Real WebGL2, Canvas2D, native-clock startup, keyboard/touch quests, badges,
  retry/reload, pause/reset and effects all produced passing application
  assertions. Native-clock startup additionally checks that audio time advances.
- Game typecheck, browser-harness typecheck and all 14 standard unit tests passed.
- A subsequent invocation of the **full 48-case default matrix** reported 6
  passes and 42 failures: **32 browser-setup failures** in Firefox/WebKit, and
  10 false capability failures in the new empty-graph audio probe on Chromium.
  The latter were a harness defect, not game failures: Chromium can idle an
  empty audio graph while still reporting a running context. The probe now
  schedules an inaudible oscillator and waits up to three seconds for native
  time to advance. A cheap, isolated check of that exact corrected probe passed
  six times (three trusted keyboard/mouse gestures and three trusted touch
  gestures), with native time advancing in every sample. The full matrix was
  not rerun after that probe-only correction.
- `CI=1 PULSE_E2E_ALLOW_UNSUPPORTED=1 ... playwright test --list` is rejected at
  config load, so diagnostic skips cannot make a release run green.
- The public app preview still loads. Its screenshot shows the compatibility
  renderer and is **not** evidence of cross-engine or WebGL coverage.

### Firefox/WebKit are not certified by this run

Playwright 1.64.0's version-matched Firefox 157.0/revision 1555 and WebKit
27.2/revision 2370 were downloaded and the native startup and full quest/badge
journeys were invoked for them. Both fail before application navigation because
the workspace's Linux browser dependencies are unavailable (GTK/GLib/X11 and
WebKit's GStreamer/ICU/media libraries). No game assertion ran in those cases.
The local Nix runtime investigation did not establish a usable version-matched
host; the downloads were restored afterward. Older preinstalled Nix browser
bundles are incompatible with the current driver and are not substituted.

The task's remaining verification requires running the documented default
matrix on a supported host with the version-matched browsers and their runtime
dependencies. A passing Chromium suite does not substitute for Firefox/WebKit
evidence. Missing graphics/audio on a successfully launched host can be reported
as explicit local diagnostic skips, but such skips are not release evidence.
Application failures after a successful blank-page preflight always fail.

### Evidence locations

- `generated-artifacts/pulse-runner/`: the full 48-case attempt, JSON/HTML report,
  passing renderer/audio/input attachments, and browser-setup failure traces.
- `generated-artifacts/pulse-runner-host/`: the browser installation and full
  matrix console logs; temporary local runtime investigation files.
- No output or downloaded browser binaries are committed or deployed.

---

## Earlier Chromium-only baseline

All 16 matrix cases have passing browser evidence. The full matrix passed 14
cases; the two desktop pause cases initially failed because the test pressed
Space while the effects switch was focused. Space correctly toggles that
switch without resuming. After correcting that test and explicitly asserting
the focused-switch behavior, **only those two cases** were rerun and both
passed. No production gameplay code was changed.

| Configuration | Startup/countdown | Real-input quests/results/retry/reload | Pause/reset/partial persistence | Effects controls |
| --- | --- | --- | --- | --- |
| Desktop WebGL2 | PASS | PASS — keyboard | PASS — targeted rerun | PASS |
| Desktop Canvas2D | PASS | PASS — keyboard | PASS — targeted rerun | PASS |
| 375px mobile WebGL2 | PASS | PASS — touchscreen | PASS | PASS |
| 375px mobile Canvas2D | PASS | PASS — touchscreen | PASS | PASS |

## Renderer evidence

Runtime: Nix-wrapped Chromium 138.0.7204.100 on Linux.

- **Desktop WebGL2:** Three.js running on actual ANGLE/SwiftShader WebGL2;
  13,004 native GL draw calls observed by the native-clock gameplay check.
- **Mobile WebGL2:** the same actual WebGL2 path; 25,846 GL draw calls observed.
- **Desktop Canvas2D:** WebGL disabled by browser flags and a fresh native
  WebGL2 context request returned null; 34,235 Canvas2D painting calls observed.
- **Mobile Canvas2D:** the same genuine compatibility path; 22,966 painting
  calls observed.
- WebGL checks required a non-lost context, `WebGL 2.0` version, zero GL error,
  and a connected, nonzero-sized canvas that issued draw calls. They did not
  accept the compatibility label or CPU projection tests as WebGL evidence.
- Native-clock startup checks resumed real AudioContexts and reached gameplay
  without overriding their clocks. Full quest journeys used deterministic
  clocks, production scoring/beatmaps, and trusted input as described in README.
- This verifies software-backed WebGL2, not physical GPU drivers, audible
  output quality, Bluetooth timing, Safari, or Firefox.

## Saved local evidence

- `generated-artifacts/pulse-runner-full-matrix/`: the complete initial matrix
  JSON/HTML report, renderer attachments, native-playing/live-quests/new-badge
  screenshots, and the original two desktop assertion failures.
- `generated-artifacts/pulse-runner/`: the successful two-case targeted rerun.
- The generated evidence is intentionally ignored by Git and deployment.
  Future full runs regenerate the standard `pulse-runner/` report.

Also passed: all 14 mission/lifecycle/projection unit tests, game typecheck,
browser-harness typecheck, a frozen-lockfile install, and production Vite build
with the required `PORT` and `BASE_PATH` set.
