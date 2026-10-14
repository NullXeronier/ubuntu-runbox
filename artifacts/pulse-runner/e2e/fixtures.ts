import { test as base, expect, type Page, type TestInfo } from '@playwright/test';

type DrawRecord = {
  kind: string;
  canvas: HTMLCanvasElement;
  context: RenderingContext;
  draws: number;
};

declare global {
  interface Window {
    __pulseProbe: {
      contexts: DrawRecord[];
      audio: AudioContext[];
      inputs: { type: string; code: string; trusted: boolean }[];
    };
  }
}

export const test = base.extend<{ guard: void }>({
  guard: [async ({ page }, use, info) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.addInitScript(() => {
      const probe = window.__pulseProbe = {
        contexts: [] as DrawRecord[],
        audio: [] as AudioContext[],
        inputs: [] as { type: string; code: string; trusted: boolean }[],
      };
      const native = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...args: unknown[]) {
        const context = (native as (kind: string, ...args: unknown[]) => RenderingContext | null).call(this, kind, ...args);
        if (context && !probe.contexts.some((record) => record.context === context)) {
          const record = { kind, canvas: this, context, draws: 0 };
          probe.contexts.push(record);
          const names = kind === '2d' ? ['fillRect', 'fill', 'stroke'] : ['drawElements', 'drawArrays'];
          for (const name of names) {
            const object = context as unknown as Record<string, (...args: unknown[]) => unknown>;
            const original = object[name];
            if (original) object[name] = function (...params: unknown[]) {
              const result = original.apply(context, params);
              record.draws++;
              return result;
            };
          }
        }
        return context;
      } as typeof native;
      const NativeAudio = window.AudioContext;
      window.AudioContext = new Proxy(NativeAudio, {
        construct(target, args) {
          const audio = Reflect.construct(target, args) as AudioContext;
          probe.audio.push(audio);
          return audio;
        },
      });
      window.addEventListener('keydown', (event) => {
        probe.inputs.push({ type: 'keyboard', code: event.code, trusted: event.isTrusted });
      }, true);
      window.addEventListener('pointerdown', (event) => {
        probe.inputs.push({ type: event.pointerType, code: (event.target as HTMLElement).dataset.testid ?? '', trusted: event.isTrusted });
      }, true);
    });
    await use();
    if (!page.isClosed()) {
      await info.attach('browser-errors', { body: JSON.stringify(errors, null, 2), contentType: 'application/json' });
      expect(errors, 'No uncaught JS, WebGL shader, or console errors').toEqual([]);
    }
  }, { auto: true }],
});

export { expect };

export async function pressButton(page: Page, info: TestInfo, id: string) {
  const button = page.getByTestId(id);
  // CSS entrance animation is disabled in deterministic tests. Force bypasses
  // Playwright's two-rAF stability wait while its clock is intentionally frozen;
  // these are still trusted browser mouse/touch events, not dispatchEvent().
  if (info.project.metadata.input === 'touch') await button.tap({ force: true });
  else await button.click({ force: true });
}

export async function checkRenderer(page: Page, info: TestInfo, label: string, clocked = false) {
  const expected = info.project.metadata.renderer as string;
  await expect.poll(async () => {
    // A reload reinstalls the init scripts, but Playwright's paused clock stays
    // paused. Permit real renderer frames rather than polling a frozen canvas.
    if (clocked) await page.clock.runFor(32);
    return page.evaluate(() => window.__pulseProbe.contexts
      .filter((record) => record.canvas.isConnected && record.draws > 0)
      .map((record) => record.kind));
  }).toContain(expected === 'webgl2' ? 'webgl2' : '2d');

  const report = await page.evaluate(() => window.__pulseProbe.contexts
    .filter((record) => record.canvas.isConnected)
    .map((record) => {
      const gl = record.kind === 'webgl2' ? record.context as WebGL2RenderingContext : null;
      return {
        kind: record.kind,
        draws: record.draws,
        width: record.canvas.width,
        height: record.canvas.height,
        version: gl?.getParameter(gl.VERSION) as string | undefined,
        lost: gl?.isContextLost(),
        error: gl?.getError(),
        softwareCanvas: record.canvas.dataset.testid === 'canvas-software',
      };
    }));
  expect(report).toHaveLength(1);
  expect(report[0]!.width).toBeGreaterThan(0);
  expect(report[0]!.height).toBeGreaterThan(0);
  if (expected === 'webgl2') {
    expect(report[0]!.version).toContain('WebGL 2.0');
    expect(report[0]!.lost).toBe(false);
    expect(report[0]!.error).toBe(0);
    expect(report[0]!.softwareCanvas).toBe(false);
    await expect(page.getByTestId('text-compat-renderer')).toHaveCount(0);
  } else {
    expect(report[0]!.softwareCanvas).toBe(true);
    await expect(page.getByTestId('text-compat-renderer')).toBeVisible();
    // Prove this is a genuine unavailable-context fallback, not a UI label.
    expect(await page.evaluate(() => document.createElement('canvas').getContext('webgl2') === null)).toBe(true);
  }
  const summary = `${info.project.name}: ${expected}; ${report[0]!.draws} real draw calls (${label})`;
  console.log(summary);
  info.annotations.push({ type: 'renderer', description: summary });
  await info.attach(`renderer-${label}`, { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
}

/**
 * Native Web Audio is still created/resumed and the real SynthMusic, engine,
 * beatmap, DOM handlers, scoring, and storage run. Only its clock getter follows
 * Playwright's virtual performance clock. No game imports, score setters,
 * direct game.hit calls, fake result screens, or seeded badges are used.
 * The separate startup test uses the untouched native audio clock.
 */
export async function openClockedGame(page: Page, info: TestInfo) {
  await page.clock.install();
  await page.addInitScript(() => {
    const descriptor = Object.getOwnPropertyDescriptor(AudioContext.prototype, 'currentTime') ??
      Object.getOwnPropertyDescriptor(BaseAudioContext.prototype, 'currentTime');
    if (!descriptor?.get) throw new Error('Native AudioContext clock getter is missing');
    const anchors = new WeakMap<AudioContext, { now: number; native: number }>();
    Object.defineProperty(AudioContext.prototype, 'currentTime', {
      configurable: true,
      get(this: AudioContext) {
        let anchor = anchors.get(this);
        if (!anchor) {
          anchor = { now: performance.now(), native: descriptor.get!.call(this) as number };
          anchors.set(this, anchor);
        }
        return anchor.native + (performance.now() - anchor.now) / 1000;
      },
    });
  });
  await page.goto('./');
  await expect(page.getByTestId('button-start')).toBeVisible();
  await checkRenderer(page, info, 'startup');
  // Animation scheduling is not the feature under test. Keep UI stable while
  // time is paused without changing the game's reduced-effects preference.
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
}

export async function assertTrustedLaneInput(page: Page, info: TestInfo) {
  const events = await page.evaluate(() => window.__pulseProbe.inputs);
  const type = info.project.metadata.input;
  expect(events.some((event) => event.trusted && (type === 'touch'
    ? event.type === 'touch' && event.code.startsWith('pad-lane-')
    : event.type === 'keyboard' && ['KeyD', 'KeyF', 'KeyJ', 'KeyK', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'ArrowRight'].includes(event.code)))).toBe(true);
}
