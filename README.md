# Dash2

> **Work in progress — foundation stage.** M0 (product/architecture decisions) is accepted. M1 (repository foundation, local dev, CI, and an isolated preview deployment path) is implemented and undergoing independent review; it is not yet accepted and no real deploy has occurred. Expect frequent, breaking changes to everything in here, including this README.

Dash2 is the planned clean successor to Dashboard V1. This directory is intentionally separate from the live V1 repository so product decisions, architecture, implementation, migration, and launch can proceed without changing V1.

## Current status

**M1 in review.** The application shell (React/Vite web, Hono Worker API), local D1/KV, quality gates (format/lint/typecheck/test/build), and an isolated `dash2-preview` Cloudflare configuration exist in this repository, but M1 has not passed its independent QA/acceptance gate yet — see the [milestone control center](./docs/milestones/README.md) for current status. No production resource, migration, or launch action is authorized by the presence of this code.

## Start here

1. Read [CLAUDE.md](./CLAUDE.md) for Claude's operating contract or [AGENTS.md](./AGENTS.md) for Codex's review contract.
2. Read the [milestone control center](./docs/milestones/README.md) for the current milestone status.
3. Use the [milestone command runbook](./docs/prompts/milestone-command-runbook.md) through commands such as `Run M2 Implementation` or `M1 QA`.
4. For local development, see [docs/runbooks/local-development.md](./docs/runbooks/local-development.md); for the preview environment, see [docs/runbooks/preview-deployment.md](./docs/runbooks/preview-deployment.md) and [docs/runbooks/environments.md](./docs/runbooks/environments.md).
5. Use the product, technical architecture, implementation proposal, audits, and mockup under `docs/` as milestone inputs, not as automatically approved requirements beyond what a milestone's Decision Log records.

## Directory map

```text
CLAUDE.md                 Claude implementation and command-routing rules
AGENTS.md                 Codex PM/QA and command-routing rules
src/
  server/                 Hono Worker API (routes, middleware, errors, observability)
  web/                    React application shell
  shared/                 Contracts/constants shared between server and web
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

**Last updated:** 2026-07-24
