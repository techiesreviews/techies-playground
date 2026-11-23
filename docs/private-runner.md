# Private runner proof (TOOLS-411)

This is an on-demand compatibility experiment on ubulex, separate from the launcher.
It accepts only a fixed, free WordPress.org setup: Query Monitor and Code Profiler.
It has no server, public endpoint, credential input, AI, paid packages or browser-vault access.
The launcher has no integration with this queue. Normal launches do not execute this script.

## Run and stop

After `npm ci`, use the Chromium revision required by the locked Playwright dependency.
The proof on ubulex uses the already installed Chromium 1255; nothing is installed system-wide.
On another machine, install that browser into the user's own data directory and set
`PLAYWRIGHT_BROWSERS_PATH` accordingly. Missing browser or sandbox support is a blocker;
the script does not install OS libraries or disable Chromium's sandbox.

```sh
node scripts/private-runner.mjs enqueue
node scripts/private-runner.mjs once
```

The first command writes a durable queued job. The second claims at most one job and
exits after completion or failure. No open Lex tab is required. There is no daemon,
timer or systemd unit to disable. Interrupting the process stops its current attempt;
an interrupted job stays in `running` for inspection and is never automatically retried.
No restart recovery or multi-host lease is claimed by this proof.

Data lives in `~/.local/share/techies-playground/`: `queued`, `running`, `finished`
and `runs/<run-id>/report.json` plus `report.html`. New directories are mode 0700;
reports and job files are mode 0600. A queued file becomes visible only after its full
write, and an atomic rename claims it. The caller owns this local directory; do not
use an untrusted shared directory. To remove the proof's data, stop any invocation and
delete its individual job files and run directory. Existing launcher browser data is unrelated.

## What it proves

A fresh, sandboxed headless Chromium context loads the current hosted Playground client
and `remote.html` from `https://wp.techies.tools`. A single intercepted control document
exists only in that browser at the allowed launcher origin; it is never published or
sent to the hosted launcher. All WordPress writes are to the disposable browser's
WebAssembly filesystem. The script closes Chromium in `finally`.

The setup uses PHP 8.3 and WordPress `latest`, records actual WordPress/PHP/plugin/browser
versions, and installs only the free packages from WordPress.org. It runs the existing
measurement must-use plugin on `/` once cold and five times warm. Every observation
must come from Query Monitor's collectors; the launcher's fallback is a failure here.
The report includes each observation and warm PHP-time median/range. These are
Playground/WebAssembly/SQLite sandbox diagnostics, not production hosting rankings.

The separate profiler pass opens Code Profiler's real WordPress admin screen and clicks
Start Profiling. The selected target must be the homepage with no query or fragment;
any other target is a no-go. An error is a no-go. A success requires the plugin's completed-profile
navigation and its native `.slugs.profile` with a matching `.summary.profile` in the
disposable filesystem. Only profile ID and plugin/theme attribution are copied out;
nonces, temporary profiling keys, cookies and rerun parameters are not exported.
Function-level detail and Pro CSV exports are outside the free edition and this proof.

`go` requires all three stages. `no-go` is a valid experimental result, returns exit 1,
and preserves partial evidence in both private reports. A browser attempt has a
180-second deadline after browser startup and context setup. Failed attempts are not
silently converted to zeros or retried.
The report HTML escapes all captured data and loads no scripts or external resources.

Upstream references: [Playground JavaScript API](https://developer.wordpress.org/playground/developers/apis/javascript-api/),
[free Code Profiler features](https://wordpress.org/plugins/code-profiler/),
[Playwright library and browser lifecycle](https://playwright.dev/docs/library).
