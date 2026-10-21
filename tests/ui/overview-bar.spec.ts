import { expect, test } from '@playwright/test';

const auth = { authorization: 'Bearer x' };

test('the bar under the overview shows a new mock API call, live', async ({ page, request }) => {
  await page.goto('/ui/overview');
  await expect(page.getByTestId('live-dot')).toHaveAttribute('data-state', 'connected');
  const bar = page.getByRole('list', { name: 'Laatste API-aanroepen' });
  await expect(bar).toBeVisible();

  const res = await request.get('/v1.0/users/bar-spec-unknown', { headers: auth });

  await expect(bar.getByRole('listitem').filter({ hasText: 'bar-spec-unknown' })).toHaveText(
    new RegExp(`^GET /v1\\.0/users/bar-spec-unknown ${res.status()} · \\d+ ms$`),
    { timeout: 1000 },
  );
});

test('the bar shows only the last 5 calls, newest first', async ({ page, request }) => {
  await page.goto('/ui/overview');
  await expect(page.getByTestId('live-dot')).toHaveAttribute('data-state', 'connected');
  for (let i = 1; i <= 7; i++) await request.get(`/v1.0/users/bar-five-${i}`, { headers: auth });

  const items = page.getByRole('list', { name: 'Laatste API-aanroepen' }).getByRole('listitem');
  await expect(items).toHaveCount(5);
  await expect(items.filter({ hasText: 'bar-five-7' })).toBeVisible();
  // Other specs may log calls in parallel, so only check relative order of ours.
  const texts = await items.allTextContents();
  const pos = (n: number) => texts.findIndex((t) => t.includes(`bar-five-${n}`));
  if (pos(6) >= 0) expect(pos(7)).toBeLessThan(pos(6));
  expect(pos(1)).toBe(-1);
});

test('the bar sits under the grid, inside the viewport', async ({ page }) => {
  await page.goto('/ui/overview');
  const bar = page.getByRole('list', { name: 'Laatste API-aanroepen' });
  await expect(bar).toBeVisible();
  const barBox = await bar.boundingBox();
  const jiraBox = await page.locator('iframe[title="Jira"]').boundingBox();
  expect(barBox!.y).toBeGreaterThanOrEqual(jiraBox!.y + jiraBox!.height);
  expect(barBox!.y + barBox!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
});
