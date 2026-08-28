# PRE_LAUNCH_UX_UI_CODE_AUDIT_AND_ACTION_PLAN

## 1. Executive Summary

StitchSense Pro has moved well beyond prototype territory. The Expo app already shows a strong core product shape:

- mixed WordPress/platform auth
- onboarding
- shared library sync
- Ravelry flows
- project tracking
- AI chat / rewrite
- Stitch Vision
- a real token-based theme

That said, it is not yet in a clean launch-ready state.

The main launch risks are:

- sync trust and data parity still feel fragile
- backend-dependent AI features remain operationally brittle
- pattern-aware AI context isolation is not yet formalised as a hard platform rule
- some screens are polished while others still feel dense or inconsistent
- project workflows are promising but not yet confidence-inspiring end to end
- account / diagnostics / entitlements still mix user-facing and troubleshooting concerns

The good news is that this is fixable without a product reset. The strongest path is a disciplined launch hardening phase focused on:

1. trust in sync
2. robustness in AI workflows
3. strict pattern isolation
4. tighter UI consistency
5. better task completion on key journeys
6. clearer launch scope

My recommendation:

- Do not treat this as “ship everything now”.
- Treat the next phase as a launch hardening sprint.
- Freeze feature expansion except where it directly improves the core launch journeys.

Recommended launch-critical journeys:

- create account / sign in
- onboarding
- connect Ravelry
- sync library
- upload pattern
- open pattern
- AI chat on a valid purchased/uploaded pattern
- AI rewrite on a valid purchased/uploaded pattern
- create project from a pattern
- use counters / notes / progress photos

Non-negotiable launch rule:

- every pattern-aware tool must operate only on the currently opened pattern or project-linked pattern, with zero reuse of unrelated pattern context

Everything else should be judged by whether it strengthens or weakens those journeys.

---

## 2. Full UX/UI Review

### Overall impression

The app already has a warm, premium-adjacent visual language built from good ingredients:

- a soft cream background palette
- a rich brown primary tone
- rounded cards
- tactile shadows
- clean thumbnail-led list items
- a stronger hero treatment via [screen-hero.tsx](/Users/andrewmagill/DEV/StitchSense/Mobile%20App/stitchsense-expo/src/components/ui/screen-hero.tsx)

But the experience is still uneven. Some screens feel refined, while others still feel like feature surfaces assembled at different times.

### What is working well

- The tabbed app shell in [app/(tabs)/_layout.tsx](/Users/andrewmagill/DEV/StitchSense/Mobile%20App/stitchsense-expo/app/(tabs)/_layout.tsx) is sensible and broadly understandable.
- The dashboard direction in [dashboard.tsx](/Users/andrewmagill/DEV/StitchSense/Mobile%20App/stitchsense-expo/app/(tabs)/dashboard.tsx) is useful and gives the app a “home”.
- Library cards in [pattern-card.tsx](/Users/andrewmagill/DEV/StitchSense/Mobile%20App/stitchsense-expo/src/components/library/pattern-card.tsx) are much more scannable than earlier chunky card layouts.
- Project cards in [project-card.tsx](/Users/andrewmagill/DEV/StitchSense/Mobile%20App/stitchsense-expo/src/components/projects/project-card.tsx) are stronger than the old project list treatment.
- The onboarding direction is good: emotional, functional, then activation in [onboarding.tsx](/Users/andrewmagill/DEV/StitchSense/Mobile%20App/stitchsense-expo/app/onboarding.tsx).
- The token base in [tokens.ts](/Users/andrewmagill/DEV/StitchSense/Mobile%20App/stitchsense-expo/src/theme/tokens.ts) is a very good foundation.

### UX/UI issues to address before launch

#### A. Typography hierarchy is still too volatile

Symptoms:

- hero titles can still overpower smaller screens
- some screens still feel top-heavy before users reach the actual action area
- body text density varies too much between views

Files/screens implicated:

- [screen-hero.tsx](/Users/andrewmagill/DEV/StitchSense/Mobile%20App/stitchsense-expo/src/components/ui/screen-hero.tsx)
- [dashboard.tsx](/Users/andrewmagill/DEV/StitchSense/Mobile%20App/stitchsense-expo/app/(tabs)/dashboard.tsx)
- [camera.tsx](/Users/andrewmagill/DEV/StitchSense/Mobile%20App/stitchsense-expo/app/(tabs)/camera.tsx)
- [sign-in.tsx](/Users/andrewmagill/DEV/StitchSense/Mobile%20App/stitchsense-expo/app/sign-in.tsx)

Action:

- define one strict mobile heading system and apply it everywhere:
  - display
  - page title
  - section title
  - body
  - helper
  - meta

#### B. Screen density is inconsistent

Some screens now feel clean and roomy. Others still stack large hero copy, large cards, large form fields, and large buttons in a way that causes fatigue.

Highest-risk screens:

- [project/new.tsx](/Users/andrewmagill/DEV/StitchSense/Mobile%20App/stitchsense-expo/app/project/new.tsx)
- [project/[id].tsx](/Users/andrewmagill/DEV/StitchSense/Mobile%20App/stitchsense-expo/app/project/[id].tsx)
- [account.tsx](/Users/andrewmagill/DEV/StitchSense/Mobile%20App/stitchsense-expo/app/(tabs)/account.tsx)
- [camera.tsx](/Users/andrewmagill/DEV/StitchSense/Mobile%20App/stitchsense-expo/app/(tabs)/camera.tsx)

Action:

- tighten vertical rhythm
- reduce duplicate explanatory copy
- keep one dominant action per section
- collapse advanced/troubleshooting content

#### C. Diagnostics and power-user content are too close to normal user flows

The account screen currently mixes:

- preferences
- subscription context
- sync diagnostics
- destructive actions
- account refresh

That is useful for development, but not ideal for launch UX.

Action:

- keep “Account” user-focused
- move deep diagnostics into a collapsible “Advanced / Troubleshooting” area
- keep parity counters hidden unless explicitly requested

#### D. Onboarding layout still needs responsive hardening

The onboarding concept is strong, but the layout is clearly vulnerable to overflow and crowding on real devices.

File:

- [onboarding.tsx](/Users/andrewmagill/DEV/StitchSense/Mobile%20App/stitchsense-expo/app/onboarding.tsx)

Action:

- create a single responsive onboarding layout system
- constrain content block max heights
- keep primary CTA row fixed and non-overlapping
- ensure each slide works on shorter iPhones and larger Android devices

#### E. Tool discoverability is improving, but tool context is still weak

The dashboard helps, but users still need clearer mental models for:

- when to use chat
- when to use rewrite
- when to use Stitch Vision
- when to use projects vs library

Action:

- each tool should explain the task it is best for in one plain sentence
- dashboard cards should use outcome-led copy, not feature-led copy

### UI improvements already worth preserving

- thumbnail-led cards
- warm hero blocks
- 2x2 summary stat pattern
- softer raised card shadows
- white panel auth screen instead of raw WordPress UI
- stronger visual identity through onboarding imagery

---

## 3. Product Review

### Product strengths

StitchSense has a compelling product concept because it joins several adjacent needs in one flow:

- collect patterns
- understand them
- ask questions
- rewrite/adapt them
- organise work in projects
- track progress visually

That is a meaningful product, not just a novelty wrapper around AI.

### Core product opportunities

#### 1. The Library -> Project path is the real heart of the app

This is the strongest long-term product story:

- patterns live in the library
- a single pattern can spawn many real projects
- each project gets its own counters, notes, progress, and working state

This is the right direction and should remain central.

#### 2. AI is valuable only when grounded in real pattern context

Your recent fixes and rules are absolutely the right product stance:

- no cross-contamination between patterns
- no invented answers when the user has not actually imported/purchased the real pattern

This is a trust product, not a “sound clever” product.

Recommendation:

- make grounding rules explicit in the UX
- show pattern validity state clearly:
  - full pattern available
  - metadata only
  - Ravelry listing only
- treat strict pattern isolation as a launch gate, not a nice-to-have

#### 2a. Strict pattern isolation must be a first-class system rule

For any pattern-aware flow, including:

- pattern chat
- pattern rewrite
- project-linked chat
- project-linked rewrite
- project quick actions that reopen AI tools

the system must:

- know exactly which pattern is active
- send only that pattern's allowed context to the backend and workflow layer
- reject ambiguous requests where no clear pattern is bound
- refuse to reuse sessions tied to a different pattern
- block speculative answers when the full source pattern is not actually available

This is central to product trust. If the app answers from the wrong pattern even occasionally, users will stop trusting the whole system.

#### 3. Projects can become the retention engine

Projects are what can make this stick beyond a one-off helper tool.

Current project feature set already hints at this:

- progress
- counters
- notes
- work log
- photos
- reading/bookmark state

Recommendation:

- prioritise projects as the primary retention loop
- treat dashboard + projects as the “daily use” surface
- treat library + tools as support surfaces

### Product risks

#### A. Scope creep

There are enough features now that the app can drift into “everything for everyone”.

Risk areas:

- too many tool surfaces
- too many debugging/admin behaviours exposed in-app
- too much onboarding before value is felt

Recommendation:

- define launch scope as:
  - import
  - organise
  - ask
  - adapt
  - track

#### B. Sync trust is still the key adoption risk

If users suspect:

- missing patterns
- stale patterns
- deleted data reappearing
- wrong project linkage

they will not trust the app, no matter how pretty it is.

Recommendation:

- launch messaging should position web as source of truth where that is the current model
- sync status should use human language
- re-sync should explain what it does

#### C. Paywall/admin access management must remain understandable

You already have entitlement/admin override logic in play, but it must feel simple:

- free trial
- paid plan
- manual override

Recommendation:

- do not overload the mobile app with admin subscription tooling
- keep detailed access controls in WordPress admin

---

## 4. Engineering Review

### Overall engineering impression

This codebase shows strong momentum and a lot of practical problem-solving. It is not sloppy. But it is now reaching the point where some successful “just get it working” decisions should be reorganised before launch scale.

### What is strong

#### 1. Real design token base exists

File:

- [tokens.ts](/Users/andrewmagill/DEV/StitchSense/Mobile%20App/stitchsense-expo/src/theme/tokens.ts)

This is a proper foundation and should be preserved.

#### 2. API normalization layer is doing important work

File:

- [api.ts](/Users/andrewmagill/DEV/StitchSense/Mobile%20App/stitchsense-expo/src/lib/api.ts)

Given the WordPress/platform/mobile bridge complexity, normalization is essential.

#### 3. Providers are a sensible architecture choice

Files:

- [session-provider.tsx](/Users/andrewmagill/DEV/StitchSense/Mobile%20App/stitchsense-expo/src/providers/session-provider.tsx)
- [library-provider.tsx](/Users/andrewmagill/DEV/StitchSense/Mobile%20App/stitchsense-expo/src/providers/library-provider.tsx)
- [projects-provider.tsx](/Users/andrewmagill/DEV/StitchSense/Mobile%20App/stitchsense-expo/src/providers/projects-provider.tsx)

This is a good shape for the app.

### Main engineering concerns

#### A. `api.ts` is getting too large

Risk:

- harder to reason about
- easier to introduce schema regressions
- difficult to test by domain

Recommendation:

- split by domain:
  - auth api
  - library api
  - projects api
  - ravelry api
  - ai api
  - diagnostics api

#### B. Auth logic is powerful but brittle

Mixed platform + WordPress sign-in is absolutely useful, but it is also a risk area.

File:

- [session-provider.tsx](/Users/andrewmagill/DEV/StitchSense/Mobile%20App/stitchsense-expo/src/providers/session-provider.tsx)

Risks:

- confusing fallback paths
- subtle linkage failures
- difficult error attribution

Recommendation:

- explicitly log auth path chosen
- standardise auth error objects
- add regression tests for:
  - email sign-in
  - username sign-in
  - new account creation
  - onboarding-pending state
  - WordPress-only fallback

#### C. Backend workflow dependencies remain a major operational risk

Affected features:

- chat
- rewrite
- stitch vision
- some sync bridges

Risk:

- user-facing failure states depend on WordPress routes, n8n routes, secrets, and API bridge state

Recommendation:

- create a single backend dependency matrix
- create one environment verification script per deployment
- introduce “preflight checks” before release

#### D. Mobile/web data parity rules need to be codified, not just implemented ad hoc

You and the product have now established an important rule:

- web is master for certain sync paths

This needs to exist as a documented contract, not tribal knowledge.

Recommendation:

- add a short sync contract doc:
  - source of truth
  - conflict handling
  - deletion precedence
  - cache refresh rules

#### E. Feature-specific route failures must degrade better

Examples already seen in the project:

- 401 / 404 / 502 on AI features
- sync diagnostics ambiguity
- Stitch Vision route mismatch

Recommendation:

- every backend-dependent feature gets:
  - unavailable state
  - retry state
  - human-readable fallback
  - non-destructive failure mode

---

## 5. QA Test Plan

### A. Auth

- Sign in with email
- Sign in with username
- Sign up new user
- Sign out
- Reopen app with restored session
- Expired token refresh
- Wrong password
- Existing username on sign-up
- Existing email on sign-up

### B. Onboarding

- Brand slides render on smaller iPhones
- Functional setup slides fit without overlap
- Activation slides fit without overlapping CTA row
- Skip path works
- New-account onboarding appears only for newly created users
- Existing users skip onboarding appropriately
- Ravelry step works and failure path is readable

### C. Library

- Upload PDF pattern
- Upload large file
- Generated thumbnail appears in library card
- Open PDF inside intended flow
- Delete pattern on mobile and confirm web parity
- Delete pattern on web and confirm mobile re-sync removes it
- Re-sync from web after web deletions
- Search field works

### D. Ravelry

- Connect Ravelry
- Detect connected state
- Search results return reliably
- Preview opens correct listing
- Import purchased pattern
- Import non-purchased pattern
- Non-purchased pattern gets guarded messaging in chat/rewrite
- Imported pattern reflects in shared library

### E. AI Chat / Rewrite

- Chat on valid uploaded PDF pattern
- Rewrite on valid uploaded PDF pattern
- Chat on purchased/imported full pattern
- Chat on metadata-only Ravelry import
- Rewrite on metadata-only Ravelry import
- Ensure no pattern cross-contamination across consecutive sessions
- Markdown/HTML rendering is user-friendly and not raw

### F. Projects

- Create project from library-selected pattern
- Create multiple projects from same pattern
- Project inherits pattern-derived data if available
- Save deadline
- Save notes
- Add/delete counter
- Counter completion lock/alert behavior
- Save work log
- Add progress photo
- Full-view progress photo works
- Bookmark/reading position persists

### G. Stitch Vision

- Take photo
- Pick photo from library
- Submit question
- Response renders properly
- Unavailable route shows correct fallback
- Working route returns grounded result

### H. Sync diagnostics

- Linked account displays correctly
- Pattern/chat/rewrite counts match expected state
- “Not configured” is shown only when truly unconfigured
- refresh action updates values

---

## 6. Design System Checklist

### Already present

- color tokens
- spacing scale
- type scale
- radius scale
- shadow styles
- reusable cards
- reusable buttons
- hero component

### Still needed for consistency

- one shared form field component
- one shared segmented control component
- one shared empty state component
- one shared error state component
- one shared loading/skeleton pattern
- one shared section header pattern
- one modal/bottom-sheet surface standard

### Visual consistency checklist

- all screen titles use same scale rules
- all body copy uses same line-height rules
- all primary CTAs use same height/radius
- all secondary buttons use same contrast rules
- all cards use same padding family
- all list cards use same thumbnail sizing logic
- all destructive actions use same tone and wording

---

## 7. Mobile App Launch Checklist

### Product readiness

- [ ] Core journeys work end to end
- [ ] Non-purchased pattern guard is consistent
- [ ] Sync behaviour is documented and predictable
- [ ] Onboarding is complete and device-tested
- [ ] Subscription messaging is understandable

### UX/UI readiness

- [ ] No overlapping onboarding content
- [ ] No text overflow on key screens
- [ ] Empty states polished
- [ ] Errors readable and actionable
- [ ] Forms usable without frustration

### Engineering readiness

- [ ] Backend deployment procedure is stable
- [ ] WordPress plugin route parity confirmed
- [ ] n8n routes/secrets validated
- [ ] Sync diagnostics reliable
- [ ] Crash-free auth restore path validated

### Store readiness

- [ ] app icon final
- [ ] screenshots ready
- [ ] privacy policy final
- [ ] subscription copy final
- [ ] support/contact flow defined

---

## 8. Scrum Delivery Plan

### Sprint 1: Launch Hardening

Goal:
Make the current app trustworthy.

Scope:

- sync diagnostics accuracy
- project photo full-view reliability
- Stitch Vision route reliability
- auth/signup robustness
- onboarding responsive fixes
- account/troubleshooting separation

Definition of done:

- all launch-critical flows pass QA
- no known blocker in sync/auth/AI foundations

### Sprint 2: UX Consistency Pass

Goal:
Make the app feel cohesive and premium.

Scope:

- unify typography
- unify form fields
- unify buttons
- tighten hero density
- normalize empty/error/loading states
- reduce dense sections on account/project screens

Definition of done:

- app feels like one product, not several iterations stitched together

### Sprint 3: Project Experience Strengthening

Goal:
Make projects the daily-use anchor.

Scope:

- better project detail ergonomics
- clearer counter flows
- stronger notes/work-log usability
- reading position confidence
- photo/progress journey polish

Definition of done:

- projects feel genuinely useful for an active maker

### Sprint 4: Final Launch Prep

Goal:
Prepare for external beta / store submission.

Scope:

- beta scripts
- deployment validation docs
- support docs
- store assets
- entitlement/paywall QA
- analytics and crash review

Definition of done:

- the app is ready for a controlled beta with real users

---

## 9. Approval Checklist

Before launch, I would want explicit approval that the following are true:

- [ ] We accept the current sync model and have documented it clearly.
- [ ] We accept the current feature set as launch scope.
- [ ] We are comfortable with the reliability of chat, rewrite, and Stitch Vision.
- [ ] We have tested both new-user and existing-user onboarding.
- [ ] We have tested deletion and re-sync behaviour thoroughly.
- [ ] We have verified that non-purchased patterns never produce misleading AI answers.
- [ ] We have validated entitlement/admin override flows.
- [ ] We have decided which diagnostics/admin content remains visible in the release app.

---

## 10. Priority Actions

### P0 — Must fix before launch

1. Make sync diagnostics truthful and reliable in [account.tsx](/Users/andrewmagill/DEV/StitchSense/Mobile%20App/stitchsense-expo/app/(tabs)/account.tsx).
2. Stabilise Stitch Vision route integration between mobile, API, WordPress, and n8n.
3. Hard test and lock down “no cross-contamination” in chat/rewrite.
4. Validate signup/signin/new account onboarding paths end to end.
5. Finish responsive hardening of onboarding.

### P1 — Strongly recommended before launch

1. Split `api.ts` into domain modules.
2. Simplify and tier account screen content.
3. Standardise forms, buttons, and section components.
4. Improve project detail ergonomics and reduce dense vertical stacking.

### P2 — Can follow immediately after beta

1. deeper dashboard personalisation
2. richer project insights
3. better bookmark/highlight system
4. broader web parity for projects

---

## 11. Bottom Line

This is already a real app with a meaningful product. The foundation is not the problem anymore. The next challenge is discipline: tightening trust, coherence, and operational stability so the experience feels safe and polished every time.

If we handle the next phase as launch hardening rather than feature chasing, StitchSense Pro can absolutely become a strong, distinctive mobile product.
