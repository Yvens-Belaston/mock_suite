import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const auth = { authorization: 'Basic ' + Buffer.from('ofelia:demo').toString('base64') };

async function createChange(request: APIRequestContext, briefDescription: string): Promise<{ id: string; number: string }> {
  const res = await request.post('/tas/api/operatorChanges', {
    headers: auth,
    data: { briefDescription, changeType: 'simple', requester: { name: 'Fatima El Amrani' } },
  });
  expect(res.status()).toBe(201);
  return res.json();
}

async function openTab(page: Page, name: string) {
  await page.goto('/ui/topdesk');
  await expect(page.getByTestId('live-dot')).toHaveAttribute('data-state', 'connected');
  await page.getByRole('tab', { name }).click();
}

test('Afronden turns a new change from Aangemeld to Afgerond, readable via the API', async ({ page, request }) => {
  const created = await createChange(request, 'Laptop uitgeven Playwright Afronden');
  await openTab(page, 'Wijzigingen');
  const row = page.getByRole('table', { name: 'Wijzigingen' }).getByRole('row', { name: new RegExp(created.number) });
  await expect(row).toContainText('Laptop uitgeven Playwright Afronden');
  await expect(row.getByTestId('status-pill')).toHaveText('Aangemeld');

  await row.getByRole('button', { name: 'Afronden' }).click();
  await expect(row.getByTestId('status-pill')).toHaveText('Afgerond', { timeout: 2000 });
  await expect(row.getByRole('button', { name: 'Afronden' })).toBeDisabled();

  const res = await request.get(`/tas/api/operatorChanges/${created.id}`, { headers: auth });
  expect((await res.json()).processingStatus).toBe('simple_done');
});

test('In behandeling moves a change to In behandeling; seed changes show Afgerond', async ({ page, request }) => {
  const created = await createChange(request, 'Toegangspas Playwright Start');
  await openTab(page, 'Wijzigingen');
  const table = page.getByRole('table', { name: 'Wijzigingen' });
  await expect(table.getByRole('row', { name: /C 2610 001/ }).getByTestId('status-pill')).toHaveText('Afgerond');

  const row = table.getByRole('row', { name: new RegExp(created.number) });
  await row.getByRole('button', { name: 'In behandeling' }).click();
  await expect(row.getByTestId('status-pill')).toHaveText('In behandeling', { timeout: 2000 });
  await expect(row.getByRole('button', { name: 'In behandeling' })).toBeDisabled();
  await expect(row.getByRole('button', { name: 'Afronden' })).toBeEnabled();
});

test('an archived person shows the Gearchiveerd badge', async ({ page, request }) => {
  const res = await request.post('/tas/api/persons', {
    headers: auth,
    data: { firstName: 'Archief', surName: `Playwright${Date.now()}` },
  });
  expect(res.status()).toBe(201);
  const person: { id: string; dynamicName: string } = await res.json();
  await openTab(page, 'Personen');
  const row = page.getByRole('table', { name: 'Personen' }).getByRole('row', { name: new RegExp(person.dynamicName) });
  await expect(row).toBeVisible();
  await expect(row.getByText('Gearchiveerd')).toHaveCount(0);

  const archive = await request.patch(`/tas/api/persons/id/${person.id}/archive`, { headers: auth });
  expect(archive.ok()).toBe(true);
  await expect(row.getByText('Gearchiveerd')).toBeVisible({ timeout: 1000 });
});
