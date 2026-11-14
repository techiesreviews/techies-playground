# CORS proxy: no storage-wiping headers in proxied answers

- Date: 2026-11-14
- Owner: fleet-lead build agent (Claude Opus 5.5)
- Status: complete
- Disposition: kept
- Related version: 0.9.0 (production never had the proxy; no bump)
- Related commit/issue: Orbit TOOLS-236; release second look SL-1 (P0) and SL-2 (P1) on PR #24; follows [2026-11-14-cors-proxy-compressed-ranges-open.md](2026-11-14-cors-proxy-compressed-ranges-open.md)

## Context

Proxied answers are served from the Playground host's own origin, which also holds saved sites (OPFS) and the service worker. The proxy relayed every response header except a fixed list, so a target could send `Clear-Site-Data: "storage"` and the browser would wipe the origin's storage, saved sites included; `NEL` and `Report-To` could make the browser report the origin's traffic (URLs can carry licence keys) to another server. Separately, ranged answers from targets that compress come back as slices of the compressed stream ([open record](2026-11-14-cors-proxy-compressed-ranges-open.md)); this record tried and dropped a guard for that.

## Hypothesis and success criteria

Dropping the headers browsers act on even for a `fetch()` answer removes the storage and reporting risks without changing what WordPress reads. Success: a unit test that the four headers are dropped and `Link` is kept.

## Options considered

- Drop only `Clear-Site-Data`, `NEL`, `Report-To`, `Set-Login` (chosen): they act on any response. Document-only headers (CSP, `Link`, `Refresh`) have no effect on a `fetch()` answer, and WordPress reads `Link` (for example GitHub's pagination).
- Allow-list response headers: safer by default, but risks dropping headers WordPress or plugins need.
- For compressed ranges, refuse a `206` that carries a `Content-Encoding` (502): built, then dropped before landing. Cloudflare's edge removes `Content-Encoding` from 206 answers (reported in developmentseed/multistore PR #165 and the Cloudflare community thread "Workers don't support Range requests on gzip files"), which matches the preview check in the open record (no `Content-Encoding` on the relayed slice), so the guard would never fire.
- For compressed ranges, fetch the whole file and slice it in the Worker: correct bytes, but a decompressed total is unknown until the end and every range would download up to the 100 MB cap.

## Implementation or prototype

`playground-host/cors-proxy.js`: `DROPPED_RESPONSE_HEADERS` adds `clear-site-data`, `nel`, `report-to`, `set-login`.

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Local, Node 24.22.2 | `scripts/agents/kit unit` | Pass | 124 passed, 0 failed, 20 files | Executed through the kit |

No browser check sends these headers from a real target; the unit test uses a recording fetch.

## Result

Answers no longer carry the four headers. Compressed ranges remain open.

## Disposition and rationale

Kept: closes the storage-wipe and reporting paths.

## Documentation impact

`docs/architecture.md` (CORS proxy row), `docs/testing.md` (count and table).

## Follow-ups and open questions

- Compressed ranges: see the open record; Playground's own range reads are of ZIP archives, which worked on the preview.
