# Handoff: PRPs 09–11

**Prepared:** 2026-11-13
**Project:** `C:\Users\issuser.ISS8361007546A\Downloads\j_learning\TodoApp`
**Reviewed checkout:** branch `main`, baseline commit `69f397c`, shared worktree with uncommitted changes

## Starting point

PRPs 01–08 are implemented in the current worktree, but the 05–08 work is not fully signed off. PRPs 09 and 10 remain specifications, not implemented features. Authentication code for PRP 11 exists, but its acceptance criteria have not been independently established.

The shared worktree contains uncommitted source, tests, and documentation changes for PRPs 05–08. Do not reset, clean, stage, or overwrite another owner's work. Inspect `git status` and the relevant files immediately before editing. No commit was created as part of the 05–08 work described below.

### Reported validation for PRPs 05–08

These are teammate-reported results, not checks rerun for this handoff:

- Jo reported 44 unit/API tests passing.
- Roy reported 3/3 added integration regressions passing.
- JY reported the two targeted PRP 05–08 Playwright specs passing 7/7. The earlier full E2E run was 6/7; its remaining failure was a recurring-todo checkbox locator in `tests/e2e/todos.spec.ts`. A full-suite rerun after the new specs is not confirmed.
- YY reported `tests/unit/prp-05-08-boundaries.test.ts` passing 13/13 and targeted ESLint passing.
- Mich reported typecheck, lint, and production build passing. The build emitted a Next.js warning that `middleware.ts` is deprecated in favor of `proxy.ts`.
- `git diff --check` passed during the documentation update.

The existing `PRPs/AI-HANDOFF-05-11.md` still says YY's boundary tests are pending; that status is stale relative to YY's later report above. Reconcile it before treating it as the single source of status.

### Open 05–08 sign-off items

The current source still contains these review concerns; resolve or explicitly accept them before calling 05–08 fully accepted:

1. `app/page.tsx`, `handleToggleSubtask` around lines 586–620: each optimistic toggle applies its response or rollback without checking whether a newer toggle has already been issued. A delayed earlier response can overwrite the latest checkbox/progress state. Add a request sequence/guard or serialize updates, then test out-of-order success and failure.
2. `app/page.tsx:212` and `app/globals.css:96`: custom tag backgrounds always use white text. Light colors such as `#FFFF00` do not meet WCAG AA contrast with white text. Choose a contrast-aware foreground or constrain accepted colors, with a contrast test.
3. Template creation/use accepts unbounded text and subtask counts (`app/api/templates/route.ts`, around line 76; `app/api/templates/[id]/use/route.ts`, around line 37) and does synchronous insert work per subtask. PRP 05 specifies unlimited subtasks, so any cap requires a product decision. The owner should define a request-size and resource policy or record explicit acceptance of the availability risk.

These are not a blanket claim that all 05–08 criteria fail. Recheck the latest source and record disposition and validation for each.

## Work plan

Implement and validate one PRP at a time, keeping source, tests, and docs ownership coordinated:

1. **PRP 09 — Export/Import:** implement authenticated JSON and CSV export, plus transactional JSON import. Preserve nested subtasks and tag associations, remap IDs, reuse same-user tags case-insensitively, and never merge imported todos into existing todos. CSV is export-only.
2. **PRP 10 — Calendar:** add the protected monthly calendar and holiday data/API. Use Singapore-local dates, a fixed 42-cell grid, unfiltered due-dated todos, and `?month=YYYY-MM` navigation.
3. **PRP 11 — Authentication acceptance:** audit the existing WebAuthn/session foundation against the full PRP and add missing tests/fixes. Do not assume it is accepted just because session-protected APIs already exist.

Read each complete specification before implementation:

- `PRPs/09-export-import.md`
- `PRPs/10-calendar-view.md`
- `PRPs/11-authentication-webauthn.md`

Also read `CLAUDE.md`, `.github/copilot-instructions.md`, and the applicable `.claude/rules/` files. Use `PRPs/README.md` for feature dependencies and `USER_GUIDE.md` for existing user-facing claims.

## Current code evidence and integration notes

- **PRP 09:** no export/import routes were present at handoff inspection. Existing todo, subtask, and tag tables/APIs are in `lib/db.ts`, `app/api/todos/`, `app/api/todos/[id]/subtasks/`, and `app/api/todos/[id]/tags/`. Keep exports scoped to `session.userId`; make the import transaction all-or-nothing. The PRP requires RFC 4180 CSV escaping. Also decide and test spreadsheet-formula injection handling: CSV quoting alone does not neutralize formulas.
- **PRP 10:** no `app/calendar/page.tsx`, holidays route, or calendar implementation was present at inspection. `lib/timezone.ts` is the canonical Singapore date/time layer. The current `middleware.ts` matcher is only `['/']`; update route protection when adding `/calendar`, or move to the project’s supported Next.js 16 proxy convention without weakening protection.
- **PRP 11:** `lib/auth.ts`, `middleware.ts`, and `app/api/auth/{register-options,register-verify,login-options,login-verify,logout}/route.ts` exist. The middleware currently matches only `/`, not `/calendar`. No dedicated auth, calendar, export, or import tests were found in `tests/` at inspection. Verify registration/login, duplicate usernames, multiple authenticators, counters, tampered/expired sessions, logout, protected routes, and session persistence. `lib/auth.ts` requires `SESSION_SECRET` of at least 32 characters; use the configured local environment and never copy secret values into the handoff or logs.

## Safety and implementation guardrails

- Preserve the shared SQLite database and existing work. Never use a real `todos.db` for test cleanup or reset.
- Use the isolated database setup in `tests/e2e/db-path.ts` for browser tests; coordinate E2E runs because the configured suite shares a SQLite test database and uses one worker.
- Keep every API endpoint authenticated and scope data reads/writes by `session.userId`. Return 404 for objects not owned by the session user.
- Use prepared SQL statements and transactions for import/multi-row writes. Validate request types, enum values, sizes, and ownership before mutating.
- Use existing Singapore timezone helpers; do not rely on the machine's local timezone.
- Add focused tests first, then run targeted tests and the project validation scripts: `npm.cmd test`, `npm.cmd run test:e2e`, `npm.cmd run typecheck`, `npm.cmd run lint`, and `npm.cmd run build`. Avoid duplicate build/E2E runs while another owner uses the same server or `.next` directory.
- Keep implementation, test, documentation, and validation status distinct in reports. Do not treat PRP checklist text or owner-reported results as independent verification.

## Open decisions to carry forward

- PRP 09 import size/field limits, large-file UX, and CSV formula-injection policy.
- PRP 11 account recovery for a user who loses every passkey; the PRP explicitly leaves recovery out of scope.
- Authentication hardening noted in `PRPs/AI-HANDOFF-05-11.md`: CSRF policy, endpoint rate limiting, username-enumeration behavior, challenge lifecycle/binding, and JWT secret rotation.
- Reminder delivery/deduplication and the trusted writer for `last_notification_sent` remain existing cross-feature questions; avoid changing them incidentally during PRPs 09–11.
