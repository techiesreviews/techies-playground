# Playground release-review fixes

- Date: 2026-11-22
- Owner: fleet-lead
- Status: complete
- Disposition: kept
- Related version: 0.13.2
- Related commit/issue: TOOLS-403; release review of PR #67

## Context

Release review found that the theme ZIP picker bypassed the shared queue, upload labels could crowd Close on narrow bars, and tester synchronisation could deactivate plugins selected inside WordPress. The 3.1.65 change record also lacked its final hosted boot evidence. This record supersedes the tester-deactivation description in [the uploaded-plugin record](2026-11-22-uploaded-plugins-live-install-and-tester-editions.md).

## Hypothesis and success criteria

Route both pickers through the existing queue, keep upload states compact below 768 px, and deactivate only competing editions of selected testers. An installed plugin must retain its status when a subsequent checks, licence or navigation step fails. Boot the selected plugin and both testers, and distinguish damaged saved data from a runtime migration failure.

## Implementation

- Both ZIP inputs use `handleZipImport`, sharing queue ordering, header detection and input reset.
- Upload labels stay visually hidden below 768 px except failures. Busy states use the existing reduced-motion-aware spinner; saved uploads use a distinct clock icon. `aria-disabled` preserves keyboard focus and ignores activation while unavailable; accessible names include the visible label without repeating the progress prefix.
- Tester sync disables competing editions of selected families and previously launcher-owned editions removed from the recipe. An option in the site records selected editions only after successful activation; other testers remain untouched.
- Post-install setup and navigation failures return accurate inline messages without changing the successful installation result.
- Close-confirmation tap spans use the existing `pointer-fine:hidden` rule. The changelog/version, current-state docs, test inventory and four missing change-index links are aligned.

## Tests and evidence

Linux, Node 24.22.2, November 22, 2026:

| Check | Observed result |
| --- | --- |
| `kit doctor` before dependency installation | Failed because dependencies were absent; resolved with `npm ci --no-audit --no-fund` |
| `kit doctor`; `kit deps check` | 17/17 doctor checks passed; 239 packages match the lockfile, 98 absent optional packages skipped |
| New orchestration/PHP regressions before fixes, `kit unit src/app-upload.test.js src/lib/uploaded-plugins-php.test.js` | 3 passed, 5 failed: theme input never queued, post-install checks/navigation errors escaped, and unrelated testers were deactivated |
| Same focused command after fixes | 8/8 passed |
| `kit unit --affected` | 119/119 passed in 12 files |
| Full `kit unit` | First run: 341/342, exposing an old source assertion requiring the tap span to lack the new fine-pointer rule. Updated that assertion to require the intended touch-only span; second run: 342/342 passed in 40 files |
| `kit build`, with local runtime origin | Passed; existing bundle-size/externalised Node-module warnings remain |
| `kit ux` | Could not run: this project deliberately has no `docs/agents/features.md`; no automatic UX result is claimed |
| T3 browser bar checks | At 320 and 375 px, 100% text, staged upload/saved states with checks, a 2/3 licence notice and 12 updated packages: Close fully visible, labels 1×1 px and upload focus preserved |
| Standalone Chromium 153.0.8010.12, `.scratch/tools-403-bar-smoke.mjs` | Actual local plugin/tester boot passed, followed by the same staged bar states at both widths. Close right edge was 312/320 and 367/375 px; focus stayed on the upload button; no page errors. Four PNG captures and `.scratch/tools-403-bar-proof.json` retained |

T3 screenshot capture failed twice because the browser was not producing screenshot frames. The standalone browser supplied the four captures instead. The staged bar checks exercise the actual React controls and layout; they do not claim an upload remained in flight throughout capture.

## Boot diagnosis

The [3.1.65 record](2026-11-22-playground-3-1-65-and-daily-check.md#release-review-boot-rerun--november-22-2026) records each comparison and timestamp. Fresh temporary and new browser-saved preview boots passed, including resume. The original failing test identity contained 501 OPFS directories and **zero files**; its database, SQLite integration and `wp-config.php` were absent. Those original files were already absent when inspected; no recovery or deletion was attempted.

A controlled local comparison created a site using the live 3.1.64 runtime, wrote a distinctive WordPress option, then resumed the same OPFS data under the preview 3.1.65 runtime at the same loopback origin. The option, WordPress 7.1.5, PHP 8.3.36 and all three active plugins survived. The launcher build included this fix round. Local transport initially required correction for deployed frame restrictions and same-origin proxy headers; these failures are retained in the record.

The immediate cause is incomplete saved data. The historical cause of those missing files remains unknown. The upstream [database validator at the pinned 3.1.65 commit](https://github.com/WordPress/wordpress-playground/blob/6285c299b865be3bed8e3c2990f535ec99e59ecc/packages/playground/wordpress/src/boot.ts#L378-L404) reports the observed connection error when the database fails validation. No matching upstream bug was established, and the successful controlled migration does not support attributing this failure to the version bump.

## Finding outcomes

R1-1 through R1-11 are fixed: shared picker queue; compact upload labels; scoped tester deactivation; completed boot record; one consistent disposition; current test count; four index entries; accurate post-install errors; touch-only confirmation spans; accessible upload names; and retained keyboard focus.

Validation gaps R1-12, R1-13 and R1-14 have focused orchestration/PHP coverage; R1-16 has the browser evidence above. Declined: R1-15, the extra tester-deactivation-failure test, is deferred because it exercises a separate installation-failure path rather than these release fixes. Existing failed-install handling and its tests remain unchanged. Other optional review nits are outside this round.

## Result and follow-ups

The release fixes and required boot acceptance pass locally. The incomplete historical test save is preserved for inspection; its missing files cannot be restored by a runtime downgrade. This work lands on dev only. The lead checks preview deployment, controls any live release, and handles the repository setting that lets the daily sync create update PRs.

## Review follow-up

The first fix-round review found two P2s: Turn off needed saved-site ownership tracking, and the compact saved state needed its own icon. Two new PHP tests first failed (5/7 passing), then passed after adding `rememberCheckPluginsCode` and ownership-aware synchronisation. They prove that removing a launcher-owned Code Profiler deactivates it while independently activated Query Monitor survives, and that a failed Code Profiler installation cannot claim ownership of a later manual activation.

The compact saved state now uses a clock; unavailable controls keep their normal surface and explain their availability through the title. Documentation now states the compact icon rule, groups spinner coverage under its own Checks heading, and puts the November 21 index entries after November 22. The plugin list opens only when at least one ZIP installed, so an all-failed batch cannot add an inaccurate “Installed” navigation message.

The post-install setup message deliberately groups checks and licence setup as “checks or licence”; it distinguishes that group from opening the plugin list without claiming to identify which internal setup call failed. The extra source assertions and test permutations proposed as validation gaps in this review remain optional; real browser layout/focus evidence and focused orchestration/PHP tests cover the required outcomes.

Final follow-up checks: `kit unit --affected` passed 140/140 in 13 files; full `kit unit` passed 344/344 in 40 files; `kit build` passed with the existing warnings. `kit ux` again reported the missing feature list. The standalone Chromium rerun passed all four 320/375 px upload/saved layouts with the new clock icon and no page errors. It also launched the saved site three times: both selected testers were recorded as managed; turning both off removed them; manually activating Query Monitor inside WordPress then resuming with both absent from the setup preserved Query Monitor while Code Profiler stayed off. The resulting `active_plugins` and ownership arrays are in `.scratch/tools-403-bar-proof.json`.
