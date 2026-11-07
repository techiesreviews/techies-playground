# Two more agent guards: briefs from `kit brief`, no turn end while a kit job runs

- Date: 2026-10-31
- Owner: ke-84, Claude Opus 5.5 (kitchen-everywhere ticket 84 in native-site-editor)
- Status: complete
- Disposition: kept
- Related version: unreleased tooling; application unchanged
- Related commit/issue: branch `kit/init-pieces`, made by `kit init --all` at Agent Kit ed29ab6 (agent-kit PR #14); the hooks' scripts as of Agent Kit 44e1a35 (PR #16), which writes the same entries

## Context

Delegated agents kept ending their turn while their own long job still ran, and leads retyped long briefs by hand and dropped rules from them. The shared Agent Kit moved both into tools: `kit brief` writes a child's brief, and `kit go` starts a long job and waits for it. Two hooks back them up, and `kit init --all` brings their entries to every project.

## Hypothesis and success criteria

With the entries, a Claude session in this repo cannot hand a coding brief to a child agent unless `kit brief` wrote it (or it starts with `kit-brief: none (<reason>)`), and cannot end its turn while a `kit go` job of its worktree runs. Success: the hook entries match what `kit init` writes, the hooks' own tests pass in the kit, and the application and its checks are unchanged.

## Options considered

- Leave unchanged: the rules stay only in briefs and docs, which agents skipped this week.
- The two hook entries (chosen): the same launcher as the other guards; each can be left out with `init.skip` in `scripts/agents/kit.json`.

## Implementation or prototype

`.claude/settings.json` gets `brief-guard` (PreToolUse on `mcp__t3-code__delegate_task|Agent|Task`) and `stop-guard` (Stop); `.codex/hooks.json` gets `stop-guard` (Codex's PreToolUse sees only Bash). Both run the kit's `hooks/run.sh` through `scripts/agents/hooks/run.sh`. On a machine without the kit they never block, but a Claude Code session there now sees the launcher's "Agent Kit not found: guards are off" warning at the end of every turn, and twice on an Agent call (agent-cap and brief-guard both warn). The kit at ed29ab6 wrote these entries; 44e1a35 (agent-kit PR #16, which lets a project without ticket files write briefs with `kit brief --task`, and stops agent-cap holding a slot for a refused brief) writes the same entries and is the kit the hooks run now. The application is untouched.

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Agent Kit 44e1a35 | `npm test` in agent-kit (tests/agent-hooks-factory.test.ts and tests/kit-init.test.ts) | brief-guard refuses an unmarked brief and allows a marked one; stop-guard refuses while a kit go job runs and gives way past its time limit, after six refusals or with `KIT_ALLOW_STOP=1`; kit init writes these entries | 1496 passed, 0 failed | agent-kit PR #16 |
| This repo, branch `kit/init-pieces` | `scripts/agents/kit pr` (full tier: `checks.test`, `npm test`) | the repo's tests pass | `unit: ok` | this PR's kit pr log |

## Result

The guards are in place for agent sessions; the application and its tests are unchanged. Without the kit, a Claude Code session sees the "guards are off" warning more often (above).

## Disposition and rationale

Kept: the rules live in one place (the kit), and every project gets the same guards.

## Documentation impact

This record. The kit's rulebook (`docs/kitchen.md` in Agent Kit) and README describe the hooks.

## Follow-ups and open questions

- None.
