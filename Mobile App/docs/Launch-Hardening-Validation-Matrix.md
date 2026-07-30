# Launch Hardening Validation Matrix

Use this as the working QA sheet for the current launch-hardening phase.

The goal is simple:

- prove that account creation and onboarding are reliable
- prove that web/mobile sync obeys the current master-data rule
- prove that pattern-aware AI never cross-contaminates
- prove that metadata-only imports do not fabricate knowledge
- prove that Stitch Vision, chat, and rewrite behave consistently against the
  live VPS stack

## Rules for this phase

1. Web/platform data is the master record where shared sync is involved.
2. Pattern-aware tools must act on the explicitly opened pattern only.
3. Metadata-only Ravelry imports must block AI actions instead of guessing.
4. English output is the expected result for summaries, chat, rewrite, and
   Stitch Vision where translation is needed.
5. A test is not complete until the result has been checked on both:
   - Expo mobile app
   - WordPress/web app where the flow is shared

## Environment checklist

Before running the matrix, confirm:

- latest WordPress plugin is uploaded
- latest `stitchsense-api` is deployed
- Expo app is running from the latest local code
- WordPress platform bridge is enabled and configured
- `WORDPRESS_BRIDGE_SHARED_SECRET` matches between plugin and API
- Ravelry connection works for the test account
- live n8n webhooks are reachable from the API

## Test accounts

Maintain at least these accounts during validation:

1. `admin`
   - WordPress administrator
   - Ravelry-connected
   - shared sync enabled

2. `subscriber_full_pattern`
   - regular subscriber
   - at least one uploaded PDF pattern
   - at least one purchased Ravelry pattern with usable source text

3. `subscriber_metadata_only`
   - regular subscriber
   - at least one imported Ravelry listing without purchased pattern content

4. `fresh_signup`
   - brand-new account created through the Expo signup flow

## A. Signup / Signin / Onboarding

### A1. New account creation in Expo

Steps:

1. Open Expo app in a clean state.
2. Choose `New Account`.
3. Create a new user with email, username, and password.
4. Confirm account is created without touching WordPress UI directly.
5. Confirm the user is signed in immediately after creation.
6. Confirm onboarding starts automatically for the newly created account.

Expected:

- no 404 or bridge errors
- WordPress subscriber account is created
- Expo session is authenticated
- onboarding appears exactly once

### A2. Returning sign-in

Steps:

1. Log out from Expo.
2. Sign back in with the same user.

Expected:

- sign-in succeeds
- onboarding does not replay for a returning user
- library and account data reload cleanly

### A3. Reinstalled-app flow

Steps:

1. Delete app data or reinstall Expo app state.
2. Sign in again with an existing user.

Expected:

- sign-in succeeds
- linked account and synced patterns reload
- onboarding behavior matches the intended policy:
  - replay only if explicitly pending
  - otherwise skip

## B. WordPress Link / Sync Diagnostics

### B1. Diagnostics for linked account

Test user:

- `admin`

Steps:

1. Sign into Expo with a known WordPress-linked account.
2. Open `Account`.
3. Refresh sync diagnostics.

Expected:

- WordPress bridge shows configured
- account link shows linked
- site URL is present
- WordPress user id is present
- synced bucket counts are nonzero when relevant

### B2. Diagnostics after re-sync

Steps:

1. Create or remove a synced pattern on web.
2. Trigger mobile re-sync.
3. Refresh diagnostics again.

Expected:

- counts update truthfully
- no stale “not configured” or “not linked” state remains

## C. Web-as-Master Sync Rules

### C1. Web upload then mobile open

Steps:

1. Upload a pattern in WordPress.
2. Open mobile library.
3. Trigger re-sync if needed.
4. Open the pattern in mobile.

Expected:

- pattern appears on mobile
- detail screen loads
- viewer opens

### C2. Mobile upload then web open

Steps:

1. Upload a pattern from mobile.
2. Confirm it appears in mobile library.
3. Open the synced library on web.

Expected:

- same pattern appears on web
- file is viewable on web

### C3. Web delete then mobile re-sync

Steps:

1. Delete a synced pattern from web.
2. Open mobile library.
3. Trigger re-sync.

Expected:

- deleted item is removed from mobile
- mobile does not resurrect the deleted pattern back into web

### C4. Mobile delete then web reflect

Steps:

1. Delete a synced pattern from mobile.
2. Open web library.

Expected:

- pattern disappears on web too
- shared sync remains consistent

## D. Pattern Isolation / Contamination Matrix

### D1. Chat contamination: pattern A then B

Use:

- two clearly different full-source patterns

Steps:

1. Open pattern A.
2. Ask a question whose answer is unmistakably tied to A.
3. Leave chat.
4. Open pattern B.
5. Ask what the pattern is making, how it starts, or what yarn it uses.

Expected:

- response references B only
- no mention of A title, garment type, yarn, or summary

### D2. Rewrite contamination: pattern A then B

Steps:

1. Open pattern A and run a rewrite prompt.
2. Leave rewrite flow.
3. Open pattern B and run a different rewrite prompt.

Expected:

- rewrite references B only
- no prior pattern terms or structure leak through

### D3. Relaunch contamination

Steps:

1. Open pattern A chat.
2. Close Expo app fully.
3. Reopen app.
4. Open pattern B chat directly.

Expected:

- no stale draft, session, or pattern summary from A appears in B

### D4. Project-linked contamination

Steps:

1. Create two projects linked to two different patterns.
2. Open project A chat.
3. Then open project B rewrite.

Expected:

- each route binds to its linked pattern only
- project A context never appears in project B

## E. Metadata-Only Pattern Safety

### E1. Metadata-only chat block

Steps:

1. Open a metadata-only Ravelry import.
2. Ask a pattern-specific question.

Expected:

- block message appears
- message is explicit and short
- optional buy/open-on-Ravelry action works if available

### E2. Metadata-only rewrite block

Steps:

1. Open the same metadata-only pattern.
2. Attempt rewrite.

Expected:

- rewrite is blocked with the same purchase/re-import rule

### E3. Metadata-only summary safety

Steps:

1. Import a metadata-only pattern.
2. Inspect detail summary state on web and mobile.

Expected:

- no fabricated “understanding” summary is generated
- app does not imply it has parsed source instructions it does not have

## F. English Output Validation

### F1. Non-English source summary

Use:

- a real non-English source pattern with full usable content

Steps:

1. Open pattern detail.
2. Inspect summary.

Expected:

- summary is rendered in English

### F2. Non-English source chat

Steps:

1. Ask a question about the same pattern.

Expected:

- answer is in English

### F3. Non-English source rewrite

Steps:

1. Rewrite the same pattern.

Expected:

- result is in English

## G. Stitch Vision Reliability

### G1. Existing photo upload

Steps:

1. Choose a photo from library.
2. Ask a stitch question.
3. Run analysis.

Expected:

- request succeeds
- no 401 / 404 / 502
- response is rendered cleanly without raw markdown noise

### G2. Camera capture

Steps:

1. Take a fresh photo inside Stitch Vision.
2. Analyse it.

Expected:

- image uploads successfully
- analysis returns

## H. Final Launch Gate

A build passes this phase only if:

- no reproducible cross-pattern contamination remains
- metadata-only imports never fabricate AI understanding
- signup, signin, and onboarding work end to end
- sync diagnostics tell the truth for linked users
- web-master re-sync rules behave correctly
- Stitch Vision works from live device photo input

## Run Log

Use this section during manual QA:

| Date | Tester | Area | Account | Result | Notes |
| --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |
