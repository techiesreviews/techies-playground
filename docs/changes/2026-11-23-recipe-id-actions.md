# Saved-row actions follow the resulting recipe identity

- Date: 2026-11-23
- Owner: fleet-lead
- Status: complete
- Disposition: kept
- Related version: 0.13.4
- Related issue: TOOLS-374, PR #42

## Context

The fresh second look at 8c59bc7 reproduced Remove filtering Original after a pending save had renamed it, leaving Renamed saved. The lead authorized a fourth round to fix that race and sweep every recipe-ID handler before review. This record supersedes the per-session-only queue in [the earlier session record](2026-11-23-recipe-edit-sessions.md); its earlier failures and outcomes remain historical evidence.

## Hypothesis and success criteria

Every action on an observed saved row must retain that row's identity through pending operations, without redirecting to an unrelated record that later reuses its name. Remove after a pending rename must leave neither name after reload. Selection/Edit/Start must resolve the resulting record and preserve newer user intent. External removal or clearing must not be undone by a queued update.

## Options considered

Disabling Remove covers only one control and leaves stale Select/Edit/Start. A single queue for all records blocks editing unrelated B while A saves; an initial attempt exposed that and was stopped. Per-record queues preserve B's existing behavior while giving all actions on A the same resulting-ID rule.

## Implementation

The new `recipe-library.js` owns in-memory row identities, per-record operation queues, and fresh-storage mutations. A WeakMap binds each observed row object to its identity, so reusing its old normalized name does not redirect an old action. Saves advance the resulting ID only after success. Remove and row resolution share that identity's queue. Different recipes remain independent. The original record value is checked before save/remove; an externally changed replacement is preserved and the existing error area requests selecting its latest version.

Storage refresh waits for operations already in flight, reads the latest library and never writes it back. An external clear invalidates old identities immediately, including a first save waiting for its lock. Missing or removed identities cannot be restored by already queued writes. Reconciliation clears removed saved/edit IDs without changing draft fields. Storage schemas and package versions are unchanged; version 0.13.4 already covers this unlanded fix.

## Handler sweep

| Handler/action | Outcome and evidence |
| --- | --- |
| `saveRecipeToLibrary`, `handleSaveRecipe` | Share the identity queue; original A/B and consecutive-rename regressions still pass. A save queued after removal cannot restore the removed identity. Failed writes and retries are tested. |
| `removeSavedRecipe` | Queue behind that row's saves, then remove its resulting ID. Failed first with Renamed still present; now neither name remains after reload. An imported record reusing Original remains untouched. |
| `chooseSavedRecipe` | Queue resolution of that row, then load its resulting ID and content only if the user's action is still current. Failed first by loading Original; now loads Renamed. Typing afterward cancels deferred selection. |
| `editSavedRecipe` | Same resolution rule, then edits the resulting identity. Failed first with the old ID; a subsequent rename now replaces Renamed without duplicates. |
| `startSavedRecipe` | Await resolved selection and check intent again before launching its resulting recipe. Failed first by launching Original; now launches Renamed in the handler test's launch spy. No WordPress startup is claimed. |
| Duplicate/copy | No Duplicate handler or control exists. Select → change name → Save is tested and keeps both Renamed and its new copy. |
| `handleRecipeExport` | Uses the current draft, not a saved ID. Its baseline already passed: exporting during a pending save captures the current draft and writes nothing to the library. Kept immediate. |
| `handleRecipeImport` | Starts its own identity before storage await. The earlier import-A/B regression failed before its fix and remains covered. Importing a new Original while the old row renames/removes preserves the imported record. |
| Clear library | No local handler/control exists. External `storage` clearing is covered below, including an unsaved first save waiting for a lock. |
| `refreshSavedRecipes` and its actual listener | External deletion/clearing failed first by resurrecting Renamed. Now preserves deletion/clear, clears missing IDs, queues fresh reads and writes nothing back. Tests cover another tab's added record, unrelated keys, other storage areas and actual listener cleanup. |
| `chooseSpinup`, `removeSpinup` | Source inspection: use separate history IDs and snapshots; saved-recipe renames never change them. No saved-library ID action to queue. No new history behavior or runtime claim. |
| Main launch / field and package edits | Source inspection: operate on the current draft, not a saved-row ID. Field edits keep revision guards; the existing package picker tests remain covered. |

## Tests and evidence

Eight new cases failed first on 8c59bc7: Remove, Select, Edit, Start, typing after selection, editing a removed row, external deletion and external clearing. Evidence: `.scratch/unit/20261123T115751-3087128.log` (12/20). After per-record queues all 20 passed (`20261123T120013-3123681.log`). Two additional replacement-at-the-same-ID cases failed before record-value checks (`20261123T120244-3153878.log`, 22/24), then passed (`20261123T120330-3164660.log`, 24/24).

The write-failure/retry test exposed a Node-native-lock hang after a throwing callback. An isolated probe showed that lock still held (`.scratch/kit-jobs/pg374-native-lock-probe/log`). The test now supplies a deterministic rejecting lock promise and passes; this changes no production lock behavior. The initial full run was stopped rather than claimed as passing. Other probe output and the stopped initial all-record queue run remain under `.scratch/kit-jobs/pg374-ids-*`.

Doctor passed 17/17. Final full unit passed 378/378 across 42 files (`.scratch/unit/20261123T120807-3172029.log`); affected unit passed 50/50 (`20261123T120807-3172052.log`). The final build passed with the existing browser-externalization and large-chunk warnings (`.scratch/kit-jobs/pg374-ids-build-final/log`). `kit ux` was attempted and reported ENOENT because no feature list exists. These tests execute actual App handlers and listener code with in-memory state/storage; they do not render React, prove browser layout or start WordPress.

## Result and disposition

Keep the shared identity rule: the new failing-before cases now pass, along with the original delayed-save and import/rename regressions. No waiver. Independent review and landing evidence, including this complete handler inventory, belongs in PR #42. No new layout, screen, deployment or Cloudflare resource change.

## Documentation impact

Updated the current saved-recipe contract, architecture, data-contract note, test inventory, change index and existing 0.13.4 changelog entry. Older change records retain their original outcomes.
