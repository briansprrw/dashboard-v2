# M3.6 — Manual Keyboard/Focus Notes

No human tester was available in this environment. This document records what a real Chromium browser did under real, dispatched keyboard events (`Tab`, `Shift+Tab`, `Enter`, `Escape`) via Playwright — not jsdom simulation — as the closest available substitute for a human keyboard-only pass. Each claim below is backed by an automated assertion in `test/e2e/keyboard-focus.spec.ts`, re-run as part of this packet's required checks (see the handoff for exact pass/fail results).

## Scope

Primary narrow viewport (VP-1, 420×1080), Standard mode, the Household/Work two-List `normalFixture()`. Keyboard-only interaction throughout — no mouse/pointer events were dispatched in any test in this file.

## Findings

1. **Tab order reaches the primary action control.** Tabbing from the top of the document (up to 60 presses) reaches the first section's "+ Task" button without any pointer interaction. Confirmed by `keyboard-focus.spec.ts`'s "Tab order reaches the first task row create button" test.

2. **Enter activates the create-task button and moves focus into the dialog.** With the button focused, pressing `Enter` opens `TaskForm` and focus lands on the dialog's name input — matching `useDialogFocus`'s documented focus-entry contract.

3. **Escape closes the dialog and restores focus to the trigger.** This did **not** work correctly when first tested this session — see Defect M3-DEF-08 below, now fixed and re-verified.

4. **Tab is trapped inside an open dialog.** `Shift+Tab` from the dialog's first field stays inside the dialog's own element tree rather than reaching the background.

5. **Background content is `inert` while a dialog is open.** Every rendered task row sits inside an element carrying the `inert` attribute while `TaskForm` is open, confirming M3-QA-09's "inert background" requirement is applied, not just claimed.

## Defect found and fixed during this pass: M3-DEF-08

**Symptom:** Opening a dialog via keyboard (focus the trigger button, press `Enter`) and then closing it with `Escape` left focus on `<body>` instead of returning it to the trigger button — silently breaking the documented "restore focus to the trigger on close" behavior for the keyboard-only path specifically. Mouse-driven open/close (used throughout `workflow.spec.ts`) did not exhibit the same symptom in this session's testing.

**Root cause (two compounding issues, both in `src/web/hooks/use-dialog-focus.ts`):**

- The hook originally captured `triggerElement = document.activeElement` directly inside its `useLayoutEffect` body. React's `<StrictMode>` (always active — `src/web/app/main.tsx:12-16` is not a dev-only flag) double-invokes that effect (mount → cleanup → mount) on every real mount. By the second synthetic mount, focus had already moved into the dialog's own first field, so the effect recaptured _that_ field as the "trigger" instead of the real button.
- Independently, the cleanup's `triggerElement?.focus()` call ran in the same React commit that lifts the ancestor's `inert` attribute (`DashboardView.tsx`'s `<div inert={dialogOpen}>`). A browser refuses `.focus()` on any element that is still `inert` at the exact moment of the call, and there was no guarantee the `inert` removal had already been applied to the DOM before this cleanup ran — so the restore call could silently no-op even with the correct target element.

**Fix:**

- Capture the trigger once via a lazy `useState` initializer (`useState(() => document.activeElement)`), which React guarantees runs exactly once per real component instance regardless of StrictMode's effect double-invocation.
- Defer the actual `.focus()` restore call by one `requestAnimationFrame`, so it runs after the same commit's `inert` removal has been applied to the DOM rather than racing it.

**Verification:** `test/e2e/keyboard-focus.spec.ts`'s "Escape closes and restores focus" test failed deterministically before the fix and passes after it. The existing jsdom test (`test/web/use-dialog-focus.test.tsx`) was updated to await the same animation-frame tick — it could not have caught this defect on its own, since jsdom does not exhibit the same StrictMode timing or apply `inert`-based focus refusal the way a real browser does; this is exactly the class of defect real-browser M3.6 evidence exists to find. Full defect record in `.handoffs/M3-handoff.md`'s M3.6 Implementation section.

## Touch (Codex's M3.6-QA-05 finding, corrected across two rounds)

Codex's round-1 independent review found the original M3.6 packet never measured a touch target's actual size — a `hasTouch: true` Playwright context flag on phone/tablet screenshots proved only that a touch-capable context renders, not that anything was adequately sized. The first fix used an invisible `::before` pseudo-element to extend each button's hit area to 44×44px without changing its visible size.

Codex's **round-2 re-review found that fix itself unsafe**: the four action buttons had no guaranteed real spacing between them, so at narrow widths the 44px hit-areas of adjacent buttons overlapped, and a real click on the visibly-rendered Move button activated the overlapping Recycle zone instead (Codex reproduced this with a trace: no move dialog appeared, the Undo banner did — meaning a task could be silently recycled when the user meant to move it). This is a genuinely serious class of finding: a passing size measurement told us nothing about whether adjacent targets were safe from each other.

**Corrected:** `.task-row__actions` is now a real flex row with an 8px `gap`, and every button has a real `min-width`/`min-height: 44px` — the clickable area _is_ the rendered element, so there is no separate invisible geometry that can silently drift out of sync with the visible layout. `test/e2e/touch-targets.spec.ts` was rewritten (5 tests): the 44×44px minimum, a zero-pairwise-overlap assertion across all 6 distinct reference widths, a per-action click-routing test that reproduces Codex's exact Move→Recycle scenario and asserts it no longer happens, and a click at the button's visible edge (matching the "4 pixels inside the visibly rendered Move button" point from Codex's trace).

Codex's round-2 review also disproved the round-1 claim that true no-hover browser emulation was a structurally unclosable Playwright/Chromium limitation: a `hasTouch: true` context genuinely produces `(hover: none)`/`(any-hover: none)`/`(pointer: coarse)` media in this installed runtime, independently re-verified before trusting it. `test/e2e/no-hover.spec.ts` now asserts this directly and runs the full create/edit/move workflow inside that context.

**Not covered:** a human's subjective judgment of touch ergonomics on an actual physical device.

## Not covered by this pass

- A real human's subjective experience of tab order across the full Display Settings panel (many controls) was not walked field-by-field; only the primary create-task path was exercised end-to-end.
- Screen-reader announcement content (NVDA/VoiceOver) was not tested — axe-core's static ARIA scan (`accessibility.spec.ts`) is the substitute evidence for label/role correctness, not actual announcement behavior.
- The live-session "actual-server denial UI run" against a real signed-in account remains a manual step per the M3-QA-06/M3.6-D1 decision (blocked on live Google OAuth credentials Claude does not have) — unrelated to keyboard/focus, noted here only for completeness.
