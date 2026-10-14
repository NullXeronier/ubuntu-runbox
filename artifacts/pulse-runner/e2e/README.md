# Playable Pulse Runner regression tests

Run from the workspace root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @workspace/pulse-runner exec playwright install chromium
pnpm --filter @workspace/pulse-runner run test:unit
pnpm --filter @workspace/pulse-runner run test:e2e:types
pnpm --filter @workspace/pulse-runner run test:e2e
```

The browser command reuses the managed game workflow on port 25983, or starts
the same dev command if it is not running. On CI it starts its own server and
fails if that port is occupied. No API, database, accounts, or saved player data
are needed. Each test gets a fresh browser context and empty localStorage.

To target an already running app instead, set `PULSE_E2E_BASE_URL` to its full
URL **with a trailing slash**, including any artifact base path. For example,
`PULSE_E2E_BASE_URL="https://<development-domain>/"`. The tests use relative
navigation and will not start a replacement server in this mode. If Chromium
is supplied by the environment, `PULSE_E2E_CHROMIUM` can name its executable.
On Linux outside Replit, install Playwright's documented Chromium OS libraries
as part of CI setup as well as downloading its browser.

On Replit/NixOS the config automatically uses the `chromium` installed by this
project's Nix packages, with its runtime-library wrapper. A downloaded Linux
Playwright binary alone can fail to find `libglib-2.0.so.0` on NixOS. Outside
Replit the default remains Playwright's version-matched Chromium; the explicit
executable override takes precedence everywhere.

## Required matrix

| Project | Viewport | Lane input | Required renderer |
| --- | --- | --- | --- |
| desktop-webgl2 | 1280 × 800 | D/F/J/K and arrow keys | Actual Three.js WebGL2 |
| desktop-canvas2d | 1280 × 800 | D/F/J/K and arrow keys | Canvas2D compatibility |
| mobile-webgl2 | 375 × 812 | Trusted touchscreen taps on pads | Actual Three.js WebGL2 |
| mobile-canvas2d | 375 × 812 | Trusted touchscreen taps on pads | Canvas2D compatibility |

All seventeen journeys run in every project (68 test cases). Nothing is skipped
when WebGL fails. WebGL projects enable Chromium ANGLE/SwiftShader: this is
software-backed **real WebGL2**, including Three.js startup, GLSL compilation,
and draw calls, not a CPU projection check. It does not certify physical GPU
drivers or device audio latency. Compatibility projects disable WebGL using
browser launch flags, not by changing the app's capability check.

Every test has a context/draw-call probe. Reports assert which connected canvas
actually drew, check nonzero dimensions, and for WebGL check the native version,
context-loss state, and GL error. The compatibility run also asserts that a
fresh native `getContext('webgl2')` fails. Renderer evidence is printed and
attached to the report; console/uncaught errors fail a test.

## What runs

1. **Unmodified native-clock startup:** Start through the UI, see a countdown,
   wait for real audio time to enter gameplay, require a running native
   AudioContext and actual renderer draw calls, then pause.
2. **Full badge lifecycle:** advance countdown 4/3/2/1, ignore countdown input,
   hit 40 real EASY notes using keyboard or touch; assert live score/quest
   values below and at thresholds (19/20 combo, 39/40 perfects,
   99,000/100,000 points), completion toasts, and first-track completion only
   when the track ends. Check all four NEWLY EARNED result badges. Retry must
   clear score/combo/new flags, a subsequent unplayed finish must show ALREADY
   EARNED, and the earned board must survive a real page reload.
3. **Pause/reset rules:** pause and resume both countdown and play; advance five
   seconds while paused, attempt input, and prove score/combo/progress freeze.
   Change effects while paused (including keyboard Space on the focused switch
   without accidentally resuming), resume and hit the next note. Restart clears
   unfinished progress; quitting after earning only the combo badge preserves
   it but resets perfect/score quests and never awards finish. Reload confirms
   the same partial badge state.
4. **Reduced effects:** OS reduced-motion default, explicit OFF overriding that
   default after reload, and explicit ON persistence without switching renderer.
5. **Blocked storage (three journeys):** deny the `localStorage` accessor, deny
   reads and writes, or allow reads but reject writes with a quota error. Check
   the menu warning (immediate when reads fail, after earning when only writes
   fail), HUD warning, and results warning. Earn combo/finish badges with trusted
   input, keep scoring after the failed save, retry with session-only ALREADY
   EARNED badges, then reload and require zero saved badges and no saved best.
6. **Damaged quests (two journeys):** invalid JSON and a valid-looking badge
   mixed with an unknown badge must warn and award nothing, including on reload.
   A real-input track finish replaces the damaged document with just the
   genuinely earned badge, clears the warning, and survives the next reload.
7. **Effects save failure:** reject only effects writes. Menu and paused
   controls must visibly warn while immediately changing effects; pause still
   freezes score/combo and resume accepts the next trusted note. Quest saves
   continue to work. Reload restores the OS effects default, not the failed
   preference, while retaining the independently saved quest badge.
8. **Calibration storage failures (seven journeys):** deny timing reads,
   deny reads and writes, or deny writes with absent/existing saved offsets.
   Also load malformed JSON, an out-of-range number, and a wrong-type value.
   Check menu/dialog warnings, applied-versus-saved status, manual adjustment,
   reset, and reopening. Trusted lane input at +180 ms must score PERFECT
   after closing the dialog. Reload returns to 0 ms for denied reads or an
   absent save, the prior offset for a rejected overwrite, or the repaired
   saved value when writes succeed. Independently earned/saved quests and an
   effects preference must remain unchanged. These are storage/UI checks,
   not measurements of physical headphone latency or device-profile switching.

The deterministic journeys use Playwright's virtual clock and make the
`AudioContext.currentTime` getter follow its virtual `performance.now`.
Native Web Audio objects still prepare/resume and the production scheduler,
engine, complete beatmap, scoring, missions, and localStorage run unchanged.
We jump between independently specified beat times and send trusted browser
keyboard/touch events. Tests never import the live game singleton, call
`game.hit`, set stats, shorten tracks, inject badges, or fabricate result
screens. This keeps timing repeatable under slow software WebGL. Scheduling
and audible sound are not certified by virtual-clock tests; the separate
native-clock test intentionally leaves the audio clock untouched.

Entrance animations are disabled only in clocked tests so they do not hang on
frozen frames. Reduced-effects tests also run with normal clocks and normal CSS.
The separate effects-save-failure journey uses the deterministic clock.

Storage faults are installed before application startup and reinstated on each
reload in that test's isolated browser context. They throw native `DOMException`
errors only at the storage boundary; they never inject mission progress, scores,
or game state. The damaged-data cases seed only invalid documents, never earned
badges, and do not overwrite repaired data on reload. A read-only native storage
probe records attempted/denied operations and checks the actual saved strings,
so an in-memory badge cannot be mistaken for successful persistence. These
reports are attached as `storage-*` JSON evidence alongside session-only results
screenshots. The same console/uncaught-error guard applies to all fault cases.

## Results and debugging

```sh
pnpm --filter @workspace/pulse-runner run test:e2e:report
# Focus on a particular renderer/device without changing the suite:
pnpm --filter @workspace/pulse-runner run test:e2e --project=mobile-webgl2
```

`generated-artifacts/pulse-runner/` contains the HTML report, machine-readable
`results.json`, renderer attachments, native-playing/live-quest/result
screenshots, and failure traces/screenshots. Outputs are ignored by Git and
deployment packaging. The default is one worker and no retries, so a flaky
failure cannot silently pass on retry. Keeping one foreground game avoids the
intentional blur/background auto-pause behavior.

The existing mission/lifecycle and projection unit tests remain fast,
complementary checks; they do **not** stand in for WebGL startup.
