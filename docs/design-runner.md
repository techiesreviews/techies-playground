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
Homepage readiness waits for the saved post-content container, independently of the
generated heading level. A missing H1 is a listed miss; it does not prevent captures
or the two testers from examining an otherwise valid native rebuild.

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

Query Monitor runs before any screenshot navigation to the saved homepage. Preparation
only saves native blocks and sets the homepage; it returns a deferred capture step.
The first frontend request to that rebuilt page is measured cold, followed by five
warm requests, then the visual captures, then Code Profiler. The canonical homepage
URL is used, with warm median/range. These are request-order labels, not a guarantee
of flushed host, network or runtime caches. Code Profiler uses its actual admin Start Profiling control,
waits for the result chart, and verifies the profile ID against native slugs and
summary artifacts. The minimal block theme executes no PHP, so no theme attribution
row is invented when the profiler reports only plugins.

The standalone report follows the approved TOOLS-450 results-page layout: verdict
first, picture-match score, eight CSS count-up stat tiles without blobs, original/copy
comparison (slider or side by side, desktop or phone), visible-first plain-word misses,
both tester cards, block mix, and expandable raw evidence. Inter and Instrument Serif
are embedded from local WOFF2 files, along with the stylesheet and comparison script.
The four PNGs stay beside the HTML. It opens via `file://` without fetching JSON or
external fonts and follows the viewer's light/dark preference. Decorative animations
are disabled with reduced motion; screen readers receive each final stat as text.
Without JavaScript, a static fallback exposes the complete original/copy pictures
at both captured widths, with direct PNG links. Missing capture sizes are disabled
in the device switch; they never silently display another size. Controls and stat
tiles reflow when text is enlarged to 200% on a 390 px screen.
The slider's full 44 px handle and focus ring remain visible and reachable at both
ends; rounded corners belong to the pictures, without clipping the control.
Displayed picture scores are floored to one decimal everywhere, including the
comparison footer after switching sizes. A match below 99% never displays as 99%.

Before JSON/HTML persistence, the generator writes `state: passed|partial|failed`,
`summary` (tone, pill, title, lead), and `design.missDetails` (`raw`, `title`, `why`,
`visible`, optional `kind`). A pass requires completed AI/design stages, both expected capture widths
at 99% or better without overflow or visible misses, no invalid native blocks, and
completed testers. Behind-the-scenes notes can remain on a passed run. Missing
testers/captures or visible differences make a completed rebuild partial; an incomplete
AI/design stage is failed. Stop reasons use actual saved evidence, without inventing
a timeout or cash-cost claim. These display states are separate from pipeline `go`.
Body-margin, box-sizing and viewport-metadata notes count as visible layout misses,
including mixed notes. Only an exact article-semantics note gets the invisible
block-limit wording; unknown metadata notes retain neutral AI-note wording.

The report counts four saved pictures for two width comparisons, including originals
and copies. Elapsed time comes from timestamps, including failed attempts. `go` means all stages completed;
misses remain visible and can still mean the design needs work. Sandbox measurements
are not production-hosting benchmarks. Hosted navigation, worker pairing, Figma,
other builders, schedules and service installation belong to later cards.

## Reproduce the H2 regression

The committed check replays a saved non-secret AI response, changes only the title
to H2, and requires native readback, an H1 miss, both captures and both real testers.
It never starts Codex or claims another AI generation. Supply the `answer.json` from
one completed design run and a private output directory:

```sh
node scripts/design-runner-heading-check.mjs /private/run/answer.json /private/h2-check
```

## Check the report page without AI or private run data

```sh
node scripts/design-report-check.mjs .scratch/design-report-check
```

This explicit browser check generates a public `sampleHTML()` fixture and a smaller
heading, scores the actual PNG differences, and saves a report through `runOnce`.
Tester observations are injected fixtures; this does not claim a new WordPress or AI
run. It checks all three report states at 1440/390 in light/dark, no sideways scroll,
44 px radio targets, slider keys and drag, comparison controls, disclosures, final
counters and reduced motion. It also asserts that opening the saved page requires no
HTTP requests. Screenshots and `browser-evidence.json` go to the chosen directory.
Home/End checks save eight focused endpoint screenshots (1440/390, light/dark),
verify the entire handle is hit-testable, and check focus-ring clipping and viewport
bounds. Their geometry is also saved in `slider-ends.json`.
