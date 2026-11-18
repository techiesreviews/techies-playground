# Replace and Delete in a plugin row get 44 px boxes on any touchscreen

- Date: 2026-11-18
- Owner: fleet-lead (builder: Claude Opus 5.5)
- Status: complete
- Disposition: kept
- Related version: 0.10.3
- Related commit/issue: TOOLS-339 (review finding SL-1 on PR #38, TOOLS-324); follows up [2026-11-18-key-saved-icon-and-start-timeout-check.md](2026-11-18-key-saved-icon-and-start-timeout-check.md), whose 48 px tap areas were reverted in 3ddcfaa

## Context

In an uploaded plugin card, Replace and Delete are 28 px icon buttons (a 16 px icon with 6 px padding) 4 px apart. Each carried a 48 px tap overlay (an absolutely positioned span, centred on the button) shown only where the main pointer is not fine. On a touchscreen laptop the main pointer is a trackpad, so the overlays stayed hidden and touch targets were 28 px (review finding SL-1). Turning the overlays on there (d768408) made them reach 10 px past each button, so they overlapped across the 4 px gap and a trackpad click on Replace's right edge hit Delete; it was reverted (3ddcfaa). The same overlap already existed on phones, where the overlays were always shown.

## Hypothesis and success criteria

- Replace and Delete have tap areas of at least 44 px on any device with a touchscreen, phones and touchscreen laptops alike.
- Their tap areas never overlap: every point of Replace's box hits Replace, and a click or tap one pixel inside Replace's right edge opens the file picker instead of removing the plugin.
- With only a mouse, the row looks as before (28 px boxes, hidden until hover or focus), and the key icon from #38 is unchanged.

## Options considered

- Keep the 48 px overlays and widen the gap to at least 20 px: the overlays would also reach over the key icon (and steal its tooltip with a trackpad on a touchscreen laptop), and the hit area would still be invisible. Rejected.
- Grow the buttons' own boxes to 44 px on any touchscreen and drop the overlays (chosen): the tap area is the box itself, so two boxes with a gap cannot overlap, and the hover background shows the real area.
- Leave unchanged: fails SL-1. Rejected.

## Implementation or prototype

- `src/App.jsx` (`PluginRow`): Replace and Delete lose their overlay span and the `relative` class they needed; they add `any-pointer-coarse:p-3.5`, so on any device with a touchscreen their box is 16 + 2 × 14 = 44 px. The 4 px gap (`gap-1`) is unchanged. The key icon keeps its 28 px box. In the built CSS the `any-pointer-coarse:p-3.5` rule comes after `p-1.5` with the same specificity, so it wins.
- `src/plugin-row-tap-targets.test.js`: source inspection of `PluginRow` (the Node runner cannot render JSX): each button's box is at least 44 px under `any-pointer-coarse` and 28 px otherwise, and has no absolutely positioned overlay or margin that could reach under its neighbour.
- Theme rows, Add key and Cancel keep their overlays; they are outside SL-1 (see Follow-ups).

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Local, before the change | `node --test src/plugin-row-tap-targets.test.js` | Fails | 4 failed: "tap box at least 44 px wherever a touchscreen exists" and "no absolutely positioned tap overlay" for each button | Local run |
| Local, after | Same | Passes | 4 passed | `kit unit --affected` |
| Local | `npm test`; `scripts/agents/kit build` | Pass | 179 passed; build finished | Local run |
| Local, `kit build` CSS | Order of the rules in `dist/assets/index-*.css` | The coarse padding comes after the base padding | `.p-1\.5` at byte 20245, `any-pointer-coarse\:p-3\.5` at 36607 | `grep -bo` |
| Local `vite preview` of the build, Playwright 1.62 Chromium, 1280×900, mouse only (`pointer: fine`, no coarse pointer) | Upload a test plugin ZIP, save a fake key; mouse away and blur, then hover the card; scan `elementFromPoint` every 0.5 px along the buttons' centre line; click 1 px inside Replace's right edge | Hidden at rest, shown on hover; 28 px boxes; no overlap; the click opens the file picker | Opacity 0 at rest, 1 on hover; key, Replace and Delete 28×28, Replace–Delete gap 4 px; scan: key, gap, Replace (726.5–755), gap, Remove (758.5–787); file picker opened, plugin still listed | Script output, [screenshot](assets/2026-11-18-tap-areas-row-desktop-mouse.png) |
| Same, 1366×768 touchscreen laptop: Chromium started with `--blink-settings=primaryPointerType=4,availablePointerTypes=6,primaryHoverType=2,availableHoverTypes=3` | Same, clicking with the mouse | `pointer: fine` and `any-pointer: coarse` both match; 44 px boxes; no overlap; the click opens the file picker | Both media queries match; group shown at rest; key 28×28, Replace and Delete 44×44, gap 4 px; scan: key, gap, Replace (737.5–782), gap, Remove (785.5–830); file picker opened, plugin still listed | Script output, [screenshot](assets/2026-11-18-tap-areas-row-touch-laptop.png) |
| Same, 390×844 phone (`isMobile`, `hasTouch`) | Same, with a touchscreen tap 1 px inside Replace's right edge | 44 px boxes; no overlap; the tap opens the file picker | Replace and Delete 44×44, gap 4 px; scan: key, gap, Replace (63.5–107.5), gap, Remove (111.5–155.5); file picker opened, plugin still listed | Script output, [screenshot](assets/2026-11-18-tap-areas-row-phone.png) |

## Result

On a phone and on an emulated touchscreen laptop, Replace and Delete are 44×44 px with a 4 px gap that hits neither, and a click or tap at Replace's very edge replaces instead of deleting. With only a mouse the row is unchanged. Not yet checked on the deployed preview or on a physical touchscreen laptop.

## Disposition and rationale

Kept: meets SL-1 without overlap, and the visible hover square is the true hit area.

## Documentation impact

`docs/rebuild-spec.md` (uploaded plugin card), `docs/testing.md` (suite count 179 in 27 files), `CHANGELOG_ENTRIES` 0.10.3, version 0.10.3 (`package.json`, `package-lock.json`, `CONTEXT.md`).

## Follow-ups and open questions

- Theme rows' Replace and Delete still carry 48 px overlays 4 px apart, shown where the main pointer is not fine, so on a phone they overlap the same way, and they do not show at all on a touchscreen laptop whose main pointer is a trackpad. Not part of SL-1.
- Add key keeps its overlay, hidden on a touchscreen laptop (28 px tall there).
