import test from 'node:test'
import assert from 'node:assert/strict'
import { CORS_PROXY_PATH, handleCorsProxy, isCorsProxyRequest } from '../playground-host/cors-proxy.js'

const HOST = 'https://wp.techies.tools'

function proxied(target, init = {}) {
  const headers = new Headers(init.headers)
  if (!headers.has('Sec-Fetch-Site')) headers.set('Sec-Fetch-Site', 'same-origin')
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
  assert.equal(isCorsProxyRequest(new URL(`${HOST}/cors-proxy/?https://example.com/`)), true)
  assert.equal(isCorsProxyRequest(new URL(`${HOST}/remote.html`)), false)
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
    'https://wp.techies.tools/cors-proxy/?https://example.com/',
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

test('allows only GET, HEAD, POST and OPTIONS', async () => {
  const upstream = recorder()
  assert.equal((await handleCorsProxy(proxied('https://example.com/', { method: 'PUT', body: 'x' }), { fetch: upstream.fetch })).status, 405)
  assert.equal((await handleCorsProxy(proxied('https://example.com/', { method: 'OPTIONS' }), { fetch: upstream.fetch })).status, 204)
  assert.equal(upstream.calls.length, 0)
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

test('applies the shared limit for all visitors as well', async () => {
  const upstream = recorder()
  const visitorKeys = []
  const sharedKeys = []
  const limiter = { limit: async ({ key }) => { visitorKeys.push(key); return { success: true } } }
  const globalLimiter = { limit: async ({ key }) => { sharedKeys.push(key); return { success: false } } }
  const response = await handleCorsProxy(proxied('https://example.com/'), { fetch: upstream.fetch, limiter, globalLimiter })
  assert.equal(response.status, 429)
  assert.deepEqual(sharedKeys, ['all'])
  assert.equal(upstream.calls.length, 0)
})
