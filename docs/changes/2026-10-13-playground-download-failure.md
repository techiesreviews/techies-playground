# WordPress 7.1.3 Playground download investigation

- Date: 2026-10-13
- Owner: Codex
- Status: complete
- Disposition: inconclusive
- Related version: 0.8.2; no release prepared
- Related commit/issue: Investigated source commit `f7bf7686cf39e32837ba92747380710a39d0e574`. Supplements the browser-runtime coverage gap in [the 7.1.3 fallback update](2026-10-11-wordpress-7.1.3.md); its original outcomes remain unchanged.

## Context

The user reported that launching the latest WordPress release fails with `Failed to fetch`, and that a Playground service-worker update request returned HTTP 403. The launcher's live latest resolution selects WordPress 7.1.3. The failing runtime request is `https://wordpress-playground-cors-proxy.net/?https://wordpress.org/wordpress-7.1.3.zip`.

## Hypothesis and success criteria

Distinguish an invalid WordPress selection, a missing release archive, a launcher defect, and a browser-context or upstream runtime download failure. A fix requires reproducing the original launch successfully without changing the selected WordPress version, recipe contracts, browser security behavior, or OPFS identity.

The ranked probes consider: (1) browser CORS restrictions on the runtime's worker download, (2) worker or service-worker state, (3) unavailable upstream release files, and (4) incorrect launch input. Each comparison changes one relevant context or fetch option. An HTTP success outside the failing worker does not establish successful browser runtime startup.

## Options considered

- Leave runtime code unchanged while collecting evidence: preserves exact-version and storage contracts until a local cause is established.
- Substitute a different release or download host: rejected as a repair without a successful original-version launch; it would not prove the cause.
- Pass `wordPressZip` to the current Blueprint v1 client call: source inspection shows that this is not a supported public v1 start option; not implemented.
- Use `mode: 'no-cors'`: an opaque response cannot provide the readable ZIP bytes needed for WordPress installation; not a repair.
- Change browser permissions, bypass CORS, or publish an application proxy: outside the product's existing boundaries; not implemented.
- Add a contextual launch error: may improve diagnostics, but cannot by itself repair an upstream download.

## Implementation or prototype

No application runtime code has been changed during this investigation. Browser probes compare the top-level remote page, its dedicated worker, and the launcher. All archives used are public WordPress downloads; no local package, site contents, or license data are involved.

Source inspection finds that `src/App.jsx` resolves `latest`, builds the exact-version runtime recipe, and passes its version through `preferredVersions.wp` in `src/lib/recipe.js`. The installed client is `@wp-playground/client` 3.1.47. The live remote worker is `/playground-worker-endpoint-blueprints-BSYRer2c.js`; its boot implementation explicitly downloads unbundled numeric releases from `https://wordpress.org/wordpress-<version>.zip` through the Playground CORS proxy. A rejected fetch propagates through the client to the existing launch failure cleanup.

The launcher's `worker.js` allows HTTPS connections through `connect-src 'self' https:`. Source inspection does not support blaming its CSP for the proxy download failure.

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Live launcher, isolated browser | Launch latest twice; inspect failed network request and launcher error | WordPress 7.1.3 starts | Both launches fail at the exact proxy URL with `net::ERR_FAILED`; launcher shows `Failed to fetch` | Browser observation supplied by the orchestrator |
| Terminal Node fetch | GET the exact proxy URL with `Origin: https://playground.wordpress.net`, with and without `Referer: https://playground.wordpress.net/remote.html` | Distinguish missing archive from browser restrictions | Both return HTTP 200, `Content-Type: application/zip`, `Access-Control-Allow-Origin: https://playground.wordpress.net`, and `Access-Control-Allow-Credentials: true` | Executed terminal probe; response bodies canceled after reading headers |
| Top-level `https://playground.wordpress.net/remote.html`, browser | Main-thread fetch of the exact proxy URL with `cache: 'no-store'`; read complete body | Establish browser-readable archive availability in this context | HTTP 200; 37,226,383 bytes | Browser observation supplied by the orchestrator |
| Same top-level remote page, browser | Fetch the exact proxy URL inside a Blob dedicated worker; repeat with `cache: 'no-store'`, explicit remote-page referrer, or `credentials: 'omit'` | Find an option that changes the failing worker response | All readable fetches reject with `TypeError: Failed to fetch`; worker reports `self.origin === 'https://playground.wordpress.net'` | Browser observations supplied by the orchestrator; options tested separately |
| Same worker, browser | Fetch WordPress version API; compare proxy fetch with `mode: 'no-cors'` | Separate total worker connectivity failure from cross-origin readable response failure | Version API returns HTTP 200; proxy no-CORS fetch returns opaque response, status 0 | Browser observation supplied by the orchestrator; opaque response cannot yield ZIP bytes |
| Browser remote runtime | Fetch/update `sw.js` during the investigation | Reproduce the reported 403 | Current response is HTTP 200 and `registration.update()` completes | Browser observation supplied by the orchestrator; original user-reported 403 not reproduced |
| Official `https://playground.wordpress.net/?wp=7.1.3`, isolated browser | Open the official Playground with the exact release; inspect visible error, console, and network | Determine whether the launcher is required for the failure | Official UI shows `Runtime error` and `Could not download required files`; console shows `TypeError: Failed to fetch` at `PlaygroundWorkerEndpointBlueprints.boot`; exact proxy ZIP request fails with `net::ERR_FAILED` | Browser observation supplied by the orchestrator; independent of the Techies launcher |
| Source inspection | Inspect exact-version recipe construction, SDK types, live remote worker boot code, and `worker.js` | Identify runtime owner and preserve contracts | Exact 7.1.3 reaches Blueprint v1; remote worker owns the proxy download; launcher CSP allows HTTPS | Inspection only; not a successful launch test |
| Node test runner | `node --test src/lib/wordpress-versions.test.js src/lib/recipe.test.js` | Existing version and recipe contracts pass | Passed: 19 tests, 0 failures | Executed in the investigated working tree; not a browser-runtime test |
| Git | `git diff --check` | No whitespace errors in documentation changes | Passed: exit 0, no output | Executed local diff check |

The browser observations were collected by the orchestrator with T3 browser preview tools. The minimized fetch runs as page JavaScript and creates a dedicated worker from a Blob; it does not import the launcher's code. [The replay procedure](../testing.md#runtime-download-investigation-2026-10-13) provides an inline probe and cleanup. The observed official-Playground boot failure is the integration reproduction; the Blob-worker probe narrows its download symptom. No full `npm test`, build, or successful browser boot is claimed for this documentation-only change.

## Result

The archive exists and is readable from the remote page's main thread in the investigation browser. The same readable fetch fails from a dedicated worker while other worker HTTPS requests succeed. An opaque no-CORS response establishes that the request can reach the proxy without giving the runtime access to its ZIP bytes. These observations narrow the fault to the browser's readable worker-download path; they do not yet identify the specific response-header, cache, browser-policy, or upstream defect responsible.

The official Playground reproduces the same exact-release proxy download failure independently of the Techies launcher. This rules out the launcher as a necessary condition for this reproduction. It does not prove a universal proxy outage or identify the worker CORS rejection's precise cause.

The reported service-worker 403 remains unconfirmed. Current `sw.js` success does not establish what happened in the user's browser. No successful WordPress 7.1.3 startup or OPFS resume is claimed. No application change, release, commit, push, or deployment was made.

## Disposition and rationale

Inconclusive. The failing upstream/browser worker-download path is reproduced and narrowed, including on the official Playground. The specific cause and a verified local remediation remain unknown. Keep application behavior and exact-version selection unchanged. A runtime fix cannot be claimed from source inspection, a terminal archive download, or a change to error wording alone.

## Documentation impact

This investigation record supplements the earlier fallback record. [Architecture](../architecture.md) records the external core-download dependency; [testing](../testing.md) links the evidence and includes a replayable worker probe; [the change index](README.md) links this record. Release metadata remains unchanged because this is not a deployment.

## Follow-ups and open questions

- Capture worker request/response CORS details if the available browser tooling exposes them.
- Establish a successful original-version launch before claiming remediation.
- Investigate the user's service-worker 403 separately if it recurs with reproducible evidence.
