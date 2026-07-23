# M0 — Product and Architecture Decisions

**Status:** Not Started  
**Owner:** Brian  
**Implementation lead:** Claude  
**PM/QA:** Codex  
**Primary model:** Claude Opus 4.8, `xhigh` effort  
**Review model:** Claude Opus 4.8, `xhigh`, in a fresh review context  
**Estimated focused time:** 3–5 days  
**Production impact:** None

## Outcome

Turn the July 22 proposals into an approved, testable launch contract. At exit, Claude can build M1 without inventing product policy, architecture, terminology, or launch scope.

## Prerequisites

- Brian has access to the product plan and coded mockup.
- V1 remains available as a behavior/reference source.
- No implementation milestone is active.

## In scope

- Review every feature priority in the product plan; remove all launch-relevant `Unrated` values.
- Resolve product policies P1–P15.
- Approve or revise every item in the architecture decision table.
- Define the launch slice and explicitly deferred features.
- Produce an authoritative role/action/data-visibility matrix.
- Define task, sheet, account, invite, public-profile, and private-task lifecycles.
- Decide repository placement and V1 isolation strategy.
- Capture reference viewports, visual baseline, V1 behavior contracts, and data-shape facts.
- Convert launch features into observable acceptance criteria.

## Out of scope

- Application scaffolding or feature code.
- Production data export or migration.
- Cloudflare, DNS, OAuth, or repository creation.
- Fixing V1 unless a separate instruction explicitly authorizes it.
- Treating the current mockup as approved merely because it exists.

## Required decisions

### Product decisions

- Terminology: Sheet or List.
- Viewer/editor/owner/admin action matrix, including archive and delete.
- Private task and private note visibility for owners, editors, viewers, admins, and public users.
- Closed-task retention, restore window, permanent purge, and sheet deletion.
- Default share role and migration mapping for legacy `can_see=1`.
- Public notes, public task fields, search indexing, username format/change/reuse, and revocation cache window.
- Admin override behavior and audit requirements.
- One versus multiple dashboards at launch.
- Smart-frame authentication/display session policy.
- Wide-screen layout and launch device matrix.
- Offline/stale behavior.
- Launch priority for public dashboards and display sessions.

### Architecture decisions

- Repository and deployment isolation.
- React/Vite frontend and authored CSS direction.
- Hono modular monolith.
- Dedicated D1/KV resources.
- `/api/v1`, runtime schemas, and explicit DTOs.
- Canonical ownership/membership storage.
- Identifier strategy.
- Archive/purge model.
- Local versus server-backed device preferences.
- Private browser cache policy.
- Migration/write-freeze strategy.
- Reviewed SQL repositories versus ORM.

## Work packets

### M0.1 — Source reconciliation

Create a conflict list across the product plan, technical architecture, implementation plan, coded mockup, V1 roadmap, and relevant audits. Label each statement as approved, proposed, historical, or conflicting. Do not change scope while compiling it.

### M0.2 — Decision workshop

Prepare batched decision briefs grouped by product language, permissions/privacy, lifecycle, public access, display behavior, and architecture. Each brief must include options, recommendation, and impact. Brian records the decision.

### M0.3 — Launch contract

Update the canonical plans to reflect the decisions, define launch and deferred slices, and add acceptance criteria with IDs. Every launch feature maps to at least one milestone and testable outcome.

### M0.4 — Baseline capture

Capture non-sensitive reference screenshots and a V1 behavior inventory at:

- Narrow desktop column at the primary real-world width and 1080px height.
- 1920×1080 desktop.
- Small and large phone portrait.
- iPad-sized portrait and landscape.
- 1280×800 and 1920×1080 smart-frame/no-hover contexts.

Create a sanitized source-data profile and synthetic migration fixture specification. Record counts/ranges and known anomalies without task names, notes, emails, secrets, or other personal content.

## Acceptance criteria

- [ ] Every launch-relevant product feature has an approved priority and acceptance ID.
- [ ] P1–P15 contain explicit approved decisions or an explicit, non-blocking deferral.
- [ ] Every architecture decision is approved or revised; no M1-blocking item remains `TBD`.
- [ ] The role/action/visibility matrix covers anonymous, viewer, editor, owner, admin, disabled user, private task, and private note behavior.
- [ ] Launch scope and non-goals are written in one canonical location.
- [ ] Every launch feature maps to M1–M9 or is explicitly deferred.
- [ ] Reference viewports and density/recognition expectations are measurable.
- [ ] V1 preservation rules and Dash2 isolation are explicit.
- [ ] A sanitized migration-fixture specification covers normal and edge-case records.
- [ ] Codex finds no contradictory launch requirement across the canonical documents.
- [ ] Brian records Gate A (product) and Gate C (architecture) approval.

## QA approach

Codex performs a traceability review: feature → decision → milestone → acceptance criterion. Sample at least one item from every product-plan section A–H. Verify that no proposal has been relabeled as approval without a Brian decision.

Use a fresh Opus 4.8 `xhigh` session for contradiction, privacy-boundary, and lifecycle review. It may recommend changes but cannot record approval.

## Risks and containment

- **Silent parity expansion:** require an explicit launch priority for every V1 behavior.
- **Schema churn:** block M1/M2 until ownership, lifecycle, privacy, and public policies are decided.
- **Mockup bias:** judge the mockup against product goals and reference contexts, not vice versa.
- **Sensitive fixture leakage:** use synthetic values and aggregate profiles only.

## Evidence Index

| ID | Acceptance criterion | Evidence | Result | Reviewer |
|---|---|---|---|---|
| M0-E1 | Feature/decision traceability | Pending | Pending | Codex |
| M0-E2 | Role/action/visibility matrix | Pending | Pending | Codex |
| M0-E3 | Architecture approvals | Pending | Pending | Brian/Codex |
| M0-E4 | Reference capture index | Pending | Pending | Codex |
| M0-E5 | Gate A/C decision | Pending | Pending | Brian |

## Decision Log

| ID | Date | Decision | Owner | Rationale/impact |
|---|---|---|---|---|
| M0-D1 | — | Pending | Brian | Launch scope |

## Risk Log

| ID | Severity | Risk | Mitigation/trigger | Owner | Status |
|---|---|---|---|---|---|
| M0-R1 | P1 | Implementation begins with unresolved policy | Block dependent packets | Codex | Open |
| M0-R2 | P1 | Sensitive production data enters fixtures/docs | Synthetic-only review | Claude | Open |

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

