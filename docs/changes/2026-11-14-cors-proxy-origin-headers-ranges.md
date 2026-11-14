# CORS proxy: no storage-wiping headers, and a clear error for compressed ranges

- Date: 2026-11-14
- Owner: fleet-lead build agent (Claude Opus 5.5)
- Status: complete; the deployed-preview check is recorded in the release PR
- Disposition: kept
- Related version: 0.9.0 (production never had the proxy; no bump)
- Related commit/issue: Orbit TOOLS-236; release second look SL-1 (P0) and SL-2 (P1) on PR #24; follows [2026-11-14-cors-proxy-compressed-ranges-open.md](2026-11-14-cors-proxy-compressed-ranges-open.md)

## Context

Proxied answers are served from the Playground host's own origin, which also holds saved sites (OPFS) and the service worker. The proxy relayed every response header except a fixed list, so a target could send `Clear-Site-Data: "storage"` and the browser would wipe the origin's storage, saved sites included; `NEL` and `Report-To` could make the browser report the origin's traffic (URLs can carry licence keys) to another server. Separately, ranged answers from targets that compress came back as slices of the compressed stream ([open record](2026-11-14-cors-proxy-compressed-ranges-open.md)).

## Hypothesis and success criteria

Dropping the headers browsers act on even for a `fetch()` answer removes the storage and reporting risks without changing what WordPress reads. Refusing a `206` that carries a `Content-Encoding` other than identity turns wrong bytes into a clear error. Success: unit tests for both, and on the deployed preview the compressed text range answers 502 while ZIP ranges still match.

## Options considered

- Drop only `Clear-Site-Data`, `NEL`, `Report-To`, `Set-Login` (chosen): they act on any response. Document-only headers (CSP, `Link`, `Refresh`) have no effect on a `fetch()` answer, and WordPress reads `Link` (for example GitHub's pagination).
- Allow-list response headers: safer by default, but risks dropping headers WordPress or plugins need.
- For compressed ranges, fetch the whole file and slice it in the Worker: correct bytes, but a decompressed total is unknown until the end and the Worker would buffer up to the 100 MB cap.

## Implementation or prototype

`playground-host/cors-proxy.js`: `DROPPED_RESPONSE_HEADERS` adds `clear-site-data`, `nel`, `report-to`, `set-login`; after the upstream answer, a `206` whose `Content-Encoding` is not identity returns 502 "the target sent a compressed byte range".

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Local, Node 24.22.2 | `scripts/agents/kit unit` | Pass | 125 passed, 0 failed, 20 files | Executed through the kit |
| Deployed preview after landing | Compressed text range and ZIP ranges through `/cors-proxy.php` | Text range 502; ZIP ranges match | Recorded in the release PR | Pending |

The 502 depends on Cloudflare showing the Worker the target's `Content-Encoding` on a `206`; only the deployed check proves it.

## Result

Answers no longer carry the four headers, and a compressed byte range is refused in the unit tests.

## Disposition and rationale

Kept: closes the storage-wipe path and stops wrong bytes; correct compressed ranges stay a follow-up.

## Documentation impact

`docs/architecture.md` (CORS proxy row), `docs/testing.md` (count and table).

## Follow-ups and open questions

- Serving compressed ranges correctly (whole-file fetch and slice, or another route) if a real Playground use needs them.
