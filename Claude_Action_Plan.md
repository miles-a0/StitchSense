# StitchSense — Release Remediation Action Plan / PDR

**Audience:** the coding agent (and its human reviewer) picking up StitchSense release hardening
**Companion document:** [`Claude_Report.md`](Claude_Report.md) — the full readiness assessment this plan derives from
**Authored:** 9 October 2026, against branch `test/chat-history-route-coverage`, HEAD `d7859b2`
**Status of this document:** proposal. Every claim below is reproducible; dispute any of it with evidence.

---

## 0. How To Use This Document

This is a **work order, not gospel.** It was produced by static inspection and local execution only — no production access, no staging, no physical device, no Docker daemon. Several findings are marked as needing verification you are better placed to perform.

Your obligations, in order:

1. **Reproduce before you fix.** Every work package has a `VERIFY` block with exact commands or inspection steps. Run it. If the finding does not reproduce, say so, record what you observed, and move on — do not implement a fix for a problem you cannot demonstrate.
2. **Fix the smallest thing that closes the finding.** See §7 Guardrails.
3. **Prove the fix.** Every work package has `ACCEPTANCE` criteria and, where applicable, `TESTS TO ADD`. A package is not done until its acceptance criteria are demonstrably met.
4. **Report disagreement.** If you believe a finding is wrong, misjudged in severity, or has a better fix, write that up with evidence rather than silently deviating. The severity ratings are judgement calls; the reproductions are facts.

Work packages are labelled `WP-n` and cross-reference the report's finding IDs (`F-nn`).

### Priority legend

| Tier | Meaning |
|---|---|
| **P0** | Blocks any build or deploy, or would ship a security/privacy/billing defect. Do these first, in order. |
| **P1** | Blocks public release. Required before store submission or beta. |
| **P2** | Should land before or shortly after launch. Not release-blocking. |
| **HUMAN** | Not yours. Requires an owner decision, an external account, or a commercial judgement. Listed in §8 so you do not waste effort or make the call yourself. |

---

## 1. Mission And Non-Negotiable Constraints

### Mission

Take StitchSense from "code looks finished" to "release candidate with evidence." The codebase is sound; the failures are regressions, verification gaps, and configuration that was never done. **This is not a rewrite or a redesign.**

### Constraints from `AGENTS.md` — these override convenience in every work package

- **Protect existing functionality.** StitchSense is an established application with real users on the WordPress side. Do not perform broad rewrites while implementing isolated fixes.
- **Understand before changing.** Read the surrounding data flow first. Boundaries between the Expo app, API, PostgreSQL, object storage, WordPress, n8n, and Ravelry are **explicit contracts**. Do not move responsibilities between systems casually.
- **User isolation is absolute.** Never trust a client-supplied resource ID as proof of ownership. For every user-owned resource consider authentication, ownership, cross-user access, deleted resources, stale identifiers, and entitlement. Where appropriate, deliberately test accessing another user's resource.
- **Never bypass an entitlement check** to fix downstream functionality. Test both permitted and denied access on any entitlement-controlled route you touch.
- **Pattern context must never leak between Pattern A and Pattern B.** This applies to chat, rewrites, summaries, uploads, RAG retrieval, and Stitch Vision.
- **Preserve payload contracts** across the n8n and WordPress boundaries unless you intentionally change both sides. Maintain user/pattern identifiers and shared-secret authentication. Do not silently discard error information. Preserve intentional fallbacks and test them.
- **Local machine compatibility is a hard requirement.** The owner develops on an older Mac. Do not raise Node, npm, Expo, Xcode, Android Studio, Docker, or simulator requirements. Keep Expo Go and lightweight local checks working. Heavy builds belong in CI or a remote pod. `tools/run-with-node22.sh` exists for this reason — see WP-1, which must preserve it for local use.
- **Do not combine a feature request with unrelated cleanup.** One work package, one concern.
- **Do not describe work as production-ready while required verification is outstanding.**

### Completion ritual (from `AGENTS.md`) — run before declaring any package done

1. Inspect the final diff.
2. Run relevant unit tests.
3. Run relevant integration tests where infrastructure permits.
4. Run TypeScript/type checks.
5. Check affected API contracts.
6. Consider user isolation and entitlement regression.
7. Consider pattern-context contamination.
8. Verify failure paths for external integrations.

---

## 2. System Orientation

Read this before touching anything. It will save you a day of rediscovery.

### 2.1 Repository layout

```
/
├── Mobile App/
│   ├── stitchsense-expo/          Expo SDK 57 / RN 0.86 / React 19.2 app (28,191 lines)
│   │   ├── app/                   expo-router screens (27 routes)
│   │   ├── src/lib/               API client, flows, stores, pure logic  ← tests live against these
│   │   ├── src/providers/         5 React contexts (session, library, projects, stash, preferences)
│   │   ├── src/components/        14 shared UI components
│   │   ├── src/theme/tokens.ts    design tokens (light only — no dark variants)
│   │   ├── tests/                 11 Node-runner test files (tsx --test)
│   │   └── scripts/validate-release-config.mjs   ← UNTRACKED, CI depends on it
│   ├── backend/stitchsense-api/   Fastify 5 / TS (9,412 lines)
│   │   ├── src/routes/            15 route modules
│   │   ├── src/services/          17 services
│   │   ├── src/middleware/auth.ts authenticate + requireAdmin decorators
│   │   ├── migrations/            9 versioned SQL migrations
│   │   ├── tests/                 37 .mjs test files (node --test)
│   │   └── Dockerfile             multi-stage, digest-pinned, non-root
│   ├── backend/scripts/smoke-api.sh   ← UNTRACKED, CI depends on it
│   └── shared/api-contracts/stitchsense-api.v1.yaml   OpenAPI contract
├── *.php                          WordPress plugin + 3 proxies (7,911 lines, ZERO tests)
├── *.json (3 at root)             n8n workflow exports — TRACKED, contain a live secret
├── ops/monitoring/                ← UNTRACKED, CI depends on both files
├── tools/run-with-node22.sh       ← UNTRACKED, EVERY npm script depends on it
├── docs/                          43 release documents (~35 are empty evidence templates)
└── .github/workflows/ci.yml       6 jobs; production-image gated behind all others
```

### 2.2 Request and trust flow

```
Expo app
  │  Bearer JWT (15 min TTL), refresh token rotated in refresh_tokens
  ▼
Fastify API ──────────────────────────────────────────────┐
  │  app.authenticate → jwtVerify → SELECT users WHERE id │ ownership: user_id = $1 everywhere
  │  resolveEntitlement(userId) → manual > paid > trial   │ entitlement: hasFeature(...) per route
  ├──► PostgreSQL           (parameterised SQL, FK CASCADE)
  ├──► MinIO/S3             (15-min presigned URLs, ownership checked)
  ├──► WordPress bridge     (x-stitchsense-wordpress-secret, configured-host allowlist)
  └──► n8n workflows        (x-stitchsense-secret / x-pattern-helper-secret)
          │
          ├──► Ollama embeddings   http://173.249.40.161:2010   ◄── CLEARTEXT (F-05)
          ├──► Qdrant              http://173.249.40.161:6333   ◄── CLEARTEXT (F-05)
          │      single shared collection: knitting_knowledge
          └──► OpenRouter          https://openrouter.ai        ($env key — correct)
```

### 2.3 The two patterns you must internalise

**The correct pattern — `src/routes/chats.ts:555-602`.** The AI payload is built *entirely* from the server-side, ownership-scoped `session` row. `project_id`, `file_id`, `job_id`, `pattern_id`, and every pattern summary field come from `session.*`, never from the request body. `buildScopedWorkflowUserId()` produces `pattern:{userId}:{patternId}:{sessionId}`. **Copy this shape anywhere you touch an AI call.**

**The defective pattern — `src/routes/vision.ts:22-33`.** `{ ...body }` spreads raw client input into the outbound payload, with no Zod schema at all. This is the only route in the codebase that does this. It is WP-4.

### 2.4 Entitlement model

Resolution order in `src/services/entitlements.ts` — first match wins:

1. `manual_entitlements` (`lifetime_pro` | `extended_trial` | `courtesy_access`) — granted by admins via WordPress
2. `subscriptions` with status `active`/`trialing` — written **only** by the RevenueCat webhook
3. `users.standard_trial_ends_at` — 30 days, granted at registration
4. Otherwise `plan: 'none'`, all features false

Gated features: `patternUploads`, `aiChat`, `rewrite`, `stitchVision`, `ravelryImport`. Every paid route checks `hasFeature()` server-side. **This is correct and consistently applied — do not weaken it.** Denials return `402`.

Client side, `effectiveEntitlement()` in `src/lib/entitlement-access.ts:33` prefers the local RevenueCat snapshot over the backend's, except for manual sources. That asymmetry is WP-7.

### 2.5 Toolchain

| | |
|---|---|
| Node | 22.23.3 local, 22.23.0 in CI and the image. Engine pin: `>=22.13 <23` |
| Backend test | `npm test` → builds, then `node --test tests/*.test.mjs`. **28 of 61 tests skip without `TEST_DATABASE_URL`** |
| Expo test | `npm test` → `tsx --test tests/*.test.ts`. 60/60 pass locally, no infra needed |
| Integration infra | CI provides Postgres 16 + MinIO. Locally you must supply them (see §3.2) |
| Docker | **Not installed on the owner's machine.** Image verification happens in CI |

---

## 3. Verification Harness

### 3.1 Baseline — run this first and record the output

```bash
cd "Mobile App/backend/stitchsense-api" && npm test
cd "Mobile App/stitchsense-expo"       && npm run typecheck && npm run lint && npm test
cd "Mobile App/stitchsense-expo"       && npm run check:release-config   # expected to FAIL today
```

Expected at the time of writing: backend 33 pass / 28 skip / **0 fail**; Expo 60/60 pass; typecheck clean; lint clean; release-config **fails** on two missing RevenueCat keys.

If the baseline differs from this, something changed after 9 October 2026 — reconcile before proceeding.

### 3.2 Enabling the 28 skipped backend integration tests locally

They are the most valuable tests in the repo and they do not run without infrastructure. Mirror CI:

```bash
docker run -d --name ss-test-pg -p 5432:5432 \
  -e POSTGRES_DB=stitchsense_test -e POSTGRES_USER=stitchsense_test \
  -e POSTGRES_PASSWORD=integration-test-only postgres:16-alpine

docker run -d --name ss-test-minio -p 9000:9000 \
  -e MINIO_ROOT_USER=stitchsense-test -e MINIO_ROOT_PASSWORD=stitchsense-test-password \
  quay.io/minio/minio server /data
# then create the bucket stitchsense-test-patterns

export TEST_DATABASE_URL=postgres://stitchsense_test:integration-test-only@127.0.0.1:5432/stitchsense_test
export OBJECT_STORAGE_PROVIDER=minio OBJECT_STORAGE_BUCKET=stitchsense-test-patterns
export OBJECT_STORAGE_REGION=us-east-1 OBJECT_STORAGE_ENDPOINT=http://127.0.0.1:9000
export OBJECT_STORAGE_ACCESS_KEY=stitchsense-test OBJECT_STORAGE_SECRET_KEY=stitchsense-test-password
cd "Mobile App/backend/stitchsense-api" && npm test   # expect 61 pass / 0 skip
```

**If Docker is unavailable on this machine** (it is absent on the owner's), do not install it and do not raise the local requirement — that violates the local-compatibility constraint. Rely on CI for integration runs instead, and say so in your report rather than marking integration coverage unverified-but-assumed.

### 3.3 Test-safety rules (from `AGENTS.md`)

Integration tests must never touch production. Keep the existing `TEST_DATABASE_URL` guards — they are why tests skip rather than silently running somewhere dangerous. Restore global mocks and close app instances, pool connections, storage clients, and temp resources in teardown.

---

## 4. Work Packages

---

### WP-0 · P0 · Commit and push the release-hardening changeset

**Finding:** F-02 · **Blocks:** literally everything else · **Effort:** ~1 day including CI fallout

#### CLAIM

HEAD is 18 days stale. The working tree holds 59 modified files (+4,051/−3,530) and 54 untracked files. **Every CI gate added during hardening depends on untracked files**, so CI has never executed against this code and cannot pass from a clean checkout. This contradicts the Workstream 1 exit gate: *"the entire release source is versioned and remotely recoverable."*

#### VERIFY

```bash
git log -1 --format='%ad %H' --date=iso          # expect 2026-09-21
git status --porcelain | awk '{print $1}' | sort | uniq -c
for f in "tools/run-with-node22.sh" "tools/validate-production-artifacts.mjs" \
         "tools/validate-mobile-release-artifacts.mjs" "ops/monitoring/stitchsense-alerts.yml" \
         "ops/monitoring/stitchsense-dashboard.json" "Mobile App/backend/scripts/smoke-api.sh" \
         "Mobile App/stitchsense-expo/scripts/validate-release-config.mjs"; do
  printf '%-70s %s\n' "$f" "$(git ls-files --error-unmatch "$f" >/dev/null 2>&1 && echo TRACKED || echo UNTRACKED)"
done
```

All seven should print `UNTRACKED`. Each is referenced by `.github/workflows/ci.yml`. Additionally, every `npm` script in both `package.json` files invokes `tools/run-with-node22.sh`.

#### REQUIRED CHANGE

1. **Do WP-1 first if you are committing in one pass** — otherwise you will push a changeset whose `production-image` job fails. Either order the commits so WP-1 lands in the same PR, or accept one known-red CI run and fix forward immediately.
2. Commit in **reviewable slices**, not one monolith. Suggested grouping:
   - `tools/` + `ops/monitoring/` + `AGENTS.md` (build and ops scaffolding CI needs)
   - `Mobile App/stitchsense-expo/scripts/validate-release-config.mjs` + `tests/release-config.test.ts`
   - backend: `secureCompare.ts` + its 4 new test files
   - Expo: `revenuecat-results.ts` + `app-tab-bar.tsx` + `revenuecat-results.test.ts`
   - brand assets (`app-icon.png`, `android-adaptive-foreground.png`, `splash-logo.png`)
   - the 35 `docs/` evidence templates
   - the 59 modified files, grouped by concern (CI, backend config/routes/services, Expo screens, API contract)
3. **Before committing, confirm no secret is being introduced.** Run the same Gitleaks version CI pins:
   ```bash
   gitleaks detect --source . --no-git --redact --verbose
   ```
   Note this will **not** catch the n8n secret (WP-3) — that is a separate package and a known gate weakness.
4. Confirm `.env.local` and `.env*` remain gitignored. They are today; keep it that way.
5. Push the branch, open a PR, and let CI run **from a clean checkout**.

#### ACCEPTANCE

- `git status --porcelain` shows no untracked file that any `package.json` script, `ci.yml` step, or `Dockerfile` instruction references.
- The PR's CI run is **green on all six jobs**, including `production-image`.
- `git rev-list --left-right --count origin/main...HEAD` is understood and documented (currently `0 3` — three commits behind main, zero ahead, which is itself worth reconciling).

#### OUT OF SCOPE

Do not refactor anything in the files you are committing. Commit them as they are. If a file looks wrong, raise it as a finding — do not fix it inside WP-0.

---

### WP-1 · P0 · Restore a buildable production image

**Finding:** F-01 · **Blocks:** every deploy, and CI's `production-image` job · **Effort:** <1 hour

#### CLAIM

The working tree rewrote the backend's `build` and `start` scripts to route through `bash ../../../tools/run-with-node22.sh`. The Docker build context is `Mobile App/backend/stitchsense-api`, so `../../../tools/` resolves **outside** the context and is never copied by `COPY . .`. The image build fails at `RUN npm run build`, and `CMD ["npm", "start"]` would also fail.

Committed (`HEAD`) versus working tree:

| Script | `HEAD` (works in container) | Working tree (breaks container) |
|---|---|---|
| `build` | `tsc -p tsconfig.json` | `bash ../../../tools/run-with-node22.sh npx tsc -p tsconfig.json` |
| `start` | `node dist/server.js` | `bash ../../../tools/run-with-node22.sh node dist/server.js` |

#### VERIFY

Docker is not installed locally, so reproduce the build stage by replicating the context exactly — only files `COPY . .` can see:

```bash
T=$(mktemp -d)/app && mkdir -p "$T"
cd "Mobile App/backend/stitchsense-api"
cp package.json package-lock.json tsconfig.json "$T/" && cp -R src "$T/"
cd "$T" && npm run build
```

Expected: `bash: ../../../tools/run-with-node22.sh: No such file or directory`.

If you have Docker, the direct check is better: `docker build --tag ss-verify .` from the backend directory.

#### CONTEXT YOU MUST NOT BREAK

`tools/run-with-node22.sh` exists because **the owner's machine may not default to Node 22**. It selects a Node 22 runtime via nvm, then `exec "$@"`. When Node is already 22.13+, it is a pure passthrough — which is the case in both the Docker image (22.23.0) and CI (22.23.0 via `setup-node`). **It is redundant in the container and essential locally.** Removing it wholesale would violate the local-compatibility constraint.

#### REQUIRED CHANGE

In `Mobile App/backend/stitchsense-api/package.json`:

```jsonc
{
  "build": "tsc -p tsconfig.json",                 // container + CI path: no wrapper
  "start": "node dist/server.js",                  // container entrypoint: no wrapper
  "build:local": "bash ../../../tools/run-with-node22.sh npx tsc -p tsconfig.json",
  "start:local": "bash ../../../tools/run-with-node22.sh node dist/server.js",
  "dev":  "bash ../../../tools/run-with-node22.sh npx tsx watch src/server.ts",   // keep
  "test": "bash ../../../tools/run-with-node22.sh npm run build && bash ../../../tools/run-with-node22.sh node --test --test-concurrency=1 tests/*.test.mjs"  // keep
}
```

Then audit every other script in that file (`migrate`, `audit:*`, `migration:wordpress`, `seed:demo`, `validate:pattern-files`). Any script that runs **inside the container** must not use the wrapper. `migrate` in particular is run against production — check how it is invoked in `docker-compose.vps.yml` and `docs/OPERATIONS_RUNBOOK.md` before deciding.

Apply the same reasoning to `Mobile App/stitchsense-expo/package.json`, but note the Expo scripts never run in a container, so the wrapper is appropriate there. **Leave Expo alone** unless you find a CI step that breaks.

#### ACCEPTANCE

- The isolated-context reproduction above now succeeds (or `docker build` succeeds end to end).
- CI's `production-image` job is green.
- `npm run dev`, `npm test`, and the local scripts still work on a machine whose default `node` is **not** 22 — this is the local-compatibility guarantee. If you cannot test that condition, state so explicitly.
- `docs/OPERATIONS_RUNBOOK.md` and both compose files still reference commands that exist.

#### TESTS TO ADD

Add a CI guard so this cannot regress — a step that greps the backend `package.json` and fails if `build` or `start` contains `run-with-node22.sh`. Cheap, and it permanently closes the class of bug.

---

### WP-2 · P0 · Encrypt and firewall the AI/vector transport

**Finding:** F-05 · **Blocks:** truthful privacy declarations (WP-14) · **Effort:** ~1 day · **Partly HUMAN (infra access)**

#### CLAIM

The tracked n8n workflow exports call these over **plain HTTP at a bare public IP** (Contabo range):

| Endpoint | Carries |
|---|---|
| `http://173.249.40.161:2010/api/embeddings` | pattern text sent for embedding |
| `http://173.249.40.161:6333/collections/knitting_knowledge/points/search` | query vectors |
| `http://173.249.40.161:6333/collections/knitting_knowledge/points/scroll` | **returns pattern content** |
| `http://173.249.40.161:8990` | secondary service in the older workflow |

User pattern content — including purchased copyrighted PDFs — transits in cleartext. This contradicts the backend's own production rule, which requires every n8n URL to be HTTPS (`requireProductionHttpsUrl` in `src/config.ts`), and it cannot be squared with an "encrypted in transit" answer on the Apple privacy labels or the Google Data Safety form.

#### VERIFY

```bash
grep -rno "http://1[0-9][0-9]\.[0-9]*\.[0-9]*\.[0-9]*:[0-9]*" --include=*.json . | grep -v node_modules | sort -u
```

Then confirm against the **live** n8n instance, not the exports — these are dated June/July 2026 and may be stale (see WP-17). Check whether 6333 and 2010 are reachable from outside the host.

#### REQUIRED CHANGE

1. Terminate TLS in front of Qdrant and the embedding service. The StitchSense Nginx Proxy Manager already fronts the API and is configured with 600-second read/send timeouts for long Ravelry imports — reuse it rather than introducing new infrastructure.
2. Alternatively, or additionally, move both services onto a private network or WireGuard link so n8n reaches them without traversing the public internet.
3. **Firewall ports 6333 and 2010 to the n8n host only.** A vector store holding every user's pattern content must not be reachable on a public IP, api-key header or not.
4. Update the workflow node URLs to the HTTPS/private addresses and re-export (coordinate with WP-3 and WP-17 so the workflows are touched once).
5. Verify the Qdrant api-key is still supplied via `$env.QDRANT_API_KEY` — it currently is, which is correct. Do not inline it.

#### ACCEPTANCE

- No tracked file contains a cleartext `http://` endpoint carrying user content.
- From a host that is not the n8n server, 6333 and 2010 refuse connection.
- A pattern chat round-trip still works end to end after the change — this is a payload-contract boundary, so test the real flow, not just connectivity.
- The "encrypted in transit" answer in `docs/PRIVACY_DATA_SAFETY_WORKSHEET.md` can be answered **yes** truthfully.

---

### WP-3 · P0 · Rotate the committed n8n secret and sanitise the workflow exports

**Finding:** F-03 · **Effort:** ~half a day

#### CLAIM

Two **tracked** files at the repository root hardcode the n8n webhook shared secret as a plaintext string literal in the `Validate Request` node:

- `StitchSense Chat API - Qdrant RAG + Client History - UK Metric.json`
- `Pattern Helper AI - RAG Chat API - v7.6.0 - Google Drive Storage.json`

```js
const expectedSecret = '<40-char literal>';
const providedSecret = headers['x-pattern-helper-secret'] || body.secret || '';
if (expectedSecret && providedSecret !== expectedSecret) { /* 401 */ }
```

It is in git history, so editing the files does not remove it. Gitleaks does not flag it because the value matches no provider-specific rule. Note the asymmetry: the backend requires secrets of this class to be ≥32 characters, validates them at startup, and compares the WordPress and RevenueCat secrets in **constant time** via `secureStringEquals`. The n8n side undoes all of that with a literal in source control and a `!==` comparison.

#### VERIFY

```bash
grep -l "expectedSecret = '" *.json
for f in *.json; do printf '%-70s %s\n' "$f" "$(git ls-files --error-unmatch "$f" >/dev/null 2>&1 && echo TRACKED || echo UNTRACKED)"; done
```

Both workflow files should print `TRACKED`. Do not paste the secret value into any report, commit message, or issue.

#### REQUIRED CHANGE

1. **Rotate first, then commit.** Generate a new ≥32-character secret. Update it in n8n and in the backend's `N8N_SHARED_SECRET`, `N8N_CHAT_SHARED_SECRET`, and `N8N_UPLOAD_SHARED_SECRET` (see `src/config.ts` for the fallback chain — chat and upload fall back to the shared value when unset).
2. Change the workflow `Validate Request` nodes to read `$env.N8N_SHARED_SECRET` and use a **length-checked, constant-time-ish** comparison rather than `!==`.
3. Re-export the workflows with no secret material and commit the sanitised versions.
4. **Add a Gitleaks custom rule** for this secret shape (long alphanumeric literal assigned to an `expectedSecret`/`secret`/`sharedSecret` identifier inside `.json`) so the gate catches a recurrence. Verify the rule fires against the pre-rotation value before you delete it.
5. Treat the old value as permanently compromised. Do not attempt history rewriting unless the owner explicitly asks — it is disruptive and the rotation is what actually closes the exposure.
6. Audit the three PHP proxies (`stitchsense-chat-proxy.php`, `stitchsense-image-proxy.php`, `stitchsense-upload-proxy.php`) and `class-stitchsense-workflow-client.php` for the same pattern. My scan found nothing, but it was grep-based — confirm properly.

#### ACCEPTANCE

- No tracked file contains a secret literal.
- The new Gitleaks rule fires on a deliberate test case and the CI `secrets` job stays green on the clean tree.
- Pattern chat, pattern upload, and Stitch Vision all still authenticate to n8n after rotation. **Test all three** — they use different secret variables.
- `docs/OPERATIONS_RUNBOOK.md` secret-rotation section reflects what you actually did.

---

### WP-4 · P0 · Close the pattern-context leak in the vision route and the Qdrant filter

**Finding:** F-04 · **Highest-impact finding in the report** · **Effort:** 1–2 days

#### CLAIM — two defects, one exploit chain

**Defect A — backend.** `src/routes/vision.ts:22-33` is the **only** route that spreads raw client input into an outbound AI payload, and the **only** protected route with no Zod schema at all:

```ts
const body = request.body && typeof request.body === 'object' ? (request.body as Record<string, unknown>) : {};
const payload = { ...body, /* a few fields overridden */ user_id: request.authUser.id };
```

Entitlement is checked correctly (`hasFeature(entitlement, 'stitchVision')` → `402`). The problem is the payload, not the gate.

**Defect B — n8n.** The chat workflow's `Prepare Qdrant Search` node builds its retrieval filter from `project_id`, `file_id`, or `job_id` **with no `user_id` conjunct**:

```js
function buildScopeFilter() {
  if (req.project_id) return { must: [{ key: 'project_id', match: { value: req.project_id } }] };
  if (req.file_id)    return { must: [{ key: 'file_id',    match: { value: req.file_id    } }] };
  if (req.job_id)     return { must: [{ key: 'job_id',     match: { value: req.job_id     } }] };
  if (patternPriority) return { must: [{ key: 'project_id', match: { value: '__no_pattern_scope_available__' } }] };
  return null;   // ← unfiltered search across the entire shared collection
}
```

All users' pattern chunks live in **one** collection, `knitting_knowledge`. The `image` workflow type falls back to the chat URL (`config.n8n.imageUrl || config.n8n.chatUrl` in `src/services/workflows.ts`).

**Chain:** an authenticated, entitled user posts `/vision/analyse` with a `file_id` or `job_id` belonging to another user → the field survives the spread → the workflow scopes retrieval to that other user's chunks → the model answers from another user's pattern content.

**Separately:** when no scope key is present and `answer_mode` is not `pattern_priority`, `buildScopeFilter()` returns `null` and Qdrant runs an **unfiltered similarity search over the whole collection**. General helper-chat answers can therefore surface any user's uploaded pattern.

**Also:** the backend carefully builds `buildScopedWorkflowUserId()` → `pattern:{userId}:{patternId}:{sessionId}` and sends it as `user_id`, but **the workflow never uses it for filtering.** The design intent is not honoured downstream.

#### WHAT IS AND IS NOT ESTABLISHED

| Claim | Status |
|---|---|
| `vision.ts` spreads unvalidated client body into the AI payload | **Confirmed** by inspection |
| `vision.ts` has no request schema | **Confirmed** |
| The repo's workflow export filters without a user constraint | **Confirmed** |
| `buildScopeFilter()` returns `null` → unfiltered search | **Confirmed** in the export |
| The scoped `user_id` is unused for retrieval | **Confirmed** in the export |
| The chain is live in production | **NOT verified** — depends on the deployed `N8N_IMAGE_URL`, on whether the deployed workflows match these exports, and on the WordPress image proxy being bypassed |

**Your first job is to settle that last row.** Fix the code regardless — it is wrong on its own terms under `AGENTS.md` — but determine the live blast radius, because it changes whether this is a disclosure incident or a latent defect.

#### VERIFY

```bash
grep -rn '\.\.\.body' "Mobile App/backend/stitchsense-api/src/routes/"     # expect only vision.ts:26
grep -n "z.object" "Mobile App/backend/stitchsense-api/src/routes/vision.ts"  # expect no matches
grep -n "patternId\|session.file_id\|session.job_id" "Mobile App/backend/stitchsense-api/src/routes/chats.ts"
grep -n "file_id\|job_id\|project_id" "Mobile App/backend/stitchsense-api/tests/vision-route.integration.test.mjs"  # expect none
```

Then, against **staging** (never production, and never another real user's data):
1. Create users A and B. Upload a pattern as A; capture its `file_id` / `job_id` / `project_id`.
2. As B, `POST /vision/analyse` with A's identifiers in the body.
3. Inspect the outbound n8n payload and the returned answer. Does any of A's pattern content appear?
4. Repeat with `answer_mode` absent to test the unfiltered-search path.

#### REQUIRED CHANGE

**Backend — `src/routes/vision.ts`:**

1. Add a Zod schema. Accept **only**: `question`, `image_data_uri` (or `imageDataUri`), `mime_type`, `skill_level`, `tool_mode`, and an optional `pattern_id`. Reject unknown keys — use `.strict()`.
2. **Delete the `...body` spread.** Build the payload field by field.
3. If `pattern_id` is supplied, resolve the pattern server-side with an ownership check (`WHERE id = $1 AND user_id = $2`) and derive `project_id` / `file_id` / `job_id` from that row — never from the request. Mirror `chats.ts:555-602` exactly.
4. Send `user_id: buildScopedWorkflowUserId(request.authUser.id, patternId)` for consistency with chat, and keep `platform_user_id` as the raw user id.
5. Keep the existing WordPress-image-proxy-first behaviour and the 404-only fallback to the direct workflow. That is an **intentional fallback** — `AGENTS.md` requires preserving and testing it. Do not collapse it.

**n8n workflows:**

6. Add `user_id` (or the scoped namespace, whichever matches the Qdrant payload schema — **check what is actually indexed** before choosing) as a mandatory `must` clause in **every** branch of `buildScopeFilter()`, including the scroll body.
7. Make an absent scope **fail closed**: return an explicit "no pattern scope available" response rather than searching the whole collection. The `patternPriority` branch already does something like this with its `__no_pattern_scope_available__` sentinel — extend that idea to the `null` return.
8. Confirm the indexing workflow actually writes `user_id` into each point's payload. **If it does not, the filter cannot work and indexing must be fixed first** — this is the one place where the fix may be larger than it looks. Check before you commit to an approach.
9. Re-export and commit (coordinate with WP-2, WP-3, WP-17 — touch the workflows once).

#### TESTS TO ADD — mandatory

In `tests/vision-route.integration.test.mjs`, following the existing cross-user patterns in `pattern-routing-contamination.integration.test.mjs` and `authorization.integration.test.mjs`:

| Test | Expectation |
|---|---|
| Unauthenticated `POST /vision/analyse` | `401` |
| Entitled owner, valid body | `201`, workflow called with server-derived scope |
| Entitled user supplies **another user's** `file_id` | field **absent** from the outbound payload (assert on the captured payload, not just the status) |
| Entitled user supplies another user's `job_id` / `project_id` | same |
| Unknown keys in body | `400` |
| Entitlement denied | `402` |
| `pattern_id` owned by another user | `403`/`404`, no workflow call |
| Deleted pattern id | denied |
| WordPress proxy 404 | falls back to direct workflow (preserve the fallback) |
| WordPress proxy non-404 error | `502`, no fallback |

Also extend the existing pattern-contamination suite to assert that an A/B mismatch in the vision payload is impossible.

#### ACCEPTANCE

- `grep -rn '\.\.\.body' src/routes/` returns nothing.
- Every test above passes against Postgres + MinIO.
- A staging reproduction of the cross-user attempt returns no foreign pattern content.
- No Qdrant query path can run without a user constraint.
- Chat, rewrite, and Stitch Vision all still work — this touches a shared workflow, so regression-test all three.

---

### WP-5 · P0 · Store, EAS, and billing infrastructure

**Finding:** F-06 · **Longest lead time in the programme — start in week 1 and run in parallel** · **Largely HUMAN**

#### CLAIM

| Item | State | Owner |
|---|---|---|
| `expo.extra.eas.projectId` | **Absent** | agent + owner |
| `expo.owner` | **Absent** | agent + owner |
| RevenueCat iOS / Android SDK keys | **Empty strings** in `app.json`; release gate fails | owner provides, agent wires |
| `ios.buildNumber` / `android.versionCode` | **Absent**, while `eas.json` sets `appVersionSource: "local"` + `autoIncrement` | agent |
| `expo.updates` / `runtimeVersion` | **Absent** — channels declared in `eas.json`, no OTA config | agent |
| App Store Connect products (monthly, annual) | Not created | **HUMAN** |
| Google Play products (monthly, annual) | Not created | **HUMAN** |
| RevenueCat offering + `pro` entitlement mapping | Not configured | **HUMAN** |
| RevenueCat webhook URL + authorization secret | Not configured | **HUMAN** |
| Apple agreements, tax, banking (Starling Business) | Not completed | **HUMAN** |
| Google Play payments profile | Not completed | **HUMAN** |

#### VERIFY

```bash
cd "Mobile App/stitchsense-expo"
grep -n "projectId\|\"owner\"\|\"updates\"\|runtimeVersion\|buildNumber\|versionCode" app.json app.config.js eas.json
npm run check:release-config    # expect failure on both RevenueCat keys
```

#### AGENT TASKS

1. **Wire OTA updates.** Add `expo.updates` with the EAS Update URL and a `runtimeVersion` policy, matching the `development` / `preview` / `production` channels already declared in `eas.json`. **Without this there is no way to hotfix a live defect except a full store resubmission** — 1–3 days of exposure per bug, on a first release with no beta data. Treat it as release-blocking.
2. **Declare `ios.buildNumber` and `android.versionCode`** so `appVersionSource: "local"` + `autoIncrement` behaves deterministically. Confirm the interaction with an actual EAS build rather than assuming.
3. **Make the release gate unbypassable.** `npm run check:release-config` is currently an npm script nothing forces. Add it as an `eas-build-pre-install` hook so no store build can be produced without it. This matters because of a live footgun: `src/lib/config.ts:27-37` falls back to `revenueCatTestStoreApiKey` for **both** platform keys. A production build with `EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY` in the environment would silently use RevenueCat's Test Store — purchases would appear to work and bill nobody. The validator correctly rejects the test-store key when `--require-revenuecat` is passed; the gap is that nothing guarantees it runs in the EAS cloud build.
4. Note for your own understanding: the validator reads `app.json` and `process.env` only. Running it locally **proves nothing about the EAS cloud environment.** The pre-install hook is what makes it meaningful.
5. Once the owner supplies real keys, run the gate with production values and record the output in `docs/EAS_ENVIRONMENT_SETUP_CHECKLIST.md`.

#### ACCEPTANCE

- `npm run check:release-config` passes with real production values.
- A `preview` build completes and installs on a physical device.
- A deliberate OTA update reaches an installed preview build.
- `docs/STORE_CONSOLE_SETUP_CHECKLIST.md` and `docs/EAS_ENVIRONMENT_SETUP_CHECKLIST.md` carry real recorded values, not blanks.

---

### WP-6 · P0 · Stand up staging

**Finding:** F-13 · **Unblocks:** WP-4 verification, WP-10, WP-11, WP-12, and all of Workstream 5 · **Effort:** 3–5 days

#### CLAIM

Workstream 5 sits at **0/7** and Stage 1 Track 2 at **0/13** because there is nowhere to execute them. `docker-compose.staging.yml` and `.env.staging.example` exist; no staging API, database, object storage, WordPress bridge, or n8n instance has been stood up.

Everything that proves the product actually works is blocked on this: WordPress data reconciliation, web→mobile and mobile→web upload flows, bidirectional sync under web-as-master rules, deleted-record resurrection checks, the Ravelry metadata-only matrix, pattern A/B isolation across relaunch and reinstall, and migration rollback.

The only alternative is testing against production, which is unacceptable for destructive and migration scenarios.

#### REQUIRED CHANGE

1. Stand up staging on the existing VPS or a second small instance using `docker-compose.staging.yml`. **Separate database, bucket, secrets, and n8n workflows** — `docs/ENVIRONMENT_CONFIGURATION_MATRIX.md` documents the intended separation; verify it live.
2. Clone a **minimised, anonymised** slice of WordPress data. Personal data must be minimised or anonymised — this is an explicit Workstream 5 requirement, not optional.
3. Verify the separation is real: confirm the staging API cannot reach the production database, bucket, or n8n instance. Test it, do not assume it from config.
4. Point a preview mobile build at staging via `EXPO_PUBLIC_API_BASE_URL`.
5. Run `Mobile App/backend/scripts/smoke-api.sh` against staging and record the result.

#### ACCEPTANCE

- Staging `/health` and `/ready` both return 200, with `/ready` confirming database **and** storage.
- Backend integration tests pass against staging infrastructure.
- A deliberate destructive action in staging is provably invisible in production.
- `docs/ENVIRONMENT_CONFIGURATION_MATRIX.md` reflects verified reality.

---

### WP-7 · P1 · Close the paid-user lockout gap

**Finding:** F-07 · **Most likely source of week-one refunds and one-star reviews** · **Effort:** 2–3 days

#### CLAIM

The only path from a store purchase to a backend entitlement is the RevenueCat webhook (`POST /billing/revenuecat/webhook`). There is **no** client→backend entitlement push and **no** on-demand verification against RevenueCat's REST API.

Meanwhile `effectiveEntitlement()` at `src/lib/entitlement-access.ts:33` prefers the **local RevenueCat snapshot** over the backend entitlement, except for manual sources. So immediately after purchase the UI unlocks while the backend still returns `402` on every AI route.

**Failure mode:** the user pays, the UI says Pro, every AI feature errors. If the webhook is misconfigured, or the API/n8n is down when the event fires, this state is **permanent** — no retry, no reconciliation job, no self-service recovery.

Note what is already *correct* here, so you do not break it: the client configures RevenueCat with the backend user UUID as `appUserID` (`src/lib/revenuecat.ts:76`); the webhook maps `app_user_id` → `users.id`, checks `existingMobileSubscriptionOwner`, and on mismatch writes a `billing.revenuecat.webhook.user_mismatch` audit event and **refuses** the update; replay protection uses a unique index on event IDs (migration `009`). The cross-user entitlement model is sound. **The gap is latency and failure recovery, not authorisation.**

#### VERIFY

```bash
grep -n "app.post\|app.get" "Mobile App/backend/stitchsense-api/src/routes/billing.ts"
# no sync/verify endpoint exists
grep -rn "entitlement" "Mobile App/stitchsense-expo/src/providers/session-provider.tsx"
# no client→backend entitlement push
sed -n '33,46p' "Mobile App/stitchsense-expo/src/lib/entitlement-access.ts"
```

Then on staging: purchase in sandbox with the webhook deliberately misconfigured. Confirm the UI unlocks and `POST /chats/:id/messages` returns `402`.

#### REQUIRED CHANGE

Implement **1 and 3** at minimum; 2 if time allows.

1. **`POST /billing/revenuecat/sync`** — authenticated, rate-limited, no body required. Verifies the calling user's entitlement **directly against the RevenueCat REST API** using `request.authUser.id` as the app user id, then upserts `subscriptions` through the existing `upsertMobileSubscription` path. Reuse the webhook's provider mapping, plan mapping, and status derivation — **do not duplicate that logic**, extract it if needed. Keep the `existingMobileSubscriptionOwner` mismatch guard: a sync must never be able to claim another user's subscription. Requires a RevenueCat **secret** API key in backend config, validated at startup like the others.
   Call it from the client after every successful purchase and restore, and on app foreground when the client observes store-active-but-backend-inactive.
2. **Reconciliation job** for users whose store and backend state disagree.
3. **Telemetry and an alert** on the divergence, via the existing `recordBillingWebhookMetrics` pattern in `src/services/metrics.ts`. Keep labels low-cardinality — there are regression tests asserting the metrics omit event IDs, transaction IDs, and authorization material. **Do not break them.**

#### TESTS TO ADD

| Test | Expectation |
|---|---|
| Unauthenticated sync | `401` |
| Owner sync, RevenueCat reports active | `subscriptions` upserted for that user only |
| Owner sync, RevenueCat reports nothing | no entitlement granted |
| Sync attempt for a subscription already owned by another user | **refused**, audit event written |
| RevenueCat API unreachable | explicit failure, no partial write |
| RevenueCat API 5xx | handled, no entitlement fabricated |
| Cross-user: A syncs, B's entitlement unchanged | isolation preserved |

Extend `tests/revenuecat-webhook.integration.test.mjs` and `tests/billing-revenuecat.test.mjs` rather than starting a new file.

#### ACCEPTANCE

- A sandbox purchase with the webhook disabled still results in working AI features after the client's post-purchase sync.
- Cross-user entitlement tests pass.
- Startup fails closed if the RevenueCat secret key is missing in production, consistent with the existing `validateProductionConfig()` style.

---

### WP-8 · P1 · Read paywall prices from the store

**Finding:** F-08 · **Effort:** ~half a day · **Low risk, high value**

#### CLAIM

`app/paywall.tsx:31-53` hardcodes `price: '£96'`, `price: '£10'`, and `badge: 'Save £24'`. The RevenueCat offering's `product.priceString` is never read — the whole file contains no reference to offerings or products.

Consequences: every non-UK user sees GBP while their store charges local currency; prices drift silently from store configuration; and this is a plausible App Store rejection under accurate-metadata rules, with equivalent Google expectations. The mitigating copy at line 321 ("You will review the final price in the App Store or Google Play before paying") reduces harm but does not make the displayed price correct.

#### VERIFY

```bash
sed -n '31,53p' "Mobile App/stitchsense-expo/app/paywall.tsx"
grep -n "priceString\|getOfferings\|product" "Mobile App/stitchsense-expo/app/paywall.tsx"   # expect nothing relevant
grep -n "packageForPlan\|getOfferings" "Mobile App/stitchsense-expo/src/lib/revenuecat.ts"
```

#### REQUIRED CHANGE

1. `packageForPlan()` in `src/lib/revenuecat.ts:104` is private and already resolves a package per plan with sensible fallbacks. Add an exported `getRevenueCatPlanPricing(userId)` that reuses it and returns `{ monthly: { priceString, price, currencyCode }, annual: {...} }` from `Purchases.getOfferings()`.
2. In `paywall.tsx`, fetch pricing on mount and render `priceString`. Keep a **loading state** and a neutral fallback for when offerings fail to fetch — offerings legitimately fail offline, on an unconfigured build, and in Expo Go.
3. **Compute** the annual saving from the two products instead of hardcoding `'Save £24'`. Hide the badge when either price is unavailable rather than showing a stale number.
4. Keep the existing copy about reviewing the final price in the store — it is good practice.
5. Do not change the purchase flow, the plan identifiers, or the error mapping. `src/lib/revenuecat-results.ts` has tested coverage for cancellation, pending payment, already-purchased, network/offline/timeout, unavailable-product, configuration, and invalid-credential outcomes. **Leave it alone.**

#### TESTS TO ADD

Extend `tests/revenuecat-results.test.ts` or add a pure test for the pricing-shape mapper and the saving calculation: both prices present; monthly only; annual only; neither; zero or malformed price. Keep it pure — the existing Expo tests deliberately avoid rendering.

#### ACCEPTANCE

- No currency symbol or price literal remains in `paywall.tsx`.
- A non-GBP sandbox account sees its own currency.
- The paywall renders sensibly with offerings unavailable.
- `npm test`, `npm run typecheck`, `npm run lint` all clean.

---

### WP-9 · P1 · Backend robustness and information-leakage fixes

**Findings:** F-10, F-11, F-12 · **Effort:** ~1.5 days total · **Three small independent commits**

#### WP-9a — Duplicate registration returns 500 (F-10)

**CLAIM.** `src/routes/auth.ts:215-226` inserts into `users` with no `ON CONFLICT` and no try/catch, while `users.email` is `NOT NULL UNIQUE` (migration `001`). Registering with an existing address raises a unique violation, which the global error handler in `src/app.ts` converts to `500 Internal server error`. A user re-registering instead of signing in — very common — sees a generic server error, and routine user behaviour pollutes error metrics and alerting.

**VERIFY.**
```bash
sed -n '215,227p' "Mobile App/backend/stitchsense-api/src/routes/auth.ts"
grep -n "email TEXT NOT NULL UNIQUE" "Mobile App/backend/stitchsense-api/migrations/001_platform_schema.sql"
```
Then with a test database: register the same email twice; observe `500`.

**CHANGE.** Catch Postgres error code `23505` and return `409` with a clear, non-enumerating message. Then **audit the other insert paths for the same pattern** — at minimum the Ravelry import paths against migration `008`'s unique index, and `linked_accounts`.

**TESTS.** Add to `tests/auth-lifecycle.integration.test.mjs`: duplicate registration → `409`; message does not leak whether the account was created by WordPress bridge or natively.

#### WP-9b — Pattern content in logs, upstream errors to clients (F-11)

**CLAIM.** Two related issues in `src/routes/chats.ts`:

- Lines **668**, **681**, **686** log the entire `aiPayload`, which includes `pattern_instruction_text` (extracted pattern text), the user's question, and chat history. The Fastify redaction config in `src/app.ts` covers `authorization`, `cookie`, `password`, `code`, `refreshToken`, `token`, `secret`, `webhookSecret`, `stripeSecretKey` — but **not** these. Copyrighted pattern content and user conversations therefore land in production logs, conflicting with `docs/DATA_RETENTION_AND_DELETION_POLICY.md`.
- Line **682** returns the upstream n8n error verbatim: `return reply.code(502).send({ error: message })`. One such message in `src/services/workflows.ts` is literally *"Upload workflow rejected the API secret. Check N8N_UPLOAD_SHARED_SECRET on the StitchSense API server..."* — internal configuration detail handed to a mobile client.

**VERIFY.**
```bash
grep -n "aiPayload" "Mobile App/backend/stitchsense-api/src/routes/chats.ts"     # 555, 616, 636, 668, 681, 686
grep -n "code(502)" "Mobile App/backend/stitchsense-api/src/routes/chats.ts"     # 682, 687
grep -n "N8N_UPLOAD_SHARED_SECRET" "Mobile App/backend/stitchsense-api/src/services/workflows.ts"
sed -n '/redact/,/censor/p' "Mobile App/backend/stitchsense-api/src/app.ts"
```

**CHANGE.**
1. Replace payload logging with identifiers and sizes: `patternId`, `sessionId`, `toolMode`, `promptChars`, `contextCount`. Never the content.
2. Add the pattern-text and question fields to the redaction paths as defence in depth.
3. Return a generic `502` with the `requestId`, and keep the upstream detail server-side at `error` level. **Do not discard it** — `AGENTS.md` forbids silently dropping useful error information. Log it, just do not ship it to the client.
4. Apply the same treatment to the `502` in `src/routes/vision.ts:48` (coordinate with WP-4) and check `rewrites.ts` and `patterns.ts` for the same shape.
5. Preserve the existing diagnostic log events (`chat_workflow_attempt`, `chat_workflow_empty`, `chat_workflow_context`) — they are genuinely useful and already low-cardinality.

**TESTS.** Extend `tests/chat-history-routes.integration.test.mjs` and `tests/rewrite-route.integration.test.mjs`: a workflow failure returns a generic 502 with a `requestId` and no upstream text; and assert the response body contains no substring of the injected upstream error.

#### WP-9c — bcrypt cost (F-12)

**CLAIM.** `crypt($N, gen_salt('bf'))` appears at `src/routes/auth.ts:201` (reset), `:222` (register), and `src/scripts/seed-demo-user.ts:21,24`. pgcrypto's default iteration count for `bf` is **6**, well below the 10–12 expected in 2026. Verification also runs inside the SQL query, so every login consumes database CPU rather than application CPU.

**VERIFY.**
```bash
grep -rn "gen_salt" "Mobile App/backend/stitchsense-api/src"
```
Then benchmark on infrastructure matching production (**768MB memory cap, 1.5 CPU cap** per the deployed container limits) at costs 6, 10, and 12.

**CHANGE.** Move to `gen_salt('bf', 12)` **if the benchmark allows**; rehash on next successful login for existing users. Be deliberate here rather than reflexive: cost 12 on a 1.5-CPU cap will add measurable login latency, and the existing rate limit of 10 logins per 15 minutes per IP already bounds brute force. **Cost 10 is a reasonable compromise; cost 6 is not.** Record the benchmark and your choice in `docs/SECURITY_SIGNOFF_CHECKLIST.md`.

**TESTS.** Login succeeds for a pre-existing cost-6 hash; the hash is upgraded after that login; login still succeeds afterwards; password reset produces the new cost.

---

### WP-10 · P1 · Accessibility pass

**Finding:** F-09 · **Effort:** 3–4 days

#### CLAIM

Measured across all screens and components:

| Annotation | Count |
|---|---:|
| `accessibilityLabel` | 19 |
| `accessibilityRole` | 39 |
| `accessibilityHint` | 3 |
| **`Pressable` / `TouchableOpacity`** | **360** |

Roughly 5% of interactive elements have an explicit accessible name. Text-labelled buttons inherit one; **icon-only controls do not** — the camera button, counters, swipe-to-delete, the movable tab bar, sheet dismissals. `docs/ACCESSIBILITY_AUDIT_CHECKLIST.md` exists with 24 evidence rows and is empty.

#### VERIFY

```bash
cd "Mobile App/stitchsense-expo"
for a in accessibilityLabel accessibilityRole accessibilityHint; do
  echo "$a: $(grep -rc "$a" app src --include=*.tsx | awk -F: '{s+=$2} END {print s}')"
done
echo "touchables: $(grep -rc 'Pressable\|TouchableOpacity' app src --include=*.tsx | awk -F: '{s+=$2} END {print s}')"
```

#### REQUIRED CHANGE

1. Label **every icon-only control.** Prioritise: `src/components/navigation/app-tab-bar.tsx`, `src/components/ui/swipe-to-delete.tsx`, `src/components/ui/inline-back-button.tsx`, `src/components/ui/select-sheet.tsx`, `src/components/ui/deadline-sheet.tsx`, `app/(tabs)/camera.tsx`, `app/quick-counter.tsx`, and the counter controls in `app/project/[id].tsx`.
2. Add `accessibilityRole` where semantics are non-obvious, and `accessibilityHint` for destructive and multi-step actions.
3. Run a **real** VoiceOver and TalkBack pass over the top ten flows on hardware. There is no automated substitute.
4. Verify tap targets at 44×44pt minimum.
5. Test at the largest dynamic text size and fix obvious overflow.
6. `src/hooks/use-reduced-motion.ts` exists — confirm `src/components/ui/motion-view.tsx` actually honours it.
7. **Record results in `docs/ACCESSIBILITY_AUDIT_CHECKLIST.md`.** An empty checklist after this work means the work is not done.

#### SCOPE DISCIPLINE

Add accessibility props. **Do not restructure components, rename props, or "tidy" styles while you are in there.** Several of these files are large; an accessibility diff should be readable as exactly that.

#### NOTE — dark mode is a separate decision

`app.json` sets `userInterfaceStyle: "light"` and `src/theme/tokens.ts` defines no dark variants. That is a defensible Stage 1 scope call, but it should be a **recorded decision**, not an oversight — see §8. Do not implement dark mode as part of this package.

---

### WP-11 · P1 · Observability: crash reporting and alert routing

**Findings:** F-15, F-16 · **Effort:** 3–5 days

#### CLAIM — F-15

`docs/CRASH_REPORTING_PLAN.md` selects an approach and defines rollout thresholds. **No SDK is installed** — there is no Sentry, Bugsnag, or Crashlytics dependency in `package.json`. `docs/POST_RELEASE_MONITORING_CHECKLIST.md` defines hold and rollback triggers based on crash-free session rate, **a metric that cannot currently be measured.**

#### CLAIM — F-16

`ops/monitoring/stitchsense-alerts.yml` and `stitchsense-dashboard.json` are well-constructed. The `/metrics` endpoint is secret-guarded with a timing-safe comparison and has regression tests proving low cardinality. But **no Prometheus or Alertmanager scrapes it**, and no routing destination is configured. The uptime workflow runs every 15 minutes and can post to `UPTIME_ALERT_WEBHOOK_URL` — **that secret is not set.** Alerts that fire into nothing are documentation.

#### VERIFY

```bash
grep -rn "sentry\|bugsnag\|crashlytics" "Mobile App/stitchsense-expo/package.json"   # expect nothing
cat ops/monitoring/stitchsense-alerts.yml | head -40
grep -n "UPTIME_ALERT_WEBHOOK_URL" .github/workflows/uptime.yml
```

#### REQUIRED CHANGE

1. Install and configure the crash provider chosen in the plan. Verify a **deliberate test crash symbolises correctly on both platforms** — an unsymbolised crash report is nearly worthless.
2. Enforce the plan's privacy rules: **no pattern content and no PII in breadcrumbs, messages, or tags.** This is the same class of leak as WP-9b — do not fix logs and then reintroduce it through the crash SDK.
3. Reconcile the SDK against `docs/IOS_PRIVACY_MANIFEST_REVIEW.md` and the Apple privacy labels. Adding a crash SDK changes the data inventory and therefore the declarations.
4. Deploy a metrics scraper. **A managed option is preferable** to self-hosting Prometheus on a 768MB container — note the deployed limits before choosing.
5. Wire Alertmanager (or the managed equivalent) to a channel the owner actually reads. Set `UPTIME_ALERT_WEBHOOK_URL`.
6. Add the **missing database-capacity and storage-error rules**. The existing file covers API scrape loss, 5xx rate, route error bursts, auth failure spikes, latency, workflow failures, and billing webhook failures — database and storage are the acknowledged gaps.
7. **Fire one deliberate test alert per class** and confirm each arrives. Record in `docs/OPERATIONS_REHEARSAL_LOG.md`.

#### ACCEPTANCE

- A test crash appears, symbolised, on iOS and Android.
- Crash-free session rate is measurable, so the `POST_RELEASE_MONITORING_CHECKLIST.md` thresholds become enforceable.
- Every alert class has been fired and received at least once.
- The `/metrics` low-cardinality regression tests still pass.

---

### WP-12 · P1 · Backup verification and rollback rehearsal

**Finding:** F-17 · **Effort:** ~2 days · **Depends on WP-6**

#### CLAIM

`BACKUP_RESTORE_EVIDENCE.md`, `MIGRATION_ROLLBACK_REHEARSAL.md`, and `OPERATIONS_REHEARSAL_LOG.md` are complete templates with **blank result columns**. A backup was taken and verified on 26 September, but no fresh pre-release backup exists, no isolated restore has been performed, and no rollback has been rehearsed.

Migration tracking via `schema_migrations` is in place and was verified idempotent — that part is genuinely done. But an unrehearsed rollback during a live incident is where data loss actually happens.

#### REQUIRED CHANGE

1. Take a fresh PostgreSQL backup; verify `pg_restore --list` parses it.
2. Restore to an **isolated** instance. Verify table row counts and a sample of object checksums.
3. Rehearse forward migration and rollback end to end. **Confirm old WordPress behaviour remains available during rollback** — this is an explicit Workstream 5 requirement and the thing most likely to surprise you.
4. Replay a deleted-account check against the restored copy to confirm deletion actually propagated.
5. Record **real values and timings** in all three documents. Rollback duration is the number that matters during an incident.

#### ACCEPTANCE

- All three documents populated with real evidence.
- Rollback duration is known and documented.
- An isolated restore has demonstrably worked, not just been described.

---

### WP-13 · P1 · Static analysis and tests for the WordPress bridge

**Finding:** F-14 · **Effort:** 1 day for static analysis, ~1 week for meaningful tests

#### CLAIM

7,911 lines of PHP across 8 files carry the web-as-master sync contract, the Ravelry integration, the library, and three proxies. CI runs `php -l` — **a syntax check only.** No unit tests, no integration tests, no static analysis.

`AGENTS.md` names the WordPress bridge an external trust boundary and makes sync correctness a P0 workstream. This is the largest untested surface in the system.

#### VERIFY

```bash
wc -l *.php | sort -rn
find . -iname "*test*" -name "*.php" -not -path './node_modules/*'   # expect nothing
grep -n "php -l" .github/workflows/ci.yml
```

#### REQUIRED CHANGE

1. **Start with PHPStan or Psalm in CI.** Cheap, fast, and genuinely productive on a codebase this size. Add it as a job alongside the existing `php` syntax job. Triage what it finds — do not fix everything at once; report and prioritise.
2. Add PHPUnit coverage for, in priority order:
   - `class-stitchsense-platform-client.php` (220 lines) — the API boundary, smallest and highest value
   - `class-stitchsense-workflow-client.php` (261 lines) — n8n auth and payload contract
   - Ravelry **ownership and import guards** in `class-stitchsense-ravelry.php` — specifically the metadata-vs-content distinction and the rule that stale sync data must not resurrect deleted local records
   - the sync export path in `class-stitchsense-library.php` that Workstream 5 reconciliation depends on
3. `stitchsense-assistant-hub-pro.php` is 3,890 lines. **Do not refactor it.** Test around it.

#### ACCEPTANCE

- A PHP static-analysis job runs in CI with an agreed baseline.
- The guards Workstream 5 depends on have test coverage.
- No existing WordPress behaviour changed — this package adds verification, not features.

---

### WP-14 · P1 · Legal, privacy, and store materials

**Finding:** F-18 · **Largely HUMAN** · **Blocked by WP-2**

#### CLAIM

Required for submission, all missing: a stable HTTPS privacy policy URL; terms and subscription terms URL; support/contact URL; Apple privacy labels submitted; Google Data Safety form submitted; and business/legal approval of the privacy policy, terms, subscription terms, retention statements, and deletion process.

Drafts are strong — `PRIVACY_DATA_SAFETY_WORKSHEET.md`, `LEGAL_PUBLICATION_CHECKLIST.md`, `IOS_PRIVACY_MANIFEST_REVIEW.md`. The WordPress site is the obvious host for the public pages.

#### HARD DEPENDENCY

**The privacy declarations cannot be answered truthfully until WP-2 ships.** Both stores ask whether data is encrypted in transit, and today it is not for the AI path. Sequence accordingly, and do not let anyone submit the forms before WP-2 and WP-11 are both done (crash reporting changes the data inventory too).

#### AGENT TASKS

- Verify the data inventory in the worksheet against the **actual** SDK and backend behaviour after WP-2, WP-7, and WP-11. Each of those changes it.
- Confirm the in-app deletion and export flows match what the policy claims. Both exist: `POST /user/delete-account`, `POST /user/delete-data`, `GET /user/export`, surfaced in `app/(tabs)/account.tsx`. Apple's in-app deletion requirement is satisfied.
- Flag the gap noted as F-26: `/user/export` returns a **summary only**, not a downloadable copy. The UI shows counts. That is weak against GDPR portability. See WP-16.

---

### WP-15 · P1 · Device acceptance and store purchase matrices

**Finding:** F-19 · **Effort:** 1–2 weeks · **Cannot be compressed or skipped** · **Depends on WP-5, WP-6**

#### CLAIM

`DEVICE_ACCEPTANCE_MATRIX.md` defines **61 evidence rows** — fresh install, onboarding, login, session restoration, library sync, medium and large PDF upload, pattern viewer download, scoped chat and rewrite, projects, stash, Stitch Vision camera and library, Ravelry connect and import, offline recovery, logout and reinstall, three device sizes, accessibility. **Every result cell is blank.** No signed release build has ever run on physical hardware.

For a React Native app with native modules — SecureStore, image picker, WebView, Reanimated 4, RevenueCat — **Expo Go behaviour is not a reliable proxy for a release build.**

`REVENUECAT_STORE_TEST_MATRIX.md` is likewise empty across purchase, restore, cancellation, pending, expiry, grace, billing issue, refund, revocation, and cross-user entitlement denial.

#### REQUIRED CHANGE

1. Work the full device matrix on real hardware: a small iPhone, a large iPhone, a representative Android phone. iOS is **phone-only** for Stage 1 (`supportsTablet: false`), so tablet rows are legitimately N/A — record that rather than leaving blanks.
2. Work the store purchase matrix in Apple sandbox / TestFlight and Google licence-tester / internal track. **Include the cross-user entitlement denial row** — it is the one that matters most and the easiest to skip.
3. Explicitly test the WP-7 scenario on hardware: purchase, then confirm backend AI features work.
4. Test slow and offline networks, expired sessions, API timeouts, interrupted uploads, background/resume, reinstall, and low-storage.
5. Test Stitch Vision with **real captures and non-English inputs** — the English-only instruction path in `patternWorkflowGuards.ts` is untested against real foreign-language patterns.
6. **Test the large-PDF path deliberately** — see WP-16/F-21. This is where I expect failures.
7. Record every result. A populated matrix is the deliverable.

---

### WP-16 · P2 · Performance, resource, and robustness fixes

**Findings:** F-20 through F-30 · **Effort:** varies · **Independent, do in any order**

| ID | Finding | Verify | Change | Effort |
|---|---|---|---|---|
| F-21 | Upload appends the **same blob three times** (`file`, `data`, `pattern_file`) in `services/workflows.ts` `callUploadWorkflowWithFile`. A 110MB PDF becomes a ~330MB multipart body against a 768MB / 1.5 CPU container → likely OOM or timeout | `grep -n "formData.append" src/services/workflows.ts` | Determine which field the n8n upload workflow actually reads, send **one**. This is a payload-contract change — **change both sides together** per `AGENTS.md` | 0.5d |
| F-22 | Workflow timeouts are **600 s** for chat and upload with **no retry**. One slow request holds a connection for 10 minutes; modest concurrency exhausts the container | `grep -n "timeoutMs" src/services/workflows.ts` | Reduce to a defensible value; add bounded retry with backoff for idempotent calls only. **Do not retry uploads** without idempotency keys | 1d |
| F-23 | Any WordPress **administrator** is auto-promoted to StitchSense `admin` in `issueWordPressBridgeAuth` (`routes/auth.ts`), granting entitlement-granting powers. WordPress account security becomes platform security | `grep -n "administrator" src/routes/auth.ts` | Require explicit allowlisting instead of role inference. **Confirm with the owner first** — this may be relied upon operationally | 0.5d |
| F-24 | Access tokens cannot be revoked. `middleware/auth.ts` only calls `jwtVerify` + a user lookup. Refresh tokens are revocable in `refresh_tokens`; a leaked 15-minute access token is not | read `src/middleware/auth.ts` (35 lines) | The 15-minute TTL is a reasonable mitigation. Add a denylist only if the owner wants it — **document the decision either way** | 1d |
| F-25 | Password reset depends **entirely** on WordPress; returns `503` if the bridge is unconfigured. A WordPress outage removes account recovery for all users | `sed -n '137,210p' src/routes/auth.ts` | Native fallback, or an accepted-and-documented risk with the dependency monitored | 1–2d |
| F-26 | `/user/export` returns a **summary only** — the UI shows counts, not data. Weak against GDPR portability | `sed -n '93,127p' src/routes/users.ts` | Return a downloadable JSON document and save it on-device. Coordinate with WP-14 | 1d |
| F-20 | `app/project/[id].tsx` is **4,393 lines** — directly against the project's own guidance on extracting workflows from large screens. Unreviewable, untestable, highest regression risk in the app | `wc -l "app/project/[id].tsx"` | Extract **behaviour-preserving** logic into tested `src/lib/` modules — counters, work log, materials, marks, photos. `AGENTS.md`: *"If existing behaviour is being extracted rather than changed, preserve it first and prove that preservation with tests."* **Write the tests against current behaviour before you move anything.** Do this as its own PR, never alongside a feature | 3–5d |
| F-27 | No test coverage measurement across 48 test files — gaps are invisible | — | Add `c8`, report in CI, set a floor. Do **not** gate on a number until a baseline exists | 0.5d |
| F-28 | Inconsistent `npm audit` thresholds: backend blocks `high`, Expo only `critical` — and the Expo app is what ships to users | `grep -n "audit-level" .github/workflows/ci.yml` | Align Expo to `high` | 1h |
| F-29 | n8n workflow exports are **stale and unvalidated** — dated June/July 2026, months behind the backend payload contract, no CI validation. `AGENTS.md` requires inspecting existing payload fields and preserving backwards-compatible ones | diff export field names against `aiPayload` in `routes/chats.ts:555` | Re-export from the live instance, diff against the backend contract, add a CI schema check for required fields. Coordinate with WP-2, WP-3, WP-4 | 1–2d |
| F-30 | Branch protection not enabled — nothing enforces that CI passes before merge | GitHub settings | `docs/BRANCH_PROTECTION_SETUP.md` lists the required check names. Enable when the plan permits | 1h |

---

## 5. Execution Sequence

Dependencies are real. Do not parallelise across an arrow.

```
WEEK 1 — restore a trustworthy baseline
  WP-1 (buildable image) ──┐
                            ├──► WP-0 (commit + push + green CI)  ◄── nothing is verifiable before this
  WP-3 (rotate secret) ─────┤
  WP-2 (encrypt transport) ─┘
  WP-4 (pattern-context leak)        ← start immediately, highest impact
  WP-5 (store/EAS/billing)           ← START NOW, longest external lead time
  WP-6 (staging)                     ← unblocks almost everything downstream

WEEKS 2–3 — correctness
  WP-7 (entitlement sync)    needs WP-6
  WP-8 (store prices)        independent
  WP-9 (a/b/c backend fixes) independent
  WP-13 (PHP static analysis) independent
  WP-11 (crash + alerts)     partly needs WP-5
  WP-16: F-21, F-22, F-28, F-29
  → run data/sync reconciliation against staging (Workstream 5 / Track 2)

WEEKS 4–5 — builds and devices
  WP-15 (device + purchase matrices)  needs WP-5, WP-6
  WP-10 (accessibility)               needs a real build
  WP-12 (backup + rollback)           needs WP-6

WEEKS 6–7 — legal, store, beta
  WP-14 (legal + privacy)   needs WP-2 and WP-11 for truthful declarations
  final assets, listing copy, reviewer account
  REAL BETA — TestFlight + Play Internal, non-developer knitters, 2 weeks minimum

WEEKS 8–11 — release
  HUMAN: pricing decision on beta evidence, BEFORE store products are locked
  signed candidates from a tagged green commit
  sign-offs → populate RELEASE_DECISION_LOG.md with real values
  backend deploy before mobile release, using the rehearsed sequence
  submit → phased release → monitor against defined thresholds
```

### Stage exit gates

| Gate | Condition |
|---|---|
| **G1 — Baseline** | CI green from a clean checkout on all six jobs; production image builds; no secret in the tree; no unvalidated client input reaching an AI payload; AI transport encrypted |
| **G2 — Correctness** | `DATA_SYNC_RECONCILIATION_RUNBOOK.md` populated; no open data-loss, cross-user, resurrection, or pattern-contamination issue |
| **G3 — Device** | No open P0/P1 mobile defect; purchase, restore, and expiry verified on both real stores; populated device matrix |
| **G4 — Operations** | Crash reporting live and verified; every alert class fired and received; rollback rehearsed with recorded timings |
| **G5 — Store** | Legal URLs published; privacy declarations submitted truthfully; listings complete and consistent with actual app behaviour |
| **G6 — Beta** | Two weeks of non-developer use; all P0/P1 fixed; affected regression suites rerun |
| **G7 — Release** | `RELEASE_DECISION_LOG.md` fully populated with real evidence; all sign-offs recorded |

---

## 6. Definition Of Done

### Per work package

1. The finding **reproduced** before the change, with the output recorded.
2. The smallest sufficient change made — no adjacent refactoring.
3. Acceptance criteria demonstrably met.
4. Required tests added and passing.
5. Backend: `npm test` with Postgres + MinIO available (or an explicit statement that infrastructure was unavailable and CI covered it).
6. Expo: `npm run typecheck && npm run lint && npm test` all clean.
7. Final diff inspected. User isolation, entitlement, and pattern-context implications considered **and stated**, even when the answer is "none."
8. External-integration failure paths verified, and **intentional fallbacks preserved and tested.**
9. The relevant `docs/` evidence file updated with **real** values.
10. Committed and pushed. Nothing sits uncommitted overnight — that is what caused F-01 and F-02.

### Reporting convention — adopt this

The current plan marks items `[x]` when a document was written, with an honest annotation explaining that execution remains. The checkbox and the annotation disagree, and the checkbox is what gets counted. Roughly 20 items are affected.

```
- [x] Item   → evidence recorded, gate genuinely closed
- [d] Item   → documented but NOT executed (prepared, not proven)
- [ ] Item   → not started
```

Apply this to `PRODUCTION_READINESS_ACTION_PLAN.md` and `STAGE_1_RELEASE_BUILD_ACTION_PLAN.md`. It will drop the apparent completion percentage. That is the point.

### Global release DoD

Nothing is production-ready while required verification is outstanding. Specifically: **no "production-ready" claim** until G1–G7 all pass, `RELEASE_DECISION_LOG.md` is populated with real values, and the device and store matrices contain results rather than row labels.

---

## 7. Guardrails

**Do not:**

- Perform broad rewrites. Every package above is a targeted change. `project/[id].tsx` (4,393 lines) and `stitchsense-assistant-hub-pro.php` (3,890 lines) are both tempting and both out of scope except via F-20's explicit, test-first, standalone extraction.
- Combine a fix with unrelated cleanup. One package, one concern, one PR.
- Weaken an entitlement check to make something downstream work. If a feature needs an entitlement it does not have, that is the finding.
- Trust a client-supplied resource ID. Resolve ownership server-side. This is WP-4's entire subject.
- Move responsibilities between the app, API, WordPress, and n8n. Those boundaries are contracts.
- Change one side of a payload contract. n8n and WordPress payloads change on **both** sides, together.
- Silently discard error information. Log it server-side; return something generic to the client. Both, not either.
- Remove an intentional fallback because it complicates a fix. The WordPress-proxy-then-direct-workflow pattern in vision, chat, and rewrite is deliberate. Preserve and test it.
- Raise local development requirements. No Node, npm, Expo, Xcode, Android Studio, Docker, or simulator version bumps. `tools/run-with-node22.sh` stays for local use.
- Point integration tests at production. Keep the `TEST_DATABASE_URL` guards that make tests skip rather than run somewhere dangerous.
- Modify production schema by hand instead of writing a migration.
- Leave orphan records. Uploads are multi-stage; if a later required step fails, clean up what earlier steps created. The existing rollback coverage in `src/lib/pattern-upload-flow.ts` and `chat-upload-flow.ts` shows the expected shape.
- Paste secrets into reports, commit messages, issues, or test fixtures.
- Mark a gate closed because you wrote a document about it.

**Do:**

- Read `AGENTS.md` in full before your first change. It is currently **untracked** — commit it in WP-0.
- Copy `chats.ts:555-602` whenever you touch an AI payload. It is the reference implementation.
- Add a cross-user denial test to every route you touch. `authorization.integration.test.mjs` and `pattern-routing-contamination.integration.test.mjs` are the patterns.
- Prefer real boundaries over mocks. The suite already favours DB-backed and MinIO-backed tests — stay with that.
- Report back on findings that did not reproduce. A disproved finding is a useful result, not a failure.

---

## 8. Decisions For The Owner — Not The Agent

Do not make these calls. Surface them, with whatever evidence you have gathered.

| # | Decision | Why it is not yours | Agent input needed |
|---|---|---|---|
| 1 | **Pricing: £10/month and £96/year.** Competitors: Knittle at $1.99/mo, $9.99/yr, or $29.99 one-time; knitCompanion free with a one-time IAP. StitchSense is roughly 5–10× the category. This is the **single biggest commercial risk** in `Claude_Report.md` — it is more likely to decide the outcome than any bug on this list | Commercial judgement, and it determines the store products that get locked in | Instrument the paywall so the beta produces conversion data. Make the decision **before** store products are created |
| 2 | **Free tier versus hard paywall.** RevenueCat 2026: hard paywalls convert at a 10.7% Day-35 median versus 2.1% for freemium — but a free tier buys organic discovery and review volume, which are the hardest things to acquire cold | Business model | Note that server-side gating already supports either shape without code change |
| 3 | **Trial design.** Currently 30 days, no card. 17–32 day trials convert best (42.5% median), but no-card opt-in trials convert far worse than card-required. Good on length, weak on type | Commercial | Instrument it; report real numbers from beta |
| 4 | **Dark mode for Stage 1.** `userInterfaceStyle: "light"`, no dark tokens. Defensible scope call; visible omission in a 2026 release | Scope and schedule | Estimate the cost. `src/theme/tokens.ts` is centralised, so it is cheaper than it looks |
| 5 | **Ravelry API terms.** Research could not retrieve the third-party API terms. An API policy or rate-limit change could remove a headline feature overnight. The `metadata` vs `content` distinction in the code is the right defensive posture | Requires contacting Ravelry | Confirm exactly what the app caches and transmits so the question can be asked precisely |
| 6 | **WordPress-admin auto-promotion (F-23).** May be relied upon operationally | Operational | Document the current behaviour and the blast radius |
| 7 | **Access token revocation (F-24).** 15-minute TTL may be an acceptable mitigation | Risk appetite | Cost the denylist; document whichever way it goes |
| 8 | **Marketing and discovery.** 66 release documents contain **no marketing plan.** For a £96/year product, discovery is the whole game, and it is the largest unaddressed risk in the programme — technical or otherwise | Commercial | Nothing. Flag that it is missing and keep flagging it |
| 9 | **Beta duration and cohort.** Two weeks with non-developer knitters is the recommendation. It is also the highest-value risk reduction available | Schedule | Prepare the build and the feedback intake per `BETA_FEEDBACK_TRIAGE.md` |

---

## 9. Command Cheat Sheet

```bash
# Baseline
cd "Mobile App/backend/stitchsense-api" && npm test
cd "Mobile App/stitchsense-expo" && npm run typecheck && npm run lint && npm test
cd "Mobile App/stitchsense-expo" && npm run check:release-config

# Git state
git log -1 --format='%ad %H' --date=iso
git status --porcelain | awk '{print $1}' | sort | uniq -c
git diff --shortstat && git ls-files --others --exclude-standard | wc -l

# Is a CI dependency tracked?
git ls-files --error-unmatch <path> >/dev/null 2>&1 && echo TRACKED || echo UNTRACKED

# Secrets
gitleaks detect --source . --no-git --redact --verbose
grep -rnoE "(secret|token|api[_-]?key|password)['\"]?\s*[:=]\s*['\"][A-Za-z0-9_+/=-]{20,}['\"]" \
  --include=*.php --include=*.json . | grep -v node_modules

# Cleartext endpoints
grep -rno "http://1[0-9][0-9]\.[0-9]*\.[0-9]*\.[0-9]*:[0-9]*" --include=*.json . | grep -v node_modules | sort -u

# Raw client body reaching an outbound payload
grep -rn '\.\.\.body' "Mobile App/backend/stitchsense-api/src/routes/"

# Entitlement gate audit
grep -rn "hasFeature" "Mobile App/backend/stitchsense-api/src/routes/"

# Accessibility density
cd "Mobile App/stitchsense-expo" && for a in accessibilityLabel accessibilityRole accessibilityHint; do
  echo "$a: $(grep -rc "$a" app src --include=*.tsx | awk -F: '{s+=$2} END {print s}')"; done

# Docker build-stage simulation (no Docker required)
T=$(mktemp -d)/app && mkdir -p "$T" && cd "Mobile App/backend/stitchsense-api" \
  && cp package.json package-lock.json tsconfig.json "$T/" && cp -R src "$T/" && cd "$T" && npm run build

# Plan progress
grep -c '^- \[x\]' docs/PRODUCTION_READINESS_ACTION_PLAN.md
grep -c '^- \[ \]' docs/PRODUCTION_READINESS_ACTION_PLAN.md
```

---

## 10. Summary For The Agent

StitchSense has done the hard part. The architecture is sound, user isolation is designed in rather than bolted on, entitlement enforcement is consistent across every paid route, the schema is clean, and there is not a single `TODO` in ~37,600 lines of application TypeScript. Backend tests pass, Expo tests pass, typecheck and lint are clean.

**Your job is not to improve the design. It is to make the build real and prove it works.**

Four things block any release and all four were introduced or left open in the last three weeks: the production image does not build (WP-1), the release source is not committed so CI has never run against it (WP-0), a live secret sits in version control while AI traffic crosses the public internet in cleartext (WP-3, WP-2), and one route lets a client influence RAG retrieval scope against a filter that has no user constraint (WP-4).

Under those, ~35 genuinely excellent evidence documents are empty. The device matrix has 61 rows and zero results. **That is the heart of it: the project has been marking gates closed when a document was written.** Adopt the `[d]` convention in §6, watch the percentage drop, and then earn it back with evidence.

Start with WP-1, then WP-0. Nothing else is verifiable until CI runs green from a clean checkout.

And when you are done with the engineering, make sure §8 item 1 reaches the owner. **£10/month in a £1.99 category, with no discovery plan, is more likely to decide whether this product succeeds than every bug in this document combined.**

---

*Derived from [`Claude_Report.md`](Claude_Report.md), 9 October 2026. Findings were verified by direct inspection or local execution against the working tree, except where explicitly marked as requiring verification you are better placed to perform. No application code, configuration, or project documentation was modified in producing either document.*
