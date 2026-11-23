# A newer launch cancels a waiting saved-row action

- Date: 2026-11-23
- Owner: fleet-lead
- Status: complete
- Disposition: kept
- Related version: 0.13.4
- Related issue: TOOLS-374, PR #42

## Context

The fresh GPT look at 4a63b27 reproduced a deferred saved-row Start running after main Launch and aborting that newer runtime. The draft revision guard did not notice launches. The lead authorized the final fifth round: capture/check the launch counter as well, add its failing-before test plus explicit no-Web-Locks and fresh-save tests, then full checks and fresh reviews. This supplements [the recipe-ID sweep](2026-11-23-recipe-id-actions.md) and corrects its incomplete cancellation rule.

## Hypothesis and success criteria

Save a rename while its storage lock waits, click the saved row's Start, launch the current draft through the real main launch handler, then release storage. Exactly one runtime-start call occurs and its abort signal remains clear. A deferred Select must likewise stay cancelled. Explicit `locks = null` must keep two stale libraries' distinct recipes, and saving Foo while typing Bar must follow the documented saved identity and leave only Bar after the next update/reload.

## Options considered

Changing the draft revision inside Launch would change how pending saves complete. Capturing the existing launch counter is narrower: it notices a newer launch without changing field-edit semantics.

## Implementation

Saved-row loading captures both counters before waiting and checks both before applying selection. Start checks the captured launch counter again before launching its resolved recipe. No runtime-start, abort, queue or storage implementation is changed.

## Tests and evidence

The new tests execute the actual App launch handler with a stub runtime held pending. Before the guard, Start failed with two runtime starts; Select failed by applying the old selection after main Launch. Evidence: `.scratch/unit/20261123T122317-3186966.log` (28/30). After the guard, all 30 focused cases passed (`20261123T122356-3187396.log`). The Start case also asserts the first abort signal remains clear and that the launched draft is preserved. This is not a WordPress-startup or rendered-browser check.

The two gap tests already passed before the production change. Explicit `locks = null` saves from two already stale libraries retain both records after reload. Fresh-save carry-over asserts that Bar stays in the draft while editing follows Foo, then the next update/reload leaves only Bar. The current product contract now names that behavior explicitly.

Doctor passed 17/17. Full unit passed 382/382 across 42 files (`.scratch/unit/20261123T122508-3189615.log`). The build passed with the existing browser-externalization and large-chunk warnings (`.scratch/kit-jobs/pg374-launch-build/log`). `kit ux` was attempted; no feature list exists, so it reports ENOENT. Independent review and landing results belong in PR #42.

## Result and disposition

Keep the launch guard: both failing-before cases pass and the requested gap cases are now checked. No waiver. Any new P0-P2 from the fresh reviews goes back to the lead for Lex, as instructed. Version 0.13.4 already covers this unlanded fix; its changelog is extended. No new screen, layout, dependency, storage schema or deployment.

## Documentation impact

Updated the saved-recipe contract, architecture, test inventory/count, change index and changelog. Final review and landing evidence belongs in PR #42, alongside the complete handler sweep.
