# StitchSense Branch Protection Setup

Use this when the GitHub repository plan supports rulesets or branch protection.

## Required Checks

| Check | Required | Notes |
| --- | --- | --- |
| Backend build, test, and audit | Yes | Includes PostgreSQL/MinIO integration services in CI |
| Expo lint, types, dependencies, and Doctor | Yes | Includes release-config and screenshot helper checks |
| PHP syntax | Yes | WordPress/plugin source syntax |
| Secret scan | Yes | Gitleaks over release tree |
| Operations artifact checks | Yes | Monitoring and production artifact validation |
| Production image build | Yes | Must depend on all preceding gates |

Use the current `.github/workflows/ci.yml` job names when configuring required status checks:

- `Backend build, test, and audit`
- `Expo lint, types, dependencies, and Doctor`
- `PHP syntax`
- `Secret scan`
- `Operations artifact checks`
- `Production image build`

## Ruleset Settings

| Setting | Desired value | Evidence / notes |
| --- | --- | --- |
| Require pull request before merge | Enabled |  |
| Require status checks before merge | Enabled |  |
| Require branches to be up to date | Enabled where practical |  |
| Restrict force pushes | Enabled |  |
| Restrict deletions | Enabled |  |
| Require conversation resolution | Enabled |  |
| Admin bypass | Disabled where plan permits |  |

## Decision

| Field | Value |
| --- | --- |
| Branch-protection decision | Blocked by plan / Enabled |
| GitHub owner |  |
| Decision time |  |
| Follow-up issues |  |
