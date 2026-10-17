# Official Playground Firefox comparison

- Date: 2026-10-13
- Owner: Codex
- Status: complete
- Disposition: inconclusive
- Related version: 0.8.2; no release prepared
- Related commit/issue: Source commit `f7bf7686cf39e32837ba92747380710a39d0e574`; supplements and supersedes only the cross-browser coverage gap in [the earlier download investigation](2026-10-13-playground-download-failure.md). Its recorded results are preserved.

## Context

The earlier isolated Chromium reproduction failed to boot WordPress 7.1.3 on both Techies Playground and the official Playground. Its readable worker fetch rejected at `https://wordpress-playground-cors-proxy.net/?https://wordpress.org/wordpress-7.1.3.zip`, although the same archive was readable from the remote page's main thread. The user requested a comparison in another browser or on another network.

## Hypothesis and success criteria

If the readable download failure depends on the browser environment, another engine with a fresh context may download the same archive and boot the same exact release. Success requires loading `https://playground.wordpress.net/?wp=7.1.3` without changing the version or bypassing browser security, and independently confirming the installed version. Compare API and core ZIP fetches from the remote page's main thread and a Blob dedicated worker.

A successful comparison establishes that the original failure is not universal. It does not identify the original Chromium environment's root cause or verify a launcher fix. This task did not switch or reconfigure a network. Whether T3 browser automation and standalone Firefox use identical network paths was not verified; no deliberate independent-network comparison was performed.

## Options considered

- Cached Playwright WebKit: attempted first, but its missing system library prevents browser startup.
- Playwright Firefox in a temporary directory: executed with a fresh browser context and supported current Playwright installer; no repository dependency or host system package changes.
- Another network: not tested. No proxy, VPN, routing, or host-network configuration changes were made.
- Change runtime source, selected WordPress release, or security policy: not part of this comparison; none were changed.

## Implementation or prototype

Created a unique temporary directory with `mktemp -d /tmp/techies-playground-browser-XXXXXX`. Installed Playwright there using `npm install --prefix "$task_tmp" --no-audit --no-fund playwright@1.58.2` for the cached WebKit attempt. WebKit exited before navigation because `libevent-2.1.so.7` was absent. That Playwright version also rejects Firefox installation on `ubuntu26.04-x64`.

Updated only the temporary installation to `playwright@1.64.0`. The normal installer successfully downloaded Playwright Firefox build 1555, Firefox 157.0, and its FFmpeg dependency into the same temporary directory. No host dependencies were installed and no unsupported-platform or sandbox overrides were used. Browser contexts use `firefox.launch({ headless: true })` followed by `browser.newContext()`, without changing CORS or service-worker behavior.

The first standalone Node script opens the exact official URL, captures targeted network responses/failures and console errors, and waits up to 90 seconds for a WordPress page or explicit runtime error. It then opens `remote.html` and reads complete responses from the version API and exact proxy ZIP in the main thread and a Blob worker. Each probe uses `cache: 'no-store'` and a 30-second fetch timeout. A second fresh-context script verifies the installed version from the rendered site. Both close their context and browser in `finally`; worker probes also terminate the worker and revoke its Blob URL.

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Ubuntu 26.04.1 LTS; cached WebKit 2359; Playwright 1.58.2 | Launch `/home/ubulex/.cache/ms-playwright/webkit-2359/pw_run.sh` through Playwright | Start another browser engine | Exited before navigation: `libevent-2.1.so.7: cannot open shared object file: No such file or directory` | Executed launch attempt; not a boot test |
| Temporary Playwright 1.58.2 | `PLAYWRIGHT_BROWSERS_PATH="$task_tmp/browsers" node "$task_tmp/node_modules/playwright/cli.js" install firefox` | Install Firefox | Failed: `ERROR: Playwright does not support firefox on ubuntu26.04-x64` | Executed installer attempt; no browser test |
| Temporary Playwright 1.64.0 | Update temporary npm installation; repeat the normal Firefox installer command | Install without changing host packages | Passed; Firefox 157.0, build 1555, installed | Executed installer; no platform or security overrides |
| Headless Firefox 157.0; fresh context; existing network | `PLAYWRIGHT_BROWSERS_PATH="$task_tmp/browsers" node "$task_tmp/probe.mjs"`; open `https://playground.wordpress.net/?wp=7.1.3` | Download exact WordPress archive and render a site | Exact proxy request HTTP 200; scoped site displays the admin toolbar, `Howdy, admin`, and `Hello world!` | Executed first browser run; request `Content-Length: 37226383`, `Access-Control-Allow-Origin: https://playground.wordpress.net` |
| Same Firefox run, top-level `remote.html` | Main-thread fetch version API and exact proxy ZIP; read full bodies | Readable API and ZIP responses | API HTTP 200, 13,985 bytes; ZIP HTTP 200, 37,226,383 bytes | Executed browser fetches; `cache: 'no-store'` |
| Same page, Blob dedicated worker | Repeat the same API and ZIP fetches in the worker | Determine whether worker-specific rejection recurs | Worker origin `https://playground.wordpress.net`; API HTTP 200, 13,985 bytes; ZIP HTTP 200, 37,226,383 bytes | Executed worker fetches; full ZIP bytes readable |
| Same first browser run | Observe WordPress's outgoing core version-check request | Supplement installed-version evidence | Request includes `version=7.1.3` and returns HTTP 200 | Network observation; independent rendered-version check below |
| Second fresh Firefox 157.0 context | `PLAYWRIGHT_BROWSERS_PATH="$task_tmp/browsers" node "$task_tmp/verify-version.mjs"`; read the scoped site's `meta[name="generator"]` after official boot | Verify the exact installed WordPress release | Passed the generator check: `WordPress 7.1.3` | Executed DOM observation on `https://playground.wordpress.net/scope:patient-modern-valley/` |
| Same second run | Navigate the scoped frame to `wp-admin/about.php`, waiting for `domcontentloaded` | Obtain a second rendered version confirmation | Timed out after 30,000 ms; script exit 1 | About-page navigation did not pass; generator confirmation preceded the timeout; browser closed in `finally` |
| Local process/filesystem cleanup | Inspect processes belonging to the temporary browser installation; remove its validated `/tmp` directory | No task browser or temporary installation remains | 0 remaining task browser processes; temporary directory absence confirmed | Both contexts and browsers closed; temporary scripts, npm modules, downloaded Firefox, and FFmpeg removed |
| Git | `git diff --check` | Documentation changes have no whitespace errors | Passed: exit 0, no output | Executed after cleanup; tests/build were not rerun for this documentation-only comparison |

The temporary scripts and browser/module installation are deleted after recording their results. To replay the exact-version comparison without repository dependencies, use a new temporary npm prefix, install `playwright@1.64.0`, set `PLAYWRIGHT_BROWSERS_PATH` to its `browsers` directory, and run the normal installer command above. Import `firefox` from that temporary installation, create a fresh context, open the exact official URL, and poll its frames for a scoped URL. Read that frame's `meta[name="generator"]` content and require `WordPress 7.1.3`. Bound boot observation to 90 seconds and always close context/browser. The [earlier inline worker probe](../testing.md#runtime-download-investigation-2026-10-13) can then run in a top-level `remote.html` page; repeat with `https://api.wordpress.org/core/version-check/1.7/` as its URL. A new replay is not implied to reproduce every captured timing or console message.

The first run also logged two service-worker messages: `A ServiceWorker intercepted the request and encountered an unexpected error.` They did not prevent the observed site render. They are not the user-reported `sw.js` update HTTP 403, and this comparison does not establish their separate cause.

## Result

Firefox 157.0 downloads the exact WordPress 7.1.3 archive, renders the official Playground site, and reads the same complete ZIP from both the main thread and a dedicated worker. A second fresh-context boot confirms the rendered generator is `WordPress 7.1.3`. Its additional About-page navigation times out; that navigation is not claimed to pass.

The original Chromium worker-fetch failure did not reproduce in this standalone Firefox environment. Browser engine and automation environment differ from the earlier T3 reproduction. Identical underlying network paths were not established, so the comparison cannot attribute the difference to the Chromium engine, browser settings, automation, or network path alone.

## Disposition and rationale

Inconclusive about the original failure's root cause. Keep the successful Firefox boot and exact rendered-version evidence. They establish a working environment for the same official release without demonstrating a universal outage or a specific local repair. No application repair, commit, push, release, or deployment is claimed.

## Documentation impact

[Testing](../testing.md), [architecture](../architecture.md), and [the change index](README.md) link this comparison without rewriting the earlier investigation or release outcomes. Versions and application source remain unchanged.

## Follow-ups and open questions

- Distinguish browser configuration, automation behavior, and Chromium-specific networking before attributing a root cause.
- Test the launcher's embedded runtime in Firefox separately if requested; this comparison targets the official Playground.
- Test another network only through an authorized, independently verified connection; none was used here.
