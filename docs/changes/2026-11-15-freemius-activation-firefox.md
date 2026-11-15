# Freemius licence activation in Firefox

- Date: 2026-11-15
- Owner: fleet-lead build agent (Claude Opus 5.5)
- Status: in-progress; the deployed-preview check is recorded below once the change lands on `dev`
- Disposition: pending (kept once the preview check passes)
- Related version: 0.10.1
- Related commit/issue: Orbit TOOLS-252 (parent TOOLS-249); follows [2026-11-14-freemius-licence-activation.md](2026-11-14-freemius-licence-activation.md)

## Context

After 0.9.1, Freemius licence activation worked on the preview in Chromium, but in Firefox Menu Image with a fake key showed "Your server is blocking the access to Freemius' API, which is crucial for Menu Image synchronization". The lead's report said Playground drops the request body when it retries a Freemius call through our proxy.

## Investigation

Reproduced on the deployed preview (preview-play and preview-wp at `dev` 8e4a40c, Playwright 1.65.1, headless Firefox and Chromium) before changing anything:

- The 2026-11-14 probe (signed GET and PUT with fake install keys, FooGallery's SDK): both browsers get 401 "Invalid Authorization header.", but Freemius echoes the parameters it received, and in Firefox the PUT's echo has no `is_active`; Chromium's has `"is_active":true`. Firefox's PUT went direct, failed (`NS_ERROR_DOM_BAD_URI`), and the proxy retry reached Freemius with an empty body.
- The real activation path (`activate_migrated_license` on Menu Image, as the launcher's key fill calls it): with a new install the SDK posts the key as a form to `https://wp.freemius.com/action/service/user/install/`, a host the 0.9.1 plugin did not touch. In Firefox the empty POST makes Freemius answer with its HTML "License Activation" page, which the SDK cannot parse and reports as `ApiBlocked` — Lex's message. Chromium gets `{"error":"Invalid license key."}`.

Where the body is lost (source inspection of Playground v3.1.64, confirmed in the browsers):

- WordPress's HTTP API in Playground uses the fetch transport (`USE_FETCH_FOR_REQUESTS`, `Wp_Http_Fetch`), so the request reaches JavaScript with a string body and goes to `fetchWithCorsProxy` (`packages/php-wasm/web-service-worker/src/lib/fetch-with-cors-proxy.ts`).
- It clones the request, tries the target directly and, when the browser blocks it, rebuilds the request for the proxy. For the body it calls `supportsReadableStreamBody()` (`utils.ts`): a `fetch('data:,', { method: 'POST', body: <ReadableStream>, duplex: 'half' })` probe. Firefox has no streamed uploads, but it passes the probe because it turns the stream into the text `[object ReadableStream]`. The retry then uses `clonedRequest.body`, which Firefox does not expose (`undefined`), so the proxied request has no body.
- `firefox-stream-body.mjs` shows each step: in Firefox `new Request(..., { body: stream })` has `body` undefined and its text is `[object ReadableStream]`, the probe passes, and a string-bodied request's `body` is `undefined`; in Chromium all three behave as streams.
- Not the cause: our Worker (the proxy forwards `request.body`; Chromium's bodies arrive) or the mu-plugin (the body leaves PHP intact; the probe logs it).
- Related, not hit here: `tcp-over-fetch-websocket.ts` (`parseHttpRequest`) builds every raw-socket request with a `ReadableStream` body, which Firefox would turn into `[object ReadableStream]` for any direct POST; WordPress's own requests do not take that path while the fetch transport is on.

## Hypothesis and success criteria

A Freemius call sent straight to the proxy on the site's own host succeeds on the first attempt, so the retry that loses the body never runs. Success: on the deployed preview, in Firefox and Chromium, Menu Image's activation with a fake key ends in Freemius's "Invalid license key." and the signed PUT's echo carries its body; plain and plugin-ZIP launches still work.

## Options considered

- Send Freemius calls straight to `/cors-proxy.php` from the mu-plugin (chosen): one small change in our code, no change to Playground or the proxy, removes a failing request per call, and no longer depends on Freemius refusing the opt-in header (a follow-up risk named in the 0.9.1 record).
- Carry the body in a header for the proxy to restore: needs a new proxy contract and header size limits; rejected.
- Fix Playground core: in `fetchWithCorsProxy`, take the clone's stream only when `clonedRequest.body` is a `ReadableStream` and otherwise `await clonedRequest.arrayBuffer()` (or make `supportsReadableStreamBody()` check that a `Request` built with a stream exposes it as `body`); `parseHttpRequest` needs the same check before building a streamed body. This is the right upstream fix (CI builds Playground from source and could apply a patch), but it is not needed for Freemius and would add a patch step to the host build; recommended as an upstream issue and PR.
- Leave unchanged: Freemius licences cannot be activated in Firefox.

## Implementation

- `src/lib/freemius-plugin.js`: the filter now also covers `wp.freemius.com`, and after stamping `auth_date` and adding the Authorization opt-in it prefixes the URL with `<site scheme>://<site host>[:port]/cors-proxy.php?` (from `site_url()`). The repeated request targets the Playground host, so the filter lets it through. Without a usable site address it behaves as before (stamped, opted in, sent to Freemius).
- No proxy change: POST already passes for any public target and PUT, PATCH, DELETE for the Freemius API hosts; a same-origin call carries `Sec-Fetch-Site: same-origin`.
- Tests: `src/lib/freemius-plugin.test.js` stubs `site_url()` and expects the proxy address (built from `CORS_PROXY_PATH` in `playground-host/cors-proxy.js`, so the PHP and the Worker agree), the `wp.freemius.com` POST with its body unchanged, scheme/host/port handling, the fallback without a site address, and the proxy address itself left alone.
- Evidence helpers in [2026-11-15-freemius-activation-firefox/](2026-11-15-freemius-activation-firefox/).

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Deployed preview at `dev` 8e4a40c, Playwright 1.65.1 headless Firefox and Chromium | 2026-11-14 `launch-probe.mjs … probe` (FooGallery, signed GET/PUT, fake key) | Compare | Both 401 "Invalid Authorization header."; Firefox PUT echo `{"auth_date":…,"install_id":"1234567"}` (no body), Chromium `{"auth_date":…,"is_active":true,"install_id":"1234567"}` | Executed 2026-11-15 |
| Same | Activation probe (Menu Image, `activate_migrated_license` with a fake key) | Compare | Firefox: `ApiBlocked` "Your server is blocking the access to Freemius' API…", answer was Freemius's HTML "License Activation" page; Chromium: "Invalid license key." | Executed 2026-11-15 |
| Same, Firefox and Chromium | Test plugin sending the signed PUT and the opt-in POST once normally and once straight to `/cors-proxy.php` | Straight to the proxy keeps the body | Firefox normal: PUT echo without `is_active`, POST answered with the HTML page; Firefox straight: PUT echo with `"is_active":true`, POST `{"error":"Plugin does not exist."}` (form body read). Chromium: same answers both ways | Executed 2026-11-15 (prototype before the change) |
| Same page, both browsers | `firefox-stream-body.mjs` | Explain the loss | Firefox: stream body `undefined`, text `[object ReadableStream]`, probe passes, string body's `Request.body` `undefined`; Chromium: streams throughout | Executed |
| Local, Node 24.22.2 | `node --test src/lib/freemius-plugin.test.js` with the new tests, before the plugin change | New tests fail | 6 failed (proxy address, `wp.freemius.com`, scheme/host/port, and the updated expectations), 4 passed (the fallback and untouched-host tests guard existing behaviour) | Executed |
| Local, Node 24.22.2 | Same after the change; `scripts/agents/kit unit --affected` | Pass | 10/10; RESULT: ok unit 49/49 (6 files) | Executed |
| Launcher built from this branch (`VITE_PLAYGROUND_ORIGIN=https://preview-wp.techies.tools`, `vite preview` on 127.0.0.1:4173), host preview-wp at 8e4a40c, Firefox and Chromium | Activation probe (Menu Image, fake key) | "Invalid license key." in both | Both: "Invalid license key."; the one Freemius request was `POST https://preview-wp.techies.tools/cors-proxy.php?https://wp.freemius.com/action/service/user/install/` → 200 `{"error":"Invalid license key."}` | Executed |
| Same | `launch-probe.mjs … probe` (signed GET/PUT) | Body kept | Both browsers: all four calls went to `/cors-proxy.php`, 401 "Invalid Authorization header.", PUT echoes carry `"is_active":true` | Executed |
| Deployed preview after landing on `dev` | Activation probe, signed GET/PUT probe, plain and ZIP launches in Firefox and Chromium | As above; launches complete | Recorded after the deploy | Pending |

## Result

The body was lost in Playground's CORS retry in Firefox, not in our proxy or plugin. Sending Freemius calls straight to the proxy avoids that retry; locally against the deployed host, both browsers now reach Freemius with the body and get Freemius's own answers.

## Disposition and rationale

Pending, expected kept: the smallest change in our code that makes activation work in Firefox, with Chromium unchanged in outcome.

## Documentation impact

`CONTEXT.md` (invariant 1, version), `docs/architecture.md` (Freemius licence calls), `docs/testing.md` (suite table), changelog 0.10.1 in `src/App.jsx`, `package.json`, `package-lock.json`.

## Follow-ups and open questions

- Report the Firefox body loss upstream (WordPress/wordpress-playground): `fetchWithCorsProxy` retry and `parseHttpRequest`, with the fix sketched above. Any other plugin whose blocked POST is retried through the proxy still loses its body in Firefox.
- If Playground is switched back to playground.wordpress.net, `/cors-proxy.php` does not exist there and Freemius calls fail; Freemius did not work there before either.
- Lex's real licence test on the preview (WP Activity Log), in Firefox too.
