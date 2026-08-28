# Expo Web-Parity Checklist

Use this checklist as the working build tracker for the Expo branch in
`Mobile App/stitchsense-expo`.

## Phase 0: Audit and Parity Map

- [ ] Confirm final feature inventory against the live web UI, not just docs.
- [ ] Capture every user-facing web screen/panel and map it to an Expo route or modal.
- [ ] Confirm which web features are primary-tab destinations versus nested routes on mobile.
- [ ] Confirm current backend endpoints needed for every web feature.
- [ ] Note any web behaviors that still rely on WordPress-only routes and need shared API parity.

Local source audit note: the WordPress plugin and Expo route map have been reconciled through the current local codebase. The remaining Phase 0 items require a credentialed live web UI pass before they should be checked.

## Phase 1: Expo App Foundation

- [x] Create separate Expo app scaffold.
- [x] Keep SwiftUI app intact while starting Expo branch.
- [x] Configure Expo Go-friendly SDK path.
- [x] Add branded Expo Router shell.
- [x] Add secure token storage.
- [x] Add API configuration for live StitchSense platform.
- [x] Add basic session restore and sign-in flow.
- [x] Add unified API error mapping across all screens.
- [x] Add offline-safe local metadata cache for patterns and recent activity.
- [x] Add reusable design-system primitives for cards, buttons, pills, sheets, empty states, and loaders.

## Phase 2: Auth and Account Access

- [x] Add StitchSense email login.
- [x] Add WordPress username/email fallback login.
- [x] Add registration flow if still required for parity.
- [x] Add forgot-password / recovery entry point if required for parity.
- [x] Add sign-out flow polish and confirmation UX.
- [x] Add account identity display parity with web expectations.
- [x] Add sync/account diagnostics for support testing.

## Phase 3: Library Core Parity

- [x] Add live pattern list loading.
- [x] Add pattern detail route shell.
- [x] Add pull-to-refresh.
- [x] Add search box.
- [x] Add full text search parity against title / filename / summary / craft.
- [x] Add sort options parity.
- [x] Add filter chips parity such as all / knitting / crochet / archived / rewritten / Ravelry-aware views where applicable.
- [x] Add pattern activity counts (chat count / rewrite count).
- [x] Add empty state parity and upload-focused call to action.
- [x] Add explicit re-sync action with visible state/debug details when sync fails.
- [x] Add archive action.
- [x] Add delete action.
- [x] Add edit metadata action.
- [x] Add upload-new-pattern flow from Expo.

## Phase 4: Pattern Detail and Workspace Parity

- [x] Build full pattern detail header with source, craft, paid/free, and file metadata.
- [x] Add collapsed/expandable AI summary area.
- [x] Add refresh AI summary action.
- [x] Add open pattern file action.
- [x] Add open pattern chat action.
- [x] Add open AI rewrite action.
- [x] Add refresh from Ravelry action for imported patterns.
- [x] Add pattern-specific recent chat history surface.
- [x] Add pattern-specific recent rewrite history surface.
- [x] Add pattern-specific action layout tuned for small phones.

## Phase 4A: Projects Workspace Replacement

- [x] Confirm final product boundary between Library and Projects.
- [x] Replace the temporary Workspace tab concept with a dedicated Projects concept in docs, IA, and navigation copy.
- [x] Design shared backend data model for projects linked to patterns.
- [x] Add backend `projects` table and core CRUD endpoints in `stitchsense-api`.
- [x] Add backend support for project status, stage, favourite, progress, and notes.
- [x] Add backend support for "create project from pattern" flow.
- [x] Add Expo Projects dashboard route replacing the current Workspace placeholder.
- [x] Add active/planned/paused/completed filters.
- [x] Add project search.
- [x] Add project sorting by recent activity, deadline, alphabetical, and progress.
- [x] Add project cards with cover image, linked pattern, stage, status, progress, and last-worked metadata.
- [x] Add quick-create project flow from Library.
- [x] Add quick-create project flow from Pattern Detail.
- [x] Add project detail screen.
- [x] Add editable project notes.
- [x] Add editable progress field with flexible mode support.
- [x] Add editable stage and status.
- [x] Add favourite / pin behavior.
- [x] Add "continue working" actions from project detail into pattern view, chat, and rewrite.
- [x] Add project idle/recency indicators that help users pick up WIPs quickly.
- [x] Add sync validation for project create/update/delete against shared platform data.
- [x] Define the follow-on web implementation plan once mobile project flows are stable.

## Phase 5: Pattern Viewer Parity

- [x] Add secure file-open flow for synced pattern documents.
- [x] Add in-app PDF/file viewer that works on Expo-supported surfaces.
- [x] Add loading state for signed file retrieval.
- [x] Add failure state when file URL/signing fails.
- [x] Add open-in-system fallback if the file viewer hits device limitations.

## Phase 6: Pattern Helper AI Chat Parity

- [x] Add create-chat-session flow.
- [x] Add list chat sessions for a pattern.
- [x] Add open existing chat session.
- [x] Add list messages in a session.
- [x] Add send message flow.
- [x] Add assistant streaming or staged response UX if supported by backend.
- [x] Add inline recoverable error state for failed replies.
- [x] Add recent prompts/history continuation behavior.
- [x] Add session title handling parity.
- [x] Add skill-level / terminology / UK metric context controls where required by the current product.
- [ ] Verify chat saves correctly to shared API and appears on web.

## Phase 7: Rewrite Parity

- [x] Add rewrite home screen.
- [x] Add guided rewrite goal options.
- [x] Add quick rewrite chips matching current web intents.
- [x] Add freeform rewrite prompt entry.
- [x] Add send/generate action with loading UX.
- [x] Add rewrite result rendering for long-form content.
- [x] Add save rewrite to shared platform.
- [x] Add list rewrites for a pattern.
- [x] Add open previous rewrite flow.
- [x] Add compare/original-context handling if needed for parity.
- [ ] Verify rewrite saves correctly to shared API and appears on web.

## Phase 8: Stitch Dictionary Parity

- [x] Add Stitch Dictionary route/screen.
- [x] Add searchable stitch glossary.
- [x] Add category or filter controls matching web behavior.
- [x] Add readable mobile card/list presentation for entries.
- [x] Add deep links or jump actions from related tool/help surfaces.

## Phase 9: Gauge Calculator Parity

- [x] Add Gauge Calculator route/screen.
- [x] Add simple mode.
- [x] Add advanced mode.
- [x] Add mode toggle styling/behavior parity.
- [x] Add uploaded-pattern gauge autofill flow where data exists.
- [x] Add pattern gauge fields.
- [x] Add swatch fields.
- [x] Add unit selection and custom measurement handling.
- [x] Add craft type and current needle/hook fields.
- [x] Add advanced tolerance controls.
- [x] Add calculation result rendering.
- [x] Add reset flow.
- [x] Add "Ask StitchSense to explain this" follow-up flow.
- [x] Add needle/hook reference list.
- [x] Add helper cards/jump actions tied to gauge outcomes.

## Phase 10: Tools Surface Parity

- [x] Add tools landing screen parity with web helper-card model.
- [x] Add jump actions into Gauge Calculator, Stitch Dictionary, Rewrite, and other helpers.
- [x] Add yarn substitution helper entry point.
- [x] Add ease-check helper entry point.
- [x] Add needle/hook direction helper entry point.
- [x] Add terminology/pattern-help helper actions where present on web.

## Phase 11: Stitch Vision Parity

- [x] Add photo picker flow.
- [x] Add camera capture flow.
- [x] Add image upload to backend.
- [x] Add Stitch Vision result screen.
- [x] Add loading and retry states.
- [x] Add analysis failure messaging parity.
- [x] Add saved-result or resumable behavior if the product currently expects it.

## Phase 12: Ravelry Connection and Import Parity

- [x] Add Ravelry status screen.
- [x] Add connect / reconnect launch flow.
- [x] Add saved-pattern/library import entry point.
- [x] Add Ravelry search screen.
- [x] Add search filters supported by current backend/web behavior.
- [x] Add search results list.
- [x] Add result detail preview.
- [x] Add import action from result detail/card.
- [x] Add open / buy on Ravelry action.
- [x] Add imported-pattern metadata parity.
- [x] Add refresh-from-Ravelry action in pattern detail.
- [ ] Verify imported patterns appear in shared library on web and mobile.

## Phase 13: Account, Paywall, and Entitlement Parity

- [x] Add entitlement summary parity.
- [x] Add free-trial state messaging.
- [x] Add paid subscription state messaging.
- [x] Add courtesy / beta / lifetime entitlement messaging.
- [x] Add manage subscription action.
- [x] Add restore subscription status action.
- [x] Add export data entry point.
- [x] Add delete data entry point.
- [x] Add account/preferences surface parity where currently required.
- [x] Add paywall screen that reflects the current product offer.

## Phase 14: Sync Parity and Data Integrity

- [x] Add support-facing parity diagnostics comparing live WordPress export counts against platform counts.
- [x] Extend parity diagnostics to flag specific WordPress-synced patterns missing on the platform or lingering only on mobile/platform.
- [x] Add project create/update/delete sync validation to platform diagnostics and web project cards.
- [ ] Verify web upload -> Expo library appearance.
- [ ] Verify Expo upload -> web library appearance.
- [ ] Verify new chat on web -> Expo visibility.
- [ ] Verify new chat on Expo -> web visibility.
- [ ] Verify new rewrite on web -> Expo visibility.
- [ ] Verify new rewrite on Expo -> web visibility.
- [ ] Verify Ravelry import on web -> Expo visibility.
- [ ] Verify Ravelry import on Expo -> web visibility.
- [ ] Verify pattern summary refresh remains consistent across clients.
- [ ] Verify archive/delete/edit actions remain consistent across clients.

## Phase 15: UX, Device Testing, and Release Readiness

- [x] Apply shared section/form UI hardening to dense account and project-detail screens.
- [ ] Test on physical iPhone through Expo Go.
- [ ] Test on at least one larger iPhone size.
- [ ] Test long titles, long AI summaries, and dense history lists.
- [ ] Test poor network / timeout / API failure states.
- [ ] Test login/logout/session-expiry behavior.
- [ ] Test keyboard ergonomics across chat, rewrite, and search surfaces.
- [ ] Test accessibility basics: tap targets, contrast, dynamic text, VoiceOver labels.
- [ ] Confirm the Expo app is feature-complete enough to stand in for the web app on mobile.
- [ ] Freeze a parity-complete milestone.

## Phase 16: Projects Expansion (After Core Project Launch)

- [x] Add project counters (row, round, repeat, section).
- [x] Add project progress history / work log entries.
- [x] Add yarn tracking attached to projects.
- [x] Add needle/hook tracking attached to projects.
- [x] Add project photo timeline.
- [x] Add recipient / gift / occasion metadata.
- [x] Add deadline-aware reminders or urgency surfacing.
- [x] Add saved reading position in pattern viewer.
- [x] Add project-linked annotations / highlights / bookmarks if still justified after core rollout.
- [x] Add web app parity for the Projects system once the shared API and Expo UX are proven.
