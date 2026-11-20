# Playground core keeps request bodies in Firefox (our build patch and upstream draft)

- Date: 2026-11-20
- Owner: Claude (Opus 5.5) for Lex
- Status: complete locally; the first patched Playground build runs in CI on the next push to `dev`
- Disposition: kept
- Related version: unreleased (0.10.4 is current)
- Related commit/issue: Orbit TOOLS-254 (follows TOOLS-252); follows [2026-11-15-freemius-activation-firefox.md](2026-11-15-freemius-activation-firefox.md)

## Context

The [Freemius record](2026-11-15-freemius-activation-firefox.md) found that WordPress Playground 3.1.64 loses a POST body in Firefox when it retries a blocked request through the CORS proxy, and fixed it for Freemius only, by sending Freemius calls straight to `/cors-proxy.php`. Any other plugin whose POST (or PUT) is blocked by CORS and retried through the proxy still reaches its server with an empty body in Firefox, so licence activations, form submissions and API calls of that kind fail there.

Two places in Playground core cause it:

- `fetchWithCorsProxy` (`@php-wasm/web-service-worker`) resends `clonedRequest.body` whenever `supportsReadableStreamBody()` says the browser can stream uploads. Firefox does not expose `Request.body` (it is `undefined`), yet passes that probe, because it sends a `ReadableStream` body as the text `[object ReadableStream]` instead of failing. The retry goes out with no body.
- `RawBytesFetch.parseHttpRequest` (`@php-wasm/web`, the TCP-over-fetch bridge that carries PHP's curl and `wp_remote_post()` when the fetch transport is off) always builds the request with a streamed body. In Firefox that body is stringified on a direct fetch and dropped on the proxy retry.

## Hypothesis and success criteria

If the probe also checks that a `Request` built with a stream exposes it as `body`, the retry reads the clone with `arrayBuffer()` when there is no stream, and the TCP bridge buffers its body when streaming is unsupported, then a non-Freemius POST retried through the proxy keeps its body in Firefox, with no change in Chromium.

Success: a browser run in Firefox and Chromium shows the proxy receiving the full body for a plugin POST to a host that is not Freemius, through `fetchWithCorsProxy` and through `RawBytesFetch`; it fails on the unpatched release. Our CI build applies the patch, and an upstream issue or PR text is ready for Lex.

## Options considered

- Patch Playground core in our build and offer the same change upstream (chosen): fixes every plugin, not only Freemius; CI already builds Playground from source, so one `git apply` step carries it until upstream ships it.
- Add more plugin-specific routes to the proxy in the mu-plugin, like Freemius: works per plugin only and needs a change for each one; rejected.
- Buffer the TCP bridge body inside `parseHttpRequest`: simpler, but it deadlocks with `Expect: 100-continue`, because curl sends the body only after the bridge answers "100 Continue", which happens after `parseHttpRequest` returns; rejected. The body is buffered in `fetchRawResponseBytes` instead.
- Wait for upstream only: Firefox users keep losing bodies until a release ships and we update the pin; rejected as the only step.

## Implementation or prototype

- [`playground-host/playground-core.patch`](../../playground-host/playground-core.patch), against WordPress Playground v3.1.64:
  - `supportsReadableStreamBody()` builds the probe `Request` first and reports no streamed uploads when its `body` is not a `ReadableStream`.
  - `fetchWithCorsProxy` uses the clone's stream only when the probe passes and `clonedRequest.body` is a `ReadableStream`; otherwise it reads `clonedRequest.arrayBuffer()`.
  - `parseHttpRequest` builds the request without the stream when streamed uploads are unsupported and returns the stream as `bodyToBuffer`; `fetchRawResponseBytes(request, corsProxyUrl, bodyToBuffer)` reads it in full before the fetch, after the "100 Continue" answer. Both callers pass it on.
  - Upstream spec tests for each part (`utils.spec.ts`, `fetch-with-cors-proxy.spec.ts`, `tcp-over-fetch-websocket.spec.ts`), so the same diff can be offered upstream.
- [`.github/workflows/deploy-site.yml`](../../.github/workflows/deploy-site.yml):
  - The `settings` job checks out the patch with `package.json` and outputs its SHA-256 as `playground_patch_sha256`.
  - The `playground-build` job still has no token permissions and no checkout of our repository (upstream's install scripts are untrusted). After the clone it downloads the patch from `raw.githubusercontent.com` at the commit being deployed (the repository is public), checks it against that hash, and applies it with `git apply` before `npm ci`. If it no longer applies, the build stops with a message to remove or update the patch.
  - The build cache key gains `-patch-<sha256>` in both the build and host jobs, so a changed patch rebuilds Playground.
- [`scripts/deploy-workflow.test.mjs`](../../scripts/deploy-workflow.test.mjs): two tests, one for the workflow wiring (checkout, hash output, cache keys, download by commit, hash check, apply before install, no permissions) and one for the patch content.
- Upstream draft for Lex: [upstream-issue.md](2026-11-20-playground-core-request-body-firefox/upstream-issue.md).

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| This repository, Node 24.22.2 | `node --test scripts/deploy-workflow.test.mjs` with the two new tests, before the patch file and workflow change | New tests fail | Both failed: "the settings job checks out the patch" and ENOENT for `playground-host/playground-core.patch` | Terminal run, 2026-11-20 |
| Same | `scripts/agents/kit unit --affected` after the change | All pass | `RESULT: ok unit 6/6 (1 files)` | `.scratch/unit/20261120T094302-3332066.log` (local) |
| Sparse checkout of WordPress Playground tag `v3.1.64`, vitest 3.2.4 | Upstream specs `utils.spec.ts`, `fetch-with-cors-proxy.spec.ts`, `tcp-over-fetch-websocket.spec.ts` with the new tests, source unpatched | The 5 new Firefox tests fail, the rest pass | `Tests 5 failed \| 67 passed (72)`: the 5 new tests, including the chunked body that ends at the zero-length chunk while the socket stays open | Terminal run, 2026-11-20 |
| Same | Same specs with `playground-host/playground-core.patch` applied | All pass | `Test Files 3 passed (3)`, `Tests 72 passed (72)` | Terminal run, 2026-11-20 |
| Same, clean tree | `git apply --check --verbose` then `git apply playground-host/playground-core.patch`; compare `git diff` with the source diff | Applies cleanly, same result | Exit 0; `git diff` identical to the source diff | Terminal run, 2026-11-20 |
| Sparse checkout of WordPress Playground `trunk` at 5e4e5d6 (2026-11-19) | `cmp` of the three changed source files with `v3.1.64`; `git apply --check playground-host/playground-core.patch` | Same code upstream | The three files are byte-identical to `v3.1.64`; the patch applies (exit 0) | Terminal run, 2026-11-20 |
| Sparse checkout of `v3.1.64`, TypeScript 5.9.3 | `tsc --noEmit --strict` on the three changed source files, unpatched and patched | No new errors | 125 identical lines both times (existing typing gaps in the local check setup, none in the changed lines) | Terminal run, 2026-11-20 |
| Playwright 1.65.1: Firefox (build 1572), Chromium (build 1255); local echo proxy | `PLAYWRIGHT=… node docs/changes/2026-11-20-playground-core-request-body-firefox/proxy-retry-body.mjs <v3.1.64 checkout>`, unpatched. POST `plugin=not-freemius&licence_key=TEST-KEY-123` to `https://non-freemius.invalid/wp-json/example-plugin/v1/activate`, which fails directly, so it is retried through the proxy | Firefox loses the body | Firefox: all 4 cases "lost the body, proxy got """ (`fetchWithCorsProxy` with a Request, with URL and init; `RawBytesFetch` with `Expect: 100-continue`, with Content-Length and chunked); Chromium: all 4 kept the body; exit 1 | Terminal run, 2026-11-20 |
| Same | Same script, checkout with the patch applied | Every case keeps the body | Firefox and Chromium: all 4 cases "kept the body"; "every request kept its body"; exit 0 | Terminal run, 2026-11-20 |
| Not run | Upstream `npm run build:website` with the patch (the CI build takes up to an hour and needs more memory than the shared machine had free) | | Not run locally; the first patched build runs in the `playground-build` job on the next push to `dev`, which fails if the patch does not apply or its hash differs | |

Not tested here: a real plugin's activation inside a running Playground in Firefox on the preview, and Safari. Safari's probe already fails, so its service-worker retry took the `arrayBuffer()` path before and still does. Its TCP bridge path does change: with the patch, `RawBytesFetch` buffers the body in Safari too instead of passing a stream, which is the path the Firefox runs above prove, but it was not run in Safari (no WebKit build was installed on the shared machine).

## Result

With the patch, the proxy receives the full body in Firefox for a non-Freemius POST, through both the service worker's retry and the TCP bridge, including the delayed body of `Expect: 100-continue` with Content-Length or chunked framing. Chromium behaves as before. Without it, Firefox sends the retry with an empty body in all four cases.

## Disposition and rationale

Kept. It fixes the body loss for every plugin in our build and costs one verified `git apply` step. The Freemius route to the proxy in the mu-plugin stays: it also avoids a failing first request and does not depend on this patch.

## Documentation impact

- New: this record, its [evidence folder](2026-11-20-playground-core-request-body-firefox/) and the patch file with its own header.
- `docs/testing.md` (the `deploy-workflow.test.mjs` row names the patch checks) and `docs/architecture.md` (the Freemius paragraph says our build now fixes the retry).
- Users will notice the fix in Firefox (plugin licence activations and form posts that go through the proxy work again), so it has its own `CHANGELOG_ENTRIES` item and the patch version 0.10.5. The other open PR that also bumps the version (#42) moves to the next patch version when it lands.

## Follow-ups and open questions

- Lex: send the upstream report (draft in [upstream-issue.md](2026-11-20-playground-core-request-body-firefox/upstream-issue.md)).
- Fleet lead, after this lands: check the first `playground-build` run on `dev`, then in T3 on the preview, in Firefox with Chromium as a control, launch a non-Freemius plugin whose licence activation or form POST goes to a host that blocks CORS. Record as a new evidence row the plugin, the WordPress and PHP versions, the packages, the persistence mode, what the plugin showed, the `/cors-proxy.php?` request with its non-empty body, and any console or network errors.
- When the pinned Playground release contains the fix, remove the patch and its workflow steps; the build fails if the patch stops applying.
