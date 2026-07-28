# Dash2 Preview Deployment

Scope: the isolated Dash2 **preview** environment only. See `docs/runbooks/environments.md` for the full local/preview/staging/production environment matrix — staging does not exist yet and production resource creation remains out of M1's scope.

## What "preview" is

- A dedicated Cloudflare Worker named `dash2-preview`, D1 database `dash2-preview`, and KV namespace `dash2-preview-sessions` — all created in Brian's existing Cloudflare account (the same account as V1), isolated from V1 by dedicated resource naming only (Brian's explicit decision — not a separate account).
- Served at the default `dash2-preview.<account-subdomain>.workers.dev` hostname. No custom `dnky.us` subdomain or DNS record is used for preview, so no DNS/Zone permissions or changes are involved.
- **Dash2 never binds a V1 resource.** Every Dash2 binding points at a `dash2-*` resource; V1's own D1 and KV are not referenced in any Dash2 config file, and must not be added. (Naming caution when reading configs: Dash2's KV _binding_ is `DASH2_SESSIONS`, while V1's KV _namespace_ is separately named — similar enough to misread at a glance, but they are different resources.)

## How a deploy happens

Deployment is fully automated and chained off CI, not a separate manual trigger:

1. A push to `main` runs the `CI` workflow (`.github/workflows/ci.yml`) — install, format check, lint, typecheck, test, local-DB migration, build.
2. If and only if `CI` succeeds, GitHub's `workflow_run` event fires `Deploy Preview` (`.github/workflows/deploy-preview.yml`), which checks out the **exact commit CI validated** (`head_sha`), rebuilds with `CLOUDFLARE_ENV=preview`, and runs `wrangler deploy` using the `CLOUDFLARE_API_TOKEN` repository secret.

There is no separate manual approval step in this chain (Brian's explicit decision — variant 2a, not a gated-approval variant). A push to `main` that passes CI **will** deploy to preview automatically.

## Manual deploy (local, for verification or if CI is unavailable)

```sh
CLOUDFLARE_ENV=preview npm run build
npx wrangler deploy
```

Do **not** run `wrangler deploy --env preview` — with `@cloudflare/vite-plugin`, Cloudflare-environment selection is baked in at **build time** via `CLOUDFLARE_ENV`, not at deploy time via `--env`. Passing `--env` to `wrangler deploy` after a plain (non-preview) build silently deploys the wrong bindings with no error — this was caught and confirmed via `wrangler deploy --dry-run` during M1.4 implementation. Always set `CLOUDFLARE_ENV=preview` on the **build** step; the subsequent `wrangler deploy` needs no `--env` flag because it reads the already-resolved build output.

To validate a build without actually deploying anything:

```sh
CLOUDFLARE_ENV=preview npm run build
npx wrangler deploy --dry-run
```

## Checking preview status

```sh
curl https://dash2-preview.<account-subdomain>.workers.dev/api/v1/health
```

Expect `{"status":"ok","version":"...","schemaVersion":N,"expectedSchemaVersion":N,"timestamp":"..."}` with HTTP `200`, where `N` is `EXPECTED_SCHEMA_VERSION` in `src/shared/constants/schema.ts` (currently `3`, set by the M2-FQA-RR-01 correction's `0004_identity_subject_pending.sql`). A `503` with `"status":"degraded"` means the applied D1 schema version doesn't match what the deployed code expects — check whether a migration was deployed without a matching `wrangler d1 migrations apply` against the preview database (see below).

```sh
npx wrangler deployments list --env preview
```

Lists the 10 most recent deployments of `dash2-preview` with their version IDs.

## Applying migrations to the preview database

Migrations are **not** part of the deploy step and must be applied explicitly and separately:

```sh
npx wrangler d1 migrations apply DASH2_DB --env preview --remote
```

`--remote` is required — without it, this would target the _local_ simulated database instead of the real `dash2-preview` D1 database. This is a real mutation against the real preview database and should be run deliberately, not blindly automated, until a milestone specifically designs an automated migration-on-deploy step.

### Writing a migration that survives a remote apply

**A migration file that defines a trigger must contain nothing else, apart from its single `INSERT INTO schema_version` bookkeeping row.**

Wrangler's `--remote` path splits a migration file on `;` and posts each fragment to D1's HTTP API separately. A trigger body contains its own `;` terminators, so a trigger sitting alongside other statements gets cut in half and the whole migration fails with `incomplete input: SQLITE_ERROR [code: 7500]`.

This is genuinely dangerous because **local tooling does not reproduce it.** `wrangler d1 migrations apply --local` and the workerd/Miniflare test harness both execute the file through a path that handles trigger bodies correctly. A migration written this way applies cleanly to an empty local database, passes every integration test, and then fails on first contact with the real preview database — which is exactly what happened on 2026-07-25 with `0002_domain_schema.sql`. The fix was to split its three ownership triggers into `0003_ownership_triggers.sql`.

`test/unit/migration-remote-safety.test.ts` enforces this rule against the real migration files, so CI fails before a deploy rather than at the moment someone runs a remote apply. That guard is itself tested against deliberately-bad SQL, because a guard only ever exercised on known-good input cannot be distinguished from one that always passes.

## Rollback

A rollback reverts the **Worker code and its binding configuration** to a previous deployed version. It does **not** revert D1/KV data — those are separate persistent resources. If a deploy included a destructive or incompatible schema change, rolling back the Worker alone will not undo it; the database's actual state must be assessed and fixed separately (out of scope for M1, which only ships the additive `schema_version` tracking table).

```sh
npx wrangler deployments list --env preview
npx wrangler rollback <version-id> --env preview -m "Rolling back: <reason>"
```

## Teardown

To fully remove the preview environment. **Every command below targets a `dash2-*`-named resource explicitly — verify the name in each one before running it.** V1's resources live in this same Cloudflare account, so a mistyped name here is a destructive action against the live V1 application:

```sh
npx wrangler delete --name dash2-preview
npx wrangler d1 delete dash2-preview
npx wrangler kv namespace delete --namespace-id d1b4a1d4942548dba1f5f94f2835cc20
```

Each of these is a real, mostly-irreversible external mutation and should go through the same production-mutation-gate discipline used to create these resources — teardown is not a routine action.

## Evidence (M1.4, 2026-07-24)

- `wrangler deploy --dry-run` confirmed correct bindings (`env.DASH2_DB (dash2-preview)`, `env.DASH2_SESSIONS (d1b4a1d4942548dba1f5f94f2835cc20)`) and correct resolved Worker name (`dash2-preview`) once `CLOUDFLARE_ENV=preview` was set at build time.
- `gh secret list` confirmed `CLOUDFLARE_API_TOKEN` exists on the repository (name/timestamp only).
- **Real deploy has occurred:** commit `e35c3ca` was pushed to `main`; GitHub Actions CI run `30070479806` passed, then `Deploy Preview` run `30070499299` deployed `dash2-preview` (Worker version `7427ae93-0a11-451e-b5e1-c8292b2b0856`) — confirmed by Codex's Post-commit Action Validation, 2026-07-24.
- **Remote migration applied (2026-07-24, gate `PM-de247122-6e2f-4cae-84ea-f96f0576de7b`, Brian-authorized):** the preview D1 initially had no `schema_version` table, so `/api/v1/health` correctly reported `503 degraded` (M1-R12) rather than crashing. Ran `npx wrangler d1 migrations apply DASH2_DB --env preview --remote` — applied `0001_schema_version.sql`, confirmed via `wrangler d1 migrations list --remote` ("No migrations to apply!") and `wrangler d1 execute ... SELECT version, applied_at FROM schema_version` (`version: 1`). Live `GET https://dash2-preview.b-f75.workers.dev/api/v1/health` now returns `200`/`{"status":"ok","schemaVersion":1,"expectedSchemaVersion":1,...}`.
- **Rollback rehearsed and verified (2026-07-24, gate `PM-88a25f23-20df-49ab-a3d7-1a80c6c7919f`, Brian-authorized minimal scope):** deployed a second identical build (`wrangler deploy`, version `6ed4b43a-aa3d-4082-bae5-996eaa6b3720`), confirmed correct isolated bindings and a healthy `200` response, then ran `npx wrangler rollback 7427ae93-0a11-451e-b5e1-c8292b2b0856 --env preview` — succeeded, active traffic reverted to the original version. Post-rollback verification: `GET /api/v1/health` returns `200`/`{"status":"ok","schemaVersion":1}`; `wrangler deployments list --env preview` shows the rollback event and the reverted active version. No V1 resource touched; no D1/KV data mutated (Wrangler's own rollback output confirms bound resources are unaffected by a code-version rollback).
- **Teardown remains untested by design**, not by omission — it is a destructive action (resource deletion) requiring its own separately gated authorization, and Brian's explicit instruction was to do "the minimal" rehearsal (rollback only). If/when teardown itself needs to be exercised, treat it as a new `production-mutation-gate` action, not an extension of this one.
