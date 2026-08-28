# Uploaded plugin metadata layout

- Date: 2026-08-28
- Owner: Codex
- Status: complete
- Disposition: kept
- Related version: 0.6.0
- Related commit/issue: release 0.6.0 on `main`

## Context

The uploaded plugin card rendered version, size, and storage metadata inline after the plugin name with an em dash. A separate monospace line repeated the internal stable vault ID, which was often identical to the visible plugin name and did not explain its implementation purpose. This record follows `2026-08-28-unified-plugin-checkmarks.md` without altering that selection treatment.

## Hypothesis and success criteria

Moving package metadata to a second line without a leading dash and hiding the internal ID should make uploaded cards easier to scan. The stable ID must remain unchanged in the vault and recipe contracts, and the check-circle must align with the label's first line.

## Options considered

- Keep the inline dash and add a visible “Vault ID” label. This would explain the ID but add detail most users do not need.
- Move the metadata while retaining the raw ID. This would still leave redundant copy for common filenames.
- Show the name and metadata only, keeping the stable ID internal. This was selected because replacement and recipe persistence do not require the ID to be visible.

## Implementation or prototype

The plugin-specific checkbox layout now places the label and supporting metadata in two block lines, omits the dash separator, and aligns the selection control with the first line. `PluginRow` no longer renders the raw stable ID, while all vault and recipe references continue to use it internally. Other checkbox descriptions retain their existing inline treatment.

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Local automated suite | `npm test` | Existing vault and recipe behavior remains valid | 50 tests passed, 0 failed, in 237 ms | Executed 2026-08-28 |
| Local production build | `npm run build` | Vite emits the updated JSX and Tailwind output | Build completed in 4.40 s; existing large-chunk warning remained non-blocking | Executed 2026-08-28 |
| Source inspection | Inspect the plugin-specific `Checkbox` branch and `PluginRow` in `src/App.jsx` | Plugin metadata is a separate block without the dash; raw ID is not rendered; stable `plugin.id` remains the selection key | Confirmed in source | Executed 2026-08-28 |
| Collaborative preview | Open/reload `http://localhost:4173/`, then request snapshot/recording | Capture the updated uploaded card | Preview snapshot and recording repeatedly failed; a final wait timed out after 60 seconds | Inconclusive, no visual-pass claim made |

## Result

The visible JSX now renders the uploaded plugin name and metadata as two lines and removes the raw internal ID. Automated tests confirm the stable ID behavior remains intact and the production build succeeds. The collaborative preview could not provide a fresh visual artifact during this verification pass.

## Disposition and rationale

Kept. The source change directly implements the requested hierarchy without touching the persisted identifier contract. Browser rendering remains available locally, but the preview capture itself was inconclusive due to tooling failure.

## Documentation impact

Updated `docs/rebuild-spec.md` and `docs/testing.md`. No architecture or data-contract schema changed. Included in the 0.6.0 changelog and versioned release.

## Follow-ups and open questions

- Re-run the visual capture when the collaborative preview connection is responsive.
