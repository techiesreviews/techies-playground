# Project-local Agent Kit integration

- Date: 2026-10-17
- Owner: Codex grunt, gpt-6.1-sol/high, subscription
- Status: complete
- Disposition: kept
- Related version: unreleased tooling; application remains 0.8.2
- Related commit/issue: working-tree integration for the Playground launch investigation

## Context

The repository lacked `scripts/agents/kit` and its project instructions. Lex's coding workflow requires that integration for implementation, diagnosis, tests and reviews. The current launch investigation also needs a clear separation between local Node checks and real Playground browser evidence.

## Hypothesis and success criteria

A small project-local adapter can provide honest prerequisite checks, run the existing Node tests and build, and retain canonical wait/review behavior without importing editor fixtures or adding dependencies. Success requires doctor to pass, all existing Node tests and the production build to pass through the kit, unsupported browser requests to fail explicitly, and the review invocation to retain its required model and read-only execution.

## Options considered

- Leave unchanged: fails the required coding workflow and provides no project-specific validation front door.
- Copy the complete native-site-editor kit: imports commands, fixtures, ports and budgets that do not describe this application.
- Retain the compatible canonical dispatcher/helpers/wait/review and add a minimal local doctor/specs/build adapter: selected.

## Implementation or prototype

Added `scripts/agents/kit`, supporting canonical utilities and `kit.d/{build,doctor,review,specs,version,wait}`. `project-kit.mjs` checks this repository and runs existing Node test files. Review uses `origin/main`, pins Codex gpt-6.1-sol/medium and retains read-only mode. Added [Agent Kit instructions](../agents/agent-scripts.md) with exact upstream provenance and limitations. Ignored `.scratch/` development evidence. No application source, dependencies, package versions or deployment configuration changed.

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Local Linux; shell Node v22.22.1; kit selects existing v24.21.0 | `scripts/agents/kit --help`; `kit doctor/specs/build/review/wait/version --help` individually | Relevant commands load without missing imports | All help commands exited 0 | Executed command output; doctor also starts each advertised command's help |
| Same | `scripts/agents/kit doctor` | Project prerequisites agree | Exit 0; version 0.8.2; 11 installed direct dependencies match lock; 35 tracked source files checked; six command helps load | `RESULT: ok doctor 0 failed checks` |
| Same | `scripts/agents/kit specs` | Existing Node tests pass | Exit 0; 14 files, 63 tests, 63 passed, 0 failed | `.scratch/kit-specs/run-2026-10-17T20-37-01-392Z-3229576/run.log`; `RESULT: ok specs 14 Node test files; browser behavior not tested; log .../run.log` |
| Same | `scripts/agents/kit specs --list` | List only; no tests execute | Exit 0; 14 files listed | `RESULT: ok specs list 14 Node test files; no tests run` |
| Same | `scripts/agents/kit specs --browser` | Unsupported browser mode fails truthfully | Exit 2; explicit unsupported-option message | `RESULT: fail specs: unsupported specs option; browser specs and --affected are not integrated` |
| Same | `scripts/agents/kit build` | Production build passes without publishing | Exit 0; Vite 7.3.6 transformed 591 modules and built successfully | `RESULT: ok build finished`; existing upstream fs/path/worker_threads externalization and >500 kB chunk warnings remain |
| Same | Start owned `sleep 0.1`, then `scripts/agents/kit wait pid "$kit_wait_pid" --timeout 5s` | Wait for the owned child to finish | Exit 0; child reaped by its shell | `RESULT: ok pid 3230654 not running` |
| Same; source-derived invocation assertions | Import `parseAgentArgs`/`codexAdapter` and assert explicit review arguments | Codex gpt-6.1-sol, medium, read-only | Assertions passed | Executed assertion output: `Pinned review invocation: codex / gpt-6.1-sol / medium / read-only`; no model review invoked |
| Same | `git diff --check` | No whitespace errors in tracked changes | Exit 0 | Executed command output |

## Result

The kit runs the current local checks and makes their evidence boundaries explicit. Node tests and build pass. The browser request rejection is an expected negative check. A model review was not run because the task has no immutable commit and committing is outside this work's scope. Source/invocation inspection verifies the configured review permissions; it is not an independent review result.

## Disposition and rationale

Kept. The integration meets the required workflow with no application behavior change or new dependencies. It does not certify the upstream Playground runtime or resolve the reported browser error.

## Documentation impact

Added the project Agent Kit instructions and this record. The lead maintains the documentation indexes and current-state testing/architecture references alongside the separate launch investigation. Changelog/version changes are reserved for a deployment; none was requested here.

## Follow-ups and open questions

- Browser specs and screenshots remain unintegrated. Record real T3 browser evidence separately in the launch investigation.
- Run `kit review` on the eventual immutable task commit when such a commit is authorized.
