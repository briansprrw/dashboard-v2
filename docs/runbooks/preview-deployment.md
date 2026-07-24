# Dash2 Preview Deployment

Scope: the isolated Dash2 **preview** environment only. See `docs/runbooks/environments.md` for the full local/preview/staging/production environment matrix — staging does not exist yet and production resource creation remains out of M1's scope.

## What "preview" is

- A dedicated Cloudflare Worker named `dash2-preview`, D1 database `dash2-preview`, and KV namespace `dash2-preview-sessions` — all created in Brian's existing Cloudflare account (the same account as V1), isolated from V1 by dedicated resource naming only (Brian's explicit decision — not a separate account).
- Served at the default `dash2-preview.<account-subdomain>.workers.dev` hostname. No custom `dnky.us` subdomain or DNS record is used for preview, so no DNS/Zone permissions or changes are involved.
- V1's actual resources (`dashboard` D1, `SESSIONS` KV) are never referenced anywhere in Dash2's configuration. Do not add them.

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

Expect `{"status":"ok","version":"...","schemaVersion":1,"expectedSchemaVersion":1,"timestamp":"..."}` with HTTP `200`. A `503` with `"status":"degraded"` means the applied D1 schema version doesn't match what the deployed code expects — check whether a migration was deployed without a matching `wrangler d1 migrations apply` against the preview database (see below).

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

## Rollback

A rollback reverts the **Worker code and its binding configuration** to a previous deployed version. It does **not** revert D1/KV data — those are separate persistent resources. If a deploy included a destructive or incompatible schema change, rolling back the Worker alone will not undo it; the database's actual state must be assessed and fixed separately (out of scope for M1, which only ships the additive `schema_version` tracking table).

```sh
npx wrangler deployments list --env preview
npx wrangler rollback <version-id> --env preview -m "Rolling back: <reason>"
```

## Teardown

To fully remove the preview environment (only ever the `dash2-preview`-named resources — never touch `dashboard` or `SESSIONS`, which are V1's):

```sh
npx wrangler delete --name dash2-preview
npx wrangler d1 delete dash2-preview
npx wrangler kv namespace delete --namespace-id d1b4a1d4942548dba1f5f94f2835cc20
```

Each of these is a real, mostly-irreversible external mutation and should go through the same production-mutation-gate discipline used to create these resources — teardown is not a routine action.

## Evidence (M1.4, 2026-07-24)

- `wrangler deploy --dry-run` confirmed correct bindings (`env.DASH2_DB (dash2-preview)`, `env.DASH2_SESSIONS (d1b4a1d4942548dba1f5f94f2835cc20)`) and correct resolved Worker name (`dash2-preview`) once `CLOUDFLARE_ENV=preview` was set at build time. No real deploy has occurred yet — dry-run only.
- `gh secret list` confirmed `CLOUDFLARE_API_TOKEN` exists on the repository (name/timestamp only).
- No rollback or teardown has been exercised yet — nothing has been deployed to test them against. This is a known gap: M1's acceptance criterion "Preview rollback/teardown is documented and tested" is documented here but not yet tested, since testing rollback requires at least two real deploys to exist first.
