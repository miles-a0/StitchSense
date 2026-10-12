# StitchSense Device Acceptance Matrix

Use this matrix for the internal acceptance pass before TestFlight, Play Internal Testing, or production submission. Record evidence outside this file when it contains screenshots, account details, store-console views, or customer-like data.

Use `docs/ACCESSIBILITY_AUDIT_CHECKLIST.md` for focused screen-reader/accessibility evidence and `docs/PERFORMANCE_ACCEPTANCE_PLAN.md` for performance evidence.

## Test Builds

| Field | iOS | Android |
| --- | --- | --- |
| Build profile |  |  |
| Build ID / artifact |  |  |
| App version / build number |  |  |
| API environment | Staging / Production | Staging / Production |
| Device and OS |  |  |
| Tester |  |  |
| Date |  |  |

## Smoke Flows

| Flow | iOS result | Android result | Evidence / notes |
| --- | --- | --- | --- |
| Fresh install opens without cached session |  |  |  |
| Onboarding completes |  |  |  |
| Login succeeds |  |  |  |
| Returning-user restoration after force quit |  |  |  |
| Returning-user restoration after reinstall |  |  |  |
| Library loads and refreshes |  |  |  |
| Ravelry metadata import handles owned/free and paid metadata-only cases |  |  |  |
| Pattern upload indexes and appears in Library |  |  |  |
| Pattern viewer opens and download action is available |  |  |  |
| Pattern chat stays scoped to the selected pattern |  |  |  |
| Pattern rewrite stays scoped to the selected pattern |  |  |  |
| Project create/update/delete |  |  |  |
| Counter, marker, work-log, and project photo flows |  |  |  |
| Stash create/update/delete and stash photo flows |  |  |  |
| Stitch Vision with camera capture |  |  |  |
| Stitch Vision with photo-library image |  |  |  |
| RevenueCat monthly purchase |  |  |  |
| RevenueCat annual purchase |  |  |  |
| Restore purchase after reinstall |  |  |  |
| Cancelled purchase gives stable copy |  |  |  |
| Pending purchase gives stable copy |  |  |  |
| Logout clears local session |  |  |  |
| Account deletion guidance mentions App Store / Google Play subscription management |  |  |  |

## Offline, Slow Network, And Recovery

| Scenario | iOS result | Android result | Evidence / notes |
| --- | --- | --- | --- |
| App opens while offline with no session |  |  |  |
| App opens while offline with saved session |  |  |  |
| API timeout surfaces retry guidance |  |  |  |
| Interrupted pattern upload rolls back or clearly recovers |  |  |  |
| Interrupted project/stash photo upload recovers without orphan UI state |  |  |  |
| Expired access token refreshes or returns to sign-in |  |  |  |
| Low-storage device download/upload failure shows clear copy |  |  |  |
| Background/resume during upload or chat request does not duplicate records |  |  |  |

## Accessibility And Layout

| Check | iOS result | Android result | Evidence / notes |
| --- | --- | --- | --- |
| VoiceOver/TalkBack labels for primary navigation |  |  |  |
| VoiceOver/TalkBack labels for destructive actions |  |  |  |
| Focus order on sign-in, Library, project, pattern, stash, and paywall screens |  |  |  |
| Tap targets are usable on small phones |  |  |  |
| Dynamic text does not obscure critical actions |  |  |  |
| Reduced-motion setting avoids non-essential animation |  |  |  |
| Colour contrast remains readable in primary flows |  |  |  |
| Menu side tab can be repositioned away from screen content |  |  |  |
| Menu sheet is reachable from nested project, stash, pattern, and tool screens |  |  |  |

## Decision

| Field | Value |
| --- | --- |
| Acceptance decision | Hold / Continue |
| Decision owner |  |
| Decision time |  |
| Follow-up issues |  |
