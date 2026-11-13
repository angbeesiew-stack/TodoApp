# AI Handoff: Work After PRPs 01–08

**Status checked:** 2026-11-13  
**Purpose:** Give the next implementation team a reliable starting point after the first eight PRPs.

## Current baseline

Implementations for PRPs 01–08 are present in the shared working tree. The following are owner-reported results from 2026-11-13, not checks rerun during this documentation update:

- Jo reported 44 unit/API tests passing, the initial PRP 05–08 browser flows passing, and typecheck, lint, and production build passing. Mich later independently confirmed typecheck, lint, and build passed; Next.js emitted a `middleware.ts` deprecation warning.
- Roy's added integration regressions passed 3/3.
- JY's expanded PRP 05–08 Playwright specs passed 7/7; the new spec also passed lint.
- YY later reported independently passing 60/60 unit/API tests, 11/11 full E2E tests, lint, typecheck, and production build. The earlier recurring-todo checkbox failure did not recur. E2E workers are limited to one because the suite shares a SQLite test database.
- YY's added unit-boundary suite passed 13/13, and its targeted ESLint run passed. It covers progress endpoints, strict AND filtering, absent relations and dates, preset storage failures, 1,000-item filter performance, and template offset/serialization boundaries. A debounce-hook timing test was omitted because the project has no established React hook test harness.

These results do not establish that every PRP acceptance criterion has passed. Re-run the relevant checks against the current tree before relying on this snapshot.

The app is a Next.js 16 App Router project using React 19, Tailwind CSS 4, synchronous `better-sqlite3`, WebAuthn sessions, and Singapore-time date handling. Useful current files:

- `app/page.tsx` — main todo UI and feature state
- `app/api/todos/` — authenticated todo list and item endpoints
- `app/api/notifications/check/` — reminder polling endpoint
- `app/api/auth/` and `lib/auth.ts` — passkey/session foundation
- `lib/db.ts` — SQLite schema and shared data access
- `lib/todos.ts`, `lib/recurrence.ts`, `lib/reminders.ts`, `lib/timezone.ts`, `lib/validation.ts` — core logic
- `lib/subtasks.ts`, `lib/templates.ts`, `lib/filters.ts`, `lib/filter-presets.ts` — PRPs 05–08 behavior
- `tests/unit/`, `tests/integration/`, `tests/e2e/` — existing coverage

PRPs 05–08 include scoped subtask/tag/template API routes, database access and migrations, UI flows, search/filter logic, and browser-local filter presets. Templates recreate subtasks but intentionally do not copy tags or concrete due dates. The user guide now follows this template behavior.

## Technical sign-off status: not signed off

I inspected the current shared-tree code for the review items below. These concerns remain visible in the current source, so PRPs 05–08 are implemented but not ready for technical sign-off:

- `app/page.tsx`, `handleToggleSubtask`: an older request response or rollback can still overwrite a newer toggle. Add ordering protection or serialize toggles and test out-of-order success/failure.
- `app/page.tsx` and `app/globals.css`: custom tag colors still render with fixed white text. Some valid light colors fail WCAG contrast; calculate a contrasting foreground or constrain the selectable colors, and test it.
- `app/api/templates/route.ts` and `app/api/templates/[id]/use/route.ts`: template text and subtask counts have no explicit upper bounds, and use performs a synchronous insert per serialized subtask. Define a request/resource policy or document an explicit product decision accepting this risk. PRP 05 currently states unlimited subtasks.
- YY measured the PRP 08 1,000-todo filter target under 100ms in the added boundary suite. The 300ms debounce behavior still lacks a dedicated hook-timing test; YY omitted it because no established hook-test harness exists.

YY also reported that full E2E validation now passes 11/11; the suite status is no longer pending. No code changes or fixes are claimed here. The implementation owner should address or explicitly accept the three remaining risks before technical sign-off. YY owns the final independent sign-off after that disposition is recorded.

## Safe takeover procedure

1. Read `CLAUDE.md`, `.github/copilot-instructions.md`, this file, the relevant PRP, and the matching `.claude/rules/` guidance.
2. Inspect `git status` and the current source before editing. The worktree is shared and has staged, unstaged, and untracked application/test changes; do not reset, clean, unstage, or overwrite work owned by another task.
3. Implement one PRP at a time with tests first. Keep each API route authenticated and scope every query/mutation to `session.userId`; return 404 for objects not owned by that user.
4. Run targeted tests, then the full checks below. Update the implementation status and user-facing docs only for behavior that is actually implemented and verified.

Use the configured environment in `.env.example`; `SESSION_SECRET` must be set in `.env.local`. Never use or overwrite a real `todos.db` while resetting test data. E2E setup has a separate DB-path helper.

## Remaining work and dependencies

| PRP | Scope | Depends on / handoff notes |
|---|---|---|
| 09 | JSON backup/restore and one-way CSV export | PRPs 01, 05, 06. JSON includes subtasks, tags, and associations; import generates new IDs, reuses same-user tags case-insensitively, and is transactional. CSV is not importable. |
| 10 | Monthly calendar and Singapore holidays | PRPs 01–02 plus a valid session. Calendar is unfiltered regardless of list filters; use Singapore-local dates and a fixed 42-cell grid. |
| 11 | Passkey authentication acceptance verification / remaining auth gaps | Auth/session code already exists and protects current APIs, but registration/login E2E was not confirmed in the latest review. Verify PRP 11 flows before treating auth as fully accepted. |

PRPs 09–10 also touch shared data and UI; integrate one feature at a time and keep API/data contracts consistent.

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

The PRP 07 template behavior is authoritative: templates save and recreate subtasks, but do not copy tags or concrete due dates. `USER_GUIDE.md` §9 now reflects this. Other known documentation conflicts outside PRPs 05–08 remain for their owners to address:

- PRP 09 includes subtasks and tag associations in JSON export/import; `USER_GUIDE.md` §11 currently says they are excluded.
- PRP 10 explicitly keeps calendar results independent of list filters; `USER_GUIDE.md` §12 currently says calendar respects active filters.
- The PRP index previously suggested authentication can be last. The session primitive must exist before protected feature APIs can work; here the auth foundation is already present, but its acceptance tests still need confirmation.

Do not mark features implemented from checklist text alone. Record what was actually built and tested, and keep README/User Guide claims consistent with the code.
