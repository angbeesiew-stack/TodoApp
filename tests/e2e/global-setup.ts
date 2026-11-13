import { e2eDatabasePath } from './db-path';

export default async function globalSetup(): Promise<void> {
  process.env.TODO_DB_PATH = e2eDatabasePath;
  const { db } = await import('@/lib/db');
  db.exec('DELETE FROM todos; DELETE FROM users;');
  db.prepare('INSERT INTO users (id, username) VALUES (?, ?)').run(1, 'playwright-user');
  db.close();
}
