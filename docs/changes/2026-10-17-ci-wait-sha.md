# Keep CI waits pinned to an explicit commit

- Date: 2026-10-17
- Owner: Codex
- Status: complete
- Disposition: kept
- Related version: 0.8.3 release tooling
- Related commit/issue: Follow-up to local release commit `e61ff0d`; immutable review evidence `.scratch/reviews/main/20261017T204912Z/result.md`.

## Context

The independent read-only review of the prepared release found a P2 correctness defect in the imported Agent Kit wait command. A cancelled CI run for an explicitly requested SHA A caused `kit wait ci --sha A` to follow a newer branch head B. If B was green, the command returned success even though A's deployment had been cancelled. This contradicts the deployment requirement that verification belong to the pushed commit.

The [Agent Kit integration record](2026-10-17-agent-kit-integration.md) records the original provenance and PID wait smoke check. This follow-up adds coverage for CI identity without rewriting that earlier outcome. The [release preparation](2026-10-17-release-0.8.3.md) remains separate from production verification.

## Hypothesis and success criteria

An explicit `--sha` must keep the requested commit as the verification target and report its cancelled run as failure. Branch and PR waits may retain the canonical behavior of following a newer head after cancellation. An integration regression must invoke the real kit command with a local fake `gh` executable: A is cancelled, B succeeds, and only the branch wait may return success for B.

## Options considered

- Leave unchanged: rejected because a successful wait could certify a different commit.
- Disable head following for every CI wait: unnecessarily removes useful branch/PR behavior.
- Restrict cancelled-head following to waits without `--sha`: selected; preserves explicit commit identity with one condition change.

## Implementation or prototype

Updated the head-switch condition in `scripts/agents/kit.d/wait` to resolve a newer branch/PR head only when `options.sha` is absent. Explicit SHA cancellation follows the existing failure reporting path for its original run.

Added `scripts/agents/kit-wait.test.mjs`. Its temporary executable fixture supplies cancelled/successful GitHub CLI responses, records calls, and exercises the actual `kit wait ci` dispatcher and runner. The explicit SHA test checks the failure exit status, original cancellation output, absence of green/superseded output, and absence of CI queries for B. The branch test checks that cancellation can still lead to B's successful result. The fixture uses no network or credentials and removes its temporary directory in `finally`.

This is a local correction to the retained canonical wait command; upstream provenance is unchanged. Application source, versions, dependencies and deployment configuration are unchanged by this follow-up.

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Local Agent Kit, installed Node v24.21.0 | `scripts/agents/kit doctor` | Prerequisites agree before edits | Exit 0; 0 failed checks | `RESULT: ok doctor 0 failed checks` |
| Before fix; fake GitHub CLI only | `scripts/agents/kit specs scripts/agents/kit-wait.test.mjs` | New explicit SHA regression fails; branch control passes | Exit 1; 1 failed, 1 passed. SHA wait incorrectly returned exit 0 with `superseded by bbbbbbb` and `RESULT: ok ci aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa bbbbbbb green` | `.scratch/kit-specs/run-2026-10-17T20-50-18-848Z-3308699/run.log` |
| After fix; same fake GitHub CLI | `scripts/agents/kit specs scripts/agents/kit-wait.test.mjs` | Both CI identity behaviors pass | Exit 0; 2/2 passed | `.scratch/kit-specs/run-2026-10-17T20-50-31-919Z-3309232/run.log`; `RESULT: ok specs 1 Node test files; browser behavior not tested; log .../run.log` |
| After fix; full Node suite | `scripts/agents/kit specs` | Existing contracts and new CI regressions pass | Exit 0; 15 files, 65 tests, 65 passed, 0 failed | `.scratch/kit-specs/run-2026-10-17T20-50-34-904Z-3309459/run.log`; `RESULT: ok specs 15 Node test files; browser behavior not tested; log .../run.log` |
| Local Git | `git diff --check` | No whitespace errors | Exit 0 | Executed command output |

## Result

The same real-command mock reproduction fails before the fix and passes after it. A cancelled explicit SHA now fails for the requested commit, while branch waits retain the ability to follow a superseding green head. These are local integration tests, not observations of a real deployment.

## Disposition and rationale

Kept. The change restores commit identity for deployment verification while preserving branch/PR following behavior. The tests cover the externally observable command outcome rather than matching source text.

## Documentation impact

Added this correction record. The lead maintains current-state test documentation and indexes; earlier integration and release outcomes remain intact. No app changelog or version change is needed for this development-tooling correction within the pending 0.8.3 release.

## Follow-ups and open questions

- Lead: review the immutable follow-up commit before pushing and verify the real deployment against its exact SHA.
- No app build was rerun for this tooling-only change; the earlier release build evidence remains separate.
