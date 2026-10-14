import { expect, type Page, type TestInfo } from '@playwright/test';
import { pressButton } from './fixtures';

// Independent expected Neon Drift EASY chart, not read from the engine under test.
const pattern = [0, 1, 2, 3, 2, 1, 0, 2, 3, 1, 2, 0, 3, 2, 1, 3];
export const notes = Array.from({ length: 186 }, (_, i) => i + 4)
  .filter((beat) => beat % 4 !== 3)
  .map((beat) => ({ time: beat * 60 / 128, lane: pattern[(beat - 4) % pattern.length]! }));

export class RunDriver {
  private constructor(private page: Page, private info: TestInfo, private origin: number) {}

  static async start(page: Page, info: TestInfo, button = 'button-start', space = false) {
    if (space) await page.keyboard.press('Space');
    else await pressButton(page, info, button);
    await expect(page.getByTestId('text-score')).toBeVisible();
    const origin = await page.evaluate(() => performance.now());
    // Hud's countdown clock is populated on its first animation frame.
    await page.clock.runFor(32);
    await expect(page.getByTestId('text-countdown')).toHaveText('4');
    await expect(page.getByTestId('text-score')).toHaveText('0');
    await expect(page.getByTestId('text-combo')).toHaveText('0');
    return new RunDriver(page, info, origin);
  }

  async songTime(seconds: number) {
    const now = await this.page.evaluate(() => performance.now());
    const delta = Math.round(this.origin + 4 * 60 / 128 * 1000 + seconds * 1000 - now);
    expect(delta, 'test timeline must move forward').toBeGreaterThanOrEqual(0);
    await this.page.clock.fastForward(delta);
  }

  shiftForPause(milliseconds: number) { this.origin += milliseconds; }

  async input(lane: number, arrows = false) {
    if (this.info.project.metadata.input === 'touch') {
      await this.page.getByTestId(`pad-lane-${lane}`).tap({ force: true });
    } else {
      await this.page.keyboard.press((arrows ? ['ArrowLeft', 'ArrowDown', 'ArrowUp', 'ArrowRight'] : ['d', 'f', 'j', 'k'])[lane]!);
    }
  }

  async hit(index: number) {
    const note = notes[index]!;
    await this.songTime(note.time);
    await this.input(note.lane, index % 2 === 1);
    await expect(this.page.getByTestId('text-judge')).toHaveText('PERFECT');
    await expect(this.page.getByTestId('text-combo')).toHaveText(String(index + 1));
  }

  async finish() {
    await this.songTime(90.05);
    await expect(this.page.getByTestId('panel-results')).toBeVisible();
  }
}
