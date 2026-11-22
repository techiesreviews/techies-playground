# Uploaded plugins activate in the open site and testers support Pro editions

- Date: 2026-11-22
- Owner: fleet-lead / GPT Sol implementation worker
- Status: in-progress
- Disposition: pending
- Related version: 0.13.0
- Related issue: TOOLS-402

## Context

A page-wide plugin ZIP drop saved and selected the package but did not install it into an already running site. The two Checks rows offered Add but no way to turn them off. Query Monitor Pro was not recognised, and selecting Code Profiler Pro did not deselect the directory edition. Add key used only a plus icon.

## Hypothesis and success criteria

Reuse the approved key icon beside a smaller plus, install live uploads immediately, retain failed activation on the plugin row, and treat the tester editions as alternatives. Licence keys must retain their existing encrypted storage and POST-body-only runtime flow.

## Options considered

- Leave upload changes for the next launch: does not satisfy the live-upload request.
- Abort the complete site when activation fails: hides the plugin's state and prevents testing other plugins.
- Install with activation disabled, then activate quietly and inspect saved WordPress state in a separate request: chosen; activation redirects cannot hide success and raw vendor output does not reach launcher state.

## Implementation

`uploaded-plugins.js` installs ZIPs, activates them and reads their active state. A site-local must-use plugin renders failed activation on the corresponding WordPress Plugins row. The launcher retains fixed safe result text per package. The sequential upload queue reads the latest React handler and recovers after rejected work. Live uploads capture their client and launch identity.

The Checks section has Turn off controls. Uploading either tester edition deselects the other; legacy mixed selections prefer Pro at launch. A Blueprint PHP step deactivates deselected tester editions on resumed sites before directory installs. Live tester uploads deactivate the existing editions before replacement. Licence and package vault schemas are unchanged.

## Tests and evidence

- Red first: `kit unit src/lib/checks.test.js src/lib/uploaded-plugins.test.js` printed `RESULT: fail unit 27/31 (2 files)` before implementation; Query Monitor Pro, tester removal, edition replacement and the missing installation helper failed.
- Red first after review: the upload queue and live free-plugin licence tests each printed `RESULT: fail unit 3/4 (1 files)` before their new helpers were implemented.
- `kit doctor`: `RESULT: ok doctor 17/17 checks passed`.
- Focused PHP 8.3 tests: `RESULT: ok unit 4/4 (1 files)`. Verified free-edition deactivation, Pro activation, redirect success, inactive failure and persisted tester-off behaviour using focused WordPress stubs.
- Latest affected suite: `RESULT: ok unit 128/128 (13 files)`.
- `kit build`: `RESULT: ok build finished`; existing large-chunk and browser externalisation warnings remain.
- `kit ux`: `RESULT: fail ux ENOENT: .../docs/agents/features.md`. This project's extras explicitly say it has no feature list.
- `kit shots`: `RESULT: fail unknown command shots`; no project screenshot command exists.
- T3 browser, localhost: key-plus icon has two SVGs; fake key encrypts successfully and is absent from draft JSON; both testers add then turn off; both Pro ZIP fixtures replace their free directory selections; a fake Pro key saves through the same form.
- T3 runtime, WordPress 7.1.5 / PHP 8.3, temporary storage, networking blocked: all three synthetic uploaded plugin fixtures reached `Active in WordPress`. Fake keys intentionally do not represent valid vendor licences.
- The deployed host's `frame-ancestors` policy excludes localhost. Local runtime acceptance uses `VITE_PLAYGROUND_ORIGIN=https://playground.wordpress.net`; source defaults and deployment settings are unchanged. Preview-host verification remains a separate post-merge check.
- T3 screenshot capture subsequently failed twice with `The browser is not producing screenshot frames`; standalone Playwright is used for the remaining runtime screenshots and live-drop check.

## Review responses

- R1-1: fixed. The one-time drop listener calls a ref updated on every render, so it sees the ready site and latest saved-key metadata.
- R1-2: fixed. Only actual saved-key IDs seed a live upload's licence requirement; a normal free plugin does not block checks.
- R1-3: fixed. The extracted upload queue handles an import rejection and runs the next drop.
- R1-4: X replaces the ambiguous tick; mouse/touch target sizes now follow the existing compact pattern. The accessible Turn off action states that the tester is on without adding another status pill.
- R1-5: fixed by this dated record; executed evidence is distinguished from pending verification.
- R1-6: fixed. Feature release version is 0.13.0.

## Result and disposition

Pending live-drop acceptance, final review and merge into dev. No production release or npm publication is authorised.

## Documentation impact

Updated CONTEXT, rebuild specification, architecture, data contracts, testing documentation, changelog and matching package versions.

## Follow-ups

Lex must try his actual paid ZIPs and valid vendor licences on preview-play; synthetic fixtures cannot prove vendor licence validity. The lead closes TOOLS-402 with the PR and merge SHA after landing.
