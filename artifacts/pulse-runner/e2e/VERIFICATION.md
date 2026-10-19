# Browser regression verification — 2026-10-19


## Current scope: Chromium and Firefox; Safari/WebKit excluded

**Verified after integrating newer main-branch changes: 32/32 passed in 3.2
minutes, zero failures, skips or retries.**

- [Successful integrated Ubuntu 24.04 run](https://github.com/NullXeronier/ubuntu-runbox/actions/runs/39226700320)
- Tested source: `a7d223c`; Playwright 1.64.0; Chromium 156.0.8078.4 and Firefox 157.0.
- Eight projects cover desktop keyboard and narrow-viewport trusted touch,
  each with actual WebGL2 and injected-context-denial Canvas2D rendering.
- All four journeys passed per project: untouched native-clock startup,
  complete quest/badge lifecycle, pause/reset persistence, and effects settings.
- Native capability attachments show running, advancing audio clocks and
  available WebGL2 with no context loss or GL errors. Renderer attachments
  confirm real draw calls rather than silently substituted projections.
- Both typechecks, 14 game unit tests and nine report-audit tests passed.
- The 32-case evidence gate passed on the runner and against the downloaded
  report at `generated-artifacts/linux-integrated/pulse-runner-linux-39226700320-1/pulse-runner/results.json`.
- Reports, screenshots and runtime logs are attached to the linked GitHub run
  (14-day retention); downloaded evidence is intentionally ignored by Git.

This verifies browser-engine behavior under software-backed graphics and a
native PulseAudio null sink, not physical GPU drivers, audible output or
headphone latency. Firefox touch uses a narrow desktop context, not Android
layout emulation. Safari/WebKit is not certified or included in the matrix.

The cross-engine workflow explicitly selects the four `@cross-engine` core
journeys. The unfiltered test command preserves the additional storage and
concurrent-tab cases from main (248 total cases at verification time); those
additional cases are outside this 32-case evidence claim. Context-level probe
installation and error capture are retained for new tabs.

The earlier pre-integration run also passed all 32 cases:
[initial successful run](https://github.com/NullXeronier/ubuntu-runbox/actions/runs/38536828494).

The user explicitly excluded Safari/WebKit. The required release matrix now
contains 32 cases in eight Chromium/Firefox projects. The initial Ubuntu run
was cancelled during WebKit execution after the scope change, not counted as a
passing release. Its completed Chromium/Firefox cases had 31 passes and one
test-harness failure: a 100 ms `clock.pauseAt` target expired before the protocol
command arrived. All native-clock startup and full quest/badge journeys passed.
The harness now uses a full test-timeout virtual-time margin before any run
starts; the successful run above verifies that revised suite.

GitHub token authentication successfully uploaded the test branch and started
the Ubuntu workflow. The earlier connection blocker is resolved.

## Historical investigation (before scope change)

The notes below describe superseded local setup attempts and the original
three-engine scope. The verified result and scope above are authoritative.

### Linux runner follow-up

A dedicated Ubuntu 24.04 workflow and Linux runner script are now prepared.
They use version-matched browser downloads, Xvfb/Mesa, a private native
PulseAudio null sink, and an explicit 48-case evidence gate. The workflow
retains reports and runtime logs on failure. The evidence gate has isolated
unit tests for complete reports, omissions, skipped/failed cases, missing
attachments, retries and global failures.

**The Linux workflow has not been executed yet.** The user connected GitHub
and supplied a repository, now configured as `origin`. After a connection retry,
`git ls-remote` succeeded and returned no refs (an empty repository). However,
pushing `HEAD:refs/heads/ci/pulse-browser-matrix` was rejected with
`Invalid username or token`; the GitHub CLI also reports no authentication.
Read access therefore does not establish usable write authentication, despite
the connection reporting healthy authorization with repository/workflow scopes.
No test branch was pushed, workflow dispatched, default branch changed, or
deployment performed. Repository authentication must work before dispatch and
before any Firefox/WebKit pass can be claimed. These files are runner
configuration, not new passing browser evidence.

The default configuration now invokes the same four journeys in 12 projects
(48 cases): Chromium, Firefox and WebKit, each with keyboard/375px trusted-touch
input and explicit native-WebGL2/forced-Canvas2D coverage. The original Chromium
names are preserved. Firefox's narrow touch viewport is not Android mobile
layout emulation; Playwright does not support Firefox `isMobile`. WebKit
automation is engine coverage, not branded Safari or real iPhone certification.

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

## Storage-failure browser regressions — 2026-10-14

Added six storage-failure journeys per configuration, expanding the suite to
40 matrix cases. The targeted storage run passed **24/24**, with no skips,
retries, flaky results, uncaught JavaScript errors, or console errors, in
119.3 seconds:

```sh
pnpm --filter @workspace/pulse-runner run test:e2e --grep 'storage faults:'
```

| Configuration | Accessor denied | Reads/writes denied | Writes denied | Invalid JSON | Invalid badge list | Effects write denied |
| --- | --- | --- | --- | --- | --- | --- |
| Desktop WebGL2 / keyboard | PASS | PASS | PASS | PASS | PASS | PASS |
| Desktop Canvas2D / keyboard | PASS | PASS | PASS | PASS | PASS | PASS |
| Mobile WebGL2 / touch | PASS | PASS | PASS | PASS | PASS | PASS |
| Mobile Canvas2D / touch | PASS | PASS | PASS | PASS | PASS | PASS |

- Blocked-storage checks earned combo and finish badges with trusted lane
  inputs, continued scoring after a denied write, and showed warnings in the
  menu, HUD, and results. Badges remained ALREADY EARNED on retry in the same
  session, but a real reload showed zero badges and no saved personal best.
  Native storage reads confirmed that the failed writes had stored nothing.
- Damaged JSON and an invalid list containing both a known and unknown badge
  awarded nothing, warned before and after reload, and were not silently
  overwritten at startup. A genuine track finish saved only First Contact,
  cleared the warning, and retained only that badge on reload.
- Effects-only write failures visibly warned in menu and pause. Changes applied
  immediately for the session without resuming pause, altering score/combo, or
  preventing the next trusted hit after resume. Quest saves still worked.
  Reload restored the OS reduced-motion default rather than the unsaved choice.
- All configurations required actual draw calls from their expected renderer,
  including after reload. The normal app preview also rendered successfully
  using its compatibility renderer. No production gameplay code was changed.

The first full-suite attempt passed all 16 unchanged baseline cases. The new
blocked-storage cases stopped at an incorrect test expectation of 34,000 points
for 21 perfect hits; the correct combo-multiplied score is 35,000. That attempt
hit the five-minute command limit before its final storage cases. After fixing
only that expectation, all 24 storage cases were run to completion as above.
Together the two attempts cover all 40 cases; this is not a claim of a single
uninterrupted 40-case run.

Also passed in this task: all 14 unit tests, game typecheck, browser-harness
typecheck, and a clean managed workflow startup. Native-clock startup checks in
the unchanged baseline still use unmodified audio time; storage fault journeys
use the deterministic clock and do not certify audible hardware timing.

Current JSON/HTML reports, `storage-*` operation/saved-value attachments,
renderer evidence, and session-only results screenshots are in the ignored
`generated-artifacts/pulse-runner/` directory. The interrupted initial attempt's
available traces/screenshots are retained separately in
`generated-artifacts/pulse-runner-storage-initial-matrix/`.


## Concurrent WebGL startup investigation — 2026-10-19 — initial failed evidence

The test-only scheduling changes remove the unnecessary animated lock-holder
and storage-reader tabs. Both actual score-writing games remain alive, render
normally, and finish through trusted lane input. The shared Playwright clock is
installed and paused once per browser context before game navigation. Renderer
checks foreground their page and verify visibility as well as the existing
draw-call, dimensions, WebGL version, context-loss, and GL-error assertions.
Queue length is now checked after each run to prove the requested queue order;
renderer checks also cover each queued result and the saved-best reload.
No production gameplay/persistence code, launch flags, retry counts, timeouts,
or fatal browser-error assertions were changed.

A preliminary baseline sample completed the first two desktop concurrent-save
cases in 28.3 and 31.2 seconds before that diagnostic run was stopped. The
updated five-repeat desktop/mobile WebGL run completed **18/20**, generally
around 7–10 seconds per successful case. Renderer startup passed, but one case
lost the higher saved score (`1000` instead of `3000`), and another navigated
unexpectedly back to the menu during countdown. The navigation coincided with
documentation edits during the live dev-server run; its exact cause was not
proven. This is not a passing stress result.

An additional ten-repeat desktop higher-first diagnostic run with temporary,
read-only storage-operation logging passed **10/10**. That instrumentation was
removed, and this diagnostic pass is **not** used to dismiss the failing save.

## Concurrent WebGL startup investigation — 2026-10-19 — initial failed evidence

The test-only scheduling changes remove the unnecessary animated lock-holder
and storage-reader tabs. Both actual score-writing games remain alive, render
normally, and finish through trusted lane input. The shared Playwright clock is
installed and paused once per browser context before game navigation. Renderer
checks foreground their page and verify visibility as well as the existing
draw-call, dimensions, WebGL version, context-loss, and GL-error assertions.
Queue length is now checked after each run to prove the requested queue order;
renderer checks also cover each queued result and the saved-best reload.
No production gameplay/persistence code, launch flags, retry counts, timeouts,
or fatal browser-error assertions were changed.

A preliminary baseline sample completed the first two desktop concurrent-save
cases in 28.3 and 31.2 seconds before that diagnostic run was stopped. The
updated five-repeat desktop/mobile WebGL run completed **18/20**, generally
around 7–10 seconds per successful case. Renderer startup passed, but one case
lost the higher saved score (`1000` instead of `3000`), and another navigated
unexpectedly back to the menu during countdown. The navigation coincided with
documentation edits during the live dev-server run; its exact cause was not
proven. This is not a passing stress result.

An additional ten-repeat desktop higher-first diagnostic run with temporary,
read-only storage-operation logging passed **10/10**. That instrumentation was
removed, and this diagnostic pass is **not** used to dismiss the failing save.

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


### Evidence locations

- `generated-artifacts/pulse-runner/`: the full 48-case attempt, JSON/HTML report,
  passing renderer/audio/input attachments, and browser-setup failure traces.
- `generated-artifacts/pulse-runner-host/`: the browser installation and full
  matrix console logs; temporary local runtime investigation files.
- No output or downloaded browser binaries are committed or deployed.

---

## Historical investigation (before scope change)

The notes below describe superseded local setup attempts and the original
three-engine scope. The verified result and scope above are authoritative.

### Independently reproduced storage-coherence blocker

`diagnose-best-storage.mjs` uses three empty same-origin pages, real exclusive
Web Locks, and unmodified native localStorage. Both writers queue behind a
holder in a confirmed order. The higher writer reads/compares/writes `3000`
inside its lock; the lower writer then reads/compares/writes inside its lock.
No engine, renderer, audio, injected scores, or storage implementation is used.

With Nix-wrapped Chromium **138.0.7204.100**, all four diagnostic modes reproduced
a stale second read and actual loss of the maximum:

| Clock | Notifications | First failure iteration | Reads inside locks | Fresh-tab saved value |
| --- | --- | --- | --- | --- |
| Native | Live | 90 | `null`, `null` | `1000` |
| Native | Suppressed | 2 | `null`, `null` | `1000` |
| Virtual/paused | Live | 10 | `null`, `null` | `1000` |
| Virtual/paused | Suppressed | 8 | `null`, `null` | `1000` |

All matching locks had drained before the fresh-tab read. This independently
shows that the lost maximum is not caused by WebGL load, virtual clocks, or
suppression of the app's storage-event notifications. Making the test pass by
sleeping between writers, reseeding the maximum, or relaxing the final-value
assertion would hide a real persistence defect.

**Acceptance criterion blocked at this stage:** repeated concurrent-save runs could not honestly
be called reliable until score persistence provided coherent cross-tab reads
and writes, while preserving existing saved bests. This requires production
persistence work beyond the original renderer/test-fixture scope. The user
subsequently approved that scope expansion; the results below supersede this
initial investigation, not the retained evidence of the old algorithm's defect.

Other checks passed: browser-harness typecheck, game typecheck, all 18 configured
unit tests, and normal preview rendering (compatibility renderer). The complete
browser matrix was not rerun after discovering the independent storage blocker.
Evidence is in ignored `generated-artifacts/pulse-runner-investigation/`:
`first-stress.json`, `first-stress-results/` (failure traces/screenshots), and
`native-storage.json`. The standalone diagnostic remains committed so a clean
workspace can reproduce the blocker without those generated files.


## Atomic persistence and repeated WebGL verification — 2026-10-19 — PASS

After the user approved the persistence scope expansion, score saving now uses
an authoritative IndexedDB read/maximum/write transaction under the original
per-score Web Lock, held until commit. Existing localStorage values are retained
and merged as compatibility mirrors. No legacy bests are deleted. Menu/reload
reads consult both stores, and old async completions are generation-guarded.
Missing APIs, denied reads/writes, and database failures remain explicit errors,
not an unlocked or localStorage-only fallback.

The complete Chromium matrix then passed in one uninterrupted run:

```sh
pnpm --filter @workspace/pulse-runner exec playwright test --retries=0 --max-failures=4
```

| Configuration | Passed | Skipped | Failed / flaky | Retries |
| --- | --- | --- | --- | --- |
| Desktop WebGL2 | 35 | 0 | 0 | 0 |
| Desktop Canvas2D | 35 | 0 | 0 | 0 |
| Mobile WebGL2 | 35 | 0 | 0 | 0 |
| Mobile Canvas2D | 35 | 0 | 0 | 0 |
| **Total** | **140** | **0** | **0** | **0** |

Duration: **534.1 seconds**. This includes the native-clock startup checks, all
existing score/quest/calibration/storage-fault journeys, delayed-save release
and rejection after replay/difficulty changes, and the new legacy-import,
stale-mirror reload, track/difficulty isolation, and IndexedDB failure checks.
All 140 fatal browser-error reports were empty. Actual WebGL2 draw calls, a
non-lost context, zero GL error, and the required renderer were verified.

Immediately afterward, both concurrent queue orderings were repeated five times
on each WebGL viewport:

```sh
pnpm --filter @workspace/pulse-runner exec playwright test concurrent-best.spec.ts \
  --grep 'concurrent saves' --project desktop-webgl2 --project mobile-webgl2 \
  --repeat-each=5 --retries=0
```

**20/20 passed** in **162.9 seconds** (10 desktop, 10 mobile), with zero skips,
failures, flaky outcomes, retries, or browser errors. Both real games remained
alive until both writers drained. Each queued result and the reloaded menu had
renderer evidence; native IndexedDB and the compatibility mirror both retained
the maximum. No score seeding, storage delay, renderer fallback, reduced scene,
timeout increase, or weakened assertion was used to make this run pass.

Also passed: **28 unit tests**, game typecheck, browser-harness typecheck, and
normal managed-workflow startup. The preview screenshot rendered correctly
through the compatibility path; the independent Playwright reports establish
the WebGL2 evidence. No Safari/Firefox or physical GPU/audio claims are made.

Final generated reports (ignored by Git/deployment):
- `generated-artifacts/pulse-runner-full-atomic/`: complete 140-case JSON/HTML
  reports, renderer evidence, and screenshots.
- `generated-artifacts/pulse-runner/`: final 20-case repeat JSON/HTML reports
  and renderer/error attachments.

The retained legacy-only diagnostic still demonstrates why the former algorithm
was unsafe; its intentionally failing result is not a failure of the current
transactional persistence implementation.
