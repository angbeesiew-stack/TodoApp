# Product Requirement Prompts (PRPs) - Index

This directory contains detailed Product Requirement Prompts split by feature for the Todo App. Each PRP provides comprehensive guidance for implementing a specific feature using AI coding assistants.

## Implementation Handoff

Implementations for PRPs 01–08 are present in the current working tree; this does not mean every acceptance criterion is verified. For owner-reported test results, open review items, shared-worktree cautions, and guidance for PRPs 09–11, read [AI-HANDOFF-05-11.md](AI-HANDOFF-05-11.md). Re-run checks before relying on prior results.

## 📋 PRP Files

### Core Features

1. **[01-todo-crud-operations.md](01-todo-crud-operations.md)** - Todo CRUD Operations
   - Create, read, update, delete todos
   - Singapore timezone handling
   - Validation rules and error handling
   - Optimistic UI updates

2. **[02-priority-system.md](02-priority-system.md)** - Priority System
   - Three-level priority (High/Medium/Low)
   - Color-coded badges
   - Automatic sorting
   - Priority filtering

3. **[03-recurring-todos.md](03-recurring-todos.md)** - Recurring Todos
   - Daily, weekly, monthly, yearly patterns
   - Automatic next instance creation
   - Due date calculation logic
   - Metadata inheritance

### Advanced Features

4. **[04-reminders-notifications.md](04-reminders-notifications.md)** - Reminders & Notifications
   - Browser notification system
   - Configurable timing (15m to 1 week before)
   - Polling mechanism and duplicate prevention
   - Singapore timezone calculations

5. **[05-subtasks-progress.md](05-subtasks-progress.md)** - Subtasks & Progress Tracking
   - Checklist functionality
   - Visual progress bars
   - Position management
   - Cascade delete behavior

6. **[06-tag-system.md](06-tag-system.md)** - Tag System
   - Color-coded labels
   - Many-to-many relationships
   - Tag management (CRUD)
   - Filtering by tag

7. **[07-template-system.md](07-template-system.md)** - Template System
   - Save and reuse todo patterns
   - Subtasks JSON serialization
   - Due date offset calculation
   - Template categories

### Productivity Features

8. **[08-search-filtering.md](08-search-filtering.md)** - Search & Filtering
   - 300 ms debounced text search
   - Search across todo and subtask titles
   - Multi-criteria filtering
   - Client-side performance

9. **[09-export-import.md](09-export-import.md)** - Export & Import
    - JSON-based backup/restore
    - ID remapping on import
    - Relationship preservation
    - Data validation

10. **[10-calendar-view.md](10-calendar-view.md)** - Calendar View
    - Monthly calendar display
    - Singapore public holidays
    - Todo visualization by due date
    - Month navigation

### Infrastructure

11. **[11-authentication-webauthn.md](11-authentication-webauthn.md)** - WebAuthn/Passkeys Authentication
    - Passwordless authentication flow
    - Registration and login with biometrics
    - Session management with JWT
    - Route protection middleware

## 🎯 How to Use These PRPs

### For AI Coding Assistants (GitHub Copilot, etc.)

1. **Feature Implementation**: Copy the entire PRP into your chat to implement a feature from scratch
2. **Bug Fixes**: Reference specific sections when debugging issues
3. **Code Review**: Use acceptance criteria to validate implementations
4. **Testing**: Use test case sections to generate E2E and unit tests

### For Developers

1. **Architecture Understanding**: Read PRPs to understand design decisions
2. **API Contracts**: Reference for endpoint specifications
3. **Edge Cases**: Comprehensive coverage of edge cases and error handling
4. **Best Practices**: Each PRP includes project-specific patterns

## 📚 PRP Structure

Each PRP follows this consistent structure:

- **Feature Overview** - High-level description
- **User Stories** - User personas and their needs
- **User Flow** - Step-by-step interaction patterns
- **Technical Requirements** - Database schema, API endpoints, types
- **UI Components** - React component examples
- **Edge Cases** - Unusual scenarios and handling
- **Acceptance Criteria** - Testable requirements
- **Testing Requirements** - E2E and unit test specifications
- **Out of Scope** - Explicitly excluded features
- **Success Metrics** - Measurable outcomes

## 🔗 Related Documentation

- **[.github/copilot-instructions.md](../.github/copilot-instructions.md)** - AI agent instructions for the entire codebase
- **[USER_GUIDE.md](../USER_GUIDE.md)** - Comprehensive 2000+ line user documentation
- **[README.md](../README.md)** - Setup and installation guide

## 🚀 Development Workflow

### Implementing a New Feature

1. Read the corresponding PRP file thoroughly
2. Reference `.github/copilot-instructions.md` for project patterns
3. Check `USER_GUIDE.md` for user-facing behavior
4. Implement following the technical requirements
5. Validate against acceptance criteria
6. Write tests based on testing requirements section

### Using with GitHub Copilot Chat

```plaintext
"I want to implement [feature name]. 
Here's the PRP: [paste PRP content]
Please help me implement this following the project patterns."
```

### Feature Dependencies

Some features depend on others being implemented first:

```
Todo CRUD (01) → Priority (02), Recurring (03), Subtasks (05), Tags (06)
Tags (06) → Search/Filtering (08)
Subtasks (05) → Templates (07)
Todos (01) → Export/Import (09), Calendar (10)
Authentication/session (11) → Protected APIs (session must exist before secured feature routes ship)
```

## 📊 Suggested Implementation Order

Recommended order based on dependencies and the current baseline:

1. **Implemented in the current tree** — 01: Todo CRUD, 02: Priority, 03: Recurrence, 04: Reminders, 05: Subtasks, 06: Tags, 07: Templates, 08: Search & Filtering. Check the handoff for reported validation and open items before treating the baseline as fully accepted.

2. **Remaining productivity feature** — 09: Export & Import (after 05 and 06).

3. **Calendar and auth acceptance** — 10: Calendar (after 01–02 and session availability); verify PRP 11 authentication acceptance flows. The auth/session foundation exists, but do not assume the PRP's full test criteria have passed.

See [AI-HANDOFF-05-11.md](AI-HANDOFF-05-11.md) for feature-level cautions and documentation conflicts.

## 🛠️ Technical Stack Reference

All PRPs assume:
- **Framework**: Next.js 16 (App Router)
- **Database**: SQLite via better-sqlite3
- **Auth**: WebAuthn via @simplewebauthn
- **Timezone**: Singapore (Asia/Singapore) throughout
- **Testing**: Playwright for E2E tests
- **Styling**: Tailwind CSS 4

## 💡 Tips for AI Assistants

1. **Always reference `.github/copilot-instructions.md`** first for project-wide patterns
2. **Use Singapore timezone functions** from `lib/timezone.ts` for all date/time operations
3. **Follow API route patterns** with async params in Next.js 16
4. **Database operations are synchronous** (better-sqlite3, no async/await)
5. **Client components** in `app/page.tsx` handle UI, API routes handle DB

## 📝 Contributing

When adding new PRPs:
1. Follow the established structure
2. Include all required sections
3. Provide specific code examples
4. Document edge cases thoroughly
5. Update this index file

---

**Last Updated**: November 13, 2026
**Total PRPs**: 11
**Total Features Documented**: 10 core application features + 1 infrastructure feature
