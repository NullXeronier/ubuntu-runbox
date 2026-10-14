# Playable Pulse Runner regression tests

## Personal-best browser support

Personal-best writes require the native Web Locks API in a secure context
(HTTPS or localhost): Chromium 69+, Firefox 96+, Safari 15.4+. All tabs running
this version serialize the entire read/compare/write under the same per-score
exclusive lock. Older already-open app versions must be reloaded to cooperate.
If locks are unavailable/rejected, or storage cannot be read/written, results
and earned session badges remain playable and the existing save warning appears.
There is intentionally no unlocked persistence fallback.

`concurrent-best.spec.ts` holds a real origin lock in a third tab until both
finished runs have queued saves, tests both score orderings with storage events
suppressed, and checks the final persisted maximum after both writers drain.
It also covers missing/rejected locks and denied reads without losing results.

Run from the workspace root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @workspace/pulse-runner exec playwright install chromium firefox webkit
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
On supported Linux CI hosts, install Playwright's documented OS libraries for
all three engines as well as downloading their version-matched browsers:

```sh
pnpm --filter @workspace/pulse-runner exec playwright install --with-deps chromium firefox webkit
CI=1 pnpm --filter @workspace/pulse-runner run test:e2e
```

The lockfile currently resolves Playwright 1.64.0: its bundled engines are
Chromium 156.0.8078.4, Firefox 157.0 (revision 1555), and WebKit 27.2 (revision
2370; OS-specific revisions can differ). Browser-version attachments record
what actually ran, including any system Chromium override. Do not reuse an
older Nix Playwright bundle with the newer driver: browser protocols differ.
WebKit is Safari's engine, **not** branded Safari or a real iPhone.

On Replit/NixOS the config automatically uses the `chromium` installed by this
project's Nix packages, with its runtime-library wrapper. A downloaded Linux
Playwright binary alone can fail to find `libglib-2.0.so.0` on NixOS. Outside
Replit the default remains Playwright's version-matched Chromium; the explicit
executable override takes precedence everywhere. This Chromium exception must
not leak into Firefox/WebKit launch options. Firefox and WebKit use the
version-matched bundled executables, not ordinary system Firefox/Safari.

Downloading these bundles does not install their runtime libraries on NixOS.
If Firefox/WebKit cannot launch or create a page, the result is a browser setup
failure, not an application regression, and not passing coverage. Run the same
matrix on a supported host with its dependencies; never substitute an older
incompatible browser or remove a failing project from the release command.

## Required matrix

| Project | Viewport | Lane input | Required renderer |
| --- | --- | --- | --- |
| desktop-webgl2 | 1280 × 800 | D/F/J/K and arrow keys | Actual Three.js WebGL2 |
| desktop-canvas2d | 1280 × 800 | D/F/J/K and arrow keys | Canvas2D compatibility |
| mobile-webgl2 | 375 × 812 | Trusted touchscreen taps on pads | Actual Three.js WebGL2 |
| mobile-canvas2d | 375 × 812 | Trusted touchscreen taps on pads | Canvas2D compatibility |
| firefox-desktop-webgl2 | 1280 × 800 | D/F/J/K and arrow keys | Actual Three.js WebGL2 |
| firefox-desktop-canvas2d | 1280 × 800 | D/F/J/K and arrow keys | Canvas2D compatibility |
| firefox-mobile-webgl2 | 375 × 812 | Trusted touchscreen taps on pads | Actual Three.js WebGL2 |
| firefox-mobile-canvas2d | 375 × 812 | Trusted touchscreen taps on pads | Canvas2D compatibility |
| webkit-desktop-webgl2 | 1280 × 800 | D/F/J/K and arrow keys | Actual Three.js WebGL2 |
| webkit-desktop-canvas2d | 1280 × 800 | D/F/J/K and arrow keys | Canvas2D compatibility |
| webkit-mobile-webgl2 | 375 × 812 | Trusted touchscreen taps on pads | Actual Three.js WebGL2 |
| webkit-mobile-canvas2d | 375 × 812 | Trusted touchscreen taps on pads | Canvas2D compatibility |

Firefox's mobile rows use a narrow viewport and native trusted touch;
`isMobile` is intentionally off because Playwright Firefox does not implement
mobile layout emulation. These rows do not certify Android Firefox or hardware.

All four journeys run in every project (48 test cases). Nothing is silently
skipped or downgraded when WebGL fails. Chromium WebGL projects enable
ANGLE/SwiftShader: this is
software-backed **real WebGL2**, including Three.js startup, GLSL compilation,
and draw calls, not a CPU projection check. It does not certify physical GPU
drivers or device audio latency. Firefox/WebKit request their native WebGL2,
without Chromium flags or executable overrides.

Every compatibility project uses explicit fault injection: an init script
rejects `getContext('webgl2'/'webgl'/'experimental-webgl')` at the browser API
boundary. Actual Canvas2D paint calls and rejected context requests are required.
This exercises the production fallback without changing the app's capability
check. Reports label this **injected-context-denial**, not a claim that the
engine naturally lacks WebGL. WebGL projects never install that denial.

Every test has a context/draw-call probe. Reports assert which connected canvas
actually drew, check nonzero dimensions, and for WebGL check the native version,
context-loss state, and GL error. The compatibility run also asserts that a
fresh `getContext('webgl2')` fails under the recorded denial policy. Renderer evidence is printed and
attached to the report; console/uncaught errors fail a test.

## Unsupported hosts versus application failures

Before loading any application code or installing instrumentation, each test
probes a disposable blank document in its configured engine/device context.
`environment-capabilities` records browser version, native WebGL2 availability,
version/error/loss state, user agent, touch capability, and native audio state,
sample rate and advancing clock after a trusted mouse/touch gesture. This
isolates a genuinely missing graphics/audio capability from game startup,
shader, input or scoring failures.

- **Default/release mode:** missing required capabilities fail explicitly.
  Browser launch/page-creation errors also fail; they are never caught and
  converted into app passes.
- **Local diagnostics only:** `PULSE_E2E_ALLOW_UNSUPPORTED=1` permits an explicit
  SKIP only when the blank-page probe establishes a missing capability. The
  report includes `unsupported-environment` with the reason. It does not
  select Canvas2D in a WebGL project or suppress later application failures.
  This setting is forbidden in CI; skips do not count as release evidence.
- **App failure:** if the blank-page capability exists but the game falls back,
  fails to create its Three.js context, fails shaders/draws, fails to resume
  audio, or misses a journey assertion, the test fails even in diagnostics.

For hosts that only expose graphics with a display, use a display-equipped
runner and `PULSE_E2E_HEADED=1` (on Linux, under an appropriately configured
Xvfb/Mesa setup). Capability checks still apply; headed mode never fabricates
WebGL support. Audible output and physical latency remain outside these tests.

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
pnpm --filter @workspace/pulse-runner run test:e2e --project=firefox-desktop-webgl2 --project=webkit-mobile-canvas2d
# Local-only explicit unsupported capability reporting; not release evidence:
PULSE_E2E_ALLOW_UNSUPPORTED=1 pnpm --filter @workspace/pulse-runner run test:e2e
```

`generated-artifacts/pulse-runner/` contains the HTML report, machine-readable
`results.json`, renderer attachments, native-playing/live-quest/result
screenshots, and failure traces/screenshots. Outputs are ignored by Git and
deployment packaging. The default is one worker and no retries, so a flaky
failure cannot silently pass on retry. Keeping one foreground game avoids the
intentional blur/background auto-pause behavior.

The existing mission/lifecycle and projection unit tests remain fast,
complementary checks; they do **not** stand in for WebGL startup.
