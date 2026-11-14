# CORS proxy on /cors-proxy.php so the service worker never caches it

- Date: 2026-11-14
- Owner: fleet-lead build agent (Claude Opus 5.5)
- Status: complete; deployed-preview check pending at writing (recorded in the release PR)
- Disposition: kept
- Related version: 0.9.0 (production never had the bug; no bump)
- Related commit/issue: Orbit TOOLS-236; release second look SL-1 on PR #24; amends [2026-11-14-self-hosted-playground.md](2026-11-14-self-hosted-playground.md)

## Context

Our Playground build used `CORS_PROXY_URL=/cors-proxy/?`, so proxied requests went to the Playground host's own origin. Playground's service worker (`sw.js`, function `dn` then `Qn` in the 3.1.64 build) treats any same-origin GET whose path does not end in `.php` (and is not a `/scope:` path) as a static file: it answers from the `playground-cache-*` cache with `ignoreSearch: true` and stores the first answer. Every `/cors-proxy/?<url>` therefore shared one cache entry, and a second proxied URL got the first one's body. Upstream does not hit this because its proxy is on another origin.

## Hypothesis and success criteria

A proxy path that ends in `.php` is passed straight to the network by the service worker (`dn` returns false for `.php`), except for a URL containing `wordpress-static.zip`, which `dn` caches on any path; the proxy refuses those (400) so no proxied answer is stored. Playground loads its own `wordpress-static.zip` from the host (`/wp-<version>/wordpress-static.zip`), never through the proxy. Success: on the deployed preview, two different proxied URLs return different bodies and CacheStorage holds no proxy entry.

## Options considered

- `.php` path on the same host (chosen): two constants and the build setting; no new host or DNS.
- Proxy on a separate origin (as upstream): new subdomain, Worker route and CORS rules; more to deploy before the release.
- Serve a patched `sw.js`: changes upstream code on every build; fragile.

## Implementation or prototype

`playground-host/cors-proxy.js`: `CORS_PROXY_PATH` is `/cors-proxy.php` (worker routing and relayed redirects use it). `.github/workflows/deploy-site.yml`: `CORS_PROXY_URL: /cors-proxy.php?`, build cache key `-cors-proxy-v2`, the host job checks the build contains `"/cors-proxy.php?"`. `prepare-playground-host.mjs` already drops `.php` files, so no static file shadows the path. The proxy answers 400 to any request URL containing `wordpress-static.zip` (second look on this fix). Tests: the old path is no longer the proxy, the path ends in `.php`, `wordpress-static.zip` URLs are refused without an upstream call, and `deploy-workflow.test.mjs` ties the build setting and the host check to `CORS_PROXY_PATH`.

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Headless Chromium (Playwright), preview-wp.techies.tools at dev 6e3a998 (old path) | Open `/remote.html`, wait for the service worker, reload, fetch `/cors-proxy/?https://api.wordpress.org/core/version-check/1.7/` then `/cors-proxy/?https://api.wordpress.org/plugins/info/1.2/?action=plugin_information&request[slug]=hello-dolly` | Different bodies | Both returned the version-check body; CacheStorage held one `/cors-proxy/?…version-check…` entry | Executed; reproduces the bug |
| Source inspection, `sw.js` and the worker of the 3.1.64 build | Read `dn`, `Qn` and `getWordPressStaticZipUrl` | `.php` paths not cached | `dn` returns false when the path ends in `.php`, unless the URL contains `wordpress-static.zip`; Playground builds that file's URL as a same-origin path | Inspection |
| Local, Node 24.22.2 | `scripts/agents/kit unit` | Pass | 122 passed, 0 failed, 20 files | Executed through the kit |
| Deployed preview after landing | Same browser check with `/cors-proxy.php?` | Different bodies, no proxy cache entry | Recorded in the release PR | Pending |

## Result

Expected from reading `sw.js`: `.php` proxy paths skip the service worker's cache, and the one exception is refused by the proxy. The executed check on the deployed preview is pending at writing; the release PR records it.

## Disposition and rationale

Kept: smallest change that removes the shared cache entry without a new host.

## Documentation impact

`CONTEXT.md`, `docs/architecture.md` (CORS proxy row), `docs/testing.md` (count and table, including the `deploy-workflow.test.mjs` row). Changelog unchanged: the bug only reached the preview.

## Follow-ups and open questions

- An automated browser test with the service worker active (two proxied targets) is not in the suite.
