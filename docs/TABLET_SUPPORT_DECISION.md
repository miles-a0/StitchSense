# StitchSense Tablet Support Decision

The Stage 1 Expo configuration has iPad/tablet support disabled. This decision must remain explicit before store submission because enabling tablet support later expands screenshot and QA obligations.

## Decision Options

| Option | Pros | Cons | Launch impact |
| --- | --- | --- | --- |
| Ship phone only | Smaller QA and screenshot matrix | Tablet users cannot install as tablet-optimised app | Fastest path |
| Keep iPad/tablet support | Better reach, useful for pattern reading | Requires tablet layout, screenshots, accessibility, and performance acceptance | More QA before submission |
| Defer tablet optimisation but allow compatibility | Some availability without promising polished tablet UX | Risk of poor review if layouts are weak | Requires clear store evidence |

## QA Matrix

| Check | iPad / tablet result | Evidence / notes |
| --- | --- | --- |
| Dashboard and global menu layout |  |  |
| Library long list layout |  |  |
| Pattern viewer PDF/readability |  |  |
| Pattern chat/rewrite layout |  |  |
| Project detail and counters |  |  |
| Stash detail and photos |  |  |
| Paywall/purchase/restore |  |  |
| Dynamic text and accessibility |  |  |
| Store screenshots available |  |  |

## Decision

| Field | Value |
| --- | --- |
| Tablet decision | Phone only for Stage 1 |
| Config change required | `expo.ios.supportsTablet` set to `false` for the Stage 1 release candidate. |
| Decision owner | Product / release owner |
| Decision time | 2026-10-06 |
| Follow-up issues | Revisit tablet support after Stage 1 with a dedicated iPad/tablet layout, screenshot, accessibility, and performance pass. |
