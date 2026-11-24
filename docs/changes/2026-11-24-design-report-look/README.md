# Design report matches the approved results page

- Date: 2026-11-24
- Owner: fleet-lead
- Status: complete
- Disposition: kept
- Related version: 0.13.7
- Related commit/issue: TOOLS-450; extends [the Gutenberg design proof](../2026-11-23-gutenberg-design-test.md)

## Context

The local design runner's previous report showed plain sections and two static image
columns. Lex approved the results-page prototype on 2026-11-24 after its blobs were
removed. This implements that approved surface; it adds no hosted page or service.

## Hypothesis and success criteria

The generated report should match the prototype's hierarchy and layout at 1440 and
390 px in both themes, with useful comparisons and honest failed/partial states.

Done when 1: met — Lex's approval is recorded in the supplied TOOLS-450 brief dated
2026-11-24: “remove the weird blob than ok”; the implementation contains no blobs.

Done when 2: met — captured the previous report, approved prototype, and actual
`designReportHTML` output with the same public fixture at 1440/390 in light/dark;
comparison sheets below show the result next to the prototype. The browser check
also exercised 12 state/width/theme combinations and the real controls offline.

## Options considered

- Leave the existing static report: functional, but it would not meet the approved design.
- Fetch JSON and external fonts like the prototype: fails local-file/offline use.
- Render report sections in Node and embed fonts/CSS plus comparison-only JavaScript:
  chosen to preserve portable HTML and keep report-state rules in the generator.

## Implementation

`scripts/design-report.mjs` finalizes saved display state and plain-word misses, then
renders the approved page. `runOnce` runs its optional finalizer after failures and
pipeline verdict/timestamps settle, before either report file is written. Both the
normal design CLI and H2 diagnostic supply it. Raw misses and pipeline `go` remain
available independently of display state.

The page keeps the CSS-only count-up tiles, block mix, serif headline/score, tester
cards and accessible comparison controls. Fonts are licensed local WOFF2 files
embedded into each HTML report. No preview/theme bar, external font requests or
blobs ship. Four PNGs remain next to the page. Reduced motion shows final values.
The picture count includes both originals and copies. Missing timing values and
stopped runs never invent a three-minute timeout or a cash-cost claim.

Two prototype defects were corrected while preserving its layout: the later tile
meter rule no longer overrides score/plugin meters, and percentage-height speed
bars now have definite flex geometry. Radio targets are at least 44 px.

Skills used: good-css, emil-design-foundations, emil-ui-polish, animate. No skill text
was copied into the repository.

## Tests and evidence

| Environment | Procedure | Expected | Observed |
| --- | --- | --- | --- |
| Node 24 | `kit doctor`, after installing locked dependencies | All required checks pass | 17/17; first attempt correctly failed because dependencies were absent |
| Node 24 | New report tests before implementation | Fail first | 3 failed: finalization module absent; saved state/wording and offline assets not implemented |
| Chromium | `node scripts/design-report-check.mjs .scratch/tools-450/check-red` | Detect hidden speed bars | Failed with `Speed bars must be visible` before the flex fix |
| Node 24 | `kit unit --affected` | Relevant tests pass | 18/18 in 2 files |
| Node 24 | `kit unit` | Whole suite passes | 417/417 in 43 files |
| Vite | `kit build` | Production build completes | Passed; existing dependency-externalization and large-chunk warnings remain |
| Chromium | `node scripts/design-report-check.mjs .scratch/tools-450/check-final` through `kit go` | Saved local report works without HTTP; all states, controls and motion variants work | Passed 12 layouts; zero page errors/HTTP requests/overflow; keyboard/drag/switches/disclosures/counters passed |
| Kit UX | `kit ux` through `kit go` | Report the project's missing integration | Failed `ENOENT ... docs/agents/features.md`; this repository has no feature list or project `shots` command. It supplied no UX verdict. Browser evidence above is independently executed, not a claimed kit UX pass. |

The screenshot fixture uses the existing public `sampleHTML()` and a deliberately
smaller heading. Actual pixel scores are 95.1067% at 1440 and 66.1926% at 390. It
contains real image differences; there is no CSS shift pretending to change the
image. The normal `runOnce` persistence path produced the checked HTML and JSON.
Tester observations and block inventory are **injected fixtures**, not evidence of a
new WordPress, AI, Query Monitor or Code Profiler execution. No private Melapress
results were read or used.

The T3 preview browser accepted a 390 px setting but twice retained a 1440 px
viewport. Local sandboxed Chromium supplied the verified-width screenshot matrix.
The approved prototype's toolbar was hidden only for these comparison screenshots;
its data came from the public fixture. The report itself has no such toolbar.

- [1440, light](comparison-1440-light.png)
- [1440, dark](comparison-1440-dark.png)
- [390, light](comparison-390-light.png)
- [390, dark](comparison-390-dark.png)
- [Executed browser evidence](browser-evidence.json)

## Result and disposition

Kept. The generated page follows the approved visual design, handles actual fixture
differences and partial/failed runs, and opens offline. Stop reasons use the saved
failure rather than prototype mock wording. The comparative images are visual
evidence, not a pixel-identical report-layout assertion: wording, honest picture
counts, UTC labels, tap targets and the two chart fixes intentionally differ.

## Documentation impact

Updated the design-runner guide, rebuild spec, architecture, data contracts, testing
inventory, context version and user-facing changelog/version. Existing records remain
unchanged.

## Follow-ups

- Lead: close TOOLS-450 (Done, with a dated note naming the PR and its merge SHA).
- The lead checks the preview deployment after landing; this local report change does
  not add a hosted report endpoint.
