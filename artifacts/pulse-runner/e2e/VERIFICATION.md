# Browser regression verification — 2026-10-14

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
