# StitchSense Expo Web-Parity Build Plan

## Approach

Build the Expo app as a full user-facing mobile client that mirrors the current
web application feature-for-feature while continuing to use the shared
`stitchsense-api`, PostgreSQL, object storage, and n8n-backed AI workflows.
The goal is not "mobile inspired by the web app"; the goal is "mobile version
of the same product," with the same saved data, same account access, same
pattern workflows, and the same practical toolset.

The existing SwiftUI build remains a reference implementation, but this plan is
for the dedicated Expo / Expo Go branch in `Mobile App/stitchsense-expo`.

## Scope

- In:
  - Full user-facing parity with the website experience
  - Shared login, library, chat, rewrite, tools, Stitch Vision, Ravelry, and account flows
  - Shared sync model with the current backend platform
  - Mobile-first UX adaptations where layout must change but functionality must remain

- Out:
  - WordPress admin pages such as model settings, library admin tables, users admin, and migration export UI
  - Replacing the web app
  - Replacing the backend API or n8n workflows unless gaps are discovered

## Source-of-Truth Product Surface

The Expo app should cover all current website user functionality represented by
the shortcode/app experience, including:

1. Auth and account access
   - StitchSense email login
   - WordPress-linked login fallback
   - subscription / trial / entitlement visibility

2. Pattern Library
   - list, search, sort, filter, open, edit, archive, delete
   - pattern metadata
   - synced pattern files
   - saved pattern summaries
   - chat count / rewrite count / recent activity

3. Pattern detail / workspace
   - summary
   - open pattern
   - open pattern chat
   - open AI rewrite
   - refresh AI summary
   - refresh from Ravelry when relevant
   - access saved history attached to that pattern

4. Pattern Helper AI
   - pattern-aware chat
   - saved chat sessions
   - saved chat messages
   - recent prompts / activity continuation
   - skill/terminology support where used in the current system

5. Rewrite
   - guided rewrite flows
   - freeform rewrite prompt
   - quick rewrite chips
   - saved rewrite sessions
   - reopening prior rewrites
   - pattern-linked rewrite history

6. Stitch Dictionary
   - searchable stitch glossary
   - category/filter support if present in current web behavior

7. Gauge Calculator
   - simple mode
   - advanced mode
   - uploaded-pattern gauge assist
   - result explanation
   - needle/hook reference
   - gauge follow-up prompt into AI

8. Tools / helper workflows
   - gauge-related helper cards
   - yarn substitution / ease / needle direction / terminology assistance
   - jump points into relevant panels or workflows

9. Stitch Vision
   - camera/photo input
   - analysis result
   - error/loading states
   - saved or resumable result path where appropriate

10. Ravelry
   - connection status
   - connect/reconnect flow
   - search
   - detail preview
   - import into library
   - saved/library imports
   - open/buy on Ravelry
   - refresh from Ravelry for imported patterns

11. Account
   - subscription status
   - free trial state
   - courtesy/lifetime access status
   - sign out
   - data export / delete entry points
   - synced-account diagnostics where helpful

12. Sync parity
   - web upload -> mobile open
   - mobile actions reflected on web
   - chat and rewrite continuity across devices
   - consistent pattern ownership and history

13. Projects workspace evolution
   - replace the temporary Workspace tab with a true Projects space
   - support multiple concurrent knitting/crochet projects per user
   - let one pattern power zero, one, or many saved projects
   - keep project progress, notes, counters, and working state synced across devices
   - evolve into the home for "what am I making right now?" without weakening Library as the source of pattern ownership

## Delivery Strategy

### Phase 1: Foundation Hardening

Use the current Expo shell as the base and harden the shared application
plumbing before layering in more screens.

Deliverables:
- stable session restoration
- authenticated API wrapper with refresh handling
- reusable design system primitives
- error/loading/empty states
- pattern cache strategy for Expo
- environment/config strategy for local/staging/live

### Phase 2: Library Parity

Make Library fully trustworthy as the home screen.

Deliverables:
- full search/filter/sort
- pattern cards with activity stats
- archive/delete/edit actions
- upload entry point
- pull-to-refresh and explicit resync
- pattern detail view with real action surface

### Phase 3: Pattern Workspace Parity

Bring the "one pattern, many actions" model over from web to mobile.

Deliverables:
- pattern detail/workspace screen
- open pattern viewer
- summary refresh
- recent chats for a pattern
- recent rewrites for a pattern
- Ravelry-aware controls when applicable

### Phase 3A: Projects Workspace Replacement

Replace the temporary Workspace tab with a dedicated Projects system designed
for real making-in-progress workflows. This should be treated as a product
surface, not just another list screen.

This phase should be sequenced carefully:

1. First stabilise shared library, pattern detail, chat, rewrite, upload, and
   Ravelry sync so projects can safely build on live shared data.
2. Then introduce project records in the shared platform API and Expo UI.
3. Only after the mobile project model feels solid should the same project
   surface be added to the web app for true two-way parity.

#### Product Positioning

Library answers: "What patterns do I own or use?"

Projects answers: "What am I actively making, pausing, planning, gifting, or
 finishing right now?"

Those are related, but they are not the same thing. A user can have:

- patterns in the library that are not active projects yet
- multiple projects linked to the same pattern
- a project created from a manually uploaded pattern, imported Ravelry pattern,
  or later a non-pattern-based freeform make

#### Recommended Rollout

##### Stage 1: Project Core

Deliver a reliable first version that is clearly useful without trying to ship
 a full Notion/Trello/Ravelry hybrid in one pass.

Project entity:
- project id
- user id
- linked pattern id (nullable in future, required for first release)
- project name
- craft type
- status: planned / active / paused / completed / archived
- stage label: swatching / casting on / body / sleeves / finishing / blocking / custom
- progress value and progress mode
- cover image
- favourite flag
- recipient / gift flag
- deadline / target completion
- notes
- last worked at
- created at / updated at

Stage 1 mobile UX:
- replace Workspace tab with Projects dashboard
- list all projects with search, sort, and status filters
- create project from a pattern
- quick-create project from Library and Pattern Detail
- open project detail
- update status, stage, notes, and progress
- pin favourite projects
- surface "last worked on" and "days idle"

Stage 1 project card content:
- cover image or pattern thumbnail
- project name
- linked pattern name
- craft type
- progress indicator
- current stage
- status pill
- last updated / days since worked

##### Stage 2: Working Session Tools

Turn project detail into the real working surface for an in-progress make.

Deliverables:
- project overview
- linked pattern summary
- open pattern PDF in-app
- quick jump into pattern chat
- quick jump into AI rewrite
- saved project notes
- "today's focus" or next-step note
- simple row / round counter
- progress history entries

This is the point where a user should reasonably prefer opening a project
instead of hunting through the library each time they resume work.

##### Stage 3: Rich Maker Tracking

Once the core project flow feels stable, add the deeper project-management
 value.

Deliverables:
- multiple counters per project/section
- project milestones
- yarn stash lines attached to project
- needle/hook tracking
- gauge snapshot for the active project
- project photo timeline
- gift / occasion / recipient details
- deadline-aware sorting and reminders

##### Stage 4: Advanced Pattern-Interaction Layer

Only build this once the rest of the project model is already trusted.

Possible deliverables:
- saved reading position in pattern
- bookmarked pages/sections
- project-linked annotations
- highlighted instructions
- crossed-off checklist items
- section repeat tracking

These are high-value features, but they are also the easiest place to create
fragile state and sync bugs. They should be treated as later, deliberate work.

#### Data Model Guidance

Projects should live in the shared platform API, not only in Expo local state
and not only in WordPress. The same project record must eventually be usable on
mobile and web.

Recommended shared data boundaries:

- `patterns` remain the source of pattern ownership and file metadata
- `projects` become the source of active making state
- `project_notes`, `project_progress_events`, and `project_counters` should be
  separate child tables rather than overloading one large JSON blob

Suggested first backend shape:

- `projects`
- `project_progress_events`
- `project_counters`
- optional later:
  - `project_yarns`
  - `project_photos`
  - `project_annotations`

#### Mobile Information Architecture

Recommended tab evolution:

- `Library`: pattern ownership and imports
- `Workspace` -> rename to `Projects`: active making dashboard
- `Camera`: Stitch Vision
- `Tools`: calculators, dictionary, helper tools
- `Account`: auth, billing, sync, Ravelry

Recommended project flows:

1. Library card -> `Create project`
2. Pattern detail -> `Start project`
3. Projects tab -> project dashboard list
4. Project detail -> continue work, notes, counters, pattern actions

#### UX Rules

1. Projects must feel lightweight to create.
   - Do not force a huge form up front.
   - Start with a quick-create sheet, then let users enrich later.

2. The dashboard must reward return usage.
   - Show recency, stage, and momentum, not just metadata.

3. Projects must not duplicate the whole library.
   - The project screen should answer "what am I doing now?" faster than the library can.

4. Progress input must be flexible.
   - Some users think in percentage, others in rows, rounds, or sections.

5. A project should be useful even if the user ignores advanced fields.
   - Name, status, note, and progress should already make it worthwhile.

#### Web Follow-On

The same Projects system should later be added into the web app once the mobile
implementation and shared API model are stable. The web version should not be a
separate invention; it should be the same product surface with a roomier layout.

Recommended rollout for the web build:

1. Add Projects as a first-class destination beside Library, not buried inside
   pattern detail.
2. Reuse the shared `projects`, `project_counters`, and
   `project_progress_events` data model already proven by Expo.
3. Start with parity-safe views only:
   - project dashboard
   - create project from library/pattern detail
   - project detail
   - counters
   - work log
   - yarn / needle notes
4. Keep Library as the ownership layer and Projects as the active-making layer,
   exactly as on mobile.
5. Preserve two-way sync expectations:
   - create on mobile -> visible on web
   - update on web -> visible on mobile
   - delete/archive on either side -> reflected everywhere
6. Use the extra desktop space for density and clarity, not for a different
   workflow model.
7. Only after the core web project surface feels stable should deeper desktop
   helpers be considered, such as side-by-side pattern/project panels,
   printable progress views, or richer planning tools.

Web implementation order:

- Step 1: add Projects navigation entry and empty state
- Step 2: add projects dashboard list with filters, sort, and search
- Step 3: add create/edit project flows linked to library patterns
- Step 4: add project detail parity with notes, counters, and work log
- Step 5: validate mobile/web sync for create/update/delete and counter edits
- Step 6: add visual polish and layout optimisation for desktop/tablet

#### Success Criteria

Projects is successful when:

1. A user can create and resume multiple WIPs without losing track.
2. A pattern can be turned into a project in seconds.
3. Project state syncs between mobile and web once the web version is added.
4. Project detail becomes the natural place to continue working, not just Library.
5. The feature feels like a practical companion for real makers, not a generic CRUD screen.

### Phase 4: AI Chat Parity

Port the Pattern Helper AI behavior, not just a generic chat box.

Deliverables:
- per-pattern sessions
- session creation and reuse
- message history
- sending prompts and receiving assistant responses
- inline error handling
- reopen and continue prior chats

### Phase 5: Rewrite Parity

Port guided and freeform rewrite behavior into a mobile-native experience.

Deliverables:
- rewrite home
- structured prompt presets/chips
- freeform prompt entry
- save and reopen rewrites
- result presentation with long-form readability

### Phase 6: Tools Parity

Port the website’s practical helper surfaces that sit outside direct pattern
chat.

Deliverables:
- Stitch Dictionary
- Gauge Calculator simple mode
- Gauge Calculator advanced mode
- needle/hook reference
- explanation/jump actions into AI

### Phase 7: Stitch Vision Parity

Bring camera/image workflow to the Expo branch.

Deliverables:
- image picker / camera capture
- upload to API
- analysis rendering
- retry and failure states

### Phase 8: Ravelry Parity

Bring over all end-user Ravelry value, not just a placeholder button.

Deliverables:
- connection status screen
- connect / reconnect launch flow
- search results list
- pattern result detail
- import into library
- imported-pattern refresh actions

### Phase 9: Account and Billing Parity

Align access-control and account management with the current platform model.

Deliverables:
- entitlement display
- trial / paid / courtesy / lifetime messaging
- manage subscription entry points
- export/delete data entry points
- sync diagnostics for support/testing

### Phase 10: Full Cross-Platform Sync Validation

Validate that this Expo app is truly another surface of the same product.

Deliverables:
- same-account cross-device test matrix
- web/mobile data consistency checks
- new upload visibility checks
- chat/rewrite continuity checks
- Ravelry import visibility checks

### Phase 10A: Launch Hardening

Treat launch hardening as a product reliability phase, not a polish sweep.

Deliverables:
- strict pattern-isolation rules across chat, rewrite, project AI, and any
  other pattern-aware helpers
- metadata-only pattern blocking with a single clear purchase/re-import rule
- web-as-master deletion/re-sync behavior validation
- trustworthy sync/account diagnostics for support and QA
- onboarding validation for brand-new accounts, WordPress-linked users, and
  returning users
- launch readiness review for AI reliability, support risk, and user trust

## Key Architecture Rules

1. Expo app talks to `stitchsense-api`, not directly to n8n.
2. Shared API remains the source of truth for user, entitlement, pattern,
   chat, rewrite, and sync state.
3. Any missing backend endpoint discovered during parity work should be added
   to the shared backend, not hacked locally in the client.
4. Mobile UX can change layout and navigation, but cannot silently remove web
   capability without an explicit product decision.
5. Parity is complete only when a real user can move between web and mobile
   without losing access to any meaningful workflow.
6. Pattern-aware tools must always operate on the explicitly selected pattern
   only. No hidden fallback to last-opened, last-chatted, or cached pattern
   state is allowed.
7. If the web app and mobile app disagree after a re-sync, the web/platform
   state is treated as the master record unless a deliberate offline-sync model
   is designed and documented later.

## Validation Gates

Parity should not be called complete until these are true:

1. A real WordPress-linked account can log in on Expo.
2. That account’s patterns match the web library.
3. New web uploads appear in Expo without manual workarounds.
4. Chat sessions created on web are visible in Expo.
5. Chat sessions created in Expo are visible on web.
6. Rewrite history is visible and resumable both ways.
7. Ravelry import works and imported patterns appear in the synced library.
8. Gauge, dictionary, and Stitch Vision are usable on a real phone.
9. Entitlement behavior matches the web/platform account state.
10. The app is pleasant and reliable enough to be used instead of the website
    when a user is on mobile.
11. Pattern-aware AI never references another pattern after switching context,
    relaunching, re-syncing, or moving between project and library entry points.
12. Metadata-only Ravelry imports never fabricate summaries, answers, or
    rewrites.
13. Re-sync correctly removes mobile records that were deleted on the web side
    when the product rules say the web copy is the master.
