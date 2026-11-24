# Design report matches the approved results page

- Date: 2026-11-24
- Owner: fleet-lead
- Status: complete
- Disposition: kept
- Related version: 0.13.7
- Related commit/issue: TOOLS-450; extends [the Gutenberg design proof](2026-11-23-gutenberg-design-test.md)

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

## Implementation or prototype

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

| Environment | Procedure | Expected | Observed | Evidence |
| --- | --- | --- | --- | --- |
| Node 24 | `kit doctor`, after installing locked dependencies | All required checks pass | 17/17; first attempt correctly failed because dependencies were absent | [Recorded evidence](2026-11-24-design-report-look/validation.txt) |
| Node 24 | New report tests before implementation | Fail first | 3 failed: finalization module absent; saved state/wording and offline assets not implemented | [Recorded evidence](2026-11-24-design-report-look/validation.txt) |
| Chromium | `node scripts/design-report-check.mjs .scratch/tools-450/check-red` | Detect hidden speed bars | Failed with `Speed bars must be visible` before the flex fix | [Recorded evidence](2026-11-24-design-report-look/validation.txt) |
| Node 24 | `kit unit --affected` | Relevant tests pass | 24/24 in 2 files after review fixes | [Recorded evidence](2026-11-24-design-report-look/validation.txt) |
| Node 24 | `kit unit` | Whole suite passes | 423/423 in 43 files after review fixes (417/417 before review) | [Recorded evidence](2026-11-24-design-report-look/validation.txt) |
| Vite | `kit build` | Production build completes | Passed; existing dependency-externalization and large-chunk warnings remain | [Recorded evidence](2026-11-24-design-report-look/validation.txt) |
| Chromium | `node scripts/design-report-check.mjs .scratch/tools-450/check-land` through `kit go` | Saved local report works without HTTP; all states, controls and motion variants work | Passed 12 layouts; zero page errors/HTTP requests/overflow; keyboard/drag/switches/disclosures/counters passed | [Recorded evidence](2026-11-24-design-report-look/browser-evidence.json) |
| Kit UX | `kit ux` through `kit go` | Report the project's missing integration | Failed `ENOENT ... docs/agents/features.md`; this repository has no feature list or project `shots` command. It supplied no UX verdict. Browser evidence above is independently executed, not a claimed kit UX pass. | [Recorded evidence](2026-11-24-design-report-look/validation.txt) |

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

- [1440, light](2026-11-24-design-report-look/comparison-1440-light.png)
- [1440, dark](2026-11-24-design-report-look/comparison-1440-dark.png)
- [390, light](2026-11-24-design-report-look/comparison-390-light.png)
- [390, dark](2026-11-24-design-report-look/comparison-390-dark.png)
- [Curated validation excerpts](2026-11-24-design-report-look/validation.txt)
- [Unmodified browser-check output](2026-11-24-design-report-look/browser-evidence.json)

The committed `browser-evidence.json` is the unmodified output of the reproducible
checker (its report path is relative to the chosen evidence directory).
`comparison-captures.json` is a manually assembled manifest: `before_prototype_matrix`
and `after_matrix` were copied from the separate local capture helper's executed
outputs; `scope` and `assembly` were added by hand to distinguish that evidence. The helper loaded the
old renderer saved before editing, the approved prototype with its toolbar hidden,
and the current generated renderer against the same public report. The manifest
contains no claim that these extra fields were produced by `design-report-check.mjs`.
The four PNG contact sheets were assembled from those full-page captures.

Review fixes: uncertain AI notes now have a neutral label; heading mistakes are not
called block limits; saved pages with failed captures show no pixel result; blocked
testers show actual reasons. Touch scrolling outside the knob leaves the slider
unchanged. Three new unit regressions failed before the corresponding fixes, and
the browser check now sends real Chromium touch start/move/cancel events.

Review ledger after the fixes: R1-1 (uncertain notes), R1-2 (saved-page/capture
failure), R1-3 (tester reason), R1-4 (touch scrolling), R1-5 (long-word overflow),
R1-6 (rebuild spec), R1-7 (record format/index), and R1-8 (evidence provenance)
were addressed. Approved prototype colours and section names remain as requested.

Codex second-look fixes: a missing phone capture can no longer show a desktop
picture; no-JavaScript viewers get all four complete PNGs and direct links; 200%
text at 390 px reflows instead of overflowing. Before the fixes, the new capture
regression failed, the no-JavaScript check found 0/4 images, and enlarged text made
the document 438 px wide. Afterward these checks pass (4 images, 4 links, 390 px).
The later not-run tester also frames the real global blocker rather than presenting
another stage's error as its own; its new regression failed before the wording fix.

Final layout regression: 360 px normal text initially produced one stat column;
the lower tile minimum restores two columns while the 390 px/200% text case still
uses one readable column. The committed checker now exercises touch-knob dragging
as well as scroll cancellation. The current unmodified browser output records
no-JavaScript images/links, enlarged-text width and the 360 px column count.

## Result

The generated page follows the approved visual design, handles actual fixture
differences and partial/failed runs, and opens offline. Stop reasons use the saved
failure rather than prototype mock wording. The comparative images are visual
evidence, not a pixel-identical report-layout assertion: wording, honest picture
counts, UTC labels, tap targets and the two chart fixes intentionally differ.

## Disposition and rationale

Kept: the approved layout is implemented with honest report states and working offline controls.

## Documentation impact

Updated the design-runner guide, rebuild spec, architecture, data contracts, testing
inventory, context version and user-facing changelog/version. Existing records remain
unchanged.

## Follow-ups and open questions

- Lead: close TOOLS-450 (Done, with a dated note naming the PR and its merge SHA).
- The lead checks the preview deployment after landing; this local report change does
  not add a hosted report endpoint.
