# Theme rows' Replace and Delete and the Add key button get real tap boxes on any touchscreen

- Date: 2026-11-18
- Owner: fleet-lead (builder: Claude Opus 5.5)
- Status: complete
- Disposition: kept
- Related version: 0.10.4
- Related commit/issue: TOOLS-342; follows up [2026-11-18-plugin-row-tap-areas.md](2026-11-18-plugin-row-tap-areas.md) (TOOLS-339, PR #39), whose Follow-ups named both gaps

## Context

PR #39 gave the uploaded plugin card's Replace and Delete their own 44 px boxes on any touchscreen instead of 48 px tap overlays. Two places kept the old overlays (an absolutely positioned span, shown only where the main pointer is not fine):

- An uploaded theme row's Replace and Delete: 28 px boxes 4 px apart. On a phone each overlay reached 10 px past its button, so they overlapped across the gap. On a touchscreen laptop (main pointer a trackpad) the overlays stayed hidden and the button group did not show at all until hover, because the row only had the `pointer-fine:` hide rules and no `any-pointer-coarse:` show rule.
- The plugin card's Add key button: 28 px tall. On a touchscreen laptop its overlay stayed hidden, so the touch target was 28 px tall.

## Hypothesis and success criteria

- In a theme row, Replace and Delete are at least 44 px on any device with a touchscreen, phones and touchscreen laptops alike, never overlap, and show without hover on a touchscreen laptop.
- Add key is at least 44 px tall on any device with a touchscreen, and its tap area ends at its own edge, so it cannot reach Replace or the plugin name.
- With only a mouse, both look as before (theme buttons 28 px and hidden until hover or focus; Add key 28 px tall).

## Options considered

- Show the existing overlays on touchscreen laptops too: the theme overlays would overlap each other as on phones, and Add key's would reach 10 px above and below its box. Rejected (the same reason d768408 was reverted for plugin rows).
- Use PR #39's approach (chosen): drop the overlays, grow the controls' own boxes under `any-pointer-coarse`, and show the theme group under `any-pointer-coarse` as the plugin card already does.
- Leave unchanged: fails TOOLS-342. Rejected.

## Implementation or prototype

- `src/App.jsx` (`ThemeRow`): Replace and Delete lose their overlay span and the `relative` class it needed and add `any-pointer-coarse:p-3.5` (16 + 2 × 14 = 44 px). The button group adds `any-pointer-coarse:pointer-events-auto any-pointer-coarse:opacity-100`, the same rule the plugin card has. The 4 px gap (`gap-1`) is unchanged. On any touchscreen the row adds `any-pointer-coarse:flex-wrap` and the text column `basis-40` (as in the plugin card), so on a phone-width row the wider group (92 px) moves to its own line under the artwork instead of squeezing the theme name and details into a narrower column. With only a mouse the row does not wrap, so a narrow mouse-only window gets no empty band where the hidden group would sit (review finding R1-1).
- `src/App.jsx` (`PluginRow`): Add key loses its overlay span and `relative` and adds `any-pointer-coarse:min-h-11` (44 px). Its content stays centred (`inline-flex items-center`); its width (88 px) is unchanged.
- `src/theme-row-tap-targets.test.js` (new: box sizes, no overlay, the group shown on any touchscreen, the row wrapping only on a touchscreen with a text column of at least 160 px) and `src/plugin-row-tap-targets.test.js` (one new Add key test: at least 44 px tall on any touchscreen, content centred, mouse-only height unchanged, no overlay): source inspection, as in PR #39, since the Node runner cannot render JSX.
- Add key form's Cancel button keeps its overlay; it is outside this card.

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Local, before the change | `node --test src/theme-row-tap-targets.test.js src/plugin-row-tap-targets.test.js` | New tests fail | 6 failed (theme Replace and Remove: 44 px box and no overlay; theme group shown on any touchscreen; Add key 44 px tall with no overlay), 5 passed (PR #39's) | Local run |
| Local, after | `scripts/agents/kit unit --affected` | Pass | 11/11 in 2 files | `RESULT: ok unit 11/11` |
| Local, after review round 1 | `scripts/agents/kit unit --affected` (wrap and centring checks added) | Pass | 12/12 in 2 files | `RESULT: ok unit 12/12` |
| Local | `npm test`; `scripts/agents/kit build` | Pass | 187 passed; build finished | Local run |
| Local, `kit build` CSS | Order of the rules in `dist/assets/index-*.css` | Coarse rules after the base rules | `.p-1\.5` padding at byte 20292, `any-pointer-coarse\:p-3\.5` at 36720; `.min-h-11` at 11218, `any-pointer-coarse\:min-h-11` at 36653 | `grep -bo` |
| Local `vite preview` of this build and of the base build (dev 5edb0b2), Playwright 1.63 Chromium, 1280×900, mouse only (`pointer: fine`, no coarse pointer) | Upload a test plugin and a test theme ZIP; mouse away and blur, then hover the theme row; scan `elementFromPoint` every 0.5 px along the buttons' centre line; click 1 px inside theme Replace's right edge; click 1 px inside Add key's top edge | Same as base: theme group hidden at rest, shown on hover, 28 px boxes; Add key 88×28 | Before and after identical: opacity 0 at rest, 1 on hover; Replace and Remove 28×28, gap 4 px; scan Replace (722.7–750.7), gap, Remove (754.7–782.7); Add key 88×28; click on Replace's edge opened the file picker, click on Add key's edge opened the key fields | Script output, [screenshot](assets/2026-11-18-theme-row-tap-desktop-mouse.png) |
| Same, 1366×768 touchscreen laptop: Chromium started with `--blink-settings=primaryPointerType=4,availablePointerTypes=6,primaryHoverType=2,availableHoverTypes=3` | Same, clicking with the mouse | `pointer: fine` and `any-pointer: coarse` both match; theme group shown at rest; 44 px boxes, no overlap; Add key 44 px tall, no overlap with its neighbours | Before: theme group opacity 0 and pointer-events none at rest, 28×28 boxes; Add key 88×28. After: theme group opacity 1 at rest, Replace and Remove 44×44, gap 4 px, scan Replace (733.7–777.7), gap, Remove (781.7–825.7); click 1 px inside Replace's right edge opened the file picker, theme still listed. Add key 88×44; scan along its centre line from the card's left edge: no control (83–637), Add (637.5–726), gap (11 px), Replace (737.5–782), gap, Remove (785.5–830); vertical scan through its centre: nothing, Add key (361.5–405.5), nothing, inside the 72 px card (same height as before); the point 2 px right of it hits nothing; click 1 px inside its top edge opened the key fields | Script output, [theme screenshot](assets/2026-11-18-theme-row-tap-touch-laptop.png), [Add key screenshot](assets/2026-11-18-add-key-tap-touch-laptop.png) |
| Same, 390×844 phone (`isMobile`, `hasTouch`) | Same, with touchscreen taps | 44 px boxes; no overlap; a tap 1 px inside theme Replace's right edge replaces | Before: Replace and Remove 28×28 but the scan read Replace 283.5–315, Remove 315.5–363.5 while Replace's box ends at 322, so Remove's overlay took Replace's right 7 px, and the tap 1 px inside Replace's right edge did not open the file picker. After: Replace and Remove 44×44, gap 4 px, scan Replace (35.5–79.5), gap, Remove (83.5–127.5); the tap opened the file picker, theme still listed. Theme row 157 → 185 px tall, the group on its own line under the artwork and the details on 2 lines instead of 4. Add key 88×44 (was 28 tall with a 48 px overlay); vertical scan nothing, Add key (399.5–443.5), nothing; card height 192 px before and after; tap 1 px inside its top edge opened the key fields | Script output, [theme screenshot](assets/2026-11-18-theme-row-tap-phone.png), [Add key screenshot](assets/2026-11-18-add-key-tap-phone.png) |
| This build after review round 1 (81cb4a3), the three setups above again | The same script | Same results as above | Desktop mouse, touchscreen laptop and phone gave the same numbers as the rows above: on the phone the theme row is 318×185 with Replace (36–80) and Remove (84–128) on their own line under the artwork; the touchscreen laptop row stays 727×81 with 44×44 boxes; every edge tap or click opened the file picker | Script output |
| Same servers, 320×800, mouse only, after review round 1 | Theme row size and button positions, this build and the base build | Identical: the mouse-only row does not wrap | Both: theme row 308×185, Replace and Remove 28×28 at the same x, gap 4 px, group hidden at rest and shown on hover | Script output |
| Same server, desktop mouse only, repeated 5 times, then 10 more times with the script's wait for the file-chooser event raised from 3 s to 10 s | The file-picker click above | Opens each time | With the 3 s wait it opened in 4 of 5 runs; in the run that missed, `elementFromPoint` at the click point was Replace with opacity 1 and pointer-events auto, as in the others. With the 10 s wait it opened in 10 of 10 runs, so the miss was the script's wait, not the page; the mouse-only classes are unchanged by this change | Script output |

## Result

On an emulated touchscreen laptop and a phone, an uploaded theme's Replace and Delete are 44×44 px with a 4 px gap that hits neither, they show without hover on the touchscreen laptop (before: hidden until hover), and a click or tap at Replace's very edge replaces instead of deleting (before, on a phone, it hit Delete). Add key is 44 px tall on both, and nothing outside its box responds to it. With only a mouse both are unchanged (one early mouse-only run missed the file-picker event within the script's 3 s wait; with a 10 s wait 10 of 10 runs opened it). On a phone a theme row is 28 px taller because the buttons move to their own line, matching the plugin card. Not yet checked on the deployed preview or on a physical touchscreen laptop.

## Disposition and rationale

Kept: meets TOOLS-342 with the same approach as PR #39; the visible hover square or button outline is the true hit area.

## Documentation impact

`docs/rebuild-spec.md` (Add key size; uploaded theme rows), `docs/testing.md` (suite count 187 in 28 files), `CHANGELOG_ENTRIES` 0.10.4, version 0.10.4 (`package.json`, `package-lock.json`, `CONTEXT.md`).

## Follow-ups and open questions

- The Add key form's Cancel button and other launcher controls still carry the old 48 px overlays shown only where the main pointer is not fine; none was part of TOOLS-339 or TOOLS-342.
