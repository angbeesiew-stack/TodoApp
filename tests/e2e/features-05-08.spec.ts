import { expect, test } from '@playwright/test';
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/auth';
import { db } from '@/lib/db';
import { e2eDatabasePath } from './db-path';

test.beforeEach(async ({ context }) => {
  process.env.TODO_DB_PATH = e2eDatabasePath;
  const { db: testDb } = await import('@/lib/db');
  testDb.exec('DELETE FROM todos; DELETE FROM templates; DELETE FROM tags;');
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

test('creates and tracks subtasks, including ordered progress and parent cascade', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Title').fill('Prepare release');
  await page.getByRole('textbox', { name: 'Draft subtask' }).fill('Write notes');
  await page.getByRole('button', { name: 'Add subtask' }).click();
  await page.getByRole('textbox', { name: 'Draft subtask' }).fill('Review build');
  await page.getByRole('button', { name: 'Add subtask' }).click();
  await expect(page.getByRole('button', { name: 'Add todo' })).toBeEnabled();
  await page.getByRole('button', { name: 'Add todo' }).click();

  const item = page.getByTestId('todo-item').filter({ hasText: 'Prepare release' });
  await expect(item).toContainText('0/2 subtasks');
  await item.getByRole('button', { name: '▶ Subtasks' }).click();
  const writeNotes = item.getByRole('checkbox', { name: 'Mark subtask Write notes complete' });
  const reviewBuild = item.getByRole('checkbox', { name: 'Mark subtask Review build complete' });
  await writeNotes.check();
  await expect(item).toContainText('1/2 subtasks');
  await reviewBuild.check();
  await expect(item).toContainText('2/2 subtasks');
  await expect(item.locator('.progress-fill')).toHaveClass(/complete/);

  await item.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect.poll(() => {
    const storedCount = db.prepare('SELECT COUNT(*) AS count FROM subtasks').get() as { count: number };
    return storedCount.count;
  }).toBe(0);
});

test('manages tags, applies multiple tags, and filters todos by tag', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '+ Manage Tags' }).click();
  const tagDialog = page.getByRole('dialog', { name: 'Manage Tags' });
  await page.getByLabel('Tag name').fill('Work');
  await page.getByRole('button', { name: 'Create Tag' }).click();
  await expect(tagDialog.getByText('Work', { exact: true })).toBeVisible();
  await page.getByLabel('Tag name').fill('Focus');
  await page.getByRole('button', { name: 'Create Tag' }).click();
  await expect(tagDialog.getByText('Focus', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();

  await page.getByLabel('Title').fill('Write proposal');
  const tagSelector = page.getByRole('group', { name: 'Tags' });
  await tagSelector.getByRole('button', { name: /Work/ }).click();
  await tagSelector.getByRole('button', { name: /Focus/ }).click();
  await page.getByRole('button', { name: 'Add todo' }).click();
  const tagged = page.getByTestId('todo-item').filter({ hasText: 'Write proposal' });
  await expect(tagged.getByLabel('Filter by Work')).toBeVisible();
  await expect(tagged.getByLabel('Filter by Focus')).toBeVisible();

  await page.getByLabel('Tag filter').selectOption({ label: 'Work' });
  await expect(tagged).toBeVisible();
  await expect(page.getByRole('heading', { name: /Pending/ })).toContainText('1');
  await page.getByLabel('Tag filter').selectOption('all');
  await expect(tagged).toBeVisible();
});

test('saves and uses a subtask template and persists combined filter presets', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Title').fill('Weekly planning');
  await page.getByLabel('Priority', { exact: true }).selectOption('high');
  await page.getByRole('textbox', { name: 'Draft subtask' }).fill('Review goals');
  await page.getByRole('button', { name: 'Add subtask' }).click();
  await page.getByRole('button', { name: '💾 Save as Template' }).click();
  await page.getByLabel('Template name').fill('Planning template');
  await page.getByLabel('Category (optional)').fill('Work');
  await page.getByRole('button', { name: 'Save Template' }).click();

  await page.getByLabel('Use Template').selectOption({ label: 'Planning template (Work)' });
  const todo = page.getByTestId('todo-item').filter({ hasText: 'Weekly planning' });
  await expect(todo).toHaveCount(1);
  await todo.getByRole('button', { name: '▶ Subtasks' }).click();
  await expect(todo).toContainText('Review goals');
  const created = await page.request.get('/api/todos');
  const todos = await created.json() as Array<{ title: string; tags: unknown[] }>;
  expect(todos.filter((item) => item.title === 'Weekly planning').every((item) => item.tags.length === 0)).toBe(true);

  await page.getByLabel('Search todos and subtasks').fill('Weekly');
  await page.getByLabel('Priority filter').selectOption('high');
  await page.getByRole('button', { name: '💾 Save Filter' }).click();
  await page.getByLabel('Preset name').fill('High weekly');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: '▶ Advanced' }).click();
  await page.getByLabel('Search todos and subtasks').fill('no match');
  await expect(page.getByText('No todos match your filters.')).toBeVisible();
  await page.getByRole('button', { name: 'High weekly', exact: true }).click();
  await expect(page.getByTestId('todo-item')).toHaveCount(1);
  await expect(page.getByText('No todos match your filters.')).toHaveCount(0);
});
