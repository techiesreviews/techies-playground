# Two more agent guards: briefs from `kit brief`, no turn end while a kit job runs

- Date: 2026-10-31
- Owner: ke-84, Claude Opus 5.5 (kitchen-everywhere ticket 84 in native-site-editor)
- Status: complete
- Disposition: kept
- Related version: unreleased tooling; application unchanged
- Related commit/issue: branch `kit/init-pieces`, made by `kit init --all` (Agent Kit ed29ab6; agent-kit PRs #14 and #16)

## Context

Delegated agents kept ending their turn while their own long job still ran, and leads retyped long briefs by hand and dropped rules from them. The shared Agent Kit moved both into tools: `kit brief` writes a child's brief, and `kit go` starts a long job and waits for it. Two hooks back them up, and `kit init --all` brings their entries to every project.

## Hypothesis and success criteria

With the entries, a Claude session in this repo cannot hand a coding brief to a child agent unless `kit brief` wrote it (or it starts with `kit-brief: none (<reason>)`), and cannot end its turn while a `kit go` job of its worktree runs. Success: the hook entries match what `kit init` writes, the hooks' own tests pass in the kit, and nothing changes for a person working here.

## Options considered

- Leave unchanged: the rules stay only in briefs and docs, which agents skipped this week.
- The two hook entries (chosen): the same launcher as the other guards; each can be left out with `init.skip` in `scripts/agents/kit.json`.

## Implementation or prototype

`.claude/settings.json` gets `brief-guard` (PreToolUse on `mcp__t3-code__delegate_task|Agent|Task`) and `stop-guard` (Stop); `.codex/hooks.json` gets `stop-guard` (Codex's PreToolUse sees only Bash). Both run the kit's `hooks/run.sh` through `scripts/agents/hooks/run.sh`; on a machine without the kit they print the usual "guards are off" warning and never block. The application is untouched.

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Agent Kit 44e1a35 | `npm test` in agent-kit (tests/agent-hooks-factory.test.ts and tests/kit-init.test.ts) | brief-guard refuses an unmarked brief and allows a marked one; stop-guard refuses while a kit go job runs and gives way past its time limit, after six refusals or with `KIT_ALLOW_STOP=1`; kit init writes these entries | 1496 passed, 0 failed | agent-kit PR #16 |
| This repo | `kit pr` checks on branch `kit/init-pieces` | the repo's own checks pass | see the PR's RESULT lines | this PR |

## Result

The guards are in place for agent sessions; people's own work in the repo is unchanged.

## Disposition and rationale

Kept: the rules live in one place (the kit), and every project gets the same guards.

## Documentation impact

This record. The kit's rulebook (`docs/kitchen.md` in Agent Kit) and README describe the hooks.

## Follow-ups and open questions

- None.
