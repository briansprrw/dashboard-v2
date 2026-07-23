# M0 — Product and Architecture Decisions

**Status:** Accepted
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

Create a schema/audit-derived source-shape inventory and synthetic migration fixture specification without querying V1. Record known structural anomaly categories without task names, notes, emails, secrets, counts, or other personal content.

## Work-packet artifacts (2026-07-23)

| Packet | Deliverable |
|---|---|
| M0.1 | [Source Reconciliation](./M0.1-source-reconciliation-2026-07-23.md) — conflict list across plans, mockup, audits; labeled approved/proposed/historical/conflicting |
| M0.2 | [Decision Workshop Closure](./M0.2-decision-workshop-closure-2026-07-23.md) — P1–P15 and architecture-table closure against the approved record; open detail items OD-1..OD-3 |
| M0.3 | [Launch Contract](./M0.3-launch-contract-2026-07-23.md) — canonical launch scope, non-goals, role matrix, lifecycle, acceptance IDs, milestone traceability; plus reconciliation edits to the three canonical plans |
| M0.4 | [Baseline Capture](./M0.4-baseline-capture-2026-07-23.md) — coded-mockup viewport captures, sanitized V1 behavior inventory, non-live source-shape inventory, synthetic fixture spec |

## Acceptance criteria

Legend: `[x]` = implementation evidence produced, pending fresh independent verification where noted; `[ ]` = requires independent QA or Brian approval.

- [x] Every launch-relevant product feature has an approved priority and acceptance ID. — [Launch Contract §5](./M0.3-launch-contract-2026-07-23.md); priorities per [M0.2 §1](./M0.2-decision-workshop-closure-2026-07-23.md).
- [x] P1–P15 contain explicit approved decisions or an explicit, non-blocking deferral. — [M0.2 §1](./M0.2-decision-workshop-closure-2026-07-23.md); product plan P1–P15 now resolved.
- [x] Every architecture decision is approved or revised; no M1-blocking item remains `TBD`. — [M0.2 §2](./M0.2-decision-workshop-closure-2026-07-23.md); architecture decision table now Approved.
- [x] The role/action/visibility matrix covers anonymous, viewer, editor, owner, admin, disabled user, private task, and private note behavior. — [Launch Contract §2](./M0.3-launch-contract-2026-07-23.md).
- [x] Launch scope and non-goals are written in one canonical location. — [Launch Contract §1](./M0.3-launch-contract-2026-07-23.md).
- [x] Every launch feature maps to M1–M9 or is explicitly deferred. — [Launch Contract §4–§5](./M0.3-launch-contract-2026-07-23.md).
- [x] Reference viewports and density/recognition expectations are measurable. — [M0.4 §1](./M0.4-baseline-capture-2026-07-23.md).
- [x] V1 preservation rules and Dash2 isolation are explicit. — [Launch Contract §6](./M0.3-launch-contract-2026-07-23.md); [M0.4 §2](./M0.4-baseline-capture-2026-07-23.md).
- [x] A sanitized migration-fixture specification covers normal and edge-case records. — [M0.4 §4](./M0.4-baseline-capture-2026-07-23.md).
- [x] Coded-mockup reference screenshots are captured at VP-1..VP-9. — [M0.4 §1](./M0.4-baseline-capture-2026-07-23.md) and [`docs/mockups/reference/`](../mockups/reference/). Application evidence replaces them in M3/M7.
- [ ] Codex finds no contradictory launch requirement across the canonical documents. — **Codex QA required.**
- [ ] Brian records Gate A (product) and Gate C (architecture) approval. — **Brian required; not self-assignable.**

## QA approach

Codex performs a traceability review: feature → decision → milestone → acceptance criterion. Sample at least one item from every product-plan section A–H. Verify that no proposal has been relabeled as approval without a Brian decision.

Use a fresh Opus 4.8 `xhigh` session for contradiction, privacy-boundary, and lifecycle review. It may recommend changes but cannot record approval.

## Risks and containment

- **Silent parity expansion:** require an explicit launch priority for every V1 behavior.
- **Schema churn:** block M1/M2 until ownership, lifecycle, privacy, and public policies are decided.
- **Mockup bias:** judge the mockup against product goals and reference contexts, not vice versa.
- **Sensitive fixture leakage:** use synthetic values and schema/audit-derived shape facts only; M0 performs no V1 query or profiling.

## Evidence Index

| ID | Acceptance criterion | Evidence | Result | Reviewer |
|---|---|---|---|---|
| M0-E1 | Feature/decision traceability | [M0.1 reconciliation](./M0.1-source-reconciliation-2026-07-23.md); [Launch Contract §4–§5](./M0.3-launch-contract-2026-07-23.md) | Produced; Codex verification pending | Codex |
| M0-E2 | Role/action/visibility matrix | [Launch Contract §2](./M0.3-launch-contract-2026-07-23.md) | Produced; Codex verification pending | Codex |
| M0-E3 | Architecture approvals | [M0.2 §2](./M0.2-decision-workshop-closure-2026-07-23.md); [architecture decision table](../plans/2026-07-22-dash2-technical-architecture.md) (now Approved) | Reconciled; Gate C pending Brian | Brian/Codex |
| M0-E4 | Reference capture index (viewports) | [M0.4 baseline capture §1](./M0.4-baseline-capture-2026-07-23.md); [`docs/mockups/reference/`](../mockups/reference/) | VP-1..VP-9 and the focused phone task-panel capture recaptured/retained at exact dimensions and individually visually inspected after the top-left-origin correction | Codex |
| M0-E5 | Gate A/C decision | — | Pending Brian | Brian |
| M0-E6 | Brian-approved product and architecture decisions | [M0 Approved Decision Record — 2026-07-23](./M0-approved-decisions-2026-07-23.md) | Recorded; M0.1–M0.4 artifacts complete; canonical reconciliation refreshed | Codex |
| M0-E7 | Canonical plans reconciled to approved decisions | Product plan, technical architecture, implementation plan (inline edits; B3→Recycle, F2→split launch/deferred, Publish→V2.1, Epic 3→deferred, Epic 7→V2.1); Launch Contract AC-M6 extended to cover F2 launch-scope behaviors | Complete; Codex verification pending | Codex |
| M0-E8 | Migration-fixture specification (synthetic) | [M0.4 §4](./M0.4-baseline-capture-2026-07-23.md) | Produced; Codex verification pending | Codex |

## Decision Log

| ID | Date | Decision | Owner | Rationale/impact |
|---|---|---|---|---|
| M0-D1 | 2026-07-23 | Brian's feature-priority overrides are approved; remaining `Unrated` entries inherit their recommendations; Brian's notes are requirements. | Brian | Establishes the priority baseline for M0.3 traceability. |
| M0-D2 | 2026-07-23 | Use **List** as the canonical term; launch with one dashboard; defer multiple dashboards. | Brian | Removes GAS-era terminology and bounds the initial dashboard model. |
| M0-D3 | 2026-07-23 | Approve Viewer/Editor/Owner roles, default new shares to Viewer, and do not migrate V1 sharing permissions. | Brian | Starts V2 sharing from an intentional least-privilege model without legacy access debt. |
| M0-D4 | 2026-07-23 | Include private tasks and private notes in V2; originally allowed Owner and V2 Admin visibility. **Superseded in part by M0-D16.** | Brian | Retained for decision history; M0-D16 is authoritative for Admin visibility. |
| M0-D5 | 2026-07-23 | Apply a 30-day Windows-style recycle-bin lifecycle to tasks, Lists, and accounts, with scoped restore and early permanent-purge controls. | Brian | Makes deletion recoverable and defines cascade/unit behavior. |
| M0-D6 | 2026-07-23 | Provide task history with full before/after values and keep administrative audit separate; the original Admin-history access is **superseded by M0-D16**. | Brian | Owner history remains private content; Admin receives only allowlisted administrative audit/recovery metadata. |
| M0-D7 | 2026-07-23 | Defer public dashboards, public usernames, supported external API access, and dedicated smart-frame sessions/profiles to V2.1; apply site-wide `noindex`. | Brian | Removes public/display surfaces from V2 launch while preserving their architectural seams. |
| M0-D8 | 2026-07-23 | Use responsive automatic one-to-three-column layout through 1920×1080; support desktop, phone, and tablet; defer ultrawide and portrait desktop/monitor layouts. The original no-override detail is superseded by M0-D24. | Brian | Defines the V2 device and visual acceptance boundary. |
| M0-D9 | 2026-07-23 | Store V2 display preferences locally per device; support seven-step zoom, named/custom validated themes, and customizable semantic status/priority emoji. | Brian | Preserves display flexibility without profile-sync or arbitrary-CSS risk. |
| M0-D10 | 2026-07-23 | Keep current in-memory data visible while offline, label it `Offline`, disable edits, and use 30-day sliding sessions with immediate server revocation. | Brian | Defines stale/offline and session behavior without persistent private caching. |
| M0-D11 | 2026-07-23 | Build Dash2 as a fully independent React/Vite + authored CSS application on one modular Hono Worker with dedicated D1/KV/OAuth/deployment resources. | Brian | Approves the greenfield isolation and primary application stack. |
| M0-D12 | 2026-07-23 | Use private internal `/api/v1` endpoints with runtime validation and explicit DTOs, UUID identifiers, canonical `owner_user_id`, Viewer/Editor memberships, and reviewed SQL repositories. | Brian | Approves the internal contract and persistence boundaries without committing to an external API. |
| M0-D13 | 2026-07-23 | Migrate current V1 users/roles, Lists/ownership, and all feasible task data; exclude shares, settings, invite codes, and unrelated legacy configuration. | Brian | Prioritizes data preservation without importing legacy product or schema debt. |
| M0-D14 | 2026-07-23 | V1 is a read-only migration source, not a V2 design source; no write freeze is required; authorized V2 wipe-and-recopy remains available before stability. | Brian | Keeps V2 greenfield while supporting repeatable migration and rollback. |
| M0-D15 | 2026-07-23 | The complete authoritative wording for M0-D1 through M0-D14 is recorded in [M0 Approved Decision Record — 2026-07-23](./M0-approved-decisions-2026-07-23.md). | Brian | Prevents conversational decisions from being lost or paraphrased inconsistently. |
| M0-D16 | 2026-07-23 | V2 Admin retains administrative/recovery authority, including opaque restore/purge operations, but cannot read private tasks, private notes, or task-history field values. Application-level separation is required in V2; cryptographic/owner-key protection is deferred to V2.1. | Brian | Separates operational God Mode from protected-content visibility now, avoiding a later authorization/query/DTO retrofit while keeping cryptographic scope out of V2. |
| M0-D17 | 2026-07-23 | Search-engine indexing is permanently prohibited for Dash2, including future public surfaces; no indexing control or `allow_indexing` schema seam is permitted. Add enhanced Cloudflare edge-abuse/DDoS hardening beyond the launch baseline to the V2.1 backlog. | Brian | Removes the last indexing contradiction while recording future operational hardening without expanding V2 launch scope. |
| M0-D18 | 2026-07-23 | Produce sanitized coded-mockup screenshots during M0; application screenshots replace the interim visual baseline in M3/M7. The original decision also requested M0 V1 profiling, which M0-D25 supersedes. | Brian | Preserves the visual evidence decision and its history without leaving the superseded V1 work active. |
| M0-D19 | 2026-07-23 | Treat priority and release as separate fields and move all deferred work into clearly labeled V2.1 sections that explicitly state it is out of V2 scope. | Brian | Prevents high-priority future features from being mistaken for V2 launch work. |
| M0-D20 | 2026-07-23 | V2 includes 10-second Undo for quick-complete/move/recycle; Google/browser-sourced profile basics with no editor; and an Admin user-detail view limited to account/list/membership metadata with no protected content. | Brian | Closes the B12, D5, and G2 acceptance-mapping gaps with observable launch behavior. |
| M0-D21 | 2026-07-23 | Synthetic fixtures may use invented emails/task names/notes, while real content and printing fixture values in logs/shareable evidence remain prohibited. | Brian | Makes the migration fixture testable without weakening privacy. |
| M0-D22 | 2026-07-23 | Use `recycled_at` and an explicit `recycled` account state internally. | Brian | Aligns schema vocabulary and state transitions with the approved recycle-bin lifecycle. |
| M0-D23 | 2026-07-23 | Use seven due bands with locally configurable, validated soon/soonish/future thresholds until synchronized settings profiles exist. | Brian | Preserves the glance model while allowing per-device timing preferences. |
| M0-D24 | 2026-07-23 | Automatic layout accepts local min/max column bounds (1–3, default 1–3); max is firm, while min may provisionally yield at unsafe widths pending M3 evaluation. | Brian | Adds the requested override without locking in unsafe narrow layouts or claiming the automatic choice is permanently optimal. |
| M0-D25 | 2026-07-23 | Supersede the V1-query/profile portion of M0-D18: no V1 query or live-source profile is in M0 scope. M0-D18's sanitized coded-mockup screenshot requirement remains in force, and application screenshots replace those interim assets in M3/M7. Any later live-source profiling requires separate authorization in M6. | Brian | Removes V1 access from the M0 gate while retaining the visual evidence Brian required. |

## Risk Log

| ID | Severity | Risk | Mitigation/trigger | Owner | Status |
|---|---|---|---|---|---|
| M0-R1 | P1 | Implementation begins before the approved decision record is reconciled into canonical plans and acceptance IDs | M0.3 reconciliation + acceptance IDs now complete (M0.1–M0.4, Launch Contract). M1 still gated on Codex QA + Brian Gate A/C. | Codex | Mitigated — pending QA/Gate |
| M0-R2 | P1 | Sensitive production data enters fixtures/docs | Synthetic-only; M0.4 uses invented fixture values and audit/schema-derived facts only; no V1 query or profile is in M0 scope. Any M6 source access requires separate approval and read-only controls. | Claude | Mitigated for M0 |

## PM/QA Sign-off

```text
Claude status: Superseded by Brian's direct Codex implementation assignment
Codex implementation handoff date: 2026-07-23
Codex review: Complete; all M0 artifacts verified
Open P0/P1: 0 P0 / 0 P1; 0 P2
Brian decision: Accepted (Gate A product + Gate C architecture approved 2026-07-23)
Decision date: 2026-07-23
Notes: M0 closure complete. All four work packets (M0.1–M0.4) delivered and verified. Launch contract, decision record, baseline capture, and canonical plan reconciliation are approved. M1 implementation may proceed.
```
