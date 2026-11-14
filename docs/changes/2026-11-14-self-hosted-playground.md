# Self-hosted WordPress Playground on wp.techies.tools

- Date: 2026-11-14
- Owner: fleet-lead build agent (Claude Opus 5.5)
- Status: in-progress
- Disposition: pending
- Related version: 0.9.0
- Related commit/issue: Orbit TOOLS-236; upstream WordPress/wordpress-playground#4419 (fix PR #4557 open)

## Context

For the user, every launch on play.techies.tools ended in Playground's "Ooops! WordPress Playground had a hiccup!" screen. The diagnosis traced it to upstream issue #4419: playground.wordpress.net's bot check answers some Chromium browsers and networks with a 403 page inside the cross-site frame, so `remote.html` never boots. The launcher pinned `@wp-playground/client` 3.1.47 while the remote ran 3.1.64. The user chose to self-host Playground's own files on a subdomain.

## Hypothesis and success criteria

Serving Playground's website from our own Cloudflare Worker removes the dependency on playground.wordpress.net's bot check. Success: on the deployed preview, five launches in a row succeed in Chromium and Firefox for plain WordPress, a launch with an uploaded plugin ZIP, and a resumed browser-saved site; a runtime that never becomes ready fails with a clear message instead of hanging.

## Options considered

- Wait for upstream PR #4557: no date, and the live stream is on 2026-11-17.
- Serve Playground from play.techies.tools itself: rejected; it would put WordPress plugin code and Playground's service worker on the origin that holds the licence and ZIP vaults.
- A second Worker with static assets on its own subdomain (chosen): `wp.techies.tools`, `preview-wp.techies.tools` for the preview.

## Implementation

- `playground-host/`: a Worker with static assets. CI clones WordPress/wordpress-playground at the tag matching the `@wp-playground/blueprints` pin (v3.1.64), runs `npm run build:website` with `CORS_PROXY_URL=/cors-proxy/?`, and caches the output per version.
- `scripts/prepare-playground-host.mjs` trims the build to fit Cloudflare's Free-plan limits (20,000 files, 25 MiB per file): no source maps, PHP 5.2, WordPress beta/nightly, demos, test fixtures or PHP endpoints; every file in Playground's offline-cache list is kept. Files above 25 MiB (`wp-7.1/wordpress-static.zip`, the intl ICU data) are split into parts the Worker joins on request. It writes `_headers`: `frame-ancestors 'self'` plus the launcher origins, a one-year immutable cache for hashed `/assets/`, one hour for `/wp-<version>/` (as upstream), and `Access-Control-Allow-Origin: *` for `/client/`. No COOP/COEP. `/remote.html` is served as is (`html_handling: none`).
- `playground-host/cors-proxy.js`: Playground's public proxy (`wordpress-playground-cors-proxy.net`) only answers `playground.wordpress.net`. Without our own, exact WordPress releases (for example 7.1.4, which the launcher requests after resolving `latest`) and WordPress's outgoing requests that browsers block could not load. The proxy refuses browsers on other sites (`Sec-Fetch-Site`), follows upstream's header rules (no cookies, Authorization on opt-in, redirects relayed through the proxy, `X-Playground-Cors-Proxy` on every answer), refuses private, reserved and own-host targets, caps responses at 100 MB (declared or streamed), and, because any non-browser client can still call it, applies a per-visitor rate limit (300 a minute, counted per Cloudflare location). A shared limit was tried in review round 2 and removed: it is also counted per location, protects no cost on the Free plan, and would let a few abusers block every visitor in a region. A site-wide cap, if wanted, belongs in a Cloudflare WAF rate-limiting rule. Worker request logging is off because proxied URLs can carry licence keys.
- Launcher: `src/lib/playground-host.js` is the one setting (`https://wp.techies.tools`; preview builds set `VITE_PLAYGROUND_ORIGIN`). `startPlaygroundWeb` only accepts a `remote.html` from playground.wordpress.net, the page's origin or the origin its own script came from, so the launcher imports `client/index.js` from the host (the documented self-hosting route) and no longer bundles `@wp-playground/client`. Loading the client, booting and starting WordPress must finish within two minutes (until `onClientConnected`); the Blueprint steps after it, such as WordPress.org plugin installs, have no deadline. `worker.js` allows its own environment's host (preview-play: preview-wp; otherwise wp) and playground.wordpress.net (for the one-line switch back) in `frame-src` and `script-src`. Saved-site lists are kept per Playground host, because OPFS belongs to the host's origin.
- Deploys: `deploy-site.yml` is shared by `deploy.yml` (production, from `main`) and the new `deploy-preview.yml` (every push to `dev`). Upstream's build runs in its own job with no token permissions and no secrets; the deploy job restores its output from the Actions cache, prepares and deploys the host, then tests, builds and deploys the launcher. Only `CLOUDFLARE_API_TOKEN` is passed to the shared workflow.
- `/plugin-proxy` is not ported: Playground uses it only for WordPress core and Gutenberg pull-request previews, which the launcher never requests.

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Node 24.22.2 | `npm test` | Pass | 108 tests pass | Local run |
| Node 24.22.2 | `scripts/agents/kit build` | Build succeeds | Build succeeds | Local run |
| Local, Playground 3.1.64 built from source | `node scripts/prepare-playground-host.mjs …` | Under the limits | 17,795 files; two files split | Local run |
| Local `wrangler dev` host + `vite preview` launcher, Playwright 1.63 Chromium | Plain WordPress, temporary | Ready | "Ready on WordPress 7.1.4." in 10 s; admin bar present | Local run |
| Same, Chromium | Upload a synthetic plugin ZIP, launch | Plugin active | Ready in 11.5 s; plugin's admin notice present | Local run |
| Same, Chromium | Browser-saved site: change Reading → posts per page, close, reload, relaunch | Setting kept | Second launch ready in 4.3 s; setting kept | Local run |
| Same, Playwright Firefox | Plain, ZIP and resume as above | Same results | All three pass (resume needs the persistent-storage prompt answered) | Local run |
| Local host whose `remote.html` answers 403 | Launch | Timeout message | After 120.5 s: "WordPress Playground did not start within 2 minutes. Check your connection, then launch again." | Local run |
| Same local setup at f7012d5, Chromium | Plain launch; uploaded ZIP launch | Ready | Plain ready in 11.6 s (admin bar present); ZIP ready in 11.5 s (plugin active) | Local run |
| Same at f7012d5, Chromium | WordPress.org plugins in the Blueprint: query-monitor + wordpress-seo; woocommerce | Installed and active | Ready in 16.7 s and 28 s; all listed plugins active (direct downloads, no proxy needed) | Local run |
| Same at f7012d5, launcher built with the deadline lowered to 15 s (not committed) | woocommerce + query-monitor + wordpress-seo | The deadline stops before Blueprint installs | Ready in 27.3 s, past the 15 s deadline; all three active | Local run |
| Host whose `remote.html` answers 403, at f7012d5 | Launch | Timeout message | After 120.3 s: the two-minute message | Local run |
| Same at f7012d5, Chromium | woocommerce + jetpack + elementor + wordpress-seo + query-monitor together | Installed | Ready in 39.4 s, but one `wp-admin/plugins.php` request answers HTTP 500, then Elementor's onboarding redirect loads. With `WP_DEBUG_LOG` the log shows `Allowed memory size of 268435456 bytes exhausted` in Playground's SQLite layer (`class-wp-mysql-on-sqlite.php`) | Local run |
| Launcher at f7012d5 pointed at `https://playground.wordpress.net` (its remote reports build `ada3b06`, newer than the 3.1.64 release) | Same five plugins | Compare | Ready in 40.9 s; all five active; no 500. The difference is the Playground build, not the trimming or the split files: 3.1.64 is the newest release tag, and the next bump (follow-up below) should pick up the fix | Local run |
| Local at f7012d5, Chromium | Browser-saved site: change Reading → posts per page, close, reload, relaunch | Setting kept | First launch 15.1 s, resume 5.4 s, setting kept | Local run |
| Local at f7012d5, Playwright Firefox | Plain; uploaded ZIP; resume | Ready; plugin active; setting kept | 11.9 s; 11.8 s with the plugin active; 19.6 s then resume 6.5 s with the setting kept. Each run logs one Firefox service-worker message, "Failed to load ''", with no visible effect | Local run |
| Deployed preview | Five launches per scenario in Chromium and Firefox | All succeed | Pending until the preview deploys from `dev` | — |

## Result

Pending the deployed-preview proof. Two findings changed the plan: the client's remote-URL allowlist (solved by loading the client from the host) and the public CORS proxy's origin allowlist (solved by our own proxy).

## Disposition and rationale

Pending the preview proof and the user's go for production.

## Documentation impact

`CONTEXT.md`, `docs/architecture.md`, `docs/rebuild-spec.md`, `docs/data-contracts.md`, `docs/testing.md`; changelog entry and version 0.9.0.

## Follow-ups and open questions

- A scheduled workflow that bumps `@wp-playground/blueprints` and the self-hosted build together and joins the security checks (not built here).
- Firefox asks before granting persistent storage; a launch with browser storage waits for that answer (unchanged behaviour).
- Five heavy WordPress.org plugins together exhaust PHP's 256 MB in the 3.1.64 build's SQLite layer on one admin request; the public site's newer build does not. The scheduled bump should fix it.
