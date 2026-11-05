# "Messages to Lex" section in AGENTS.md (kit init)

- Date: 2026-11-05
- Owner: fleet-lead rollout, Claude Sonnet 5.5
- Status: complete
- Disposition: kept
- Related version: unreleased tooling; application unchanged
- Related commit/issue: Agent Kit c96dd9a (the kit release that brought the rule), added here by `kit init --pieces`

## Context

Lex is not technical and asked for one short rule for every message to him: the question or what he must do first, a recommendation when it fits, short plain bullets, and no internal process (review rounds, waivers, SHAs, file paths) unless he must act on it. The shared Agent Kit now keeps that rule in its rulebook and `kit init` copies it into every project's `AGENTS.md`.

## Hypothesis and success criteria

With the section in `AGENTS.md`, every agent working here reads the rule at the start of a session. Success: `scripts/agents/kit init --check` reports nothing missing for the section, and `npm test` passes.

## Options considered

- Leave unchanged: only agents that read the kit's briefs would see the rule.
- Add the marked section (chosen): it is the kit's own copy, versioned, and `kit init` brings it up to date when the kit's rule changes.

## Implementation or prototype

`kit init --pieces` added a `## Messages to Lex` section to `AGENTS.md`, between `<!-- messages-to-lex:start v1 -->` and `<!-- messages-to-lex:end -->` markers. The text comes from the kit's `docs/kitchen.md`; change it there, not here.

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Linux, worktree of `origin/dev` | `scripts/agents/kit init --check` | nothing missing for the section | passed after the change | command output, 2026-11-05 |
| Linux, worktree with the main checkout's dependencies | `kit pr` runs `npm test` | pass | `unit: ok` | `kit pr` log, 2026-11-05 |

## Result

The section is in; no code, tests or application file changed.

## Disposition and rationale

Kept: it is the shared kit's setup for every project.

## Documentation impact

`docs/agents/agent-scripts.md` names the section among the pieces `kit init` writes; this record is in the index (`docs/changes/README.md`).

## Follow-ups and open questions

- None.
