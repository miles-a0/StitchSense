# Pattern Isolation Hardening Checklist

## Product Rules

- [ ] Define and document which tools are pattern-aware vs pattern-neutral.
- [ ] Confirm pattern-aware tools require explicit active-pattern binding.
- [ ] Confirm metadata-only patterns must block chat/rewrite instead of guessing.
- [ ] Confirm web and mobile should present the same blocking message.
- [x] Confirm metadata-only patterns must not generate misleading summaries.
- [x] Confirm synced web/platform data is treated as the master record during re-sync.

## Backend / API

- [ ] Require `patternId` on every pattern-aware request.
- [ ] Reject pattern-aware requests with missing or ambiguous pattern binding.
- [ ] Store session-to-pattern linkage for chat sessions.
- [ ] Store session-to-pattern linkage for rewrite sessions.
- [ ] Reject session reuse when the requested pattern differs from the stored session pattern.
- [x] Centralise “full source available vs metadata-only” validation.
- [x] Block summary generation for metadata-only patterns.
- [ ] Add structured logging for user id, pattern id, session id, and project id.
- [x] Add source-surface logging for web vs Expo vs other clients.

## Mobile App

- [ ] Audit every chat entry point from library pattern detail.
- [ ] Audit every rewrite entry point from library pattern detail.
- [ ] Audit every chat entry point from project detail.
- [ ] Audit every rewrite entry point from project detail.
- [ ] Clear stale local AI state when switching patterns.
- [ ] Ensure “continue chat” only resumes sessions for the same pattern.
- [ ] Ensure “continue rewrite” only resumes sessions for the same pattern.
- [ ] Show clear current-pattern context in pattern-aware screens.
- [ ] Show clear metadata-only blocking state in pattern-aware screens.
- [ ] Clear stale mobile copies correctly after a web-master re-sync.
- [ ] Ensure project setup helper fields are populated only from the chosen pattern.

## Web App

- [ ] Audit web chat entry points for explicit pattern binding.
- [ ] Audit web rewrite entry points for explicit pattern binding.
- [ ] Ensure web resumes only same-pattern sessions.
- [ ] Ensure web blocking behavior matches mobile for metadata-only patterns.
- [x] Ensure web summary regeneration honors metadata-only blocking rules.

## n8n / Workflow

- [ ] Confirm workflow payload contains only the selected pattern context.
- [ ] Remove any hidden cross-pattern memory from pattern-aware flows.
- [ ] Add prompt instruction forbidding answers from outside supplied context.
- [ ] Add prompt instruction to return English output when source is another language.
- [ ] Add prompt instruction to return purchase/re-import message for metadata-only patterns.
- [ ] Add prompt instruction to ignore prior pattern memory when the pattern id changes.

## QA

- [ ] Test chat contamination: pattern A then pattern B.
- [ ] Test rewrite contamination: pattern A then pattern B.
- [ ] Test project-linked contamination across two projects using different patterns.
- [ ] Test app relaunch does not restore wrong pattern context.
- [ ] Test re-sync does not restore wrong pattern context.
- [ ] Test web-to-mobile continuation stays on the same pattern.
- [ ] Test mobile-to-web continuation stays on the same pattern.
- [ ] Test web deletion then mobile re-sync removes the mobile copy instead of resurrecting it.
- [ ] Test metadata-only Ravelry pattern blocks correctly in chat.
- [ ] Test metadata-only Ravelry pattern blocks correctly in rewrite.
- [ ] Test metadata-only Ravelry pattern does not create a fabricated summary.
- [ ] Test uploaded full-source pattern still works normally in chat.
- [ ] Test uploaded full-source pattern still works normally in rewrite.

## Launch Gate

- [ ] Zero reproducible cross-pattern contamination remains.
- [ ] Zero accepted pattern-aware requests are missing `patternId`.
- [ ] Zero accepted mismatched sessions can cross to another pattern.
- [ ] Metadata-only blocking is consistent across mobile and web.
- [ ] Web-master re-sync behavior is stable and no stale mobile content is resurrected.
