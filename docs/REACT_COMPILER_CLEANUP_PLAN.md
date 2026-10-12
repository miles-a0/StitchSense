# StitchSense React Compiler Cleanup Plan

Expo SDK 57 enables stricter React Compiler lint checks than the app previously satisfied. The release gate keeps standard Expo linting active, but temporarily disables two compiler rules in `Mobile App/stitchsense-expo/eslint.config.js` so production-readiness work can continue without a broad screen rewrite.

## Current Suppressions

| Rule | Why suppressed | Launch risk |
| --- | --- | --- |
| `react-hooks/set-state-in-effect` | Existing screens and providers synchronously derive view state inside effects | Medium: can cause extra renders and fragile effect order |
| `react-hooks/preserve-manual-memoization` | Existing memoized values and callbacks do not all satisfy the compiler's dependency model | Medium: can hide stale dependency or unnecessary recompute issues |

## Cleanup Order

1. Start with app-wide providers and navigation wrappers because they affect every screen.
2. Refactor heavily used library, project, stash, and pattern screens next.
3. Keep feature behaviour unchanged while extracting independently testable selection/state logic.
4. Re-enable one rule at a time in a short-lived branch.
5. Run `npm run lint`, `npm run typecheck`, and `npm test -- --runInBand` from `Mobile App/stitchsense-expo` after each cleanup slice.

## Guardrails

- Do not remove loading, empty, failure, entitlement, or destructive-confirmation states while chasing lint cleanup.
- Do not move pattern-specific chat/rewrite state into global caches unless the selected pattern ID remains explicit.
- Do not introduce a new local development requirement; Expo Go must remain a practical smoke-test path on the project owner's older Mac.
- Prefer small state-shape changes over broad screen rewrites.

## Exit Criteria

| Gate | Evidence |
| --- | --- |
| `react-hooks/set-state-in-effect` re-enabled | Lint output and focused notes for touched screens |
| `react-hooks/preserve-manual-memoization` re-enabled | Lint output and focused notes for touched screens |
| Navigation/menu unaffected | Device or simulator smoke evidence |
| Pattern context unaffected | Existing pattern chat/rewrite tests still pass |

## Decision

| Field | Value |
| --- | --- |
| Cleanup owner |  |
| Target release |  |
| Rules re-enabled |  |
| Remaining exceptions |  |
