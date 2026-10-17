# Standalone Chromium download and launcher comparisons

- Date: 2026-10-13
- Owner: Codex
- Status: complete
- Disposition: inconclusive
- Related version: source 0.8.2; live launcher 0.8.0 as identified by the orchestrator; no release prepared
- Related commit/issue: Source commit `f7bf7686cf39e32837ba92747380710a39d0e574`; supplements [the original download investigation](2026-10-13-playground-download-failure.md) and [the Firefox comparison](2026-10-13-playground-firefox-comparison.md). Their recorded outcomes are preserved.

## Context

The user asked whether any fixes had been made. No application runtime fix had been established. The earlier T3 Chromium browser failed at the official Playground's exact WordPress 7.1.3 worker download, while standalone Firefox successfully booted the same release. That difference did not distinguish browser-engine behavior from browser configuration, automation, or network path.

## Hypothesis and success criteria

If the failure requires the T3 browser environment rather than Chromium generally, a standalone Chromium browser with a fresh context may boot the same official release. Require a rendered scoped site's generator to equal `WordPress 7.1.3`. Compare readable main-thread and Blob-worker API/ZIP responses and inspect the exact proxy request's `Origin`, `Referer`, response status, and CORS headers. A successful comparison does not establish a local application fix or the user's failure cause.

After the first success, the orchestrator authorized two bounded follow-ups: boot the official release with the cached Chromium build, after identifying its real version, and launch a temporary environment with no selected packages on the live Techies launcher in Chrome 155. The live success criterion is the launcher's `Ready on WordPress 7.1.3` status, which follows its PHP runtime version verification. No About-page navigation or additional browser version installation was requested.

## Options considered

- Reuse cached Chromium 1243: installed Playwright 1.64.0 expects Chromium 1248, so the initial comparison uses installed Chrome instead. A later bounded follow-up explicitly launches the existing cached executable, which reports version 153.0.8010.12. This is not the T3 browser's reported 154.0.8037.92 version, and no exact-version match is claimed.
- Use installed Google Chrome through Playwright with its sandbox enabled: executed; no browser download or host package change needed.
- Disable browser security, substitute a WordPress release, or change download URLs: not used.
- Change application code before identifying a local failure: not implemented.

## Implementation or prototype

Created a unique temporary directory with `mktemp -d /tmp/techies-playground-chromium-XXXXXX`. Ran `npm install --prefix "$task_tmp" --no-audit --no-fund playwright@1.64.0`. Inspected its `playwright-core/browsers.json` and `google-chrome --version`; the installed Google Chrome reports `155.0.8059.39`.

The temporary standalone script imports `chromium` from that installation and runs:

```js
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: true,
  chromiumSandbox: true,
})
const context = await browser.newContext()
```

No custom command-line arguments, CORS overrides, proxies, request interception, or route changes were added. The script opens `https://playground.wordpress.net/?wp=7.1.3`, polls for the scoped site's generator for up to 90 seconds, and stops boot observation after exact-version confirmation. It does not navigate to an About page. It then opens a top-level `remote.html`, fetches the version API and exact core proxy ZIP from the main thread and a Blob dedicated worker, and reads complete bodies. Each fetch uses `cache: 'no-store'` and a 30-second timeout. Targeted network listeners record only non-sensitive request context and response metadata; cookies and authorization headers are not captured. The script terminates the Blob worker, revokes its URL, and closes its context/browser in `finally`.

The cached-build follow-up uses the same sandbox-enabled launch options with `executablePath: '/home/ubulex/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome'`; it tests only official boot and its generator. The live follow-up opens `https://play.techies.tools` in another fresh Chrome 155 context, unchecks `#storage-mode` through Playwright's normal checkbox action, verifies that it is unchecked and WordPress selection is `latest`, then clicks the first exact `Launch WordPress` button. The fresh profile contains no uploaded packages or selected directory packages. It observes the launcher's status and frames for up to 90 seconds, then closes the browser to stop the temporary runtime. No user package, license, or existing browser-saved site is read or modified.

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Temporary Playwright 1.64.0; installed Google Chrome | `google-chrome --version`; launch options shown above | Identify standalone Chromium version and preserve browser security | Chrome `155.0.8059.39`; sandbox enabled; no custom arguments | Executed version and launch inspection |
| Fresh standalone Chrome context | `node "$task_tmp/probe.mjs"`; open exact official release URL | Boot WordPress 7.1.3 | Passed: scoped frontend generator is `WordPress 7.1.3` | Executed browser DOM observation at `/scope:happy-busy-park/`; script exit 0 |
| Official boot's worker ZIP request | Inspect targeted request and response events | Readable response with matching CORS origin | HTTP 200; request `Origin: https://playground.wordpress.net`, `Referer: https://playground.wordpress.net/`; response `Access-Control-Allow-Origin: https://playground.wordpress.net`, `Access-Control-Allow-Credentials: true`, `Content-Type: application/zip`, `Content-Length: 37226383` | Executed network observation; `Sec-Fetch-Mode: cors`, `Sec-Fetch-Site: cross-site`, `Sec-Fetch-Dest: empty` |
| Top-level `remote.html`, main thread | Fetch API and exact proxy ZIP with `cache: 'no-store'`; read complete bodies | Readable responses | API HTTP 200, 13,985 bytes; ZIP HTTP 200, 37,226,383 bytes | Executed browser fetches |
| Same page, Blob dedicated worker | Repeat API and proxy ZIP fetches | Check the original worker-download symptom | API HTTP 200, 13,985 bytes; ZIP HTTP 200, 37,226,383 bytes | Executed worker fetches; worker origin `https://playground.wordpress.net` |
| Blob worker ZIP request | Inspect targeted request/response metadata | Determine whether an absent referrer requires rejection | Request `Origin: https://playground.wordpress.net`; no `Referer` header; HTTP 200 with matching `Access-Control-Allow-Origin` and credentials header | Executed observation; readable ZIP succeeds despite missing referrer |
| Cached Chrome for Testing | `/home/ubulex/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome --version`; `node "$task_tmp/cached-boot.mjs"` | Identify the actual version, then compare official boot | Version `153.0.8010.12`; exact proxy HTTP 200; scoped frontend generator `WordPress 7.1.3`; exit 0 | Executed fresh-context boot with sandbox enabled; scope `/scope:generous-classic-forest/`; not an exact match to T3 version 154 |
| Live Techies launcher; fresh Chrome 155.0.8059.39 context | `node "$task_tmp/launcher-boot.mjs"`; uncheck browser storage, keep `latest`, select no packages, click `Launch WordPress` | Verify a working launcher setup for exact latest | Passed: storage unchecked; exact proxy HTTP 200; status `Ready on WordPress 7.1.3. Activate licenses inside WordPress when needed.`; exit 0 | Executed live UI flow; scoped `/wp-admin/plugins.php` frame present; readiness follows launcher PHP version verification |
| Task cleanup | Close all three contexts/browsers in `finally`; inspect temporary probe processes; remove validated temporary directory | No task browser, probe, or temporary npm installation remains | All three browser-close paths complete; 0 remaining temporary probe processes; temporary directory absence confirmed | Scripts and temporary Playwright modules removed; existing installed/cached browsers preserved |
| Git | `git diff --check` | Documentation changes have no whitespace errors | Passed: exit 0, no output | Executed after cleanup; no tests/build rerun for this documentation-only comparison |

The exact ZIP URL in all tests is `https://wordpress-playground-cors-proxy.net/?https://wordpress.org/wordpress-7.1.3.zip`. The API URL is `https://api.wordpress.org/core/version-check/1.7/`. The targeted proxy requests produced no `requestfailed` events in this run. This does not prove that every official-Playground request or feature is fault-free.

The live admin frame does not expose a `meta[name="generator"]` value; its observed value is `null`. Exact live WordPress version evidence is the launcher's PHP-verified readiness status, not an admin generator assertion. The orchestrator identifies the live launcher as the earlier deployed 0.8.0 release; the local main source is 0.8.2. This comparison tests the deployed launcher and does not execute a browser launch from local main source 0.8.2.

The temporary scripts are deleted and their path-based commands cannot be replayed directly. For another run, create a new temporary npm prefix and reconstruct the bounded procedures described above with Playwright 1.64.0 and the stated executables. The existing [inline worker procedure](../testing.md#runtime-download-investigation-2026-10-13) supplies an equivalent page-context probe. Always close created browsers and delete only the new temporary installation after recording results.

## Result

Standalone Chrome 155.0.8059.39 successfully boots official WordPress 7.1.3 with its sandbox enabled. Main-thread and dedicated-worker archive reads both succeed. Together with the Firefox comparison, this rules out a universal browser-engine or release-archive failure as an explanation for these observations. An absent Blob-worker referrer is not sufficient to reproduce the original failure in standalone Chrome.

The cached standalone Chrome 153.0.8010.12 also boots the official release. Chrome 155.0.8059.39 successfully launches a temporary WordPress 7.1.3 environment on the live Techies launcher. A fresh Chrome 155 context is therefore a demonstrated working setup for the basic launcher flow. Updating the user's browser, clearing their profile, or changing their network was not executed, so none is claimed as a proven repair for their particular failure.

The remaining difference is between tested environments. Identical underlying network paths, browser configuration, browser versions, and automation behavior across T3 and standalone runs have not been established. This evidence does not attribute the failure specifically to T3, Chromium, the upstream proxy, or the launcher. The user's service-worker HTTP 403 remains separately unconfirmed. No application runtime fix has been made or verified.

## Disposition and rationale

Inconclusive about the original root cause. Keep the successful standalone Chromium and live temporary-launch evidence and preserve exact-version behavior. A code change would require an independently demonstrated launcher defect or a verified compatible remedy; this comparison alone establishes neither. No commit, push, release, or deployment is performed.

## Documentation impact

[Architecture](../architecture.md), [testing](../testing.md), and [the change index](README.md) link this comparison. Earlier investigation records remain unchanged. Application source and release versions remain unchanged.

## Follow-ups and open questions

- Compare the T3 failure's request/response metadata with this successful origin-matched download when tooling exposes it.
- Establish the user's actual failing browser context before claiming a fix.
- The launcher's browser-saved OPFS persistence, package installation, the exact T3 Chromium version in a standalone profile, and another deliberately selected network were not tested in this comparison.
