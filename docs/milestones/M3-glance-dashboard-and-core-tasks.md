# M3 — Glance Dashboard and Core Tasks

**Status:** Not Started  
**Owner:** Brian  
**Implementation lead:** Claude  
**PM/QA:** Codex  
**Primary model:** Claude Sonnet 5, `high` effort  
**Review model:** Claude Opus 4.8, `high` effort  
**Estimated focused time:** 7–10 days  
**Production impact:** First isolated end-to-end Dash2 experience

## Outcome

Prove Dash2's defining experience: one responsive, high-density dashboard with Standard and Glance modes and complete approved core task workflows across narrow desktop, full desktop, phone, tablet, and smart-frame contexts.

## Prerequisites

- M2 is Accepted.
- Gate B visual direction is ready for review.
- M0 task grammar, display modes, sort behavior, and device matrix are approved.

## In scope

- Authenticated application shell and bootstrap states.
- Standard and Glance modes with a reliable exit path.
- Configurable date/time header if launch-approved.
- Responsive sheet sections and stable task-row grammar.
- Due/status colors with redundant icon/text meaning.
- Task create, edit, quick complete, approved archive/delete/restore, and move.
- Approved default sorting and section visibility/order/collapse.
- Per-device mode, scale, density, clock, collapse, and scroll behavior.
- Background refresh, one in-flight request, backoff, stale/offline state, and visible-data retention.
- Shared keyboard, pointer, and touch actions.
- Semantic/accessibility foundation and visual regression baselines.

## Out of scope

- Sharing/member management, sheet lifecycle UI, admin, and public dashboards.
- Optional search/filter/manual sort unless M0 includes them at launch.
- Separate mobile implementation, user-agent business rules, service worker, or offline writes.
- Generic component-system redesign that weakens the approved visual direction.

## Work packets

### M3.1 — App states and data actions

Implement logged-out, loading, empty, ready, stale, error, and disabled-session states. Centralize task queries/mutations so all layouts use the same actions and DTOs.

### M3.2 — Task row and sheet section

Build the stable grid and due/status presentation. Test long text, missing dates, notes/flags, every priority/status, empty sections, high zoom, reduced motion, and color-independent recognition.

### M3.3 — Glance and responsive composition

Implement density tokens, mode persistence, narrow-column and wide layouts, no-hover/touch behavior, and safe full-screen requests if approved. Mode must be independent of viewport and browser fullscreen.

### M3.4 — Core task workflows

Implement create/edit/complete/move/archive/restore/delete according to M0 policy with pending, validation, conflict, denial, and failure states. Avoid optimistic state that cannot be reconciled safely.

### M3.5 — Refresh and device preferences

Retain last valid in-memory data through refresh failure, expose last-success/stale state, back off failures, avoid overlapping requests, and do not persist private task content to local storage.

### M3.6 — Visual gate

Capture approved fixtures at every reference viewport. Brian evaluates information density, reading distance, signal stability, control footprint, and whether the page feels like an information display rather than a card UI.

## Acceptance criteria

- [ ] One shared workflow test creates, edits, completes, moves, archives, and restores a task across the required viewport projects.
- [ ] The same task/action layer powers Standard and Glance modes.
- [ ] Status, task name, due state/TBD, priority, and approved notes/flags remain recognizable at all required widths.
- [ ] Color is never the only status/due signal.
- [ ] Glance mode uses the approved density at the primary narrow-column viewport and remains safely exitable.
- [ ] Mode, scale, density, approved collapse state, and clock preference restore per device without storing task content.
- [ ] Refresh failure retains valid visible data, shows staleness/last success, and recovers automatically.
- [ ] Loading, empty, validation, denied, conflict, network-error, and expired-session states are deliberate.
- [ ] Keyboard focus, dialog focus restoration, touch targets, high zoom, reduced motion, and no-hover behavior pass the approved baseline.
- [ ] No viewport uses a separate domain/workflow implementation.
- [ ] Functional tests and stable visual snapshots pass.
- [ ] Brian records Gate B visual approval.

## Required evidence

- Screenshot index with viewport, fixture, mode, commit, and expected differences.
- Browser-test matrix and results.
- Task mutation failure/denial test results.
- Accessibility scan plus manual keyboard/focus notes.
- Refresh/backoff/offline scenario results.
- Local-storage inspection showing no private task content.

## QA approach

Codex compares screenshots to the M0 reference, then tests task workflows independently on the primary narrow-column viewport, phone, tablet, and full desktop. QA uses empty, normal, dense, long-text, and error fixtures and verifies actual server denials instead of only control visibility.

Opus reviews state consistency, responsive composition drift, refresh races, accessibility, and privacy in client persistence. Visual taste approval remains Brian's decision.

## Rollback

Keep the prior isolated preview deployment addressable. Redeploy it if the current preview fails. No production users or V1 data are affected.

## Evidence Index

| ID | Acceptance criterion | Evidence | Result | Reviewer |
|---|---|---|---|---|
| M3-E1 | Cross-viewport core workflow | Pending | Pending | Codex |
| M3-E2 | Glance visual gate | Pending | Pending | Brian/Codex |
| M3-E3 | Refresh/error behavior | Pending | Pending | Codex |
| M3-E4 | Accessibility/input matrix | Pending | Pending | Codex |
| M3-E5 | Opus UI/state review | Pending | Pending | Opus/Codex |

## Decision Log

| ID | Date | Decision | Owner | Rationale/impact |
|---|---|---|---|---|
| M3-D1 | — | Pending: Gate B visual approval | Brian | Defines core product experience |

## Risk Log

| ID | Severity | Risk | Mitigation/trigger | Owner | Status |
|---|---|---|---|---|---|
| M3-R1 | P1 | Modern UI loses glance density | Early narrow-column gate | Claude | Open |
| M3-R2 | P1 | Device workflows drift | Shared actions/components and project matrix | Claude | Open |
| M3-R3 | P1 | Refresh blanks valid data | Retain last-success state and failure tests | Claude | Open |

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

