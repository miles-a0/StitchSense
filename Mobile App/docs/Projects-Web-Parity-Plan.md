# Projects Web Parity Plan

This document tracks the web rollout for the shared Projects system now being proven in the Expo app.

Status: core web parity is implemented locally in the WordPress plugin. The web UI now has a Projects tab backed by the shared platform API, with list/search/status filter, create-from-library-pattern, inline status/progress/stage/notes editing, soft delete, and per-project sync validation.

## Goal

Bring Projects to the web app without splitting the data model, the sync rules, or the user mental model between web and mobile.

## Shared platform foundations already in place

- Shared `projects` API and storage
- Shared project counters
- Shared work log entries
- Shared project photos
- Shared project-linked pattern marks
  - reading position
  - bookmarks
  - annotations

## Web parity scope

The web version should eventually support the same core working flow as Expo:

1. Create a project from any library pattern
2. Create multiple projects from the same pattern
3. Edit project state, deadline, notes, recipient, occasion, yarn, and needle data
4. Save counters, work logs, photos, and reading-position markers
5. Jump from a project into the linked pattern, chat, and rewrite surfaces
6. Keep project deletes separate from pattern deletes

## Web rollout order

### Phase A: Read-only dashboard parity

- [x] Add Projects dashboard to the web app
- [x] Show:
  - status
  - progress
  - linked pattern
  - updated date

### Phase B: Core project editing parity

- [x] Add project create flow from saved library patterns
- [x] Add inline editing for status, progress, stage, and notes
- [x] Add project delete flow
- [x] Keep project creation linked to shared library pattern ids
- [ ] Add a richer project detail panel/page for counters, work logs, and media

### Phase C: Working tools parity

- [ ] Add counters
- [ ] Add work log
- [ ] Add photo timeline
- [ ] Add reading position
- [ ] Add bookmarks and annotations

### Phase D: Validation and polish

- [x] Add per-project sync validation action in the web card
- [ ] Verify web/mobile create, update, and delete behavior stays in sync on a live account
- [ ] Verify project-linked actions always open the correct linked pattern context
- [ ] Add support/admin diagnostics where useful

## Key implementation constraints

- The shared API remains the source of truth
- Pattern records and project records stay separate
- Deleting a project must never delete the linked pattern
- Multiple projects can reference the same library pattern
- Project-linked marks belong to the project, not to the raw pattern globally

## Not in scope yet

- Full web-side design pass
- Collaborative/shared household projects
- Offline-first editing on web
- Advanced inline PDF annotation UI

## Readiness signal for expanding web parity

Expand beyond the local core web surface once these are stable in live testing:

- project create/update/delete
- counters
- work log
- photo timeline
- reading position / bookmarks
- cross-device sync validation
