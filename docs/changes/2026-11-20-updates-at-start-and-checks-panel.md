# Plugins update at start, checks run by themselves, and our own Checks panel

- Date: 2026-11-20
- Owner: fleet builder (Claude Opus 5.5)
- Status: complete
- Disposition: kept
- Related version: 0.11.0
- Related commit/issue: TOOLS-259

## Context

After a one-click Start (0.10.x), a test site still needed three manual steps before it was useful for checking a plugin: press **Update all** in the bar, open the **Checks** menu, and read Query Monitor or Code Profiler inside WordPress. Update all also left every plugin it updated switched off, because WordPress's upgrader turns an active plugin off before it replaces the files and Update all did not turn it back on.

## Hypothesis and success criteria

A test site should be ready to judge at a glance once Start finishes:

1. Plugins and themes update by themselves while the site starts, and the bar lists what changed (old version to new).
2. Checks run by themselves when the site is ready, but only when every licence the setup needs is active; otherwise the bar asks to activate them first and offers Run checks.
3. A Checks panel next to WordPress shows a one-page summary (verdict, four tiles, one row per check), and each tool's own page is one press away.

## Options considered

- **Keep Update all and the Checks menu.** No work, but every launch keeps the manual steps and the switched-off plugins.
- **Show Query Monitor's own panel automatically.** No new UI, but it covers WordPress and shows no verdict, and Code Profiler has no comparable summary.
- **Own summary panel built from one measured page load (chosen).** One extra request per run, our own limits, and the tools stay available for detail.

## Implementation or prototype

- `src/lib/plugin-updates.js`: the update PHP (`PLUGIN_UPDATES_CODE`), run once per launch through `client.run` after the licence fill, only when networking is on. It updates every plugin and theme WordPress offers an update for and turns updated plugins that were active back on. An offer that needs a newer PHP or WordPress than the site runs is skipped and named, and a plugin WordPress will not switch back on after its update is reported as a failure, not as updated. Its answer (`PLAYGROUND_UPDATES:` JSON) is described in [data contracts](../data-contracts.md#plugin-updates-at-start).
- `src/UpdatesControl.jsx`: the bar's Updates button (Updating…, Updated with a count, Up to date, Update failed, or Updates with "networking blocked" or "failed") and its note.
- `src/lib/checks.js`: a second must-use plugin, `techies-measure.php`, which records one page load's numbers when the page is loaded with `techies-measure=1` (see [data contracts](../data-contracts.md#checks-measurement)); `CHECK_LIMITS`; `checksGate`; `evaluateChecks`; verdict and announcements.
- `src/ChecksPanel.jsx`: the bar's Checks button and the panel, built from the approved sketch (TOOLS-259), using the existing bar button, popover and theme tokens. No toasts; state shows on the button and in the panel.
- `src/App.jsx`: launch step 3 "Updating plugins", the automatic run after launch when the gate is ready, Run checks / Run again, and Open in the tool (which closes the panel first on phones). The old Update all action and Checks menu were removed.

### Limits

The sketch's numbers were examples only. These are the real ones (`CHECK_LIMITS`):

| Check | Amber (warn) | Red (fail) |
| --- | --- | --- |
| PHP errors | any notice or deprecation | any error or warning |
| Slow queries | any query over 0.05 s | — |
| Calls to other sites | any call that failed or answered 400 or higher | — |
| Duplicate queries | more than 10 | — |
| Query count | more than 100 | — |
| Memory | above 75% of the PHP limit | above 90% |
| Page time | above 1 s | above 3 s |
| Slowest plugin | a plugin that took more than 0.5 s to load | — |

They are wider than a hosting check would use, because Playground runs PHP in the browser. A fresh site with Query Monitor and Code Profiler built its admin pages in 0.19 to 0.26 s, used 41 MB of 256 MB (16%), ran 32 queries, logged 0 PHP errors, and its slowest plugin loaded in 0.00 to 0.01 s. So 1 s is roughly four times a normal page and deserves a look, and 3 s is clearly wrong.

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Node 24, PHP 8.3 wasm | `npm test` | All pass | 264 of 264 pass, 34 files | New tests in `plugin-updates.test.js`, `plugin-updates-php.test.js`, `checks.test.js`, `checks-php.test.js`, `license-fill.test.js`, `license-fill-php.test.js`; each failed before its change (tests first) |
| Node | `checks.test.js` page-time limit at 1.5 s and 3.5 s on the sketch's example limits (2 s / 5 s) | Fails before the change | `not ok 11 … expected: 'warn' actual: 'pass'`, then passes after the change | Commit history of this branch |
| PHP 8.3 wasm | `plugin-updates-php.test.js` against stub WordPress | An offered plugin is updated, reported old → new, and switched back on; offers needing PHP 99 or WordPress 99 are skipped and named; a plugin whose switch-on returns an error is a failure | Pass | The test file |
| PHP 8.3 wasm and Node | `license-fill-php.test.js`, `license-fill.test.js`, `checks.test.js` | The probe also lists licences already active in the site, and they count in the gate; a failed probe holds every uploaded plugin | Pass | The test files |
| PHP 8.3 wasm | `plugin-updates-php.test.js` with the plugin check failing (cURL timeout) and the theme check answering HTTP 503 | Both checks are named as failed with their reason; nothing is listed as already current; an offer from a plugin's own server is still installed | Failed before the change (the result said nothing failed and listed Query Monitor and the active theme as current), passes after it | The test file |
| PHP 8.3 wasm | `plugin-updates-php.test.js` with the plugin check failing over https and answering over http | The check counts as answered | Pass | The test file |
| PHP 8.3 wasm and Node | `license-fill-php.test.js` with an expired Freemius licence whose premium code still runs (`has_active_valid_license()` false, `can_use_premium_code()` true); `license-fill.test.js` chaining the probe answer into the gate for Start without keys | The expired licence is listed as licensed and opens the gate (Lex's rule of 2026-11-21); an unknown probe keeps the gate closed | Pass; these pin behaviour the code already had, so they passed before this change too | The test files |
| Chromium (T3 preview), local build with `VITE_PLAYGROUND_ORIGIN=https://preview-wp.techies.tools`, desktop and 375 px | Launch with Query Monitor and Code Profiler, networking on. Open Updates, then Checks; press Run again, Open in Code Profiler, Escape twice; repeat at phone width | Updates names the result; checks run by themselves; panel opaque with verdict and four tiles; Run again remeasures; Code Profiler's page opens; Escape closes the Updates note first, then the panel; tiles 2 by 2 on a phone | As expected. Updates said "No plugin or theme had an update" and listed the current versions (Code Profiler 1.9.6, Query Monitor 4.1.1, Twenty Twenty-Five 1.5). All checks passed with the numbers above | Manual run, 2026-11-20 |
| Chromium (T3 preview), same local build, 1280 px, private window | Upload Hello Dolly 1.6 (an outdated copy from WordPress.org) with Query Monitor and Code Profiler, networking on, then Launch 3 plugins. Open WordPress's Plugins page | Hello Dolly is updated at start, the bar names the change, the updated plugin stays active, checks run by themselves | As expected. The bar said "Updated: Hello Dolly 1.6 → 1.7.2" and "Checks 8 passed"; the Plugins page showed the uploaded Hello Dolly at 1.7.2 and still active | Manual run, 2026-11-21 |
| Chromium (T3 preview), same local build, 1280 px, private window | Save a made-up key for Hello Dolly (a throwaway vault password), launch the same setup with the vault unlocked, then press Run checks. Hello Dolly has no Freemius licence code, so the key is not filled in and the licence stays inactive | The checks do not start, the Checks button shows the amber warning and asks to activate licences, the panel says `0 of 1 active`, and Run checks still runs | As expected. Licenses said `0 of 1 active`; Checks showed the amber warning with `· activate licenses first` and that tooltip; the panel said "Activate licenses first" and "0 of 1 active. Activate them in WordPress, then run the checks." with empty tiles; Run checks gave "8 passed" and the warning cleared | Manual run, 2026-11-21 |
| Chromium (T3 preview), same local build, 1280 px, private window | Reload the page so the vault locks, launch the same setup, press **Start without keys** at the unlock prompt | The checks do not start, the amber warning shows, the panel says `0 of 1 active` | As expected: Checks showed the amber warning with `· activate licenses first`, and the panel said "0 of 1 active. Activate them in WordPress, then run the checks." | Manual run, 2026-11-21 |
| Chromium (T3 preview), same local build, 1280 px, private window | Upload a premium test copy of Menu Image (the free ZIP from WordPress.org with its Freemius settings switched to a premium build), add Query Monitor and Code Profiler, save no key, launch, then press Run checks | The checks do not start, because WordPress reports a premium plugin that cannot use its premium code yet; the panel says `0 of 1 active`; Run checks still runs | As expected. Checks showed `· activate licenses first`; the panel said "0 of 1 active. Activate them in WordPress, then run the checks."; Run checks gave "All 8 checks passed" | Manual run, 2026-11-21 |
| Chromium (T3 preview), local build of the licence-probe change, 1280 px, fresh browser profile | Upload the real free Menu Image ZIP, add Query Monitor and Code Profiler, save no key, launch a temporary site | The licence probe answers (Menu Image is a free build, so it needs no licence) and the checks run by themselves; a failed probe would have held them | As expected: "Ready on WordPress 7.1.5" and Checks "8 passed" without pressing anything | Manual run, 2026-11-21 |
| Chromium (T3 preview), the local build of rows 63–65, before the licence-probe change, 1280 px, private window, fresh throwaway vault | Upload the real free Menu Image ZIP (it ships Freemius), save a made-up key for it, launch a temporary site with Query Monitor and Code Profiler, then press Run checks | Freemius refuses the key, the licence counts as not active, the checks do not start, Run checks still runs | As expected. The vault said "Filled in. Freemius said: Invalid license key."; Licenses said `0 of 1 active`; Checks showed `· activate licenses first`; Run checks gave "All 8 checks passed" | Manual run, 2026-11-21 |

## Result

The three steps are now automatic. The update path was proven in the browser with a real outdated plugin (Hello Dolly 1.6 to 1.7.2, still active afterwards) and in PHP 8.3 against stub WordPress. The licence gate was proven in unit tests and in the browser four times: with a saved key that could not be filled in (a plugin without Freemius), with **Start without keys** at the unlock prompt, with a key that Freemius refused (Menu Image, a free plugin that ships Freemius), and with a premium Freemius build that had no saved key at all. Those four runs used the build before the licence-probe change; after it, one run checked that a free Freemius build lets the checks start by themselves. That the four earlier cases give the same result on the new code comes from reading the code and from the unit tests, not from a new browser run. An update check that WordPress.org does not answer is now named as failed instead of showing `Up to date`; this was tested in PHP 8.3 only, not in the browser.

## Disposition and rationale

Kept. It removes the manual steps from every launch, fixes the switched-off plugins after updating, and keeps each tool's own page for detail.

## Documentation impact

[rebuild-spec.md](../rebuild-spec.md), [architecture.md](../architecture.md), [data-contracts.md](../data-contracts.md), [testing.md](../testing.md), README, `CHANGELOG_ENTRIES` in `src/App.jsx`, version 0.11.0 in `package.json` and `package-lock.json`.

## Follow-ups and open questions

- "Slowest plugin" measures load time only, not a full profile; Code Profiler stays the place for that.
- The gate counts plugins with a saved key and premium Freemius builds that cannot use their premium code yet. A premium plugin that does not use Freemius and has no saved key does not hold the checks back, because WordPress gives no common way to tell that it needs a licence. A plugin whose licence Lex activates by hand inside WordPress after Start does not start the checks by itself; Run checks does. A Freemius licence that is already active when the site starts (a saved site, even with Start without keys) counts, and so does an expired licence that still unlocks the premium features (Lex, 2026-11-21: "Yes, count it"). When WordPress does not answer the licence probe, every uploaded plugin counts as needing a licence, so the panel may list plugins that need none; Run checks still runs.
- The dashboard and front-page runs were not clicked through in the browser, because clicks inside the WordPress frame do not reach it from the test browser.
