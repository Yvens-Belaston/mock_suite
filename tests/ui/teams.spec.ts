import { expect, test, type Page } from '@playwright/test';

// Spec 4.5 escalation card, as Bonita posts it when the Facilities task is overdue.
const escalation = (title: string) => ({
  type: 'message',
  attachments: [
    {
      contentType: 'application/vnd.microsoft.card.adaptive',
      contentUrl: null,
      content: {
        type: 'AdaptiveCard',
        version: '1.5',
        body: [
          {
            type: 'Container',
            style: 'attention',
            items: [
              { type: 'TextBlock', text: `⚠️ ${title}`, weight: 'Bolder', size: 'Medium' },
              {
                type: 'FactSet',
                facts: [
                  { title: 'Medewerker', value: 'Sanne de Vries' },
                  { title: 'Startdatum', value: '01-12-2026' },
                  { title: 'Verantwoordelijk', value: 'Lotte Jansen (Facilities)' },
                  { title: 'Escalatie naar', value: 'Ruben de Boer' },
                ],
              },
            ],
          },
        ],
        actions: [
          { type: 'Action.OpenUrl', title: 'Open in Ofelia', url: 'http://localhost:8080/bonita/apps/userAppBonita/task-list' },
        ],
      },
    },
  ],
});

const card = (body: unknown[], actions: unknown[] = []) => ({
  type: 'message',
  attachments: [
    {
      contentType: 'application/vnd.microsoft.card.adaptive',
      contentUrl: null,
      content: { type: 'AdaptiveCard', version: '1.5', body, actions },
    },
  ],
});

// 1×1 PNG: the library drops images that fail to load.
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const unique = () => Math.random().toString(36).slice(2, 8);

async function openChannel(page: Page, channel: string) {
  await page.goto(`/ui/teams?channel=${channel}`);
  await expect(page.getByTestId('live-dot')).toHaveAttribute('data-state', 'connected');
}

test('posting the spec 4.5 escalation card shows an escalation message within 1 s', async ({ page, request }) => {
  await openChannel(page, 'facilities');
  const title = `Taak verlopen: werkplek inrichten ${unique()}`;
  const res = await request.post('/teams/hook/facilities', { data: escalation(title) });
  expect(res.status()).toBe(202);

  const message = page.getByTestId('teams-message').filter({ hasText: title });
  await expect(message).toBeVisible({ timeout: 1000 });
  await expect(message).toHaveAttribute('data-escalation', 'true');
  await expect(message).toHaveCSS('border-left-color', 'rgb(220, 38, 38)');
  await expect(message.getByText('Ofelia Workflow')).toBeVisible();
  await expect(message.getByText('Lotte Jansen (Facilities)')).toBeVisible();
  // Newest at the bottom.
  await expect(page.getByTestId('teams-message').last()).toContainText(title);

  await page.context().route('**/bonita/**', (route) => route.fulfill({ body: 'Ofelia' }));
  const popup = page.waitForEvent('popup');
  await message.getByRole('link', { name: 'Open in Ofelia' }).click();
  const tab = await popup;
  await tab.waitForLoadState();
  expect(tab.url()).toContain('/bonita/apps/userAppBonita/task-list');
  await expect(page).toHaveURL(/\/ui\/teams/); // the feed stays open in its own tab
});

test('a first TextBlock starting with ⚠️ marks escalation; other cards render plainly with ColumnSet and Image', async ({
  page,
  request,
}) => {
  await openChannel(page, 'servicedesk');
  const id = unique();
  await request.post('/teams/hook/servicedesk', {
    data: card([{ type: 'TextBlock', text: `⚠️ Laptop niet geleverd ${id}` }]),
  });
  await request.post('/teams/hook/servicedesk', {
    data: card([
      { type: 'TextBlock', text: `Laptop klaar ${id}` },
      {
        type: 'ColumnSet',
        columns: [
          { type: 'Column', items: [{ type: 'TextBlock', text: 'Serienummer' }] },
          { type: 'Column', items: [{ type: 'TextBlock', text: `SN-${id}` }] },
        ],
      },
      { type: 'Image', url: PIXEL, altText: `Foto ${id}` },
    ]),
  });

  const warning = page.getByTestId('teams-message').filter({ hasText: `Laptop niet geleverd ${id}` });
  await expect(warning).toHaveAttribute('data-escalation', 'true', { timeout: 1000 });
  const ready = page.getByTestId('teams-message').filter({ hasText: `Laptop klaar ${id}` });
  await expect(ready).toHaveAttribute('data-escalation', 'false', { timeout: 1000 });
  await expect(ready.getByText(`SN-${id}`)).toBeVisible();
  await expect(ready.locator(`img[alt="Foto ${id}"]`)).toHaveCount(1);
  await expect(page.getByTestId('teams-message').last()).toContainText(`Laptop klaar ${id}`);
  // Messages from other channels stay out of this feed.
  await expect(page.getByTestId('teams-feed').getByText('Onboarding afgerond: Julia Peters')).toHaveCount(0);
});

test('messages show the time in Dutch format', async ({ page, request }) => {
  await request.post('/admin/reset');
  await openChannel(page, 'hr-onboarding');
  // Seed message received 2026-10-14T08:30:00Z = 10:30 in Amsterdam (CEST).
  const seeded = page.getByTestId('teams-message').filter({ hasText: 'Onboarding afgerond: Julia Peters' });
  await expect(seeded.getByText('14-10-2026 10:30')).toBeVisible();
});
