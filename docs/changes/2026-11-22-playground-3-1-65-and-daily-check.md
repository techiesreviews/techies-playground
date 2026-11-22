# Playground 3.1.65 and the daily release check

- Date: 2026-11-22
- Owner: fleet-lead
- Status: complete
- Disposition: kept
- Related version: 0.13.1
- Related commit/issue: TOOLS-403; supersedes the dependency pin in [the release sync record](2026-11-20-playground-release-sync-and-security-checks.md).

## Context

The hosted Playground still used 3.1.64 after the official 3.1.65 release on November 16. Lex asked whether the hosted runtime needed updating and why the daily release check had opened no update.

## Hypothesis and success criteria

Move the launcher packages and self-hosted build to 3.1.65 together, boot WordPress with a plugin and both testers, and exercise the workflow copy used by the scheduler. Changes land on dev only; the live site waits for Lex's go.

## Options considered

- Keep 3.1.64: leaves the hosted runtime behind upstream.
- Use the existing sync script locally, then dispatch the existing main workflow after landing: exercises the intended path without changing the release branch.
- Change cron or repository settings without evidence: rejected because the workflow is active and had at most one scheduled slot.

## Implementation or prototype

Ran `node scripts/sync-playground-release.mjs` through Agent Kit. It moved all three direct pins and all 12 locked Playground/PHP packages to 3.1.65, refreshed the lockfile, and generated the 0.13.1 changelog entry. The host and client version follow the Blueprints pin in the existing deployment workflow.

[Official 3.1.65 release notes](https://github.com/WordPress/wordpress-playground/releases/tag/v3.1.65) list Xdebug loopback binding, Personal WP loopback permissions, renewed WebMCP tokens, direct-navigation routing, and translations. They name no breaking API change. The Firefox request-body patch still applies to this tag and remains required.

## Schedule investigation

- Repository API: default branch `main`, not archived or disabled, with current pushes.
- `origin/main` contains `.github/workflows/sync-playground-release.yml`; its schedule is `47 6 * * *`. It checks out `dev` and creates pull requests with `--base dev`.
- Workflow API: id 425971847, state `active`, registered November 21, 2026 at 13:01:15 UTC. Before this investigation it had zero runs, so at most the November 22 06:47 UTC slot had passed. The earlier November 21 slot preceded registration.
- Existing WordPress schedule (`17 6 * * *`) ran on November 22 at 14:30:34 UTC, over eight hours late. [GitHub documents that scheduled runs can be delayed or dropped](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule). The evidence does not establish a source-code defect or a precise internal scheduler cause.
- Active state and recent repository activity rule out a disabled workflow and 60-day inactivity. The read-only prepare job and separate write job already request the necessary contents/pull-request permissions. Repository Actions administration endpoints return HTTP 403 for the available token, so the repository setting remains unverified.
- At the initial record, manual main workflow dispatch and preview browser evidence were pending. The lead's November 22 14:56 card comment records the scheduled run at 14:55 UTC and successful Chromium/Firefox plugin-and-testers boots. The independent release-review rerun below completes the browser evidence in this record.

## Tests and evidence

Linux, Node 24.22.2, November 22, 2026. Source inspection and executed checks are separated below. Logs are in this worktree's `.scratch/tools-403/` and `.scratch/kit-jobs/tools-403-full/log`.

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Before update | Assert every direct Playground/PHP pin is 3.1.65 | Fail on old pin | Failed: `@wp-playground/blueprints: 3.1.64 !== 3.1.65` | Executed Node assertion |
| Local checkout | `kit go tools-403-update -- node scripts/sync-playground-release.mjs` | Prepare 3.1.65 together | `Prepared Playground 3.1.65 (from 3.1.64) as app 0.13.1.` | Executed sync; kit job log |
| After update | Assert all locked Playground/PHP packages are 3.1.65 | Every pin agrees | All 12 packages agree | Executed Node assertion |
| Fresh worktree | `kit doctor`, `npm ci`, `kit doctor` | Installed dependencies match | Initial missing-packages failure resolved; 17/17 passed | Executed checks; `.scratch/tools-403/doctor.log` |
| Dependencies | `kit deps check` | Match lockfile | 239 packages match, 98 absent optional packages skipped | Executed check |
| Unit suite | `kit unit --affected`; full `kit unit` | No regressions | None affected initially; full 338/338 tests in 39 files passed | Executed kit job log |
| Production bundle | `kit build` | Build without deploy | Passed; existing bundle-size warning remains | Executed kit job log |
| Security | `npm audit --audit-level=high`; `node scripts/check-playground-advisories.mjs` | No applicable high advisories | Zero npm vulnerabilities; no advisory covers 24 installed/hosted Playground packages at 3.1.65 | Executed kit job log |
| Upstream v3.1.65 | Sparse clone then `git apply --check --verbose` of the core patch | Patch still applies | All six patch paths passed at `6285c299b865be3bed8e3c2990f535ec99e59ecc` | Executed clone and patch check |
| Node WordPress | `node scripts/playground-boot-check.mjs` | New runtime boots default setup and WP-CLI | Playground 3.1.65 booted WordPress 7.1.5 on PHP 8.3.36; WP-CLI and launcher mu-plugin worked | Executed kit job log; does not prove browser/tester behavior |
| GitHub configuration | Repository/workflow/run REST queries | Establish branch, state and run history | main default; workflow active since Nov 21; zero initial runs; current repository activity | Executed API queries |
| Workflow source | Read `origin/main:.github/workflows/sync-playground-release.yml` | Schedule uses correct code/target | Daily schedule present, dev checkout and PR base, separate read/write job permissions | Source inspection only |
| Repository settings | Query Actions permissions endpoints | Read administration settings | HTTP 403; setting remains unverified | Executed API requests |
| Main workflow and hosted browser | Initial plan: dispatch main after dev merge and boot the hosted preview with a plugin and both testers | Verify actual hosted path | Initially pending; the lead later recorded the scheduled run and both browser boots, and the independent rerun below passed | Lead-supplied card comment, November 22 at 14:56; release-review rerun below |

## Result

All package pins move together, the core patch applies, and local tests, build, advisory checks and CLI boot pass. The schedule evidence establishes no source-code defect: the workflow is new, active, correctly placed and has had at most one scheduled slot. The lead recorded the scheduled run after the dev merge. Hosted browser acceptance was independently repeated during release review below.

## Disposition and rationale

Keep the existing sync implementation: the scheduled run fired and the 3.1.65 hosted plugin/tester boot passes. This work lands on dev only; the lead handles any separately authorized live release. The repository setting allowing automatic update PRs still requires administrator confirmation.

## Documentation impact

Updated the current dependency pin, application version, and the distinction between main's schedule and dev's checkout in the testing guide. No recipe, storage or API contract changes.

## Follow-ups

Lead closes TOOLS-403 only when its Done when evidence is complete. If scheduler runs still fail to appear, inspect repository Actions settings with an administrator and retain the manual main dispatch as the operational proof.

## Release-review boot rerun — November 22, 2026

Executed in T3 Code's Chromium 152.0.7977.169 / Electron 44.10.1 on Linux, WordPress latest resolved to 7.1.5, PHP 8.3.36, networking enabled. The uploaded fixture was `tools403-smoke.zip` (1.0.0), with Query Monitor 4.1.1 and Code Profiler 1.9.6. No vendor licences were used.

- **20:08 UTC, fresh temporary preview:** `preview-play.techies.tools`, Playground 3.1.65, booted successfully. A PHP request confirmed WordPress 7.1.5 and all three plugin paths in `active_plugins`; all eight checks passed.
- **20:09 UTC, original browser-saved preview:** retry returned `Error connecting to the SQLite database.` Read-only inspection found its existing OPFS site contained 501 directories and zero files, including no `wp-config.php` or SQLite database. The original save was preserved. The cause of its missing files is unknown.
- **20:09–20:11 UTC, live comparison:** `play.techies.tools` on Playground 3.1.64 booted the same browser-saved setup, and a subsequent resume passed. All three plugins were active.
- **20:12–20:14 UTC, fresh browser-saved preview:** a new site identity on 3.1.65 booted and resumed successfully. It contained 4,029 files in 501 directories; PHP confirmed all three plugins active and the bar reported all eight checks passed.
- **20:14–20:16 UTC, local migration comparison:** the local 0.13.2 launcher used a loopback runtime proxy at one fixed origin, initially serving the unchanged 3.1.64 live runtime. After saving `tools403_migration_probe=saved-on-3.1.64` in WordPress, the runtime proxy switched to 3.1.65. Only service workers and caches on that diagnostic origin were cleared; OPFS was preserved. Resume passed with the marker and all three active plugins intact. The new client asset was `index-DF8ni5D5.js`, matching the 3.1.65 preview.

The first local attempt against the deployed preview host was blocked by its frame-ancestor policy and timed out; the first loopback proxy attempt lacked the host proxy's same-origin request headers and returned HTTP 403 for the WordPress download. Correcting the diagnostic transport allowed the controlled migration above. These were local harness failures, not successful runtime boots.

The failure is explained by the incomplete old test save. Fresh 3.1.65 boot/resume and the controlled 3.1.64-to-3.1.65 migration passed. Neither a PHP/tester combination failure nor a version-migration regression was reproduced. No upstream defect or application repair for the historical missing files is claimed. See [the release-review diagnosis](2026-11-22-release-review-fixes.md) for the procedure and limitations.

Executed evidence: release-fix checkout `.scratch/tools-403-boot-comparison.json`, `.scratch/tools-403-release-fixes-boot-failure.json`, and `.scratch/tools-403-bar-proof.json`. Earlier standalone Chromium/Firefox evidence remains in the original TOOLS-403 build checkout's `.scratch/tools-403/browser-proof.json`; Firefox was not rerun during this fix round.
