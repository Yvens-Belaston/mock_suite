import { expect, test, type Frame } from '@playwright/test';

// Spec 6.6: nothing on a screen is smaller than 14 px (projector legibility).

/** Visible text nodes rendered below 14 px, as `"<text>" <size>`. */
async function tooSmall(frame: Frame): Promise<string[]> {
  return frame.evaluate(() => {
    const found: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim();
      const el = node.parentElement;
      if (!text || !el || el.getClientRects().length === 0) continue;
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size < 14) found.push(`"${text.slice(0, 40)}" ${size}px`);
    }
    return found;
  });
}

/** Seed text that shows once a screen has loaded its data (the overview embeds all four). */
const LOADED: Record<string, string> = {
  topdesk: 'I 2610 001',
  entra: 'Pieter Bakker',
  jira: 'IAM-101',
  teams: 'Gesimuleerd',
};

for (const screen of ['topdesk', 'entra', 'jira', 'teams', 'overview']) {
  test(`no text below 14 px on /ui/${screen}`, async ({ page }) => {
    await page.goto(`/ui/${screen}`);
    const markers = screen === 'overview' ? Object.values(LOADED) : [LOADED[screen]];
    for (const marker of markers) {
      await expect
        .poll(async () => {
          for (const frame of page.frames()) {
            if (await frame.getByText(marker).first().isVisible().catch(() => false)) return true;
          }
          return false;
        })
        .toBe(true);
    }
    for (const frame of page.frames()) expect(await tooSmall(frame), frame.url()).toEqual([]);
  });
}

test('no text below 14 px in the Jira card modal', async ({ page }) => {
  await page.goto('/ui/jira');
  await page.getByText('IAM-101').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await tooSmall(page.mainFrame())).toEqual([]);
});
