# Land the saved-recipe fix beside the shared ZIP queue

- Date: 2026-11-23
- Owner: fleet-lead
- Status: validation in progress
- Disposition: reworked
- Related version: 0.13.4
- Related issue: TOOLS-374, PR #42

## Context

The approved recipe and picker fixes were parked while dev gained the shared package-upload queue and newer releases. This record supersedes the implementation details and version in [the original regression record](2026-11-19-recipe-tabs-and-picker-batches.md), without changing its historical observations.

## Resolution

Keep dev's shared upload queue, package-header classification, live-site installation, error filenames and picker reset. Both current pickers already continue after invalid files. Do not restore the removed, destination-specific theme handler. Adapt the two picker regressions to use actual plugin/theme archives through the current picker, queue and importer. They still check bad files before and between valid files, quota failures, selected rows, last-theme selection and retry.

Keep the approved fresh-storage recipe mutations and cross-tab refresh. No storage schema, layout, live deployment or additional behavior is introduced. Preserve dev's newer changelog and documentation; the remaining recipe fix becomes 0.13.4.

## Evidence

The original record preserves five failing-before tests and the original two-tab and picker browser observations. After rebasing, the three recipe tests passed; both old picker harnesses failed because dev removed their old entry points (`RESULT: fail unit 3/5`). That is a harness incompatibility, not a new product failure. An initial harness import correction was also required before the focused tests could run.

Current validation results will be recorded after the focused checks, full suite, build and independent reviews finish. No new browser or WordPress-startup result is claimed by this record. The project has no feature list for kit ux.
