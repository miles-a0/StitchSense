# Pattern Isolation Hardening Build Plan

## Goal

Guarantee that every pattern-aware tool in StitchSense uses only the currently selected pattern and cannot leak, reuse, or infer context from any other pattern.

This applies across:

- mobile app
- web app
- shared API
- n8n workflows
- sync / restore / resume flows

It is a launch-critical reliability requirement, not a polish task.

## Core Rule

If a user opens pattern `A`, every pattern-aware action must use pattern `A` only.

Pattern-aware actions include:

- chat
- rewrite
- project-linked chat
- project-linked rewrite
- project “continue working” entry points
- summaries generated for the opened pattern
- any tool shortcut that opens directly into a pattern-aware AI flow

Pattern-neutral tools such as a stitch dictionary or general help can remain outside this rule where that makes product sense.

## Product Requirements

### 1. Explicit active-pattern binding

Every pattern-aware screen or action must carry an explicit `patternId`.

There should never be a “best guess” fallback based on:

- last opened pattern
- last chat session
- another project
- cached history from another pattern
- a library item that happens to share metadata

### 2. Pattern validity awareness

The system must distinguish between:

- full source pattern available
- uploaded file available
- purchased/imported pattern text available
- metadata-only Ravelry listing
- invalid / missing source data

If full source text is not available, pattern-aware AI actions must not improvise.

Required fallback:

- clearly tell the user to purchase or re-import the pattern before chat/rewrite can continue

### 3. Session isolation by pattern

Sessions must be pattern-scoped.

That means:

- a chat session created for pattern `A` cannot be resumed from pattern `B`
- a rewrite session created for pattern `A` cannot be resumed from pattern `B`
- project-linked AI sessions must also remain tied to that project's linked pattern

### 4. Web-as-master sync discipline

If a user deletes or changes synced data on the web side, a mobile re-sync must
not silently resurrect stale mobile copies back into the shared system.

For the current product model:

- synced web/platform data is the master record
- mobile re-sync should converge to that master record
- stale local pattern-aware state must be cleared when it no longer matches the
  web/platform copy

### 5. Clear user framing

Users should always be able to tell which pattern they are working with.

UI should reinforce:

- current pattern title
- pattern status
- whether the pattern is fully available or metadata-only
- when AI is blocked because the underlying source is incomplete

## Backend / API Workstream

### 1. Lock request contracts

Every pattern-aware endpoint should require:

- `patternId`
- `userId` from auth
- `sessionId` if continuing an existing session

Reject requests when:

- `patternId` is missing
- `sessionId` belongs to another pattern
- `patternId` does not belong to the authenticated user

### 2. Enforce session-to-pattern integrity

Add backend guards so:

- session records store pattern ownership
- any mismatch between requested `patternId` and stored session `patternId` fails fast
- rewrite jobs cannot silently reuse a prior pattern context
- project-linked AI actions cannot run if the project-to-pattern link is missing
  or ambiguous

### 3. Centralise availability rules

Create one shared service that determines whether a pattern has enough real source material for AI actions.

This service should answer:

- is full pattern text available?
- is this metadata-only?
- should chat be blocked?
- should rewrite be blocked?
- what user-facing reason should be returned?

It should also control whether pattern summaries may be generated at all.
Metadata-only imports must not be allowed to fabricate summaries that look like
real pattern understanding.

### 4. Add audit-friendly tracing

For each pattern-aware request, record enough structured logs to debug contamination safely:

- user id
- pattern id
- session id
- project id if relevant
- workflow route used
- “blocked because metadata-only” state
- whether the request came from web, Expo, or another client surface

## Mobile App Workstream

### 1. Entry point hardening

Audit every mobile entry point into AI:

- from library pattern detail
- from project detail
- from project quick actions
- from resumed history

Each route must:

- bind the active pattern explicitly
- clear stale draft/session state from another pattern
- refuse to open if pattern binding is ambiguous

### 2. Local state reset rules

When switching from pattern `A` to pattern `B`, the app must clear:

- current draft question
- cached response preview
- attached session state
- rewrite instructions tied to pattern `A`
- any optimistic summary or AI helper banner tied to pattern `A`

### 3. Pattern-scoped history rendering

Chat and rewrite history screens should show only entries for the active pattern.

They must not:

- merge unrelated sessions
- offer “continue” actions for other patterns
- reopen the last session globally

### 4. Project-linked behavior

Projects must always pass through their linked pattern.

If a project has a linked pattern:

- project chat means chat for that pattern
- project rewrite means rewrite for that pattern
- no cross-project or cross-pattern session reuse

Pattern-derived helper fields in the project setup flow should also be loaded
only from the selected pattern, never from the last project or another pattern
cache.

## Web App Workstream

### 1. Parity with mobile rules

The same pattern-isolation rules must apply in WordPress/web.

That includes:

- pattern detail tools
- project or workspace entry points
- resumed histories
- summary regeneration

### 2. Shared UX messaging

If a pattern is metadata-only:

- web and mobile should both present the same clear blocking rule
- web and mobile should both avoid generating a misleading summary

## n8n / Workflow Workstream

### 1. Workflow payload discipline

Every request forwarded to n8n should contain only the selected pattern's context:

- pattern id
- pattern title
- source availability status
- extracted pattern text or allowed source summary
- user question or rewrite request

It must not forward:

- other library patterns
- stale previous session context
- unrelated rewrite history

### 2. Prompt hardening

Workflow instructions should explicitly state:

- answer only from the supplied pattern context
- do not infer from other patterns
- if source is incomplete, tell the user to purchase or re-import
- translate final response to English when the source pattern is another language
- do not use hidden memory or prior pattern answers when the current pattern id
  changes

### 3. Workflow memory review

Review whether any persistent memory, conversation memory, or hidden state in n8n could bleed across sessions.

If yes:

- disable it for pattern-aware flows
- or key it strictly by user + pattern + session

## QA / Validation Workstream

### 1. Direct contamination tests

Test matrix:

1. Open pattern `A`, ask identifying question.
2. Open pattern `B`, ask same question.
3. Verify `B` answer never references `A`.

Repeat for:

- chat
- rewrite
- project-linked chat
- project-linked rewrite

### 2. Resume tests

Verify isolation holds after:

- app relaunch
- token refresh
- re-sync
- switching between web and mobile
- reopening a saved project
- deleting the web copy and forcing a mobile re-sync

### 3. Metadata-only tests

For imported but not purchased Ravelry patterns:

- chat must block cleanly
- rewrite must block cleanly
- summary generation must not invent unsupported details

### 4. Regression tests

Add automated tests where practical for:

- API contract validation
- session mismatch rejection
- pattern ownership checks
- metadata-only blocking rules

## Launch Acceptance Criteria

This workstream is complete only when:

- no reproducible cross-pattern contamination remains in the agreed test matrix
- every pattern-aware request includes explicit pattern binding
- session reuse across patterns is impossible by contract
- metadata-only patterns are blocked consistently
- web and mobile both follow the same behavior
- logs are good enough to diagnose any future violation quickly
