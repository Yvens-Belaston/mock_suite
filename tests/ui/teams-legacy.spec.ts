import { expect, test } from '@playwright/test';

// Spec 4.5 / 6.4: legacy MessageCard and plain `{text}` payloads render as simple cards.
const unique = () => Math.random().toString(36).slice(2, 8);

test.beforeEach(async ({ page }) => {
  await page.goto('/ui/teams?channel=servicedesk');
  await expect(page.getByTestId('live-dot')).toHaveAttribute('data-state', 'connected');
});

test('a plain-text payload shows as a card with its text within 1 s', async ({ page, request }) => {
  const text = `Laptop klaar ${unique()}`;
  const res = await request.post('/teams/hook/servicedesk', { data: { text } });
  expect(res.status()).toBe(202);

  const message = page.getByTestId('teams-message').filter({ hasText: text });
  await expect(message).toBeVisible({ timeout: 1000 });
  await expect(message.locator('.ac-adaptiveCard')).toContainText(text);
});

test('a MessageCard shows its title, text and section facts as a card within 1 s', async ({ page, request }) => {
  const id = unique();
  const res = await request.post('/teams/hook/servicedesk', {
    data: {
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      summary: 'Incident aangemaakt',
      title: `Nieuw incident ${id}`,
      text: 'Laptop van Daan Visser start niet op.',
      sections: [{ facts: [{ name: 'Toegewezen aan', value: `Werkplekbeheer ${id}` }] }],
    },
  });
  expect(res.status()).toBe(202);

  const message = page.getByTestId('teams-message').filter({ hasText: `Nieuw incident ${id}` });
  await expect(message).toBeVisible({ timeout: 1000 });
  const card = message.locator('.ac-adaptiveCard');
  await expect(card).toContainText('Laptop van Daan Visser start niet op.');
  await expect(card).toContainText('Toegewezen aan');
  await expect(card).toContainText(`Werkplekbeheer ${id}`);
  await expect(message).toHaveAttribute('data-escalation', 'false');
});
