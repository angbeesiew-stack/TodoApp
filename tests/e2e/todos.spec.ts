import { expect, test } from '@playwright/test';
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/auth';
import { e2eDatabasePath } from './db-path';

test.beforeEach(async ({ context }) => {
  process.env.TODO_DB_PATH = e2eDatabasePath;
  const { db } = await import('@/lib/db');
  db.exec('DELETE FROM todos;');
  await context.addCookies([
    {
      name: SESSION_COOKIE_NAME,
      value: createSessionToken(1),
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      expires: Math.floor(Date.now() / 1000) + 60 * 60,
    },
  ]);
});

test('creates, completes, edits, and deletes a todo', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Title').fill('Write release notes');
  await page.getByRole('button', { name: 'Add todo' }).click();
  const item = page.getByTestId('todo-item').filter({ hasText: 'Write release notes' });
  await expect(item).toBeVisible();
  await expect(page.getByRole('heading', { name: /Pending/ })).toContainText('1');

  await item.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Edit title').fill('Publish release notes');
  await page.getByRole('button', { name: 'Update' }).click();
  const edited = page.getByTestId('todo-item').filter({ hasText: 'Publish release notes' });
  await expect(edited).toBeVisible();

  await edited.getByRole('checkbox').check();
  await expect(page.getByRole('heading', { name: /Completed/ })).toContainText('1');
  await edited.getByRole('button', { name: 'Delete' }).click();
  await expect(edited).toHaveCount(0);
});

test('filters by priority and displays its badge', async ({ page }) => {
  await page.goto('/');
  for (const [title, priority] of [
    ['Urgent item', 'high'],
    ['Later item', 'low'],
  ] as const) {
    await page.getByLabel('Title').fill(title);
    await page.getByRole('combobox', { name: 'Priority', exact: true }).selectOption(priority);
    const createResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/todos') && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Add todo' }).click();
    expect((await createResponse).status()).toBe(201);
  }

  await expect(page.getByTestId('todo-item')).toHaveCount(2);
  await page.getByLabel('Priority filter').selectOption('high');
  await expect(page.getByTestId('todo-item')).toHaveCount(1);
  await expect(page.getByTestId('todo-item').first()).toContainText('Urgent item');
  await expect(page.getByLabel('Priority: High')).toBeVisible();
});

test('creates a recurring todo and spawns one next occurrence on completion', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Title').fill('Monthly review');
  await page.getByLabel('Due date and time').fill('2030-01-31T09:00');
  await page.getByLabel('Repeat').check();
  await page.getByLabel('Recurrence pattern').selectOption('monthly');
  await page.getByRole('button', { name: 'Add todo' }).click();
  const item = page.getByTestId('todo-item').filter({ hasText: 'Monthly review' });
  await expect(item).toContainText('monthly');
  await item.getByRole('checkbox').check();
  await expect(page.getByTestId('todo-item').filter({ hasText: 'Monthly review' })).toHaveCount(
    2,
  );
});

test('saves reminder offsets and renders their badges', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Title').fill('Prepare agenda');
  await page.getByLabel('Due date and time').fill('2030-01-02T10:00');
  await page.getByLabel('Reminder').selectOption('60');
  const createResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/todos') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Add todo' }).click();
  expect((await createResponse).status()).toBe(201);
  await expect(
    page.getByTestId('todo-item').filter({ hasText: 'Prepare agenda' }),
  ).toContainText('1h');

  await page.getByLabel('Due date and time').fill('');
  await expect(page.getByLabel('Reminder')).toBeDisabled();
});
