# Private runner and free testers: go

- Date: 2026-11-23
- Owner: fleet-lead / gpt-6.1-sol
- Status: complete
- Disposition: kept
- Related version: 0.13.3 (no launcher change)
- Related commit/issue: TOOLS-411; parent TOOLS-404

## Context

The approved part-one experiment must prove unattended Playground startup and genuine
Query Monitor and free Code Profiler results on ubulex before adding any design,
paid builder, AI, credential or product-page integration. The launcher previously had
no unattended runner or private filesystem queue.

## Hypothesis and success criteria

A queued, fixed setup can run in a fresh headless browser without Lex's tab. Both free
testers must finish on `/` and save genuine measured data in private JSON and HTML.
Any incomplete stage must produce no-go rather than invented results.

## Options considered

- Leave the launcher unchanged and add an on-demand proof script: selected.
- Persistent user service: unnecessary for this bounded proof.
- Playground CLI: not used; the approved browser runtime was tested.
- Pro plugins, paid downloads or credentials: excluded by the lead.

## Implementation or prototype

`scripts/private-runner.mjs` implements a fixed queue, atomic claim, fresh sandboxed
headless Chromium context, browser Playground setup, six Query Monitor collector
observations and the free profiler's native admin action and artifact readback.
It writes `runs/<id>/report.json` and `report.html` beneath the user's private
`~/.local/share/techies-playground/` directory. There is no listener or background
service. Existing launcher code, browser storage, app version and deployment files
are unchanged. See [the runner contract](../private-runner.md).

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| ubulex, Linux x64, Node 24.22.2 | `kit doctor` before dependency setup | Detect missing worktree dependencies | Failed for missing `@heroicons/react`; `npm ci` under `kit go` restored the locked dependencies | Doctor output; `.scratch/kit-jobs/tools-411-deps/log` |
| Same | `kit deps add playwright@1.65.1 --dev --prefix . --lock-file .scratch/tools-411-deps.lock` under `kit go` | Install only repo-local dependencies | Passed; used already installed Chromium revision 1255 | `.scratch/kit-jobs/tools-411-playwright/log` |
| Same | `kit unit scripts/private-runner.test.mjs` before implementation | Fail first | Failed: module did not exist; after implementation 4/4 passed | `.scratch/unit/20261123T083839-487818.log`; `.scratch/unit/20261123T084005-488514.log` |
| Same | Add blocker-verdict regression assertion, then run focused kit tests | Fail before fix, then pass | 3/4 before fix (`go` instead of `no-go`); 4/4 after fix | `.scratch/unit/20261123T084449-492679.log`; `.scratch/unit/20261123T084526-493299.log` |
| Chromium 159.0.8154.6, sandbox enabled | First queued real attempt | Fresh boot | Harness timed out at 180 seconds; unnecessary cross-origin isolation headers removed | Private run `459277db-1957-42fd-a894-8133331b3690` |
| Fresh Chromium contexts | Next three real attempts | Completed native profile and artifact | Boot and six Query Monitor observations passed. The harness treated an asynchronous URL wait as completion too early; the native screen still said “Starting the profiler...”. No artifacts existed yet. Changed success wait to the actual native result chart | Private runs `6390f636-33ac-448b-994b-f98c99413982`, `31b3a32d-066f-4a95-bb74-a2b354a576f8`, `f49abf77-f572-4aa5-991d-779a07d83bcd` |
| WordPress 7.1.4, PHP 8.3.36, Query Monitor 4.1.1, free Code Profiler 1.9.6 | `node scripts/private-runner.mjs enqueue`, then `kit go tools-411-proof-5 -- node scripts/private-runner.mjs once` | Both genuine testers complete | `RESULT: ok private-runner go`; native profile ID `1795423573.3250`; actual plugin/theme attribution saved | Private run `15c95b28-1e8a-429d-b5dd-4605f218d880` |
| Same versions, another fresh context/site | Enqueue again, then `kit go tools-411-proof-repeat -- node scripts/private-runner.mjs once` | Repeat from fresh site | `RESULT: ok private-runner go`; both testers completed again | Private run `e7783448-cae4-41d6-88ac-94473c33157e` |
| Same worktree | `kit unit`; `kit build`; `kit doctor`; `git diff --check` | Existing app stays checked | 351/351 tests in 41 files; build passed with existing externalized-module/chunk-size warnings; doctor 17/17; diff check passed | `.scratch/unit/20261123T084338-491435.log`; kit output |

Private run evidence stays on ubulex under
`~/.local/share/techies-playground/runs/<id>/report.json` and `report.html`; it is
intentionally not committed or published. The completed native `.slugs.profile`
attribution is copied to the report only after the matching `.summary.profile` exists.
No profiling keys, cookies, nonces or rerun parameters are exported.

Done when 1: met — two final queued jobs were claimed by the on-demand script on ubulex; each booted a fresh sandboxed headless browser Playground without Lex's tab.

Done when 2: met — both final runs completed six Query Monitor collector observations and a genuine free Code Profiler profile with native plugin/theme attribution, saved in private JSON and HTML reports.

Done when 3: met — both final invocations printed `RESULT: ok private-runner go`; failed harness attempts retained explicit no-go reports instead of claiming missing data passed.

## Result

Go for this bounded browser/free-tester compatibility proof. In the first successful
run, Query Monitor warm PHP time was median 0.141 seconds (range 0.139–0.145), and
Code Profiler attributed time to Query Monitor, Code Profiler, the theme and the
measurement mu-plugin. These numbers include instrumentation overhead and are
Playground/WebAssembly/SQLite diagnostics, not production hosting rankings.

## Disposition and rationale

Kept as a separate, opt-in script and documented local contract. It changes no
launcher behavior and installs no service. Completed browser contexts are closed.

## Documentation impact

Updated the architecture, data contracts, test inventory and documentation index;
added `private-runner.md`. No user-facing changelog or version bump applies because
no launcher UI, feature or ordinary runtime behavior changed. The project has no
`docs/agents/features.md`, so `kit ux` has no product features to try.

## Follow-ups and open questions

Durable scheduling, restart recovery, cross-host leases, remote report transport,
Figma, native paid builders and AI access remain later parts of TOOLS-404. None is
proven or silently enabled by this result.
