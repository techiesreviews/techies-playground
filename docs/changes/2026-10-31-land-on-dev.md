# Changes land on `dev`; `main` only takes `dev`

- Date: 2026-10-31
- Owner: agent ke-90 (kitchen tickets 89 and 90)
- Status: in-progress
- Disposition: pending
- Related version: unreleased (no user-visible change)
- Related commit/issue: kitchen ticket 90, "Fresh start" (native-site-editor `docs/wayfinder/kitchen-everywhere/build/tickets/90-fresh-start-branches.md`)

## Context

Every change, agent work and the daily WordPress sync alike, landed straight on `main`, and every push to `main` deploys https://play.techies.tools. Lex decided (2026-10-31) that every project works like the Native Site Editor: "a branch can go into dev, main can only get dev".

## Hypothesis and success criteria

Work lands on `dev` and reaches the live site only through a release of `dev` to `main`. Success: `scripts/agents/kit.json` names `dev` and `main`, `origin` has `dev`, the WordPress sync opens its PRs against `dev`, and the docs say the same.

## Options considered

- Leave `main` as the landing branch: refused by Lex's rule.
- Keep the WordPress sync on `main` as an exception: it would put version bumps and changelog entries on `main` that `dev` lacks, so the next release would start behind `main`.

## Implementation or prototype

- `scripts/agents/kit.json`: `branches.land` `dev`, `branches.release` `main`; a `checks.doctor` line fails when `origin` has no `dev` (or cannot be reached) and says so.
- `.github/workflows/sync-wordpress-release.yml` checks out `dev`, opens its PR against `dev`, and only reuses an open PR whose base is `dev`. GitHub runs scheduled workflows from the copy on the default branch (`main`), so until this change is released to `main` the daily sync still checks out `main` and opens its PRs against `main`. No `automation/wordpress-*` PR was open when this change was made.
- `README.md` says a merged sync PR lands on `dev` and goes live with the next release.
- `AGENTS.md`, `CONTEXT.md` (diagram and invariant 10), `docs/testing.md`, `docs/agents/agent-scripts.md` and `docs/agents/kitchen-extras.md` (its "After a merge" section is now "After a release") describe landing on `dev` and `scripts/agents/kit pr --release --base main`.
- `dev` was created on `origin` from `main` (`a144b51`) before this change.

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Local worktree | `scripts/agents/kit doctor` | `origin has dev`, doctor passes | `origin has dev`; `RESULT: ok doctor 17/17 checks passed` (3 setup warnings for hook entries a newer kit added, outside this change) | doctor output |
| Scratch repository whose `origin` is a local bare repository with only `main`, then with `dev` added | the `checks.doctor` `dev` line from `scripts/agents/kit.json`, run with `bash -c` | fails and names the cause; passes once `dev` exists | without `dev`: "origin has no dev branch (or is unreachable); create it from main", exit 1; with `dev`: "origin has dev", exit 0 | command output |
| Local worktree | `scripts/agents/kit pr --help` | `--release` needs `--base` the release branch | "`--release needs --base branches.release and first runs kit release-check --land`" | help text |

## Result

By source inspection and the kit's settings, `scripts/agents/kit pr` lands this project's PRs on `dev`, and nothing deploys until `dev` is released to `main`. The landing PR, the release and the first sync run against `dev` are the executed evidence; they are listed under Follow-ups until they have run.

## Disposition and rationale

Pending until the release's deploy run on `main`; the intent is to keep it, as it is Lex's rule for every project.

## Documentation impact

The records `2026-10-31-line-endings.md` and `2026-10-30-shared-agent-kit.md` wait for a deploy "after the merge"; under this change that deploy follows the next release of `dev` to `main`.

## Follow-ups and open questions

- The PR that lands this change on `dev` through `scripts/agents/kit pr` is the first executed evidence that the kit lands on `dev`.
- The release of `dev` to `main` (`scripts/agents/kit pr --release --base main`), `scripts/agents/kit release-check`, and the deploy run on `main` after it are this change's CI result; set Status to `complete` and Disposition to `kept` once that run is green.
- Untested until the release: the daily WordPress sync keeps targeting `main` until then. After it, run `sync-wordpress-release.yml` by `workflow_dispatch` and record either that it checked out `dev` and reported no change, or that the PR it opened has base `dev` (`gh pr view <n> --json baseRefName`).
