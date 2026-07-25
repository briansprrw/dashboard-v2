# Dash2

> **Work in progress — server foundation stage.** M0 (product/architecture decisions) and M1 (repository foundation, local dev, CI, isolated preview deployment) are accepted. M2 (domain, authentication, authorization) is in progress. There is **no user-facing application yet** — the dashboard UI is M3. Expect frequent, breaking changes to everything in here, including this README.

Dash2 is the planned clean successor to Dashboard V1. This directory is intentionally separate from the live V1 repository so product decisions, architecture, implementation, migration, and launch can proceed without changing V1.

## Current status

**M2 in progress.** M0 and M1 are accepted; the isolated `dash2-preview` environment has been deployed to and its rollback path rehearsed.

M2 delivers the server-side domain foundation. Packets M2.1 (schema and repositories), M2.2 (policy/service layer), and M2.4 (contracts and protected-content boundaries) are implemented and awaiting independent QA. M2.3 (OAuth and sessions) is implemented with its live provider exchange still being verified. M2.5 (adversarial security review) has not run — until it does, the authorization layer should be read as tested-by-construction rather than independently validated.

What exists today is a private JSON API at `/api/v1`: Google sign-in with opaque server-side sessions, server-enforced Viewer/Editor/Owner/Admin permissions, private tasks and notes, and the recycle-bin lifecycle. The glanceable dashboard UI that defines the product arrives in M3.

See the [milestone control center](./docs/milestones/README.md) for authoritative status. No production resource, migration, or launch action is authorized by the presence of this code.

## Start here

1. Read [CLAUDE.md](./CLAUDE.md) for Claude's operating contract or [AGENTS.md](./AGENTS.md) for Codex's review contract.
2. Read the [milestone control center](./docs/milestones/README.md) for the current milestone status.
3. Use the [milestone command runbook](./docs/prompts/milestone-command-runbook.md) through commands such as `Run M2 Implementation` or `M1 QA`.
4. For local development, see [docs/runbooks/local-development.md](./docs/runbooks/local-development.md); for the preview environment, see [docs/runbooks/preview-deployment.md](./docs/runbooks/preview-deployment.md) and [docs/runbooks/environments.md](./docs/runbooks/environments.md); for Google sign-in configuration, see [docs/runbooks/oauth-setup.md](./docs/runbooks/oauth-setup.md).
5. Use the product, technical architecture, implementation proposal, audits, and mockup under `docs/` as milestone inputs, not as automatically approved requirements beyond what a milestone's Decision Log records.

## Directory map

```text
CLAUDE.md                 Claude implementation and command-routing rules
AGENTS.md                 Codex PM/QA and command-routing rules
src/
  server/                 Hono Worker API
    auth/                 Google OAuth, opaque sessions, cookies
    policy/               Authorization decisions (pure, no I/O)
    services/             Domain services enforcing invariants via policy
    repositories/         Parameterized D1 data access
    routes/ middleware/ errors/ observability/
  web/                    React application shell
  shared/
    domain/               Domain records, enums, bounds
    contracts/            Request validation and response DTOs
migrations/               D1 schema migrations
scripts/                  Build/verification tooling
test/                     Contract, integration, and e2e tests
docs/
  audits/                 Prior analysis and review inputs
  milestones/             M0–M9 execution, QA, and approval gates
  mockups/                Coded visual direction for review
  plans/                  Product, architecture, and implementation proposals
  prompts/                Shared milestone command runbook
  runbooks/               Local development and environment/deployment runbooks
```

Dashboard V1 remains at `C:\Users\Brian\Github\dashboard` and stays the live source of truth until M8 is explicitly approved and completed.

## License

Licensed under the [PolyForm Noncommercial License 1.0.0](./LICENSE). Free for any noncommercial use — personal, educational, research, hobby, and use by charitable/nonprofit, educational, and government organizations. Commercial use is not permitted under this license.

**Last updated:** 2026-07-25
