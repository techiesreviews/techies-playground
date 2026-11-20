# CORS proxy: ranges are cut from the whole file, so compressed targets give the right bytes

- Date: 2026-11-20
- Owner: fleet-lead build agent (Claude Opus 5.5)
- Status: complete
- Disposition: kept
- Related version: 0.10.4 (behind the scenes; no changelog entry or version bump)
- Related commit/issue: Orbit TOOLS-244; release second look SL-1 on PR #24; supersedes the open question in [2026-11-14-cors-proxy-compressed-ranges-open.md](2026-11-14-cors-proxy-compressed-ranges-open.md)

## Context

On the deployed preview, a range request through `/cors-proxy.php` for a file the target compresses (raw.githubusercontent.com's `README.md`) came back as a slice of the gzip stream, with the compressed offsets and total (`Content-Range: bytes 10-29/4363` for an 11,134-byte file) and no `Content-Encoding` ([open record](2026-11-14-cors-proxy-compressed-ranges-open.md)). Cloudflare replaces the Worker's `Accept-Encoding: identity`, and its edge hides the encoding of a `206`, so the proxy could neither ask for nor recognise an uncompressed slice. ZIP ranges were right, because targets do not compress ZIP files.

## Hypothesis and success criteria

If the proxy never forwards a GET range, fetches the whole file and cuts the range itself, every range answer carries the file's own bytes, offsets and size, whatever the target or Cloudflare do to compression. Success: a range of a file a real server gzips (and answers ranges of with gzip slices) returns exactly the requested bytes of the file, with `Content-Range` naming the file's size; ZIP ranges keep working.

## Options considered

- Fetch the whole file and cut the range in the Worker (chosen). Always correct. Cost: each range downloads the file up to the end of the range (an uncompressed file stops there; a compressed one is read whole), between the target and Cloudflare, not to the visitor.
- Refuse a ranged answer that came back compressed (502): rejected in the [origin headers record](2026-11-14-cors-proxy-origin-headers-ranges.md); Cloudflare removes the `Content-Encoding` of a `206`, so the proxy cannot tell.
- Trust the target's `206` for file types that are rarely compressed (ZIP): cheaper, but a guess about each target, not proof.
- Leave unchanged: Playground's own range reads are of ZIP archives, which work; WordPress requests with a range to a compressing server would get wrong bytes.

## Implementation or prototype

`playground-host/cors-proxy.js`:

- A GET with `Range` (direct, or tunnelled as `X-Cors-Proxy-Range`) is sent to the target without the range, still with `Accept-Encoding: identity`. HEAD and POST are unchanged.
- One range (`bytes=a-b`, `bytes=a-`, `bytes=-n`) is answered `206` with `Content-Range: bytes a-b/<file size>`, `Content-Length` and `Accept-Ranges: bytes`; a range outside the file gets `416` with `Content-Range: bytes */<file size>`; several ranges, other units or an `If-Range` get the whole file as `200`, which HTTP allows. Other target answers (redirects, errors) are relayed as before.
- A file without `Content-Encoding` and with a declared size is cut while it streams, and reading stops at the end of the range (through `FixedLengthStream` on Workers, so `Content-Length` stays). Any other file is read whole, up to 32 MiB (inside the Worker's 128 MB memory; more answers `413`), and cut from memory. A body that still starts like a gzip stream under `Content-Encoding: gzip` (what local workerd hands over) is decoded first; on Cloudflare the edge already decodes it for the Worker, which matches the preview's proxied HEAD of such a file having no `Content-Length`.
- Range answers carry `Cache-Control: no-store, no-transform`, so Cloudflare does not compress the slice on its way to the browser.

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Local, Node 24.22.2, before the change | `node --test scripts/playground-host-cors-proxy.test.mjs` with the new tests | New tests fail | Gzip test: `actual: 'bytes 10-29/1107'`, `expected: 'bytes 10-29/17489'` (offsets of the gzip stream); ZIP test: `Range` still sent upstream; range cases: `200` instead of `206` | Executed |
| Local, Node 24.22.2, after the change | Same | Pass | 30 passed, 0 failed | Executed |
| Local, Node 24.22.2 | `scripts/agents/kit unit` | Pass | 191 passed, 0 failed, 28 files | Executed through the kit |
| Local workerd (Miniflare 5.20261023.2-beta, compatibility date 2026-08-12), before decoding in the Worker | The proxy module in workerd, outbound target answering every request with gzip bytes and `Content-Encoding: gzip`; `Range: bytes=10-29` | The file's bytes | The Worker saw `content-encoding: gzip`, no `Content-Length`, and the raw gzip bytes (first bytes `31,139,8,0`); the answer was a slice of the gzip stream | Executed; led to decoding in `wholeFile` |
| Local workerd, after | Same target, `Range: bytes=10-29` and `X-Cors-Proxy-Range: bytes=5000-5099`; an uncompressed 300,000-byte ZIP with `bytes=1000-1999` and `bytes=-22` | `206`, file's bytes, file's size | `bytes 10-29/17489` and `bytes 5000-5099/17489`, bytes match; ZIP `bytes 1000-1999/300000` (`Content-Length: 1000`) and `bytes 299978-299999/300000` (`Content-Length: 22`), bytes match; the target never saw `Range` | Executed |

The unit test's server is a real `node:http` server that gzips every answer and answers ranges with gzip slices, reached through Node's own `fetch` (which decodes gzip like the Workers runtime). Neither local run reproduces Cloudflare's edge; the deployed preview check follows below once this lands on `dev`.

## Result

Range answers through the proxy carry the requested bytes of the file and its real size, for compressed and uncompressed targets alike, in Node and in local workerd.

## Disposition and rationale

Kept: the only option that is right without knowing what the target or Cloudflare do to compression; uncompressed files still stop reading at the end of the range.

## Documentation impact

- `docs/architecture.md` (CORS proxy row) and `docs/testing.md` (count 187 to 191; proxy test row) are left for after the open PR #42, which edits both files. Owed wording: architecture, replace "HEAD and range requests ask the target for uncompressed bytes (Cloudflare does not keep that … see `docs/changes/2026-11-14-cors-proxy-compressed-ranges-open.md`)" with "HEAD requests ask the target for uncompressed bytes, and a GET range is cut by the proxy from the whole file, so compressed targets give the file's own bytes and size (see `docs/changes/2026-11-20-cors-proxy-ranges-cut-from-whole-file.md`)"; testing, add "GET ranges cut from the whole file (gzip-served text, uncompressed streams that stop reading at the end of the range, open, suffix, unsatisfiable and multiple ranges)" to the proxy row.
- `docs/changes/README.md` index entry.
- No changelog entry or version bump: nothing a person sees changes.

## Follow-ups and open questions

- On the preview after landing: repeat the open record's procedure (README ranges and HEAD, ZIP ranges) and a plugin ZIP launch in Chromium and Firefox.
- HEAD of a compressed target still has no `Content-Length` on Cloudflare (open record); unchanged here.
