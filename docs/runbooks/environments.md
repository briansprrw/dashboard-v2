# Dash2 Environments

Non-secret environment contract for all four environments named in M1's scope: local, preview, staging, and production. No secret values appear anywhere in this document — only binding/variable names, hostnames, resource-naming conventions, and who owns what.

## Local

- **Status:** exists; used for day-to-day development.
- **Hostname:** `http://localhost:5173` (`npm run dev`) or `http://localhost:8787`-range (`wrangler dev --local`).
- **D1 binding:** `DASH2_DB` → local Miniflare-simulated database only. `wrangler.jsonc` top-level `d1_databases` uses placeholder identifiers (`00000000-0000-0000-0000-000000000001`) that only resolve inside the local `.wrangler/state` simulation (gitignored) and never reach a real Cloudflare account.
- **KV binding:** `DASH2_SESSIONS` → same local-only placeholder pattern (`...002`).
- **Vars:** `APP_VERSION` set directly in `wrangler.jsonc`.
- **Secret ownership:** none required; local dev needs no Cloudflare API token or other credential.
- **Migration policy:** `npm run db:migrate:local` applies migrations to the local simulated D1 directly; safe to run freely, reset by deleting `.wrangler/`.
- **Deployment authority:** N/A — nothing is ever deployed from local state.
- **Full detail:** `docs/runbooks/local-development.md`.

## Preview

- **Status:** exists (Cloudflare resources created under a confirmed production-mutation-gate, M1.4). No real deploy has occurred yet as of this writing — see `docs/runbooks/preview-deployment.md` for current deploy status.
- **Hostname:** `dash2-preview.<account-subdomain>.workers.dev` — Cloudflare's default `*.workers.dev` hostname. No custom `dnky.us` subdomain or DNS record.
- **D1 binding:** `DASH2_DB` → real D1 database `dash2-preview` (`database_id: 6c792d38-2c6d-46ec-9dcb-1b8fdb0450ef`), configured under `wrangler.jsonc` `env.preview`.
- **KV binding:** `DASH2_SESSIONS` → real KV namespace `dash2-preview-sessions` (`id: d1b4a1d4942548dba1f5f94f2835cc20`).
- **Vars:** `APP_VERSION` set under `wrangler.jsonc` `env.preview.vars`.
- **Resource isolation:** lives in the same Cloudflare account as V1, isolated only by dedicated resource naming (`dash2-preview*`), not a separate account — Brian's explicit decision (M1-D2). V1's `dashboard` D1 and `SESSIONS` KV are never referenced anywhere in Dash2 configuration.
- **Secret ownership:** `CLOUDFLARE_API_TOKEN` — a GitHub Actions repository secret on `briansprrw/dashboard-v2`, created and added by Brian directly; its value has never been seen by Claude. Scoped to Workers Scripts/KV/D1 edit only, not full account access.
- **Migration policy:** deliberately manual and separate from deploy — `npx wrangler d1 migrations apply DASH2_DB --env preview --remote`, run explicitly, not automated on push.
- **Deployment authority:** automatic — any push to `main` that passes CI triggers `.github/workflows/deploy-preview.yml`, which deploys with no separate manual-approval step (Brian's explicit decision, M1-D2, variant 2a).
- **Full detail:** `docs/runbooks/preview-deployment.md`.

## Staging

- **Status:** does not exist. No Cloudflare resources, hostname, or deployment path have been created or decided for a staging environment. No M0 or M1 decision record establishes one.
- **Why this section exists:** M1's scope names "staging" explicitly as a documentation deliverable; this section records the current true state (undefined) rather than inventing resources, a hostname, or a deployment policy that no one has approved. Creating a staging environment is a product/architecture decision outside this correction's authority — it requires its own decision brief if a future milestone needs it.
- **Deployment authority:** N/A — nothing to deploy to.

## Production

- **Status:** does not exist. M0 explicitly excludes production resource creation from M1 and every milestone until Brian approves the launch milestone (M8/M9).
- **Recorded decision:** Dash2 will initially run at `dash2.dnky.us` (a new hostname, not `dash.dnky.us`). When Brian approves cutover, `dash.dnky.us` moves to the new service — V1 remains the source of truth at `dash.dnky.us` until that explicit approval (M0 approved decisions, "repository/hostname" statement).
- **D1/KV bindings, secret ownership, migration policy, deployment authority:** not yet defined. These will be established as part of the production-launch milestone's own decision gate and production-mutation-gate discipline — not invented here ahead of that approval.

## Cross-environment invariants (all environments)

- No environment's `wrangler.jsonc` binding ever points at a V1-owned resource (`dashboard` D1, `SESSIONS` KV, or `dash.dnky.us`).
- No secret value is ever committed to source, logged, or placed in a runbook/handoff/milestone document — only secret _names_ and _ownership location_.
- Every real (non-local) Cloudflare or GitHub mutation goes through the `production-mutation-gate` skill's two-phase confirmation before execution.
