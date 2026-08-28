# Official GitHub Star button embed

- Date: 2026-08-28
- Owner: Codex
- Status: complete
- Disposition: kept
- Related version: 0.6.0
- Related commit/issue: release 0.6.0 on `main`; supersedes `2026-08-28-github-star-link.md`

## Context

The first local iteration used a native, app-styled repository link with a Heroicons star. The user then supplied GitHub's official Buttons embed and requested that exact large, count-bearing Star control instead.

## Hypothesis and success criteria

The official GitHub control should provide a recognizable star action and live public count for the correct repository. Success means the supplied anchor attributes are preserved, the external loader enhances it locally, the control remains immediately before changelog, the repository target and count are correct, the header remains usable at narrow widths, and production CSP permits only the required additional script origin.

## Options considered

- Keep the native link: privacy-friendly and visually integrated, but no longer matches the explicit requested control.
- Rebuild the official appearance and fetch the count ourselves: avoids external executable code but duplicates GitHub behavior and does not use the supplied embed.
- Use the supplied GitHub Buttons markup and loader: exact requested behavior with the tradeoff of an external script and metadata request. This option was implemented.

## Implementation or prototype

`AppHeader` now contains the provided `github-button` anchor with large size, count, color-scheme, repository URL, and accessible label. An isolated component appends `https://buttons.github.io/buttons.js` after the anchor mounts, then removes the script if the component unmounts; a stable wrapper contains GitHub's DOM replacement. The Worker CSP permits that script origin, while the existing HTTPS connection policy permits the public template/count requests. Current-state architecture and security-boundary documentation identify the external integration.

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Local Windows workspace | `git diff --check` | No whitespace errors. | Passed; only Git's existing LF-to-CRLF working-copy warnings were printed. | Executed in `E:\playground` on 2026-08-28. |
| Local Node test suite | `npm test` | All pure contract tests pass. | Passed: 48 tests, 0 failures. | Executed in `E:\playground` on 2026-08-28. |
| Local production build | `npm run build` | Vite completes successfully and bundles the mounted loader integration. | Passed in 5.76 seconds; the existing large-chunk advisory remained. | Executed in `E:\playground` on 2026-08-28. |
| Local Worker dry run | `npx wrangler deploy --dry-run` | Worker and assets validate without publishing. | Passed; Wrangler read the assets, reported the `ASSETS` binding, and exited in dry-run mode. | Executed in `E:\playground` on 2026-08-28 before the mount-timing refinement; the Worker/CSP files did not change afterward. |
| T3 collaborative browser, 1,280 px | Load the page, wait 1.5 seconds, then inspect the header and resource timings. | GitHub replaces the source anchor, requests the public repository count, and places the large control before changelog. | Passed: the anchor became GitHub's nested span control measuring 89.6×29.2 px before the 32 px changelog button; resources included `buttons.github.io/buttons.js` and two `api.github.com/repos/techiesreviews/techies-playground` requests. The closed shadow root prevented direct text inspection of the rendered count, but the supplied `data-show-count="true"` input and count request were both verified. | Local preview at `http://localhost:4173/`, 2026-08-28. |

## Result

Loading the supplied script after the React anchor mounts reliably produces GitHub's enhanced large Star control and public repository request. The initial static script placement sometimes completed before the React header existed and was reworked rather than retained. The fallback remains a normal repository anchor if enhancement cannot run.

## Disposition and rationale

Kept. The mounted loader uses the exact requested button configuration while avoiding the timing failure observed with a parser-level async script. Automated tests, the production build, Worker dry run, and local runtime enhancement all succeeded.

## Documentation impact

- Updated `CONTEXT.md`, `docs/rebuild-spec.md`, `docs/architecture.md`, `docs/data-contracts.md`, and `docs/testing.md`.
- Added this superseding change record; the earlier native-link outcome remains intact as history.
- The final superseding control is included in the 0.6.0 changelog and versioned release.

## Follow-ups and open questions

- None.
