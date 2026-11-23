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

Keeping the previous `licenseRecords` value (`null` on initial failure, or the previously loaded array on a later refresh failure), surfacing a plain-language read error without leaking raw browser error text, suppressing misleading zero/missing key indicators while unloaded, and pausing Launch/Start while the license list is unread or unreadable will keep saved keys visible when already loaded and prevent launches from silently skipping saved licenses.

## Options considered

- Leave unchanged: hides saved keys on read error and lets launches silently skip them.
- Keep previous state on failure and warn, without pausing stale refresh launches: still allows launching with a stale list after a failed refresh (for example right after adding a new key).
- Keep previous state, show a clear error in the existing alert/notice styles, hide unknown missing-key counts, and pause launch until readable (with out-of-order read protection): chosen; requires no vault encryption, storage or key-format changes.

## Implementation or prototype

`src/App.jsx` replaces the standalone `licenseRecords` state with `licenseStorage` (`{ records: null, error: '' }`) and a monotonic `licenseReadIdRef` counter so out-of-order `listLicenseMetadata()` calls cannot overwrite newer state. `refreshLicenseRecords()` updates `{ records, error: '' }` on success and preserves `current.records` while setting `LICENSE_LIST_READ_ERROR` on rejection.

`launchReady` requires both `licenseRecords !== null` and `!licenseRecordsError`, disabling Launch and Start buttons and guarding `launch()`. `keyCountsFor()` returns `saved: null` while `licenseRecords === null` so `SavedRecipeRow` omits `N keys missing`, `LaunchSummary` shows `Could not be read` (or `Checking…` while loading) instead of `0 of N keys saved`, and `PluginRow` hides **Add key** while unloaded (`keysLoaded={licenseRecords !== null}`). The error appears in `LaunchSummary`'s mounted `role="alert"` red alert box (separate from transient `error` resets) and as an inline red notice under the setup tabs.

Vault encryption, key storage, key format, and `LicenseManager` / `src/lib/license-vault.js` / `src/lib/vault-session.js` / `src/lib/license-fill.js` were not modified. Intended fallback policies from the TOOLS-431 report (WordPress offline version fallback, per-record invalid recipe/history filtering) remain unchanged.

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Node, baseline | `ASE_OWNER=fleet-lead scripts/agents/kit unit` | Existing suite passes | 399/399 in 43 files | `.scratch/unit/20261123T200401-339082.log` |
| Node, before fix | `ASE_OWNER=fleet-lead scripts/agents/kit unit src/launcher-actions.test.js` | All 3 new Risk 1 regressions fail | 35/38 passed, 3 failed (`[] !== null`, `[] !== [existing]`, out-of-order overwrite) | `.scratch/unit/20261123T200458-341536.log` |
| Headless Chromium, before fix | `ASE_OWNER=fleet-lead scripts/agents/kit build && node .scratch/tools-438/capture.mjs before` | Reproduces silent failure at 1440/390 light/dark | Launch/Start enabled, `0 of 1 keys saved`, `1 key missing`, zero alerts | `.scratch/tools-438/screenshots/before-*.png` |
| Node, after fix (focused) | `ASE_OWNER=fleet-lead scripts/agents/kit unit src/launcher-actions.test.js` | All Risk 1 regressions and existing handler tests pass | 39/39 passed | `.scratch/unit/20261123T200655-348028.log` |
| Node, after fix (full) | `ASE_OWNER=fleet-lead scripts/agents/kit unit` | Full suite passes (after keeping `<dd className="...">` static for `bar-compact-labels.test.js`) | 403/403 in 43 files | `.scratch/unit/20261123T200720-349865.log` |
| Vite | `ASE_OWNER=fleet-lead scripts/agents/kit build` | Production build succeeds | Passed (`dist/assets/index-BktaWet_.js`, existing externalized-module and chunk-size warnings) | `dist/` |
| Headless Chromium, after fix | `node .scratch/tools-438/capture.mjs after` | All 4 viewports/schemes disable Launch/Start, show red notice and alert, show `Could not be read`, omit `1 key missing`, zero overflow/errors | 4/4 passed; 0 page errors, 0 horizontal overflow | `.scratch/tools-438/screenshots/after-*.png` |
| Kit UX | `ASE_OWNER=fleet-lead scripts/agents/kit ux` | Feature-based check if configured | Cannot run: project has no `docs/agents/features.md` | `RESULT: fail ux ENOENT` |
| Kit doctor | `ASE_OWNER=fleet-lead scripts/agents/kit doctor` | All 17 checks pass with 0.13.6 versions in sync | 17/17 checks passed | `RESULT: ok doctor 17/17 checks passed` |

Screenshots in the worktree (untracked evidence; no real or test licence keys in fixtures or captures):

```text
.scratch/tools-438/screenshots/before-1440-light.png
.scratch/tools-438/screenshots/before-1440-dark.png
.scratch/tools-438/screenshots/before-390-light.png
.scratch/tools-438/screenshots/before-390-dark.png
.scratch/tools-438/screenshots/after-1440-light.png
.scratch/tools-438/screenshots/after-1440-dark.png
.scratch/tools-438/screenshots/after-390-light.png
.scratch/tools-438/screenshots/after-390-dark.png
```

## Result

Automated regressions failed before the fix and pass after, and real Chromium captures confirm the launcher keeps unknown/previous license state, warns clearly, and disables Launch/Start when `listLicenseMetadata()` fails.

Done when 1: met — `kit unit src/launcher-actions.test.js` failed before the fix (`35/38`, `[] !== null` and `[] !== [existing]`) and passed after (`39/39`); Chromium before/after captures at 1440 and 390 px (light and dark) confirm the error notice, red `LaunchSummary` alert, `Could not be read` label, and preserved state.

Done when 2: met — `launch()` and all Launch/Start controls require `licenseRecords !== null && !licenseRecordsError`; unit tests prove both initial-load failure and subsequent refresh failure block `launch()` with zero runtime starts, and Chromium captures confirm Launch and Start remain disabled.

Done when 3: met — no vault encryption, key storage, or key format code (`src/lib/license-vault.js`, `src/lib/vault-session.js`, `src/lib/license-fill.js`, `LicenseManager`) was modified; full `kit unit` passed `403/403` and `kit build` passed; main review (`claude-opus-5-5`) and second look (`gpt-6.1-sol`) cover the launcher diff.

## Disposition and rationale

Kept: resolves TOOLS-431 Risk 1 cleanly at the launcher state and launch-guard layer without altering vault internals or weakening existing fallback policies.

## Documentation impact

Updated `CONTEXT.md`, `docs/rebuild-spec.md`, `docs/architecture.md`, `docs/data-contracts.md`, `docs/testing.md`, `docs/changes/README.md`, `package.json`, `package-lock.json`, and the `0.13.6` `CHANGELOG_ENTRIES` in `src/App.jsx`.

## Follow-ups and open questions

- None for Risk 1. Any independent audit of untouched vault crypto/storage internals (`src/lib/license-vault.js` and `LicenseManager`) remains outside this change and requires a dedicated security reviewer.
