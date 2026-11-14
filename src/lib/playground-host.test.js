import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PLAYGROUND_CLIENT_URL,
  PLAYGROUND_ORIGIN,
  PLAYGROUND_READY_TIMEOUT_MS,
  PLAYGROUND_REMOTE_URL,
  loadPlaygroundClient,
  playgroundOrigin,
  withTimeout,
} from './playground-host.js'

test('defaults to the self-hosted Playground origin', () => {
  assert.equal(PLAYGROUND_ORIGIN, 'https://wp.techies.tools')
  assert.equal(PLAYGROUND_REMOTE_URL, 'https://wp.techies.tools/remote.html')
  // The client checks that remote.html comes from the origin it was loaded from.
  assert.equal(PLAYGROUND_CLIENT_URL, 'https://wp.techies.tools/client/index.js')
})

test('a build setting can point the launcher at another Playground host', () => {
  assert.equal(playgroundOrigin('https://preview-wp.techies.tools'), 'https://preview-wp.techies.tools')
  assert.equal(playgroundOrigin('https://playground.wordpress.net/'), 'https://playground.wordpress.net')
  assert.equal(playgroundOrigin(''), 'https://wp.techies.tools')
  assert.equal(playgroundOrigin(undefined), 'https://wp.techies.tools')
  assert.equal(playgroundOrigin('http://127.0.0.1:8787'), 'http://127.0.0.1:8787')
})

test('rejects Playground hosts that are not plain HTTPS origins', () => {
  for (const value of ['http://wp.techies.tools', 'https://wp.techies.tools/remote.html', 'https://user@wp.techies.tools', 'not a url']) {
    assert.throws(() => playgroundOrigin(value), /Playground host/, value)
  }
})

test('waits two minutes for Playground before giving up', () => {
  assert.equal(PLAYGROUND_READY_TIMEOUT_MS, 120_000)
})

test('withTimeout passes through a value that arrives in time', async () => {
  assert.equal(await withTimeout(Promise.resolve('ready'), 50, 'too slow'), 'ready')
  await assert.rejects(withTimeout(Promise.reject(new Error('broken')), 50, 'too slow'), /broken/)
})

test('withTimeout rejects with the given message when the work never finishes', async () => {
  await assert.rejects(withTimeout(new Promise(() => {}), 10, 'Playground did not start.'), {
    name: 'TimeoutError',
    message: 'Playground did not start.',
  })
})

test('loads the Playground client from the Playground host', async () => {
  const requested = []
  const client = await loadPlaygroundClient(async (url) => { requested.push(url); return { startPlaygroundWeb: () => 'started' } })
  assert.deepEqual(requested, ['https://wp.techies.tools/client/index.js'])
  assert.equal(client.startPlaygroundWeb(), 'started')
})

test('explains a Playground client that cannot be loaded', async () => {
  await assert.rejects(
    loadPlaygroundClient(async () => { throw new TypeError('Failed to fetch dynamically imported module') }),
    { message: 'WordPress Playground could not be loaded from wp.techies.tools. Check your connection, then launch again.' },
  )
})
