# Technical sign-off and handover: PRPs 05-08 to 09-11

**Assessor:** YY - TDD specialist
**Assessment date:** 2026-11-13, Asia/Singapore
**Checkout:** `main`, HEAD `69f397c`; implementation and tests remain uncommitted.

## Verdict

**Technical assessment completed; unconditional sign-off withheld.**

PRPs 05-08 implementation is present and all existing automated suites pass
on the assessed working tree. Passing suites do not establish every acceptance
criterion: the subtask response-ordering defect remains, and exact debounce
timing/cancellation lacks focused test evidence. No remaining risk has been
accepted on the user's behalf.

This is the latest independently executed validation evidence. Read alongside
[AI-HANDOFF-09-11.md](AI-HANDOFF-09-11.md), which describes the next team's
implementation scope. Its earlier full-browser-suite uncertainty is superseded
by the passing full run below. Older statements that YY's boundary tests or
the 1,000-todo performance check are pending are also superseded.

## Independently executed checks

| Check | Result | Scope |
|---|---|---|
| Vitest with expanded coverage | 60/60 tests; 11/11 files passed | All configured unit/API/integration tests, in-memory SQLite |
| Full Playwright suite | 11/11 passed | Seven PRP 05-08 journeys and four existing todo journeys |
| ESLint | Passed | Whole project |
| TypeScript | Passed | `tsc --noEmit` |
| Production build | Passed | Next.js; no simultaneous E2E/dev server |
| 1,000-todo filter target | Passed, under 100ms | Boundary test checks both timing and exact result IDs |

The recurring-todo browser test passed in this full run. It was not edited
for this assessment. Browser tests inject a session cookie; they do **not**
verify real WebAuthn registration/login or PRP 11 acceptance.

Coverage across eight explicitly included pure modules was:
**96.44% lines, 94.97% statements, 87.37% branches, 97.95% functions**.
The configured aggregate 80% thresholds passed. This is not whole-application
coverage: UI components, route handlers, `lib/db.ts`, auth, and hooks are
outside that measurement. Individual preset branches measured 79.41%;
aggregate success does not imply every file exceeds 80%.

Commands executed from the project root:

```powershell
npm.cmd run test:coverage -- --coverage.include=lib/todos.ts --coverage.include=lib/recurrence.ts --coverage.include=lib/reminders.ts --coverage.include=lib/timezone.ts --coverage.include=lib/subtasks.ts --coverage.include=lib/filters.ts --coverage.include=lib/filter-presets.ts --coverage.include=lib/templates.ts --reporter=dot
npm.cmd run test:e2e
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
```

The ordinary coverage script only includes four core modules; use the expanded
command above when checking PRPs 05-08 helpers. Warnings remain about the
deprecated Next.js middleware convention and future Vite config loading.

## Required closure before unconditional sign-off

| Item | Current evidence | Required disposition |
|---|---|---|
| Stale subtask responses/rollback | Source inspection: `app/page.tsx`, `handleToggleSubtask`, applies every response and rollback; checkbox permits another toggle while pending | Fix ordering/serialization and add tests for delayed older success and failure; verify persisted and displayed final state |
| Exact search debounce | `lib/hooks/useDebounce.ts` uses timeout/cleanup; existing browser journeys test eventual results, not exact 300ms/cancellation | Add focused timing, cancellation, and immediate-clear evidence |
| Light custom tag contrast | `TagPill` and selected pills use arbitrary backgrounds with fixed white text | Resolve accessibility behavior or explicitly record accepted risk; PRP 06 itself specifies white text, so do not silently alter its contract |
| Template resource use | Creation maps unrestricted text/subtask input; use performs synchronous per-subtask inserts in a transaction | Define request/resource policy or obtain explicit risk acceptance; PRP 05 permits unlimited subtasks |

The response race is supported by source inspection, not a new delayed-network
runtime reproduction. Resource exhaustion was not stress-tested. No source
fixes or new acceptance tests were made during this assessment.

## Next-team scope and integration contracts

| PRP | Starting point | Required implementation/verification |
|---|---|---|
| [09: Export/import](09-export-import.md) | No export/import routes in assessed tree | Version-1 nested JSON including subtasks/tags; new IDs; same-user case-insensitive tag reuse; transactional additive import; RFC 4180 CSV export only |
| [10: Calendar](10-calendar-view.md) | No calendar route in build output | Protected route; Singapore-local dates; fixed 42-cell grid; month URL/navigation; holidays; due-dated todos independent of list filters |
| [11: WebAuthn](11-authentication-webauthn.md) | Session/passkey foundation already exists | Verify full registration/login/logout, multiple authenticators, counters, expiry/tampering and route protection; do not rebuild or declare accepted from injected-cookie tests |

Read the complete PRPs and local instructions before implementation. In PRP 09,
do not follow the older user-guide claim that tags/subtasks are excluded.
In PRP 10, do not inherit list filters. Ensure `/calendar` is actually protected
when it is added; existing protection of `/` alone is insufficient.

Preserve independent parent/subtask completion, stable subtask position gaps,
cascade deletion, user-owned tags and idempotent links. Templates are independent
snapshots: recreate unchecked subtasks, exclude tags and concrete due dates,
and resolve optional relative offsets in Singapore time.

## Safe takeover and artifacts

- Inspect the dirty worktree immediately before editing. Coordinate ownership
  of `app/page.tsx`, `lib/db.ts`, configuration, dependencies and test runners.
  Existing files belong to other tasks; this companion avoids editing TK's docs.
- Use prepared statements, user-scoped queries, transactions and awaited
  Next.js route params. Keep the intentional monolithic main-page pattern.
- Test-first: add a failing regression, implement the smallest fix, then rerun
  targeted and combined checks. Do not start PRPs 09-11 as part of sign-off.
- Unit/API tests use `TODO_DB_PATH=:memory:`. E2E resets the dedicated
  `todo-app-playwright.sqlite` under the OS temporary directory, never the real
  application database. Coordinate runs because that fixture path is shared.
- This assessment created/refreshed ignored `coverage/`, `test-results/`,
  `.next/`, and TypeScript build information, plus the dedicated E2E fixture.
  No application-data reset, commit, push, dependency installation or
  production-code edit was performed. No matching project test/server processes
  remained at the post-validation check.
- This Markdown file is the assessor's persistent handover; an identical copy
  may be attached from the agent workspace for chat access.

Final product acceptance and acceptance of remaining risks belong to the user.
