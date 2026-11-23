# Preserve license list state and pause launch on read error

- Date: 2026-11-23
- Owner: fleet-lead
- Status: complete
- Disposition: kept
- Related version: 0.13.6
- Related commit/issue: TOOLS-438 (Risk 1 of the TOOLS-431 investigation)

## Context

In `src/App.jsx`, `refreshLicenseRecords()` handled a `listLicenseMetadata()` rejection with `.catch(() => setLicenseRecords([]))`. On an initial read failure, `licenseRecords` turned from `null` into `[]`, defeating the `licenseRecords === null` launch guard: Launch and Start buttons became enabled, saved recipe rows reported missing keys, `LaunchSummary` showed `0 of N keys saved`, uploaded plugin cards showed **Add key**, and launching silently skipped saved license keys without any warning. On a subsequent refresh failure, previously loaded saved-key state was wiped to `[]` with no error. Encrypted records in IndexedDB were not deleted, only hidden in UI state and skipped at launch.

## Hypothesis and success criteria

Keeping the previous `licenseRecords` value (`null` on initial failure, or the previously loaded array on a later refresh failure), surfacing a plain-language read error with an accessible **Try again** button without leaking raw browser error text, timing out hung reads, suppressing misleading zero/missing key indicators while unloaded, and pausing Launch/Start (including deferred saved-recipe Start) only for setups with uploaded plugins while the license list is unloaded, loading, or unreadable will keep saved keys visible when already loaded, keep plain WordPress setups launchable, and prevent launches from silently skipping saved licenses.

## Options considered

- Leave unchanged: hides saved keys on read error and lets launches silently skip them.
- Block all setups (including plain WordPress without uploaded plugins) on license read failure: prevents launching WordPress-only setups when browser storage blocks IndexedDB (caught in Round 1 review).
- Keep previous state, show a clear error with **Try again** in the setup notice block plus a short pause alert in `LaunchSummary` when uploaded plugins are selected, hide unknown missing-key counts, bound hung reads with a timeout, read live license state in `launch()`/`startSavedRecipe()`, and block Launch/Start only for setups with uploaded plugins while unloaded/loading/errored: chosen; requires no vault encryption, storage or key-format changes.

## Implementation or prototype

`src/App.jsx` replaces the standalone `licenseRecords` state with `licenseStorage` (`{ records: null, error: '', loading: true }`), mirrored to `licenseStorageRef`, guarded by a monotonic `licenseReadIdRef` counter and a 10-second timeout (`LICENSE_READ_TIMEOUT_MS`) so hung or out-of-order `listLicenseMetadata()` calls cannot stall or overwrite newer state. `refreshLicenseRecords({ retry })` marks `loading: true` on start, updates `{ records, error: '', loading: false }` on success, and preserves `current.records` while setting `LICENSE_LIST_READ_ERROR` (or `LICENSE_LIST_RETRY_ERROR` when a retry fails again) and `loading: false` on rejection or timeout.

`keysBlockLaunch(candidate, current)` blocks Launch and Start only when `candidate.plugins.length > 0` and the license list is unloaded, loading, or errored (`current.records === null || Boolean(current.error) || current.loading`). `startSavedRecipe` invokes `launchRef.current`, and `launch()` checks `licenseStorageRef.current` directly and derives `savedKeyPackages` from it so a deferred Start waiting on a save lock always uses current license readiness and metadata. Setups with no uploaded plugins remain launchable. `keyCountsFor()` returns `saved: null` while `licenseRecords === null` so `SavedRecipeRow` omits `N keys missing`, `LaunchSummary` shows `Could not be read` (or `Checking…` while loading) instead of `0 of N keys saved`, and `PluginRow` hides **Add key** while unloaded (`keysLoaded={licenseRecords !== null}`).

The full read error and a **Try again** button (`aria-disabled` while retrying so keyboard focus stays on the button, `any-pointer-coarse:min-h-11` for touchscreen laptops and phones) render inside the existing setup `role="status"` notice block; when the active setup includes uploaded plugins, `LaunchSummary` shows a concise `role="alert"` box (`Launch paused: saved license keys could not be read.`).

Vault encryption, key storage, key format, and `LicenseManager` / `src/lib/license-vault.js` / `src/lib/vault-session.js` / `src/lib/license-fill.js` were not modified. Intended fallback policies from the TOOLS-431 report (WordPress offline version fallback, per-record invalid recipe/history filtering) remain unchanged.

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Node, baseline | `ASE_OWNER=fleet-lead scripts/agents/kit unit` | Existing suite passes | 399/399 in 43 files | `.scratch/unit/20261123T200401-339082.log` |
| Node, before fix | `ASE_OWNER=fleet-lead scripts/agents/kit unit src/launcher-actions.test.js` | Initial 3 Risk 1 regressions fail | 35/38 passed, 3 failed (`[] !== null`, `[] !== [existing]`, out-of-order overwrite) | `.scratch/unit/20261123T200458-341536.log` |
| Headless Chromium, before fix | `ASE_OWNER=fleet-lead scripts/agents/kit build && node .scratch/tools-438/capture.mjs before` | Reproduces silent failure at 1440/390 light/dark | Launch/Start enabled, `0 of 1 keys saved`, `1 key missing`, zero alerts | `.scratch/tools-438/screenshots/before-*.png` |
| Node, Round 1 fix | `ASE_OWNER=fleet-lead scripts/agents/kit unit` | Initial fix passes all tests | 403/403 in 43 files | `.scratch/unit/20261123T200720-349865.log` |
| Node, Round 2 tests before fix | `ASE_OWNER=fleet-lead scripts/agents/kit unit src/launcher-actions.test.js` | Plain-setup launch and in-flight loading regressions fail | 38/41 passed, 3 failed (`0 !== 1`, `false !== true`, source assertion) | `.scratch/unit/20261123T201303-360768.log` |
| Node, Round 2 fix | `ASE_OWNER=fleet-lead scripts/agents/kit unit` | Full suite passes | 405/405 in 43 files | `.scratch/unit/20261123T201713-363802.log` |
| Node, Round 3 tests before fix | `ASE_OWNER=fleet-lead scripts/agents/kit unit src/launcher-actions.test.js` | Deferred-Start race, retry error wording, hung-read timeout, and accessible retry checks fail | 41/45 passed, 4 failed (`1 !== 0` deferred Start, retry message, timeout, source guard) | `.scratch/unit/20261123T202649-370152.log` |
| Node, after Round 3 fix | `ASE_OWNER=fleet-lead scripts/agents/kit unit` | Full suite passes including executed `licenseListUnavailable`, `keysBlockLaunch`, in-flight block, deferred-Start race, retry wording, and hung-read timeout | 409/409 in 43 files | `.scratch/unit/20261123T202851-372770.log` |
| Node, batching race before fix | `ASE_OWNER=fleet-lead scripts/agents/kit unit src/launcher-actions.test.js` | Queued React updater test reproduces stale ref before commit | 44/45 passed, 1 failed (`'' !== LICENSE_LIST_READ_ERROR`) | `.scratch/unit/20261123T203626-378111.log` |
| Node, final full suite | `ASE_OWNER=fleet-lead scripts/agents/kit unit` | All 412 tests pass including queued React state batching, `launchRef.current`, retry focus restoration, locked-vault unlock request after refresh, and open-site upload warning when license keys cannot be read | 412/412 in 43 files | `.scratch/unit/20261123T204937-390015.log` |
| Vite | `ASE_OWNER=fleet-lead scripts/agents/kit build` | Production build succeeds | Passed (`dist/assets/index-DXskZR8e.js`, existing externalized-module and chunk-size warnings) | `dist/` |
| Headless Chromium, final | `node .scratch/tools-438/capture.mjs after` | Initial failure at 1440/390 light/dark disables uploaded-plugin Launch/Start, keeps plain WordPress Start enabled, shows notice + **Try again** + short pause alert + `Could not be read`; refresh failure keeps prior `1 of 2 keys saved` + icon and recovers on **Try again**; 320 px at 200% text has zero overflow, keeps keyboard focus on failed retry (`still could not be read`), has `any-pointer-coarse:min-h-11` (56 px tall at 200%), and restores keyboard focus to the active setup tab (`Saved recipes (1)`) on successful keyboard retry | All 6 browser scenarios passed; 0 page errors, 0 horizontal overflow | `.scratch/tools-438/screenshots/after-*.png` |
| Kit UX | `ASE_OWNER=fleet-lead scripts/agents/kit ux` | Feature-based check if configured | Cannot run: project has no `docs/agents/features.md` | `RESULT: fail ux ENOENT` |
| Kit doctor | `ASE_OWNER=fleet-lead scripts/agents/kit doctor` | All 17 checks pass with 0.13.6 versions in sync | 17/17 checks passed | `RESULT: ok doctor 17/17 checks passed` |

Review history recorded during this build:

- Main review Round 1 (`claude-opus-5-5` on `5fd6898`, `.scratch/reviews/fleet-lead/20261123T201145Z`): 1 P1, 2 P2, 4 validation gaps, 5 nits — all addressed in `4361aba`.
- Main review Round 2 (`claude-opus-5-5` on `4361aba`, `.scratch/reviews/fleet-lead/20261123T202136Z`): all 7 R1 findings confirmed resolved; 3 P3s and 2 validation gaps remaining (retry feedback/focus, hung-read timeout, executed blocking-rule/in-flight launch tests).
- Second look (`gpt-6.1-sol` on `4361aba`, `.scratch/reviews/fleet-lead/20261123T202426Z`): 1 P1 race (deferred saved-recipe Start using stale launch closure after a license refresh failure), 1 P2 touch target (`Try again` missing `any-pointer-coarse:min-h-11` on hybrid touchscreen laptops), and 2 validation gaps (deferred-Start test; 320 px / 200% text keyboard recovery check).
- Round 3 changes (`586c559`) addressed those findings; Main review Round 3 (`claude-opus-5-5`, `.scratch/reviews/fleet-lead/20261123T203218Z`) confirmed all R2 findings resolved with 1 P3 race + 1 gap (`licenseStorageRef` updated inside state updater + render overwrite; deferred-Start test sharing `launch`/`launchRef.current`), and Second look on `586c559` (`gpt-6.1-sol`, `.scratch/reviews/fleet-lead/20261123T203550Z`) flagged the same ref-batching race as P1 + 1 gap.
- Fix commit `d948b96` updated `licenseStorageRef.current` synchronously before `setLicenseStorage(next)` and added queued-React-batching tests; Claude Opus (`20261123T203846Z`) returned 0 findings, and GPT second look (`20261123T204048Z`) returned 0 spec defects and 1 P2 focus-restoration finding when **Try again** disappears on keyboard recovery.
- Commit `f3c7904` restored focus to the active setup tab when **Try again** owns focus at recovery (verified in Chromium); GPT second look (`20261123T204802Z`) returned 0 defects (1 validation gap), and Claude Opus (`20261123T204606Z`) reported 1 P2 (`installLiveUploads` reading render `savedKeyPackages` instead of live `licenseStorageRef.current` when dropping a plugin into an open plain site), 1 P3 wording point on the Node row, and 2 validation gaps.
- Final fix updates `installLiveUploads` to read `licenseStorageRef.current` and surface a problem when the license list is unavailable instead of silently skipping key fill, and closes the 3 remaining validation gaps (`app-upload.test.js` live-upload check, `launcher-actions.test.js` focus restoration and locked-vault unlock request). Agent Kit records the final review outcome on the PR.

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
.scratch/tools-438/screenshots/after-320-200pct-light.png
```

## Result

Automated regressions failed before each fix and pass after (`412/412`), and real Chromium captures confirm the launcher keeps unknown/previous license state, warns clearly with an accessible **Try again** button, keeps plain setups launchable, pauses uploaded-plugin launches (including deferred Start) until readable, and recovers cleanly once IndexedDB answers again.

Done when 1: met — `kit unit src/launcher-actions.test.js` failed before the fix (`35/38`) and passed after (`47/47`); Chromium before/after captures at 1440, 390, and 320 px (200% text) plus the refresh-failure/recovery run confirm preserved state (`null` on initial failure, `1 of 2 keys saved` + icon on refresh failure), the notice with **Try again**, `Could not be read`, updated retry feedback, and recovery on retry.

Done when 2: met — `launch()`, `startSavedRecipe()`, `installLiveUploads()`, and Launch/Start controls use live `licenseStorageRef` / `keysBlockLaunch` so setups with uploaded plugins pause while the license list is unloaded, loading, timed out, or errored (proven in unit tests for initial failure, refresh failure, in-flight refresh, deferred Start, locked-vault unlock after refresh, and open-site upload, and in Chromium), while setups without uploaded plugins remain launchable.

Done when 3: met — no vault encryption, key storage, or key format code (`src/lib/license-vault.js`, `src/lib/vault-session.js`, `src/lib/license-fill.js`, `LicenseManager`) was modified; full `kit unit` passed `412/412` and `kit build` passed; main and second-look review artifacts are recorded by Agent Kit before landing.

## Disposition and rationale

Kept: resolves TOOLS-431 Risk 1 cleanly at the launcher state and launch-guard layer without altering vault internals, blocking setups that need no keys, or weakening existing fallback policies.

## Documentation impact

Updated `CONTEXT.md`, `docs/rebuild-spec.md`, `docs/architecture.md`, `docs/data-contracts.md`, `docs/testing.md`, `docs/changes/README.md`, `package.json`, `package-lock.json`, and the `0.13.6` `CHANGELOG_ENTRIES` in `src/App.jsx`.

## Follow-ups and open questions

- None for Risk 1. Any independent audit of untouched vault crypto/storage internals (`src/lib/license-vault.js` and `LicenseManager`) remains outside this change and requires a dedicated security reviewer.
