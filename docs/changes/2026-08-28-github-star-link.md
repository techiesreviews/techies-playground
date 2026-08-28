# GitHub star link in the header

- Date: 2026-08-28
- Owner: Codex
- Status: complete
- Disposition: kept
- Related version: 0.6.0
- Related commit/issue: release 0.6.0 on `main`; preview annotation `annotation_2`

## Context

The header linked only to the app home, changelog, and recipe import. The user requested a GitHub star control immediately left of the changelog that belongs to the Playground repository and visually matches the featured WordPress.org selections.

## Hypothesis and success criteria

A compact native repository link should make contributing a GitHub star discoverable without adding a third-party badge or tracking request. Success means the control links to the confirmed `techiesreviews/techies-playground` origin, appears directly before the changelog, matches the existing white/ring/rounded interactive treatment, remains accessible, and fits mobile and desktop headers.

## Options considered

- Leave the header unchanged: avoids another control but does not satisfy the repository-discovery request.
- Embed a third-party GitHub badge: can display live counts, but adds another network/privacy dependency and styling that does not match the app.
- Add a native repository link using the existing icon set: keeps styling, focus behavior, and failure modes under application control. This option was implemented.

## Implementation or prototype

`AppHeader` now renders an external link to `https://github.com/techiesreviews/techies-playground` immediately before the changelog button. It uses Heroicons' star, the same white surface and subtle neutral ring used by the featured plugin cards, opens in a new tab without an opener, and hides only the visible `Star` label below the `sm` breakpoint while retaining its full accessible name.

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Local Windows workspace | `git diff --check` | No whitespace errors. | Passed; only Git's existing LF-to-CRLF working-copy warnings were printed. | Executed in `E:\playground` on 2026-08-28. |
| Local Node test suite | `npm test` | All pure contract tests pass. | Passed: 48 tests, 0 failures. | Executed in `E:\playground` on 2026-08-28. |
| Local production build | `npm run build` | Vite completes successfully. | Passed in 14.57 seconds; the existing large-chunk advisory remained. | Executed in `E:\playground` on 2026-08-28. |
| T3 collaborative browser, desktop | Inspect the star and changelog controls and their parent order at a measured 1,634 px viewport. | Star is immediately before changelog, matches its height, has the expected accessible name, and opens the correct repository in a new tab. | Passed: parent order was vault, star, changelog, import; star and changelog measured about 32 px high; link resolved to the expected GitHub URL with `target="_blank"` and `rel="noreferrer"`. | Local preview DOM/computed-style inspection at `http://localhost:4173/`, 2026-08-28. |
| T3 collaborative browser, narrow | Inspect at the tool's measured 494 px viewport. | Visible label is hidden, icon control remains 32×32 px, and the header does not overflow. | Passed: label computed to `display: none`; star and changelog both measured 32×32 px; document scroll width was 478 px for a 494 px viewport. | Local preview DOM/computed-style inspection, 2026-08-28. |
| GitHub destination | `curl.exe -s -o NUL -w "%{http_code} %{url_effective}" -L https://github.com/techiesreviews/techies-playground` | Repository is reachable at the configured URL. | Passed: `200 https://github.com/techiesreviews/techies-playground`. | Executed from the local workspace on 2026-08-28. |

## Result

The native star link fits the established header hierarchy on desktop and collapses without overflow on the narrow inspected viewport. Its accessible name remains complete when the visible label is hidden, and the repository destination is live.

## Disposition and rationale

Kept. The native link satisfies the repository and visual requirements while avoiding a third-party badge, tracking request, or additional dependency.

## Documentation impact

- Updated `docs/rebuild-spec.md` and `docs/testing.md`.
- Added this change record.
- The final superseding control is included in the 0.6.0 changelog and versioned release.

## Follow-ups and open questions

- None.
