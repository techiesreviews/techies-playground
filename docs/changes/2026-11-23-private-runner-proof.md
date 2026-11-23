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
| Same versions, after review fixes | Enqueue again, then `kit go tools-411-proof-reviewed -- node scripts/private-runner.mjs once` | Homepage and native ID/artifact agree; no admin text copied | `RESULT: ok private-runner go`; six collector observations and matching native profile completed | Private run `e8dccfc7-2383-4365-a877-7b94f7736273` |
| Same versions, after diagnostic fixes | Enqueue again, then `kit go tools-411-proof-diagnostics -- node scripts/private-runner.mjs once` | Current PHP reader and native artifact guard complete | `RESULT: ok private-runner go`; all three stages completed | Private run `9c5d6211-1104-45a2-a115-fa8b211636c5` |
| Same versions, after the real artifact fixture was added | Enqueue again, then `kit go tools-411-proof-artifact-test -- node scripts/private-runner.mjs once` | The unchanged artifact predicate works in the real runner | `RESULT: ok private-runner go`; all three stages completed | Private run `b02592e5-bddf-4849-9004-b77b7faed887` |
| After diagnostic fixes | `kit unit` | Current full suite passes after the final test edits | 352/352 tests in 41 files | `.scratch/unit/20261123T093507-1885336.log` |
| Before review fixes | `kit unit`; `kit build`; `kit doctor`; `git diff --check` | Existing app stays checked | 351/351 tests in 41 files; build passed with existing externalized-module/chunk-size warnings; doctor 17/17; diff check passed | `.scratch/unit/20261123T084338-491435.log`; kit output |

Private run evidence stays on ubulex under
`~/.local/share/techies-playground/runs/<id>/report.json` and `report.html`; it is
intentionally not committed or published. The completed native `.slugs.profile`
attribution is copied to the report only after the matching `.summary.profile` exists.
No profiling keys, cookies, nonces or rerun parameters are exported.

Declined: Grok's 20261123T091259Z P1 filename claim. Free Code Profiler 1.9.6
`lib/class-report.php` writes `{$microtime}.{$profile_name}.slugs.profile`, not
`{id}.slugs.profile`. Run e7783448 saved the stem
`1795423599.1100.2026-11-23_423597`. The runner correctly requires the numeric native
ID followed by a dot and the profile name. A new test feeds that exact artifact name
through the same matching function used by the runner, accepts its real ID and
rejects different IDs and the reviewer's unsupported bare-ID stem. The predicate
was extracted without changing its behavior. This is direct executed evidence;
accepting the proposed bare-ID form would not fix an observed defect.

The new artifact test failed first with `matchesProfilerArtifact is not a function`
(4/5, `.scratch/unit/20261123T091411-614686.log`), then passed 5/5 after extraction
(`.scratch/unit/20261123T091420-615030.log`). The full suite after every test edit
passed 352/352 in 41 files (`kit unit`, `.scratch/unit/20261123T091421-615173.log`).
This newer result supersedes the pre-review full-suite citation for the current
code; the historical result above remains unchanged.

The first Opus review found one P2 privacy mismatch (R1-1): successful reports also
copied visible WordPress admin text. That diagnostic text and the failure-only
directory listing were removed. R1-2 through R1-8 were also addressed: native profile
ID must match its artifact, the selected profiler target must be the homepage, the
timeout names the absent result, hostname is measured, the module map includes the
script, and tests verify HTML/job permissions and the finished queue entry. The test
name now describes retained claims without implying process-restart testing. The
native TSV reader rejects malformed rows. npm's lock update also refreshes optional
Tailwind WASI entries and dev-only metadata; all installed direct versions still
match the lockfile, and no runtime dependency range changed.

Declined: R1-9 and R1-10 (validation gaps) request extra unit cases for malformed
jobs and incomplete `.pending` files. The proof accepts no user job payload; source
inspection confirms fixed-schema validation and the `.json` filename filter. The
existing concurrency/retained-claim tests cover the active queue boundary.

Declined: R1-11 (validation gap) requests additional permutations of the existing
verdict test. Source inspection confirms exact six-observation and completed-profile
gates; executed tests already reject missing observations and incomplete attribution.

Declined: R1-12 (validation gap) requests exporting a deadline helper solely for a
unit test. The initial real 180-second timeout already executed the deadline and
saved a no-go; the current catch also marks in-progress stages blocked. No helper
interface was added for this one-use proof.

Done when 1: met — queued job 9c5d6211-1104-45a2-a115-fa8b211636c5 was claimed by `node scripts/private-runner.mjs once` on ubulex and booted a fresh sandboxed headless browser Playground without Lex's tab.

Done when 2: met — run 9c5d6211-1104-45a2-a115-fa8b211636c5 completed six Query Monitor collector observations and a genuine free Code Profiler profile with matching native plugin/theme attribution, saved in private JSON and HTML reports.

Done when 3: met — the current runner printed `RESULT: ok private-runner go` for run 9c5d6211-1104-45a2-a115-fa8b211636c5; earlier failed harness attempts retain explicit no-go reports.

The next Grok review (20261123T093307Z) no longer raised the filename claim. It
raised the previously noted catch-all timeout diagnostic as P2. The catch now
relabels only a Playwright `TimeoutError`; other errors retain their original
message. Source inspection confirms this branch; detached-page failure injection
was not run. Empty visible profiler errors now stay blocked. Missing summary,
malformed attribution and mismatched ID failures have separate messages, with the
native profile ID retained as partial evidence.

The artifact guard now requires the complete decimal microtime ID and a nonempty
profile name. The real-name test gained truncated-ID and empty-name rejection
assertions, failed first (4/5, `.scratch/unit/20261123T093439-1855934.log`), then
passed 5/5 (`.scratch/unit/20261123T093507-1884924.log`). The existing failure test
now executes the `running` to `blocked` transition. Full suite after these edits
passed 352/352 (`.scratch/unit/20261123T093507-1885336.log`). The fresh real run
9c5d6211-1104-45a2-a115-fa8b211636c5 completed all stages after these changes. The
record index now links this experiment, and the runner contract states that its
180-second deadline begins after browser/context startup.

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
