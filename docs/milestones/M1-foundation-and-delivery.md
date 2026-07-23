# M1 — Foundation and Delivery

**Status:** Not Started  
**Owner:** Brian  
**Implementation lead:** Claude  
**PM/QA:** Codex  
**Primary model:** Claude Sonnet 5, `high` effort  
**Review model:** Claude Opus 4.8, `high` effort  
**Estimated focused time:** 3–4 days  
**Production impact:** Isolated non-production Dash2 deployment only

## Outcome

Create the approved Dash2 repository/application foundation so a clean checkout can install, validate, test, build, run locally, migrate an empty local database, and deploy to an isolated preview environment without touching V1.

## Prerequisites

- M0 is Accepted.
- Repository/location, stack, environment, and deployment decisions are recorded.
- Preview Cloudflare resources and secret ownership are identified.

## In scope

- Approved repository/workspace structure.
- Strict TypeScript and reproducible package scripts.
- React/Vite web shell and Hono Worker/API shell if approved in M0.
- Shared API contract/validation boundary.
- Local D1/KV bindings and first schema/version migration.
- Formatting, linting, typechecking, unit tests, build, and CI.
- Static asset/API routing.
- Stable error envelope, request IDs, health/version response, log-redaction baseline, and security headers.
- Environment documentation for local, preview, staging, and production without secret values.
- Isolated preview deployment and rollback/teardown notes.

## Out of scope

- Google OAuth beyond a stub/placeholder boundary.
- Domain tables other than minimal schema-version support.
- Task, sheet, membership, admin, public, or migration features.
- Production resource creation, DNS, or real-user data.
- Broad UI design beyond a shell and explicit loading/error/unauthenticated placeholders.

## Work packets

### M1.1 — Scaffold and commands

Create the approved structure and scripts. Document exact supported runtime/package-manager versions and commands. Ensure generated output and local state are ignored.

### M1.2 — Worker/web routing

Prove static application routes, `/api/v1/*`, unknown API routes, SPA fallback, and asset caching behave deliberately. Private/API responses default to `no-store`.

### M1.3 — Quality gates

Add CI for clean install, format check, lint, typecheck, unit tests, migration apply, and production build. CI must fail closed and use synthetic/local resources.

### M1.4 — Operational baseline

Add request IDs, structured/redacted errors, health/version, baseline headers, environment validation, and a preview deployment runbook.

## Acceptance criteria

- [ ] A clean checkout succeeds using one documented command sequence.
- [ ] Local database creation and all migrations succeed from empty state twice.
- [ ] The application shell loads and `/api/v1/health` (or approved equivalent) returns version/schema information without binding or secret detail.
- [ ] Unknown API routes return the stable JSON error envelope; client routes use the approved SPA behavior.
- [ ] Unauthenticated protected-route smoke test fails as designed.
- [ ] Required security headers are present and authenticated/API responses are not publicly cached.
- [ ] Logs and test output contain no secrets or private content.
- [ ] CI runs every required check and blocks on failure.
- [ ] Preview uses resources isolated from V1 and production.
- [ ] Preview rollback/teardown is documented and tested without affecting V1.
- [ ] Codex reproduces the clean-checkout flow or an equivalent clean workspace run.

## Required evidence

- Runtime/package versions and exact command transcript.
- CI workflow result.
- Empty migration and repeat-apply results.
- Route/status/header matrix.
- Preview URL or deployment identifier, with no credentials.
- `git diff --check`, final changed-file list, and secret scan result.

## QA approach

Codex performs a clean-environment build, injects missing/invalid configuration to verify fail-fast behavior, probes routing and cache/security headers, and confirms all Cloudflare identifiers differ from V1.

Opus reviews the boundary layout, configuration isolation, error handling, CI permissions, and accidental secret/debug exposure. It does not redesign M0 decisions.

## Rollback

Disable or delete only the isolated preview route/resources created for Dash2. No V1 route, database, KV, OAuth callback, or hostname is changed.

## Evidence Index

| ID | Acceptance criterion | Evidence | Result | Reviewer |
|---|---|---|---|---|
| M1-E1 | Clean checkout/build/test | Pending | Pending | Codex |
| M1-E2 | Migration repeatability | Pending | Pending | Codex |
| M1-E3 | Route/header matrix | Pending | Pending | Codex |
| M1-E4 | CI and preview isolation | Pending | Pending | Codex |
| M1-E5 | Opus architecture review | Pending | Pending | Opus/Codex |

## Decision Log

| ID | Date | Decision | Owner | Rationale/impact |
|---|---|---|---|---|
| M1-D1 | — | Pending: exact repository/environment layout from M0 | Brian | Blocks scaffold |

## Risk Log

| ID | Severity | Risk | Mitigation/trigger | Owner | Status |
|---|---|---|---|---|---|
| M1-R1 | P1 | Dash2 binding points to V1 resource | Automated config check and human verification | Claude | Open |
| M1-R2 | P1 | Secrets enter source/CI output | Secret scan and redacted fixtures | Claude | Open |

## PM/QA Sign-off

```text
Claude status: Not Started
Claude handoff date: —
Codex review: Pending
Open P0/P1: 0
Brian decision: Pending
Decision date: —
Notes: —
```

