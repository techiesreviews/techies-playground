# Uploaded plugins activate in the open site and testers support Pro editions

- Date: 2026-11-22
- Owner: fleet-lead / GPT Sol implementation worker
- Status: complete
- Disposition: kept
- Related version: 0.13.0
- Related commit/issue: TOOLS-402

## Context

A page-wide plugin ZIP drop saved and selected the package but did not install it into an already running site. The two Checks rows offered Add but no way to turn them off. Query Monitor Pro was not recognised, and selecting Code Profiler Pro did not deselect the directory edition. Add key used only a plus icon.

## Hypothesis and success criteria

Reuse the approved key icon beside a smaller plus, install live uploads immediately, retain failed activation on the plugin row, and treat the tester editions as alternatives. Licence keys must retain their existing encrypted storage and POST-body-only runtime flow.

## Options considered

- Leave upload changes for the next launch: does not satisfy the live-upload request.
- Abort the complete site when activation fails: hides the plugin's state and prevents testing other plugins.
- Install with activation disabled, then activate quietly and inspect saved WordPress state in a separate request: chosen; activation redirects cannot hide success and raw vendor output does not reach launcher state.

## Implementation or prototype

`uploaded-plugins.js` installs ZIPs, activates them and reads their active state. A site-local must-use plugin renders failed activation on the corresponding WordPress Plugins row. The launcher retains fixed safe result text per package. The sequential upload queue reads the latest React handler and recovers after rejected work. Live uploads capture their client and launch identity before saving begins. The lead-approved Add ZIPs control in the runtime bar reuses the picker and reports progress, success and failures on itself, with details in its title and accessible name.

Both Add ZIPs pickers now share the drop queue and plugin/theme header detection; themes go into the theme vault and plugin archives need an installable header at the supported depth.

The Checks section has Turn off controls. Uploading either tester edition deselects the other; legacy mixed selections prefer Pro at launch. A Blueprint PHP step deactivates deselected tester editions on resumed sites before directory installs. Live tester uploads deactivate the existing editions before replacement. Licence and package vault schemas are unchanged.

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Node 24, before implementation | `kit unit src/lib/checks.test.js src/lib/uploaded-plugins.test.js` | New behavior fails before it exists | `RESULT: fail unit 27/31 (2 files)` | `.scratch/tools-402/red.log` |
| Node 24, review fixes | Queue and licence-gate focused tests, then the runtime label test | Fail before their helpers exist | Two `RESULT: fail unit 3/4 (1 files)` runs, then `RESULT: fail unit 4/5 (1 files)` | `.scratch/unit/` logs |
| Agent Kit | `kit doctor` | Project ready | `RESULT: ok doctor 17/17 checks passed` | Doctor output |
| PHP 8.3 with focused WordPress stubs | `kit unit src/lib/uploaded-plugins-php.test.js` | Activate Pro, tolerate redirect, keep failure inactive, turn persisted testers off | `RESULT: ok unit 4/4 (1 files)` | Committed PHP tests and `.scratch/unit/` log |
| Node 24, final control | `kit unit`; `kit unit --affected` | Existing and new assertions pass | `RESULT: ok unit 337/337 (39 files)`; final affected run `RESULT: ok unit 130/130 (13 files)` | `.scratch/unit/` logs |
| Vite | `kit build` | Build launcher | `RESULT: ok build finished`; existing chunk and browser externalisation warnings | Build output |
| Agent Kit integration | `kit ux`; `kit shots` | Automatic UX and screenshots | `RESULT: fail ux ENOENT: .../docs/agents/features.md`; `RESULT: fail unknown command shots` | Project extras document no feature list or browser command |
| T3 browser, localhost | Upload, save fake keys, add/turn off testers, upload Pro fixtures | Key-plus, encrypted save and mutually exclusive tester editions | All observed; key absent from recipe JSON | Initial T3 captures and browser actions |
| Browser runtime, WordPress 7.1.5 / PHP 8.3, temporary storage, networking blocked | Start three uploaded fixtures; drop an activation-refusing plugin, then a working plugin | Startup/live plugins active; failed activation inline; queue still usable | Passed, no page errors | `.scratch/tools-402/` screenshots and `tools402-browser` log |
| Browser layout | Check 390 px / 100% and 320 px / 200% text | Add key and Turn off remain on screen; no sideways page scroll | Both pass | `mobile-390-16.png`, `mobile-320-32.png` |

The deployed host's `frame-ancestors` policy excludes localhost. Local runtime acceptance uses `VITE_PLAYGROUND_ORIGIN=https://playground.wordpress.net`; source defaults and deployment settings are unchanged. Preview verification follows the dev merge. T3 screenshot capture failed twice with `The browser is not producing screenshot frames`; standalone Playwright supplies the remaining runtime evidence. Synthetic fixtures and fake keys do not prove a real vendor licence is valid.

## Review responses

- R1-1: fixed. The one-time drop listener calls a ref updated on every render, so it sees the ready site and latest saved-key metadata.
- R1-2: fixed. Only actual saved-key IDs seed a live upload's licence requirement; a normal free plugin does not block checks.
- R1-3: fixed. The extracted upload queue handles an import rejection and runs the next drop.
- R1-4: X replaces the ambiguous tick; mouse/touch target sizes now follow the existing compact pattern. The accessible Turn off action states that the tester is on without adding another status pill.
- R1-5: fixed by this dated record; executed evidence is distinguished from pending verification.
- R1-6: fixed. Feature release version is 0.13.0.

- R2-5: fixed with the lead-approved Add ZIPs control in the runtime bar. It reuses the picker, shares the sequential queue and shows Uploading / Installing / Upload failed on the control itself, with details in its title and accessible name. No runtime toast.
- R2-6: fixed by using the template's evidence table and separate Result and Disposition sections.

- R3-10: fixed. Packages saved during startup or a themes-only upload say Saved for next start; Added is reserved for applied plugin uploads.
- R3-11: fixed. A polite live region announces the runtime upload label and detail.
- R3-12: fixed with the lead-approved plain inline failure reason beside the upload control. It truncates within the runtime bar, retains full title/accessible detail, and clears when another pick starts. No popover or toast.

## Result

Standalone Playwright acceptance passed against the built 0.13.0 launcher and official Playground runtime: WordPress 7.1.5, PHP 8.3, temporary storage, networking blocked. The three startup fixtures were active, with no free tester installed. A new ZIP dropped onto that running site installed and activated without restarting. A ZIP whose activation hook refuses activation remained installed and inactive, with the failure notice on its WordPress plugin row; the next live upload still worked. No page errors were observed. At 390 px with 100% text and 320 px with 200% text, the page width stayed 390/320 px and both Add key and Turn off stayed within the viewport; screenshots are `mobile-390-16.png` and `mobile-320-32.png`. Screenshots live under `.scratch/tools-402/`: `key-plus.png`, `testers-off.png`, `pro-uploaded.png`, `uploaded-active.png`, `activation-failed-row.png`, `live-upload-active.png`. The first job printed `RESULT: ok go tools402-browser exit 0 without a RESULT line`. The final control run printed `RESULT: ok go tools402-browser-r2 exit 0 without a RESULT line`: an invalid ZIP showed Upload failed with its detail, and choosing a valid ZIP through the same control succeeded. The runtime upload control and Close stayed on screen at 390 px and at 320 px with 200% text; captures include `runtime-upload-failed.png` and `runtime-mobile-320-32.png`.

The final browser run (`tools402-browser-final`) passed after the inline failure reason was added. Its reason remained visible and within the viewport at 390 px (238.6 px wide) and 320 px with 200% text (288 px wide); Close also stayed on screen. The file picker cleared the failure and successfully retried. `runtime-failure-mobile-390-16.png` and `runtime-failure-mobile-320-32.png` record those states. A prior browser harness run read the initial Plugins frame before its final navigation completed and failed an early active-row assertion; the final harness waits for the expected active WordPress row before checking the list.

## Disposition and rationale

Kept. The fixtures prove installation, activation and UI state, and do not claim validity for a real paid vendor's licence. Merge targets dev only; no production release or npm publication is authorised.

## Documentation impact

Updated CONTEXT, rebuild specification, architecture, data contracts, testing documentation, changelog and matching package versions.

## Follow-ups and open questions

- Lex must try his actual paid ZIPs and valid vendor licences on preview-play; synthetic fixtures cannot prove vendor licence validity. The lead closes TOOLS-402 with the PR and merge SHA after landing.
