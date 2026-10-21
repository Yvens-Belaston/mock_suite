import { expect, test, type Page } from '@playwright/test';

const AUTH = { authorization: 'Bearer demo-token' };

async function openEntra(page: Page) {
  await page.goto('/ui/entra');
  await expect(page.getByTestId('live-dot')).toHaveAttribute('data-state', 'connected');
}

const row = (page: Page, name: string) => page.getByRole('row', { name: new RegExp(name) });

test('seed users are listed with initials, UPN, function, manager and licence chips', async ({ page }) => {
  await openEntra(page);
  const pieter = row(page, 'Pieter Bakker').first();
  await expect(pieter).toBeVisible();
  await expect(pieter.getByText('pieter.bakker@demo-amsterdam.onmicrosoft.com')).toBeVisible();
  await expect(pieter.getByText('Manager Digitalisering')).toBeVisible();
  await expect(pieter.getByText('M365_E3')).toBeVisible();
  await expect(pieter.getByText('VISIO_PLAN2')).toBeVisible();
  await expect(pieter.getByText('PB', { exact: true })).toBeVisible();

  const fatima = row(page, 'Fatima El Amrani').first();
  await expect(fatima.getByRole('cell', { name: 'Pieter Bakker', exact: true })).toBeVisible();
});

test('a created user appears at the top with a flash, and shows Uitgeschakeld once disabled', async ({ page, request }) => {
  await openEntra(page);
  const nick = `sanne.devries.${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const name = `Sanne de Vries ${nick.slice(-6)}`;
  const res = await request.post('/v1.0/users', {
    headers: AUTH,
    data: {
      accountEnabled: true,
      displayName: name,
      mailNickname: nick,
      userPrincipalName: `${nick}@demo-amsterdam.onmicrosoft.com`,
      jobTitle: 'Beleidsmedewerker',
      department: 'Digitalisering',
      passwordProfile: { password: 'Welkom!2026', forceChangePasswordNextSignIn: true },
    },
  });
  expect(res.status()).toBe(201);
  const id = (await res.json()).id as string;

  const r = row(page, name);
  await expect(r).toBeVisible({ timeout: 1000 });
  await expect(r).toHaveClass(/flash/);
  await expect(r.getByText('Actief')).toBeVisible();
  await expect(r).toHaveAttribute('data-id', id);

  const patch = await request.patch(`/v1.0/users/${id}`, { headers: AUTH, data: { accountEnabled: false } });
  expect(patch.ok()).toBe(true);
  await expect(r.getByText('Uitgeschakeld')).toBeVisible({ timeout: 1000 });
  await expect(r).toHaveAttribute('data-disabled', 'true');
});
