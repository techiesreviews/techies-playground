# Unified plugin selection checkmarks

- Date: 2026-08-28
- Owner: Codex
- Status: complete
- Disposition: kept
- Related version: 0.6.0
- Related commit/issue: release 0.6.0 on `main`

## Context

The card surfaces were unified in `2026-08-28-unified-plugin-selection.md`, but uploaded plugins and WordPress.org search results still showed a square checkbox checkmark while featured plugins used a round teal check-circle.

## Hypothesis and success criteria

Using the featured check-circle for every selected plugin source should complete the visual alignment. Checkbox semantics, keyboard focus, and uploaded ZIP actions must remain intact.

## Options considered

- Keep the square indicators and align only the card surface. This left the requested mismatch visible.
- Replace every checkbox in the application. This would unnecessarily change environment settings.
- Add a plugin-specific checkbox indicator and reuse the same `CheckCircleIcon` in directory results. This was selected because it scopes the visual change to plugin selection.

## Implementation or prototype

The shared checkbox component now accepts a plugin-only indicator variant. Uploaded plugin inputs retain native checkbox state and label behavior but render a round outline when unselected and the featured `CheckCircleIcon` when selected. WordPress.org result controls use the same icon and outline treatment. General environment checkboxes remain unchanged.

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Local automated suite | `npm test` | Existing behavior remains valid | 50 tests passed, 0 failed, in 189 ms | Executed 2026-08-28 |
| Local production build | `npm run build` | Vite emits the production bundle | Build completed in 4.72 s; existing large-chunk warning remained non-blocking | Executed 2026-08-28 |
| Local browser, 2684 x 1982 capture | Inspect selected featured cards and uploaded `unblock` with an empty search | Both selected sources show the same round teal check-circle | Confirmed | Recording `browser-recording-mtd35kzb` |
| Local browser, 2684 x 1982 capture | Search `seo` and inspect selected Rank Math plus unselected results | Selected result shows the round teal check-circle; unselected results show neutral round outlines | Confirmed | Recording `browser-recording-mtd367sx` |

## Result

Uploaded and WordPress.org search selections now use the same round teal check-circle as featured cards. Unselected plugin controls use a neutral circular outline, while unrelated environment checkboxes remain square. Automated checks and both local browser scenarios passed.

## Disposition and rationale

Kept. The scoped indicator variant completes the requested visual consistency without changing plugin selection semantics or unrelated controls.

## Documentation impact

Updated `docs/rebuild-spec.md` and `docs/testing.md`. No architecture or data-contract change is required. Included in the 0.6.0 changelog and versioned release.

## Follow-ups and open questions

- None.
