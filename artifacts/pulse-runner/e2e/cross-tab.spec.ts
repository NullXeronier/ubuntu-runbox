import { test, expect, pressButton, openClockedGame, injectStorageFault } from './fixtures';
import { RunDriver } from './driver';

for (const denied of [false, true]) {
  test(`cross-tab badges: ${denied ? 'denied writes stay session-only' : 'different earnings persist as a union'}`, async ({ page, context }, info) => {
    const other = await context.newPage();
    if (denied) await injectStorageFault(other, { denyWrites: ['pulse-missions'] });
    await openClockedGame(page, info);
    await openClockedGame(other, info);
    await expect(page.getByTestId('text-missions-count')).toHaveText('0 / 4 COMPLETE');
    await expect(other.getByTestId('text-missions-count')).toHaveText('0 / 4 COMPLETE');

    // Both trackers exist before either page earns anything.
    await other.bringToFront();
    await pressButton(other, info, 'button-difficulty-easy');
    const comboRun = await RunDriver.start(other, info);
    for (let i = 0; i < 20; i++) await comboRun.hit(i);
    await expect(other.getByTestId('toast-mission')).toContainText('Chain Reaction');
    await pressButton(other, info, 'button-pause');
    await expect(page.getByTestId('text-missions-count')).toHaveText(denied ? '0 / 4 COMPLETE' : '1 / 4 COMPLETE');

    await page.bringToFront();
    await pressButton(page, info, 'button-difficulty-easy');
    const finishRun = await RunDriver.start(page, info);
    await finishRun.finish();
    await expect(page.getByTestId('badge-new-first-run')).toBeVisible();
    if (!denied) await expect(page.getByTestId('badge-earned-combo-20')).toBeVisible();
    await expect(page.getByTestId('badge-new-combo-20')).toHaveCount(0);

    // Resume to reveal the HUD; the paused tab received the external badge.
    await other.bringToFront();
    await pressButton(other, info, 'button-resume');
    await pressButton(other, info, 'button-toggle-missions');
    await other.clock.runFor(32);
    await expect(other.getByTestId('list-hud-missions')).toContainText('First ContactDONE');
    expect((await other.getByTestId('toast-mission').allTextContents()).join(' ')).not.toContain('First Contact');
    if (denied) await expect(other.getByTestId('text-hud-mission-error')).toBeVisible();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pulse-missions')!).completed as string[]);
    expect(saved.sort()).toEqual(denied ? ['first-run'] : ['combo-20', 'first-run']);
    await info.attach('cross-tab-paused-progress', { body: await other.screenshot(), contentType: 'image/png' });
    for (const target of [page, other]) {
      await target.reload();
      await expect(target.getByTestId('text-missions-count')).toHaveText(denied ? '1 / 4 COMPLETE' : '2 / 4 COMPLETE');
      await expect(target.getByTestId('badge-complete-first-run')).toBeVisible();
      await expect(target.getByTestId('badge-complete-combo-20')).toHaveCount(denied ? 0 : 1);
    }
    await other.close();
  });
}
