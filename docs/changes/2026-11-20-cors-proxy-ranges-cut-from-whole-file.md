# CORS proxy: ranges are cut from the whole file, so compressed targets give the right bytes

- Date: 2026-11-20
- Owner: fleet-lead build agent (Claude Opus 5.5)
- Status: complete locally; deployed preview check pending
- Disposition: kept
- Related version: 0.10.4 (behind the scenes; no changelog entry or version bump)
- Related commit/issue: Orbit TOOLS-244; release second look SL-1 on PR #24; supersedes the open question in [2026-11-14-cors-proxy-compressed-ranges-open.md](2026-11-14-cors-proxy-compressed-ranges-open.md)

## Context

On the deployed preview, a range request through `/cors-proxy.php` for a file the target compresses (raw.githubusercontent.com's `README.md`) came back as a slice of the gzip stream, with the compressed offsets and total (`Content-Range: bytes 10-29/4363` for an 11,134-byte file) and no `Content-Encoding` ([open record](2026-11-14-cors-proxy-compressed-ranges-open.md)). Cloudflare replaces the Worker's `Accept-Encoding: identity`, and its edge hides the encoding of a `206`, so the proxy could neither ask for nor recognise an uncompressed slice. ZIP ranges were right, because targets do not compress ZIP files.

## Hypothesis and success criteria

If the proxy never forwards a GET range, fetches the whole file and cuts the range itself, every range answer carries the file's own bytes, offsets and size, whatever the target or Cloudflare do to compression. Success: a range of a file a real server gzips (and answers ranges of with gzip slices) returns exactly the requested bytes of the file, with `Content-Range` naming the file's size; ZIP ranges keep working.

## Options considered

- Fetch the whole file and cut the range in the Worker (chosen). Always correct. Cost: each range downloads the file up to the end of the range (an uncompressed file stops there; a compressed one is read whole), between the target and Cloudflare, not to the visitor. Limit: a compressed file, or an uncompressed one sent without `Content-Length`, is held in memory, so its ranges stop working above 32 MiB (`413`); such targets rarely serve ranges of files that size.
- Refuse a ranged answer that came back compressed (502): rejected in the [origin headers record](2026-11-14-cors-proxy-origin-headers-ranges.md); Cloudflare removes the `Content-Encoding` of a `206`, so the proxy cannot tell.
- Trust the target's `206` for file types that are rarely compressed (ZIP): cheaper, but a guess about each target, not proof.
- Leave unchanged: Playground's own range reads are of ZIP archives, which work; WordPress requests with a range to a compressing server would get wrong bytes.

## Implementation or prototype

`playground-host/cors-proxy.js`:

- A GET with `Range` (direct, or tunnelled as `X-Cors-Proxy-Range`) is sent to the target without the range, still with `Accept-Encoding: identity`. HEAD and POST are unchanged.
- One range (`bytes=a-b`, `bytes=a-`, `bytes=-n`) is answered `206` with `Content-Range: bytes a-b/<file size>`, `Content-Length` and `Accept-Ranges: bytes`; a range outside the file gets `416` with `Content-Range: bytes */<file size>`; several ranges, other units or an `If-Range` get the whole file as `200`, which HTTP allows. Other target answers (redirects, errors) are relayed as before.
- A file without `Content-Encoding` and with a declared size is cut while it streams, and reading stops at the end of the range (through `FixedLengthStream` on Workers, so `Content-Length` stays). The 100 MB limit for whole answers does not apply to it, since only the bytes up to the end of the range are read. Any other file is read whole, up to 32 MiB (inside the Worker's 128 MB memory; more answers `413`), and cut from memory. The Workers runtime decodes a compressed answer as the Worker reads it, while keeping its `Content-Encoding` and compressed `Content-Length` headers (local workerd run below), so the proxy reads the decoded file and never decodes it again; a `.gz` file a target gzips once more stays the `.gz` file, as in a plain GET.
- Range answers carry `Cache-Control: no-store, no-transform`, so Cloudflare does not compress the slice on its way to the browser.

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Local, Node 24.22.2, before the change | `node --test scripts/playground-host-cors-proxy.test.mjs` with the new tests | New tests fail | Gzip test: `actual: 'bytes 10-29/1107'`, `expected: 'bytes 10-29/17489'` (offsets of the gzip stream); ZIP test: `Range` still sent upstream; range cases: `200` instead of `206` | Executed |
| Local, Node 24.22.2, after the change | Same | Pass | 30 passed, 0 failed | Executed |
| Local, Node 24.22.2 | `scripts/agents/kit unit` | Pass | 191 passed, 0 failed, 28 files | Executed through the kit |
| Local workerd (Miniflare 5.20261023.2-beta, compatibility date 2026-08-12), first build | The proxy module in workerd, with Miniflare's `outboundService` (a Node function) answering every request with gzip bytes and `Content-Encoding: gzip`; `Range: bytes=10-29` | The file's bytes | The Worker saw `content-encoding: gzip`, no `Content-Length`, and the raw gzip bytes (first bytes `31,139,8,0`); the answer was a slice of the gzip stream | Executed; led to a gzip-signature decode in the proxy, removed after review (next rows) |
| Local workerd, Worker `fetch()` to a real HTTP server | A probe Worker fetches a local `node:http` server that sends gzip with `Content-Encoding: gzip`, for a text file and for a `.gz` file gzipped again | Shows what the runtime hands the Worker | Text: headers `content-encoding: gzip`, `content-length: 78`, body 5,200 decoded bytes. `.gz`: body is the 78-byte `.gz` file (first bytes `31,139,8,0`). The runtime decodes once and keeps both headers; the raw bytes in the first row came from `outboundService` | Executed |
| Local workerd, after review fixes | The proxy module in workerd; its `fetch()` reaches a real local server that gzips text answers (and a `.gz` file again) and serves an uncompressed 300,000-byte ZIP; `Range: bytes=10-29`, `X-Cors-Proxy-Range: bytes=5000-5099`, `.gz` `bytes=0-9`, ZIP `bytes=1000-1999` and `bytes=-22` | `206`, file's bytes, file's size | `bytes 10-29/17489` (`Content-Length: 20`) and `bytes 5000-5099/17489`, bytes match; `.gz` `bytes 0-9/55`, the `.gz` file's bytes; ZIP `bytes 1000-1999/300000` (`Content-Length: 1000`) and `bytes 299978-299999/300000` (`Content-Length: 22`), bytes match; the target never saw `Range` and always got `Accept-Encoding: identity`. Miniflare's `dispatchFetch` showed no `Content-Length` on answers to a request carrying `X-Cors-Proxy-Range`, though the Worker sets the same headers either way | Executed |
| Local, Node 24.22.2, review fixes | `node --test scripts/playground-host-cors-proxy.test.mjs`, new tests against the first build's proxy, then against the fixed proxy | Fail, then pass | First build: the `.gz` test (decoded twice) and the 100 MB uncompressed range test (`413`) fail, 33 pass; fixed: 35 passed, 0 failed (If-Range, relayed 404 and 302, 32 MiB refusal, short body and header tests added too) | Executed |
| Local, Node 24.22.2, review fixes | `scripts/agents/kit unit` | Pass | 196 passed, 0 failed, 28 files | Executed through the kit |

The unit test's server is a real `node:http` server that gzips every answer and answers ranges with gzip slices, reached through Node's own `fetch` (which decodes gzip like the Workers runtime). Neither local run reproduces Cloudflare's edge; the deployed preview check follows below once this lands on `dev`.

## Result

Range answers through the proxy carry the requested bytes of the file and its real size, for compressed and uncompressed targets alike, in Node and in local workerd.

## Disposition and rationale

Kept: the only option that is right without knowing what the target or Cloudflare do to compression; uncompressed files still stop reading at the end of the range.

## Documentation impact

- `docs/architecture.md` (CORS proxy row) and `docs/testing.md` (count 187 to 196; proxy test row) are left for after the open PR #42, which edits both files. Owed wording: architecture, replace "HEAD and range requests ask the target for uncompressed bytes (Cloudflare does not keep that … see `docs/changes/2026-11-14-cors-proxy-compressed-ranges-open.md`)" with "HEAD requests ask the target for uncompressed bytes, and a GET range is cut by the proxy from the whole file, so compressed targets give the file's own bytes and size (see `docs/changes/2026-11-20-cors-proxy-ranges-cut-from-whole-file.md`)"; testing, add "GET ranges cut from the whole file (gzip-served text and `.gz` files, uncompressed streams of any size that stop reading at the end of the range, open, suffix, unsatisfiable, multiple and If-Range ranges, the 32 MiB in-memory limit, short bodies)" to the proxy row.
- `docs/changes/README.md` index entry.
- No changelog entry or version bump: nothing a person sees changes.

## Follow-ups and open questions

- On the preview after landing: repeat the open record's procedure (README ranges and HEAD, ZIP ranges) and a plugin ZIP launch in Chromium and Firefox.
- HEAD of a compressed target still has no `Content-Length` on Cloudflare (open record); unchanged here.
