# Playground 3.1.65 and the daily release check

- Date: 2026-11-22
- Owner: fleet-lead
- Status: in-progress
- Disposition: pending
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
- Manual main workflow dispatch and preview browser evidence: pending after landing.

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
| Main workflow and hosted browser | Dispatch main after dev merge; launch a plugin with Query Monitor and Code Profiler on the new preview | Verify actual hosted path | Planned after merge; actual results will be recorded in the PR proof and lead report | Not yet executed |

## Result

All package pins move together, the core patch applies, and local tests, build, advisory checks and CLI boot pass. The schedule evidence establishes no source-code defect: the workflow is new, active, correctly placed and has had at most one scheduled slot. Manual dispatch and hosted browser acceptance follow the dev merge.

## Disposition and rationale

Kept. Use the existing sync implementation and exercise main's workflow before changing a correct schedule speculatively. No push to main, live release or npm publish is authorized by this work.

## Documentation impact

Updated the current dependency pin, application version, and the distinction between main's schedule and dev's checkout in the testing guide. No recipe, storage or API contract changes.

## Follow-ups

Lead closes TOOLS-403 only when its Done when evidence is complete. If scheduler runs still fail to appear, inspect repository Actions settings with an administrator and retain the manual main dispatch as the operational proof.
