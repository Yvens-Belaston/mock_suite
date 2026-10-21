import { expect, test, type APIRequestContext } from '@playwright/test';

const auth = { authorization: 'Basic ' + Buffer.from('ofelia:demo').toString('base64') };

async function createIncident(request: APIRequestContext, briefDescription: string): Promise<{ id: string; number: string }> {
  const res = await request.post('/tas/api/incidents', {
    headers: auth,
    data: {
      briefDescription,
      request: `${briefDescription}. Graag laptop en accounts klaarzetten.`,
      callerLookup: { email: 'fatima.elamrani@demo-amsterdam.onmicrosoft.com' },
    },
  });
  expect(res.status()).toBe(201);
  return res.json();
}

test('the Meldingen tab lists the seed incidents with their columns', async ({ page }) => {
  await page.goto('/ui/topdesk');
  await expect(page.getByRole('tab', { name: 'Meldingen' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Wijzigingen' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Personen' })).toBeVisible();
  const table = page.getByRole('table', { name: 'Meldingen' });
  for (const name of ['Nummer', 'Korte omschrijving', 'Aanmelder', 'Categorie', 'Status', 'Extern nummer']) {
    await expect(table.getByRole('columnheader', { name, exact: true })).toBeVisible();
  }
  const row = table.getByRole('row', { name: /I 2610 001/ });
  await expect(row).toContainText('Indiensttreding Mark de Wit');
  await expect(row).toContainText('Fatima El Amrani');
  await expect(row).toContainText('Personeel');
  await expect(row).toContainText('Afgemeld');
});

test('an incident created via the API appears at the top within 1 s and flashes', async ({ page, request }) => {
  await page.goto('/ui/topdesk');
  await expect(page.getByTestId('live-dot')).toHaveAttribute('data-state', 'connected');
  await expect(page.getByRole('row', { name: /I 2610 001/ })).toBeVisible();
  const created = await createIncident(request, 'Indiensttreding Playwright Nieuw');
  const row = page.getByRole('table', { name: 'Meldingen' }).getByRole('row', { name: new RegExp(created.number) });
  await expect(row).toBeVisible({ timeout: 1000 });
  await expect(row).toHaveClass(/flash/);
  // Newest first: the first body row is the newest incident (parallel specs may add more; none are older).
  const numbers = await page.getByRole('table', { name: 'Meldingen' }).locator('tbody tr td:first-child').allTextContents();
  expect(numbers).toContain(created.number);
  expect([...numbers].sort().reverse()).toEqual(numbers);
});

test('clicking a row opens the side panel; a PATCHed action shows at the top', async ({ page, request }) => {
  const created = await createIncident(request, 'Indiensttreding Playwright Paneel');
  await page.goto('/ui/topdesk');
  await expect(page.getByTestId('live-dot')).toHaveAttribute('data-state', 'connected');
  await page.getByRole('row', { name: new RegExp(created.number) }).click();

  const panel = page.getByRole('complementary', { name: `Melding ${created.number}` });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Indiensttreding Playwright Paneel. Graag laptop en accounts klaarzetten.');
  await expect(panel.getByRole('listitem').first()).toContainText('Melding geregistreerd');

  const res = await request.patch(`/tas/api/incidents/id/${created.id}`, {
    headers: auth,
    data: { action: 'Ofelia case 42 gestart', externalNumber: 'OFELIA-42' },
  });
  expect(res.status()).toBe(200);
  const top = panel.getByRole('listitem').first();
  await expect(top).toContainText('Ofelia case 42 gestart', { timeout: 1000 });
  await expect(top).toContainText('Ofelia Integratie');
  await expect(top.locator('time')).toBeVisible();
  await expect(panel.getByRole('listitem').nth(1)).toContainText('Melding geregistreerd');
  await expect(page.getByRole('row', { name: new RegExp(created.number) })).toContainText('OFELIA-42');

  await panel.getByRole('button', { name: 'Sluiten' }).click();
  await expect(panel).toHaveCount(0);
});
