# CORS proxy: compressed byte ranges still break on Cloudflare (open)

- Date: 2026-11-14
- Owner: fleet-lead build agent (Claude Opus 5.5)
- Status: complete (investigation); the defect stays open
- Disposition: inconclusive
- Related version: 0.9.0
- Related commit/issue: Orbit TOOLS-236; follows [2026-11-14-cors-proxy-identity-ranges.md](2026-11-14-cors-proxy-identity-ranges.md), whose fix does not take effect on Cloudflare

## Context

[2026-11-14-cors-proxy-identity-ranges.md](2026-11-14-cors-proxy-identity-ranges.md) set `Accept-Encoding: identity` on proxied HEAD and range requests, proven only with a recording fetch. This record checks the deployed preview.

## Hypothesis and success criteria

Through preview-wp.techies.tools at dev d09c853, a range of a file the target compresses returns the file's own bytes and a `Content-Range` total equal to the file size.

## Options considered

- Record the result and keep the header (chosen for now): the header is harmless and the defect needs a design choice.
- Fetch the whole file and slice it in the Worker: correct, but up to the 100 MB cap per range request.
- Refuse a ranged answer that comes back compressed (502): fails clearly instead of returning wrong bytes.

## Implementation or prototype

No code change. Headless Chromium (Playwright) opened `https://preview-wp.techies.tools/remote.html`, waited for the service worker, reloaded, and fetched `https://raw.githubusercontent.com/WordPress/wordpress-develop/trunk/README.md` through `/cors-proxy.php?` in full, with HEAD, with `Range: bytes=10-29`, and with `X-Cors-Proxy-Range: bytes=30-49`.

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| curl, direct to the target | `Range: bytes=10-29`, `Accept-Encoding: identity` | Total = file size | `Content-Range: bytes 10-29/11134`, no `Content-Encoding` | Executed |
| curl, direct to the target | `Range: bytes=10-29`, `Accept-Encoding: gzip, br` | Compressed slice | `Content-Encoding: gzip`, `Content-Range: bytes 10-29/4363` | Executed |
| Preview proxy, full GET | `fetch('/cors-proxy.php?<target>')` | 11,134 characters | 11,134 characters | Executed |
| Preview proxy, direct and tunnelled range | as above | `Content-Range: …/11134`, the file's bytes | `206`, `Content-Range: bytes 10-29/4363` and `bytes 30-49/4363`, no `Content-Encoding`, bytes of the gzip stream | Executed |
| Preview proxy, HEAD | as above | `Content-Length: 11134` | No `Content-Length` | Executed |

## Result

Cloudflare still sends a compressing `Accept-Encoding` upstream for the Worker's ranged requests, and the proxy relays the compressed slice without `Content-Encoding`. Ranges of files the target does not compress (ZIP archives, which servers send as they are) are not affected; normal launches, plugin ZIP uploads and WordPress.org installs passed on the preview the same day.

## Disposition and rationale

Inconclusive: the defect is real for compressed targets; the fix needs a choice between the options above.

## Documentation impact

None besides this record; `docs/architecture.md` still says HEAD and range requests ask for uncompressed bytes, which is what the Worker requests, not what Cloudflare sends.

## Follow-ups and open questions

- Choose and build a fix (refuse with 502, or fetch whole and slice), with a deployed-preview check like the one above.
