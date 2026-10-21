import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const AUTH = { authorization: `Basic ${Buffer.from('bonita:secret').toString('base64')}` };

async function createIssue(request: APIRequestContext, summary: string): Promise<string> {
  const res = await request.post('/rest/api/3/issue', {
    headers: AUTH,
    data: { fields: { project: { key: 'IAM' }, issuetype: { name: 'Task' }, summary } },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).key;
}

async function openBoard(page: Page) {
  await page.goto('/ui/jira');
  await expect(page.getByTestId('live-dot')).toHaveAttribute('data-state', 'connected');
}

const column = (page: Page, name: string) => page.getByRole('region', { name });

test('dragging a card onto the Done column transitions it to Done', async ({ page, request }) => {
  await openBoard(page);
  const key = await createIssue(request, 'Sleep-test');
  const todo = column(page, 'To Do');
  const done = column(page, 'Done');
  await expect(todo.getByRole('article', { name: key })).toBeVisible();

  await todo.getByRole('article', { name: key }).dragTo(done);

  await expect(done.getByRole('article', { name: key })).toBeVisible();
  await expect(todo.getByRole('article', { name: key })).toHaveCount(0);
  const issue = await (await request.get(`/rest/api/3/issue/${key}`, { headers: AUTH })).json();
  expect(issue.fields.status.name).toBe('Done');
});
