# StitchSense Accessibility Audit Checklist

Use this with the physical-device acceptance matrix. Record screenshots or videos separately when they include account data.

## Static Code Pass (2026-10-11)

Code-only preparation. It does not replace the device checks below, which remain unexecuted.

| Item | Result |
| --- | --- |
| Icon-only touchables without an accessible name | Scanned every `Pressable`/`TouchableOpacity` in `app/`, `src/` and `components/`. 12 found and labelled: project pin toggles (as switches with checked state), pattern and making-assistant close buttons, making-assistant send (with busy/disabled state) and open buttons, project photo thumbnails, stash form close and stash item image. The only remaining match is the unused Expo template `components/ui/collapsible.tsx`. |
| Shared controls | `BrandButton` now exposes `disabled` and `busy` state. `SelectSheet` and `DeadlineSheet` options expose `selected` state, picker cells are named by column ("Day 12"), titles are headers, and tap-to-dismiss backdrops are named. `InlineBackButton` has an explicit button role. |
| Counter | Quick counter Rows/Stitches toggles expose `selected`, voice commands is a switch with `checked`, and the count is a polite live region. |
| Stitch Vision | Question input and photo preview are named; preset chips are buttons with a hint. |
| Reduced motion | `MotionView` and `BrandButton` both skip animation when `useReducedMotion()` is true. Device confirmation still required. |

## Screen Reader

| Check | iOS VoiceOver | Android TalkBack | Evidence / notes |
| --- | --- | --- | --- |
| Sign-in and onboarding focus order |  |  |  |
| Global menu tab and sheet labels |  |  |  |
| Library filters and pattern cards |  |  |  |
| Pattern viewer actions, including download |  |  |  |
| Pattern chat/rewrite inputs and send actions |  |  |  |
| Project counters and destructive actions |  |  |  |
| Stash forms and image actions |  |  |  |
| Paywall purchase and restore buttons |  |  |  |

## Visual And Motion

| Check | Result | Evidence / notes |
| --- | --- | --- |
| Tap targets are usable on small phones |  |  |
| Dynamic text does not hide critical actions |  |  |
| Contrast is readable in launch-critical flows |  |  |
| Reduced motion avoids non-essential animation |  |  |
| Error states use text, not colour alone |  |  |
| Menu tab can be repositioned away from important content |  |  |

## Decision

| Field | Value |
| --- | --- |
| Accessibility decision | Hold / Continue |
| Decision owner |  |
| Decision time |  |
| Follow-up issues |  |
