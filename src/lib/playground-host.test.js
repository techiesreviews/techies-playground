import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PLAYGROUND_CLIENT_URL,
  PLAYGROUND_ORIGIN,
  PLAYGROUND_READY_TIMEOUT_MS,
  PLAYGROUND_REMOTE_URL,
  loadPlaygroundClient,
  playgroundOrigin,
  startPlaygroundWithin,
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

const loaded = { startPlaygroundWeb: 'client module' }
const load = async () => loaded

test('the start deadline ends once WordPress is running, so Blueprint installs may take longer', async () => {
  const client = await startPlaygroundWithin({
    load,
    start: (module, markRunning) => new Promise((resolve) => {
      assert.equal(module, loaded)
      setTimeout(markRunning, 5)
      setTimeout(() => resolve('client'), 40)
    }),
    milliseconds: 20,
    message: 'too slow',
  })
  assert.equal(client, 'client')
})

test('the start deadline fails a Playground that never starts running', async () => {
  await assert.rejects(startPlaygroundWithin({ load, start: () => new Promise(() => {}), milliseconds: 10, message: 'did not start' }), { name: 'TimeoutError', message: 'did not start' })
})

test('the start deadline also covers loading the client', async () => {
  await assert.rejects(startPlaygroundWithin({ load: () => new Promise(() => {}), start: () => 'client', milliseconds: 10, message: 'did not start' }), { name: 'TimeoutError' })
})

test('a start that fails before the deadline reports its own error', async () => {
  await assert.rejects(startPlaygroundWithin({ load, start: () => Promise.reject(new Error('boot failed')), milliseconds: 50, message: 'did not start' }), /boot failed/)
})

test('a launch closed or replaced while the client loads never starts Playground', async () => {
  let current = true
  let started = false
  let finishLoading
  const pending = startPlaygroundWithin({
    load: () => new Promise((resolve) => { finishLoading = () => resolve(loaded) }),
    start: () => { started = true; return 'client' },
    isCurrent: () => current,
    milliseconds: 1000,
    message: 'did not start',
  })
  current = false
  finishLoading()
  await assert.rejects(pending, { name: 'AbortError' })
  assert.equal(started, false)
})
