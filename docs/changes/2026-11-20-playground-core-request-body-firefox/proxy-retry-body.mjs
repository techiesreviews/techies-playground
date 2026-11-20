// Evidence driver for docs/changes/2026-11-20-playground-core-request-body-firefox.md, not part
// of the test suite. It bundles the request code of a WordPress Playground source checkout and
// runs it in Firefox and Chromium against a local echo CORS proxy, for a POST to a host that is
// not Freemius and cannot be reached directly, so every request is retried through the proxy.
//
// Needs `npm ci` in this repository (esbuild and the @php-wasm packages) and Playwright with
// Firefox and Chromium installed somewhere else (npm i playwright; npx playwright install).
// Usage: PLAYWRIGHT=/abs/path/node_modules/playwright/index.mjs \
//          node proxy-retry-body.mjs <wordpress-playground checkout>
// Exits 1 when any request reached the proxy without its body.
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const checkout = path.resolve(process.argv[2] ?? '.')
const repo = fileURLToPath(new URL('../../../', import.meta.url))
const { firefox, chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright')

const entry = `
export { fetchWithCorsProxy } from '@php-wasm/web-service-worker'
export { RawBytesFetch } from ${JSON.stringify(path.join(checkout, 'packages/php-wasm/web/src/lib/tcp-over-fetch-websocket.ts'))}
`
const bundle = await build({
  stdin: { contents: entry, resolveDir: repo, loader: 'ts' },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  write: false,
  logLevel: 'error',
  alias: { '@php-wasm/web-service-worker': path.join(checkout, 'packages/php-wasm/web-service-worker/src/index.ts') },
  nodePaths: [path.join(repo, 'node_modules')],
  // @php-wasm/universal imports Node modules only when it runs in Node.
  external: ['worker_threads', 'fs', 'path', 'crypto', 'os', 'url'],
})

const page = '<!doctype html><script type="module">import * as pg from "/bundle.js"; window.pg = pg</script>'
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  if (url.pathname === '/') return res.writeHead(200, { 'content-type': 'text/html' }).end(page)
  if (url.pathname === '/bundle.js') return res.writeHead(200, { 'content-type': 'text/javascript' }).end(bundle.outputFiles[0].text)
  if (url.pathname !== '/proxy') return res.writeHead(404).end()
  // Echo what the proxy received, with the header Playground expects from its CORS proxy.
  const chunks = []
  req.on('data', (chunk) => chunks.push(chunk))
  req.on('end', () => {
    res.writeHead(200, { 'content-type': 'application/json', 'x-playground-cors-proxy': 'true' })
    res.end(JSON.stringify({ target: url.search.slice(1), method: req.method, body: Buffer.concat(chunks).toString() }))
  })
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`

let lost = 0
for (const browserType of [firefox, chromium]) {
  const browser = await browserType.launch()
  try {
    const tab = await browser.newPage()
    await tab.goto(origin)
    await tab.waitForFunction(() => window.pg)
    const result = await tab.evaluate(async (proxy) => {
      const { fetchWithCorsProxy, RawBytesFetch } = window.pg
      const body = 'plugin=not-freemius&licence_key=TEST-KEY-123'
      const host = 'non-freemius.invalid'
      const target = `https://${host}/wp-json/example-plugin/v1/activate`
      const form = { 'content-type': 'application/x-www-form-urlencoded' }
      // The raw HTTP response carries a status line, headers and chunk sizes around the JSON.
      const received = (text) => JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)).body
      const scenarios = {
        // A plugin's fetch() from the page (Request object), as the service worker sees it.
        'fetchWithCorsProxy, Request': async () =>
          received(await (await fetchWithCorsProxy(new Request(target, { method: 'POST', headers: form, body }), undefined, proxy)).text()),
        'fetchWithCorsProxy, URL and init': async () =>
          received(await (await fetchWithCorsProxy(target, { method: 'POST', headers: form, body }, proxy)).text()),
        // PHP's curl or wp_remote_post() over the TCP-over-fetch bridge. With
        // "Expect: 100-continue" the body arrives only after the headers were parsed.
        'RawBytesFetch, Expect: 100-continue': async () => {
          const encoder = new TextEncoder()
          let socket
          const bytes = new ReadableStream({ start: (controller) => { socket = controller } })
          socket.enqueue(encoder.encode(
            `POST /wp-json/example-plugin/v1/activate HTTP/1.1\r\nHost: ${host}\r\n` +
            `Content-Type: application/x-www-form-urlencoded\r\nContent-Length: ${body.length}\r\nExpect: 100-continue\r\n\r\n`
          ))
          const { request, bodyToBuffer } = await RawBytesFetch.parseHttpRequest(bytes, host, 'https')
          const response = RawBytesFetch.fetchRawResponseBytes(request, proxy, bodyToBuffer)
          setTimeout(() => { socket.enqueue(encoder.encode(body)); socket.close() }, 50)
          return received(await new Response(response).text())
        },
      }
      const out = { expected: body }
      for (const [name, run] of Object.entries(scenarios)) {
        try {
          out[name] = await run()
        } catch (error) {
          out[name] = `error: ${error}`
        }
      }
      return out
    }, `${origin}/proxy?`)
    const { expected, ...received } = result
    for (const [name, body] of Object.entries(received)) {
      const kept = body === expected
      if (!kept) lost++
      console.log(`${browserType.name()} | ${name} | ${kept ? 'kept the body' : `lost the body, proxy got ${JSON.stringify(body)}`}`)
    }
  } finally {
    await browser.close()
  }
}
server.close()
console.log(lost ? `${lost} request(s) lost the body` : 'every request kept its body')
process.exitCode = lost ? 1 : 0
