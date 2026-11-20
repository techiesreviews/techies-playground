# Upstream report for WordPress Playground (ready to paste)

For Lex: open https://github.com/WordPress/wordpress-playground/issues/new, choose a bug report (or a blank issue), and paste the title and the text below the line. Nothing has been posted yet. If you would also like a pull request upstream, say so: it needs a fork of their repository, and the same diff is ready in `playground-host/playground-core.patch`.

**Title:** Firefox: POST body is lost when a request is retried through the CORS proxy (fetchWithCorsProxy, parseHttpRequest)

---

### What happens

In Firefox, a POST (or PUT) whose direct `fetch()` is blocked by CORS is retried through the configured CORS proxy without its body. The proxy, and the target server behind it, receive an empty body. This breaks plugin licence activations, form posts and API calls whenever the target does not allow CORS. Chromium is not affected, and Safari takes the buffered path, so it is not affected either.

Seen with Playground 3.1.64 (the code is the same on `trunk` as of 2026-11-20).

### Why

Firefox does not support streamed request bodies, but it does not reject them either: `new Request(url, { method: 'POST', body: stream, duplex: 'half' })` leaves `request.body` as `undefined`, and `fetch()` sends the stream as the text `[object ReadableStream]`. So:

1. `supportsReadableStreamBody()` in `@php-wasm/web-service-worker` (`fetch('data:,', { body: stream })`) succeeds in Firefox and reports streamed uploads as supported.
2. `fetchWithCorsProxy()` then takes `clonedRequest.body` for the retry. In Firefox that is `undefined`, so the proxied request has no body.
3. `RawBytesFetch.parseHttpRequest()` in `@php-wasm/web` always builds the request with a `ReadableStream` body. In Firefox that body is dropped on the proxy retry (and sent as `[object ReadableStream]` on a direct fetch).

### Steps to reproduce

In Firefox, with a CORS proxy configured, run in a page that loads `@php-wasm/web-service-worker`:

```js
const response = await fetchWithCorsProxy(
	new Request('https://cors-blocked.example/endpoint', {
		method: 'POST',
		body: 'name=value',
	}),
	undefined,
	corsProxyUrl
);
```

The direct fetch fails, the retry goes to the proxy, and the proxy receives an empty body. In Chromium it receives `name=value`.

### Suggested fix

- `supportsReadableStreamBody()`: build the probe `Request` first and report `false` when `request.body` is not a `ReadableStream`; only then fetch it.
- `fetchWithCorsProxy()`: use `clonedRequest.body` only when it is a `ReadableStream`; otherwise read `await clonedRequest.arrayBuffer()` (already the Safari path).
- `parseHttpRequest()`: when streamed uploads are unsupported, build the request without the stream and return the stream separately; `fetchRawResponseBytes()` reads it in full before the fetch. It cannot be buffered inside `parseHttpRequest()`, because with `Expect: 100-continue` curl sends the body only after the "100 Continue" answer, which comes after `parseHttpRequest()` returns.

We apply exactly this change to 3.1.64 in our own build, with spec tests for each part (the 4 new tests fail before the change; all 71 tests in the 3 spec files pass after it), and checked it in Firefox and Chromium against a local proxy: before, Firefox lost the body in all three cases (Request object, URL with init, the TCP bridge with `Expect: 100-continue`); after, every case kept it. The diff is here: https://github.com/techiesreviews/techies-playground/blob/dev/playground-host/playground-core.patch. Happy to open a pull request with it.
