# Unified plugin selection surfaces

- Date: 2026-08-28
- Owner: Codex
- Status: complete
- Disposition: kept
- Related version: 0.6.0
- Related commit/issue: release 0.6.0 on `main`

## Context

Featured WordPress.org plugins used selectable cards with a teal selected surface and subtle ring, while uploaded plugins and WordPress.org search results used bordered list rows with standalone checkbox treatments. The same recipe action therefore looked different depending on where a plugin was selected.

## Hypothesis and success criteria

Using the featured-card surface for all plugin sources should make selection feel consistent. Success requires uploaded plugins and directory search results to use the same selected background and ring values as featured plugins, without interfering with uploaded ZIP replacement or deletion.

## Options considered

- Leave the three treatments unchanged. This preserved the current layout but kept the inconsistency.
- Restyle only the checkbox controls. This would align the indicator but not the more prominent selected surface.
- Reuse one card-surface helper across featured, uploaded, and search-result plugins. This was selected because it keeps one visual contract while preserving source-specific content and actions.

## Implementation or prototype

`src/App.jsx` now uses one `pluginSelectionSurface` class helper for all three plugin sources. Uploaded and search-result collections render as spaced card grids instead of wrapping bordered list rows. Uploaded-package replace and delete buttons remain independent from the selection control.

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Local automated suite | `npm test` | Existing behavior remains valid | 50 tests passed, 0 failed, in 161 ms | Executed 2026-08-28 |
| Local production build | `npm run build` | Vite emits the production bundle | Build completed in 4.43 s; existing large-chunk warning remained non-blocking | Executed 2026-08-28 |
| Local browser, 2684 x 1982 capture | Open `http://localhost:4173/` with empty search and inspect selected featured and uploaded plugins | Selected uploaded card matches the featured teal surface and ring | Confirmed selected featured cards and selected uploaded `unblock` share the teal card treatment | Recording `browser-recording-mtd2sb0t` |
| Local browser, 2684 x 1982 capture | Search `seo`, select the first WordPress.org result, and inspect all result cards | Selected search result uses the same teal surface/ring while unselected results stay white | Confirmed selected Rank Math result uses the teal card treatment and unselected results stay white | Recording `browser-recording-mtd2t60a` |
| Collaborative preview responsive control | Resize to the iPhone 12 Pro preset | Verify the cards at mobile width | Preview resize timed out after 60 seconds; no mobile visual claim is made | Executed 2026-08-28 |

## Result

The shared surface helper produces matching selected and unselected card states for all plugin sources. Desktop browser evidence confirmed the intended visual alignment for both an uploaded plugin and a searched WordPress.org plugin. Automated tests and the production build remained green. The preview service did not complete the requested mobile resize, so that observation remains inconclusive rather than being reported as passed.

## Disposition and rationale

Kept. The implementation removes the visible source-dependent selection treatment with a small presentation-only change and preserves separate uploaded-package actions.

## Documentation impact

Updated `docs/rebuild-spec.md` and `docs/testing.md`. No architecture or data-contract change is required because this is a presentation-only consistency change. Included in the 0.6.0 changelog and versioned release.

## Follow-ups and open questions

- Re-run the mobile-width visual check when the collaborative preview resize control is responsive.
