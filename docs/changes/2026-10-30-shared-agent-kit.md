# Move to the shared Agent Kit

- Date: 2026-10-30
- Owner: ke-41, Claude Opus 5.5 (kitchen-everywhere ticket 41 in native-site-editor)
- Status: in-progress
- Disposition: pending
- Related version: unreleased tooling; application remains 0.8.3
- Related commit/issue: branch `build/ke-41-shared-kit` from `origin/main` `57362b4`; supersedes the tooling of [2026-10-17-agent-kit-integration.md](2026-10-17-agent-kit-integration.md)

## Context

Since 2026-10-17 the repository carried its own copy of the Agent Kit under `scripts/agents/` (dispatcher, helpers, `kit.d/`, `project-kit.mjs`, a Sol-pinned review and `kit-wait.test.mjs`). Lex's projects now share one kit, kept in its own repository and updated on the machine, so fixes reach every project at once. `npm test` (`node --test`) searched the whole repository and ran the copy's own `kit-wait.test.mjs` with the app's tests.

## Hypothesis and success criteria

Replacing the copy with the shared kit's launcher and a settings file keeps every agent check working and changes nothing users of play.techies.tools see. Success: `kit doctor` passes; `kit unit` runs the app tests the old `kit specs` ran, all green; `kit build` works; `npm test` lists no kit file; the production build is byte-identical to `main`'s.

## Options considered

- Leave the copy: it drifts from the shared kit and keeps the Sol pin that Lex retired on 2026-10-26.
- Light setup (launcher and hooks only): loses the maps folder, the rulebook extras and the own `build` command this project uses.
- Full setup with `kit init --land main` (chosen).

## Implementation or prototype

Removed the copy (`agent-run.mjs`, `ci-summary.mjs`, `kit`, `kit-lib.*`, `kit-wait.test.mjs`, `kit.d/`, `project-kit.mjs`, `review-brief.mjs`, `sol-run.mjs`); its CI-wait fix is in the shared kit. `kit build` moved unchanged to `scripts/agents/project.d/build`. `kit init --land main` wrote the launcher, the hook launcher, `.claude/settings.json`, `.codex/hooks.json`, `docs/agents/kitchen.md`, `docs/agents/kitchen-extras.md`, `docs/wayfinder/README.md` and two `AGENTS.md` lines. `scripts/agents/kit.json` sets `checks.test` `npm test`; doctor lines for Node 22.12 or newer, the package name, `package.json` agreeing with `package-lock.json`, the installed direct dependencies matching the lockfile, and no file that `node --test` would run outside `src/**/*.test.js` and `scripts/*.test.mjs` (it searches every folder but `node_modules` and dot-folders, ignored ones such as `dist/` included, so `npm test` can never pick up a kit file); and `unit.run` `node --test` over `src/**/*.test.js` and `scripts/*.test.mjs`. The deploy rule moved from `AGENTS.md` to the extras' Release section, with one addition (see Follow-ups): a change users cannot see lands without a changelog entry or version bump. No application source, dependency, version, workflow or Cloudflare setting changed.

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Local Linux, Node v24.21.0, worktree at the branch | `scripts/agents/kit doctor` | Kit and project checks pass | 16 of 16 checks passed | `RESULT: ok doctor 16/16 checks passed` |
| Same | `kit doctor` with `node_modules/vite/package.json` moved away; with another package name | Each project line fails and says why | Failed with `vite is not installed; run npm ci` and `package name is x` | Executed output; files restored |
| Same | A one-test file at `.scratch/x.test.mjs`, `dist/x.test.js`, `src/lib/test-x.js` and `scripts/agents/x_test.cjs` in turn; the `npm test` file-list command below and `kit doctor` for each | Doctor fails exactly when `npm test` runs the stray file | `.scratch/`: `npm test` skips it, doctor passes 16/16; the other three: `npm test` runs it and doctor fails naming it | Executed output; files removed |
| Same | `echo '{}' \| XDG_DATA_HOME=<empty> XDG_CACHE_HOME=<empty> KIT_REPO=/nonexistent bash scripts/agents/hooks/run.sh session-env`, then `… bash-guard`; then the doctor's `git stash push -m probe` PreToolUse input with the machine kit | Without a kit the hooks warn and let work go on; with it the guard runs | Exit 0 with `Agent Kit not found: guards are off; run \`scripts/agents/kit doctor\`` (plain, then as `{"systemMessage":…}`); with the kit: `commit work in progress on your own branch`, exit 2 | Executed output |
| Same | Append a comment to `src/lib/vault.js`, `scripts/agents/kit unit --affected --list`, restore | The tests a change reaches | `src/lib/vault.test.js` (imports it) and `src/lib/package-upload.test.js` (through `package-upload.js`) | `RESULT: ok unit 2 selected (list only)` |
| Same | `scripts/agents/kit rulebook` | Shared rulebook, then the extras | Exit 0; `# Kitchen extras: techies-playground` and its `## Release` follow the shared text | `RESULT: ok rulebook shared and docs/agents/kitchen-extras.md` |
| Same | `scripts/agents/kit unit` | The app tests the old `kit specs` ran, all green | 14 files, 63 of 63 passed | `RESULT: ok unit 63/63 (14 files)` |
| Detached worktree at `origin/main` | old `scripts/agents/kit specs` | Baseline | 15 files, 65 of 65 passed: the same 14 files plus `kit-wait.test.mjs` (2 tests) | `RESULT: ok specs 15 Node test files` |
| Worktree at the branch | `scripts/agents/kit build` | Build without deploy | Vite build passed | `RESULT: ok build finished` |
| Both | `npm test --silent -- --test-reporter='data:text/javascript,export default async function*(s){const f=new Set;for await(const e of s){const p=e.data?.file;if(p&&!f.has(p)){f.add(p);yield p.slice(process.cwd().length+1)+"\n"}}}' \| sort` | `npm test` runs no kit file | Branch: the 14 app files, `scripts/sync-wordpress-release.test.mjs` and the 13 under `src/lib/`; `origin/main`: those 14 plus `scripts/agents/kit-wait.test.mjs` | Executed output (the `origin/main` run used an equivalent reporter file); the kit itself lives outside the repository |
| Both | `npm run build`, then a SHA-256 list of every file in `dist/` | Same site | 8 files, identical lists | `cmp` of the two lists |

## Result

The shared kit runs every check the copy ran: its own doctor covers the place, the base, conflict markers in tracked files and every command's help; the project's doctor lines cover Node, the package name, the lockfile and the installed direct dependencies. The old `kit wait` and `kit version` come from the shared kit; the Sol-pinned `kit review` became the shared Claude review. `npm test` no longer picks up kit tests. The deploy that follows the merge is expected to publish the same `dist/` and the same `worker.js`, so the live site should not change; the post-merge check below confirms it.

## Disposition and rationale

Pending until the post-merge check; expected `kept`: one kit for all projects, no visible change.

## Documentation impact

`AGENTS.md` (deploy rule moved, kit pointers), `docs/agents/agent-scripts.md` (rewritten), `docs/agents/kitchen-extras.md` and `docs/agents/kitchen.md` (new), `docs/testing.md` (63 tests in 14 files; `kit unit`), `docs/wayfinder/README.md` (new), this record and the index. No changelog entry or version bump: nothing users see changed.

## Follow-ups and open questions

- Status stays in-progress until after the merge: the deploy run for the merge commit on `main` (the only CI here; no workflow runs on pull requests) and a live check of <https://play.techies.tools> (same asset names as before); then this record becomes complete and kept in a follow-up record.
- For Lex's next Tuesday pack (an easy-to-undo decision taken with its recommended answer): the old rule asked for a changelog entry and version bump before every push to `main`. The Release section now lets a change users cannot see (agent setup, docs, tests) land without one, since its deploy rebuilds the same site; this move is the first such change. Reversing it means bumping the version for tooling changes again.
