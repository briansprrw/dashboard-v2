# Dash2

> **Work in progress — planning stage.** There is no application code yet. This repository currently holds product/architecture planning documents and milestone process for a project that has not started implementation. Expect frequent, breaking changes to everything in here, including this README.

Dash2 is the planned clean successor to Dashboard V1. This directory is intentionally separate from the live V1 repository so product decisions, architecture, implementation, migration, and launch can proceed without changing V1.

## Current status

**Planning and approval only.** Begin with M0. No Dash2 application scaffold, production resource, migration, or launch action is authorized by the presence of these documents.

## Start here

1. Read [CLAUDE.md](./CLAUDE.md) for Claude's operating contract or [AGENTS.md](./AGENTS.md) for Codex's review contract.
2. Read the [milestone control center](./docs/milestones/README.md).
3. Use the [milestone command runbook](./docs/prompts/milestone-command-runbook.md) through commands such as `Run M0 Readiness` and `Run M1 Implementation`.
4. Complete [M0 — Product and Architecture Decisions](./docs/milestones/M0-product-and-architecture-decisions.md).
5. Use the product, technical architecture, implementation proposal, audits, and mockup under `docs/` as inputs to M0—not as automatically approved requirements.

## Directory map

```text
CLAUDE.md                 Claude implementation and command-routing rules
AGENTS.md                 Codex PM/QA and command-routing rules
docs/
  audits/                 Prior analysis and review inputs
  milestones/             M0–M9 execution, QA, and approval gates
  mockups/                Coded visual direction for review
  plans/                  Product, architecture, and implementation proposals
  prompts/                Shared milestone command runbook
```

Dashboard V1 remains at `C:\Users\Brian\Github\dashboard` and stays the live source of truth until M8 is explicitly approved and completed.

## License

Licensed under the [PolyForm Noncommercial License 1.0.0](./LICENSE). Free for any noncommercial use — personal, educational, research, hobby, and use by charitable/nonprofit, educational, and government organizations. Commercial use is not permitted under this license.

**Last updated:** 2026-07-23
