# Freemius licence activation in Playground

- Date: 2026-11-14
- Owner: fleet-lead build agent (Claude Opus 5.5)
- Status: complete; deployed-preview check pending at writing (the lead records it with the release)
- Disposition: kept
- Related version: 0.9.1
- Related commit/issue: Orbit TOOLS-249

## Context

Lex needs Freemius-licensed plugins (Melapress WP Activity Log) to activate their licence in Techies Playground. Reproduced by the lead on wp.techies.tools and playground.wordpress.net: Freemius signs every API call with the request's `Date` header, browsers never send `Date` from `fetch()`, so direct calls to `api.freemius.com` got 401 "You must provide valid formatted date stamp for FS Authorization". After those 401s the SDK sent a PUT that went to our CORS proxy, which refused it (405, `Allow: GET, HEAD, POST, OPTIONS`, as upstream). The `wp.` versus `play.` origin is not the cause: Freemius allows both in CORS.

## Hypothesis and success criteria

Moving the date into the URL as `auth_date=<the same value>` (a parameter Freemius reads; its own SDK uses it for signed URLs) passes the date check, and allowing PUT, PATCH and DELETE through the proxy for the Freemius API hosts only lets licence updates through. Success: on the deployed preview, Freemius-shaped signed GET and PUT with a fake key get past the date check and fail only on "Invalid Authorization header", and plain and plugin-ZIP launches still work in Chromium and Firefox.

## Options considered

- Date into `auth_date` with a must-use plugin written by the Blueprint, for the Freemius hosts only (chosen): no change to vendor code, nothing else touched.
- Patch the Freemius SDK inside each plugin: changes vendor files on every install; not reliable.
- Let the proxy add a `Date` header: the proxy cannot know the signed value, so the signature would not match.
- Leave unchanged: Freemius licences cannot be activated.

## Implementation or prototype

- `src/lib/freemius-plugin.js` holds the PHP of `techies-freemius.php`; `buildPlaygroundBlueprint` (`src/lib/recipe.js`) writes it with a `writeFile` step before any package installs, on new and resumed sites. For `api.freemius.com` and `sandbox-api.freemius.com` only, a `pre_http_request` filter copies `Date` into `auth_date` (URL-encoded, never twice) and adds `X-Cors-Proxy-Allowed-Request-Headers: authorization`, then sends the changed request once.
- The opt-in was added after the first browser run (below), beyond the lead's first plan of "nothing else changes": with only `auth_date`, the direct GET passed the date check, but the Freemius SDK still reported `api_blocked`, because it rejects any answer without a readable `X-API-Server` header and Freemius does not expose that header to browsers (no `Access-Control-Expose-Headers`), and the direct PUT failed the browser's CORS check (Freemius allows `Authorization` and `Content-Type` but not the `Content-MD5` the SDK sends with a body). Freemius does not allow the opt-in header either, so the browser's direct attempt fails and Playground retries through our proxy, where the SDK can read every header. The proxy's rule is unchanged: it forwards `Authorization` only on this opt-in.
- `playground-host/cors-proxy.js`: PUT, PATCH and DELETE pass only when the target host is `api.freemius.com` or `sandbox-api.freemius.com` (405 with the same `Allow` header otherwise), carry their bodies, and an authorized one redirected to another origin is refused like an authorized POST. Every other protection (same-origin gate, rate limit, target checks, header rules, size cap) applies unchanged.
- Not covered: WooCommerce.com-style updaters that sign with `Authorization` and a signature through the proxy, and any other licence system.
- Tests: `src/lib/freemius-plugin.test.js` runs the plugin in PHP 8.3 through php-wasm (new development dependencies `@php-wasm/node-8-3` and `@php-wasm/universal`, pinned to 3.1.64 like `@wp-playground/blueprints`); `recipe.test.js` checks the Blueprint step; `playground-host-cors-proxy.test.mjs` checks the method allow-list, refusals for other hosts and the kept protections.
- Evidence helpers in [2026-11-14-freemius-licence-activation/](2026-11-14-freemius-licence-activation/): `techies-freemius-probe.php` (a test-only plugin that sends signed GET and PUT with fake install keys through the Freemius SDK and directly, and prints what came back) and `launch-probe.mjs` (drives the launcher with Playwright: probe, plain and ZIP launches).

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Local, Node 24.22.2 | `scripts/agents/kit unit --affected` after the plugin and proxy changes | Pass | 75 passed, 0 failed (8 files) | Executed through the kit |
| Local, Node 24.22.2 | New proxy and plugin tests before the change | Fail | The licence-host relay, kept-protections and authorized-redirect proxy tests failed (405); the plugin tests failed with the module missing, then against a no-op plugin; the refusal tests passed before and after (they guard existing behaviour) | Executed |
| Headless Chromium 159 (Playwright 1.65.1), launcher built locally (`VITE_PLAYGROUND_ORIGIN=https://preview-wp.techies.tools`), Playground host preview-wp.techies.tools at dev e90c433 | `launch-probe.mjs chromium http://127.0.0.1:4173 probe`, first plugin version (`auth_date` only) | Date check passes | Mu-plugin loaded; raw signed GET went direct with `auth_date` and got 401 "Invalid Authorization header."; SDK GET returned `api_blocked` (the answer had only `content-length` and `content-type` headers); PUT failed direct (CORS, `net::ERR_FAILED`) and got 405 from the old proxy | Executed; led to the opt-in |
| Same, current plugin (with the opt-in) | Same command | SDK GET reaches Freemius | SDK GET and raw GET went through `/cors-proxy.php` with `auth_date` and got 401 "Invalid Authorization header." (no `api_blocked`); PUT still 405 from the not-yet-deployed proxy | Executed |
| Local Node, real network | `handleCorsProxy` from this branch with a signed GET and PUT (fake key, `auth_date`, opt-in) to `api.freemius.com` | Both forwarded | GET 401 and PUT 401 "Invalid Authorization header.", `X-API-Server` present | Executed |
| Deployed preview (preview-play and preview-wp) after landing | `launch-probe.mjs` probe in Chromium; plain and zip in Chromium and Firefox | Signed GET and PUT fail only on "Invalid Authorization header"; launches complete | Recorded by the lead with the release | Pending |

## Result

Locally, the date check passes and the Freemius SDK gets usable answers through the proxy; PUT through the new proxy code reaches Freemius. A real licence activation has not been tried (Lex does that on the preview).

## Disposition and rationale

Kept: it is the smallest change that lets the Freemius SDK talk to its API from a browser, it touches only the two Freemius API hosts, and the proxy's Authorization opt-in rule is unchanged.

## Documentation impact

`CONTEXT.md` (invariant 1), `docs/architecture.md` (module map, Freemius licence calls, proxy row, dependencies), `docs/data-contracts.md` (Blueprint steps), `docs/rebuild-spec.md` (launch step 10), `docs/testing.md` (suite table). Changelog 0.9.1 and the version in `package.json` and `package-lock.json`.

## Follow-ups and open questions

- Lex activates his WP Activity Log licence on the preview, then deactivates it so it does not use up an activation slot.
- WooCommerce.com-style updaters are not covered.
- If Freemius ever allows `X-Cors-Proxy-Allowed-Request-Headers` in its CORS rules, the direct attempt would succeed and the SDK would again see `api_blocked`; the probe above shows it.
