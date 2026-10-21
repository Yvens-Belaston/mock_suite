import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const AUTH = { authorization: 'Bearer demo-token' };

async function openEntra(page: Page) {
  await page.goto('/ui/entra');
  await expect(page.getByTestId('live-dot')).toHaveAttribute('data-state', 'connected');
}

/** Creates a uniquely named user (parallel specs share one server). */
async function createUser(request: APIRequestContext) {
  const nick = `panel.${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const name = `Paneel Test ${nick.slice(-7)}`;
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
  return { id: (await res.json()).id as string, name };
}

test('after a PATCH on a user, clicking that user shows the PATCH in the audit list', async ({ page, request }) => {
  const { id, name } = await createUser(request);
  const patch = await request.patch(`/v1.0/users/${id}`, { headers: AUTH, data: { accountEnabled: false } });
  expect(patch.ok()).toBe(true);
  const revoke = await request.post(`/v1.0/users/${id}/revokeSignInSessions`, { headers: AUTH });
  expect(revoke.ok()).toBe(true);

  await openEntra(page);
  await page.getByRole('row', { name: new RegExp(name) }).click();

  const panel = page.getByRole('complementary', { name: name });
  await expect(panel).toBeVisible();
  const audit = panel.getByRole('list', { name: 'Audit' });
  await expect(audit.getByRole('listitem').filter({ hasText: `PATCH /v1.0/users/${id}` })).toBeVisible();
  await expect(audit.getByRole('listitem').filter({ hasText: `POST /v1.0/users/${id}/revokeSignInSessions` })).toBeVisible();
  await expect(audit.getByRole('listitem').filter({ hasText: 'POST /v1.0/users' }).first()).toHaveText(
    /\d{2}-\d{2}-\d{4} \d{2}:\d{2}/,
  );
  await expect(panel.getByText(/Sessies ingetrokken \d{2}-\d{2}-\d{4} \d{2}:\d{2}/)).toBeVisible();
});

test('a PATCH made while the panel is open appears in its audit list', async ({ page, request }) => {
  const { id, name } = await createUser(request);
  await openEntra(page);
  await page.getByRole('row', { name: new RegExp(name) }).click();
  const audit = page.getByRole('complementary', { name }).getByRole('list', { name: 'Audit' });
  await expect(audit.getByRole('listitem').filter({ hasText: `PATCH /v1.0/users/${id}` })).toHaveCount(0);

  await request.patch(`/v1.0/users/${id}`, { headers: AUTH, data: { jobTitle: 'Teamleider' } });
  await expect(audit.getByRole('listitem').filter({ hasText: `PATCH /v1.0/users/${id}` })).toBeVisible({ timeout: 2000 });
});

test('after adding a member, the Groups tab count increments and the new member is listed', async ({ page, request }) => {
  const { id, name } = await createUser(request);
  const groups = (await (await request.get('/v1.0/groups', { headers: AUTH })).json()).value as { id: string; displayName: string }[];
  const group = groups[0];

  await openEntra(page);
  await page.getByRole('tab', { name: 'Groepen' }).click();
  const groupRow = page.getByTestId(`group-${group.id}`);
  const count = Number(await groupRow.getByTestId('member-count').textContent());

  const add = await request.post(`/v1.0/groups/${group.id}/members/$ref`, {
    headers: AUTH,
    data: { '@odata.id': `https://graph.microsoft.com/v1.0/directoryObjects/${id}` },
  });
  expect(add.status()).toBe(204);

  await expect(groupRow.getByTestId('member-count')).not.toHaveText(String(count), { timeout: 1000 });
  expect(Number(await groupRow.getByTestId('member-count').textContent())).toBeGreaterThan(count);
  await groupRow.getByRole('button', { name: new RegExp(group.displayName) }).click();
  await expect(groupRow.getByRole('listitem').filter({ hasText: name })).toBeVisible();

  // the panel shows the group for that user
  await page.getByRole('tab', { name: 'Gebruikers' }).click();
  await page.getByRole('row', { name: new RegExp(name) }).click();
  await expect(page.getByRole('complementary', { name }).getByText(group.displayName)).toBeVisible();
});
