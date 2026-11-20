# Playground release sync and security checks

- Date: 2026-11-20
- Owner: Claude Opus 5.5 (fleet builder, TOOLS-237)
- Status: complete
- Disposition: kept; partly superseded by [the second-look fixes](2026-11-20-playground-sync-second-look-fixes.md) (safe push, host packages in the advisory check, boot script renamed `playground-boot-check.mjs`)
- Related version: unreleased (no visible change, no version bump)
- Related commit/issue: Orbit TOOLS-237; commits from `c8767fc` on `build/tools-237-playground-self-host-auto-update-with`

## Context

The launcher and the self-hosted Playground (`wp.techies.tools`, preview `preview-wp.techies.tools`) were pinned to WordPress Playground 3.1.64 by hand. Playground 3.1.65 was already out, and nothing told us. One version drives four things: the `@wp-playground/blueprints` dependency, the `@php-wasm/node-8-3` and `@php-wasm/universal` test packages, the Playground client the launcher loads from the host, and the host build (`deploy-site.yml` builds it from tag `v<blueprints pin>`).

There was also no regular security check: `npm audit` reported a high finding in `isomorphic-git` (pulled in by `@wp-playground/storage`), Dependabot alerts were not looked at in CI, and Playground's own security advisories were not checked at all. Finally, WP-CLI was still downloaded from `playground.wordpress.net/wp-cli.phar`: the hosted Playground client and four of its worker and service-worker files name that URL, and the launcher bundle carried one unused copy.

## Hypothesis and success criteria

A scheduled job can move the whole Playground version at once and prove it boots before anyone looks at it. Success:

1. A scheduled check opens one pull request into `dev` when Playground releases, moving the client, the Blueprints packages and the self-hosted build together, with a boot test.
2. `npm audit`, Dependabot alerts and Playground advisories are part of the checks.
3. A passing update stops at the previews. Going live (releasing `dev` to `main`) needs Lex's approval every time.

## Options considered

- **Dependabot or Renovate version PRs.** They would bump the npm packages, but not keep all Playground packages on one version, not add the app changelog entry, and not boot Playground before opening the PR. Rejected.
- **Bump only when someone notices.** The state before this change. Rejected: 3.1.65 had already been missed.
- **A sync workflow like the existing WordPress sync.** One script moves every pin, the workflow verifies the result (tests, build, audit, advisories, a real boot) and opens one PR. Chosen.
- **Auto-merge a passing update into `dev`.** Not done: the PR still gets a human merge, and `main` is never touched by the job.

## Implementation or prototype

- `scripts/sync-playground-release.mjs` reads the newest `@wp-playground/blueprints` from npm. It moves on only when every pinned `@wp-playground/*` and `@php-wasm/*` package exists at that version on npm and the upstream tag `v<version>` exists (so the host can be built). It updates `package.json` (all Playground pins, a patch bump of the app version), adds a changelog entry in `src/App.jsx`, drops package overrides the release no longer needs, and refreshes the lockfile.
- `package.json` overrides `isomorphic-git` to `1.38.6`, above the high advisory; 3.1.65 still pins 1.37.6, so the sync keeps the override until a release moves past it.
- `scripts/prepare-playground-host.mjs` points every hosted script that names `playground.wordpress.net/wp-cli.phar` at `/wp-cli.phar` on the Playground host itself (`import.meta.url` in the ESM client, `self.location.href` in workers and the service worker). It refuses to prepare a host that would link to `wp-cli.phar` without shipping it, and adds a `_headers` rule so other origins may fetch it. The Vite plugin `wpCliFromHostPlugin` does the same for the launcher bundle, using the launcher's own Playground host (`VITE_PLAYGROUND_ORIGIN`).
- `scripts/check-playground-advisories.mjs` lists the installed `@wp-playground/*` and `@php-wasm/*` packages from the lockfile and checks them against the Playground repository's security advisories and the GitHub advisory database (reviewed and unreviewed). Any affecting advisory fails the check.
- `scripts/playground-boot-test.mjs` boots the pinned release once with `@wp-playground/cli` at the same version, using the launcher's default setup plus WP-CLI. WordPress itself writes the result (WordPress and PHP versions, a site title set through WP-CLI, the launcher's must-use plugin).
- `.github/workflows/sync-playground-release.yml` runs daily from `dev` (and by hand). When the sync changes something it runs `git diff --check`, the advisory check, the unit tests, the launcher build, `npm audit --audit-level=high` and the boot test. All of that runs in a `prepare` job with a read-only token, no stored git credentials and no cache. The job saves the update as a patch straight after the sync (which installs the new packages without their install scripts), and runs everything that executes new package code (tests, build, boot test) in a throwaway container from a pinned `node:24-bookworm` image. The container sees the working tree but not `.git`, the runner's action files or its tokens, so new package code cannot save Actions cache entries (which `deploy-site.yml` trusts) or change the patch or the artifact. A second job, with write access but no package code, applies the patch (refusing anything beyond `package.json`, `package-lock.json` and `src/App.jsx`), then opens or refreshes `automation/playground-<version>` into `dev` and closes any older Playground update PR, deleting its branch only when the bot both wrote and committed the newest commit. Pull requests from forks are left alone, even when they use the update's branch name. It does not reopen an update PR someone closed. Once someone else has pushed to the branch, or amended or rebased the bot's commit, it leaves the branch and the PR text alone, and it stops rather than push when it cannot read the branch. The PR text opens with the next step: merge into `dev`, check the previews, then ask Lex before releasing to `main`, which needs his approval every time.
- `.github/workflows/security-checks.yml` runs daily, on each push to `dev` and by hand: `npm audit --audit-level=high`, the Playground advisory check, and (not on pushes, because Dependabot alerts describe `main`) open high or critical Dependabot alerts.
- `scripts/playground-release-workflows.test.mjs` keeps both workflows honest (the checks run before the PR opens, the PR targets `dev`, nothing deploys) and checks that every Playground package follows the Blueprints pin.

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Local, Node 24 | `npm test` | All pass | 214 pass, 0 fail | Test runner summary |
| Local, against npm and GitHub | `node scripts/sync-playground-release.mjs` (trial, reverted after) | Prepares 3.1.65 | "Prepared Playground 3.1.65 (from 3.1.64) as app 0.10.5."; every Playground pin, the lockfile and one changelog entry changed; `isomorphic-git` override kept | Script output and diff |
| Local, on the 3.1.65 trial | `node scripts/playground-boot-test.mjs` | WordPress boots with WP-CLI and the mu-plugin | "Playground 3.1.65 booted WordPress 7.1.5 on PHP 8.3.36; WP-CLI and the launcher's mu-plugin work." (18.6 s) | Script output |
| Local, on the 3.1.65 trial | `npm test`, `npm run build`, `npm audit --audit-level=high`, advisory check, `git diff --check` | All pass | 204 tests pass (the trial ran before the boot test and workflow test files existed), build ok, 0 vulnerabilities, no advisory, diff clean | Command output |
| Local, against GitHub | `node scripts/check-playground-advisories.mjs` on 3.1.64 | No advisory | "No published advisory covers the 12 Playground packages installed (3.1.64)." | Script output |
| Local | `npm audit` after the `isomorphic-git` override | 0 high | 0 vulnerabilities | npm output |
| Local, live host scripts | Rewrote the five hosted files that name `playground.wordpress.net/wp-cli.phar` | One link each, none left, valid JS | 1 link replaced in each of 5 files, none left, `node --check` passes | Script output |
| Local | `npm run build`, with and without `VITE_PLAYGROUND_ORIGIN` | The bundle names its own host's `wp-cli.phar` | `https://wp.techies.tools/wp-cli.phar`, or the preview host when set | `grep` of `dist` |
| Local, final workflow | `bash -n` on every `run:` script of `sync-playground-release.yml` | Valid shell | Passes | Command output |
| Local, final workflow | The "Open or refresh the update pull request" script, run against a local bare repository with a stand-in for `gh` that logs its calls and applies the script's own `jq` filters to fixture lists of pull requests, in twelve cases | No branch: push and create the PR. Branch with only the bot's commit: force-push and create; with its PR open, refresh the PR text. Branch with someone else's newest commit and an open PR: no push, no PR edit. Bot commit amended by someone else: same. A fork's open or closed PR with the update's branch name: ignored, so the bot pushes and opens its own PR. This repository's closed update PR: stop. Unreachable remote: stop. Older update PR whose branch has only the bot's commit: close it and delete the branch. Older update PR with someone else's commit: close it, keep the branch. Older `automation/playground-` PR from a fork: leave it | No branch: exit 0, branch created, `gh pr create`. Bot commit: exit 0, branch replaced, `gh pr create`; with its PR open, `gh pr edit 7`. Someone else's commit: exit 0, branch unchanged, no `gh pr create` or `gh pr edit`, notice printed. Amended bot commit: exit 0, branch unchanged, no create or edit, notice names the bot as author and the other person as committer. Fork PR with the same name, open or closed: exit 0, branch pushed, `gh pr create`, no edit of the fork's PR. Own closed PR: exit 0, nothing pushed, "(#23) was closed; it is not opened again". Unreachable: exit 1, "Could not read … (git ls-remote exit 128)", nothing pushed. Older bot PR: `gh pr close 9 --delete-branch`. Older PR with someone else's commit: `gh pr close 9` with "The branch is kept…", no `--delete-branch`. Fork PR: no close call. The rendered PR text opens with the next step and Lex's approval rule | Trial output and `gh` call log |
| Not run | The container step itself | | Docker is not installed on the build machine; the first workflow run is its first real run. The tests and build use no git, so hiding `.git` does not affect them | `grep` of the test files |
| Local browser (Chromium through T3), launcher built with `VITE_PLAYGROUND_ORIGIN=http://127.0.0.1:8787`, served on `127.0.0.1:4173`. Stand-in host on `127.0.0.1:8787` serving `wp.techies.tools` with the host build's WP-CLI rewrite and its `/wp-cli.phar` `_headers` rule applied (neither is live yet) | Launch WordPress "Latest stable" (7.1.5), PHP 8.3, "Save playground in browser" on, "Load WP-CLI" on, open after launch: Plugins | WordPress boots; `wp-cli.phar` comes from the Playground host; nothing from `playground.wordpress.net` | Playground 3.1.64 (the launcher's pin and the live host's build). WordPress 7.1.5 booted and opened the Plugins screen. The rewritten client and service worker loaded (one link rewritten in each). Of the page's 21 resource entries, the only `wp-cli.phar` requests went to `http://127.0.0.1:8787/wp-cli.phar`, and none went to `playground.wordpress.net`. The page showed no error. The browser console was not captured in this run. An earlier try without the `_headers` rule failed at blueprint step 5 with a CORS error, which confirms that the rule is needed (`prepare-playground-host.test.mjs` checks it) | Stand-in log, page resource list, screenshots |
| Local, PAT | Dependabot alerts API | Readable | 403 (the local token has no Dependabot scope); CI uses the workflow token or `DEPENDABOT_ALERTS_TOKEN` | API answer |

## Result

The sync prepares a full, verified Playground update in one PR, and the security checks cover the three sources the card asks for. WP-CLI now comes from our own host. The workflows only start once this change reaches `main`, because GitHub runs scheduled workflows from the default branch.

## Disposition and rationale

Kept. It closes the gap that let 3.1.65 go unnoticed and keeps Lex's rule: a passing update reaches the previews only, never `main`, without his approval.

## Documentation impact

- `docs/testing.md`: the new test files and the two workflows.
- `docs/architecture.md`: Build and delivery (Playground sync, security checks, WP-CLI from the host, the `isomorphic-git` override).
- `docs/agents/kitchen-extras.md`: Playground sync and security checks under Other.
- No version bump or changelog entry: nothing visible changes.

## Follow-ups and open questions

- The security checks are not yet a step of the `test` job in `deploy-site.yml`, because open PRs #43 and #44 change that file; add them there once those land.
- Whether the workflow token may read Dependabot alerts is unverified. If the first run fails with the clear message, add the repository secret `DEPENDABOT_ALERTS_TOKEN` (fine-grained, "Dependabot alerts: read").
- After the merge into `dev`, launch a site with "Load WP-CLI" on through `preview-play.techies.tools` and confirm that `wp-cli.phar` comes from `preview-wp.techies.tools`, not `playground.wordpress.net`. This belongs to the preview check that already comes before any release to `main`.
- `deploy-site.yml` hands the Playground build from the `playground-build` job to the `playground-host` job through the Actions cache, under a key anyone can predict. The sync no longer lets new package code near the cache, but passing the build as an artifact of the same run would remove the risk at its source. That file is left alone here because open PRs #43 and #44 change it.
- The first update PR (3.1.65) opens on the first scheduled run after this change is released to `main`.
- A WordPress sync PR and a Playground sync PR open at the same time both bump the app version and changelog, so the second to merge needs a small rebase.
