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

test('with BONITA_ENABLED=false the header shows "Ofelia niet verbonden"', async ({ page }) => {
  await page.goto('/ui/topdesk');
  await expect(page.getByRole('banner').getByText('Ofelia niet verbonden')).toBeVisible();
});
