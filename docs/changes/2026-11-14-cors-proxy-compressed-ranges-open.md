# CORS proxy: compressed byte ranges still break on Cloudflare (open)

- Date: 2026-11-14
- Owner: fleet-lead build agent (Claude Opus 5.5)
- Status: complete
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

No code change. Procedure (Playwright's bundled headless Chromium, Linux):

1. Open `https://preview-wp.techies.tools/remote.html`, wait for `navigator.serviceWorker.ready`, reload so the service worker controls the page.
2. For each target, fetch `/cors-proxy.php?<target>` in full, with `HEAD`, with `Range: bytes=10-29`, and with `X-Cors-Proxy-Range: bytes=30-49`.
3. Compare each range body with the same bytes of the full body, and read `Content-Range` and the HEAD `Content-Length`.

Targets: `https://raw.githubusercontent.com/WordPress/wordpress-develop/trunk/README.md` (text the server gzips), `https://downloads.wordpress.org/plugin/hello-dolly.zip` and `https://github.com/WordPress/gutenberg/releases/download/v19.0.0/gutenberg.zip` (ZIP archives).

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| curl, direct to the target | `Range: bytes=10-29`, `Accept-Encoding: identity` | Total = file size | `Content-Range: bytes 10-29/11134`, no `Content-Encoding` | Executed |
| curl, direct to the target | `Range: bytes=10-29`, `Accept-Encoding: gzip, br` | Compressed slice | `Content-Encoding: gzip`, `Content-Range: bytes 10-29/4363` | Executed |
| Preview proxy, full GET | `fetch('/cors-proxy.php?<target>')` | 11,134 characters | 11,134 characters | Executed |
| Preview proxy, direct and tunnelled range | as above | `Content-Range: …/11134`, the file's bytes | `206`, `Content-Range: bytes 10-29/4363` and `bytes 30-49/4363`, no `Content-Encoding`, bytes of the gzip stream | Executed |
| Preview proxy, HEAD (README) | as above | `Content-Length: 11134` | No `Content-Length` | Executed; fails |
| Preview proxy, hello-dolly.zip | full, HEAD, both ranges | Ranges match the full body; HEAD = 1887 | `Content-Range: bytes 10-29/1887` and `bytes 30-49/1887`, both slices equal the full body's bytes; HEAD `Content-Length: 1887` | Executed |
| Preview proxy, gutenberg.zip (v19.0.0) | full, HEAD, both ranges | Ranges match; HEAD = file size | `Content-Range: …/11313112`, both slices equal; HEAD `Content-Length: 11313112` | Executed |

## Result

For the gzipped text target, the proxy's ranged answers carry offsets and bytes of the gzip stream, without `Content-Encoding`, and its HEAD has no `Content-Length`. The target answers correctly to `Accept-Encoding: identity` (curl rows), so the likely cause, inferred and not confirmed from Cloudflare's side, is that Cloudflare replaces the Worker's `Accept-Encoding` on outgoing requests. The two ZIP targets were answered correctly (ranges and HEAD). Separately, plain launches and a plugin ZIP upload passed on the preview the same day in Chromium and Firefox.

## Disposition and rationale

Inconclusive: the defect is real for compressed targets; the fix needs a choice between the options above.

## Documentation impact

`docs/architecture.md` (CORS proxy row) now says the Worker asks for uncompressed bytes and that ranges of compressed text targets are still wrong (this record).

## Follow-ups and open questions

- Choose and build a fix (refuse with 502, or fetch whole and slice), with a deployed-preview check like the one above.
