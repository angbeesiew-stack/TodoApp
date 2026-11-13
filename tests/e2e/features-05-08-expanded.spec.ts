import { expect, test, type Page } from '@playwright/test';
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/auth';
import { e2eDatabasePath } from './db-path';

test.beforeEach(async ({ context }) => {
  process.env.TODO_DB_PATH = e2eDatabasePath;
  const { db } = await import('@/lib/db');
  db.exec('DELETE FROM todos; DELETE FROM templates; DELETE FROM tags;');
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

async function createTodo(
  page: Page,
  options: {
    title: string;
    priority?: 'high' | 'medium' | 'low';
    dueDate?: string;
    tag?: string;
  },
) {
  await page.getByLabel('Title').fill(options.title);
  if (options.dueDate) {
    await page.getByLabel('Due date and time').fill(options.dueDate);
  }
  if (options.priority) {
    await page.getByLabel('Priority', { exact: true }).selectOption(options.priority);
  }
  if (options.tag) {
    const tagSelector = page.getByRole('group', { name: 'Tags' });
    await tagSelector.getByRole('button', { name: options.tag, exact: true }).click();
  }

  const createResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/api/todos' &&
    response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Add todo' }).click();
  expect((await createResponse).status()).toBe(201);

  const item = page.getByTestId('todo-item').filter({ hasText: options.title });
  await expect(item).toBeVisible();
  return item;
}

async function createTag(page: Page, name: string) {
  await page.getByRole('button', { name: '+ Manage Tags' }).click();
  const dialog = page.getByRole('dialog', { name: 'Manage Tags' });
  await dialog.getByLabel('Tag name').fill(name);

  const createResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/api/tags' &&
    response.request().method() === 'POST',
  );
  await dialog.getByRole('button', { name: 'Create Tag' }).click();
  expect((await createResponse).status()).toBe(201);
  await expect(dialog.getByText(name, { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();
}

test('keeps subtask progress independent and recalculates after sibling deletion', async ({
  page,
}) => {
  await page.goto('/');
  await createTodo(page, { title: 'Release checklist' });
  await createTodo(page, { title: 'Unrelated follow-up' });
  const item = page.getByTestId('todo-item').filter({ hasText: 'Release checklist' });

  await expect(item.locator('.subtask-progress')).toHaveCount(0);
  await item.getByRole('button', { name: '▶ Subtasks' }).click();

  const subtaskInput = item.getByRole('textbox', { name: 'Add subtask' });
  const firstAdd = page.waitForResponse((response) =>
    /\/api\/todos\/\d+\/subtasks$/.test(new URL(response.url()).pathname) &&
    response.request().method() === 'POST',
  );
  await subtaskInput.fill('Draft notes');
  await subtaskInput.press('Enter');
  expect((await firstAdd).status()).toBe(201);
  await expect(item).toContainText('0/1 subtasks');

  await subtaskInput.fill('Review build');
  const secondAdd = page.waitForResponse((response) =>
    /\/api\/todos\/\d+\/subtasks$/.test(new URL(response.url()).pathname) &&
    response.request().method() === 'POST',
  );
  await item.getByRole('button', { name: 'Add', exact: true }).click();
  expect((await secondAdd).status()).toBe(201);

  await subtaskInput.fill('Prepare release');
  const thirdAdd = page.waitForResponse((response) =>
    /\/api\/todos\/\d+\/subtasks$/.test(new URL(response.url()).pathname) &&
    response.request().method() === 'POST',
  );
  await item.getByRole('button', { name: 'Add', exact: true }).click();
  expect((await thirdAdd).status()).toBe(201);
  await expect(item).toContainText('0/3 subtasks');

  const parentCheckbox = item.getByRole('checkbox', { name: 'Mark Release checklist complete' });
  const toggleResponse = page.waitForResponse((response) =>
    /\/api\/subtasks\/\d+$/.test(new URL(response.url()).pathname) &&
    response.request().method() === 'PUT',
  );
  await item.getByRole('checkbox', { name: 'Mark subtask Draft notes complete' }).check();
  expect((await toggleResponse).status()).toBe(200);
  await expect(parentCheckbox).not.toBeChecked();
  await expect(item.locator('.progress-label')).toContainText('1/3 subtasks');
  await expect(item.locator('.progress-fill')).not.toHaveClass(/complete/);

  await item.getByRole('button', { name: '▼ Subtasks' }).click();
  await expect(item.locator('.subtask-progress')).toBeVisible();
  await expect(item).toContainText('1/3 subtasks');
  await item.getByRole('button', { name: '▶ Subtasks' }).click();

  await subtaskInput.fill('   ');
  await expect(item.getByRole('button', { name: 'Add', exact: true })).toBeDisabled();
  await expect(item.locator('.subtask-row')).toHaveCount(3);

  const deleteResponse = page.waitForResponse((response) =>
    /\/api\/subtasks\/\d+$/.test(new URL(response.url()).pathname) &&
    response.request().method() === 'DELETE',
  );
  await item.getByRole('button', { name: 'Delete subtask Review build' }).click();
  expect((await deleteResponse).status()).toBe(200);
  await expect(item).not.toContainText('Review build');
  await expect(item.locator('.progress-label')).toContainText('1/2 subtasks');

  const todosResponse = await page.request.get('/api/todos');
  const todos = await todosResponse.json() as Array<{
    title: string;
    subtasks: Array<{ title: string; position: number; completed: boolean }>;
  }>;
  const saved = todos.find((todo) => todo.title === 'Release checklist');
  expect(saved?.subtasks.map((subtask) => subtask.position)).toEqual([0, 2]);
  expect(saved?.subtasks.find((subtask) => subtask.title === 'Draft notes')?.completed).toBe(true);

  await page.getByLabel('Search todos and subtasks').fill('Prepare release');
  await expect(page.getByTestId('todo-item')).toHaveCount(1);
  await expect(page.getByTestId('todo-item').first()).toContainText('Release checklist');
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(page.getByTestId('todo-item')).toHaveCount(2);

  await item.getByRole('button', { name: 'Delete subtask Draft notes' }).click();
  await expect(item.locator('.progress-label')).toContainText('0/1 subtasks');
  await item.getByRole('button', { name: 'Delete subtask Prepare release' }).click();
  await expect(item.locator('.subtask-progress')).toHaveCount(0);
});

test('renames and deletes assigned tags while surfacing duplicate names', async ({ page }) => {
  await page.goto('/');
  await createTag(page, 'Focused');
  const taggedTodo = await createTodo(page, {
    title: 'Tagged proposal',
    tag: 'Focused',
  });
  await createTodo(page, { title: 'Untagged proposal' });
  await expect(taggedTodo.getByLabel('Filter by Focused')).toBeVisible();

  await page.getByRole('button', { name: '+ Manage Tags' }).click();
  const dialog = page.getByRole('dialog', { name: 'Manage Tags' });
  await dialog.getByLabel('Tag name').fill('Focused');
  const duplicateResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/api/tags' &&
    response.request().method() === 'POST',
  );
  await dialog.getByRole('button', { name: 'Create Tag' }).click();
  expect((await duplicateResponse).status()).toBe(409);
  await expect(page.locator('.error-banner')).toContainText(
    'A tag with this name already exists',
  );
  await expect(dialog.getByText('Focused', { exact: true })).toHaveCount(1);

  const tagRow = dialog.locator('li').filter({ hasText: 'Focused' });
  await tagRow.getByRole('button', { name: 'Edit' }).click();
  await dialog.getByLabel('Edit tag name').fill('Deep Focus');
  await dialog.getByLabel('Hex color').fill('#123456');
  const updateResponse = page.waitForResponse((response) =>
    /\/api\/tags\/\d+$/.test(new URL(response.url()).pathname) &&
    response.request().method() === 'PUT',
  );
  await dialog.getByRole('button', { name: 'Update Tag' }).click();
  expect((await updateResponse).status()).toBe(200);
  await expect(taggedTodo.getByLabel('Filter by Deep Focus')).toBeVisible();
  await page.getByLabel('Tag filter').selectOption({ label: 'Deep Focus' });
  await expect(page.getByTestId('todo-item')).toHaveCount(1);

  page.on('dialog', (confirmation) => confirmation.accept());
  const deleteResponse = page.waitForResponse((response) =>
    /\/api\/tags\/\d+$/.test(new URL(response.url()).pathname) &&
    response.request().method() === 'DELETE',
  );
  await dialog.locator('li').filter({ hasText: 'Deep Focus' })
    .getByRole('button', { name: 'Delete' }).click();
  expect((await deleteResponse).status()).toBe(200);

  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(taggedTodo.getByLabel('Filter by Deep Focus')).toHaveCount(0);
  await expect(page.getByLabel('Tag filter')).toHaveCount(0);
  await expect(page.getByTestId('todo-item')).toHaveCount(2);
});

test('reuses a saved template as an independent snapshot without copying tags or due dates', async ({
  page,
}) => {
  await page.goto('/');
  await createTag(page, 'Draft only');
  await page.getByLabel('Title').fill('Quarterly review');
  await page.getByLabel('Priority', { exact: true }).selectOption('high');
  await page.getByRole('group', { name: 'Tags' })
    .getByRole('button', { name: 'Draft only', exact: true }).click();
  await page.getByRole('textbox', { name: 'Draft subtask' }).fill('Collect metrics');
  await page.getByRole('button', { name: 'Add subtask' }).click();
  await page.getByRole('button', { name: '💾 Save as Template' }).click();
  await page.getByLabel('Template name').fill('Quarterly review template');
  await page.getByLabel('Category (optional)').fill('Planning');

  const saveResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/api/templates' &&
    response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Save Template' }).click();
  expect((await saveResponse).status()).toBe(201);

  const templateSelect = page.getByLabel('Use Template');
  await expect(templateSelect.locator('option')
    .filter({ hasText: 'Quarterly review template (Planning)' }))
    .toHaveCount(1);

  const useTemplate = async () => {
    const useResponse = page.waitForResponse((response) =>
      /\/api\/templates\/\d+\/use$/.test(new URL(response.url()).pathname) &&
      response.request().method() === 'POST',
    );
    await templateSelect.selectOption({ label: 'Quarterly review template (Planning)' });
    expect((await useResponse).status()).toBe(201);
  };

  await useTemplate();
  const createdTodos = page.getByTestId('todo-item').filter({ hasText: 'Quarterly review' });
  await expect(createdTodos).toHaveCount(1);
  const firstTodo = createdTodos.nth(0);
  await firstTodo.getByRole('button', { name: '▶ Subtasks' }).click();
  await expect(firstTodo).toContainText('Collect metrics');
  const toggleResponse = page.waitForResponse((response) =>
    /\/api\/subtasks\/\d+$/.test(new URL(response.url()).pathname) &&
    response.request().method() === 'PUT',
  );
  await firstTodo.getByRole('checkbox', { name: 'Mark subtask Collect metrics complete' }).check();
  expect((await toggleResponse).status()).toBe(200);

  await useTemplate();
  await expect(createdTodos).toHaveCount(2);
  await createdTodos.getByRole('button', { name: '▶ Subtasks' }).click();
  const updatedSubtaskStates = await createdTodos
    .getByRole('checkbox', { name: 'Mark subtask Collect metrics complete' })
    .evaluateAll((checkboxes) =>
      checkboxes.map((checkbox) => (checkbox as HTMLInputElement).checked).sort(),
    );
  expect(updatedSubtaskStates).toEqual([false, true]);

  const response = await page.request.get('/api/todos');
  const todos = await response.json() as Array<{
    title: string;
    due_date: string | null;
    priority: string;
    tags: unknown[];
    subtasks: Array<{ title: string; completed: boolean; position: number }>;
  }>;
  const created = todos.filter((todo) => todo.title === 'Quarterly review');
  expect(created).toHaveLength(2);
  expect(created.every((todo) => todo.due_date === null)).toBe(true);
  expect(created.every((todo) => todo.tags.length === 0)).toBe(true);
  expect(created.every((todo) => todo.priority === 'high')).toBe(true);
  expect(created.every((todo) =>
    todo.subtasks.length === 1 &&
    todo.subtasks[0].title === 'Collect metrics' &&
    todo.subtasks[0].position === 0,
  )).toBe(true);
});

test('combines all filter dimensions and restores then deletes a persisted preset', async ({
  page,
}) => {
  await page.goto('/');
  await createTag(page, 'Finance');

  const targetTitle = 'Budget closeout target';
  await createTodo(page, {
    title: targetTitle,
    priority: 'high',
    dueDate: '2030-01-15T10:00',
    tag: 'Finance',
  });
  await createTodo(page, {
    title: 'Budget closeout low priority',
    priority: 'low',
    dueDate: '2030-01-15T10:00',
    tag: 'Finance',
  });
  await createTodo(page, {
    title: 'Budget closeout without tag',
    priority: 'high',
    dueDate: '2030-01-15T10:00',
  });
  await createTodo(page, {
    title: 'Budget closeout incomplete',
    priority: 'high',
    dueDate: '2030-01-15T10:00',
    tag: 'Finance',
  });
  await createTodo(page, {
    title: 'Budget closeout outside date',
    priority: 'high',
    dueDate: '2030-01-16T10:00',
    tag: 'Finance',
  });

  for (const title of [
    targetTitle,
    'Budget closeout low priority',
    'Budget closeout without tag',
    'Budget closeout outside date',
  ]) {
    const updateResponse = page.waitForResponse((response) =>
      /\/api\/todos\/\d+$/.test(new URL(response.url()).pathname) &&
      response.request().method() === 'PUT',
    );
    await page.getByTestId('todo-item')
      .filter({ hasText: title })
      .getByRole('checkbox', { name: `Mark ${title} complete` }).check();
    expect((await updateResponse).status()).toBe(200);
  }

  await expect(page.getByTestId('todo-item')).toHaveCount(5);
  await expect(page.getByRole('button', { name: '💾 Save Filter' })).toHaveCount(0);
  await page.getByRole('button', { name: '▶ Advanced' }).click();

  await page.getByLabel('Search todos and subtasks').fill('BUDGET CLOSEOUT');
  await expect(page.getByTestId('todo-item')).toHaveCount(5);
  await page.getByLabel('Priority filter').selectOption('high');
  await page.getByLabel('Tag filter').selectOption({ label: 'Finance' });
  const selectedTagId = await page.getByLabel('Tag filter').inputValue();
  await page.getByLabel('Completion Status').selectOption('completed');
  await page.getByLabel('Due Date From').fill('2030-01-15');
  await page.getByLabel('Due Date To').fill('2030-01-15');
  await expect(page.getByRole('button', { name: '💾 Save Filter' })).toBeVisible();
  await expect(page.getByTestId('todo-item')).toHaveCount(1);
  await expect(page.getByTestId('todo-item').first()).toContainText(targetTitle);

  await page.getByRole('button', { name: '💾 Save Filter' }).click();
  const saveDialog = page.getByRole('dialog', { name: 'Save Filter' });
  await saveDialog.getByLabel('Preset name').fill('All five filters');
  await saveDialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'All five filters', exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('todo-item')).toHaveCount(5);
  await page.getByRole('button', { name: '▶ Advanced' }).click();
  await page.getByRole('button', { name: 'All five filters', exact: true }).click();
  await expect(page.getByLabel('Search todos and subtasks')).toHaveValue('BUDGET CLOSEOUT');
  await expect(page.getByLabel('Priority filter')).toHaveValue('high');
  await expect(page.getByLabel('Tag filter')).toHaveValue(selectedTagId);
  await expect(page.getByLabel('Completion Status')).toHaveValue('completed');
  await expect(page.getByLabel('Due Date From')).toHaveValue('2030-01-15');
  await expect(page.getByLabel('Due Date To')).toHaveValue('2030-01-15');
  await expect(page.getByTestId('todo-item')).toHaveCount(1);
  await expect(page.getByTestId('todo-item').first()).toContainText(targetTitle);

  await page.getByLabel('Search todos and subtasks').fill('no matching title');
  await expect(page.getByText('No todos match your filters.')).toBeVisible();
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(page.getByTestId('todo-item')).toHaveCount(1);
  await page.getByRole('button', { name: 'Clear All', exact: true }).click();
  await expect(page.getByTestId('todo-item')).toHaveCount(5);
  await expect(page.getByLabel('Completion Status')).toHaveValue('all');
  await expect(page.getByLabel('Due Date From')).toHaveValue('');
  await expect(page.getByLabel('Due Date To')).toHaveValue('');

  page.on('dialog', (confirmation) => confirmation.accept());
  await page.getByRole('button', { name: 'Delete preset All five filters' }).click();
  await expect(page.getByRole('button', { name: 'All five filters', exact: true })).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: '▶ Advanced' }).click();
  await expect(page.getByRole('button', { name: 'All five filters', exact: true })).toHaveCount(0);
});
