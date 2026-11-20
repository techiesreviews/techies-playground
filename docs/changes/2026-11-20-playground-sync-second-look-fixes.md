# Playground sync: fixes from the second look

- Date: 2026-11-20
- Owner: Claude Opus 5.5 (fleet reviewer, TOOLS-237 second look)
- Status: complete
- Disposition: kept
- Related version: unreleased (no visible change, no version bump)
- Related commit/issue: Orbit TOOLS-237; supersedes parts of [the Playground release sync record](2026-11-20-playground-release-sync-and-security-checks.md); branch `fix/tools-237-gpt-look-findings`

## Context

A GPT second look at the merged Playground release sync (PR #45) found two problems, and running `kit doctor` on `dev` found a third:

1. The update PR's push was a plain force-push. A fix someone pushed to the update branch between the run's check and its push would be overwritten.
2. The advisory check listed only the Playground packages in the lockfile. The self-hosted Playground also ships packages the launcher never installs: the client and remote bundles, `@php-wasm/web` and one PHP build per PHP version. An advisory against one of those was never asked about.
3. `scripts/playground-boot-test.mjs` ends in `-test.mjs`, so a bare `node --test` picks it up and would start a full Playground boot. `kit doctor` fails on that.

## Hypothesis and success criteria

- A push over a branch that changed after the check fails, with a clear message, and changes nothing.
- The advisory check asks about every package the host ships, at the version the host is built from.
- `kit doctor` passes on `dev`.

## Options considered

- **Host packages read from npm at run time** (follow the dependencies of `@wp-playground/remote` and `@php-wasm/web`). Always complete, but adds a network step and a new way to fail. Not chosen.
- **A fixed list in the script, tied to the launcher's PHP versions by a test.** Chosen: `@wp-playground/client` and `@wp-playground/remote` list no dependencies (they are bundles), and the Playground packages `@php-wasm/web` depends on at 3.1.64 are the PHP builds 5.2 and 7.4 to 8.5, `@php-wasm/fs-journal`, and packages the lockfile already has.

## Implementation or prototype

- `.github/workflows/sync-playground-release.yml`: the push uses `--force-with-lease` on the branch tip it checked (empty when the branch did not exist, so the push fails if someone created it meanwhile). A refused push prints an `::error::` line and stops the job.
- `scripts/check-playground-advisories.mjs`: `HOST_PACKAGES` names the host's packages; `listCheckedPackages` adds them to the lockfile's packages at the `@wp-playground/blueprints` pin, which is the version `deploy-site.yml` builds the host from.
- `scripts/playground-boot-test.mjs` and its test are renamed `playground-boot-check.mjs` and `playground-boot-check.test.mjs`; the workflow and the tests use the new name.

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Local, Node 24 | `npm test`, `scripts/agents/kit unit`, `scripts/agents/kit doctor`, `scripts/agents/kit build` | All pass | 215 tests pass, unit 215/215, doctor 17/17 (its test-file check passes only after the rename), build ok | Test runner and kit summaries |
| Local, Node 24 | `check-playground-advisories.test.mjs` | Host packages at the pin, even when the lockfile is older; a client advisory found that the lockfile alone misses; every launcher PHP version has its browser build checked | Pass | Test output |
| Local, against GitHub | `node scripts/check-playground-advisories.mjs` on 3.1.64 | No advisory; GitHub accepts the added names | "No published advisory covers the 24 Playground packages installed or served by the Playground host (3.1.64)." | Script output |
| Local, scratch bare repository | The workflow's `git push --force-with-lease="refs/heads/<branch>:<checked tip>"` in four cases: someone pushes a fix after the check; someone creates the branch after the check found none (empty lease); no branch; branch unchanged | Refused and branch unchanged in the first two; pushed in the last two | Fix after the check: exit 1, remote tip stays the fix. Branch created after the check: exit 1, remote tip stays the other person's commit. No branch: exit 0, branch created. Unchanged: exit 0, branch replaced | Script output |
| Not run | The whole "Open or refresh" step with the push in between | | Only the push line was run; the rest of the step is unchanged and covered by the earlier harness and the workflow text tests | — |

## Result

The three problems are closed. The update branch is never pushed over a commit the run did not check, the advisory check covers 24 packages instead of 12, and `kit doctor` passes.

## Disposition and rationale

Kept. Small fixes inside the existing design; nothing visible changes.

## Documentation impact

- `docs/architecture.md`: the safe push, the host packages, the new boot script name.
- `docs/testing.md`: the renamed test row, the boot script note, and the advisory and workflow test rows.
- No version bump or changelog entry: nothing visible changes.

## Follow-ups and open questions

- When a Playground release adds or drops a PHP build, `HOST_PACKAGES` needs the same change. The test catches a launcher PHP version without a build, not a new build the launcher does not offer yet.
- Closing an older update PR has the same short gap the push had: it checks the branch, then deletes it. GitHub can restore a deleted PR branch, so this is left as it is.
