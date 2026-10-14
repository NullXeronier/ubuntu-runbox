import { defineConfig, type Project } from '@playwright/test';
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';

const externalURL = process.env.PULSE_E2E_BASE_URL;
const localURL = 'http://127.0.0.1:25983';
// Replit/Nix Chromium is wrapped with its Linux libraries. Downloaded Playwright
// binaries alone cannot resolve those libraries on NixOS.
const systemChromium = process.env.PATH?.split(delimiter)
  .map((directory) => join(directory, 'chromium')).find((file) => existsSync(file));
const executablePath = process.env.PULSE_E2E_CHROMIUM ??
  (process.env.REPL_ID ? systemChromium : undefined);
const headed = process.env.PULSE_E2E_HEADED === '1';

if (process.env.CI && process.env.PULSE_E2E_ALLOW_UNSUPPORTED === '1') {
  throw new Error('PULSE_E2E_ALLOW_UNSUPPORTED is diagnostic-only and forbidden in CI.');
}

const projects: Project[] = (['chromium', 'firefox', 'webkit'] as const).flatMap((browserName) =>
  (['desktop', 'mobile'] as const).flatMap((device) =>
    (['webgl2', 'canvas2d'] as const).map((renderer) => ({
      // Preserve the original Chromium project names for existing commands.
      name: `${browserName === 'chromium' ? '' : `${browserName}-`}${device}-${renderer}`,
      metadata: {
        engine: browserName,
        renderer,
        input: device === 'mobile' ? 'touch' : 'keyboard',
        contextPolicy: renderer === 'canvas2d' ? 'injected-context-denial' : 'native',
      },
      use: {
        browserName,
        viewport: device === 'mobile' ? { width: 375, height: 812 } : { width: 1280, height: 800 },
        // Firefox supports trusted touch, but not mobile layout emulation.
        // Its small viewport is deliberately not claimed as Android coverage.
        isMobile: device === 'mobile' && browserName !== 'firefox',
        hasTouch: device === 'mobile',
        deviceScaleFactor: 1,
        launchOptions: browserName === 'chromium' ? {
          executablePath,
          headless: !headed,
          args: [
            '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl',
            '--enable-unsafe-swiftshader', '--disable-gpu-sandbox',
          ],
        } : { headless: !headed },
      },
    })),
  ),
);

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  // One game at a time: background tabs deliberately pause the audio clock.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  outputDir: '../../generated-artifacts/pulse-runner/results',
  reporter: [
    ['list'],
    ['html', { outputFolder: '../../generated-artifacts/pulse-runner/report', open: 'never' }],
    ['json', { outputFile: '../../generated-artifacts/pulse-runner/results.json' }],
  ],
  use: {
    baseURL: externalURL ?? localURL,
    reducedMotion: 'no-preference',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects,
  // Reuse the managed workflow locally; start the same command on clean CI.
  // An external target is never replaced by a second server.
  webServer: externalURL ? undefined : {
    command: 'pnpm run dev',
    env: { PORT: '25983', BASE_PATH: '/' },
    url: localURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
