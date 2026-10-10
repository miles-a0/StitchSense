# StitchSense Engineering Instructions

Follow the global Zu Coding Standard in addition to these project-specific instructions.

## Project Principle

StitchSense is an established knitting and crochet application.

Protect existing functionality.

Do not perform broad rewrites while implementing isolated features or fixes.

Understand the existing architecture and data flow before changing it.

## Application Areas

The project includes multiple cooperating systems, including:

- Expo / React Native mobile application;
- backend API;
- PostgreSQL;
- object storage;
- WordPress integration;
- n8n workflows;
- AI/RAG services;
- external integrations such as Ravelry;
- authentication and entitlement systems.

Treat boundaries between these systems as explicit contracts.

Do not casually move responsibilities between them.

## User Isolation

User data is private and must remain strictly scoped to its owner.

For user-owned resources always consider:

- authentication;
- ownership;
- cross-user access;
- deleted resources;
- stale identifiers;
- entitlement requirements.

Never trust a client-supplied resource ID as proof of ownership.

Where appropriate, deliberately test attempts to access another user's resource.

## Entitlements

Features requiring paid/trial/manual entitlement must remain gated.

Do not bypass entitlement checks to fix downstream functionality.

Test both permitted and denied access when changing entitlement-controlled routes.

## Pattern Context

Pattern-specific AI operations must remain scoped to the selected pattern.

Avoid any possibility of context leaking between Pattern A and Pattern B.

When modifying:
- pattern chat;
- rewrites;
- summaries;
- uploads;
- RAG retrieval;
- Stitch Vision;

verify that the correct user and pattern context is propagated throughout the request.

## AI and n8n Workflows

Treat AI workflow calls as unreliable external-service boundaries.

Preserve established payload contracts unless intentionally changing both sides.

When modifying workflow requests:
- inspect existing payload fields first;
- preserve backwards-compatible fields where required;
- maintain user/pattern identifiers;
- maintain shared-secret authentication;
- validate returned data;
- handle workflow failure explicitly.

Do not silently discard useful error information.

Where an intentional fallback exists, preserve and test it.

## WordPress Bridge

The WordPress bridge is an external trust boundary.

Use configured/trusted WordPress endpoints.

Do not construct trusted upstream destinations from user-controlled metadata.

Preserve bridge authentication headers and secrets.

Distinguish between:
- expected fallback conditions;
- upstream errors that should be surfaced;
- authentication/configuration errors.

Do not turn every WordPress error into a fallback.

## Uploads

Uploads are multi-stage operations and may involve:

1. local/client selection;
2. resource creation;
3. file upload;
4. object storage;
5. indexing;
6. summary generation;
7. persistence;
8. UI context update.

Consider partial failure at every stage.

If an operation creates a private resource and a later required step fails, clean up or roll back that resource when appropriate.

Do not leave avoidable orphan records/files.

## Ravelry

Preserve the distinction between metadata and pattern content.

Do not treat metadata for a paid pattern as if StitchSense possesses the pattern's actual content.

Maintain ownership and import guards.

Do not allow stale synchronisation data to resurrect intentionally deleted local records.

## Mobile / Expo

Keep screens focused primarily on presentation and interaction.

When complicated workflows become independently testable, prefer extracting them into focused library modules rather than growing already-large screen components.

Reuse:
- API helpers;
- providers;
- models/types;
- theme tokens;
- shared UI components;
- established error handling.

Preserve user-facing loading, processing and failure feedback.

## Local Machine Compatibility

The project owner uses an older local development machine.

When changing local development requirements:
- avoid raising Node, npm, Expo, Xcode, Android Studio, Docker, or simulator requirements unless the release target genuinely requires it;
- prefer Expo Go and lightweight local checks where they remain compatible with the target SDK;
- keep heavy builds, GPU/AI workloads, large container runs, and long integration suites runnable from CI, staging, or a remote pod rather than requiring them on the local machine;
- document any unavoidable local requirement change with the exact version and reason;
- after SDK or tooling upgrades, verify the app still has a practical low-resource development path.

## Backend

Follow existing route patterns.

For protected routes consider:
- authentication;
- ownership;
- entitlement;
- request validation;
- persistence;
- upstream calls;
- failure status;
- information leakage.

Prefer parameterised SQL.

Do not weaken guards for convenience.

## Database

Respect existing migrations and schema conventions.

Never modify production schema manually as a substitute for a migration.

Preserve referential integrity.

Consider:
- deletion behaviour;
- ownership;
- timestamps;
- JSONB shape;
- sync behaviour;
- backwards compatibility.

## Object Storage

Treat stored files as private unless explicitly designed otherwise.

Signed/download URLs must remain appropriately scoped.

Validate ownership before granting file access.

Do not expose internal storage credentials or unrestricted object paths.

## Testing Style

StitchSense values realistic behavioural and integration coverage.

When changing backend routes, test important combinations such as:

- unauthenticated request;
- valid owner request;
- cross-user request;
- entitlement denial;
- invalid payload;
- expected upstream call;
- upstream failure;
- intended fallback;
- persistence result.

For multi-stage mobile workflows, test:
- successful sequence;
- failure at meaningful intermediate stages;
- rollback;
- fallback;
- resulting user-visible state.

Prefer tests that exercise real application boundaries where practical rather than excessive mocking of internal implementation.

## Test Safety

Integration tests must never accidentally operate against production infrastructure.

Retain explicit safeguards for test databases and test services.

Restore global mocks and close:
- application instances;
- database connections;
- storage clients;
- temporary resources;

after tests.

## Refactoring

Refactor when it provides a concrete benefit such as:

- making behaviour independently testable;
- removing substantial duplication;
- isolating complex workflow logic;
- fixing a demonstrated architectural problem.

Do not combine a feature request with unrelated cleanup.

If existing behaviour is being extracted rather than changed, preserve it first and prove that preservation with tests.

## Completion

Before declaring a StitchSense change complete:

1. inspect the final diff;
2. run relevant unit tests;
3. run relevant integration tests where infrastructure permits;
4. run TypeScript/type checks;
5. check affected API contracts;
6. consider user isolation and entitlement regression;
7. consider pattern-context contamination;
8. verify failure paths for external integrations.

Do not describe work as production-ready if required verification remains outstanding.
