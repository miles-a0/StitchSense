# StitchSense Performance Acceptance Plan

Use this during internal acceptance and before public rollout. Prefer real devices for final measurements.

## Target Flows

| Flow | Target | iOS result | Android result | Evidence / notes |
| --- | --- | --- | --- | --- |
| Cold start to first useful screen | No user-visible hang |  |  |  |
| Returning session restoration | No unnecessary sign-in loop |  |  |  |
| Library with long pattern list | Scroll and search remain usable |  |  |  |
| Large PDF pattern viewer | Opens and navigates without crash |  |  |  |
| Project with long history | Timeline/counters remain responsive |  |  |  |
| Stash with images | List/detail remain responsive |  |  |  |
| Pattern chat rendering | Long answers remain scrollable |  |  |  |
| Upload/indexing feedback | Clear progress without duplicate records |  |  |  |

## Resource Conditions

| Condition | Expected result | Evidence / notes |
| --- | --- | --- |
| Older iPhone / low memory | No launch-blocking crash |  |
| Representative Android phone | No launch-blocking crash |  |
| Slow network | Retry/error copy appears |  |
| Offline | Cached/session states degrade clearly |  |
| Low storage | Download/upload failure copy is clear |  |

## Decision

| Field | Value |
| --- | --- |
| Performance decision | Hold / Continue |
| Decision owner |  |
| Decision time |  |
| Follow-up issues |  |
