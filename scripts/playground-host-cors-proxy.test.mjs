import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { gzipSync } from 'node:zlib'
import { CORS_PROXY_PATH, handleCorsProxy, isCorsProxyRequest } from '../playground-host/cors-proxy.js'

const HOST = 'https://wp.techies.tools'

function proxied(target, init = {}) {
  const headers = new Headers(init.headers)
  if (!headers.has('Sec-Fetch-Site')) headers.set('Sec-Fetch-Site', 'same-origin')
  if (!headers.has('Sec-Fetch-Dest')) headers.set('Sec-Fetch-Dest', 'empty')
  return new Request(`${HOST}${CORS_PROXY_PATH}?${target}`, { ...init, headers })
}

function recorder(response = () => new Response('upstream body', { headers: { 'Content-Type': 'text/plain' } })) {
  const calls = []
  return {
    calls,
    fetch: async (input, init) => {
      const request = new Request(input, init)
      calls.push({ url: request.url, method: request.method, headers: request.headers, body: request.body ? await request.text() : null, redirect: init?.redirect })
      return response(request)
    },
  }
}

test('recognizes only the proxy path', () => {
  assert.equal(isCorsProxyRequest(new URL(`${HOST}/cors-proxy.php?https://example.com/`)), true)
  assert.equal(isCorsProxyRequest(new URL(`${HOST}/remote.html`)), false)
  assert.equal(isCorsProxyRequest(new URL(`${HOST}/cors-proxy/?https://example.com/`)), false)
})

test('keeps the proxy on a .php path, which Playground\'s service worker does not cache', () => {
  // The service worker caches other same-origin GETs ignoring the query string, so two
  // proxied URLs on a path without .php would share one cache entry.
  assert.match(CORS_PROXY_PATH, /\.php$/)
})

test('refuses URLs containing wordpress-static.zip, which the service worker caches on any path', async () => {
  const upstream = recorder()
  for (const target of ['https://example.com/wp-7.1/wordpress-static.zip', 'https://example.com/?file=wordpress-static.zip']) {
    const response = await handleCorsProxy(proxied(target), { fetch: upstream.fetch })
    assert.equal(response.status, 400, target)
    assert.equal(response.headers.get('X-Playground-Cors-Proxy'), 'true', target)
  }
  assert.equal(upstream.calls.length, 0)
})

test('relays a same-origin GET and marks the response as proxied', async () => {
  const upstream = recorder(() => new Response('upstream body', {
    status: 200,
    headers: { 'Content-Type': 'text/plain', 'Set-Cookie': 'a=b', 'Access-Control-Allow-Origin': 'https://elsewhere.test', 'ETag': '"v1"' },
  }))
  const response = await handleCorsProxy(proxied('https://downloads.example.com/plugin.zip?ver=2'), { fetch: upstream.fetch })
  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'upstream body')
  assert.equal(upstream.calls[0].url, 'https://downloads.example.com/plugin.zip?ver=2')
  assert.equal(upstream.calls[0].redirect, 'manual')
  assert.equal(response.headers.get('X-Playground-Cors-Proxy'), 'true')
  assert.equal(response.headers.get('Set-Cookie'), null)
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null)
  assert.equal(response.headers.get('ETag'), '"v1"')
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
})

test('refuses requests from other sites', async () => {
  const upstream = recorder()
  for (const site of ['cross-site', 'same-site', 'none']) {
    const response = await handleCorsProxy(proxied('https://example.com/', { headers: { 'Sec-Fetch-Site': site } }), { fetch: upstream.fetch })
    assert.equal(response.status, 403, site)
  }
  const foreignOrigin = await handleCorsProxy(proxied('https://example.com/', { headers: { Origin: 'https://evil.test' } }), { fetch: upstream.fetch })
  assert.equal(foreignOrigin.status, 403)
  const noFetchMetadata = new Request(`${HOST}${CORS_PROXY_PATH}?https://example.com/`)
  assert.equal((await handleCorsProxy(noFetchMetadata, { fetch: upstream.fetch })).status, 403)
  assert.equal(upstream.calls.length, 0)
})

test('answers only fetch() and XHR requests, refusing pages, frames, scripts, workers and images', async () => {
  // A same-origin script, worker or page loaded through the proxy would run with the
  // Playground host's origin; Playground itself only fetches, which sends "empty".
  const upstream = recorder()
  for (const destination of ['document', 'iframe', 'frame', 'script', 'serviceworker', 'sharedworker', 'worker', 'image', 'style', 'object', 'embed']) {
    const response = await handleCorsProxy(proxied('https://example.com/sw.js', { headers: { 'Sec-Fetch-Dest': destination } }), { fetch: upstream.fetch })
    assert.equal(response.status, 403, destination)
    assert.equal(response.headers.get('X-Playground-Cors-Proxy'), 'true', destination)
  }
  const noDestination = new Request(`${HOST}${CORS_PROXY_PATH}?https://example.com/`, { headers: { 'Sec-Fetch-Site': 'same-origin' } })
  assert.equal((await handleCorsProxy(noDestination, { fetch: upstream.fetch })).status, 403)
  const preflight = await handleCorsProxy(proxied('https://example.com/', { method: 'OPTIONS', headers: { 'Sec-Fetch-Dest': 'script' } }), { fetch: upstream.fetch })
  assert.equal(preflight.status, 403)
  assert.equal(upstream.calls.length, 0)

  const fetched = await handleCorsProxy(proxied('https://example.com/'), { fetch: upstream.fetch })
  assert.equal(fetched.status, 200)
  assert.equal(upstream.calls.length, 1)
})

test('rejects missing, non-web, credentialed, private and looping targets', async () => {
  const upstream = recorder()
  for (const target of [
    '',
    'not a url',
    'ftp://example.com/file',
    'https://user:pass@example.com/',
    'http://localhost:8080/',
    'http://127.0.0.1/',
    'http://10.1.2.3/',
    'http://172.20.0.1/',
    'http://192.168.1.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://[::1]/',
    'http://100.64.0.1/',
    'http://[fd00::1]/',
    'http://[fe80::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://224.0.0.1/',
    'http://metadata.internal/',
    'https://wp.techies.tools./remote.html',
    'https://wp.techies.tools/cors-proxy.php?https://example.com/',
    'https://preview-wp.techies.tools/remote.html',
  ]) {
    const response = await handleCorsProxy(proxied(target), { fetch: upstream.fetch })
    assert.equal(response.status, 400, target)
    assert.equal(response.headers.get('X-Playground-Cors-Proxy'), 'true', target)
  }
  assert.equal(upstream.calls.length, 0)
})

test('never forwards cookies, and forwards Authorization only when the request opts in', async () => {
  const upstream = recorder()
  await handleCorsProxy(proxied('https://api.example.com/', { headers: { Cookie: 'session=1', Authorization: 'Bearer x', 'X-Custom': 'kept' } }), { fetch: upstream.fetch })
  assert.equal(upstream.calls[0].headers.get('Cookie'), null)
  assert.equal(upstream.calls[0].headers.get('Authorization'), null)
  assert.equal(upstream.calls[0].headers.get('X-Custom'), 'kept')
  assert.equal(upstream.calls[0].headers.get('Sec-Fetch-Site'), null)

  await handleCorsProxy(proxied('https://api.example.com/', { headers: { Authorization: 'Bearer x', 'X-Cors-Proxy-Allowed-Request-Headers': 'authorization' } }), { fetch: upstream.fetch })
  assert.equal(upstream.calls[1].headers.get('Authorization'), 'Bearer x')
  assert.equal(upstream.calls[1].headers.get('X-Cors-Proxy-Allowed-Request-Headers'), null)
})

test('asks for uncompressed bytes on HEAD and range requests only', async () => {
  const upstream = recorder()
  const cases = [
    [{ method: 'HEAD', headers: { 'Accept-Encoding': 'br, gzip' } }, 'identity'],
    [{ headers: { 'Accept-Encoding': 'br, gzip', Range: 'bytes=0-9' } }, 'identity'],
    [{ headers: { 'Accept-Encoding': 'br, gzip', 'X-Cors-Proxy-Range': 'bytes=10-19' } }, 'identity'],
    [{ headers: { 'Accept-Encoding': 'br, gzip' } }, 'br, gzip'],
  ]
  for (const [init] of cases) await handleCorsProxy(proxied('https://example.com/file.zip', init), { fetch: upstream.fetch })
  assert.deepEqual(upstream.calls.map((call) => call.headers.get('Accept-Encoding')), cases.map(([, expected]) => expected))
})

// A real server that gzips every answer, as raw.githubusercontent.com does once
// Cloudflare has replaced the Worker's Accept-Encoding: identity, and answers a range
// with a slice of the gzip stream. Node's fetch decodes gzip like the Workers runtime.
async function gzipServer(file) {
  const gzipped = gzipSync(Buffer.from(file))
  const server = createServer((request, response) => {
    const match = /^bytes=(\d+)-(\d+)$/.exec(request.headers.range || '')
    const headers = { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Encoding': 'gzip' }
    // The 206 branch is what the proxy got when it still forwarded ranges (the wrong
    // bytes this server reproduces); the proxy no longer sends Range, so it now gets the 200.
    if (!match) {
      response.writeHead(200, { ...headers, 'Content-Length': gzipped.length })
      response.end(gzipped)
      return
    }
    const [start, end] = [Number(match[1]), Number(match[2])]
    response.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${gzipped.length}`, 'Content-Length': end - start + 1 })
    response.end(gzipped.subarray(start, end + 1))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const local = `http://127.0.0.1:${server.address().port}`
  return {
    close: () => new Promise((resolve) => server.close(resolve)),
    fetch: (input, init) => fetch(String(input).replace('https://text.example.com', local), init),
  }
}

test('a range of a file the target gzips returns exactly the requested bytes of the file', async () => {
  const text = Array.from({ length: 400 }, (_, line) => `Line ${line}: WordPress Playground README text.`).join('\n')
  const target = await gzipServer(text)
  try {
    for (const headers of [{ Range: 'bytes=10-29' }, { 'X-Cors-Proxy-Range': 'bytes=5000-5099' }]) {
      const range = Object.values(headers)[0]
      const [start, end] = range.slice(6).split('-').map(Number)
      const response = await handleCorsProxy(proxied('https://text.example.com/README.md', { headers }), { fetch: target.fetch })
      assert.equal(response.status, 206, range)
      assert.equal(response.headers.get('Content-Range'), `bytes ${start}-${end}/${Buffer.byteLength(text)}`, range)
      assert.equal(response.headers.get('Content-Encoding'), null, range)
      assert.equal(response.headers.get('Accept-Ranges'), 'bytes', range)
      assert.equal(response.headers.get('Cache-Control'), 'no-store, no-transform', range)
      assert.equal(await response.text(), text.slice(start, end + 1), range)
    }
  } finally {
    await target.close()
  }
})

test('a range of a .gz file the target gzips again gives the bytes of the .gz file, as a plain GET does', async () => {
  const archive = gzipSync(Buffer.from('abcdefghijklmnopqrstuvwxyz'.repeat(40)))
  const target = await gzipServer(archive)
  try {
    const whole = await handleCorsProxy(proxied('https://text.example.com/backup.sql.gz'), { fetch: target.fetch })
    assert.deepEqual(Buffer.from(await whole.arrayBuffer()), archive)
    const response = await handleCorsProxy(proxied('https://text.example.com/backup.sql.gz', { headers: { Range: 'bytes=0-9' } }), { fetch: target.fetch })
    assert.equal(response.status, 206)
    assert.equal(response.headers.get('Content-Range'), `bytes 0-9/${archive.length}`)
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), archive.subarray(0, 10))
  } finally {
    await target.close()
  }
})

// An uncompressed 1000-byte file in ten chunks of 100. The first request's chunks read are
// counted in `read`; a later request (the proxy's own range request) gets `ranged(request)`.
function chunkedFile(ranged, validators = { ETag: '"v1"' }) {
  const file = Uint8Array.from({ length: 1000 }, (_, index) => index % 251)
  const read = { chunks: 0, cancelled: false }
  const upstream = recorder((request) => {
    if (upstream.calls.length > 1) return ranged(request, file)
    let chunk = 0
    return new Response(new ReadableStream({
      pull(controller) {
        if (chunk === 10) return controller.close()
        controller.enqueue(file.slice(chunk * 100, chunk * 100 + 100))
        chunk += 1
        read.chunks = chunk
      },
      cancel() {
        read.cancelled = true
      },
    }), { headers: { 'Content-Type': 'application/zip', 'Content-Length': '1000', ...validators } })
  })
  return { file, read, upstream }
}

test('a range of an uncompressed file is sliced from the start of the file and stops reading once it is complete, when the target ignores the range', async () => {
  const { file, read, upstream } = chunkedFile((_, whole) => new Response(whole, { headers: { 'Content-Length': '1000' } }))
  const response = await handleCorsProxy(proxied('https://example.com/plugin.zip', { headers: { Range: 'bytes=150-249' } }), { fetch: upstream.fetch })
  assert.equal(upstream.calls[0].headers.get('Range'), null)
  assert.equal(upstream.calls[1].headers.get('Range'), 'bytes=150-249')
  assert.equal(upstream.calls[1].headers.get('Accept-Encoding'), 'identity')
  const chunksRead = read.chunks
  assert.equal(response.status, 206)
  assert.equal(response.headers.get('Content-Range'), 'bytes 150-249/1000')
  assert.equal(response.headers.get('Content-Length'), '100')
  assert.equal(response.headers.get('ETag'), '"v1"')
  assert.equal(response.headers.get('Accept-Ranges'), 'bytes')
  assert.equal(response.headers.get('Cache-Control'), 'no-store, no-transform')
  assert.equal(response.headers.get('Content-Encoding'), null)
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), file.slice(150, 250))
  assert.ok(read.chunks <= 4, `read ${read.chunks} of 10 chunks`)
  assert.ok(chunksRead <= 1, 'the whole file waits until the range request is answered')
})

test('a range later in an uncompressed file comes from the target when it answers with exactly those bytes, and the whole file is not read', async () => {
  const { file, read, upstream } = chunkedFile((request, whole) => {
    const [, start, end] = request.headers.get('Range').match(/bytes=(\d+)-(\d+)/).map(Number)
    return new Response(whole.slice(start, end + 1), { status: 206, headers: { 'Content-Range': `bytes ${start}-${end}/1000`, 'Content-Length': String(end - start + 1), ETag: '"v1"' } })
  })
  const response = await handleCorsProxy(proxied('https://example.com/plugin.zip', { headers: { Range: 'bytes=-100' } }), { fetch: upstream.fetch })
  assert.equal(response.status, 206)
  assert.equal(response.headers.get('Content-Range'), 'bytes 900-999/1000')
  assert.equal(upstream.calls[1].headers.get('Range'), 'bytes=900-999')
  assert.equal(upstream.calls[1].headers.get('If-Range'), '"v1"')
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), file.slice(900))
  assert.ok(read.chunks <= 1, `read ${read.chunks} chunks of the whole file`)
  assert.equal(read.cancelled, true)
})

test('a range answer from the target that is compressed, of another size or not the asked bytes is not used', async () => {
  const wrong = [
    (start, end, whole) => new Response(whole.slice(start, end + 1), { status: 206, headers: { 'Content-Range': `bytes ${start}-${end}/640`, ETag: '"v1"' } }),
    (start, end, whole) => new Response(whole.slice(start, end + 1), { status: 206, headers: { 'Content-Range': `bytes ${start}-${end}/1000`, 'Content-Encoding': 'gzip', ETag: '"v1"' } }),
    (start, end, whole) => new Response(whole.slice(0, end - start + 1), { status: 206, headers: { 'Content-Range': `bytes 0-${end - start}/1000`, ETag: '"v1"' } }),
    (start, end, whole) => new Response(whole.slice(start, end + 1), { status: 206, headers: { 'Content-Range': `bytes ${start}-${end}/1000`, 'Content-Length': '7', ETag: '"v1"' } }),
    (start, end) => new Response(new Uint8Array(end - start + 1).fill(98), { status: 206, headers: { 'Content-Range': `bytes ${start}-${end}/1000`, ETag: '"v2"' } }),
    (start, end) => new Response(new Uint8Array(end - start + 1).fill(98), { status: 206, headers: { 'Content-Range': `bytes ${start}-${end}/1000` } }),
    () => { throw new TypeError('network') },
  ]
  for (const [index, answer] of wrong.entries()) {
    const { file, upstream } = chunkedFile((request, whole) => {
      const [, start, end] = request.headers.get('Range').match(/bytes=(\d+)-(\d+)/).map(Number)
      return answer(start, end, whole)
    })
    const response = await handleCorsProxy(proxied('https://example.com/plugin.zip', { headers: { Range: 'bytes=300-349' } }), { fetch: upstream.fetch })
    assert.equal(response.status, 206, String(index))
    assert.equal(response.headers.get('Content-Range'), 'bytes 300-349/1000', String(index))
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), file.slice(300, 350), String(index))
  }
})

test('an invalid range gets the whole file, and a range of an empty file gets 416, with no range sent on', async () => {
  for (const [range, body, declared, status, contentRange] of [
    ['bytes=5-2', 'abcdefghij', '10', 200, null],
    ['items=0-1', 'abcdefghij', '10', 200, null],
    ['bytes=0-0', '', '0', 416, 'bytes */0'],
    ['bytes=0-0', '', null, 416, 'bytes */0'],
  ]) {
    const upstream = recorder(() => new Response(body, { headers: declared ? { 'Content-Length': declared } : {} }))
    const response = await handleCorsProxy(proxied('https://example.com/a.txt', { headers: { Range: range } }), { fetch: upstream.fetch })
    const label = `${range} on ${JSON.stringify(body)}`
    assert.equal(response.status, status, label)
    assert.equal(response.headers.get('Content-Range'), contentRange, label)
    if (status === 200) assert.equal(await response.text(), body, label)
    assert.deepEqual(upstream.calls.map((call) => call.headers.get('Range')), [null], label)
  }
})

test('a range later in a file without a strong ETag is cut from the whole file, with no range request', async () => {
  // A file that changed in between, at the same size, would otherwise give its new bytes.
  for (const validators of [{ ETag: 'W/"old"' }, { 'Last-Modified': 'Thu, 19 Nov 2026 10:00:00 GMT' }, {}]) {
    const { file, upstream } = chunkedFile((request) => {
      const [, start, end] = request.headers.get('Range').match(/bytes=(\d+)-(\d+)/).map(Number)
      return new Response(new Uint8Array(end - start + 1).fill(98), { status: 206, headers: { 'Content-Range': `bytes ${start}-${end}/1000`, ETag: '"new"' } })
    }, validators)
    const response = await handleCorsProxy(proxied('https://example.com/plugin.zip', { headers: { Range: 'bytes=500-504' } }), { fetch: upstream.fetch })
    const label = JSON.stringify(validators)
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), file.slice(500, 505), label)
    assert.equal(upstream.calls.length, 1, label)
  }
})

test('a range from the start of the file makes no range request', async () => {
  const { file, upstream } = chunkedFile(() => assert.fail('no second request'))
  const response = await handleCorsProxy(proxied('https://example.com/plugin.zip', { headers: { Range: 'bytes=0-99' } }), { fetch: upstream.fetch })
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), file.slice(0, 100))
  assert.equal(upstream.calls.length, 1)
})

test('a range answer drops the checksums of the whole file, with or without a declared size', async () => {
  const checksums = { 'Content-Digest': 'sha-256=:wholefile=:', 'Content-MD5': 'wholefile==' }
  for (const declared of [{ 'Content-Length': '26' }, {}]) {
    const upstream = recorder(() => new Response('abcdefghijklmnopqrstuvwxyz', { headers: { 'Content-Type': 'text/plain', ...checksums, ...declared } }))
    const response = await handleCorsProxy(proxied('https://example.com/file.txt', { headers: { Range: 'bytes=2-4' } }), { fetch: upstream.fetch })
    const label = declared['Content-Length'] ? 'streamed' : 'read whole'
    assert.equal(response.status, 206, label)
    assert.equal(await response.text(), 'cde', label)
    assert.equal(response.headers.get('Content-Digest'), null, label)
    assert.equal(response.headers.get('Content-MD5'), null, label)
  }
})

test('a small range of an uncompressed file over 100 MB is answered, and a slice of 100 MB or more gets 413', async () => {
  const size = 150 * 1024 * 1024
  const chunk = new Uint8Array(1024 * 1024).fill(7)
  let chunksRead = 0
  let cancelled = false
  const upstream = recorder(() => new Response(new ReadableStream({
    pull(controller) {
      chunksRead += 1
      if (chunksRead > 150) controller.close()
      else controller.enqueue(chunk)
    },
    cancel() {
      cancelled = true
    },
  }),{ headers: { 'Content-Type': 'application/zip', 'Content-Length': String(size) } }))
  const response = await handleCorsProxy(proxied('https://example.com/big.zip', { headers: { Range: 'bytes=0-99' } }), { fetch: upstream.fetch })
  assert.equal(response.status, 206)
  assert.equal(response.headers.get('Content-Range'), `bytes 0-99/${size}`)
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), chunk.subarray(0, 100))
  assert.ok(chunksRead <= 3, `read ${chunksRead} MB`)

  chunksRead = 0
  cancelled = false
  const open = await handleCorsProxy(proxied('https://example.com/big.zip', { headers: { Range: 'bytes=0-' } }), { fetch: upstream.fetch })
  assert.equal(open.status, 413)
  assert.ok(chunksRead <= 3, `read ${chunksRead} MB for a slice of 100 MB or more`)
  assert.equal(cancelled, true)
})

test('a range with If-Range gets the whole file, and the target never sees the range', async () => {
  const upstream = recorder(() => new Response('abcdefghij', { headers: { 'Content-Length': '10' } }))
  const response = await handleCorsProxy(proxied('https://example.com/a.txt', { headers: { Range: 'bytes=0-4', 'If-Range': '"v1"' } }), { fetch: upstream.fetch })
  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'abcdefghij')
  assert.equal(upstream.calls[0].headers.get('Range'), null)
})

test('a range answered by a redirect or an error is relayed as it is', async () => {
  for (const [status, headers] of [[404, {}], [302, { Location: 'https://cdn.example.com/a.zip' }]]) {
    const upstream = recorder(() => new Response(status === 404 ? 'missing' : null, { status, headers }))
    const response = await handleCorsProxy(proxied('https://example.com/a.zip', { headers: { Range: 'bytes=0-9' } }), { fetch: upstream.fetch })
    assert.equal(response.status, status)
    assert.equal(response.headers.get('Content-Range'), null, String(status))
    if (status === 302) assert.equal(response.headers.get('Location'), `${HOST}${CORS_PROXY_PATH}?https://cdn.example.com/a.zip`)
  }
})

test('a range of a compressed or unsized file over 32 MiB is refused instead of held in memory', async () => {
  for (const headers of [{ 'Content-Encoding': 'gzip' }, {}]) {
    let sent = 0
    const upstream = recorder(() => new Response(new ReadableStream({
      pull(controller) {
        sent += 1
        if (sent > 40) controller.close()
        else controller.enqueue(new Uint8Array(1024 * 1024))
      },
    }), { headers }))
    const response = await handleCorsProxy(proxied('https://example.com/a.txt', { headers: { Range: 'bytes=0-9' } }), { fetch: upstream.fetch })
    assert.equal(response.status, 413, JSON.stringify(headers))
    assert.ok(sent <= 34, `read ${sent} MB`)
  }
})

test('a range of a file that ends before its declared size fails instead of ending short', async () => {
  const upstream = recorder(() => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(500))
      controller.close()
    },
  }), { headers: { 'Content-Length': '1000' } }))
  const response = await handleCorsProxy(proxied('https://example.com/a.zip', { headers: { Range: 'bytes=400-599' } }), { fetch: upstream.fetch })
  assert.equal(response.status, 206)
  await assert.rejects(response.arrayBuffer(), /fewer bytes/)
})

test('answers open, suffix, unsatisfiable and multiple ranges the way HTTP describes', async () => {
  const file = 'abcdefghijklmnopqrstuvwxyz'
  const upstream = recorder(() => new Response(file, { headers: { 'Content-Length': '26' } }))
  const cases = [
    ['bytes=20-', 206, 'bytes 20-25/26', 'uvwxyz'],
    ['bytes=-3', 206, 'bytes 23-25/26', 'xyz'],
    ['bytes=24-100', 206, 'bytes 24-25/26', 'yz'],
    ['bytes=26-30', 416, 'bytes */26', null],
    ['bytes=0-1, 5-6', 200, null, file],
  ]
  for (const [range, status, contentRange, body] of cases) {
    const response = await handleCorsProxy(proxied('https://example.com/a.txt', { headers: { Range: range } }), { fetch: upstream.fetch })
    assert.equal(response.status, status, range)
    assert.equal(response.headers.get('Content-Range'), contentRange, range)
    if (body !== null) assert.equal(await response.text(), body, range)
  }
})

test('drops response headers that would act on the Playground host\'s own origin', async () => {
  const dangerous = {
    'Clear-Site-Data': '"storage"',
    NEL: '{"report_to":"a","max_age":86400}',
    'Report-To': '{"group":"a","max_age":86400,"endpoints":[{"url":"https://example.com/r"}]}',
    'Set-Login': 'logged-in',
  }
  const link = '<https://api.github.com/x?page=2>; rel="next"'
  const upstream = recorder(() => new Response('body', { headers: { 'Content-Type': 'text/plain', Link: link, ...dangerous } }))
  const response = await handleCorsProxy(proxied('https://example.com/'), { fetch: upstream.fetch })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Content-Type'), 'text/plain')
  assert.equal(response.headers.get('Link'), link)
  for (const name of Object.keys(dangerous)) assert.equal(response.headers.get(name), null, name)
})

test('forwards POST bodies and restores a tunnelled content type and range', async () => {
  const upstream = recorder()
  await handleCorsProxy(proxied('https://api.example.com/activate', {
    method: 'POST',
    body: 'license=abc',
    headers: { 'Content-Type': 'application/octet-stream', 'X-Cors-Proxy-Content-Type': 'multipart/form-data; boundary=x', 'X-Cors-Proxy-Range': 'bytes=0-9' },
  }), { fetch: upstream.fetch })
  assert.equal(upstream.calls[0].method, 'POST')
  assert.equal(upstream.calls[0].body, 'license=abc')
  assert.equal(upstream.calls[0].headers.get('Content-Type'), 'multipart/form-data; boundary=x')
  assert.equal(upstream.calls[0].headers.get('Range'), 'bytes=0-9')
  assert.equal(upstream.calls[0].headers.get('X-Cors-Proxy-Content-Type'), null)
})

test('sends redirects back through the proxy', async () => {
  for (const [location, expected] of [
    ['https://cdn.example.com/file.zip', 'https://cdn.example.com/file.zip'],
    ['/download/file.zip', 'https://example.com/download/file.zip'],
    ['file.zip', 'https://example.com/plugins/file.zip'],
  ]) {
    const upstream = recorder(() => new Response(null, { status: 302, headers: { Location: location } }))
    const response = await handleCorsProxy(proxied('https://example.com/plugins/latest'), { fetch: upstream.fetch })
    assert.equal(response.status, 302)
    assert.equal(response.headers.get('Location'), `${HOST}${CORS_PROXY_PATH}?${expected}`)
  }
})

test('refuses responses of 100 MB or more', async () => {
  const upstream = recorder(() => new Response('x', { headers: { 'Content-Length': String(100 * 1024 * 1024) } }))
  const response = await handleCorsProxy(proxied('https://example.com/huge.zip'), { fetch: upstream.fetch })
  assert.equal(response.status, 413)
})

test('allows only GET, HEAD, POST and OPTIONS for targets outside the licence API list', async () => {
  const upstream = recorder()
  for (const [method, target] of [
    ['PUT', 'https://example.com/'],
    ['PATCH', 'https://example.com/'],
    ['DELETE', 'https://example.com/'],
    ['PUT', 'https://freemius.com/'],
    ['PUT', 'https://api.freemius.com.evil.test/v1/installs.json'],
    ['PUT', 'https://evil-api.freemius.com/v1/installs.json'],
    ['PUT', 'https://evil.test/api.freemius.com'],
    ['PUT', 'https://evil.test/?https://api.freemius.com/'],
    ['PROPFIND', 'https://api.freemius.com/'],
  ]) {
    const response = await handleCorsProxy(proxied(target, { method, ...(method === 'PROPFIND' ? {} : { body: 'x' }) }), { fetch: upstream.fetch })
    assert.equal(response.status, 405, `${method} ${target}`)
    assert.equal(response.headers.get('Allow'), 'GET, HEAD, POST, OPTIONS', `${method} ${target}`)
    assert.equal(response.headers.get('X-Playground-Cors-Proxy'), 'true', `${method} ${target}`)
  }
  assert.equal((await handleCorsProxy(proxied('https://example.com/', { method: 'OPTIONS' }), { fetch: upstream.fetch })).status, 204)
  assert.equal(upstream.calls.length, 0)
})

test('relays PUT, PATCH and DELETE with their bodies to the Freemius licence API hosts only', async () => {
  // Freemius-based plugins (WP Activity Log and others) activate and sync licences with
  // PUT and DELETE on these hosts; every other host keeps the GET, HEAD and POST limit.
  const upstream = recorder()
  const cases = [
    ['PUT', 'https://api.freemius.com/v1/plugins/1/installs/2.json?auth_date=x', '{"license_key":"fake"}'],
    ['PATCH', 'https://sandbox-api.freemius.com/v1/plugins/1/installs/2.json', '{"is_active":true}'],
    ['DELETE', 'https://API.Freemius.com./v1/plugins/1/installs/2/licenses/3.json', null],
  ]
  for (const [method, target, body] of cases) {
    const response = await handleCorsProxy(proxied(target, { method, body, headers: { 'X-Cors-Proxy-Content-Type': 'application/json' } }), { fetch: upstream.fetch })
    assert.equal(response.status, 200, `${method} ${target}`)
  }
  assert.deepEqual(upstream.calls.map((call) => [call.method, new URL(call.url).hostname, call.body || null]), [
    ['PUT', 'api.freemius.com', '{"license_key":"fake"}'],
    ['PATCH', 'sandbox-api.freemius.com', '{"is_active":true}'],
    ['DELETE', 'api.freemius.com.', null],
  ])
  assert.equal(upstream.calls[0].url, 'https://api.freemius.com/v1/plugins/1/installs/2.json?auth_date=x')
  assert.equal(upstream.calls[0].headers.get('Content-Type'), 'application/json')
})

test('a licence API PUT redirected to another host is relayed, and following it with PUT is refused', async () => {
  const upstream = recorder(() => new Response(null, { status: 307, headers: { Location: 'https://elsewhere.example.net/' } }))
  const response = await handleCorsProxy(proxied('https://api.freemius.com/v1/installs.json', { method: 'PUT', body: 'x' }), { fetch: upstream.fetch })
  assert.equal(response.status, 307)
  const location = response.headers.get('Location')
  assert.equal(location, `${HOST}${CORS_PROXY_PATH}?https://elsewhere.example.net/`)
  const followed = await handleCorsProxy(proxied(location.slice(`${HOST}${CORS_PROXY_PATH}?`.length), { method: 'PUT', body: 'x' }), { fetch: upstream.fetch })
  assert.equal(followed.status, 405)
  assert.equal(upstream.calls.length, 1)
})

test('a licence API PUT keeps every other protection', async () => {
  const upstream = recorder()
  const put = (target, init = {}) => proxied(target, { method: 'PUT', body: 'x', ...init })
  const crossSite = await handleCorsProxy(put('https://api.freemius.com/', { headers: { 'Sec-Fetch-Site': 'cross-site' } }), { fetch: upstream.fetch })
  assert.equal(crossSite.status, 403)
  const navigation = await handleCorsProxy(put('https://api.freemius.com/', { headers: { 'Sec-Fetch-Dest': 'document' } }), { fetch: upstream.fetch })
  assert.equal(navigation.status, 403)
  const limited = await handleCorsProxy(put('https://api.freemius.com/'), { fetch: upstream.fetch, limiter: { limit: async () => ({ success: false }) } })
  assert.equal(limited.status, 429)
  const credentials = await handleCorsProxy(put('https://user:pass@api.freemius.com/'), { fetch: upstream.fetch })
  assert.equal(credentials.status, 400)
  assert.equal(upstream.calls.length, 0)

  await handleCorsProxy(put('https://api.freemius.com/', { headers: { Authorization: 'FS 1:2:sig', Cookie: 'a=b' } }), { fetch: upstream.fetch })
  assert.equal(upstream.calls[0].headers.get('Authorization'), null)
  assert.equal(upstream.calls[0].headers.get('Cookie'), null)
  await handleCorsProxy(put('https://api.freemius.com/', { headers: { Authorization: 'FS 1:2:sig', 'X-Cors-Proxy-Allowed-Request-Headers': 'authorization' } }), { fetch: upstream.fetch })
  assert.equal(upstream.calls[1].headers.get('Authorization'), 'FS 1:2:sig')
})

test('reports an unreachable target as a bad gateway', async () => {
  const response = await handleCorsProxy(proxied('https://down.example.com/'), { fetch: async () => { throw new Error('connect failed') } })
  assert.equal(response.status, 502)
  assert.equal(response.headers.get('X-Playground-Cors-Proxy'), 'true')
})

test('applies the per-visitor rate limit before contacting the target', async () => {
  const upstream = recorder()
  const keys = []
  const limiter = { limit: async ({ key }) => { keys.push(key); return { success: false } } }
  const request = proxied('https://example.com/', { headers: { 'CF-Connecting-IP': '203.0.113.7' } })
  const response = await handleCorsProxy(request, { fetch: upstream.fetch, limiter })
  assert.equal(response.status, 429)
  assert.deepEqual(keys, ['203.0.113.7'])
  assert.equal(upstream.calls.length, 0)
  const allowed = { limit: async () => ({ success: true }) }
  assert.equal((await handleCorsProxy(proxied('https://example.com/'), { fetch: upstream.fetch, limiter: allowed })).status, 200)
})

test('stops a response without a declared size once it passes 100 MB', async () => {
  const chunk = new Uint8Array(1024 * 1024)
  let sent = 0
  const endless = new ReadableStream({
    pull(controller) {
      sent += 1
      if (sent > 120) controller.close()
      else controller.enqueue(chunk)
    },
  })
  const upstream = recorder(() => new Response(endless))
  const response = await handleCorsProxy(proxied('https://example.com/stream'), { fetch: upstream.fetch })
  assert.equal(response.status, 200)
  await assert.rejects(response.arrayBuffer(), /too large/)
  assert.ok(sent <= 102, `read ${sent} MB`)
})

const withAuthorization = { Authorization: 'Bearer secret', 'X-Cors-Proxy-Allowed-Request-Headers': 'authorization' }

test('an authorized request keeps relaying redirects that stay on the same origin', async () => {
  const upstream = recorder(() => new Response(null, { status: 302, headers: { Location: '/v2/file.zip' } }))
  const response = await handleCorsProxy(proxied('https://api.example.com/v1/file.zip', { headers: withAuthorization }), { fetch: upstream.fetch })
  assert.equal(response.status, 302)
  assert.equal(response.headers.get('Location'), `${HOST}${CORS_PROXY_PATH}?https://api.example.com/v2/file.zip`)
  assert.equal(upstream.calls.length, 1)
})

test('an authorized request follows a redirect to another origin itself, without Authorization', async () => {
  const upstream = recorder((request) => {
    const url = new URL(request.url)
    if (url.hostname === 'api.example.com') return new Response(null, { status: 302, headers: { Location: 'https://cdn.example.net/file.zip' } })
    if (url.pathname === '/file.zip') return new Response(null, { status: 301, headers: { Location: '/final.zip' } })
    return new Response('file bytes', { headers: { 'Content-Type': 'application/zip' } })
  })
  const response = await handleCorsProxy(proxied('https://api.example.com/v1/file.zip', { headers: withAuthorization }), { fetch: upstream.fetch })
  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'file bytes')
  assert.equal(response.headers.get('Location'), null)
  assert.deepEqual(upstream.calls.map((call) => [call.url, call.headers.get('Authorization')]), [
    ['https://api.example.com/v1/file.zip', 'Bearer secret'],
    ['https://cdn.example.net/file.zip', null],
    ['https://cdn.example.net/final.zip', null],
  ])
})

test('an authorized POST, PUT, PATCH or DELETE redirected to another origin is refused', async () => {
  for (const [method, target] of [
    ['POST', 'https://api.example.com/activate'],
    ['PUT', 'https://api.freemius.com/v1/installs.json'],
    ['PATCH', 'https://api.freemius.com/v1/installs.json'],
    ['DELETE', 'https://api.freemius.com/v1/installs.json'],
  ]) {
    const upstream = recorder(() => new Response(null, { status: 307, headers: { Location: 'https://elsewhere.example.net/' } }))
    const response = await handleCorsProxy(proxied(target, { method, body: 'x', headers: withAuthorization }), { fetch: upstream.fetch })
    assert.equal(response.status, 502, method)
    assert.equal(upstream.calls.length, 1, method)
  }
})

test('a followed redirect is checked like any other target', async () => {
  const upstream = recorder(() => new Response(null, { status: 302, headers: { Location: 'http://169.254.169.254/latest/' } }))
  const response = await handleCorsProxy(proxied('https://api.example.com/', { headers: withAuthorization }), { fetch: upstream.fetch })
  assert.equal(response.status, 400)
  assert.equal(upstream.calls.length, 1)
})

test('a followed redirect chain stops after five hops', async () => {
  let hop = 0
  const upstream = recorder(() => new Response(null, { status: 302, headers: { Location: `https://hop${++hop}.example.net/` } }))
  const response = await handleCorsProxy(proxied('https://api.example.com/', { headers: withAuthorization }), { fetch: upstream.fetch })
  assert.equal(response.status, 502)
  assert.equal(upstream.calls.length, 6)
})

test('a followed redirect keeps HEAD as HEAD', async () => {
  const upstream = recorder((request) => new URL(request.url).hostname === 'api.example.com'
    ? new Response(null, { status: 302, headers: { Location: 'https://cdn.example.net/file.zip' } })
    : new Response(null, { headers: { 'Content-Length': '1234' } }))
  const response = await handleCorsProxy(proxied('https://api.example.com/file.zip', { method: 'HEAD', headers: withAuthorization }), { fetch: upstream.fetch })
  assert.equal(response.status, 200)
  assert.equal(response.body, null)
  assert.deepEqual(upstream.calls.map((call) => [call.method, call.headers.get('Authorization')]), [['HEAD', 'Bearer secret'], ['HEAD', null]])
})

test('a range after a followed redirect is cut from the redirected file, with no range request and no Authorization', async () => {
  const upstream = recorder((request) => new URL(request.url).hostname === 'api.example.com'
    ? new Response(null, { status: 302, headers: { Location: 'https://cdn.example.net/file.txt' } })
    : new Response('abcdefghijklmnopqrstuvwxyz', { headers: { 'Content-Length': '26' } }))
  const response = await handleCorsProxy(proxied('https://api.example.com/file.txt', { headers: { ...withAuthorization, Range: 'bytes=20-24' } }), { fetch: upstream.fetch })
  assert.equal(response.status, 206)
  assert.equal(response.headers.get('Content-Range'), 'bytes 20-24/26')
  assert.equal(await response.text(), 'uvwxy')
  assert.deepEqual(upstream.calls.map((call) => [call.url, call.headers.get('Range'), call.headers.get('Authorization')]), [
    ['https://api.example.com/file.txt', null, 'Bearer secret'],
    ['https://cdn.example.net/file.txt', null, null],
  ])
})
