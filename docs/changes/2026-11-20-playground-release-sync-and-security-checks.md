# Playground release sync and security checks

- Date: 2026-11-20
- Owner: Claude Opus 5.5 (fleet builder, TOOLS-237)
- Status: complete
- Disposition: kept
- Related version: unreleased (no visible change, no version bump)
- Related commit/issue: Orbit TOOLS-237; commits `c8767fc` to `4e86cc6` on `build/tools-237-playground-self-host-auto-update-with`

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
- `.github/workflows/sync-playground-release.yml` runs daily from `dev` (and by hand). When the sync changes something it runs the unit tests, the launcher build, `npm audit --audit-level=high`, the advisory check, the boot test and `git diff --check`, then opens or refreshes `automation/playground-<version>` into `dev` and closes any older Playground update PR. The PR text says that merging updates the previews only and that releasing to `main` needs Lex's approval every time.
- `.github/workflows/security-checks.yml` runs daily, on each push to `dev` and by hand: `npm audit --audit-level=high`, the Playground advisory check, and (not on pushes, because Dependabot alerts describe `main`) open high or critical Dependabot alerts.
- `scripts/playground-release-workflows.test.mjs` keeps both workflows honest (the checks run before the PR opens, the PR targets `dev`, nothing deploys) and checks that every Playground package follows the Blueprints pin.

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Local, Node 24 | `npm test` | All pass | 208 pass, 0 fail | Test runner summary |
| Local, against npm and GitHub | `node scripts/sync-playground-release.mjs` (trial, reverted after) | Prepares 3.1.65 | "Prepared Playground 3.1.65 (from 3.1.64) as app 0.10.5."; every Playground pin, the lockfile and one changelog entry changed; `isomorphic-git` override kept | Script output and diff |
| Local, on the 3.1.65 trial | `node scripts/playground-boot-test.mjs` | WordPress boots with WP-CLI and the mu-plugin | "Playground 3.1.65 booted WordPress 7.1.5 on PHP 8.3.36; WP-CLI and the launcher's mu-plugin work." (18.6 s) | Script output |
| Local, on the 3.1.65 trial | `npm test`, `npm run build`, `npm audit --audit-level=high`, advisory check, `git diff --check` | All pass | 204 tests pass, build ok, 0 vulnerabilities, no advisory, diff clean | Command output |
| Local, against GitHub | `node scripts/check-playground-advisories.mjs` on 3.1.64 | No advisory | "No published advisory covers the 12 Playground packages installed (3.1.64)." | Script output |
| Local | `npm audit` after the `isomorphic-git` override | 0 high | 0 vulnerabilities | npm output |
| Local, live host scripts | Rewrote the five hosted files that name `playground.wordpress.net/wp-cli.phar` | One link each, none left, valid JS | 1 link replaced in each of 5 files, none left, `node --check` passes | Script output |
| Local | `npm run build`, with and without `VITE_PLAYGROUND_ORIGIN` | The bundle names its own host's `wp-cli.phar` | `https://wp.techies.tools/wp-cli.phar`, or the preview host when set | `grep` of `dist` |
| Local | `bash -n` on each workflow `run:` script; PR body rendered; `jq` close filter | Valid shell; readable body; only older Playground PRs closed | As expected | Command output |
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
- The first update PR (3.1.65) opens on the first scheduled run after this change is released to `main`.
- A WordPress sync PR and a Playground sync PR open at the same time both bump the app version and changelog, so the second to merge needs a small rebase.
