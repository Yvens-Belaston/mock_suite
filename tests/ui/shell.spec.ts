import { expect, test } from '@playwright/test';

const screens = [
  { path: '/ui/topdesk', title: 'ITSM', subtitle: 'TOPdesk API (gesimuleerd)' },
  { path: '/ui/entra', title: 'Identiteiten', subtitle: 'Microsoft Graph API (gesimuleerd)' },
  { path: '/ui/jira', title: 'Jira', subtitle: 'REST API v3 (gesimuleerd)' },
  { path: '/ui/teams', title: 'Teams', subtitle: 'Workflows webhook (gesimuleerd)' },
  { path: '/ui/overview', title: 'Overzicht', subtitle: null },
];

for (const screen of screens) {
  test(`${screen.path} shows the shell with Gesimuleerd and a connected live dot`, async ({ page }) => {
    await page.goto(screen.path);
    const header = page.getByRole('banner');
    await expect(header.getByRole('heading', { name: screen.title })).toBeVisible();
    if (screen.subtitle) await expect(header.getByText(screen.subtitle)).toBeVisible();
    await expect(header.getByText('Gesimuleerd', { exact: true })).toBeVisible();
    await expect(page.getByTestId('live-dot')).toHaveAttribute('data-state', 'connected');
  });
}

test('an unknown /ui route lands on the overview', async ({ page }) => {
  await page.goto('/ui/nope');
  await expect(page).toHaveURL(/\/ui\/overview$/);
});

test('?compact=1 hides the header subtitle', async ({ page }) => {
  await page.goto('/ui/entra?compact=1');
  await expect(page.getByRole('heading', { name: 'Identiteiten' })).toBeVisible();
  await expect(page.getByText('Gesimuleerd', { exact: true })).toBeVisible();
  await expect(page.getByText('Microsoft Graph API (gesimuleerd)')).toHaveCount(0);
});

test('the live dot stays grey while /events is unreachable', async ({ page }) => {
  await page.route('**/events', (route) => route.abort());
  await page.goto('/ui/entra');
  await expect(page.getByRole('heading', { name: 'Identiteiten' })).toBeVisible();
  await page.waitForTimeout(1000); // connected screens are green well within this
  await expect(page.getByTestId('live-dot')).toHaveAttribute('data-state', 'disconnected');
});

test('a reset shows its summary as a toast', async ({ page }) => {
  // No real POST /admin/reset: it would wipe data that specs running in parallel just created.
  // Serve the reset's change event from a stubbed /events instead (the server side is unit-tested).
  const resetEvent = {
    system: 'admin',
    entity: 'state',
    action: 'reset',
    id: '',
    summary: 'Demo teruggezet naar de beginsituatie',
    at: new Date().toISOString(),
  };
  await page.route('**/events', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
      body: `retry: 600000\n\nevent: change\ndata: ${JSON.stringify(resetEvent)}\n\n`,
    }),
  );
  await page.goto('/ui/teams');
  await expect(page.getByRole('status').getByText('Demo teruggezet naar de beginsituatie')).toBeVisible();
});
