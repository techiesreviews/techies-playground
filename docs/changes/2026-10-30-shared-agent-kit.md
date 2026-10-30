# Move to the shared Agent Kit

- Date: 2026-10-30
- Owner: ke-41, Claude Opus 5.5 (kitchen-everywhere ticket 41 in native-site-editor)
- Status: complete
- Disposition: kept
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

Removed the copy (`agent-run.mjs`, `ci-summary.mjs`, `kit`, `kit-lib.*`, `kit-wait.test.mjs`, `kit.d/`, `project-kit.mjs`, `review-brief.mjs`, `sol-run.mjs`); its CI-wait fix is in the shared kit. `kit build` moved unchanged to `scripts/agents/project.d/build`. `kit init --land main` wrote the launcher, the hook launcher, `.claude/settings.json`, `.codex/hooks.json`, `docs/agents/kitchen.md`, `docs/agents/kitchen-extras.md`, `docs/wayfinder/README.md` and two `AGENTS.md` lines. `scripts/agents/kit.json` sets `checks.test` `npm test`, doctor lines for Node 22.12 or newer, the package name and the lockfile, and `unit.run` `node --test` over `src/**/*.test.js` and `scripts/*.test.mjs`. The deploy rule moved from `AGENTS.md` to the extras' Release section. No application source, dependency, version, workflow or Cloudflare setting changed.

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Local Linux, Node v24.21.0, worktree at the branch | `scripts/agents/kit doctor` | Kit and project checks pass | 14 of 14 checks passed | `RESULT: ok doctor 14/14 checks passed` |
| Same | `scripts/agents/kit unit` | The app tests the old `kit specs` ran, all green | 14 files, 63 of 63 passed | `RESULT: ok unit 63/63 (14 files)` |
| Detached worktree at `origin/main` | old `scripts/agents/kit specs` | Baseline | 15 files, 65 of 65 passed: the same 14 files plus `kit-wait.test.mjs` (2 tests) | `RESULT: ok specs 15 Node test files` |
| Worktree at the branch | `scripts/agents/kit build` | Build without deploy | Vite build passed | `RESULT: ok build finished` |
| Both | `npm test -- --test-reporter=<a reporter printing each file>` | `npm test` runs no kit file | Branch: the 14 app files; `origin/main`: those 14 plus `scripts/agents/kit-wait.test.mjs` | Executed output; the kit itself lives outside the repository |
| Both | `npm run build`, then a SHA-256 list of every file in `dist/` | Same site | 8 files, identical lists | `cmp` of the two lists |

## Result

The shared kit runs every check the copy ran; `npm test` no longer picks up kit tests. The deploy that follows the merge rebuilds the same `dist/` and the same `worker.js`, so the live site does not change.

## Disposition and rationale

Kept: one kit for all projects, no visible change.

## Documentation impact

`AGENTS.md` (deploy rule moved, kit pointers), `docs/agents/agent-scripts.md` (rewritten), `docs/agents/kitchen-extras.md` and `docs/agents/kitchen.md` (new), `docs/testing.md` (63 tests in 14 files; `kit unit`), `docs/wayfinder/README.md` (new), this record and the index. No changelog entry or version bump: nothing users see changed.

## Follow-ups and open questions

- None.
