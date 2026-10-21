import { expect, test } from '@playwright/test';

const quadrants = ['topdesk', 'entra', 'jira', 'teams'];

test('the overview shows the four screens as compact iframes in a 2x2 grid', async ({ page }) => {
  await page.goto('/ui/overview');
  const frames = page.locator('iframe');
  await expect(frames).toHaveCount(4);
  for (const [i, name] of quadrants.entries()) {
    await expect(frames.nth(i)).toHaveAttribute('src', `/ui/${name}?compact=1`);
    await expect(frames.nth(i)).toBeVisible();
  }
  const [a, b, c] = await Promise.all([0, 1, 2].map((i) => frames.nth(i).boundingBox()));
  expect(b!.y).toBeCloseTo(a!.y, 0); // 1 and 2 side by side
  expect(c!.x).toBeCloseTo(a!.x, 0); // 3 under 1
  expect(c!.y).toBeGreaterThan(a!.y + a!.height - 1);
  await expect(page.frameLocator('iframe[title="Identiteiten"]').getByRole('heading', { name: 'Identiteiten' })).toBeVisible();
});

const fullViewport = (page: import('@playwright/test').Page) => {
  const { width, height } = page.viewportSize()!;
  return { x: 0, y: 0, width, height };
};

test('2 maximises the Entra iframe to the viewport and Esc brings back the grid', async ({ page }) => {
  await page.goto('/ui/overview');
  const entra = page.locator('iframe[title="Identiteiten"]');
  await expect(page.frameLocator('iframe[title="Identiteiten"]').getByRole('heading', { name: 'Identiteiten' })).toBeVisible();
  const before = await entra.boundingBox();

  await page.keyboard.press('2');
  await expect.poll(() => entra.boundingBox()).toEqual(fullViewport(page));
  await expect(page.locator('iframe')).toHaveCount(4); // the others stay loaded

  await page.keyboard.press('Escape');
  await expect.poll(() => entra.boundingBox()).toEqual(before);
  for (let i = 0; i < 4; i++) await expect(page.locator('iframe').nth(i)).toBeVisible();
});

test('shortcuts also work while an iframe has focus', async ({ page }) => {
  await page.goto('/ui/overview');
  const jira = page.locator('iframe[title="Jira"]');
  await page.frameLocator('iframe[title="Jira"]').getByRole('heading', { name: 'Jira' }).click();
  await page.keyboard.press('3');
  await expect.poll(() => jira.boundingBox()).toEqual(fullViewport(page));
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await jira.boundingBox())!.width).toBeLessThan(page.viewportSize()!.width / 2);
});

test('R asks for confirmation and only resets when confirmed', async ({ page }) => {
  const isReset = (method: string, url: string) => method === 'POST' && new URL(url).pathname === '/admin/reset';
  let resets = 0;
  page.on('request', (r) => {
    if (isReset(r.method(), r.url())) resets++;
  });
  // Answer the reset here: a real one would wipe items that specs running in parallel just created.
  await page.route('**/admin/reset', (route) => route.fulfill({ status: 204 }));
  await page.goto('/ui/overview');
  await expect(page.getByTestId('live-dot')).toHaveAttribute('data-state', 'connected');

  const dialogs: string[] = [];
  page.once('dialog', (d) => {
    dialogs.push(d.type());
    void d.dismiss();
  });
  await page.keyboard.press('r');
  await expect.poll(() => dialogs).toEqual(['confirm']);
  await page.waitForTimeout(300);
  expect(resets).toBe(0);

  page.once('dialog', (d) => void d.accept());
  const reset = page.waitForResponse((r) => isReset(r.request().method(), r.url()));
  await page.keyboard.press('R');
  expect((await reset).status()).toBe(204);
});
