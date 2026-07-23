# M7 — Hardening and Device QA

**Status:** Not Started  
**Owner:** Brian  
**Implementation lead:** Claude  
**PM/QA:** Codex  
**Primary model:** Claude Opus 4.8, `xhigh` effort  
**Review model:** Codex plus targeted human/device QA  
**Estimated focused time:** 4–6 days  
**Production impact:** Production resources may be prepared; no user cutover

## Outcome

Demonstrate that the approved Dash2 launch slice is secure, accessible, observable, performant, recoverable, and usable on real target devices with production-shaped synthetic/migrated data.

## Prerequisites

- M3 and M4 are Accepted; M5 is Accepted or explicitly deferred.
- M6 has two clean rehearsals.
- Launch candidate scope is frozen except for blocker fixes.

## In scope

- Full automated test suite and launch regression pack.
- Browser/device/input/role/data matrix.
- OAuth/session/invite/public/destructive-action threat review.
- CSP and approved security headers without unsafe inline dependencies.
- Accessibility audit and manual keyboard/focus/zoom/reduced-motion/color checks.
- Query/index/response-size/render performance with production-shaped data.
- Structured logs, redaction, health/version/schema checks, and operational signals.
- D1 recovery/export verification, Worker rollback, public shutdown, account disablement, and migration-failure runbooks.
- Staging DNS/OAuth/cookie/route checks and production configuration preflight without cutover.

## Out of scope

- New features, optional polish, dependency churn unrelated to a blocker, production migration, DNS cutover, or V1 freeze.

## Required matrix

| Dimension | Required coverage |
|---|---|
| Browsers | Current Chromium/Edge; WebKit/Safari; Firefox smoke |
| Viewports | Primary narrow column; 1920×1080; larger high-DPI; small/large phone; tablet portrait/landscape; 1280×800 and 1920×1080 smart frame |
| Input | Mouse, keyboard-only, touch, no-hover |
| Accessibility | 200% zoom/reflow, reduced motion, contrast, focus, screen-reader semantics sample |
| Roles | Anonymous, viewer, editor, owner, admin, disabled/removed user |
| Data | Empty, typical, dense, long text, many sheets/tasks, archived/private, invalid migrated values |
| Network | Fast, slow, offline/stale, API errors, expired session |

## Work packets

### M7.1 — Regression and device execution

Run the frozen test matrix, record environment/build/fixture, and distinguish automated, emulator, and physical-device evidence. Test at least one representative real smart-frame/browser early in the milestone.

### M7.2 — Security/privacy hardening

Threat-model auth/session/invite/public/admin/destructive paths; inspect headers, cache, DOM/network/logs, input bounds, origin behavior, enumeration, direct-object access, and dependency advisories. Findings require reproduction and regression evidence.

### M7.3 — Accessibility and performance

Correct P0/P1 accessibility failures. Measure first useful render, warm refresh, mutation feedback, response size, DOM/layout volume, and key D1 queries against approved budgets. Record deviations rather than optimizing blindly.

### M7.4 — Operations and recovery

Exercise health/version/schema mismatch, alert/log queries, session/account shutdown, public-route disablement, Worker rollback, D1 recovery/export, and failed-migration containment in staging.

### M7.5 — Launch-candidate review

Produce a known-issue list, P2/P3 dispositions, configuration diff, signed evidence index, and go/no-go recommendation. No launch occurs in M7.

## Acceptance criteria

- [ ] All required build, lint, type, unit, integration, contract, browser, migration, and visual tests pass on the release candidate.
- [ ] Required matrix cells are executed or have a Brian-approved exception with residual risk.
- [ ] No unresolved P0/P1 defect exists.
- [ ] Authorization/public/privacy regression packs pass.
- [ ] Accessibility has no launch-blocking keyboard, focus, reflow, contrast, motion, name/role/value, or screen-reader defect.
- [ ] Performance budgets are met or deviations are explicitly accepted with measurements.
- [ ] Logs, errors, analytics, and evidence remain redacted.
- [ ] D1 recovery/export and Worker rollback are each rehearsed; their different scopes are documented.
- [ ] Public shutdown, user disablement, schema mismatch, and failed migration runbooks work in staging.
- [ ] Production resource identifiers, OAuth callback, cookies, DNS plan, headers, monitoring, and expected schema are preflighted without cutover.
- [ ] Known issues and rollback triggers are explicit.
- [ ] Brian records Gate F launch-readiness approval.

## Required evidence

- Versioned test-matrix report and release candidate identifier.
- Security/privacy findings with regression tests.
- Accessibility report and manual notes.
- Performance measurements and query plans.
- Recovery/rollback/public-disable/account-disable rehearsal records.
- Production configuration preflight with secrets redacted.
- Known-issue list and go/no-go recommendation.

## QA approach

Codex independently selects high-risk cases, reruns them, inspects configuration/diffs, and challenges “not reproducible” or “low risk” findings with evidence. Brian or a designated human validates the actual primary narrow display and representative physical smart-frame/touch device.

Opus may implement blocker fixes, but each substantive fix receives a new regression test and targeted Codex re-review. Scope freeze remains in effect.

## Rollback

M7 changes remain in staging/release branches. Restore the prior staging deployment/database as rehearsed. Production resources remain dark and V1 continues normally.

## Evidence Index

| ID | Acceptance criterion | Evidence | Result | Reviewer |
|---|---|---|---|---|
| M7-E1 | Full launch matrix | Pending | Pending | Codex |
| M7-E2 | Security/accessibility | Pending | Pending | Codex |
| M7-E3 | Performance budgets | Pending | Pending | Codex |
| M7-E4 | Recovery/operations | Pending | Pending | Codex |
| M7-E5 | Gate F readiness | Pending | Pending | Brian |

## Decision Log

| ID | Date | Decision | Owner | Rationale/impact |
|---|---|---|---|---|
| M7-D1 | — | Pending: release candidate and accepted known issues | Brian | Launch input |

## Risk Log

| ID | Severity | Risk | Mitigation/trigger | Owner | Status |
|---|---|---|---|---|---|
| M7-R1 | P1 | Emulator passes but real display fails | Physical-device gate | Brian/Codex | Open |
| M7-R2 | P1 | Code rollback mistaken for DB recovery | Separate rehearsed runbooks | Claude | Open |
| M7-R3 | P1 | Late feature churn invalidates evidence | Scope freeze and RC versioning | Codex | Open |

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

