# Private Gutenberg design test (TOOLS-417)

This bounded proof runs locally on ubulex. It extends the TOOLS-411 browser runner;
the hosted launcher does not submit or read these jobs. The lead confirmed that
the standalone private layout-A report is this card's scope on 2026-11-23.

## Run

Use the repository's locked dependencies and sandboxed Playwright Chromium, as in
[private-runner.md](private-runner.md). The official `codex` CLI must already report
`Logged in using ChatGPT` from `codex login status`. No API key is accepted.

```sh
node scripts/design-runner.mjs enqueue
node scripts/design-runner.mjs once
```

No server or user browser tab is needed. `once` claims one fixed job and exits.
It prints the report path and `RESULT: ok design-runner go` on a completed pipeline.
A failed/paused attempt prints `RESULT: fail design-runner no-go` and a reason.
The report shows both tester outcomes even when a stage could not run.

Data stays in `~/.local/share/techies-playground/design-tests/`: fixed UUID queue
files and `runs/<id>/` with sample HTML, structured AI response, saved Gutenberg
markup, capture PNGs, report JSON and report HTML. New directories are 0700 and
files 0600. Open `report.html` directly; keep its four PNGs beside it. Nothing is
uploaded by the report and no JavaScript is needed. Stop the active invocation to
stop a run. Interrupted claims remain in `running` for inspection. To remove an
attempt, remove its own job file and run directory after the process stops.
Retention is manual; no daemon, automatic recovery or scheduled cleanup is installed.

## AI and Gutenberg

The fixed original is an independent HTML page: header, large title, three cards and
footer. It has no private input or external assets. Codex receives that reference
and returns a bounded JSON tree of native core blocks. Generation uses
`gpt-6.1-sol`, high effort, the existing ChatGPT login, ignored user provider/MCP
configuration, a read-only sandbox and disabled shell tools. The model does not
write files, call a builder or read credentials. Only the official CLI handles login.
API-key login fails preflight and API-key environment variables are not inherited.

A disposable native block theme supplies the reference's global font, color and
base spacing. Gutenberg's own registered-block serializer constructs page content;
the authenticated WordPress REST API saves it. The editor parses both generated
and saved content, rejects invalid/freeform blocks, records the native inventory,
then sets the saved page as the site's homepage. No HTML/code block or add-on block
is allowed. The report preserves AI-reported limitations and missing required text.

A usage-limit response saves `ai.status: paused` and a plain reason, without starting
WordPress, retrying, changing accounts/models, or falling back to an API. A later
explicit run starts a new attempt after allowance resets. Login/access failures and
the 180-second AI deadline block the attempt. Exact account cash cost and whether
the account has purchased extra Codex usage are not exposed by the CLI; this proof
does not purchase usage or claim a billing audit.

## Measurements and report

After fonts settle, the same sandboxed Chromium captures the independent sample
and saved homepage at 1440 and 390 CSS px, device scale 1, with matching heights
that include the full page. The score counts a pixel as changed if any RGB channel
differs by more than 10%; match is `100 × (1 − changed pixels / all pixels)`.
Repeated reference captures must match exactly; a deliberately altered pixel fixture
must score lower. Widths with more than 1% changed pixels and horizontal overflow
are listed as misses. This simple pixel score is not pixelmatch, SSIM or proof of
semantic/accessibility equivalence. No repair loop or multi-builder ranking is claimed.

Both real testers run afterwards, separately from visual captures. Query Monitor
uses the canonical homepage URL, one cold and five warm collector observations,
with warm median/range. Code Profiler uses its actual admin Start Profiling control,
waits for the result chart, and verifies the profile ID against native slugs and
summary artifacts. The minimal block theme executes no PHP, so no theme attribution
row is invented when the profiler reports only plugins.

The layout-A report shows the sample beside the rebuild, each match score, misses,
both tester summaries and expandable raw evidence. `go` means all stages completed;
misses remain visible and can still mean the design needs work. Sandbox measurements
are not production-hosting benchmarks. Hosted navigation, worker pairing, Figma,
other builders, schedules and service installation belong to later cards.
