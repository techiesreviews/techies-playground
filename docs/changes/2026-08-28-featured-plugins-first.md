# Featured plugins first in the empty state

- Date: 2026-08-28
- Owner: Codex
- Status: complete
- Disposition: kept
- Related version: 0.6.0
- Related commit/issue: release 0.6.0 on `main`; preview annotation `annotation_7`

## Context

The plugin chooser initially placed the uploaded-plugin section, including its large upload empty state, before the featured WordPress.org grid. The user asked to make discovery more prominent by moving uploaded plugins below featured plugins in the empty-search state.

## Hypothesis and success criteria

Putting featured plugins first when there is no query should make the default chooser immediately useful without weakening search behavior. Success means the DOM, visual, and keyboard order is featured then uploaded at an empty query, while a non-empty query remains uploaded matches then WordPress.org search state/results.

## Options considered

- Leave the order unchanged: preserves the upload-first emphasis but keeps the large empty upload prompt above useful directory choices.
- Reorder with CSS only: a small code change, but visual order would diverge from keyboard and document order.
- Conditionally reorder the rendered sections: keeps visual and interaction order aligned and preserves the established search ordering. This option was implemented.

## Implementation or prototype

The featured section is rendered before the uploaded section only when the trimmed plugin query is empty. For non-empty queries, the uploaded section remains first and the existing one-character hint or detailed directory results follow it. Introductory copy and the rebuild/testing specifications describe both states.

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Local Windows workspace | `git diff --check` | No whitespace errors. | Passed; only Git's existing LF-to-CRLF working-copy warnings were printed. | Executed in `E:\playground` on 2026-08-28. |
| Local Node test suite | `npm test` | All pure contract tests pass. | Passed: 48 tests, 0 failures. | Executed in `E:\playground` on 2026-08-28. |
| Local production build | `npm run build` | Vite completes successfully. | Passed in 4.68 seconds; the existing large-chunk advisory remained. | Executed in `E:\playground` on 2026-08-28. |
| T3 collaborative browser, desktop | Clear the plugin query, enter `w`, then enter `woocommerce`; inspect direct children of the plugin-results container. | Empty: Featured then Uploaded. One character: Uploaded then hint. Full query: Uploaded then directory results. | Passed. Empty headings were `FEATURED ON WORDPRESS.ORG`, `UPLOADED PLUGINS`; one-character children were `UPLOADED PLUGINS`, hint; full-query headings were `UPLOADED PLUGINS`, `WORDPRESS.ORG PLUGINS`, with a live WooCommerce result. | Local preview at `http://localhost:4173/`, 2026-08-28. |
| T3 collaborative browser, narrow preset | Resize a fresh preview tab to the iPhone SE preset and inspect the same states. | The order remains correct without horizontal overflow. | Inconclusive: resize reported the narrow preset successfully, but subsequent snapshot/evaluation calls timed out. No narrow visual-pass claim is made; the affected markup uses the same single-column section stack at all widths. | T3 preview status and timeout output, 2026-08-28. |

## Result

The conditional DOM order works as intended in the executed desktop browser check. Search behavior and live WordPress.org results remain intact. Automated tests and the production build pass. Narrow visual automation was inconclusive because the collaborative browser stopped responding after resize; source inspection shows no breakpoint-specific ordering code was introduced.

## Disposition and rationale

Kept. Conditional rendering gives the requested default hierarchy while maintaining aligned visual, DOM, and keyboard order. It also preserves the established upload-first search behavior. The narrow-preview tooling limitation does not indicate a product failure and is recorded rather than treated as passing evidence.

## Documentation impact

- Updated `docs/rebuild-spec.md` and `docs/testing.md`.
- Added this change record.
- Included in the 0.6.0 changelog and versioned release.

## Follow-ups and open questions

- None.
