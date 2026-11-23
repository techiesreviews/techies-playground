# Preserve license list state and pause launch on read error

- Date: 2026-11-23
- Owner: fleet-lead
- Status: in-progress
- Disposition: kept
- Related version: 0.13.6
- Related commit/issue: TOOLS-438 (Risk 1 of the TOOLS-431 investigation)

## Context

In `src/App.jsx`, `refreshLicenseRecords()` handled a `listLicenseMetadata()` rejection with `.catch(() => setLicenseRecords([]))`. On an initial read failure, `licenseRecords` turned from `null` into `[]`, defeating the `licenseRecords === null` launch guard: Launch and Start buttons became enabled, saved recipe rows reported missing keys, `LaunchSummary` showed `0 of N keys saved`, uploaded plugin cards showed **Add key**, and launching silently skipped saved license keys without any warning. On a subsequent refresh failure, previously loaded saved-key state was wiped to `[]` with no error. Encrypted records in IndexedDB were not deleted, only hidden in UI state and skipped at launch.

## Hypothesis and success criteria

Keeping the previous `licenseRecords` value (`null` on initial failure, or the previously loaded array on a later refresh failure), surfacing a plain-language read error with a **Try again** button without leaking raw browser error text, suppressing misleading zero/missing key indicators while unloaded, and pausing Launch/Start only for setups with uploaded plugins while the license list is unloaded, loading, or unreadable will keep saved keys visible when already loaded, keep plain WordPress setups launchable, and prevent launches from silently skipping saved licenses.

## Options considered

- Leave unchanged: hides saved keys on read error and lets launches silently skip them.
- Block all setups (including plain WordPress without uploaded plugins) on license read failure: prevents launching WordPress-only setups when browser storage blocks IndexedDB (caught in Round 1 review).
- Keep previous state, show a clear error with **Try again** in the setup notice block plus a short pause alert in `LaunchSummary` when uploaded plugins are selected, hide unknown missing-key counts, and block Launch/Start only for setups with uploaded plugins while unloaded/loading/errored: chosen; requires no vault encryption, storage or key-format changes.

## Implementation or prototype

`src/App.jsx` replaces the standalone `licenseRecords` state with `licenseStorage` (`{ records: null, error: '', loading: true }`) and a monotonic `licenseReadIdRef` counter so out-of-order `listLicenseMetadata()` calls cannot overwrite newer state. `refreshLicenseRecords()` marks `loading: true` on start, updates `{ records, error: '', loading: false }` on success, and preserves `current.records` while setting `LICENSE_LIST_READ_ERROR` and `loading: false` on rejection.

`keysBlockLaunch(candidate)` blocks Launch and Start only when `candidate.plugins.length > 0` and the license list is unloaded, loading, or errored (`licenseRecords === null || Boolean(licenseRecordsError) || licenseStorage.loading`). Setups with no uploaded plugins remain launchable. `keyCountsFor()` returns `saved: null` while `licenseRecords === null` so `SavedRecipeRow` omits `N keys missing`, `LaunchSummary` shows `Could not be read` (or `Checking…` while loading) instead of `0 of N keys saved`, and `PluginRow` hides **Add key** while unloaded (`keysLoaded={licenseRecords !== null}`).

The full read error and a **Try again** button render inside the existing setup `role="status"` notice block; when the active setup includes uploaded plugins, `LaunchSummary` shows a concise `role="alert"` box (`Launch paused: saved license keys could not be read.`).

Vault encryption, key storage, key format, and `LicenseManager` / `src/lib/license-vault.js` / `src/lib/vault-session.js` / `src/lib/license-fill.js` were not modified. Intended fallback policies from the TOOLS-431 report (WordPress offline version fallback, per-record invalid recipe/history filtering) remain unchanged.

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Node, baseline | `ASE_OWNER=fleet-lead scripts/agents/kit unit` | Existing suite passes | 399/399 in 43 files | `.scratch/unit/20261123T200401-339082.log` |
| Node, before fix | `ASE_OWNER=fleet-lead scripts/agents/kit unit src/launcher-actions.test.js` | Initial 3 Risk 1 regressions fail | 35/38 passed, 3 failed (`[] !== null`, `[] !== [existing]`, out-of-order overwrite) | `.scratch/unit/20261123T200458-341536.log` |
| Headless Chromium, before fix | `ASE_OWNER=fleet-lead scripts/agents/kit build && node .scratch/tools-438/capture.mjs before` | Reproduces silent failure at 1440/390 light/dark | Launch/Start enabled, `0 of 1 keys saved`, `1 key missing`, zero alerts | `.scratch/tools-438/screenshots/before-*.png` |
| Node, Round 1 fix | `ASE_OWNER=fleet-lead scripts/agents/kit unit` | Initial fix passes all tests | 403/403 in 43 files | `.scratch/unit/20261123T200720-349865.log` |
| Node, Round 2 tests before fix | `ASE_OWNER=fleet-lead scripts/agents/kit unit src/launcher-actions.test.js` | Plain-setup launch and in-flight loading regressions fail before Round 2 fix | 38/41 passed, 3 failed (`0 !== 1`, `false !== true`, source assertion) | `.scratch/unit/20261123T201303-360768.log` |
| Node, after Round 2 fix | `ASE_OWNER=fleet-lead scripts/agents/kit unit` | Full suite passes including plain-setup launch, `keyCountsFor`, in-flight loading, and `LICENSE_LIST_READ_ERROR` contract | 405/405 in 43 files | `.scratch/unit/20261123T201713-363802.log` |
| Vite | `ASE_OWNER=fleet-lead scripts/agents/kit build` | Production build succeeds | Passed (`dist/assets/index-CQrcDATn.js`, existing externalized-module and chunk-size warnings) | `dist/` |
| Headless Chromium, after Round 2 fix | `node .scratch/tools-438/capture.mjs after` | Initial failure at 1440/390 light/dark disables uploaded-plugin Launch/Start, keeps plain WordPress Start enabled, shows notice + **Try again** + short pause alert + `Could not be read`, zero overflow; refresh failure keeps prior `1 of 2 keys saved` + icon, pauses launch, and **Try again** recovers to `2 of 2 keys saved` + enabled launch | All 5 browser scenarios passed; 0 page errors, 0 horizontal overflow | `.scratch/tools-438/screenshots/after-*.png` |
| Kit UX | `ASE_OWNER=fleet-lead scripts/agents/kit ux` | Feature-based check if configured | Cannot run: project has no `docs/agents/features.md` | `RESULT: fail ux ENOENT` |
| Kit doctor | `ASE_OWNER=fleet-lead scripts/agents/kit doctor` | All 17 checks pass with 0.13.6 versions in sync | 17/17 checks passed | `RESULT: ok doctor 17/17 checks passed` |

Round 1 review (`claude-opus-5-5` on `5fd6898`, evidence `.scratch/reviews/fleet-lead/20261123T201145Z`) reported 1 P1 (blocking plain setups without uploaded plugins), 2 P2s (no retry path / inaccurate wording on initial failure; premature review claim in this record), 4 validation gaps, and 5 optional nits. All P1, P2, validation-gap, and nit items were addressed in the Round 2 revision above. Final review and second-look outcomes are recorded by Agent Kit on the PR.

Screenshots in the worktree (untracked evidence; synthetic ZIP metadata and obvious fake placeholders only, no real licence keys):

```text
.scratch/tools-438/screenshots/before-1440-light.png
.scratch/tools-438/screenshots/before-1440-dark.png
.scratch/tools-438/screenshots/before-390-light.png
.scratch/tools-438/screenshots/before-390-dark.png
.scratch/tools-438/screenshots/after-1440-light.png
.scratch/tools-438/screenshots/after-1440-dark.png
.scratch/tools-438/screenshots/after-390-light.png
.scratch/tools-438/screenshots/after-390-dark.png
.scratch/tools-438/screenshots/after-refresh-failure-1440-light.png
```

## Result

Automated regressions failed before each fix and pass after (`405/405`), and real Chromium captures confirm the launcher keeps unknown/previous license state, warns clearly with **Try again**, keeps plain setups launchable, pauses uploaded-plugin launches until readable, and recovers cleanly once IndexedDB answers again.

Done when 1: met — `kit unit src/launcher-actions.test.js` failed before the fix (`35/38`) and passed after (`41/41`); Chromium before/after captures at 1440 and 390 px (light and dark) plus the refresh-failure/recovery run confirm preserved state (`null` on initial failure, `1 of 2 keys saved` + icon on refresh failure), the notice with **Try again**, `Could not be read`, and recovery on retry.

Done when 2: met — `launch()` and Launch/Start controls use `keysBlockLaunch` so setups with uploaded plugins pause while the license list is unloaded, loading, or errored (proven in unit tests for both initial and refresh failures and in Chromium), while setups without uploaded plugins remain launchable (failed `38/41` before Round 2 fix, passed `405/405` after, and verified in Chromium).

Done when 3: met — no vault encryption, key storage, or key format code (`src/lib/license-vault.js`, `src/lib/vault-session.js`, `src/lib/license-fill.js`, `LicenseManager`) was modified; full `kit unit` passed `405/405` and `kit build` passed. Main and second-look review artifacts are recorded separately by Agent Kit before landing.

## Disposition and rationale

Kept: resolves TOOLS-431 Risk 1 cleanly at the launcher state and launch-guard layer without altering vault internals, blocking setups that need no keys, or weakening existing fallback policies.

## Documentation impact

Updated `CONTEXT.md`, `docs/rebuild-spec.md`, `docs/architecture.md`, `docs/data-contracts.md`, `docs/testing.md`, `docs/changes/README.md`, `package.json`, `package-lock.json`, and the `0.13.6` `CHANGELOG_ENTRIES` in `src/App.jsx`.

## Follow-ups and open questions

- None for Risk 1. Any independent audit of untouched vault crypto/storage internals (`src/lib/license-vault.js` and `LicenseManager`) remains outside this change and requires a dedicated security reviewer.
