// Where the launcher loads WordPress Playground's runtime from. Our own copy runs on
// wp.techies.tools (playground-host/). To switch back to the public service, change
// this line to 'https://playground.wordpress.net' (worker.js already allows it).
const DEFAULT_PLAYGROUND_ORIGIN = 'https://wp.techies.tools'

// Preview builds set VITE_PLAYGROUND_ORIGIN to their own Playground host; local
// development may use a Playground host on 127.0.0.1 or localhost.
export function playgroundOrigin(value) {
  if (!value) return DEFAULT_PLAYGROUND_ORIGIN
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error(`Invalid Playground host: ${value}`)
  }
  const local = url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)
  if ((url.protocol !== 'https:' && !local) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`Invalid Playground host: ${value}`)
  }
  return url.origin
}

export const PLAYGROUND_ORIGIN = playgroundOrigin(import.meta.env?.VITE_PLAYGROUND_ORIGIN)
export const PLAYGROUND_REMOTE_URL = `${PLAYGROUND_ORIGIN}/remote.html`
// startPlaygroundWeb only accepts a remote.html from playground.wordpress.net, the page's
// own origin or the origin the client script came from, so the launcher loads the
// client from the same Playground host (the documented way to self-host).
export const PLAYGROUND_CLIENT_URL = `${PLAYGROUND_ORIGIN}/client/index.js`

export async function loadPlaygroundClient(importer = (url) => import(/* @vite-ignore */ url)) {
  try {
    return await importer(PLAYGROUND_CLIENT_URL)
  } catch {
    throw new Error(`WordPress Playground could not be loaded from ${new URL(PLAYGROUND_ORIGIN).host}. Check your connection, then launch again.`)
  }
}

// A first boot downloads about 40 MB (PHP and WordPress); two minutes covers slow links.
export const PLAYGROUND_READY_TIMEOUT_MS = 120_000

// `start(markRunning)` starts Playground and calls markRunning once WordPress runs
// (startPlaygroundWeb's onClientConnected). Only that part has a deadline: Blueprint
// steps that follow, such as WordPress.org plugin installs, may take longer.
export async function startPlaygroundWithin(start, milliseconds, message) {
  let markRunning
  const running = new Promise((resolve) => { markRunning = resolve })
  const started = start(() => markRunning())
  started.catch(() => {})
  await withTimeout(Promise.race([running, started]), milliseconds, message)
  return started
}

export function withTimeout(promise, milliseconds, message) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(message)
      error.name = 'TimeoutError'
      reject(error)
    }, milliseconds)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}
