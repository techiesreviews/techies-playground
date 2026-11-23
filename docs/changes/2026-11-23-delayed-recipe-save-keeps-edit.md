# A delayed recipe save keeps the current edit

- Date: 2026-11-23
- Owner: fleet-lead
- Status: complete
- Disposition: kept
- Related version: 0.13.4
- Related issue: TOOLS-374, PR #42

## Context

The second look at the rebased saved-recipe fix found that waiting for a storage lock made save completion asynchronous. Saving A, editing and renaming B, then completing A cleared B's editing identity. Saving B afterward could leave both names. This record supplements [the rebased landing record](2026-11-23-land-recipe-tabs-fix.md), preserving its prior observations.

## Hypothesis and success criteria

Associate each mutation with its initiating edit. Always finish the storage mutation and refresh the library, while changing selection and editing state only if that edit remains current. B must stay in editing mode after A finishes, and B's renamed save must remove its original record.

## Options considered

Leaving completion unconditional reproduces the duplicate. Disabling all editing while saving would change the interface and make lock contention block useful work. An edit counter guards the existing completion behavior with no new screen or control.

## Implementation

Increment the edit counter on draft changes, saved-recipe/spin-up selection, imports, uploaded-package selection and Stop editing. Capture it when a save or removal starts. A current save consumes its edit before applying selection and clearing editing; an old completion only updates the library. Apply the same guard to removal because it also waits for the lock and clears editing state. Keep version 0.13.4, which already covers this unlanded fix, and extend its changelog entry.

## Tests and evidence

| Environment | Procedure | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Node, actual App handlers and deferred Web Lock | Save A, edit/rename B, finish A | B stays editing; its save replaces the old ID | Failed before the guard: empty editing ID instead of recipe-b. Passed after the guard, including reloaded IDs and normal current-save selection. | `.scratch/unit/20261123T112810-2380287.log`, `.scratch/unit/20261123T112856-2447321.log` |
| Same harness | Remove A while editing A, switch to editing B, finish removal | A removed; B stays selected and editing | Failed before the removal guard: empty editing ID instead of recipe-b. Passed after the guard. | `.scratch/unit/20261123T112915-2466293.log`, `.scratch/unit/20261123T112959-2481009.log` |
| Node | `kit unit --affected`; final `kit unit` | All affected and full tests pass | 26/26 affected; 359/359 across 42 files | `.scratch/unit/20261123T112959-2481009.log`, `.scratch/unit/20261123T113039-2490479.log` |
| Vite | `kit build` | Production assets compile without deploying | Passed; existing browser-externalization and chunk-size warnings remain | `.scratch/kit-jobs/pg374-save-build/log` |

The first green attempt needed the new counter added to the existing picker harness's App scope; that attempt passed four tests and failed the two picker harnesses. The first full run exposed the same missing scope value in the post-install upload harness (358/359). Both harnesses now supply the actual handler's ref. These were harness failures, not ZIP import regressions. `kit doctor` passed 17/17. `kit ux` was attempted but reported ENOENT because there is no `docs/agents/features.md`.

## Result and disposition

Keep the guard: both late-completion regressions failed before it and pass after it, and the current-save path still clears editing and selects the newly saved record. Independent review and landing results belong in PR #42. These handler tests do not render React, simulate storage events or start WordPress. Storage-event coverage remains a separate validation gap.

## Documentation impact

Updated the saved-recipe product contract, architecture, test inventory, change index and existing 0.13.4 changelog entry. Storage schemas and package versions stay the same.
