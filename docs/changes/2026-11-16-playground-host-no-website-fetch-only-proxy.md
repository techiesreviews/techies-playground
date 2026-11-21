# Playground host: no public website pages, CORS proxy answers fetch() only

- Date: 2026-11-16
- Owner: fleet-lead (builder: Claude Opus 5.5)
- Status: in-progress
- Disposition: pending
- Related version: unreleased
- Related commit/issue: TOOLS-324 (security pick S1 and S2 from the TOOLS-268 architecture review, picked under TOOLS-294)

## Context

The 2026-11-15 architecture review found two risks on the Playground host origin (`wp.techies.tools`, preview `preview-wp.techies.tools`), which holds saved sites (OPFS) and, after a licence fill, Freemius licence keys in those sites' databases:

- S1 (medium): the host served Playground's full public website. `index.html?blueprint-url=…`, `api.html`, the builder, the demos and the other start pages run anyone's Blueprint, with their own code, on that origin. `scripts/prepare-playground-host.mjs` kept `index.html`, and every file named in `assets-required-for-offline-mode.json`, which names the website pages too. Read-only check on 2026-11-16: `preview-wp.techies.tools` answered 200 for `/index.html`, `/api.html`, `/wordpress.html`, `/gutenberg.html`, `/builder/builder.html`, `/php-playground.html` and `/php-code-snippet-demo.html`.
- S2 (low): the CORS proxy (`playground-host/cors-proxy.js`) relayed an outside file with its own Content-Type to any same-origin request. A plugin under test could register an outside script as a service worker for the whole host through it, which would outlive the site and see later launches.

## Hypothesis and success criteria

- The host build keeps only the pages the launcher needs: `remote.html`, and `wordpress-bridge.html` and `wordpress-popup.html`, which the remote opens. WordPress's own static pages (`readme.html`, `wp-includes/empty.html`) stay with their release.
- The proxy answers only requests with `Sec-Fetch-Dest: empty` (what `fetch()` and XHR send, so Playground and the Freemius must-use plugin) and refuses pages, frames, scripts, workers and images with 403.
- A launch, plugin installs and the Freemius licence flow keep working on preview-wp.

## Options considered

- Leave unchanged: keeps the one medium risk open.
- Drop only `index.html`: leaves `api.html`, the builder and the other start pages, which do the same.
- Allow-list the launcher's pages (chosen): every HTML file outside the WordPress release folders (`wp-<x.y>`, `wp-beta`, `wp-nightly`, `wp-trunk`) is dropped unless it is one of the three launcher pages, before the offline-list exception. The offline prefetch only runs when the WordPress site runs on the host origin, and it already fails on `/`, which the host has never served (`html_handling: none`; `/` answers 404 today), so leaving listed pages out changes nothing that worked.
- For S2, refusing only `serviceworker` and `script`: an allow-list of `empty` is shorter and also covers documents, frames, workers and images.

## Implementation or prototype

- `scripts/prepare-playground-host.mjs`: `isKept` drops HTML pages other than the launcher pages and WordPress release files, ahead of the offline-list exception; `php-8-6.html` is covered by the new rule.
- `scripts/prepare-playground-host.mjs` also starts the prepared `remote.html` with an inline script that runs before Playground's own scripts. The GPT second look found that Playground's service worker answers a page it once cached without asking the server (cache first, ignoring the query string) and keeps that cache until a new Playground release, whose cache name comes from the upstream commit, so rebuilding the same release would not clear it: a browser that had opened `/index.html` before could keep opening it. That page starts Playground by framing `remote.html`, which the worker always fetches fresh from the server. So the script lets Playground start only inside a launcher's frame on another origin (the host's frame rules allow only the launchers and the host itself, and every launcher is on another origin). Opened as its own window, or framed by a page of the host origin, `remote.html` calls `window.stop()` and empties the page. By source inspection (the HTML standard's "abort a document" stops the parser), that ends the parse before it reaches Playground's module scripts; the Node tests only check the calls on a fake window, and the browser check is in the evidence table. This closes the direct case of the question Claude's review raised: Playground 3.1.64's remote takes Comlink messages from any origin (`exposeAPI` in `@php-wasm/universal` uses `windowEndpoint(self.parent)`), so a site that opened `remote.html` in a new window might have been able to drive it. The indirect case stays open (see Follow-ups). The script also deletes website pages (HTML outside the WordPress release folders, other than the launcher pages) from Playground's `playground-cache-*` caches.
- `playground-host/cors-proxy.js`: `isFetchRequest` (`Sec-Fetch-Dest: empty`) joins the same-origin gate, so OPTIONS and the Freemius PUT, PATCH and DELETE go through it too.
- `.github/workflows/deploy-site.yml`: before the deploy, the host job refuses a prepared folder with `index.html` or with any page outside the WordPress release folders (`wp-<x.y>`, `wp-beta`, `wp-nightly`, `wp-trunk`) other than the three launcher pages; after it, it checks the host answers 404 for `/index.html`.
- Dependencies (review finding S4): vite 7.3.6 → 7.3.8, wrangler 4.122.0 → 4.155.0, the sharp override 0.35.4 → 0.35.5, plus `npm audit fix` for the build tools below them (undici, source-map-js, fast-uri). `npm audit`: 10 (7 high, 3 moderate) before, 3 (1 high, 2 moderate) after. What is left is isomorphic-git through `@wp-playground/blueprints`, which only clears with an upstream Playground release and is not reachable from the launcher (see the review).

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Local, before the change | `node --test scripts/prepare-playground-host.test.mjs scripts/playground-host-cors-proxy.test.mjs` with the new tests | New tests fail | 4 failed: website pages kept, host folder kept `index.html`, a `script`/`document` destination relayed, a Freemius PUT with `Sec-Fetch-Dest: document` relayed | Local run |
| Local, before the workflow change | `node --test scripts/deploy-workflow.test.mjs` | New test fails | 1 failed: no `index.html` guard | Local run |
| Local, after | `npm test` | All pass | 171 passed, 0 failed | Local run |
| Local | `npm run build`; `npx wrangler deploy --dry-run` | Build and dry run succeed | Both succeeded with vite 7.3.8 and wrangler 4.155.0 | Local run |
| Local, before the guard | `node --test scripts/prepare-playground-host.test.mjs` with the cleanup and guard tests | New tests fail | Failed: no cleanup or guard export | Local run |
| Local | The guard applied to preview-wp's live `remote.html`; its inline script parsed | Parses, comes before the module scripts | Parsed; first thing in `<head>` | Local run |
| Local | `npm audit` before and after | High count drops | 7 high, 3 moderate → 1 high, 2 moderate | Local run |
| preview-wp, after the merge to dev | Start a site, install a plugin, licence fill, Checks; `/index.html` answers 404; `/remote.html` opened on its own shows nothing; the proxy refuses a navigation | All work | Not run yet | — |


## Result

The host no longer serves a page that starts a Playground from its URL, and the proxy only answers `fetch()` and XHR.

## Disposition and rationale

Pending the preview-wp check. Expected: kept, as it closes the review's one medium risk and one low risk without changing what a person sees.

## Documentation impact

`docs/architecture.md` (Playground host and CORS proxy rows), `docs/testing.md` (host build, proxy and workflow tests). No changelog or version change: nothing a person sees changes.

## Follow-ups and open questions

- S5 (the launcher still trusts playground.wordpress.net for scripts and frames) and the isomorphic-git warning stay open.
- `wordpress-bridge.html` and `wordpress-popup.html` stay as upstream builds them; they only work with a Playground that `remote.html` started.
- A site that opens play.techies.tools in a new window keeps a handle to it (the launcher sends no `Cross-Origin-Opener-Policy`). Once a site is started in that window, it could message the launcher's `remote.html` frame, which passes the guard, and Playground's remote takes Comlink messages from any origin. Not tried. A possible fix: `Cross-Origin-Opener-Policy: same-origin-allow-popups` on the launcher (`worker.js`), which keeps the launcher's own popups and preview tabs.
