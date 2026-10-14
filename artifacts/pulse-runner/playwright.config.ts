import { defineConfig } from '@playwright/test';
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
    browserName: 'chromium',
    reducedMotion: 'no-preference',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Optional system Chromium for environments that cannot download browsers.
    launchOptions: { executablePath },
  },
  projects: [
    ...(['desktop', 'mobile'] as const).flatMap((device) =>
      (['webgl2', 'canvas2d'] as const).map((renderer) => ({
        name: `${device}-${renderer}`,
        metadata: { renderer, input: device === 'mobile' ? 'touch' : 'keyboard' },
        use: {
          viewport: device === 'mobile' ? { width: 375, height: 812 } : { width: 1280, height: 800 },
          isMobile: device === 'mobile',
          hasTouch: device === 'mobile',
          deviceScaleFactor: 1,
          launchOptions: {
            executablePath,
            args: renderer === 'webgl2'
              ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox']
              : ['--disable-webgl', '--disable-webgl2'],
          },
        },
      })),
    ),
  ],
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
