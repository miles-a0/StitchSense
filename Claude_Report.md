# StitchSense — Independent Launch Readiness Report

**Prepared by:** Claude (acting as Release Manager / QA & Engineering Lead)
**Date:** 9 October 2026
**Repository state assessed:** branch `test/chat-history-route-coverage`, HEAD `d7859b2` (21 September 2026), plus 59 modified and 54 untracked working-tree files
**Scope:** Expo mobile app, backend API, PostgreSQL schema, object storage, WordPress plugin bridge, n8n/RAG workflows, CI/CD, release documentation, store and billing readiness, market position

---

## 1. Executive Summary

StitchSense is a genuinely impressive piece of engineering that is **not ready to ship**, and the gap between those two statements is the most important thing in this report.

The codebase is better than most pre-launch products I would expect to review. The backend is deliberately hardened, the data model is sound, user isolation is designed in rather than bolted on, and the CI pipeline is more rigorous than many funded teams run. There is no technical-debt crisis here, no abandoned half-features, and not a single `TODO` or `FIXME` in ~37,600 lines of application TypeScript.

The problem is that **the project has been measuring progress by documentation rather than by evidence**, and in the last three weeks that drift has produced four hard blockers that would stop a release today:

1. **The production Docker image cannot be built.** I proved this by reproducing the Docker build context in isolation. An uncommitted change routed `npm run build` and `npm start` through `tools/run-with-node22.sh`, which sits outside the image's build context. The build step fails with `No such file or directory`. The backend therefore cannot be deployed, and CI's `production-image` gate cannot pass.
2. **CI cannot pass from a clean checkout.** Every quality gate added during the hardening work depends on files that were never committed — the Node wrapper script, the monitoring rules, the dashboard JSON, the artifact validators, the smoke script, and the release-config validator are all untracked. The claim of green CI is currently unverifiable.
3. **A live shared secret is committed to the repository** in plaintext inside two tracked n8n workflow exports, and all AI/vector traffic runs over **unencrypted HTTP to a bare public IP address**.
4. **Store release has not started.** No EAS project linkage, no RevenueCat SDK keys, no store products, no payout banking, no published legal URLs, no screenshots. The release-config gate fails today.

Underneath those, ~35 release-evidence documents have been written to a high standard and are **almost entirely empty**. The device acceptance matrix has 61 evidence rows and zero recorded results. No physical device testing, no store purchase testing, no staging reconciliation, no backup verification, and no operational rehearsal has been performed.

**Verdict: the engineering is roughly 80% done; the launch is roughly 35% done. Overall production readiness is 60%.**

**Realistic earliest public launch: 8–11 weeks from today**, assuming one focused developer and no surprises in store review. A launch attempt inside 4 weeks would carry a high probability of either store rejection or a live incident involving billing or user data.

---

## 2. What I Actually Verified

I did not take the project's own status documents at face value. The following was executed or inspected directly.

| Check | Command / method | Result |
|---|---|---|
| Backend build + test suite | `npm test` (backend) | **0 failures.** 61 tests: 33 pass, 28 skipped locally (no Postgres/MinIO) |
| Expo unit tests | `npm test` (Expo) | **60/60 pass** |
| Expo TypeScript | `npm run typecheck` | **Clean** |
| Expo lint | `npm run lint --max-warnings=0` | **Clean** |
| Release config gate | `npm run check:release-config` | **FAILS** — iOS and Android RevenueCat keys unconfigured |
| Production image build | Reproduced Docker build context in isolation | **FAILS** — build script unreachable from context |
| CI dependency integrity | `git ls-files` against every file referenced by `ci.yml` | **7 of 8 untracked** |
| Git recoverability | `git status`, `git rev-list` | 59 modified + 54 untracked files; HEAD is 18 days stale |
| Secret exposure | Targeted grep of tracked JSON/PHP | **1 live shared secret found in 2 tracked files** |
| Transport security | Grep for non-HTTPS endpoints in workflows | **3 cleartext HTTP endpoints on a public IP** |
| Accessibility coverage | Annotation density across all screens | 19 labels / 39 roles / 3 hints against **360 touchables** |
| Evidence completeness | Result-column population across 10 evidence docs | **Substantively empty** |
| Entitlement enforcement | Audit of `hasFeature` across all routes | **Consistently applied** to every paid route |
| Pattern isolation | Traced payload construction in chat and vision routes | Chat: **correct**. Vision: **defective** (see F-04) |

Docker is not installed on this machine, so I could not run `docker build` end to end. I proved the failure instead by replicating the build context exactly — copying only the files the `COPY . .` instruction can see — and running the Dockerfile's build step, which failed as predicted. The conclusion follows from Docker's build-context semantics and does not depend on the local environment.

---

## 3. Overall Readiness Score

Scored against the weighting the project set for itself in `docs/PRODUCTION_READINESS_ACTION_PLAN.md`.

| Area | Weight | Score | Weighted | Assessment |
|---|---:|---:|---:|---|
| Core product journeys and UX | 25% | 70% | 17.5 | Feature-complete and coherent; zero device validation; accessibility materially incomplete |
| Backend, data, and sync correctness | 20% | 72% | 14.4 | Strong schema and ownership model; no staging; sync correctness unproven end to end |
| Security and privacy | 20% | 62% | 12.4 | Excellent API hardening undermined by a committed secret, cleartext AI transport, and one isolation defect |
| Automated testing and build quality | 15% | 55% | 8.3 | Well-designed CI that cannot currently run; no E2E; 7,911 lines of PHP with no tests |
| Deployment, observability, and recovery | 10% | 45% | 4.5 | Runbooks written, nothing rehearsed; crash reporting absent; image unbuildable |
| Billing, legal, and store release | 10% | 30% | 3.0 | Mature code, but no store, console, legal, or payout configuration exists |
| **Overall** | **100%** | | **60%** | |

For reference, the project's own last recorded baseline was **52% (28 August 2026)**. Real progress has been made — roughly eight points in six weeks — but the recent weeks produced documentation and regressions rather than closed gates.

### Completion by workstream (the project's own gates)

| Workstream | Gates closed | % | Honest status |
|---|---|---:|---|
| 1. Recoverable baseline | 6/7 | 86% → **65%** | Formally near-complete, but the working tree is not committed or pushed, so the baseline is not actually recoverable |
| 2. Critical security risks | 9/9 | 100% → **75%** | WordPress bridge work is genuinely done; three new findings are now open |
| 3. Deterministic builds and gates | 5/6 | 83% → **50%** | CI is excellently designed but cannot pass from a clean checkout |
| 4. Automated test suite | 1/6 | 17% | 48 test files, ~7,850 test lines; no E2E, no component tests, no PHP tests |
| 5. Data and sync correctness | 0/7 | **0%** | No staging environment exists. Nothing reconciled |
| 6. Compliant native subscriptions | 4/10 | 40% | Client and webhook code mature; no store or console setup |
| 7. Device, accessibility, UX hardening | 0/6 | **0%** | No device has run a release build |
| 8. Deployment and operations | 4/8 | 50% | Metrics and alert rules exist; crash reporting and routing do not |
| 9. Legal, privacy, support, store materials | 1/6 | 17% | Drafted thoroughly; nothing published or approved |
| 10. Controlled beta and rollout | 0/8 | **0%** | Not started |

**Aggregate: 30 of 73 gates closed (41%).** Against the more granular Stage 1 plan: **25 of 129 items (19%)**.

### Stage gate status

| Stage | State | % | Blocking condition |
|---|---|---:|---|
| **Stage A — Engineering build** | Near complete | **85%** | 4,393-line screen; vision route validation; register duplicate handling |
| **Stage B — Buildable & deployable artifact** | **Broken** | **40%** | Docker build fails; no EAS project; no OTA channel; untracked CI deps |
| **Stage C — Verified correctness** | Partial | **55%** | Integration tests exist but only run in CI; no E2E; PHP untested |
| **Stage D — Staging & data proof** | Not started | **5%** | No staging environment |
| **Stage E — Device acceptance** | Not started | **2%** | No signed build has run on hardware |
| **Stage F — Billing & store** | Not started | **15%** | No products, keys, banking, or console entries |
| **Stage G — Legal & privacy** | Drafted only | **35%** | No public URLs; no approvals; labels not submitted |
| **Stage H — Operations & monitoring** | Partial | **45%** | No crash reporting; no alert routing; no rehearsals |
| **Stage I — Beta** | Not started | **0%** | Depends on B–H |
| **Stage J — Public release** | Not started | **0%** | Depends on all above |

---

## 4. Launch Blockers (P0 — must fix before any build)

### F-01 — Production Docker image cannot be built · Severity: Critical · Confirmed

The uncommitted working tree changed the backend's `build` and `start` scripts to invoke `bash ../../../tools/run-with-node22.sh`. The Docker build context is `Mobile App/backend/stitchsense-api`, so `../../../tools/` resolves outside the context and is never copied by `COPY . .`.

```
> stitchsense-api@0.1.0 build
> bash ../../../tools/run-with-node22.sh npx tsc -p tsconfig.json
bash: ../../../tools/run-with-node22.sh: No such file or directory
```

Consequences: the image build fails; CI's `production-image` job fails; `CMD ["npm", "start"]` would fail even if the image built. The previously deployed images predate this change and used plain `node dist/server.js`.

**Fix:** keep container-safe scripts in `package.json` (`"build": "tsc -p tsconfig.json"`, `"start": "node dist/server.js"`) and move the Node-22 wrapper to separate developer-only scripts (`build:local`, `start:local`). The wrapper exists for local-machine compatibility, so it belongs outside the container path, not inside it.

**Effort:** under 1 hour. **Verification:** CI's `production-image` job must go green.

### F-02 — Release source is not committed, pushed, or CI-verifiable · Severity: Critical · Confirmed

HEAD is dated 21 September 2026. The working tree holds 59 modified files (+4,051/−3,530) and 54 untracked files — roughly three weeks of release-hardening work. The untracked set includes every file CI depends on:

| File referenced by `ci.yml` | Tracked? |
|---|---|
| `tools/run-with-node22.sh` | **No** |
| `tools/validate-production-artifacts.mjs` | **No** |
| `tools/validate-mobile-release-artifacts.mjs` | **No** |
| `ops/monitoring/stitchsense-alerts.yml` | **No** |
| `ops/monitoring/stitchsense-dashboard.json` | **No** |
| `Mobile App/backend/scripts/smoke-api.sh` | **No** |
| `Mobile App/stitchsense-expo/scripts/validate-release-config.mjs` | **No** |

Also untracked: `AGENTS.md`, the app icon, the Android adaptive foreground, the splash logo, `secureCompare.ts`, four backend test files, two Expo test files, and all 35 Stage 1 evidence documents.

This directly contradicts Workstream 1's exit gate ("the entire release source is versioned and remotely recoverable"). A disk failure today would destroy three weeks of work, and no gate has ever executed against this code.

**Fix:** commit the hardening changeset in reviewable slices, push, open a PR, and let CI run from a clean checkout. Treat the first green CI run as the real Track 0 exit gate.

**Effort:** 1 day including fixing whatever CI surfaces. **This must happen before any other item on this list is meaningful.**

### F-03 — Live shared secret committed to the repository · Severity: Critical · Confirmed

Two **tracked** files at the project root contain the n8n webhook shared secret as a plaintext string literal:

- `StitchSense Chat API - Qdrant RAG + Client History - UK Metric.json`
- `Pattern Helper AI - RAG Chat API - v7.6.0 - Google Drive Storage.json`

The value appears inside the workflow's `Validate Request` node as a hardcoded `expectedSecret` comparison. It is in git history, so rewriting the files does not remove it. The Gitleaks CI gate does not flag it because the value does not match a provider-specific rule.

Note the asymmetry: the backend requires this class of secret to be ≥32 characters and validated at startup, and compares the WordPress and RevenueCat secrets in constant time. The n8n side undoes that care with a literal in source control.

**Fix:**
1. Rotate the secret in n8n and in `N8N_SHARED_SECRET` / `N8N_CHAT_SHARED_SECRET` / `N8N_UPLOAD_SHARED_SECRET`.
2. Change the workflow nodes to read `$env.N8N_SHARED_SECRET` and use a length-safe comparison.
3. Re-export the workflows with secrets removed and commit the sanitised versions.
4. Add a Gitleaks custom rule for this secret shape so the gate catches a recurrence.
5. Treat the old value as permanently compromised.

**Effort:** half a day.

### F-04 — Vision route forwards unvalidated client input into the AI workflow · Severity: Critical · Code defect confirmed; exploitability requires verification

`Mobile App/backend/stitchsense-api/src/routes/vision.ts:22-33` is the only route that spreads the raw request body into an outbound AI payload:

```ts
const body = request.body && typeof request.body === 'object' ? (request.body as Record<string, unknown>) : {};
const payload = { ...body, /* a few fields overridden */ user_id: request.authUser.id };
```

It has no Zod schema — the only protected route in the codebase without request validation.

Why this matters: the n8n chat workflow builds its Qdrant retrieval filter from `project_id`, `file_id`, or `job_id` **with no user constraint**:

```js
function buildScopeFilter() {
  if (req.project_id) return { must: [{ key: 'project_id', match: { value: req.project_id } }] };
  if (req.file_id)    return { must: [{ key: 'file_id',    match: { value: req.file_id    } }] };
  if (req.job_id)     return { must: [{ key: 'job_id',     match: { value: req.job_id     } }] };
  ...
  return null;
}
```

All users' pattern chunks share a single Qdrant collection (`knitting_knowledge`). The `image` workflow type falls back to the chat URL (`config.n8n.imageUrl || config.n8n.chatUrl`). So an authenticated, entitled user who posts a `file_id` or `job_id` belonging to another user may receive an answer grounded in that user's pattern content.

This is exactly the failure mode `AGENTS.md` prohibits: *"Never trust a client-supplied resource ID as proof of ownership"* and *"Avoid any possibility of context leaking between Pattern A and Pattern B."*

To be precise about what is and is not established: the code defect and the unconstrained filter are both confirmed in the repository. Whether the path is live depends on the deployed `N8N_IMAGE_URL`, on whether the deployed workflows match these exports (dated June/July 2026 and likely stale), and on the WordPress image proxy being bypassed. I could not test against production.

Two further notes on the same mechanism:
- When no scope key is present and `answer_mode` is not `pattern_priority`, `buildScopeFilter()` returns `null` and Qdrant runs an **unfiltered similarity search across the entire collection**. General helper-chat answers can therefore surface chunks from any user's uploaded pattern.
- The backend carefully constructs a scoped namespace (`buildScopedWorkflowUserId` → `pattern:{userId}:{patternId}:{sessionId}`) and sends it as `user_id`, but **the workflow never uses it for retrieval filtering**. That design intent is not honoured downstream.

**Fix:**
1. Add a Zod schema to `/vision/analyse`; accept only `question`, `image_data_uri`, `mime_type`, `skill_level`, and an optional server-verified `pattern_id`. Never spread the body.
2. Resolve `project_id` / `file_id` / `job_id` server-side from an ownership-checked row, exactly as `chats.ts` already does correctly.
3. Add `user_id` (or the scoped namespace) as a mandatory `must` clause in every Qdrant filter, and make an absent scope fail closed rather than searching globally.
4. Re-export and commit the corrected workflows.
5. Add a regression test that posts another user's `file_id` to `/vision/analyse` and asserts rejection — the `AGENTS.md` cross-user test pattern.

**Effort:** 1–2 days including workflow changes and tests. **This is the highest-impact finding in the report.**

### F-05 — AI and vector traffic runs unencrypted over the public internet · Severity: Critical · Confirmed

The workflow exports call these endpoints over plain HTTP at a bare public IP (Contabo range):

| Endpoint | Purpose |
|---|---|
| `http://173.249.40.161:2010/api/embeddings` | Text embedding (receives pattern text) |
| `http://173.249.40.161:6333/collections/knitting_knowledge/points/search` | Vector search |
| `http://173.249.40.161:6333/.../points/scroll` | Bulk chunk retrieval (returns pattern content) |
| `http://173.249.40.161:8990` | Secondary service in the older workflow |

User pattern content — including purchased copyrighted PDFs — transits in cleartext. This contradicts the backend's own production rule that every n8n URL must be HTTPS (`requireProductionHttpsUrl` in `config.ts`), and it will be difficult to reconcile with the Apple privacy labels and Google Data Safety answers, both of which ask whether data is encrypted in transit.

Qdrant does send an `api-key` header, which is good, but a vector store containing all user pattern content should not be reachable on a public IP at all.

**Fix:** terminate TLS in front of Qdrant and the embedding service (the existing Nginx Proxy Manager can do this), or move them onto a private network / WireGuard link. Firewall 6333 and 2010 to the n8n host only. Then confirm the "encrypted in transit" declarations are truthful before submitting store privacy forms.

**Effort:** 1 day. **Must be resolved before privacy declarations are submitted.**

### F-06 — Store and build infrastructure does not exist · Severity: Critical · Confirmed

| Item | State |
|---|---|
| `expo.extra.eas.projectId` | **Absent** — no EAS project linkage |
| `expo.owner` | **Absent** |
| RevenueCat iOS / Android SDK keys | **Empty strings** in `app.json`; release gate fails |
| `ios.buildNumber` / `android.versionCode` | **Absent**, while `eas.json` sets `appVersionSource: "local"` with `autoIncrement` |
| `expo.updates` / `runtimeVersion` | **Absent** — channels declared in `eas.json` but no OTA config |
| App Store Connect products (monthly, annual) | Not created |
| Google Play products (monthly, annual) | Not created |
| RevenueCat offering / `pro` entitlement mapping | Not configured |
| RevenueCat webhook URL + secret | Not configured |
| Apple agreements, tax, banking | Not completed |
| Google Play payments profile | Not completed |

The missing OTA update configuration deserves separate attention: without it there is **no way to hotfix a live defect except a full store resubmission**, which means 1–3 days of exposure for any post-launch bug. For a first release with no beta data, that is a poor position to be in. Configure EAS Update with a `production` channel before launch.

**Effort:** 1–2 weeks, much of it waiting on Apple and Google review of agreements and banking. **Start this immediately and in parallel — it is the longest lead-time item in the whole programme.**

---

## 5. High Priority (P1 — must fix before public release)

### F-07 — Paid users can be locked out of the features they bought · Severity: High · Confirmed

The only path from a store purchase to a backend entitlement is the RevenueCat webhook. There is no client-to-backend entitlement push and no on-demand verification against RevenueCat's REST API.

Meanwhile `effectiveEntitlement()` in `src/lib/entitlement-access.ts` prefers the **local RevenueCat snapshot** over the backend entitlement. So immediately after purchase the UI unlocks while the backend still returns `402 Subscription required` on every AI route.

Failure mode: a user pays, the UI says they are Pro, and every AI feature returns an error. If the webhook is misconfigured or n8n/the API is down when the event fires, this state is **permanent** — there is no retry, no reconciliation job, and no self-service recovery.

**Fix (any one, preferably the first two):**
1. Add `POST /billing/revenuecat/sync` — authenticated, verifies the user's entitlement directly against the RevenueCat REST API, and upserts `subscriptions`. Call it after every purchase and restore, and on app foreground when the client sees store-active-but-backend-inactive.
2. Add a periodic reconciliation job for users whose store entitlement and backend state disagree.
3. Add telemetry and an alert on the store-active/backend-inactive divergence so support sees it before the customer complains.

**Effort:** 2–3 days. **This is the most likely source of refunds and one-star reviews in week one.**

### F-08 — Paywall prices are hardcoded · Severity: High · Confirmed

`app/paywall.tsx:38-53` hardcodes `price: '£96'`, `price: '£10'`, and `badge: 'Save £24'`. The RevenueCat offering's `product.priceString` is never read.

Consequences:
- Every non-UK user sees GBP prices while their store charges local currency — wrong information at the point of sale.
- Prices silently drift from store configuration.
- This is a plausible App Store rejection under accurate-metadata rules, and Google has equivalent expectations.

The mitigating copy ("You will review the final price in the App Store or Google Play before paying") reduces the harm but does not make the displayed price correct.

**Fix:** read `priceString` from the fetched offering packages and render the store's localised values; compute the annual saving from the two products rather than hardcoding it. Keep a loading state and a neutral fallback for when offerings fail to fetch.

**Effort:** half a day. Low risk, high value.

### F-09 — Accessibility is materially incomplete · Severity: High · Confirmed

Measured across all screens and components:

| Annotation | Count |
|---|---:|
| `accessibilityLabel` | 19 |
| `accessibilityRole` | 39 |
| `accessibilityHint` | 3 |
| **`Pressable` / `TouchableOpacity`** | **360** |

Roughly 5% of interactive elements have an explicit accessible name. Text-labelled buttons inherit a name, but icon-only controls — the camera button, counters, swipe-to-delete, the movable tab bar, sheet dismissals — will announce as unlabelled to VoiceOver and TalkBack. `docs/ACCESSIBILITY_AUDIT_CHECKLIST.md` exists and is empty.

There is also no dark mode: `userInterfaceStyle` is `"light"` and the theme tokens define no dark variants. That is a defensible Stage 1 scope decision, but it is now a visible omission in a 2026 release and should be an explicit, recorded choice rather than an oversight.

**Fix:** label every icon-only control; run a real VoiceOver and TalkBack pass on the top ten flows; check tap targets at 44×44pt; test at the largest dynamic text size. Record results in the checklist.

**Effort:** 3–4 days.

### F-10 — Duplicate registration returns a 500 · Severity: Medium-High · Confirmed

`routes/auth.ts:215-226` inserts into `users` with no `ON CONFLICT` clause and no try/catch, while `users.email` is `NOT NULL UNIQUE`. Registering with an existing address raises a unique-violation, which the global error handler converts to `500 Internal server error`.

A user re-registering instead of signing in — an extremely common action — sees a generic server error rather than "that email is already registered". It also pollutes error metrics and alerting with a routine user action.

**Fix:** catch Postgres error code `23505` and return `409` with a clear message. Add a test. Then audit the other insert paths for the same pattern.

**Effort:** 1 hour.

### F-11 — Pattern content and upstream errors leak into logs and clients · Severity: Medium-High · Confirmed

Two related issues in `routes/chats.ts`:

- `request.log.warn({ aiPayload, ai }, ...)` and `request.log.error({ error, aiPayload }, ...)` log the **entire AI payload**, which includes `pattern_instruction_text` (extracted pattern text), the user's question, and chat history. The Fastify redaction config covers auth headers and password fields but not these. Copyrighted pattern content and user conversations therefore land in production logs, which conflicts with the retention policy in `docs/DATA_RETENTION_AND_DELETION_POLICY.md`.
- `return reply.code(502).send({ error: message })` returns the upstream n8n error verbatim. One of those messages is literally *"Upload workflow rejected the API secret. Check N8N_UPLOAD_SHARED_SECRET on the StitchSense API server..."* — internal configuration detail handed to a mobile client.

**Fix:** log identifiers and sizes, not content (`patternId`, `sessionId`, `promptChars`); add the pattern-text fields to the redaction paths; return a generic 502 with a `requestId` and keep the upstream detail server-side.

**Effort:** half a day.

### F-12 — Password hashing uses pgcrypto's default bcrypt cost · Severity: Medium-High · Confirmed

`crypt($3, gen_salt('bf'))` appears in registration and password reset. pgcrypto's default iteration count for `bf` is **6**, well below the 10–12 expected in 2026. Password verification also runs inside the SQL query, so every login consumes database CPU rather than application CPU.

**Fix:** use `gen_salt('bf', 12)`, and rehash on next successful login for existing users. Benchmark first — cost 12 on the VPS's 1.5 CPU cap will add measurable login latency, and the rate limit of 10 logins per 15 minutes per IP already bounds the brute-force surface. If the latency is unacceptable, cost 10 is a reasonable compromise; cost 6 is not.

**Effort:** half a day including migration strategy.

### F-13 — No staging environment · Severity: High · Confirmed

Workstream 5 and Stage 1 Track 2 are at 0/7 and 0/13 because there is nowhere to execute them. `docker-compose.staging.yml` and `.env.staging.example` exist, but no staging API, database, object storage, WordPress bridge, or n8n instance has been stood up.

Everything that proves the product actually works — WordPress data reconciliation, web-to-mobile and mobile-to-web upload flows, bidirectional sync under web-as-master rules, deleted-record resurrection checks, the Ravelry metadata-only matrix, pattern A/B isolation across relaunch and reinstall, migration rollback — is blocked on this.

The only alternative is testing against production, which is unacceptable for destructive and migration scenarios.

**Fix:** stand up staging on the existing VPS or a second small instance with its own database, bucket, secrets, and n8n workflows. Clone a minimised, anonymised slice of WordPress data. This is the single highest-leverage unblocking action available.

**Effort:** 3–5 days. **Start in week 1.**

### F-14 — The WordPress bridge has 7,911 lines of PHP and zero tests · Severity: High · Confirmed

The PHP layer carries the "web-as-master" sync contract, the Ravelry integration, the library, and three proxies. CI runs `php -l` — a syntax check only. There are no unit tests, no integration tests, and no static analysis.

Given that `AGENTS.md` names the WordPress bridge an external trust boundary and that sync correctness is a P0 workstream, this is the largest untested surface in the system.

**Fix:** add PHPStan or Psalm to CI as a first step (cheap, finds real defects in code this size). Add PHPUnit coverage for the platform client, the Ravelry ownership and import guards, and the sync export path. At minimum, cover the paths that Workstream 5's reconciliation depends on.

**Effort:** 1 week for meaningful coverage; 1 day for static analysis alone.

### F-15 — Crash reporting is not implemented · Severity: High · Confirmed

`docs/CRASH_REPORTING_PLAN.md` selects an approach and defines thresholds. No SDK is installed. There is no Sentry, Bugsnag, or Crashlytics dependency in `package.json`.

Launching a mobile app without crash reporting means a crash loop on a device model you do not own is invisible until reviews appear. `docs/POST_RELEASE_MONITORING_CHECKLIST.md` defines hold and rollback triggers based on crash-free session rate — a metric that cannot currently be measured.

**Fix:** install and configure the chosen provider, verify a test crash symbolises correctly on both platforms, and confirm the privacy rules in the plan are enforced (no pattern content, no PII in breadcrumbs). Then reconcile the SDK with the Apple privacy labels.

**Effort:** 1–2 days.

### F-16 — Alert rules exist but route nowhere · Severity: Medium-High · Confirmed

`ops/monitoring/stitchsense-alerts.yml` and `stitchsense-dashboard.json` are well-constructed, and the `/metrics` endpoint is secret-guarded with a timing-safe comparison and verified low-cardinality labels. But no Prometheus or Alertmanager instance scrapes it, and no routing destination is configured. The GitHub Actions uptime workflow runs every 15 minutes and can post to `UPTIME_ALERT_WEBHOOK_URL`, but that secret is not set.

Alerts that fire into nothing are documentation, not monitoring.

**Fix:** deploy a scraper (a managed option is fine and cheaper than self-hosting on a 768MB container), wire Alertmanager to a channel the owner actually reads, set the uptime webhook secret, and fire one deliberate test alert per class. Add the database-capacity and storage-error rules that are still missing.

**Effort:** 2–3 days.

### F-17 — No verified backup, no rehearsed rollback · Severity: High · Confirmed

`BACKUP_RESTORE_EVIDENCE.md`, `MIGRATION_ROLLBACK_REHEARSAL.md`, and `OPERATIONS_REHEARSAL_LOG.md` are complete templates with blank result columns. A backup was taken and verified on 26 September, but no fresh pre-release backup exists, no isolated restore has been performed, and no rollback has been rehearsed.

Migration `009` is the newest of nine. Migration tracking via `schema_migrations` is in place and was verified idempotent, which is good. But an unrehearsed rollback during a live incident is where data loss actually happens.

**Fix:** take a fresh backup, restore it to an isolated instance, verify row counts and a sample of object checksums, then rehearse forward migration and rollback end to end. Record real values in the templates.

**Effort:** 2 days.

### F-18 — Legal and privacy materials are unpublished and unapproved · Severity: High · Confirmed

Required for submission and all missing:
- Stable HTTPS privacy policy URL
- Stable HTTPS terms and subscription terms URL
- Stable HTTPS support/contact URL
- Apple privacy labels submitted in App Store Connect
- Google Data Safety form submitted in Play Console
- Business/legal approval of the privacy policy, terms, subscription terms, retention statements, and deletion process

Drafts are strong (`PRIVACY_DATA_SAFETY_WORKSHEET.md`, `LEGAL_PUBLICATION_CHECKLIST.md`, `IOS_PRIVACY_MANIFEST_REVIEW.md`), and the WordPress site is an obvious host for the public pages.

One dependency to flag: the privacy declarations cannot be answered truthfully until **F-05** is fixed. Both stores ask whether data is encrypted in transit.

**Effort:** 1 week including external approval turnaround.

### F-19 — Zero device acceptance evidence · Severity: High · Confirmed

`DEVICE_ACCEPTANCE_MATRIX.md` defines 61 evidence rows across fresh install, onboarding, login, session restoration, library sync, medium and large PDF upload, pattern viewer download, scoped chat and rewrite, projects, stash, Stitch Vision camera and library, Ravelry connect and import, offline recovery, logout and reinstall, three device sizes, and accessibility. **Every result cell is blank.**

No signed release build has ever run on physical hardware. For a React Native app with native modules (SecureStore, image picker, WebView, Reanimated, RevenueCat), Expo Go behaviour is not a reliable proxy for a release build.

**Effort:** 1–2 weeks of real testing once builds exist. Cannot be compressed much and cannot be skipped.

---

## 6. Medium Priority (P2 — before or shortly after launch)

| ID | Finding | Why it matters | Effort |
|---|---|---|---|
| F-20 | `app/project/[id].tsx` is **4,393 lines** | Directly violates the project's own guidance on extracting workflows from large screens. Unreviewable, untestable, and the highest-risk file for regressions | 3–5 days to extract logic into tested lib modules |
| F-21 | Upload sends the same file blob **three times** (`file`, `data`, `pattern_file`) | A 110MB PDF becomes a ~330MB multipart body against a 768MB / 1.5 CPU container. Likely OOM or timeout on large patterns | Half a day — confirm which field n8n reads and send one |
| F-22 | Workflow timeouts are **600 seconds** with no retry | A single slow chat or upload holds a connection for 10 minutes. Under modest concurrency this exhausts the container | 1 day — reduce timeouts, add bounded retry with backoff |
| F-23 | Any WordPress **administrator** is auto-promoted to StitchSense `admin` | `issueWordPressBridgeAuth` maps the `administrator` role to platform admin, granting entitlement-granting powers. WordPress account security becomes platform security | Half a day — require explicit allowlisting |
| F-24 | Access tokens cannot be revoked | `authenticate` only calls `jwtVerify`. Refresh tokens are revocable in the database; a leaked 15-minute access token is not | 1 day if a denylist is wanted; the 15-minute TTL is a reasonable mitigation |
| F-25 | Password reset depends entirely on WordPress | Returns `503` if the bridge is unconfigured. A WordPress outage removes account recovery for all users | 1–2 days for a native fallback |
| F-26 | `/user/export` returns a **summary only** | The UI shows counts, not data. Weak against GDPR portability, which expects a machine-readable copy | 1 day — return and save a JSON file |
| F-27 | No test coverage measurement | 48 test files with no coverage number, so gaps are invisible | Half a day to add `c8` and report in CI |
| F-28 | `npm audit` thresholds inconsistent | Backend blocks `high`, Expo only `critical`. The mobile app ships to users | 1 hour |
| F-29 | n8n workflow exports are **stale and unvalidated** | Dated June/July 2026, months behind the backend's payload contract, with no CI validation. `AGENTS.md` requires preserving payload contracts on both sides | 1–2 days to re-export, diff against the backend, and add a schema check |
| F-30 | Branch protection not enabled | Nothing enforces that CI passes before merge. Noted as plan-dependent, but `BRANCH_PROTECTION_SETUP.md` is ready | 1 hour once the plan allows |

---

## 7. What Is Genuinely Strong

This deserves saying plainly, because the blocker list above is long and the quality underneath it is real.

**Backend hardening is excellent.** `validateProductionConfig()` fails startup on 20+ misconfigurations — development JWT secret, non-HTTPS n8n URLs, short secrets, development storage credentials, half-configured Stripe, missing trusted-proxy ranges. Most teams discover these in production.

**User isolation is designed in, not patched on.** Every user-owned query is scoped with `user_id = $1`. The schema uses `ON DELETE CASCADE` consistently across 15+ tables, so account deletion genuinely removes data. Cross-user denial is explicitly tested.

**Pattern context isolation is correct where it matters most.** `chats.ts` builds the entire AI payload from the server-side, ownership-scoped session row — never from client input. `project_id`, `file_id`, `job_id`, and all pattern summary fields come from `session.*`. This is exactly right, and it makes F-04's vision-route deviation stand out as an exception rather than a pattern.

**The Ravelry metadata-only guard is thoughtful.** `patternNeedsOwnedSource()` distinguishes metadata for a paid pattern from possession of its content, and the system refuses to fabricate instructions it does not have. That is both a legal and a product-integrity win, and it is tested.

**RevenueCat cross-user entitlement theft is well guarded.** The client configures RevenueCat with the backend user UUID as `appUserID`; the webhook maps `app_user_id` to `users.id`, checks for an existing owner of the subscription, and writes a `billing.revenuecat.webhook.user_mismatch` audit event while refusing the update. Replay protection uses a unique index on event IDs. This is better than most implementations.

**CI design is strong.** SHA-pinned actions, pinned Node 22.23.0, isolated Postgres 16 and MinIO services for integration tests, Gitleaks with a checksum-verified binary, `npm audit`, `expo install --check`, Expo Doctor, PHP syntax checks, monitoring-artifact validation, and a production image build gated behind all of them.

**Observability foundations are properly built.** Request correlation IDs that honour an inbound `x-request-id`, structured slow-request logging, log redaction, a secret-guarded `/metrics` endpoint with a timing-safe comparison, and regression tests proving the metrics omit endpoint URLs, payload IDs, and authorization material. The low-cardinality discipline is unusual and correct.

**Entitlement enforcement is consistent.** Every paid capability — `patternUploads`, `aiChat`, `rewrite`, `stitchVision`, `ravelryImport` — is checked server-side on every route that uses it. There is no route where client-side gating is the only gate.

**Operational basics are right.** Multi-stage Docker build on a digest-pinned Alpine image, non-root `node` user, `HEALTHCHECK`, graceful shutdown, container memory and CPU limits, `init: true`, versioned migrations with a `schema_migrations` table verified idempotent, `/health` and a deep `/ready` that checks both database and object storage with timeouts.

**Code hygiene is exceptional.** Zero `TODO`, `FIXME`, `HACK`, or `XXX` across ~37,600 lines of application TypeScript. Clean lint at `--max-warnings=0`. Clean typecheck. 48 test files, ~7,850 lines of tests.

The 66 release documents are, taken as documents, better than most teams produce. The problem is strictly that they were mistaken for the work they describe.

---

## 8. Architecture Assessment

| System | Lines | Tests | Rating | Notes |
|---|---:|---|---|---|
| Backend API (Fastify/TS) | 9,412 | 37 files, 6,185 lines | **A−** | Hardened, well-structured. `wordpressSync.ts` (1,097) and `patterns.ts` (1,030) are getting large |
| PostgreSQL schema | 9 migrations | via integration tests | **A** | Clean FKs, cascades, partial unique indexes, versioned tracking |
| Expo mobile app | 28,191 | 11 files, 1,666 lines | **B** | Feature-rich and coherent; `project/[id].tsx` at 4,393 lines is a real liability; component-level tests absent |
| Object storage | 163 | covered | **A−** | 15-minute presigned URLs, ownership checks, checksummed keys |
| WordPress plugin | 7,911 | **none** | **C** | Carries the sync contract with syntax-check-only validation |
| n8n / RAG workflows | 3 exports | **none** | **D** | Committed secret, cleartext transport, unconstrained retrieval filter, stale exports |
| CI/CD | — | — | **B+** | Excellent design; currently cannot run from a clean checkout |
| Release documentation | 66 docs | — | **A for form, F for evidence** | Comprehensive templates, almost entirely unpopulated |

**The pattern across the whole system:** quality decreases with distance from TypeScript. The backend and schema are excellent. The mobile app is good with one problem file. The PHP bridge is unverified. The n8n layer — which is where the actual product value lives, since it is the AI — is the weakest and least governed part of the stack, despite being the component users are paying for.

That inversion is the most important architectural observation in this report. The AI layer deserves the same contract discipline, secret management, and test coverage as the API.

---

## 9. Market Research and Positioning

### 9.1 Market size

There is no reliable figure for the knitting/crochet **app** segment specifically; published research covers the broader craft economy and the estimates vary widely by publisher.

| Segment | Estimate | Source |
|---|---|---|
| Knitting & crochet market (global) | $4.7B – $35B for 2026, depending on definition | [Global Growth Insights](https://www.globalgrowthinsights.com/market-reports/knitting-and-crochet-market-120749) ($10.1B 2025 → $17.85B 2034, 6.53% CAGR); [Wise Guy Reports](https://www.wiseguyreports.com/reports/knitting-and-crochet-market) ($4.71B 2025); [EconMarketResearch](https://www.econmarketresearch.com/industry-report/knitting-and-crochet-market) ($35.44B 2026) |
| Patterns and digital tutorials share | ~10% of the knitting/crochet market | [EconMarketResearch](https://www.econmarketresearch.com/industry-report/knitting-and-crochet-market) — single source, methodology unexplained |
| Needlecraft patterns (incl. cross-stitch, quilting) | $4.8B 2025 → $8.1B 2034 | [Dataintelo](https://dataintelo.com/report/needlecraft-patterns-market) |
| Knitting yarn | ~$5.13B 2026 | [Business Research Insights](https://www.businessresearchinsights.com/market-reports/knitting-yarn-market-118996) |

Treat these as directional only. The honest read is: **the craft economy is large and growing modestly, but the software slice is small and the willingness to pay for software is unproven.** Yarn is where the money is; apps are an accessory to it.

### 9.2 Addressable audience

| Population | Estimate | Source |
|---|---|---|
| Ravelry registered accounts | ~9–11 million | [Expanded Ramblings](https://expandedramblings.com/index.php/ravelry-statistics-facts/) (9M+, 2024, citing The Guardian); [Knit Like Granny](https://knitlikegranny.com/ravelry-stats/) (11.06M, Jan 2023) |
| Ravelry monthly actives (historic ratio) | ~1.05M active of ~6.0M registered (2016) — roughly **17%** | [Wool Winding](https://woolwinding.wordpress.com/2016/02/03/ravelry-hits-six-million/) |
| UK knitters | ~7 million (2022 estimate) | [UK Hand Knitting Association](https://www.ukhandknitting.com/about-us/facts-figures) |
| UK women knitting/crocheting | 5.7 million (2019 study) | [UK Hand Knitting / Immediate Media Craft Intelligence](https://www.ukhandknitting.com/about-us/facts-figures) |

That ~17% active ratio matters more than the headline number. The realistic engaged, English-speaking, smartphone-using, pattern-buying audience that would consider paying for a tool like StitchSense is likely in the **1–3 million** range globally, with perhaps **100–300k** in the UK. At a 0.5–2% reachable-market penetration — optimistic for an unknown brand with no marketing budget — that is **5,000–60,000 installs** as a multi-year ceiling, not a year-one target.

### 9.3 Competitive landscape

StitchSense sits in a crowded middle. It is **not first to market with AI pattern chat** — that window has already closed.

**Established pattern trackers (strong retention, entrenched habits)**

| Product | Model | Threat |
|---|---|---|
| [knitCompanion](https://apps.apple.com/app/id1058142783) | Free tier + one-time IAP for annotations and markers; works offline; iOS/Android/macOS/FireOS | **High.** Reviews call it the deepest pattern-handling option. Fiercely loyal users for charted and multi-size patterns |
| [Ravelry](https://www.ravelry.com/about/terms) | Free, community + pattern marketplace + API | **Structural.** It is the category's gravity well. StitchSense depends on its API while competing for the same session |
| My Row Counter | Free; 14 languages; PDF support; Ravelry sync | Medium, at the simple-counter end |
| Pocket Knitting | Free; Ravelry import, counters, highlighting | Medium |
| [Knittle](https://knittle.app/journal/best-row-counter-apps) | **$1.99/mo, $9.99/yr, or $29.99 one-time** | **High — on price.** Transparent, cheap, and directly comparable |

**AI-native entrants (the actual competitive set)**

| Product | Offering |
|---|---|
| [Yarnie](https://play.google.com/store/apps/details?id=com.ai.crochet.knitting.stitch) | 24/7 AI chat for crochet/knitting/amigurumi, pattern generator, stitch identifier with hook and yarn recommendations — **closest direct competitor** |
| [Yarn AI: Crochet Patterns](https://apps.apple.com/us/app/yarn-ai-crochet-patterns/id6749139586) | Upload a pattern, get walked through row by row, with an AI coach for terms and techniques. **4.7 from 73 ratings** — same core proposition as StitchSense, small but real traction |
| [Crochet AI](https://play.google.com/store/apps/details?id=com.ai.the.crochet.patterns.knit.maker.how.to.crocheting.knitting.row.counter) | Photo-based stitch recognition, step-by-step guides, row counting |
| [purlJam](https://verde.uk/blogs/news/introducing-purljam-revolutionizing-knitting-and-crochet-patterns-with-ai) | Free gauge-aware pattern drafting; Standard and Pro tiers |
| [KnottyPatterns](https://knottypatterns.com/) | AI pattern-building workspace with a follow-up-question assistant |
| [crochets.site](https://crochets.site/) | Description-to-pattern with 3D preview and chat refinement; free + paid from ~$9/mo |
| Custom GPTs (Crochet Companion, CrochetKitty) | Free, general-purpose, zero switching cost |

### 9.4 Honest positioning

**StitchSense's defensible differentiation** is not "AI for knitting" — that is now table stakes. It is the **integrated making workspace**: pattern library with real PDF handling, pattern-scoped RAG chat grounded in *your* purchased pattern, rewrite and simplification, projects with counters and work logs and photos, a yarn stash with insights, Stitch Vision, a 3,900-line stitch dictionary, a gauge calculator, and WordPress/Ravelry integration — all synced across web and mobile under one account.

No competitor in the list above spans that breadth. Yarn AI walks you through a pattern; it does not manage your stash or your projects. knitCompanion handles charts beautifully; it has no AI and no yarn inventory. The pattern-scoped RAG with explicit "I don't have that pattern's content" honesty is a genuine quality signal that general chatbots cannot match.

**The honest weaknesses:**
- **Price is the biggest commercial risk.** £10/month and £96/year against Knittle's $1.99/month, $9.99/year, or $29.99 lifetime, and against knitCompanion's free tier with a one-time IAP. StitchSense is roughly **5× Knittle's monthly and 10× its annual price**, in a hobby category with an older, value-conscious demographic that is highly accustomed to free craft software. £96/year is premium-SaaS pricing in a market priced like a coffee.
- **Ravelry dependency is strategic risk.** StitchSense needs Ravelry for pattern metadata while competing for the same user session. Ravelry's API terms for third parties were not retrievable in research; this needs direct confirmation from Ravelry before launch, because an API policy change or rate-limit decision could remove a headline feature overnight. The `metadata` vs `content` distinction in the code is the right defensive posture.
- **AI accuracy is the product's reputational core.** Knitters will immediately notice a wrong stitch count, and craft communities talk. The pattern-evidence guard that refuses to answer without scoped retrieval is the right instinct, but it has never been validated against real patterns at scale. One viral "the AI told me the wrong row count and I frogged a sleeve" post would be more damaging than a month of bugs.
- **No marketing engine and no brand.** The WordPress site (`catlowyarns.co.uk`) is the only existing audience channel. There is no mention of an ASO plan, content strategy, influencer relationships, or launch partners in any of the 66 documents. For a £96/year product, discovery is the whole game, and it is currently unaddressed.
- **UK-centric framing.** `en-GB` locale, metric units, GBP pricing, a UK bundle identifier. That focus is a reasonable beachhead, but the US is the larger craft market and the hardcoded GBP paywall (F-08) actively breaks the experience there.

### 9.5 Suggested repositioning

1. **Reconsider the price before launch.** £10/month will suppress conversion sharply in this category. Options worth modelling: £4.99/month with £39.99 annual; or a free tier with the counters, stash, dictionary, and gauge calculator, gating only the AI features. A free tier also buys you organic discovery and review volume, which are the hardest things to acquire cold. The hard-paywall data below argues for keeping a paywall — but at a believable price.
2. **Lead with the workspace, not the AI.** "Your whole making life in one place, with an AI that actually knows your pattern" positions against both knitCompanion and the AI entrants. "AI knitting assistant" positions you against six cheaper or free competitors on their terms.
3. **Make accuracy the brand.** The guard that says "I can't see that row in your pattern" instead of inventing one is a real differentiator in a category where competitors hallucinate. Say so publicly and loudly.
4. **Use the 30-day no-card trial deliberately.** RevenueCat's 2026 data shows 17–32 day trials convert best at a 42.5% median. But it also shows no-card opt-in trials convert far worse than card-required ones, and hard paywalls far better than freemium. The current setup — 30 days, no card — sits on the good side of trial length and the bad side of trial type. Measure it early rather than assuming.

### 9.6 Subscription benchmarks

From [RevenueCat's State of Subscription Apps 2026](https://www.revenuecat.com/state-of-subscription-apps) (~115,000 apps) and [Adapty's 2026 report](https://adapty.io/state-of-in-app-subscriptions/):

| Metric | Benchmark |
|---|---|
| Trial-to-paid, global average | 25.6% (Adapty) |
| Best category (Travel) | 43.5% median, 62.4% top quartile |
| Health & Fitness | 35–37.7% |
| Worst (Photo & Video) | 22.2% |
| 17–32 day trials | **42.5% median** — best trial length |
| ≤4 day trials | 25.5% |
| Hard paywall, Day-35 trial-to-paid | **10.7% median** |
| Freemium, Day-35 trial-to-paid | **2.1% median** |
| iOS vs Google Play trial conversion | Near-identical (32.6% vs 32.5%) |

Sources disagree on baselines because definitions differ. For planning, **20–30% trial-to-paid is a reasonable range** for a hobby utility — but apply a further discount for the price premium. At £10/month against £1.99 competitors, I would plan for the **low end or below: 10–18%**.

---

## 10. Probable Success Ratings

### 10.1 Technical launch success

| Outcome | Probability | Condition |
|---|---:|---|
| **If launched today** | — | — |
| Store approval on first submission | **10%** | No products, keys, legal URLs, screenshots, or buildable image exist |
| Launch without a billing or data incident | **15%** | F-04, F-05, F-07 are all live-fire risks |
| **If all P0 and P1 items are closed** | — | — |
| Store approval within two submissions | **85%** | The app is genuinely complete and compliant once configured |
| Stable first 30 days (no rollback) | **75%** | Strong engineering, but no beta data and no device evidence |
| Stable with a real 2-week beta first | **90%** | The single highest-value risk reduction available |

### 10.2 Commercial success (12 months post-launch)

Assumes launch happens properly, with the current £10/£96 pricing and no marketing budget beyond the existing WordPress audience.

| Scenario | Probability | Outcome |
|---|---:|---|
| **Breakout** — >50k installs, >2,500 subscribers, £20k+ ARR | **5%** | Needs a viral moment or an influencer or yarn-brand partnership |
| **Solid niche** — 10–50k installs, 400–2,500 subscribers, £4k–20k ARR | **20%** | Achievable with sustained ASO, content, and community work |
| **Modest** — 2–10k installs, 50–400 subscribers, £500–4k ARR | **40%** | **Most likely.** Covers hosting and AI costs, does not fund development |
| **Minimal** — <2k installs, <50 subscribers | **30%** | Price resistance plus no discovery channel |
| **Fails or withdrawn** | **5%** | AI accuracy incident, Ravelry API change, or operational burnout |

**Weighted expectation: roughly 2,000–8,000 installs and £1,500–6,000 ARR in year one** at current pricing.

**Price sensitivity is the dominant variable.** At £4.99/month with a free tier, I would shift roughly 15 points from "Minimal" into "Solid niche" and "Modest" — more total revenue from more subscribers at a lower price, plus the review volume and organic discovery that a free tier generates. In a category this price-sensitive, £10/month is more likely to cap the business than to monetise it.

**The second dominant variable is discovery.** 66 release documents contain no marketing plan. An excellent app nobody finds earns nothing. This is currently the largest unaddressed risk in the whole programme, and unlike the technical blockers, nobody has written a checklist for it.

### 10.3 Risk summary

| Risk | Likelihood | Impact | Priority |
|---|---|---|---|
| Cross-user pattern content leak via vision route (F-04) | Medium | **Severe** | **P0** |
| Paid users locked out by webhook-only entitlement (F-07) | **High** | High | **P0** |
| Store rejection on first submission | **High** | Medium | P0 |
| Price resistance suppressing conversion | **High** | **High** | **P0 (commercial)** |
| Committed secret abused (F-03) | Low–Medium | High | P0 |
| AI accuracy incident damaging reputation | Medium | **High** | P1 |
| Pattern content intercepted in transit (F-05) | Low | **Severe** | P0 |
| Crash loop invisible without crash reporting (F-15) | Medium | High | P1 |
| Ravelry API terms or policy change | Low–Medium | High | P1 |
| Large PDF upload failure (F-21) | Medium | Medium | P2 |
| No discovery channel | **High** | **High** | **P0 (commercial)** |

---

## 11. Recommended Plan

### Week 1 — Restore a trustworthy baseline

Nothing else can be verified until this is done.

1. **Commit and push the hardening changeset** (F-02). Reviewable slices, PR, clean-checkout CI run. Fix whatever CI surfaces.
2. **Fix the Docker build** (F-01). Container-safe `package.json` scripts; developer wrapper moved to `*:local` variants. Confirm `production-image` goes green.
3. **Rotate the n8n secret and sanitise the workflow exports** (F-03). Move to `$env`; add a Gitleaks rule.
4. **Fix the vision route and the Qdrant filter** (F-04). Zod schema, server-resolved scope IDs, mandatory `user_id` clause, fail closed on absent scope, cross-user regression test.
5. **Put TLS in front of Qdrant and the embedding service; firewall both** (F-05).
6. **Start the store console work in parallel** (F-06) — it has the longest lead time. EAS project, Apple and Google agreements, tax, banking, products, RevenueCat offering and webhook.

**Exit gate:** CI green from a clean checkout, production image builds, no secrets in the tree, no unvalidated client input reaching an AI payload, AI transport encrypted.

### Weeks 2–3 — Staging and correctness

7. **Stand up staging** (F-13) — API, Postgres, object storage, WordPress bridge, n8n, separate secrets. Clone a minimised anonymised WordPress slice.
8. **Fix F-07** (entitlement sync endpoint), **F-08** (store-sourced prices), **F-10** (duplicate registration 409), **F-11** (log and error leakage), **F-12** (bcrypt cost).
9. **Add PHPStan to CI** (F-14 first step) and triage what it finds.
10. **Configure EAS Update** with a production channel so a post-launch hotfix does not require resubmission.
11. **Install crash reporting** (F-15) and verify a test crash on both platforms.
12. **Run the data and sync reconciliation** against staging (Workstream 5 / Track 2) and record real evidence.

**Exit gate:** `DATA_SYNC_RECONCILIATION_RUNBOOK.md` populated with real results; no data-loss, cross-user, resurrection, or pattern-contamination issue open.

### Weeks 4–5 — Builds, devices, billing

13. **Build preview artifacts** for iOS and Android; install on hardware.
14. **Work the device acceptance matrix** (F-19). All 61 rows, two platforms, three device sizes.
15. **Accessibility pass** (F-09). Label every icon-only control; real VoiceOver and TalkBack runs.
16. **Store purchase matrices** — Apple sandbox and TestFlight, Google licence testers and internal track. Monthly, annual, restore, cancellation, pending, expiry, grace, refund, revocation, and cross-user entitlement denial.
17. **Deploy monitoring and alert routing** (F-16); fire one test alert per class.
18. **Fresh backup, isolated restore, migration rollback rehearsal** (F-17).

**Exit gate:** no P0/P1 mobile defect open; purchase, restore, and expiry verified on both real stores; rollback rehearsed with recorded timings.

### Weeks 6–7 — Legal, store, beta

19. **Publish privacy, terms, subscription terms, and support URLs** (F-18); obtain approval. Submit Apple privacy labels and the Google Data Safety form — truthfully, which requires F-05 done.
20. **Final assets** — 1024×1024 non-alpha iOS icon, Android adaptive layers and feature graphic, phone screenshots from the real launch UI, descriptions, keywords, categories, age ratings, review notes, private reviewer account.
21. **Run a real beta.** TestFlight and Play Internal Testing with **non-developer knitters**. Two weeks minimum. This is the highest-value remaining risk reduction.
22. **Triage beta feedback**; fix all P0/P1; rerun affected suites.

### Weeks 8–11 — Release

23. **Make the pricing decision** on beta evidence, before store products are locked in. This is a commercial decision that beta data should inform.
24. **Build signed production candidates** from a tagged green commit; record artifact hashes and config versions.
25. **Complete the sign-offs** — security, privacy, migration, billing, backup, monitoring, store. Populate `RELEASE_DECISION_LOG.md` with real values.
26. **Deploy backend before the mobile release**, using the rehearsed sequence.
27. **Submit; use phased release.** Monitor crash-free sessions, API errors, auth failures, purchases, sync, workflow failures, support contacts, and reviews against the thresholds already defined.

### Process changes I would make regardless

- **Stop marking plan items complete when a document is written.** Add a convention: `[x]` means evidence recorded; `[d]` means documented but unexecuted. Roughly 20 currently-annotated items are documentation, not completion, and the annotations are honest about it while the checkbox is not.
- **Commit daily.** Three weeks of unpushed work on a single machine is the root cause of F-01 and F-02 both.
- **Treat the n8n layer as production code.** It is where the product value lives and it is the only part of the stack with a committed secret, cleartext transport, and no tests. Version the workflows, validate the payload contract in CI, and test retrieval scoping.
- **Write the marketing and discovery plan.** It is the only major launch workstream with no document at all, and commercially it matters more than several that have three.

---

## 12. Go / No-Go

**Recommendation: NO-GO for public release. Proceed to an 8–11 week structured release programme.**

**Hard blockers (cannot build or deploy):**
- F-01 Docker image unbuildable
- F-02 Release source uncommitted and CI-unverifiable
- F-06 No EAS project, store products, RevenueCat keys, or payout banking

**Hard blockers (would ship a security or privacy defect):**
- F-03 Live secret in version control
- F-04 Unvalidated client input into AI retrieval scope
- F-05 Pattern content in cleartext over the public internet

**Hard blockers (would ship a broken paid experience):**
- F-07 Paid users lockable out of purchased features
- F-08 Wrong prices shown to non-UK users
- F-18 No published legal URLs or submitted privacy declarations

**Evidence gaps that make any launch decision unsupportable:**
- Zero device acceptance evidence (F-19)
- Zero store purchase testing
- Zero staging data and sync reconciliation (F-13)
- Zero backup verification or rollback rehearsal (F-17)
- No crash reporting (F-15) and no alert routing (F-16)

**Honest framing of where this project is:** StitchSense has done the hard part. The architecture is sound, the security model is deliberate, the feature set is genuinely differentiated, and the code quality is better than most products that reach the store. What remains is almost entirely **execution and verification**, not construction — closing the four regressions introduced in the last three weeks, performing the testing that 35 excellent templates are waiting to record, and completing the store and legal configuration that nobody has started.

That is a much better position than the 60% score suggests. The remaining 40% is mostly unglamorous, well-understood work with known steps. But it is real work, it cannot be skipped, and most of it cannot be compressed — Apple's banking verification, a two-week beta, and a proper device pass all take the time they take.

The biggest risk to this launch is not technical. It is the temptation to ship because the code looks finished.

**And the risk most likely to decide whether StitchSense succeeds commercially is not on the blocker list at all: £10/month in a £1.99 category, with no discovery plan.** Fix the engineering, then take that decision seriously, with beta evidence in hand.

---

## Appendix A — Measured Metrics

| Metric | Value |
|---|---:|
| Backend TypeScript | 9,412 lines, 41 files |
| Expo app / src / components | 28,191 lines |
| WordPress PHP | 7,911 lines, 8 files |
| Backend routes | 15 |
| Backend services | 17 |
| Database migrations | 9 |
| Expo screens / routes | 27 |
| Shared UI components | 14 |
| React context providers | 5 |
| Backend test files | 37 (6,185 lines) |
| Expo test files | 11 (1,666 lines) |
| Backend tests passing locally | 33 pass / 28 skipped / 0 fail (of 61) |
| Expo tests passing | 60 / 60 |
| Release documents | 66 |
| `TODO` / `FIXME` / `HACK` / `XXX` | **0** |
| n8n workflow exports | 3 (dated Jun–Jul 2026) |
| Commits on branch | 91 (first: 21 Jun 2026) |
| Uncommitted modified files | 59 (+4,051 / −3,530) |
| Untracked files | 54 |
| Days since last commit | 18 |
| Readiness-plan gates closed | 30 / 73 (41%) |
| Stage 1 plan items closed | 25 / 129 (19%) |
| Interactive elements | 360 |
| `accessibilityLabel` annotations | 19 |

## Appendix B — Finding Index

| ID | Finding | Severity | Status |
|---|---|---|---|
| F-01 | Production Docker image cannot be built | Critical | Confirmed |
| F-02 | Release source uncommitted; CI cannot run from clean checkout | Critical | Confirmed |
| F-03 | Live shared secret committed to repository | Critical | Confirmed |
| F-04 | Vision route forwards unvalidated client input into AI retrieval scope | Critical | Code defect confirmed; exploitability to verify |
| F-05 | AI and vector traffic unencrypted over public internet | Critical | Confirmed |
| F-06 | Store, EAS, billing, and payout infrastructure absent | Critical | Confirmed |
| F-07 | Paid users lockable out by webhook-only entitlement propagation | High | Confirmed |
| F-08 | Paywall prices hardcoded in GBP | High | Confirmed |
| F-09 | Accessibility materially incomplete (19 labels / 360 touchables) | High | Confirmed |
| F-10 | Duplicate registration returns 500 | Medium-High | Confirmed |
| F-11 | Pattern content in logs; upstream errors leaked to clients | Medium-High | Confirmed |
| F-12 | bcrypt cost 6 (pgcrypto default) | Medium-High | Confirmed |
| F-13 | No staging environment | High | Confirmed |
| F-14 | 7,911 lines of PHP with no tests | High | Confirmed |
| F-15 | Crash reporting not implemented | High | Confirmed |
| F-16 | Alert rules route nowhere | Medium-High | Confirmed |
| F-17 | No verified backup; rollback unrehearsed | High | Confirmed |
| F-18 | Legal and privacy materials unpublished and unapproved | High | Confirmed |
| F-19 | Zero device acceptance evidence | High | Confirmed |
| F-20 | `project/[id].tsx` is 4,393 lines | Medium | Confirmed |
| F-21 | Upload sends file blob three times | Medium | Confirmed |
| F-22 | 600-second workflow timeouts, no retry | Medium | Confirmed |
| F-23 | WordPress admin auto-promoted to platform admin | Medium | Confirmed |
| F-24 | Access tokens not revocable | Medium | Confirmed |
| F-25 | Password reset depends entirely on WordPress | Medium | Confirmed |
| F-26 | `/user/export` returns summary only | Medium | Confirmed |
| F-27 | No test coverage measurement | Low-Medium | Confirmed |
| F-28 | Inconsistent `npm audit` thresholds | Low | Confirmed |
| F-29 | n8n workflow exports stale and unvalidated | Medium | Confirmed |
| F-30 | Branch protection not enabled | Low-Medium | Confirmed |

## Appendix C — Sources

Market and competitive research:
- [RevenueCat — State of Subscription Apps 2026](https://www.revenuecat.com/state-of-subscription-apps)
- [RevenueCat — Subscription app trends and benchmarks 2026](https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026)
- [Adapty — State of In-App Subscriptions 2026](https://adapty.io/state-of-in-app-subscriptions/)
- [Global Growth Insights — Knitting and Crochet Market](https://www.globalgrowthinsights.com/market-reports/knitting-and-crochet-market-120749)
- [Wise Guy Reports — Knitting and Crochet Market](https://www.wiseguyreports.com/reports/knitting-and-crochet-market)
- [EconMarketResearch — Knitting and Crochet Market](https://www.econmarketresearch.com/industry-report/knitting-and-crochet-market)
- [Dataintelo — Needlecraft Patterns Market](https://dataintelo.com/report/needlecraft-patterns-market)
- [Business Research Insights — Knitting Yarn Market](https://www.businessresearchinsights.com/market-reports/knitting-yarn-market-118996)
- [UK Hand Knitting Association — Facts & Figures](https://www.ukhandknitting.com/about-us/facts-figures)
- [Expanded Ramblings — Ravelry Statistics](https://expandedramblings.com/index.php/ravelry-statistics-facts/)
- [Knit Like Granny — Ravelry Stats](https://knitlikegranny.com/ravelry-stats/)
- [Wool Winding — Ravelry hits six million](https://woolwinding.wordpress.com/2016/02/03/ravelry-hits-six-million/)
- [Ravelry — Terms of Service](https://www.ravelry.com/about/terms)
- [knitCompanion — App Store](https://apps.apple.com/app/id1058142783)
- [Knittle — Best Row Counter Apps compared](https://knittle.app/journal/best-row-counter-apps)
- [Yarn AI: Crochet Patterns — App Store](https://apps.apple.com/us/app/yarn-ai-crochet-patterns/id6749139586)
- [Yarnie: Crochet and Knitting — Google Play](https://play.google.com/store/apps/details?id=com.ai.crochet.knitting.stitch)
- [Crochet AI — Google Play](https://play.google.com/store/apps/details?id=com.ai.the.crochet.patterns.knit.maker.how.to.crocheting.knitting.row.counter)
- [purlJam — introduction](https://verde.uk/blogs/news/introducing-purljam-revolutionizing-knitting-and-crochet-patterns-with-ai)
- [KnottyPatterns](https://knottypatterns.com/)
- [crochets.site](https://crochets.site/)

Market-size figures come from commercial research summaries whose definitions differ substantially; they are directional only. No source gave a figure for the knitting/crochet app segment specifically.

---

*No application code, configuration, or project documentation was modified in producing this report. All findings were verified by direct inspection or execution against the working tree on 9 October 2026, except where explicitly marked as requiring further verification.*
