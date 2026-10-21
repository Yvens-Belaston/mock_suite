import { expect, test } from '@playwright/test';

// Shared server, other specs create incidents too: assert on the number this submit returns, never on seed counts.

test('submitting the default onboarding form adds a Personeel / Indiensttreding incident', async ({ page }) => {
  await page.goto('/ui/topdesk');
  await expect(page.getByTestId('live-dot')).toHaveAttribute('data-state', 'connected');

  await page.getByRole('button', { name: 'Nieuwe aanvraag indiensttreding' }).click();
  const form = page.getByRole('form', { name: 'Nieuwe aanvraag indiensttreding' });
  await expect(form.getByLabel('Voornaam')).toHaveValue('Sanne');
  await expect(form.getByLabel('Achternaam')).toHaveValue('de Vries');
  await expect(form.getByLabel('Startdatum')).toHaveValue('2026-12-01');
  await expect(form.getByRole('checkbox', { name: 'SAP' })).toBeChecked();
  await expect(form.getByRole('checkbox', { name: 'Zaaksysteem' })).toBeChecked();
  await expect(form.getByRole('checkbox', { name: 'Decos' })).not.toBeChecked();
  await expect(form.getByRole('checkbox', { name: 'GIS-viewer' })).not.toBeChecked();

  const responsePromise = page.waitForResponse((r) => r.url().endsWith('/admin/topdesk/onboarding'));
  await form.getByRole('button', { name: 'Indienen' }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  const { incident } = (await response.json()) as { incident: { number: string } };

  await expect(form).toBeHidden();
  const row = page.getByRole('table', { name: 'Meldingen' }).getByRole('row').filter({ hasText: incident.number });
  await expect(row).toContainText('Indiensttreding Sanne de Vries');
  await expect(row).toContainText('Personeel / Indiensttreding');
  await expect(row).toContainText('Pieter Bakker');
});

test('"Wis" clears the form and the form stays open', async ({ page }) => {
  await page.goto('/ui/topdesk');
  await page.getByRole('button', { name: 'Nieuwe aanvraag indiensttreding' }).click();
  const form = page.getByRole('form', { name: 'Nieuwe aanvraag indiensttreding' });
  await form.getByRole('button', { name: 'Wis' }).click();
  await expect(form.getByLabel('Voornaam')).toHaveValue('');
  await expect(form.getByLabel('Achternaam')).toHaveValue('');
  await expect(form.getByRole('checkbox', { name: 'SAP' })).not.toBeChecked();
  await expect(form).toBeVisible();
});

// Playwright runs with BONITA_ENABLED=false, so the callback A outcome event is stubbed on /events.
async function stubCallbackEvent(page: import('@playwright/test').Page, action: string, summary: string) {
  const event = { system: 'topdesk', entity: 'incident', action, id: 'stub', summary, at: new Date().toISOString() };
  await page.route('**/events', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
      body: `retry: 600000\n\nevent: change\ndata: ${JSON.stringify(event)}\n\n`,
    }),
  );
}

test('a started Ofelia case shows a toast with the case id', async ({ page }) => {
  await stubCallbackEvent(page, 'callback_ok', 'Ofelia-proces gestart – case 1042');
  await page.goto('/ui/topdesk');
  const toast = page.getByRole('status').getByText('Ofelia-proces gestart – case 1042');
  await expect(toast).toBeVisible();
});

test('a Bonita error shows a red toast with the HTTP status', async ({ page }) => {
  await stubCallbackEvent(page, 'callback_error', 'Fout bij starten Ofelia-proces (HTTP 500)');
  await page.goto('/ui/topdesk');
  const toast = page.getByRole('status').locator('div', { hasText: 'Fout bij starten Ofelia-proces (HTTP 500)' }).last();
  await expect(toast).toBeVisible();
  await expect(toast).toHaveClass(/text-red-800/);
});

test('with BONITA_ENABLED=false the header shows "Ofelia niet verbonden"', async ({ page }) => {
  await page.goto('/ui/topdesk');
  await expect(page.getByRole('banner').getByText('Ofelia niet verbonden')).toBeVisible();
});
