# Imports and pending renames keep separate recipe identities

- Date: 2026-11-23
- Owner: fleet-lead
- Status: complete
- Disposition: kept
- Related version: 0.13.4
- Related issue: TOOLS-374, PR #42

## Context

The fresh GPT review of 5e99375 reproduced two data bugs: an imported draft retained the recipe edited before the import and could remove it on its next save; changing a name while its rename save waited left the edit pointing at the removed ID, so its next save left an intermediate copy. The lead accepted both findings and required failing-before regressions, fixes, full tests/build and fresh Opus/GPT reviews. This record supersedes the insufficient save-completion rule in [the earlier delayed-save record](2026-11-23-delayed-recipe-save-keeps-edit.md), retaining its historical evidence.

## Hypothesis and success criteria

Keep the saved ID for an edit session separate from its field revision. Imports must leave unrelated A intact. Original → First → Final within one pending edit must leave only Final after reload. A save from another session must still leave the current edit alone.

## Options considered

The revision-only guard preserves fields but loses rename identity. Updating an ID by value alone does not distinguish separate editing sessions or two queued saves. A session with its last successful ID and a per-session write chain preserves both identity and order without changing the storage schema or adding a control.

## Implementation

Accepting an import clears the previous editing, saved selection and spin-up identities before awaiting storage. Loading/selecting a recipe or spin-up and stopping editing start separate sessions. Field changes retain the session. Saves chain within their session, read its latest saved ID when writing, and advance it only after a successful storage write. A failed save can be retried. Completion of the current session carries its saved ID across newer field revisions; only an unchanged revision completes selection and leaves editing mode. A fully completed edit starts a fresh session, preserving the existing Save recipe behavior afterward.

## Tests and evidence

| Environment | Procedure | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Node, actual App handlers and deferred Web Lock | Edit A, accept import B, change B's site title, finish import, save B | Reload retains A and B; B has the changed title | Failed before the fix: A disappeared. Passed after the fix. | `.scratch/unit/20261123T114143-2650240.log`, `.scratch/unit/20261123T114243-2665327.log` |
| Same harness | Rename Original → First, save waits, rename → Final, finish, save again | Only Final remains in the list and after reload | Failed before the fix: First also remained. Passed after the fix. | Same logs |
| Same harness | Queue both rename saves before releasing the first lock | Only Final remains after both writes and reload | Failed before the fix; passed after session write ordering. | `.scratch/unit/20261123T114212-2656988.log`, `.scratch/unit/20261123T114243-2665327.log` |

Focused regressions passed 10/10. Doctor passed 17/17. Full tests passed 362/362 across 42 files (`.scratch/unit/20261123T114419-2707668.log`). `kit build` passed with the existing browser-externalization and large-chunk warnings (`.scratch/kit-jobs/pg374-session-build/log`). These tests execute actual event handlers with in-memory state/storage; they do not render React, emulate storage events or start WordPress.

## Result and disposition

Keep the session identity: all three new failing-before cases pass, along with the original delayed A-save/B-edit regression. Independent review and landing results belong in PR #42. No waiver. No storage schema, package version or layout change is introduced. Version 0.13.4 already covers this unlanded fix; its changelog entry is extended.

## Documentation impact

Updated the saved-recipe contract, architecture, test inventory/count, change index and 0.13.4 changelog. Review and landing evidence belongs in PR #42.
