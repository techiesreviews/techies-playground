# Site-styled GitHub star control

- Date: 2026-08-28
- Owner: Codex
- Status: complete
- Disposition: kept
- Related version: 0.6.0
- Related commit/issue: release 0.6.0 on `main`; supersedes `2026-08-28-official-github-star-button.md`

## Context

The official GitHub Buttons embed successfully displayed a Star action and count, but its closed shadow DOM prevented the control from matching the visual language of the application. The user requested closer alignment with the website style.

## Hypothesis and success criteria

A native control using the same white surface, subtle neutral ring, rounded corners, compact sizing, and teal focus treatment as the rest of the header should feel integrated while retaining the repository link and live public star count. Failure to load the count must not disable the link.

## Options considered

- Keep the official embed: preserves GitHub's exact visual identity but cannot be restyled internally.
- Add another site-styled shell around the embed: creates a double-framed control and still leaves mismatched internal styling.
- Render a native site-styled link and query only the public count from GitHub: provides full visual control and a reliable fallback with no external executable script. This option was implemented.

## Implementation or prototype

The header renders a compact secondary link using the same surface, ring, radius, hover, focus, icon, and touch-target patterns as adjacent app controls. It opens the confirmed repository in a new tab. A focused library function requests `stargazers_count` from GitHub's public repository endpoint, validates it as a non-negative safe integer, and leaves the count absent on failure. The external GitHub Buttons script and its CSP exception were removed.

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Local Windows workspace | `git diff --check` | No whitespace errors. | Passed; only Git's existing LF-to-CRLF working-copy warnings were printed. | Executed in `E:\playground` on 2026-08-28. |
| Local Node test suite | `npm test` | All pure contract tests, including GitHub normalization/request coverage, pass. | Passed: 50 tests, 0 failures. | Executed in `E:\playground` on 2026-08-28. |
| Local production build | `npm run build` | Vite completes successfully without an external GitHub script. | Passed in 4.59 seconds; 588 modules transformed and the existing large-chunk advisory remained. | Executed in `E:\playground` on 2026-08-28. |
| T3 collaborative browser, 1,634 px | Inspect the control after the live API response. | Surface and dimensions match adjacent controls; count, destination, accessible name, ordering, and overflow are correct. | Passed: the control showed `Star` and `0`, measured 83.1×32 px, used a white background and 8 px radius, and matched the changelog's 32 px height. Its accessible name included `0 stars`; URL, `_blank`, `noreferrer`, API resource, and position before changelog were correct. Document scroll width was below viewport width. | Local preview at `http://localhost:4173/`, 2026-08-28. |
| T3 collaborative browser, narrow preset | Resize to iPhone SE and inspect the compact state. | The `Star` label hides, count remains, and the header does not overflow. | Inconclusive: two resize attempts timed out without changing the measured viewport. Source inspection confirms `max-sm:hidden` on only the label, but no narrow visual-pass claim is made. | T3 preview timeout output and source inspection, 2026-08-28. |

## Result

The site-styled control retains the live public count and repository link while matching the adjacent header control dimensions and the featured-card surface language. It removes GitHub's external executable script and closed shadow DOM. Desktop runtime verification passed; the narrow automated visual check was inconclusive because the preview resize operation timed out.

## Disposition and rationale

Kept. This variation directly addresses the visual mismatch, preserves functional behavior with a graceful API-failure fallback, and reduces the external-script security surface. The responsive implementation is structurally small and documented, with a narrow visual recheck remaining appropriate before deployment.

## Documentation impact

- Updated `CONTEXT.md`, `docs/rebuild-spec.md`, `docs/architecture.md`, `docs/data-contracts.md`, and `docs/testing.md`.
- Added unit coverage and this superseding change record; prior outcomes remain intact as history.
- Included in the 0.6.0 changelog and versioned release.

## Follow-ups and open questions

- None.
