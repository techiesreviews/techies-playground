import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PLAYGROUND_ORIGIN,
  PLAYGROUND_READY_TIMEOUT_MS,
  PLAYGROUND_REMOTE_URL,
  playgroundOrigin,
  withTimeout,
} from './playground-host.js'

test('defaults to the self-hosted Playground origin', () => {
  assert.equal(PLAYGROUND_ORIGIN, 'https://wp.techies.tools')
  assert.equal(PLAYGROUND_REMOTE_URL, 'https://wp.techies.tools/remote.html')
})

test('a build setting can point the launcher at another Playground host', () => {
  assert.equal(playgroundOrigin('https://preview-wp.techies.tools'), 'https://preview-wp.techies.tools')
  assert.equal(playgroundOrigin('https://playground.wordpress.net/'), 'https://playground.wordpress.net')
  assert.equal(playgroundOrigin(''), 'https://wp.techies.tools')
  assert.equal(playgroundOrigin(undefined), 'https://wp.techies.tools')
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
