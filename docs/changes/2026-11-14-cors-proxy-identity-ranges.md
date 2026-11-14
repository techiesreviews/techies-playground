# CORS proxy asks for uncompressed bytes on HEAD and range requests

- Date: 2026-11-14
- Owner: fleet-lead build agent (Claude Opus 5.5)
- Status: complete
- Disposition: kept
- Related version: 0.9.0 (production never had the proxy; no bump)
- Related commit/issue: Orbit TOOLS-236; release second look SL-1 (third look) on PR #24; amends [2026-11-14-self-hosted-playground.md](2026-11-14-self-hosted-playground.md)

## Context

The proxy forwarded the browser's `Accept-Encoding`, and Cloudflare sends `br, gzip` on a Worker's outgoing requests. A target that compresses a `206` answer returns a slice of the compressed stream, which cannot be decompressed on its own, and a compressed `HEAD` reports the compressed size. Playground sends ranges directly (`Range`) or tunnelled (`X-Cors-Proxy-Range`).

## Hypothesis and success criteria

Setting `Accept-Encoding: identity` on `HEAD` and on any request with a range keeps sizes and byte offsets about the file itself. Success: a unit test shows `identity` on HEAD, `Range` and `X-Cors-Proxy-Range` requests and the browser's value on a plain GET.

## Options considered

- `identity` only where offsets or sizes matter (chosen): plain downloads keep compression.
- `identity` on every request: larger transfers for no gain.
- Leave unchanged: a compressing target would break partial downloads.

## Implementation or prototype

`playground-host/cors-proxy.js` (`forwardedHeaders`): after the tunnelled range is restored, `HEAD` or any `Range` sets `Accept-Encoding: identity`.

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Local, Node 24.22.2 | `node --test scripts/playground-host-cors-proxy.test.mjs` | Pass | 21 passed, 0 failed | Executed |
| Local, Node 24.22.2 | Same, with the new line removed (restored after) | The new test fails | 20 passed, 1 failed | Executed |
| Local, Node 24.22.2 | `scripts/agents/kit unit` | Pass | 123 passed, 0 failed, 20 files | Executed through the kit |

No real target that compresses ranged answers was tried; the test uses a recording fetch.

## Result

HEAD and range requests reach the target with `Accept-Encoding: identity`.

## Disposition and rationale

Kept: three lines that match what a byte range needs.

## Documentation impact

`docs/architecture.md` (CORS proxy row), `docs/testing.md` (count and table).

## Follow-ups and open questions

- None.
