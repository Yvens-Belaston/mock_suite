import { expect, test, type Page } from '@playwright/test';

// The server is shared with other specs that post to channels in parallel, so counters are
// compared against their value before this test acts, never against seed-state absolutes.

const unique = () => Math.random().toString(36).slice(2, 8);
const text = (t: string) => ({ text: t });

const rail = (page: Page) => page.getByRole('navigation', { name: 'Kanalen' });
const channelButton = (page: Page, name: string) => rail(page).getByRole('button', { name: new RegExp(`^# ${name}\\b`) });
const unread = (page: Page, name: string) => channelButton(page, name).getByTestId('unread-count');

async function unreadCount(page: Page, name: string): Promise<number> {
  const badge = unread(page, name);
  return (await badge.count()) === 0 ? 0 : Number(await badge.textContent());
}

async function openTeams(page: Page, query = '') {
  await page.goto(`/ui/teams${query}`);
  await expect(page.getByTestId('live-dot')).toHaveAttribute('data-state', 'connected');
  await expect(channelButton(page, 'Automation CoE')).toBeVisible();
}

test('a message to a non-selected channel increments its unread counter', async ({ page, request }) => {
  await openTeams(page, '?channel=hr-onboarding');
  const before = await unreadCount(page, 'Automation CoE');

  await request.post('/teams/hook/automation-coe', { data: text(`Rail ${unique()}`) });

  await expect.poll(() => unreadCount(page, 'Automation CoE'), { timeout: 1000 }).toBeGreaterThan(before);
});

test('seed messages present on load do not count as unread', async ({ page }) => {
  await openTeams(page, '?channel=hr-onboarding');
  await expect(unread(page, 'Algemeen')).toHaveCount(0);
});

test('selecting a channel clears its counter and shows the new message', async ({ page, request }) => {
  await openTeams(page, '?channel=hr-onboarding');
  const marker = `Rail ${unique()}`;
  await request.post('/teams/hook/automation-coe', { data: text(marker) });
  await expect(unread(page, 'Automation CoE')).toBeVisible({ timeout: 1000 });

  await channelButton(page, 'Automation CoE').click();

  await expect(channelButton(page, 'Automation CoE')).toHaveAttribute('aria-current', 'true');
  await expect(page.getByTestId('teams-feed').getByText(marker)).toBeVisible();
  await expect(unread(page, 'Automation CoE')).toHaveCount(0);
});

test('the selected channel never shows a counter for its own new messages', async ({ page, request }) => {
  await openTeams(page, '?channel=automation-coe');
  const marker = `Rail ${unique()}`;
  await request.post('/teams/hook/automation-coe', { data: text(marker) });

  await expect(page.getByTestId('teams-feed').getByText(marker)).toBeVisible({ timeout: 1000 });
  await expect(unread(page, 'Automation CoE')).toHaveCount(0);
});

test('"Alle kanalen" shows messages from every channel in one feed', async ({ page, request }) => {
  await openTeams(page, '?channel=hr-onboarding');
  const a = `Alle ${unique()}`;
  const b = `Alle ${unique()}`;
  await request.post('/teams/hook/algemeen', { data: text(a) });
  await request.post('/teams/hook/automation-coe', { data: text(b) });

  const toggle = rail(page).getByRole('button', { name: 'Alle kanalen' });
  await toggle.click();

  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  const feed = page.getByTestId('teams-feed');
  await expect(feed.getByText(a)).toBeVisible();
  await expect(feed.getByText(b)).toBeVisible();
  await expect(feed.getByTestId('teams-message').filter({ hasText: b })).toContainText('# Automation CoE');
  await expect(unread(page, 'Automation CoE')).toHaveCount(0);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(feed.getByText(b)).toHaveCount(0);
  await expect(channelButton(page, 'HR Onboarding')).toHaveAttribute('aria-current', 'true');
});

test('"Alle kanalen" can be opened by URL for the overview layout', async ({ page }) => {
  await openTeams(page, '?all=1&compact=1');
  await expect(rail(page).getByRole('button', { name: 'Alle kanalen' })).toHaveAttribute('aria-pressed', 'true');
  // Seed has 2 messages in each of the 5 channels.
  await expect.poll(() => page.getByTestId('teams-message').count()).toBeGreaterThanOrEqual(10);
});
