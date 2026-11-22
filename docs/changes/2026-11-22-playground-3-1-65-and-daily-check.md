# Playground 3.1.65 and the daily release check

- Date: 2026-11-22
- Owner: fleet-lead (GPT Sol builder)
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

## Implementation

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

- Before change: an exact-version assertion failed with `@wp-playground/blueprints: 3.1.64 !== 3.1.65`.
- Sync output: `Prepared Playground 3.1.65 (from 3.1.64) as app 0.13.1.`
- After change: exact-version assertions pass for all 12 locked Playground/PHP packages.
- `kit doctor`: initial fresh-checkout failure for absent packages; `npm ci` resolved it; 17/17 passed.
- `kit deps check`: 239 packages match, 98 absent optional packages skipped.
- `kit unit --affected`: none affected (dependency and changelog changes). Full `kit unit` passed all 338 tests in 39 files.
- `kit build`: production build passed; existing bundle-size warning remains.
- `npm audit --audit-level=high`: zero vulnerabilities.
- `node scripts/check-playground-advisories.mjs`: no published advisory covers the 24 installed/hosted Playground packages at 3.1.65.
- Sparse clone of `WordPress/wordpress-playground` tag `v3.1.65` (commit `6285c299b865be3bed8e3c2990f535ec99e59ecc`): `git apply --check --verbose playground-host/playground-core.patch` passed for all six patch paths.
- `node scripts/playground-boot-check.mjs`: Playground 3.1.65 booted WordPress 7.1.5 on PHP 8.3.36; WP-CLI and the launcher's mu-plugin worked.
- Main workflow dispatch and hosted browser acceptance follow the dev merge; their actual results belong in the PR proof and lead report.

## Result and disposition

Kept: all package pins move together and the existing core patch and automated checks pass. The main workflow already has the correct schedule, active state and dev target; no speculative workflow-code change was made. No push to main, live release or npm publish is authorized by this work.

## Documentation impact

Updated the current dependency pin, application version, and the distinction between main's schedule and dev's checkout in the testing guide. No recipe, storage or API contract changes.

## Follow-ups

Lead closes TOOLS-403 only when its Done when evidence is complete. If scheduler runs still fail to appear, inspect repository Actions settings with an administrator and retain the manual main dispatch as the operational proof.
