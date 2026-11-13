# AI Handoff: Work After PRPs 01–04

**Status checked:** 2026-11-13  
**Purpose:** Give the next implementation team a reliable starting point after Todo CRUD, priority, recurrence, and reminders.

## Current baseline

PRPs 01–04 have been implemented in the shared working tree. On 2026-11-13, the current tree passed 32 unit/API tests, all 4 Playwright flows, typecheck, lint, coverage, and the production build. Coverage was 95.2% statements, 85.96% branches, 96.15% functions, and 95.37% lines. Re-run the checks after changes; Next.js currently warns that `middleware.ts` is deprecated in favor of `proxy.ts`.

The app is a Next.js 16 App Router project using React 19, Tailwind CSS 4, synchronous `better-sqlite3`, WebAuthn sessions, and Singapore-time date handling. Useful current files:

- `app/page.tsx` — main todo UI and feature state
- `app/api/todos/` — authenticated todo list and item endpoints
- `app/api/notifications/check/` — reminder polling endpoint
- `app/api/auth/` and `lib/auth.ts` — passkey/session foundation
- `lib/db.ts` — SQLite schema and shared data access
- `lib/todos.ts`, `lib/recurrence.ts`, `lib/reminders.ts`, `lib/timezone.ts`, `lib/validation.ts` — core logic
- `tests/unit/`, `tests/integration/`, `tests/e2e/` — existing coverage

The database already creates `subtasks`, `tags`, and `todo_tags` tables, and todo types include optional subtask/tag relations. This is scaffolding, not proof that PRPs 05–06 are complete: there are no subtask API routes or tag-management routes in the current route tree. The existing `subtasks` and `tags` schemas omit `created_at` fields present in PRP 05/06; reconcile that difference with a migration rather than creating duplicate tables. `tagDB` currently provides todo-association helpers used by recurrence, not full tag CRUD.

## Safe takeover procedure

1. Read `CLAUDE.md`, `.github/copilot-instructions.md`, this file, the relevant PRP, and the matching `.claude/rules/` guidance.
2. Inspect `git status` and the current source before editing. The worktree is shared and has staged, unstaged, and untracked application/test changes; do not reset, clean, unstage, or overwrite work owned by another task.
3. Implement one PRP at a time with tests first. Keep each API route authenticated and scope every query/mutation to `session.userId`; return 404 for objects not owned by that user.
4. Run targeted tests, then the full checks below. Update the implementation status and user-facing docs only for behavior that is actually implemented and verified.

Use the configured environment in `.env.example`; `SESSION_SECRET` must be set in `.env.local`. Never use or overwrite a real `todos.db` while resetting test data. E2E setup has a separate DB-path helper.

## Remaining work and dependencies

| PRP | Scope | Depends on / handoff notes |
|---|---|---|
| 05 | Subtask CRUD, ordering, independent completion, progress display | PRP 01. Use the existing `subtasks` table; verify parent ownership on every subtask mutation and preserve cascade deletion. |
| 06 | User-owned tag CRUD, todo assignment, color pills | PRP 01. Reuse existing `tags`/`todo_tags` schema and data-access methods where they match the PRP; add the missing management/assignment API and UI. |
| 07 | Reusable todo templates | PRPs 01–05, with priority/recurrence/reminder fields from 02–04. PRP 07 is authoritative: templates serialize and recreate subtasks, but exclude tags and concrete due dates. Reject recurring templates without a due-date offset so using a template cannot create an invalid recurring todo. |
| 08 | Text search, combined filters, saved local presets | PRPs 01, 05, 06. Search titles and subtask titles; all filter dimensions combine with AND. Presets are browser-local, not synced. |
| 09 | JSON backup/restore and one-way CSV export | PRPs 01, 05, 06. JSON includes subtasks, tags, and associations; import generates new IDs, reuses same-user tags case-insensitively, and is transactional. CSV is not importable. |
| 10 | Monthly calendar and Singapore holidays | PRPs 01–02 plus a valid session. Calendar is unfiltered regardless of list filters; use Singapore-local dates and a fixed 42-cell grid. |
| 11 | Passkey authentication acceptance verification / remaining auth gaps | Auth/session code already exists and protects current APIs, but registration/login E2E was not confirmed in the latest review. Verify PRP 11 flows before treating auth as fully accepted. |

PRPs 05 and 06 are independently specified but share `lib/db.ts` and `app/page.tsx`; implement sequentially or agree on file/API ownership before parallel work. PRPs 07–09 also touch the main page and shared database layer, so integrate one feature at a time and keep API/data contracts consistent.

## Project conventions and validation

- Use `getSingaporeNow()` and the helpers in `lib/timezone.ts` for date/time logic; do not base app behavior on the machine's local timezone.
- The update route allows preserving or setting a past due date; a regression test covers this. The future-date restriction applies to creation, not ordinary edits.
- Database access is synchronous. Use prepared statements and keep DB code server-side; client components call API routes.
- Check the session before protected API work. Apply user scoping in the query itself where possible, not only in the UI.
- SQLite foreign keys are enabled in `lib/db.ts`; preserve `ON DELETE CASCADE` behavior.
- Next.js 16 dynamic route `params` are promises; await them.
- Follow `CLAUDE.md`'s intentional main-page convention: `app/page.tsx` is monolithic by design. Do not split it solely to reduce file size.
- The project-wide test guidance requires unit, API/integration, and Playwright coverage, including validation, ownership, and boundary/error cases.

Available package scripts:

```powershell
npm test
npm run test:coverage
npm run test:e2e
npm run typecheck
npm run lint
npm run build
```

Browser/OS notification delivery is not fully covered by Playwright and still needs the PRP 04 manual check.

## Open decisions and production hardening

- Resolve the CSRF policy: sessions use `SameSite=Lax`, while general security guidance also calls for CSRF protection. Define auth rate limits, username-enumeration behavior, challenge lifecycle/binding, and JWT secret rotation.
- Reminder delivery is best-effort across tabs, and `last_notification_sent` is currently writable through the todo update API. Confirm the trusted writer and deduplication policy before production.
- Define import size/field limits and CSV formula-injection handling as PRP 09 is implemented.
- Passkey recovery and multi-authenticator behavior need explicit product decisions and PRP 11 acceptance tests; do not claim the full auth PRP is complete based only on the current session foundation.

## Documentation decisions for implementers

Several existing user-facing descriptions conflict with the detailed feature contracts. Follow the PRPs for implementation and update `USER_GUIDE.md` when the related feature is verified:

- PRP 07 includes subtasks in templates; `USER_GUIDE.md` §9 currently says subtasks are added afterward.
- PRP 09 includes subtasks and tag associations in JSON export/import; `USER_GUIDE.md` §11 currently says they are excluded.
- PRP 10 explicitly keeps calendar results independent of list filters; `USER_GUIDE.md` §12 currently says calendar respects active filters.
- The PRP index previously suggested authentication can be last. The session primitive must exist before protected feature APIs can work; here the auth foundation is already present, but its acceptance tests still need confirmation.

Do not mark features implemented from checklist text alone. Record what was actually built and tested, and keep README/User Guide claims consistent with the code.
