import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const AUTH = { authorization: `Basic ${Buffer.from('bonita:secret').toString('base64')}` };

const text = (t: string, marks?: unknown[]) => ({ type: 'text', text: t, ...(marks ? { marks } : {}) });
const para = (...content: unknown[]) => ({ type: 'paragraph', content });

async function openBoard(page: Page) {
  await page.goto('/ui/jira');
  await expect(page.getByTestId('live-dot')).toHaveAttribute('data-state', 'connected');
}

async function createIssue(request: APIRequestContext, fields: Record<string, unknown>): Promise<string> {
  const res = await request.post('/rest/api/3/issue', {
    headers: AUTH,
    data: { fields: { project: { key: 'IAM' }, issuetype: { name: 'Task' }, ...fields } },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).key;
}

test('clicking a card opens a modal with the rendered ADF description and the comments', async ({ page, request }) => {
  await openBoard(page);
  const key = await createIssue(request, {
    summary: 'SAP-toegang',
    description: {
      type: 'doc',
      version: 1,
      content: [
        para(text('Geef '), text('Sanne de Vries', [{ type: 'strong' }]), text(' toegang tot SAP')),
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [para(text('Rol: inkoper'))] },
            { type: 'listItem', content: [para(text('Kostenplaats 4711'))] },
          ],
        },
        para(text('Zie '), text('het dossier', [{ type: 'link', attrs: { href: 'https://example.org/case/42' } }])),
        { type: 'panel', content: [para(text('Onbekend blok blijft leesbaar'))] },
      ],
    },
  });
  const comment = await request.post(`/rest/api/3/issue/${key}/comment`, {
    headers: AUTH,
    data: { body: { type: 'doc', version: 1, content: [para(text('Manager heeft akkoord gegeven'))] } },
  });
  expect(comment.status()).toBe(201);

  const card = page.getByRole('article', { name: key });
  await card.getByText('SAP-toegang').click();

  const modal = page.getByRole('dialog', { name: key });
  await expect(modal).toBeVisible();
  await expect(modal.locator('strong', { hasText: 'Sanne de Vries' })).toBeVisible();
  await expect(modal.getByRole('listitem').filter({ hasText: 'Rol: inkoper' })).toBeVisible();
  await expect(modal.getByRole('listitem').filter({ hasText: 'Kostenplaats 4711' })).toBeVisible();
  await expect(modal.getByRole('link', { name: 'het dossier' })).toHaveAttribute('href', 'https://example.org/case/42');
  await expect(modal.getByText('Onbekend blok blijft leesbaar')).toBeVisible();
  await expect(modal.getByText('Manager heeft akkoord gegeven')).toBeVisible();
  await expect(modal.getByText('Ofelia Integratie')).toBeVisible();

  await modal.getByRole('button', { name: 'Sluiten' }).click();
  await expect(modal).toHaveCount(0);
});

test('the Start button moves the card without opening the modal', async ({ page, request }) => {
  await openBoard(page);
  const key = await createIssue(request, { summary: 'Geen modal' });
  await page.getByRole('article', { name: key }).getByRole('button', { name: 'Start' }).click();
  await expect(page.getByRole('region', { name: 'In Progress' }).getByRole('article', { name: key })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
