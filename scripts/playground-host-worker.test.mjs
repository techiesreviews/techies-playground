import test from 'node:test'
import assert from 'node:assert/strict'
import worker, { resetSplitManifest } from '../playground-host/worker.js'

const manifest = {
  '/wp-7.1/wordpress-static.zip': {
    size: 11,
    parts: ['/wp-7.1/wordpress-static.zip.part0', '/wp-7.1/wordpress-static.zip.part1'],
  },
  '/assets/extensions/icu-AAAAAAAA.dat': {
    size: 3,
    parts: ['/assets/extensions/icu-AAAAAAAA.dat.part0'],
  },
}

function assets(files, requests = []) {
  return {
    async fetch(input) {
      const url = new URL(input instanceof Request ? input.url : input)
      requests.push(url.pathname)
      return url.pathname in files ? new Response(files[url.pathname]) : new Response('Not found', { status: 404 })
    },
  }
}

function env(requests) {
  return {
    ASSETS: assets({
      '/split-files.json': JSON.stringify(manifest),
      '/wp-7.1/wordpress-static.zip.part0': 'hello ',
      '/wp-7.1/wordpress-static.zip.part1': 'world',
      '/assets/extensions/icu-AAAAAAAA.dat.part0': 'icu',
    }, requests),
  }
}

const ctx = { waitUntil() {} }

test.beforeEach(() => resetSplitManifest())

test('joins a split file back together in order', async () => {
  const response = await worker.fetch(new Request('https://wp.techies.tools/wp-7.1/wordpress-static.zip'), env(), ctx)
  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'hello world')
  assert.equal(response.headers.get('Content-Type'), 'application/zip')
  assert.equal(response.headers.get('Content-Length'), '11')
  assert.equal(response.headers.get('Cache-Control'), 'public, max-age=3600')
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff')
})

test('caches split hashed assets for a year', async () => {
  const response = await worker.fetch(new Request('https://wp.techies.tools/assets/extensions/icu-AAAAAAAA.dat'), env(), ctx)
  assert.equal(await response.text(), 'icu')
  assert.equal(response.headers.get('Content-Type'), 'application/octet-stream')
  assert.equal(response.headers.get('Cache-Control'), 'public, max-age=31536000, immutable')
})

test('answers HEAD for a split file without a body', async () => {
  const response = await worker.fetch(new Request('https://wp.techies.tools/wp-7.1/wordpress-static.zip', { method: 'HEAD' }), env(), ctx)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Content-Length'), '11')
  assert.equal(response.body, null)
})

test('returns 404 for paths that are neither assets nor split files', async () => {
  const response = await worker.fetch(new Request('https://wp.techies.tools/scope:launcher-abc/wp-admin/'), env(), ctx)
  assert.equal(response.status, 404)
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
})

test('rejects methods other than GET and HEAD', async () => {
  const response = await worker.fetch(new Request('https://wp.techies.tools/wp-7.1/wordpress-static.zip', { method: 'POST' }), env(), ctx)
  assert.equal(response.status, 405)
  assert.equal(response.headers.get('Allow'), 'GET, HEAD')
})

test('reads the split-file list once per worker instance', async () => {
  const requests = []
  const shared = env(requests)
  await (await worker.fetch(new Request('https://wp.techies.tools/missing'), shared, ctx)).text()
  await (await worker.fetch(new Request('https://wp.techies.tools/also-missing'), shared, ctx)).text()
  assert.equal(requests.filter((pathname) => pathname === '/split-files.json').length, 1)
})

test('retries the split-file list after a failed read', async () => {
  let calls = 0
  const flaky = {
    ASSETS: {
      async fetch(input) {
        const url = new URL(input instanceof Request ? input.url : input)
        if (url.pathname === '/split-files.json') {
          calls += 1
          return calls === 1 ? new Response('busy', { status: 503 }) : new Response(JSON.stringify(manifest))
        }
        return url.pathname === '/assets/extensions/icu-AAAAAAAA.dat.part0' ? new Response('icu') : new Response('Not found', { status: 404 })
      },
    },
  }
  const first = await worker.fetch(new Request('https://wp.techies.tools/assets/extensions/icu-AAAAAAAA.dat'), flaky, ctx)
  assert.equal(first.status, 503)
  const second = await worker.fetch(new Request('https://wp.techies.tools/assets/extensions/icu-AAAAAAAA.dat'), flaky, ctx)
  assert.equal(await second.text(), 'icu')
})

test('fails the response instead of serving a truncated file when a part is missing', async () => {
  const broken = {
    ASSETS: assets({
      '/split-files.json': JSON.stringify(manifest),
      '/wp-7.1/wordpress-static.zip.part0': 'hello ',
    }),
  }
  const response = await worker.fetch(new Request('https://wp.techies.tools/wp-7.1/wordpress-static.zip'), broken, ctx)
  await assert.rejects(response.text())
})
