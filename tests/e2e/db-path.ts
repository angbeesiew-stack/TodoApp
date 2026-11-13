import os from 'node:os';
import path from 'node:path';

export const e2eDatabasePath = path.join(os.tmpdir(), 'todo-app-playwright.sqlite');
