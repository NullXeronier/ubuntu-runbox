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

All four journeys run in every project (16 test cases). Nothing is skipped
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
