import { test, expect, pressButton, checkRenderer, openClockedGame, assertTrustedLaneInput } from './fixtures';
import { RunDriver } from './driver';

test('native-clock renderer/audio startup and visible countdown reach gameplay', async ({ page }, info) => {
  await page.goto('./');
  await expect(page.getByTestId('text-missions-count')).toHaveText('0 / 4 COMPLETE');
  await checkRenderer(page, info, 'native-clock');
  await pressButton(page, info, 'button-start');
  await expect(page.getByTestId('text-countdown')).toBeVisible();
  await expect(page.getByTestId('text-countdown')).toHaveText(/[1-4]/);
  await expect(page.getByTestId('text-countdown')).toBeHidden({ timeout: 8_000 });
  await expect(page.getByTestId('button-pause')).toBeVisible();
  expect(await page.evaluate(() => window.__pulseProbe.audio.map((audio) => audio.state))).toEqual(['running']);
  await checkRenderer(page, info, 'native-playing');
  await info.attach('native-playing', { body: await page.screenshot(), contentType: 'image/png' });
  await pressButton(page, info, 'button-pause');
  await expect(page.getByTestId('panel-paused')).toBeVisible();
});

test('real lane inputs advance live quests; new badges become already earned after retry and survive reload', async ({ page }, info) => {
  await openClockedGame(page, info);
  await pressButton(page, info, 'button-difficulty-easy');
  const run = await RunDriver.start(page, info);
  // Lane controls must not score or produce misses during countdown.
  await run.input(0);
  await expect(page.getByTestId('text-score')).toHaveText('0');
  await expect(page.getByTestId('text-combo')).toHaveText('0');
  await pressButton(page, info, 'button-toggle-missions');
  const quests = page.getByTestId('list-hud-missions');
  await expect(quests).toContainText('First Contact0/1');
  await run.songTime(-1.3);
  await expect(page.getByTestId('text-countdown')).toHaveText('3');
  await run.songTime(-0.8);
  await expect(page.getByTestId('text-countdown')).toHaveText('2');
  await run.songTime(-0.3);
  await expect(page.getByTestId('text-countdown')).toHaveText('1');

  for (let i = 0; i < 40; i++) {
    await run.hit(i);
    if (i === 0) {
      await expect(page.getByTestId('text-countdown')).toHaveCount(0);
      await expect(page.getByTestId('text-score')).toHaveText('1,000');
      await expect(page.getByTestId('text-focus-mission')).toHaveText('Chain Reaction 1/20');
      await expect(quests).toContainText('Precision Protocol1/40');
      await expect(quests).toContainText('Neon Legend1,000/100,000');
    }
    if (i === 18) {
      await expect(quests).toContainText('Chain Reaction19/20');
      await expect(page.getByTestId('toast-mission')).toHaveCount(0);
    }
    if (i === 19) {
      await expect(quests).toContainText('Chain ReactionDONE');
      await expect(page.getByTestId('toast-mission')).toContainText('Chain Reaction');
      await expect(page.getByTestId('text-score')).toHaveText('32,000');
    }
    if (i === 38) {
      await expect(quests).toContainText('Precision Protocol39/40');
      await expect(quests).toContainText('Neon Legend99,000/100,000');
    }
  }
  await expect(quests).toContainText('Precision ProtocolDONE');
  await expect(quests).toContainText('Neon LegendDONE');
  await expect(quests).toContainText('First Contact0/1');
  await expect(page.getByTestId('text-score')).toHaveText('103,000');
  await expect(page.getByTestId('toast-mission')).toContainText('Precision Protocol');
  await expect(page.getByTestId('toast-mission')).toContainText('Neon Legend');
  await assertTrustedLaneInput(page, info);
  await checkRenderer(page, info, 'scoring');
  await info.attach('live-quests', { body: await page.screenshot(), contentType: 'image/png' });

  await run.finish();
  await expect(page.getByTestId('text-final-score')).toHaveText('103,000');
  await expect(page.getByTestId('text-perfect')).toHaveText('40');
  await expect(page.getByTestId('text-maxcombo')).toHaveText('40');
  for (const id of ['first-run', 'combo-20', 'perfect-40', 'score-100k']) {
    await expect(page.getByTestId(`badge-new-${id}`)).toHaveText('NEWLY EARNED');
    await expect(page.getByTestId(`badge-earned-${id}`)).toHaveCount(0);
  }
  await info.attach('new-badges', { body: await page.screenshot(), contentType: 'image/png' });
  const retry = await RunDriver.start(page, info, 'button-retry');
  await expect(page.getByTestId('panel-results')).toHaveCount(0);
  await expect(page.getByTestId('text-focus-mission')).toHaveCount(0);
  await expect(page.getByTestId('hud-missions')).toContainText('ALL QUESTS COMPLETE');
  await expect(page.getByTestId('toast-mission')).toHaveCount(0);
  await retry.finish();
  await expect(page.getByTestId('text-final-score')).toHaveText('0');
  await expect(page.getByTestId('text-perfect')).toHaveText('0');
  for (const id of ['first-run', 'combo-20', 'perfect-40', 'score-100k']) {
    await expect(page.getByTestId(`badge-earned-${id}`)).toHaveText('ALREADY EARNED');
    await expect(page.getByTestId(`badge-new-${id}`)).toHaveCount(0);
  }
  await pressButton(page, info, 'button-menu');
  await page.reload();
  await expect(page.getByTestId('text-missions-count')).toHaveText('4 / 4 COMPLETE');
  for (const id of ['first-run', 'combo-20', 'perfect-40', 'score-100k']) {
    await expect(page.getByTestId(`badge-complete-${id}`)).toHaveText('DONE');
  }
  await checkRenderer(page, info, 'reload', true);
});

test('pause/resume freezes progress; restart/quit reset unfinished quests but keep earned badges', async ({ page }, info) => {
  await openClockedGame(page, info);
  await pressButton(page, info, 'button-difficulty-easy');
  let run = await RunDriver.start(page, info, 'button-start', info.project.metadata.input === 'keyboard');
  // Pause during countdown and return to that countdown, not directly to play.
  await pressButton(page, info, 'button-pause');
  await expect(page.getByTestId('panel-paused')).toBeVisible();
  await pressButton(page, info, 'button-resume');
  await expect(page.getByTestId('text-countdown')).toHaveText('4');
  for (let i = 0; i < 5; i++) await run.hit(i);
  const progress = await page.getByTestId('bar-progress').getAttribute('style');
  if (info.project.metadata.input === 'keyboard') await page.keyboard.press('Escape');
  else await pressButton(page, info, 'button-pause');
  await expect(page.getByTestId('panel-paused')).toBeVisible();
  await page.clock.fastForward(5_000);
  await run.input(2);
  await expect(page.getByTestId('text-score')).toHaveText('5,000');
  await expect(page.getByTestId('text-combo')).toHaveText('5');
  await expect(page.getByTestId('bar-progress')).toHaveAttribute('style', progress!);
  // Changing effects in pause must not resume the game or alter scoring.
  await pressButton(page, info, 'switch-reduced-effects');
  await expect(page.getByTestId('switch-reduced-effects')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.reduce-fx')).toHaveCount(1);
  await expect(page.getByTestId('panel-paused')).toBeVisible();
  if (info.project.metadata.input === 'keyboard') {
    // Space belongs to a focused effects switch, not the global game hotkey.
    await page.keyboard.press('Space');
    await expect(page.getByTestId('switch-reduced-effects')).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByTestId('panel-paused')).toBeVisible();
    await page.keyboard.press('Space');
    await expect(page.getByTestId('switch-reduced-effects')).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('button-resume')).toBeFocused();
    await page.keyboard.press('Space');
  } else await pressButton(page, info, 'button-resume');
  run.shiftForPause(5_000);
  await expect(page.getByTestId('panel-paused')).toHaveCount(0);
  await run.hit(5);
  await pressButton(page, info, 'button-pause');
  run = await RunDriver.start(page, info, 'button-restart');
  await pressButton(page, info, 'button-toggle-missions');
  const quests = page.getByTestId('list-hud-missions');
  await expect(quests).toContainText('Chain Reaction0/20');
  await expect(quests).toContainText('Precision Protocol0/40');
  await expect(quests).toContainText('Neon Legend0/100,000');
  await expect(page.getByTestId('toast-mission')).toHaveCount(0);
  for (let i = 0; i < 20; i++) await run.hit(i);
  await expect(page.getByTestId('toast-mission')).toContainText('Chain Reaction');
  await pressButton(page, info, 'button-pause');
  await pressButton(page, info, 'button-quit');
  await expect(page.getByTestId('text-missions-count')).toHaveText('1 / 4 COMPLETE');
  await expect(page.getByTestId('badge-complete-combo-20')).toBeVisible();
  await expect(page.getByTestId('text-target-first-run')).toHaveText('0 / 1');
  await expect(page.getByTestId('text-target-perfect-40')).toHaveText('0 / 40');
  await expect(page.getByTestId('text-target-score-100k')).toHaveText('0 / 100,000');
  await expect(page.getByTestId('panel-results')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('text-missions-count')).toHaveText('1 / 4 COMPLETE');
  await expect(page.getByTestId('text-target-first-run')).toHaveText('0 / 1');
  await expect(page.getByTestId('text-target-perfect-40')).toHaveText('0 / 40');
  await expect(page.getByTestId('switch-reduced-effects')).toHaveAttribute('aria-checked', 'true');
});

test('reduced-motion default and explicit effects choice survive reload without changing renderers', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await expect(page.getByTestId('switch-reduced-effects')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.reduce-fx')).toHaveCount(1);
  await pressButton(page, info, 'switch-reduced-effects');
  await expect(page.getByTestId('switch-reduced-effects')).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('.reduce-fx')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('switch-reduced-effects')).toHaveAttribute('aria-checked', 'false');
  await checkRenderer(page, info, 'effects-override');
  await pressButton(page, info, 'switch-reduced-effects');
  await page.reload();
  await expect(page.getByTestId('switch-reduced-effects')).toHaveAttribute('aria-checked', 'true');
  await checkRenderer(page, info, 'effects-persisted');
});
