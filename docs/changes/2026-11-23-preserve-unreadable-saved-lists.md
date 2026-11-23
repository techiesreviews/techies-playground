# Preserve unreadable saved recipes and launch history

- Date: 2026-11-23
- Owner: fleet-lead
- Status: complete
- Disposition: kept
- Related version: 0.13.5
- Related commit/issue: TOOLS-437 (Risk 3 and Risk 4 of the TOOLS-431 investigation)

## Context

Whole-list JSON corruption was treated as an empty list. A mount-time history effect immediately overwrote the damaged history with `[]`; the next recipe save overwrote damaged saved recipes. Both appeared empty without a notice. This record supersedes that persistence behavior; the valid-array filtering policy in the [recipe regression record](2026-11-19-recipe-tabs-and-picker-batches.md) remains intact.

## Hypothesis and success criteria

Distinguishing unreadable whole lists from missing keys, refusing writes over unreadable values and removing history's mount-time persistence will preserve recoverable raw data. Short inline notices should identify the affected list without preventing WordPress launches.

## Options considered

- Leave unchanged: loses recoverable browser data.
- Warn and automatically replace: still destroys the unreadable value.
- Keep raw data and refuse list mutations: chosen; no automatic repair/reset or new destructive control.

## Implementation or prototype

The saved-recipe and history parsers throw for invalid JSON and non-array roots. Missing keys still mean empty lists. UI reads expose `{ records, error }`; the recipe library catches initial read failures, while writes parse again under its existing lock. History reads never persist; appends/removals read current storage and validate before writing. History persistence failures remain notices rather than throwing through launch cleanup. The setup controls show existing amber inline notice styling across tabs and suppress misleading empty-state copy and unknown counts. A mounted status region contains the notices. Refused saves/imports explicitly say the recipe was not saved; external library damage clears stale selection/edit identity while preserving the draft. History write failures use a fixed plain-language notice.

Preserved policies: individual invalid/unsafe entries are dropped from readable arrays, valid siblings remain usable, history stays capped at 30 and deduplicates browser-saved environments, saved-recipe normalization/locking stays intact, and WordPress's offline version fallback is unchanged. Licence, key, vault and OPFS behavior is outside this change.

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Node, before recipe fix | `ASE_OWNER=fleet-lead scripts/agents/kit unit src/lib/saved-recipes.test.js` | Corrupt-list regression fails | 3/4; missing expected exception | `.scratch/unit/20261123T180046-195968.log` |
| Node, after recipe fix | Same command | Guard rejects and preserves raw data | 4/4 | `.scratch/unit/20261123T180103-196942.log` |
| Node, before history fix | `ASE_OWNER=fleet-lead scripts/agents/kit unit src/lib/spinup-history.test.js` | Corrupt-list regression fails | 5/6; missing expected exception | `.scratch/unit/20261123T180104-197093.log` |
| Node, after history fix | Same command | Read notice; append/removal refuse damaged storage | 6/6 | `.scratch/unit/20261123T180126-198750.log` |
| Node, before App wiring | `ASE_OWNER=fleet-lead scripts/agents/kit unit src/launcher-actions.test.js` | Initial-read/mount regressions fail | 30/32 | `.scratch/unit/20261123T180126-198971.log` |
| Node, after App wiring | `ASE_OWNER=fleet-lead scripts/agents/kit unit src/launcher-actions.test.js src/lib/saved-recipes.test.js src/lib/spinup-history.test.js` | Both actual App paths preserve raw values | 42/42 | `.scratch/unit/20261123T180204-201843.log` |
| Node, affected suite | `ASE_OWNER=fleet-lead scripts/agents/kit unit --affected` | Existing URL safety and list behavior preserved | 58/58 in 4 files | `.scratch/unit/20261123T180312-207700.log` |
| Node, full suite | `ASE_OWNER=fleet-lead scripts/agents/kit unit` | All existing and regression tests pass | 396/396 in 43 files | `.scratch/unit/20261123T180553-216973.log` |
| Node, expanded assertions | `ASE_OWNER=fleet-lead scripts/agents/kit unit --affected` | Valid sibling/missing-key behavior, readable append/removal and non-throwing App history failure | 58/58 in 4 files | `.scratch/unit/20261123T180618-217709.log` |
| Review fixes, before | `ASE_OWNER=fleet-lead scripts/agents/kit unit src/launcher-actions.test.js` | Save wording, stale editing identity and plain write-error regressions fail | 31/34; all three failures reproduced | `.scratch/unit/20261123T181029-230198.log` |
| Review fixes, affected | `ASE_OWNER=fleet-lead scripts/agents/kit unit --affected` | All revised paths pass, including import/remove and persistent notices | 60/60 in 4 files | `.scratch/unit/20261123T181109-231549.log` |
| Review fixes, full | `ASE_OWNER=fleet-lead scripts/agents/kit unit` | All tests pass | 398/398 in 43 files | `.scratch/unit/20261123T181141-233151.log` |
| Final nits, before | `ASE_OWNER=fleet-lead scripts/agents/kit unit src/launcher-actions.test.js` | Refused removal must name its outcome | 33/34; removal still had the read-only message | `.scratch/unit/20261123T181514-239716.log` |
| Final nits, after | `ASE_OWNER=fleet-lead scripts/agents/kit unit --affected` | Refused removal and existing paths pass | 60/60 in 4 files | `.scratch/unit/20261123T181547-240350.log` |
| Legacy removal, after | `ASE_OWNER=fleet-lead scripts/agents/kit unit --affected` | First-click removal works for missing/empty IDs, even beside a colliding stored ID | 61/61 in 4 files | `.scratch/unit/20261123T182049-245086.log` |
| Final full suite | `ASE_OWNER=fleet-lead scripts/agents/kit unit` | All tests pass on the final implementation | 399/399 in 43 files | `.scratch/unit/20261123T182102-245360.log` |
| Vite | `ASE_OWNER=fleet-lead scripts/agents/kit build` | Production build succeeds | Passed; existing externalized-module and bundle-size warnings | `dist/` |
| Kit UX | `ASE_OWNER=fleet-lead scripts/agents/kit ux` | Feature-based check if configured | Cannot run: project has no `docs/agents/features.md` | `RESULT: fail ux ENOENT` |
| T3 browser, before | Seed damaged recipe/history strings and reload | Reproduce loss | History becomes `[]`; recipe raw string survives until Save | Before screenshots below |
| T3 browser, after | Reload with both damaged strings; click Save recipe | Notices and guarded write | Both raw values kept, both notices visible, Save error shown | T3 DOM/storage readback |
| Headless Chromium, after | `node .scratch/tools-437/browser.mjs` | Notices, guarded Save and no overflow at all four settings | 4/4; no page errors or horizontal overflow | After screenshots below |

Before captures used T3; after captures used Playwright because T3 subsequently returned “The browser is not producing screenshot frames.” Both use a 900 px viewport height. The app retains its existing light palette under a dark preference; this change adds no dark theme.

The first Claude review identified R1-1 through R1-9: misleading zero counts, ambiguous failed-save wording, stale editing identity, raw history write errors, notice spacing/live region, evidence wording, and three coverage gaps. All were addressed. The browser count assertion first failed with `Saved recipes (0)` rather than `Saved recipes`; the updated four-setting browser run then passed, and all after captures were replaced. A fresh production build passed. Repeating `kit ux` still reports the same missing feature-list configuration.

The second Claude review confirmed every R1 finding resolved and ended the loop with P3/test gaps only (R2-1 through R2-4). The small follow-ups were fixed directly: readable history keeps its count/empty state after a write failure, and refused removal says the recipe was not removed. `node .scratch/tools-437/write-failure.mjs` first failed because the count disappeared, then passed: an actual Chromium removal with `setItem` rejecting kept its row, count, raw data and plain notice. This browser check uses removal, not a WordPress launch; the App handler test separately exercises append failure without throwing. The obsolete persistence-effect probe was removed; the test executes the actual initializer and keeps explicit source guards on persistence. All eight after screenshots were refreshed again.

The required `gpt-6.1-sol` high second look completed with one P3 defect and two coverage gaps. SL-1/SL-2 were addressed: re-reading legacy history with no ID generated a new UUID, so its first removal missed. The new App-handler regression failed (34/35, `.scratch/unit/20261123T181956-244424.log`), then passed with deterministic, collision-checked fallback IDs. New launches still receive UUIDs; no ID is persisted on load. SL-3 is a declined browser-launch coverage gap: browser Save/removal checks and the no-throw App history helper are executed evidence; an actual WordPress boot with damaged history is not claimed. No runtime startup code changed. The loop stops at P3/test gaps per the repository rule; no further model review was run for these small fixes.

Screenshots in the worktree (untracked evidence):

```text
.scratch/tools-437/screenshots/before-recipes-1440-light.png
.scratch/tools-437/screenshots/before-recipes-1440-dark.png
.scratch/tools-437/screenshots/before-recipes-390-light.png
.scratch/tools-437/screenshots/before-recipes-390-dark.png
.scratch/tools-437/screenshots/before-history-1440-light.png
.scratch/tools-437/screenshots/before-history-1440-dark.png
.scratch/tools-437/screenshots/before-history-390-light.png
.scratch/tools-437/screenshots/before-history-390-dark.png
.scratch/tools-437/screenshots/after-recipes-1440-light.png
.scratch/tools-437/screenshots/after-recipes-1440-dark.png
.scratch/tools-437/screenshots/after-recipes-390-light.png
.scratch/tools-437/screenshots/after-recipes-390-dark.png
.scratch/tools-437/screenshots/after-history-1440-light.png
.scratch/tools-437/screenshots/after-history-1440-dark.png
.scratch/tools-437/screenshots/after-history-390-light.png
.scratch/tools-437/screenshots/after-history-390-dark.png
```

## Result

Targeted tests, the full suite and browser checks preserve damaged raw values and distinguish unreadable lists from empty lists. Main and second-look review artifacts are recorded separately by Agent Kit before landing.

Done when 1: met — the actual App history initializer runs against damaged history without writing; source inspection/assertions show no load-time history write remains, and browser reload leaves the raw value intact.

Done when 2: met — the write regression first failed, then passed with corrupt JSON and non-array roots; clicking Save recipe in Chromium shows an error and keeps the original raw recipe string.

Done when 3: met — both list notices are visible at 1440 and 390 px with light/dark preferences; regression tests cover both lists and retain valid siblings in readable arrays.

## Disposition and rationale

Kept: the change preserves recoverable browser data without weakening record validation or blocking WordPress because history cannot be saved.

## Documentation impact

Updated data contracts, architecture, rebuild specification, testing matrix, change index, current version and the user-facing 0.13.5 changelog.

## Follow-ups and open questions

- No repair UI added. Restoring or deliberately removing damaged browser data remains an explicit external action.
- No WordPress runtime boot was exercised for this saved-list change; actual launch history append is covered at its storage boundary.
