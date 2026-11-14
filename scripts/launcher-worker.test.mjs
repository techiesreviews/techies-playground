import test from 'node:test'
import assert from 'node:assert/strict'
import worker from '../worker.js'

const env = { ASSETS: { fetch: async () => new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } }) } }

function directives(response) {
  return Object.fromEntries(response.headers.get('Content-Security-Policy').split(';').map((part) => {
    const [name, ...values] = part.trim().split(/\s+/)
    return [name, values]
  }))
}

test('the production launcher may load and frame only the production Playground host', async () => {
  const csp = directives(await worker.fetch(new Request('https://play.techies.tools/'), env))
  for (const directive of ['script-src', 'frame-src']) {
    assert.ok(csp[directive].includes('https://wp.techies.tools'), directive)
    assert.ok(!csp[directive].includes('https://preview-wp.techies.tools'), directive)
  }
})

test('the preview launcher may load and frame only the preview Playground host', async () => {
  const csp = directives(await worker.fetch(new Request('https://preview-play.techies.tools/'), env))
  for (const directive of ['script-src', 'frame-src']) {
    assert.ok(csp[directive].includes('https://preview-wp.techies.tools'), directive)
    assert.ok(!csp[directive].includes('https://wp.techies.tools'), directive)
  }
})

test('both launchers keep the public Playground allowed for the switch back', async () => {
  for (const url of ['https://play.techies.tools/', 'https://preview-play.techies.tools/']) {
    const csp = directives(await worker.fetch(new Request(url), env))
    assert.ok(csp['script-src'].includes('https://playground.wordpress.net'))
    assert.ok(csp['frame-src'].includes('https://playground.wordpress.net'))
    assert.deepEqual(csp['frame-ancestors'], ["'self'"])
  }
})
