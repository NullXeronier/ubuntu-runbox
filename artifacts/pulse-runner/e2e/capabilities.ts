import { expect, type Browser, type Page, type TestInfo } from '@playwright/test';

/**
 * Run before any app or instrumentation scripts. A failed app assertion must
 * never be reclassified as an unsupported host, nor run under another renderer.
 */
export async function checkCapabilities(page: Page, browser: Browser, info: TestInfo) {
  await page.goto('about:blank');
  const graphics = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    const result = {
      available: gl !== null,
      version: gl?.getParameter(gl.VERSION) as string | undefined,
      lost: gl?.isContextLost(),
      error: gl?.getError(),
      userAgent: navigator.userAgent,
      maxTouchPoints: navigator.maxTouchPoints,
      audioAPI: typeof AudioContext === 'function',
    };
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return result;
  });
  // Test audio independently of the game, with a real user gesture. A running
  // API whose native clock never advances (e.g. no host audio backend) cannot
  // support a rhythm startup test, even when the constructor exists.
  const audio = graphics.audioAPI ? await probeNativeAudio(page, info) : null;
  await info.attach('environment-capabilities', {
    body: JSON.stringify({
      engine: info.project.metadata.engine,
      browserVersion: browser.version(),
      platform: process.platform,
      graphics,
      audio,
      contextPolicy: info.project.metadata.contextPolicy,
    }, null, 2),
    contentType: 'application/json',
  });
  info.annotations.push({
    type: 'browser',
    description: `${info.project.metadata.engine} ${browser.version()} on ${process.platform}`,
  });

  const missing = [
    ...(!graphics.audioAPI ? ['native AudioContext API'] : []),
    ...(audio && (audio.state !== 'running' || audio.end <= audio.start)
      ? ['advancing native audio clock after trusted gesture'] : []),
    ...(info.project.metadata.renderer === 'webgl2' && !graphics.available ? ['native WebGL2 context'] : []),
  ];
  if (missing.length) {
    const reason = `Unsupported environment: ${missing.join(', ')} unavailable on a blank page; no application test or replacement renderer ran`;
    info.annotations.push({ type: 'unsupported-environment', description: reason });
    // Local diagnostics may disclose unsupported capabilities as SKIP.
    // Strict is the default (including CI); missing coverage cannot go green.
    if (process.env.PULSE_E2E_ALLOW_UNSUPPORTED === '1') {
      expect(process.env.CI, 'Diagnostic capability skips are forbidden in CI').toBeFalsy();
      info.skip(true, reason);
    }
    throw new Error(`${reason}. Use a supported browser host for release verification.`);
  }
  if (info.project.metadata.renderer === 'webgl2') {
    expect(graphics.version).toContain('WebGL 2.0');
    expect(graphics.lost).toBe(false);
    expect(graphics.error).toBe(0);
  }
}

async function probeNativeAudio(page: Page, info: TestInfo) {
  await page.setContent('<button id="enable-audio">Enable native audio</button>');
  await page.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>('#enable-audio')!;
    button.onclick = (event) => {
      button.dataset.trusted = String(event.isTrusted);
      const context = new AudioContext({ latencyHint: 'interactive' });
      // An empty graph may be idled by an engine even while state is "running".
      // Keep a real source scheduled, like the game does, but make it inaudible.
      const source = context.createOscillator();
      const mute = context.createGain();
      mute.gain.value = 0;
      source.connect(mute).connect(context.destination);
      source.start();
      // Store only on the disposable blank document, never on the game window.
      (window as unknown as { capabilityAudio: AudioContext }).capabilityAudio = context;
      void context.resume().catch((error: unknown) => {
        button.dataset.resumeError = String(error);
      });
    };
  });
  if (info.project.metadata.input === 'touch') await page.locator('#enable-audio').tap();
  else await page.locator('#enable-audio').click();
  return page.evaluate(async () => {
    const context = (window as unknown as { capabilityAudio: AudioContext }).capabilityAudio;
    const button = document.querySelector<HTMLButtonElement>('#enable-audio')!;
    const start = context.currentTime;
    // No Playwright clock is installed here.
    const deadline = performance.now() + 3_000;
    while (context.currentTime <= start + 0.05 && performance.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const report = {
      state: context.state,
      start,
      end: context.currentTime,
      sampleRate: context.sampleRate,
      trustedGesture: button.dataset.trusted === 'true',
      resumeError: button.dataset.resumeError ?? null,
    };
    await context.close();
    return report;
  }).then((report) => {
    expect(report.trustedGesture, 'Capability probe must use a native trusted gesture').toBe(true);
    return report;
  });
}
