# Keep saved recipes across tabs and continue mixed ZIP picker batches

- Date: 2026-11-19
- Owner: gpt-fix-playground
- Status: complete
- Disposition: kept
- Related version: 0.10.5 (unreleased)
- Related commit/issue: TOOLS-374; sweep findings PG-01 and PG-02

## Context

Two already open tabs could each save a new recipe and the second tab silently erased the first save. The plugin and theme pickers stopped at the first invalid ZIP, skipping valid files later in the selection. The independent sweep is in `chat/output/gpt-burn-2026-11-19/1-tool-sweep/playground/findings.md` in the sibling chat workspace. This record supplements [page-wide drops](2026-09-16-page-wide-package-drops.md), whose independent per-file handling was already correct.

## Hypothesis and success criteria

The saved-recipes effect wrote an entire stale in-memory library. Read the current library inside each explicit mutation and stop echo-writing state. The picker catch surrounded the whole loop; catch each file independently. Success means two distinct saves survive refresh, rename/delete preserve other records, and valid picker files import despite invalid earlier files.

## Options considered

- Leave unchanged: retains demonstrated data loss and skipped files.
- Read storage at each mutation and listen for storage changes: small change, no schema migration. Web Locks also serialize concurrent writes where supported. Chosen.
- Store each recipe separately or move the library to IndexedDB: a migration and broader redesign, unnecessary for the named reproduction.
- Reuse the page-drop importer for pickers: would change signature-only, destination-specific picker validation to header-based classification. Keep existing picker contracts and isolate their errors instead.

## Implementation or prototype

No prototype: scoped bug fixes under the lead's supplied grill answers. `updateSavedRecipes` reads, modifies, validates and writes the current library; App awaits it for saves, imports, rename-updates and removals. Other tabs refresh from current storage on a storage event and never persist a cached array from an effect. Normalized-name replacement stays unchanged.

Each picker copies its FileList, processes every file with its own catch, refreshes its package rows and resets for retry. Imported rows and their selected state show successes. Existing errors name failures. No new toast, explainer or layout.

## Tests and evidence

Environment: Linux, Node v24.22.2; owned branch from origin/dev 7dac676; T3 browser at http://127.0.0.1:4197, measured 1280×800. Only synthetic sweep ZIPs were used. No license keys or WordPress runtime launch were involved.

| Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- |
| `scripts/agents/kit doctor` before install, then `npm ci --no-audit --no-fund`, then doctor | Required checks pass | First failed for missing dependencies; then 17/17 passed | Worktree `.scratch/pg374/` and command transcript |
| `scripts/agents/kit unit src/launcher-actions.test.js` before fix | Exact regressions fail | 0 passed, 5 failed: lost saved records and empty picker rows | `.scratch/pg374/red.log`; test commit b8a418d |
| Same focused command after fix | Regressions pass | 5/5 passed | `.scratch/unit/20261119T224311-2272572.log` |
| `scripts/agents/kit unit --affected` | Affected contracts pass | 24/24 passed across 3 files | `.scratch/unit/20261119T224324-2273466.log` |
| `scripts/agents/kit unit` | Whole suite passes | 192/192 passed across 29 files | `.scratch/pg374/unit.log` |
| `scripts/agents/kit go pg374-build -- scripts/agents/kit build` | Production build succeeds without deployment | Passed; existing browser externalization and large chunk warnings | `.scratch/kit-jobs/pg374-build/log` |
| `scripts/agents/kit ux` | Automatic UX check | Cannot run: feature list absent | Exact result below |
| Local T3 tabs opened before saves | Both recipes persist | Before fix only B remained. After fix both fixed A/B records appeared in storage and other tab rows, and survived reload | Browser readback in task transcript |
| Local plugin and theme pickers: invalid.zip then corresponding valid sweep ZIP | Continue and show valid package despite error | Error retained for invalid.zip; vault contained sweep-test-plugin and sweep-test-theme; tabs showed 1 selected each; input values reset | Browser readback in task transcript |
| `git diff --check` | No whitespace errors | Passed | Command transcript |

The Node regressions execute actual App handler code with in-memory state/storage and real validation, without rendering JSX. Their ZIP fixtures intentionally exercise the existing signature-only picker contract. They do not prove ZIP installation or WordPress startup. Real browser checks use the sweep's valid archives and the actual IndexedDB vault. The shared draft is still shared between tabs; that behavior is outside these findings.

## Result

Both named bugs reproduced before changes and passed the corresponding checks after changes. Proof:
PG-01: met — Before the fix, two local T3 browser tabs saved PG374 tab A then PG374 tab B and storage kept only B. Three App-handler regressions failed first (distinct saves, rename, stale delete); all now pass. Repeating saves after the fix kept both fixed A/B records, refreshed the other tab's rows, and survived reload.
PG-02: met — Before the fix, the real local plugin picker selected invalid.zip then sweep-test-plugin-1.0.zip, showed the signature error and selected no plugin. Both plugin/theme handler regressions failed first with no imported rows; now both pass, including bad-middle files, last-theme selection and retry. The fixed real pickers kept the invalid.zip error, saved and selected the valid plugin/theme, showed their rows, and reset both inputs.
Safety: met — Changes stayed in the owned worktree; no merge, release, deploy or kit preview. Only localhost:4197 was used for browser checks.
UX automation: not met — kit ux cannot run because docs/agents/features.md is absent. Real browser behavior was checked at measured 1280×800; resize requested 390×844 but the browser kept reporting 1280×800, so no phone result is claimed.

## Disposition and rationale

Kept: fixes only PG-01 and PG-02 without redesign or storage schema changes. This branch stops at an open PR; the changes are unreleased.

## Documentation impact

Updated CONTEXT, rebuild specification, architecture, data contracts, test inventory, changelog and matching package versions to 0.10.5.

## Follow-ups and open questions

- No project feature list exists: `RESULT: fail ux ENOENT: no such file or directory, open '<worktree>/docs/agents/features.md'`. Do not describe this as a passed UX review.
- T3 resize did not change the measured viewport. Phone, Firefox/Safari and full WordPress startup were not verified in this task.
- Without Web Locks, fresh read/modify/write preserves the reported sequential saves but does not make truly simultaneous cross-tab writes atomic. The browser used here supports Web Locks.
- Setup paths `scripts/agents/worktree.sh` and `docs/agents/runner.md` are absent. Used the installed kit's unchanged `worktree.sh` from the project root and followed the project's documented extras. No shared kit or main-checkout edits were made.
