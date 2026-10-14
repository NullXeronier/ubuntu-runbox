import { test, expect, pressButton, checkRenderer, openClockedGame, assertTrustedLaneInput, injectStorageFault, attachStorageEvidence } from './fixtures';
import { RunDriver, notes } from './driver';

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

const missionIds = ['first-run', 'combo-20', 'perfect-40', 'score-100k'] as const;
const unreadableQuests = "Saved mission badges could not be read. This session's missions still work; earn a new badge to save again.";
const sessionOnlyQuests = 'Mission badges cannot be saved in this browser. Progress will remain available for this session.';
const effectsSaveFailure = 'Your effects preference could not be saved in this browser.';
const timingKey = 'pulse-timing-offset-ms';
const timingReadFailure = 'Your timing preference could not be read. Using 0 ms; changes may only last until you leave this page.';
const timingInvalid = 'Your saved timing offset was invalid. Using 0 ms; adjust or reset it to save a new preference.';
const timingSaveFailure = 'Your timing offset is active for this page, but could not be saved in this browser. It may be lost on reload.';

for (const scenario of [
  { name: 'denied reads', reads: true, writes: false, raw: '65', initial: 0, warning: timingReadFailure },
  { name: 'denied reads and writes', reads: true, writes: true, raw: '65', initial: 0, warning: timingReadFailure },
  { name: 'denied writes with no saved offset', reads: false, writes: true, raw: undefined, initial: 0, warning: null },
  { name: 'denied writes with a saved offset', reads: false, writes: true, raw: '-40', initial: -40, warning: null },
  { name: 'malformed timing JSON', reads: false, writes: false, raw: '{', initial: 0, warning: timingReadFailure },
  { name: 'out-of-range saved timing', reads: false, writes: false, raw: '301', initial: 0, warning: timingInvalid },
  { name: 'wrong-type saved timing', reads: false, writes: false, raw: '"120"', initial: 0, warning: timingInvalid },
]) {
  test(`calibration storage faults: ${scenario.name} preserves honest status, reset, input and independent saves`, async ({ page }, info) => {
    await injectStorageFault(page, {
      denyReads: scenario.reads ? [timingKey] : undefined,
      denyWrites: scenario.writes ? [timingKey] : undefined,
      timingData: scenario.raw,
    });
    await openClockedGame(page, info);
    const format = (offset: number) => `${offset > 0 ? '+' : ''}${offset} ms`;
    const menuWarning = page.getByTestId('text-timing-error');
    await expect(page.getByTestId('text-timing-summary')).toHaveText(format(scenario.initial));
    if (scenario.warning) {
      await expect(menuWarning).toBeVisible();
      await expect(menuWarning).toHaveText(scenario.warning);
    } else await expect(menuWarning).toHaveCount(0);
    expect(await page.evaluate((key) => window.__pulseStorageProbe.readStored(key), timingKey)).toBe(scenario.raw ?? null);

    // Earn and save a real badge before touching calibration, never seed one.
    await pressButton(page, info, 'button-difficulty-easy');
    const first = await RunDriver.start(page, info);
    await first.songTime(notes[0]!.time + scenario.initial / 1000);
    await first.input(notes[0]!.lane);
    await expect(page.getByTestId('text-judge')).toHaveText('PERFECT');
    await first.finish();
    await expect(page.getByTestId('badge-new-first-run')).toHaveText('NEWLY EARNED');
    await pressButton(page, info, 'button-menu');
    await pressButton(page, info, 'switch-reduced-effects');
    await expect(page.getByTestId('switch-reduced-effects')).toHaveAttribute('aria-checked', 'true');
    const independentSaves = await page.evaluate(() => ({
      quests: window.__pulseStorageProbe.readStored('pulse-missions'),
      effects: window.__pulseStorageProbe.readStored('pulse-reduced-effects'),
    }));
    expect(JSON.parse(independentSaves.quests!)).toEqual({ version: 1, completed: ['first-run'] });
    expect(independentSaves.effects).not.toBeNull();

    await pressButton(page, info, 'button-calibration');
    const dialog = page.getByTestId('modal-calibration');
    const warning = dialog.getByTestId('text-timing-error');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId('text-timing-offset')).toHaveText(format(scenario.initial));
    if (scenario.warning) {
      await expect(warning).toBeVisible();
      await expect(warning).toHaveText(scenario.warning);
      await expect(dialog.getByTestId('text-timing-state')).toHaveText('Applied now, but NOT saved in this browser.');
    } else await expect(warning).toHaveCount(0);

    // Use trusted native slider keys, not programmatic value assignment.
    // Home selects -300; eight PageUp steps of 60 ms select +180.
    const setOffset = async () => {
      const slider = dialog.getByTestId('input-timing-offset');
      await slider.focus();
      await page.keyboard.press('Home');
      for (let step = 0; step < 8; step++) await page.keyboard.press('PageUp');
      await expect(dialog.getByTestId('text-timing-offset')).toHaveText('+180 ms');
      await expect(slider).toHaveAttribute('aria-valuetext', '+180 ms');
    };
    const assertSave = async (offset: number) => {
      await expect(dialog.getByTestId('text-timing-state')).toHaveText(scenario.writes
        ? 'Applied now, but NOT saved in this browser.' : 'Applied now and saved.');
      if (scenario.writes) {
        await expect(warning).toBeVisible();
        await expect(warning).toHaveText(timingSaveFailure);
      } else await expect(warning).toHaveCount(0);
      expect(await page.evaluate((key) => window.__pulseStorageProbe.readStored(key), timingKey))
        .toBe(scenario.writes ? scenario.raw ?? null : String(offset));
    };
    await setOffset();
    await assertSave(180);
    await pressButton(page, info, 'button-offset-reset');
    await expect(dialog.getByTestId('text-timing-offset')).toHaveText('0 ms');
    await expect(dialog.getByTestId('input-timing-offset')).toHaveValue('0');
    await assertSave(0);
    // Leave a nonzero value active so reload cannot accidentally pass on reset.
    await setOffset();
    await assertSave(180);
    await info.attach('calibration-storage-status', { body: await page.screenshot(), contentType: 'image/png' });
    await pressButton(page, info, 'button-calibration-done');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId('text-timing-summary')).toHaveText('+180 ms');
    if (scenario.writes) {
      await expect(menuWarning).toBeVisible();
      await expect(menuWarning).toHaveText(timingSaveFailure);
    } else await expect(menuWarning).toHaveCount(0);
    await pressButton(page, info, 'button-calibration');
    await expect(dialog.getByTestId('text-timing-offset')).toHaveText('+180 ms');
    await assertSave(180);
    await pressButton(page, info, 'button-close-calibration');
    await page.clock.runFor(32); // allow focus restoration before starting
    await expect(dialog).toHaveCount(0);

    // At +180 ms this would miss at the default offset: prove the engine uses
    // the page-only preference, not just a changed label. No direct game calls.
    const run = await RunDriver.start(page, info);
    await page.evaluate(() => { window.__pulseProbe.inputs.length = 0; });
    await run.songTime(notes[0]!.time + 0.180);
    await run.input(notes[0]!.lane);
    await expect(page.getByTestId('text-judge')).toHaveText('PERFECT');
    await expect(page.getByTestId('text-score')).toHaveText('1,000');
    await expect(page.getByTestId('text-combo')).toHaveText('1');
    await assertTrustedLaneInput(page, info);
    await pressButton(page, info, 'button-pause');
    await pressButton(page, info, 'button-quit');
    await expect(page.getByTestId('text-mission-error')).toHaveCount(0);
    await expect(page.getByTestId('text-error')).toHaveCount(0);
    const attempts = await page.evaluate(() => window.__pulseStorageProbe.attempts);
    expect(attempts).toContainEqual({ operation: 'get', key: timingKey, denied: scenario.reads });
    expect(attempts.filter((a) => a.operation === 'set' && a.key === timingKey)).toEqual(
      // Nine native slider changes per adjustment, plus the reset.
      Array.from({ length: 19 }, () => ({ operation: 'set', key: timingKey, denied: scenario.writes })),
    );
    await attachStorageEvidence(page, info, 'calibration-before-reload');
    await page.reload();
    const reloadedOffset = scenario.reads ? 0 : scenario.writes ? scenario.initial : 180;
    await expect(page.getByTestId('text-timing-summary')).toHaveText(format(reloadedOffset));
    if (scenario.reads) {
      await expect(menuWarning).toBeVisible();
      await expect(menuWarning).toHaveText(timingReadFailure);
    } else await expect(menuWarning).toHaveCount(0);
    await expect(page.getByTestId('badge-complete-first-run')).toHaveText('DONE');
    await expect(page.getByTestId('text-missions-count')).toHaveText('1 / 4 COMPLETE');
    await expect(page.getByTestId('switch-reduced-effects')).toHaveAttribute('aria-checked', 'true');
    expect(await page.evaluate(() => ({
      quests: window.__pulseStorageProbe.readStored('pulse-missions'),
      effects: window.__pulseStorageProbe.readStored('pulse-reduced-effects'),
    }))).toEqual(independentSaves);
    await expect(page.getByTestId('text-mission-error')).toHaveCount(0);
    await expect(page.getByTestId('text-error')).toHaveCount(0);
    await checkRenderer(page, info, 'calibration-storage-reload', true);
    await pressButton(page, info, 'button-calibration');
    await expect(dialog.getByTestId('text-timing-offset')).toHaveText(format(reloadedOffset));
    await expect(dialog.getByTestId('text-timing-state')).toHaveText(scenario.reads
      ? 'Applied now, but NOT saved in this browser.' : 'Applied now and saved.');
    await attachStorageEvidence(page, info, 'calibration-after-reload');
  });
}

for (const mode of ['access denied', 'reads and writes denied', 'writes denied'] as const) {
  test(`storage faults: ${mode} keeps gameplay and badges session-only without claiming persistence`, async ({ page }, info) => {
    await injectStorageFault(page, mode === 'access denied'
      ? { accessDenied: true }
      : { denyReads: mode === 'reads and writes denied' ? 'all' : undefined, denyWrites: 'all' });
    await openClockedGame(page, info);
    await expect(page.getByTestId('text-missions-count')).toHaveText('0 / 4 COMPLETE');
    const initiallyWarns = mode !== 'writes denied';
    if (initiallyWarns) {
      await expect(page.getByTestId('text-mission-error')).toBeVisible();
      await expect(page.getByTestId('text-mission-error')).toHaveText(
        mode === 'access denied' ? sessionOnlyQuests : unreadableQuests);
    } else await expect(page.getByTestId('text-mission-error')).toHaveCount(0);
    await pressButton(page, info, 'button-difficulty-easy');
    const run = await RunDriver.start(page, info);
    if (initiallyWarns) await expect(page.getByTestId('text-hud-mission-error')).toBeVisible();
    else await expect(page.getByTestId('text-hud-mission-error')).toHaveCount(0);
    await pressButton(page, info, 'button-toggle-missions');
    const quests = page.getByTestId('list-hud-missions');
    for (let i = 0; i < 20; i++) await run.hit(i);
    await expect(page.getByTestId('toast-mission')).toContainText('Chain Reaction');
    await expect(quests).toContainText('Chain ReactionDONE');
    await expect(page.getByTestId('text-hud-mission-error')).toBeVisible();
    await expect(page.getByTestId('text-hud-mission-error')).toHaveText('Quest save failed');
    // Another trusted hit after the failed write must still score normally.
    await run.hit(20);
    await expect(page.getByTestId('text-score')).toHaveText('35,000');
    await expect(page.getByTestId('button-pause')).toBeVisible();
    await expect(page.getByTestId('panel-paused')).toHaveCount(0);
    await assertTrustedLaneInput(page, info);
    expect(await page.evaluate(() => window.__pulseProbe.audio.map((audio) => audio.state))).toEqual(['running']);
    expect(await page.evaluate(() => window.__pulseStorageProbe.readStored('pulse-missions'))).toBeNull();

    await run.finish();
    await expect(page.getByTestId('text-final-score')).toHaveText('35,000');
    await expect(page.getByTestId('text-perfect')).toHaveText('21');
    await expect(page.getByTestId('text-maxcombo')).toHaveText('21');
    await expect(page.getByTestId('text-mission-error')).toBeVisible();
    await expect(page.getByTestId('text-mission-error')).toHaveText(sessionOnlyQuests);
    await expect(page.getByTestId('text-game-error')).toHaveText(
      'Your score is shown below, but this browser could not save your personal best.');
    for (const id of ['first-run', 'combo-20']) {
      await expect(page.getByTestId(`badge-new-${id}`)).toHaveText('NEWLY EARNED');
    }
    for (const id of ['perfect-40', 'score-100k']) {
      await expect(page.getByTestId(`result-mission-${id}`)).toContainText('INCOMPLETE');
    }
    const attempts = await page.evaluate(() => window.__pulseStorageProbe.attempts);
    if (mode === 'access denied') expect(attempts.some((a) => a.operation === 'access' && a.denied)).toBe(true);
    else {
      expect(attempts.some((a) => a.operation === 'get' && a.key === 'pulse-missions' &&
        a.denied === (mode === 'reads and writes denied'))).toBe(true);
      expect(attempts.some((a) => a.operation === 'set' && a.key === 'pulse-missions' && a.denied)).toBe(true);
    }
    await attachStorageEvidence(page, info, 'failed-quest-saves');
    await info.attach('session-only-results', { body: await page.screenshot(), contentType: 'image/png' });

    // Retry preserves earned badges in memory, not their NEWLY EARNED flags.
    const retry = await RunDriver.start(page, info, 'button-retry');
    await expect(page.getByTestId('text-hud-mission-error')).toBeVisible();
    await pressButton(page, info, 'button-toggle-missions');
    await expect(page.getByTestId('list-hud-missions')).toContainText('Chain ReactionDONE');
    await expect(page.getByTestId('list-hud-missions')).toContainText('Precision Protocol0/40');
    await expect(page.getByTestId('toast-mission')).toHaveCount(0);
    await retry.finish();
    for (const id of ['first-run', 'combo-20']) {
      await expect(page.getByTestId(`badge-earned-${id}`)).toHaveText('ALREADY EARNED');
      await expect(page.getByTestId(`badge-new-${id}`)).toHaveCount(0);
    }
    await pressButton(page, info, 'button-menu');
    await expect(page.getByTestId('text-missions-count')).toHaveText('2 / 4 COMPLETE');
    await expect(page.getByTestId('text-mission-error')).toBeVisible();
    await expect(page.getByTestId('text-mission-error')).toHaveText(sessionOnlyQuests);
    await page.reload();
    await expect(page.getByTestId('text-missions-count')).toHaveText('0 / 4 COMPLETE');
    for (const id of missionIds) await expect(page.getByTestId(`badge-complete-${id}`)).toHaveCount(0);
    await expect(page.getByTestId('text-best')).toHaveText('PERSONAL BEST --');
    expect(await page.evaluate(() => window.__pulseStorageProbe.readStored('pulse-missions'))).toBeNull();
    if (initiallyWarns) await expect(page.getByTestId('text-mission-error')).toBeVisible();
    else await expect(page.getByTestId('text-mission-error')).toHaveCount(0);
    await attachStorageEvidence(page, info, 'unsaved-after-reload');
    await checkRenderer(page, info, 'storage-fault-reload', true);
  });
}

for (const damaged of [
  { name: 'invalid JSON', raw: '{"version":1,"completed":' },
  { name: 'unknown badge mixed with a known badge', raw: '{"version":1,"completed":["combo-20","unknown-badge"]}' },
]) {
  test(`storage faults: ${damaged.name} warns without awarding badges and recovers only after a real completion`, async ({ page }, info) => {
    await injectStorageFault(page, { questData: damaged.raw });
    await openClockedGame(page, info);
    await expect(page.getByTestId('text-mission-error')).toBeVisible();
    await expect(page.getByTestId('text-mission-error')).toHaveText(unreadableQuests);
    await expect(page.getByTestId('text-missions-count')).toHaveText('0 / 4 COMPLETE');
    for (const id of missionIds) await expect(page.getByTestId(`badge-complete-${id}`)).toHaveCount(0);
    // Simply opening/reloading must not silently replace damaged data or award
    // the valid-looking portion of an invalid document.
    await page.reload();
    await expect(page.getByTestId('text-missions-count')).toHaveText('0 / 4 COMPLETE');
    await expect(page.getByTestId('text-mission-error')).toHaveText(unreadableQuests);
    expect(await page.evaluate(() => window.__pulseStorageProbe.readStored('pulse-missions'))).toBe(damaged.raw);
    await pressButton(page, info, 'button-difficulty-easy');
    const run = await RunDriver.start(page, info);
    await expect(page.getByTestId('text-hud-mission-error')).toBeVisible();
    await run.hit(0);
    await expect(page.getByTestId('text-score')).toHaveText('1,000');
    await expect(page.getByTestId('text-hud-mission-error')).toBeVisible();
    expect(await page.evaluate(() => window.__pulseStorageProbe.readStored('pulse-missions'))).toBe(damaged.raw);
    await assertTrustedLaneInput(page, info);
    await attachStorageEvidence(page, info, 'damaged-quests');
    await run.finish();
    await expect(page.getByTestId('text-final-score')).toHaveText('1,000');
    await expect(page.getByTestId('badge-new-first-run')).toHaveText('NEWLY EARNED');
    for (const id of missionIds.filter((id) => id !== 'first-run')) {
      await expect(page.getByTestId(`result-mission-${id}`)).toContainText('INCOMPLETE');
    }
    await expect(page.getByTestId('text-mission-error')).toHaveCount(0);
    const repaired = await page.evaluate(() => window.__pulseStorageProbe.readStored('pulse-missions'));
    expect(JSON.parse(repaired!)).toEqual({ version: 1, completed: ['first-run'] });
    await attachStorageEvidence(page, info, 'repaired-quests');
    await pressButton(page, info, 'button-menu');
    await page.reload();
    await expect(page.getByTestId('text-missions-count')).toHaveText('1 / 4 COMPLETE');
    await expect(page.getByTestId('badge-complete-first-run')).toHaveText('DONE');
    await expect(page.getByTestId('text-mission-error')).toHaveCount(0);
    for (const id of missionIds.filter((id) => id !== 'first-run')) {
      await expect(page.getByTestId(`badge-complete-${id}`)).toHaveCount(0);
    }
    await checkRenderer(page, info, 'repaired-quests-reload', true);
  });
}

test('storage faults: effects save failure warns but applies for the session without breaking gameplay or quest saves', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await injectStorageFault(page, { denyWrites: ['pulse-reduced-effects'] });
  await openClockedGame(page, info);
  await pressButton(page, info, 'button-difficulty-easy');
  await expect(page.getByTestId('switch-reduced-effects')).toHaveAttribute('aria-checked', 'true');
  await pressButton(page, info, 'switch-reduced-effects');
  await expect(page.getByTestId('switch-reduced-effects')).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('.reduce-fx')).toHaveCount(0);
  await expect(page.getByTestId('text-error')).toBeVisible();
  await expect(page.getByTestId('text-error')).toHaveText(effectsSaveFailure);
  await expect(page.getByTestId('text-mission-error')).toHaveCount(0);
  expect(await page.evaluate(() => window.__pulseStorageProbe.readStored('pulse-reduced-effects'))).toBeNull();

  const run = await RunDriver.start(page, info);
  await expect(page.locator('.reduce-fx')).toHaveCount(0);
  await run.hit(0);
  await run.hit(1);
  await pressButton(page, info, 'button-pause');
  await pressButton(page, info, 'switch-reduced-effects');
  await expect(page.getByTestId('switch-reduced-effects')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.reduce-fx')).toHaveCount(1);
  await expect(page.getByTestId('text-game-error')).toBeVisible();
  await expect(page.getByTestId('text-game-error')).toHaveText(effectsSaveFailure);
  await pressButton(page, info, 'switch-reduced-effects');
  await expect(page.getByTestId('switch-reduced-effects')).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('.reduce-fx')).toHaveCount(0);
  await expect(page.getByTestId('text-game-error')).toHaveText(effectsSaveFailure);
  await page.clock.fastForward(5_000);
  await expect(page.getByTestId('panel-paused')).toBeVisible();
  await expect(page.getByTestId('text-score')).toHaveText('2,000');
  await expect(page.getByTestId('text-combo')).toHaveText('2');
  await pressButton(page, info, 'button-resume');
  run.shiftForPause(5_000);
  await run.hit(2);
  await expect(page.getByTestId('text-score')).toHaveText('3,000');
  await expect(page.getByTestId('text-hud-mission-error')).toHaveCount(0);
  await assertTrustedLaneInput(page, info);
  await run.finish();
  await expect(page.getByTestId('text-final-score')).toHaveText('3,000');
  await expect(page.getByTestId('badge-new-first-run')).toHaveText('NEWLY EARNED');
  await expect(page.getByTestId('text-mission-error')).toHaveCount(0);
  expect(await page.evaluate(() => window.__pulseStorageProbe.attempts
    .filter((a) => a.operation === 'set' && a.key === 'pulse-reduced-effects'))).toEqual([
    { operation: 'set', key: 'pulse-reduced-effects', denied: true },
    { operation: 'set', key: 'pulse-reduced-effects', denied: true },
    { operation: 'set', key: 'pulse-reduced-effects', denied: true },
  ]);
  expect(await page.evaluate(() => window.__pulseStorageProbe.readStored('pulse-reduced-effects'))).toBeNull();
  await attachStorageEvidence(page, info, 'effects-only-save-failure');
  await pressButton(page, info, 'button-menu');
  await expect(page.getByTestId('switch-reduced-effects')).toHaveAttribute('aria-checked', 'false');
  await page.reload();
  // Failed OFF was never saved: return to the OS reduced-motion default,
  // while the independently saved quest badge really does survive.
  await expect(page.getByTestId('switch-reduced-effects')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.reduce-fx')).toHaveCount(1);
  await expect(page.getByTestId('text-error')).toHaveCount(0);
  await expect(page.getByTestId('text-missions-count')).toHaveText('1 / 4 COMPLETE');
  await expect(page.getByTestId('badge-complete-first-run')).toHaveText('DONE');
  await checkRenderer(page, info, 'unsaved-effects-reload', true);
});
