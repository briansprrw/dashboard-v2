# M3.6 — Screenshot Index

All screenshots below are real, rendered-application evidence (real Vite dev server, real React tree, real CSS/container queries) with the `/api/v1/*` backend mocked at the browser network layer (`test/e2e/mock-api.ts`) using synthetic fixtures (`test/e2e/fixtures.ts`, invented values only per M0-D21). No live server, database, or Google OAuth session was used — this is the accepted evidence path per the M3-QA-06/M3.6-D1 decision (live-session denial UI run remains a separate documented manual step; see `.handoffs/M3-handoff.md`).

**Commit / diff base:** `5d9a48b72bcd7bcabe454c29daaf14cde2b408b0` (committed to branch `m3-glance-dashboard-and-core-tasks`; captures below were generated against the M3.1–M3.6 worktree prior to that commit and are unchanged since).
**Captured with:** Playwright 1.62.0, Chromium (Chrome for Testing 151.0.7922.34), headless.
**Browser clock:** frozen to a fixed fixture epoch (`freezeClock`, `test/e2e/fixtures.ts`) so due-band rendering is deterministic regardless of when the suite runs — added after Codex's independent review (M3.6-QA-02) found the original captures had drifted stale.
**Regenerate:** `npx playwright test viewport-capture.spec.ts zoom-and-motion.spec.ts min-yield.spec.ts --project=chromium-desktop` (these captures are dimension-only and scoped to the default project; `playwright.config.ts` also now defines 8 additional named browser/device projects — chromium-narrow/full-1920/phone, webkit-phone, chromium-ipad-portrait/landscape, chromium-smart-frame-touch-nohover, firefox-smoke — that `workflow.spec.ts` and `no-hover.spec.ts` run under, per M3.6-QA-03's fix).

## Revision note (2026-07-29, round 3 — design-system pass, M3-DEF-12)

**Every screenshot in this set was regenerated after the M3-DEF-12 design-system
implementation and supersedes the round-2 captures.** Brian's review of the round-2
set found the UI still "nowhere near" the approved mockup's design language. The
disconnect was structural: the mockup had never been implemented as a design system,
so `global.css` carried no design tokens and no base-element styling, and every
button, field, heading, and dialog in the app rendered at browser defaults — only the
four elements that prior findings had named individually were styled at all. The
due-band palette had also been invented independently of the mockup rather than
copied, with its ordering inverted (`soonish` blue, `future` grey, `complete` a bright
saturated green).

What these captures now show, that the round-2 set did not:

- The mockup's own due-band palette and its ordering (reds urgent, amber near, greens
  further out, receding blue-grey for complete, neutral for undated), with the
  overdue row carrying the mockup's inset light ring.
- Section heads as small dimmed uppercase labels with a chevron and task count,
  instead of large white page-level headings.
- The due indicator as the mockup's tabular-numeral pill.
- Standard mode's settings surface as real cards with setting rows, segmented
  controls, and pill switches, instead of browser-default `<fieldset>` borders,
  native radios, and white system buttons.
- Task dialogs as centered modal panels with a scrim.
- All four themes with a complete task-row treatment: Dark = mockup style A (solid
  bars), Darker = mockup style B (translucent + band border) per M0.1 V5, and
  documented AA-verified translations for Light and High-contrast, which previously
  had no task-row treatment at all.

Six divergences from the mockup are deliberate and documented in `global.css` and in
`.handoffs/M3-handoff.md`; four of them exist because the mockup's own values fail
WCAG AA (`--text-faint` at 3.71:1, white-on-accent at 3.56:1, the due-band word
retained per AC-G2, and the `complete` row's opacity). At the time of this round-3
capture, the mockup's search, filter chips, FAB, and Legend bar were **not** present.
**Superseded:** M3.6-D3 later resolved Legend yes / FAB no — the Legend was added and
is captured separately below (`vp1-narrow-420x1080-glance-dark-legend-expanded.png`,
`vp3-desktop-1920x1080-glance-dark-legend-expanded.png`, M3-E10). Search/filter chips
and the FAB remain out of scope for M3.

## Revision note (2026-07-29, round 2)

This screenshot set has been through two Codex review rounds (full findings in `.handoffs/M3-handoff.md`'s "QA" and "Re-review" sections):

**Round 1** found real gaps in the original capture:

- **M3.6-QA-01:** Dark theme now renders the approved Style A solid due-band row bars (M0.1 V5), not a thin border — every screenshot below reflects this. VP-2 (640px) now correctly stays one column instead of rendering two cramped columns.
- **M3.6-QA-02:** Every screenshot was recaptured with the browser clock frozen, so due-band labels (Overdue/Due today/Due soon/Due soonish/Due later/TBD) now show the mixed spread the fixtures actually intend, not a flat "Due later" caused by clock drift.

A WCAG AA color-contrast fix was also required once the solid-bar background was implemented (found by `accessibility.spec.ts`, not Codex).

**Round 2** found the Round 1 touch-target fix was itself defective — an invisible hit-area extension let adjacent buttons' tap zones overlap, so a real click on the visibly-rendered Move button could activate Recycle instead (Codex reproduced this with a trace). Every screenshot showing task-row action buttons (Standard mode, writable rows) now reflects the corrected real-spacing layout: buttons have a genuine 44×44px minimum size with a real gap between them, flowing onto their own line below the task's info rather than an invisible trick layered on the original small buttons.

## Reference viewports (M0.4 §1 VP-1..VP-9 — this table is their M3 replacement)

| Viewport | Dimensions | File                                                        | Mode / Theme  | Fixture                                      | Notes                                                                                                                                               |
| -------- | ---------- | ----------------------------------------------------------- | ------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| VP-1     | 420×1080   | `vp1-narrow-420x1080-glance-primary-glance-dark-normal.png` | Glance / dark | Normal (2 Lists, mixed due bands/priorities) | Primary narrow-column reference. Solid due-band bars.                                                                                               |
| VP-2     | 640×1080   | `vp2-narrow-640x1080-upper-bound-glance-dark-normal.png`    | Glance / dark | Normal                                       | Upper bound of the narrow-column band. See also the dedicated one-column verification below.                                                        |
| VP-3     | 1920×1080  | `vp3-desktop-1920x1080-glance-dark-normal.png`              | Glance / dark | Normal                                       | Full desktop, Glance.                                                                                                                               |
| VP-4     | 360×800    | `vp4-phone-360x800-glance-dark-normal.png`                  | Glance / dark | Normal                                       | Small phone portrait, touch context.                                                                                                                |
| VP-5     | 430×932    | `vp5-phone-430x932-glance-dark-normal.png`                  | Glance / dark | Normal                                       | Large phone portrait, touch context.                                                                                                                |
| VP-6     | 820×1180   | `vp6-tablet-820x1180-portrait-glance-dark-normal.png`       | Glance / dark | Normal                                       | Tablet portrait, touch+keyboard.                                                                                                                    |
| VP-7     | 1180×820   | `vp7-tablet-1180x820-landscape-glance-dark-normal.png`      | Glance / dark | Normal                                       | Tablet landscape.                                                                                                                                   |
| VP-8     | 1280×800   | `vp8-smart-frame-1280x800-glance-dark-normal.png`           | Glance / dark | Normal                                       | Smart-frame (small). No-hover media is genuinely emulated and asserted by `test/e2e/no-hover.spec.ts`, not just structural — see Known limitations. |
| VP-9     | 1920×1080  | `vp9-smart-frame-1920x1080-glance-dark-normal.png`          | Glance / dark | Normal                                       | Smart-frame (large). Same no-hover note as VP-8.                                                                                                    |

## Additional required fixture/mode coverage (VP-1 primary narrow, VP-2, VP-3 full desktop)

| File                                                         | Viewport | Mode / Theme                 | Fixture                                     | Purpose                                                                                                                                                                                                                                         |
| ------------------------------------------------------------ | -------- | ---------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vp1-narrow-420x1080-glance-dark-long-text.png`              | VP-1     | Glance / dark                | Long-text (long name/note, 2 emoji flags)   | Long-text recognition at narrow density.                                                                                                                                                                                                        |
| `vp1-narrow-420x1080-glance-dark-empty-section.png`          | VP-1     | Glance / dark                | Empty (0 tasks in one List)                 | Empty-section messaging.                                                                                                                                                                                                                        |
| `vp1-narrow-420x1080-standard-light-normal.png`              | VP-1     | Standard / light             | Normal, every priority/due-band represented | Color-independent recognition (light theme now has its own complete due-band treatment — light tints carrying dark saturated text, AA-verified; before M3-DEF-12 it had no task-row treatment at all), full status/priority/due icon+label set. |
| `vp1-narrow-420x1080-glance-dark-clock-enabled.png`          | VP-1     | Glance / dark, clock enabled | Normal                                      | Clock/date header prominence in Glance (added for M3.6-QA-01 — no clock-enabled variant existed before).                                                                                                                                        |
| `vp2-narrow-640x1080-standard-dark-one-column.png`           | VP-2     | Standard / dark              | Multi-section (2 Lists)                     | Verifies VP-2 stays one column (`getComputedStyle` track-count assertion, not just visual) — the M3.6-QA-01 VP-2 fix.                                                                                                                           |
| `vp3-desktop-1920x1080-standard-dark-dense.png`              | VP-3     | Standard / dark              | Dense (24 tasks, one List)                  | Row-density at scale within a single section.                                                                                                                                                                                                   |
| `vp3-desktop-1920x1080-standard-dark-multi-section-3col.png` | VP-3     | Standard / dark              | Multi-section (4 Lists)                     | 3-column grid flow with `columnBounds.max: 3` — evidence for M3-DEF-06's fix.                                                                                                                                                                   |

## Max-firm / narrow-width fallback (AC-G5: "max is firm; min may yield... fallback must be visible in M3 evidence")

**Amended 2026-07-30 (M3-D2/M3-E5-01):** both rows below previously described the natural `auto-fill` result as min actively "yielding" or being "honored." Neither is accurate: `--column-min` is not consumed by any CSS rule at all (M3-D2), so there is no enforced minimum to yield from or honor — the column counts below come entirely from `auto-fill` plus the firm max clamp, independent of the configured min value. The second row's file was also renamed from `...min-honored.png` (which additionally implied enforcement in its filename) to `...auto-fill-2col.png`. Both captions are corrected below to state this plainly.

| File                                                   | Viewport | Config                           | Result                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------ | -------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vp1-narrow-420x1080-standard-dark-auto-fill-1col.png` | 420×1080 | `columnBounds: {min: 3, max: 3}` | **Not min-enforcement.** `auto-fill` naturally renders 1 column at 420px (confirmed via `getComputedStyle` track count in `min-yield.spec.ts`); the configured min of 3 was never enforced or "yielded" from — there is no active minimum to yield. This is genuine max-firm/no-unsafe-reflow evidence (max, also 3, never overrides the natural count). |
| `vp7-tablet-1180x820-standard-dark-auto-fill-2col.png` | 1180×820 | `columnBounds: {min: 2, max: 3}` | **Not min-enforcement.** `auto-fill` naturally reaches 2 columns at 1180px regardless of the configured min value — the same result would occur with `min: 1` or `min: 3`. Retained only as a max-not-exceeded data point at this width.                                                                                                                 |

## High zoom / reduced motion

| File                                                 | Setting                                   | Result                                                                                                                                                                                                                                                               |
| ---------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vp1-narrow-420x1080-glance-dark-zoom-max.png`       | Zoom step +3 (M0 §7: 7 steps, 10%/step)   | Text/rows visibly scale up and reflow; no clipping observed.                                                                                                                                                                                                         |
| `vp1-narrow-420x1080-glance-dark-zoom-min.png`       | Zoom step −3                              | Text/rows visibly scale down.                                                                                                                                                                                                                                        |
| `vp1-narrow-420x1080-glance-dark-reduced-motion.png` | `prefers-reduced-motion: reduce` emulated | No CSS transition/animation exists anywhere in `global.css` as of this packet, confirmed by a stylesheet-rule scan in `zoom-and-motion.spec.ts` — there is currently nothing for the media query to disable. Recorded as a null result, not a UI-toggled preference. |

## Stable visual-regression baselines (M3.6-QA-04)

Distinct from the human-review captures above: `test/e2e/visual-regression.spec.ts` uses Playwright's `toHaveScreenshot()` against 3 committed baselines under `test/e2e/visual-regression.spec.ts-snapshots/` (VP-1 Glance/dark, VP-2 one-column, VP-3 3-column). A deliberate CSS color regression was introduced and confirmed caught (10502px / ~3% diff) before being reverted, proving the assertion detects drift rather than silently accepting it. Run with `npm run test:e2e` or `npx playwright test visual-regression.spec.ts`.

## Defects found and fixed during this capture pass

Full defect records are in `.handoffs/M3-handoff.md`'s M3.6 Implementation, QA, Correction, and Re-review sections.

- **M3-DEF-06 (P1):** `.sheet-columns`'s `@container` query targeted the same element that declared `container-type`, so Chromium never matched it and the configured `column-max` bound was silently unenforced. Fixed by moving `container-type` to a new non-containing ancestor wrapper.
- **M3-DEF-07 (P2):** The background-refresh-interval input had no accessible label. Fixed by wrapping it in a `<label>`.
- **M3-DEF-08 (P1):** Escape-closing a dialog opened via keyboard left focus on `<body>` instead of the trigger, due to two compounding React/browser timing issues. Fixed in `use-dialog-focus.ts`.
- **M3-DEF-09 / M3.6-QA-05 (round 1, P2 then raised to P1 by Codex's re-review):** Touch targets were never measured (found at 21-23px). A first fix (invisible `::before` hit-area extension) was itself found unsafe by Codex — adjacent buttons' hit-areas overlapped, so a click on the visibly-rendered Move button could activate Recycle instead. **Corrected in round 2** with real, guaranteed spacing: `min-width`/`min-height: 44px` on every button plus a real flex `gap`, with `.task-row` now wrapping so the action row flows onto its own line rather than being squeezed narrow.
- **M3-DEF-10 / M3.6-QA-03 (round 1, raised to P1 by Codex):** The workflow test covered only 3 of 9 reference viewports. Round 1 expanded to all 9, but only inside one default desktop Chromium context — Codex's re-review found no real device/browser projects existed. **Corrected in round 2:** WebKit and Firefox installed; `playwright.config.ts` now defines 9 named projects (narrow/full-desktop/phone Chromium, WebKit phone, iPad portrait/landscape, smart-frame touch/no-hover, Firefox smoke) matching the architecture doc's required matrix.
- **M3.6-QA-01 (P1):** Glance mode never implemented the approved solid-bar row style (thin border only), and VP-2 rendered 2 columns instead of the approved 1. Both fixed; independently confirmed resolved by Codex's round-2 re-review.
- **M3.6-QA-02 (P1):** Fixture due-dates drifted from the real browser clock, invalidating due-band screenshot claims. Fixed with a frozen test clock; independently confirmed resolved (byte-identical recapture hashes).
- **WCAG contrast (found via `accessibility.spec.ts`, not a numbered Codex finding):** Implementing M3.6-QA-01's solid background initially failed AA contrast (2.6-3.6:1) at 5 of 6 due-band colors against the fixed white row text. Fixed at the time with separately computed, darker custom properties. **Superseded by M3-DEF-12:** that darkening was only ever necessary because the palette had been invented rather than copied from the mockup — the mockup's own due-band colors measure 6.3:1-10.8:1 against their paired text and need no adjustment, so the bespoke `--due-band-solid`/`--due-band-color` properties no longer exist.
- **M3.6-QA-04 (P2):** No stable visual-regression assertions existed. Fixed with `test/e2e/visual-regression.spec.ts` and a new `npm run test:e2e` script; independently confirmed resolved.
- **M3.6-QA-05 no-hover half (raised to P1 by Codex):** The round-1 correction claimed no-hover browser emulation was a structurally unclosable Playwright/Chromium limitation. Codex's own probe disproved this — a `hasTouch: true` context genuinely yields `(hover: none)` media in this runtime. **Corrected in round 2** after independently re-verifying Codex's claim: `test/e2e/no-hover.spec.ts` asserts the media values directly and exercises create+move inside that context (not the full workflow — corrected wording per M3.6-RR3-01).
- **M3.6-RR-01 (P2):** Brian's 44×44 touch-target decision existed only in prose, not the milestone's Decision Log table. Added as `M3-DEF-09/M3.6-D2`.
- **M3.6-RR-02 (P2, mechanical):** Codex found `format:check` actually failing on this file, contradicting the round-1 PASS claim. Fixed by running `npm run format`.

## Known limitations of this evidence

- **VP-8/VP-9 "no-hover" contexts (resolved in round 2):** An earlier version of this document claimed Playwright/Chromium had no way to produce real no-hover media, which Codex's round-2 re-review disproved — `hasTouch: true` genuinely yields `(hover: none)`/`(any-hover: none)`/`(pointer: coarse)` in this runtime. `test/e2e/no-hover.spec.ts` now asserts this directly and exercises create+move inside that context. This screenshot index's own static captures still don't visually prove no-hover behavior (a screenshot can't show what happens on hover that doesn't occur), but the actual behavioral requirement is now covered by a real assertion, not just documented as a limitation.
- **Live-session denial UI run:** Not attempted, per the already-recorded M3-QA-06/M3.6-D1 decision — remains a manual step requiring Brian's live Google sign-in (same posture as M2-R7).
- **Opus UI/state review:** Performed (2026-07-30) against commit `5d9a48b` — see M3-E5 in the milestone's Evidence Index. 4/5 dimensions passed; one new P2 (`M3-E5-01`, the inert column-min setting) found and dispositioned in the same correction pass.
