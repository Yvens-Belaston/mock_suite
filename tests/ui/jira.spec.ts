import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const AUTH = { authorization: `Basic ${Buffer.from('bonita:secret').toString('base64')}` };

async function createIssue(request: APIRequestContext, fields: Record<string, unknown>): Promise<string> {
  const res = await request.post('/rest/api/3/issue', { headers: AUTH, data: { fields } });
  expect(res.status()).toBe(201);
  return (await res.json()).key;
}

async function openBoard(page: Page, path = '/ui/jira') {
  await page.goto(path);
  await expect(page.getByTestId('live-dot')).toHaveAttribute('data-state', 'connected');
}

const column = (page: Page, name: string) => page.getByRole('region', { name });
const card = (page: Page, key: string) => page.getByRole('article', { name: key });

test('an API-created issue appears in To Do within 1 s, and Klaar moves it to Done', async ({ page, request }) => {
  await openBoard(page);
  const key = await createIssue(request, {
    project: { key: 'IAM' },
    issuetype: { name: 'Task' },
    summary: 'Onboarding Sanne de Vries',
    labels: ['case-9001', 'onboarding'],
    duedate: '2026-12-01',
    assignee: { accountId: '712020:5f1c2a7e-0b3d-4c1e-9a6f-1d2e3f4a5b01' },
  });

  const todo = column(page, 'To Do');
  await expect(todo.getByRole('article', { name: key })).toBeVisible({ timeout: 1000 });
  const c = card(page, key);
  await expect(c.getByText('Onboarding Sanne de Vries')).toBeVisible();
  await expect(c.getByText('NH', { exact: true })).toBeVisible();
  await expect(c.getByText('01-12-2026')).toBeVisible();
  await expect(c.getByText('onboarding', { exact: true })).toBeVisible();

  await c.getByRole('button', { name: 'Klaar' }).click();
  await expect(column(page, 'Done').getByRole('article', { name: key })).toBeVisible();
  await expect(todo.getByRole('article', { name: key })).toHaveCount(0);

  const issue = await (await request.get(`/rest/api/3/issue/${key}`, { headers: AUTH })).json();
  expect(issue.fields.status.name).toBe('Done');
});

test('Start moves a card to In Progress', async ({ page, request }) => {
  await openBoard(page);
  const key = await createIssue(request, { project: { key: 'IAM' }, issuetype: { name: 'Task' }, summary: 'Start-test' });
  await card(page, key).getByRole('button', { name: 'Start' }).click();
  await expect(column(page, 'In Progress').getByRole('article', { name: key })).toBeVisible();
});

test('the project switcher shows only the chosen project', async ({ page, request }) => {
  await openBoard(page);
  const auto = await createIssue(request, { project: { key: 'AUTO' }, issuetype: { name: 'Task' }, summary: 'Auto-test' });
  await expect(page.getByRole('article', { name: /^IAM-/ }).first()).toBeVisible();
  await expect(card(page, auto)).toHaveCount(0);

  await page.getByRole('tab', { name: 'AUTO' }).click();
  await expect(card(page, auto)).toBeVisible();
  await expect(page.getByRole('article', { name: /^IAM-/ })).toHaveCount(0);
});

test('a past due date is shown in red', async ({ page, request }) => {
  await openBoard(page);
  const key = await createIssue(request, {
    project: { key: 'IAM' },
    issuetype: { name: 'Task' },
    summary: 'Te laat',
    duedate: '2020-01-01',
  });
  await expect(card(page, key).getByText('01-01-2020')).toHaveAttribute('data-overdue', 'true');
});
