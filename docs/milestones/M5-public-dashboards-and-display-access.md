# M5 — Public Dashboards and Display Access

**Status:** Not Started — conditional on launch scope  
**Owner:** Brian  
**Implementation lead:** Claude  
**PM/QA:** Codex  
**Primary model:** Claude Sonnet 5, `high` effort  
**Review model:** Claude Opus 4.8, `xhigh` privacy/security review  
**Estimated focused time:** 4–7 days  
**Production impact:** Anonymous read surface in isolated staging

## Outcome

Provide an intentional, revocable public dashboard and optional trusted display access without exposing private tasks, notes, identities, internal identifiers, memberships, audit data, or management controls.

If Brian excludes public/display access from launch, record `Deferred by product decision` and move to M6; do not partially expose an anonymous route.

## Prerequisites

- M4 is Accepted.
- Brian records Gate E scope approval.
- M0 public field, private task/note, username, indexing, caching/revocation, and smart-frame access policies are final.

## In scope

- Normalized unique public usernames and reserved-name policy.
- Explicit profile enable/disable, selected owned sheets, and per-task/private-field eligibility.
- Dedicated allowlist-only public DTO and serializer.
- Exact authenticated owner preview and anonymous rendering from the same projection.
- Permanent `noindex` behavior with no opt-in or enable-indexing control.
- Bounded cache behavior with measured revocation.
- Rate limiting/abuse controls for anonymous routes and username probes.
- Optional revocable read-only display session only if M0 approved it.
- Smart-frame/no-hover public layout.
- Contract, privacy, cache, browser, and abuse tests.

## Out of scope

- Public editing, arbitrary field selection, public notes unless explicitly approved, sharing internal DTOs, unrevocable bearer URLs, SEO by default, or cross-user sheet publication.

## Non-negotiable public exclusions

Unless M0 explicitly narrows further, public output must exclude:

- Emails and provider identity.
- Internal user, dashboard, sheet, task, membership, invite, audit, and legacy identifiers.
- Task notes and any private task/note.
- Created/updated actor identities.
- Internal timestamps, archive metadata, raw slugs, access roles, and configuration detail.

Do not implement this by serializing a private DTO and deleting fields after serialization.

## Work packets

### M5.1 — Username and configuration

Implement normalization, reserved routes/names, uniqueness, change/reuse policy, explicit enablement, sheet selection, and safe disabled/not-found responses without private-account enumeration.

### M5.2 — Public projection

Build a dedicated repository/service query and serializer that selects only approved fields and excludes private records at source. Add a locked contract snapshot and property/negative assertions.

### M5.3 — Preview and anonymous UI

Use the exact public projection for owner preview and anonymous rendering. Clearly mark preview; exclude management controls from anonymous output.

### M5.4 — Caching, revocation, indexing, and abuse

Implement cache headers/invalidation strategy, permanent `noindex`, rate limits, and safe errors. Measure disable/remove/private-change propagation against the approved window.

### M5.5 — Privacy attack review

Fresh Opus `xhigh` session probes direct IDs, guessed usernames, archived/private transitions, stale caches, alternate response paths, error bodies, HTML/source, telemetry/logs, and display-session revocation.

## Acceptance criteria

- [ ] Public output is constructed only from an explicit approved allowlist.
- [ ] Contract tests prove every prohibited field is absent at every nesting level.
- [ ] Private tasks and private notes never appear to viewers not authorized by M0 policy or to anonymous users.
- [ ] Preview and anonymous output use the same projection and differ only in approved preview framing.
- [ ] Disabled profiles, removed sheets, and newly private tasks stop appearing within the approved measured cache window.
- [ ] Reserved/application paths cannot be registered as usernames; normalization and change/reuse behavior match policy.
- [ ] Anonymous errors do not disclose whether a private account/email exists.
- [ ] `noindex` is unconditional across public pages/responses and no indexing opt-in exists in UI, API, or storage.
- [ ] Rate/abuse behavior is bounded and does not leak private state.
- [ ] Public/display pages have no mutation or management controls and pass smart-frame/no-hover tests.
- [ ] Revocable display sessions, if implemented, are scoped read-only and demonstrably revocable.
- [ ] Fresh Opus privacy review has no unresolved P0/P1.

## Required evidence

- Public DTO/serializer contract and prohibited-field test.
- Preview-versus-anonymous parity test.
- Cache/revocation timing results.
- Username normalization/reserved-name test matrix.
- HTML/network/log inspection with synthetic data.
- Privacy review findings and dispositions.

## QA approach

Codex creates synthetic public/private/archived combinations and inspects API JSON, rendered HTML, network requests, cache headers, search directives, error responses, and logs. It changes a visible task to private and disables profiles/sheets while polling anonymously to measure revocation.

Any exposure of a prohibited field is P0 and stops the milestone. A UI that merely hides leaked JSON does not pass.

## Rollback

Disable the public/display route feature flag or route binding, purge approved caches, and leave private Dash2 available. Verify anonymous endpoints are closed after rollback.

## Evidence Index

| ID | Acceptance criterion | Evidence | Result | Reviewer |
|---|---|---|---|---|
| M5-E1 | Public field exclusion | Pending | Pending | Codex |
| M5-E2 | Preview parity | Pending | Pending | Codex |
| M5-E3 | Revocation/cache timing | Pending | Pending | Codex |
| M5-E4 | Username/abuse behavior | Pending | Pending | Codex |
| M5-E5 | Opus privacy review | Pending | Pending | Opus/Codex |

## Decision Log

| ID | Date | Decision | Owner | Rationale/impact |
|---|---|---|---|---|
| M5-D1 | — | Pending: include or defer from launch | Brian | Conditional milestone |

## Risk Log

| ID | Severity | Risk | Mitigation/trigger | Owner | Status |
|---|---|---|---|---|---|
| M5-R1 | P0 | Private/internal field exposure | Dedicated projection + exclusion contract | Claude | Open |
| M5-R2 | P1 | Revocation delayed by cache | Bounded cache and timed test | Claude | Open |
| M5-R3 | P1 | Username reveals private account state | Generic errors and abuse tests | Claude | Open |

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
