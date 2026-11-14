// A CORS proxy for Playground on its own origin. Playground fetches cross-origin URLs
// (WordPress release ZIPs, outgoing WordPress HTTP requests such as licence activation)
// directly first and retries through `${CORS_PROXY_URL}${url}` when the browser blocks
// them. The public proxy only answers playground.wordpress.net, so our build sets
// CORS_PROXY_URL=/cors-proxy.php? and this Worker answers it. The path must end in .php:
// Playground's service worker caches same-origin GETs while ignoring the query string, so
// every /cors-proxy/?<url> would share one cache entry. It skips a .php path, except
// when the URL contains "wordpress-static.zip"; such requests are refused below, so
// no proxied answer is ever stored.
// The rules follow upstream's packages/playground/php-cors-proxy: no cookies,
// Authorization only on opt-in, redirects relayed through the proxy,
// X-Playground-Cors-Proxy on every answer.
export const CORS_PROXY_PATH = '/cors-proxy.php'
const SERVICE_WORKER_CACHED_NAME = 'wordpress-static.zip'

const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'POST'])
const MAX_RESPONSE_SIZE = 100 * 1024 * 1024
const OWN_HOSTS = new Set(['wp.techies.tools', 'preview-wp.techies.tools'])

const DROPPED_REQUEST_HEADERS = new Set([
  'cookie',
  'host',
  'origin',
  'referer',
  'x-cors-proxy-allowed-request-headers',
  'x-cors-proxy-content-type',
  'x-cors-proxy-range',
])
const OPT_IN_REQUEST_HEADERS = new Set(['authorization'])
const DROPPED_RESPONSE_HEADERS = new Set([
  'set-cookie',
  'authorization',
  'www-authenticate',
  'cache-control',
  'access-control-allow-origin',
  'access-control-allow-credentials',
  'access-control-allow-methods',
  'access-control-allow-headers',
  'access-control-expose-headers',
  'strict-transport-security',
])

export function isCorsProxyRequest(url) {
  return url.pathname === CORS_PROXY_PATH
}

function answer(status, message, extra = {}) {
  return new Response(message, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Playground-Cors-Proxy': 'true',
      ...extra,
    },
  })
}

function isPrivateHost(host) {
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true
  if (host.includes(':')) {
    // IPv6 literal: loopback, unspecified, unique local, link local, IPv4-mapped.
    return host === '::1' || host === '::' || /^f[cd]/.test(host) || /^fe[89ab]/.test(host) || host.startsWith('::ffff:')
  }
  const octets = host.split('.')
  if (octets.length !== 4 || !octets.every((part) => /^\d{1,3}$/.test(part))) return false
  const [a, b] = octets.map(Number)
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224
}

function bareHostname(url) {
  return url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase()
}

function targetFrom(requestUrl) {
  const raw = requestUrl.search.slice(1)
  if (!raw) throw new Error('No URL provided.')
  let target
  try {
    target = new URL(raw)
  } catch {
    throw new Error('Invalid URL.')
  }
  return checkedTarget(target, requestUrl)
}

function checkedTarget(target, requestUrl) {
  if (target.protocol !== 'https:' && target.protocol !== 'http:') throw new Error('Only HTTP and HTTPS URLs can be proxied.')
  if (target.username || target.password) throw new Error('URLs with credentials cannot be proxied.')
  const host = bareHostname(target)
  if (isPrivateHost(host)) throw new Error('Private addresses cannot be proxied.')
  if (OWN_HOSTS.has(host) || host === bareHostname(requestUrl)) throw new Error('The Playground host cannot proxy itself.')
  return target
}

function isSameOriginRequest(request, requestUrl) {
  // Browsers always send Sec-Fetch-Site and a page on another site cannot forge it.
  if (request.headers.get('Sec-Fetch-Site') !== 'same-origin') return false
  const origin = request.headers.get('Origin')
  return !origin || origin === requestUrl.origin
}

function forwardedHeaders(request) {
  const optedIn = new Set((request.headers.get('X-Cors-Proxy-Allowed-Request-Headers') || '')
    .split(',').map((name) => name.trim().toLowerCase()).filter(Boolean))
  const headers = new Headers()
  for (const [name, value] of request.headers) {
    const lower = name.toLowerCase()
    if (DROPPED_REQUEST_HEADERS.has(lower) || lower.startsWith('sec-') || lower.startsWith('cf-') || lower.startsWith('x-forwarded-')) continue
    if (OPT_IN_REQUEST_HEADERS.has(lower) && !optedIn.has(lower)) continue
    headers.set(name, value)
  }
  const contentType = request.headers.get('X-Cors-Proxy-Content-Type')
  if (contentType && !/[\r\n]/.test(contentType)) headers.set('Content-Type', contentType)
  const range = request.headers.get('X-Cors-Proxy-Range')?.trim()
  if (range && !/[\r\n]/.test(range)) headers.set('Range', range)
  return headers
}

// Counts the bytes of a body without a declared size and fails it past the cap.
function capped(body) {
  let total = 0
  return body.pipeThrough(new TransformStream({
    transform(chunk, controller) {
      total += chunk.byteLength
      if (total > MAX_RESPONSE_SIZE) controller.error(new Error('Response too large'))
      else controller.enqueue(chunk)
    },
  }))
}

const MAX_FOLLOWED_REDIRECTS = 5
const isRedirect = (response) => response.status >= 300 && response.status < 400 && response.headers.has('Location')

class ProxyRefusal extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

// The browser re-sends Authorization with every request to this proxy, so relaying a
// redirect to another origin would hand the credential to that origin. Fetch drops it
// on a cross-origin redirect; the Worker does the same by following such redirects
// itself, without Authorization, and checking every hop like any other target.
async function followWithoutAuthorization(fetchImpl, response, from, headers, requestUrl, method) {
  const plainHeaders = new Headers(headers)
  plainHeaders.delete('Authorization')
  let current = response
  let url = from
  for (let hop = 0; isRedirect(current); hop += 1) {
    if (hop === MAX_FOLLOWED_REDIRECTS) throw new ProxyRefusal(502, 'Bad gateway: too many redirects.')
    try {
      url = checkedTarget(new URL(current.headers.get('Location'), url), requestUrl)
    } catch (error) {
      throw new ProxyRefusal(400, `Bad request: ${error.message}`)
    }
    current = await fetchImpl(url.href, { method, headers: plainHeaders, redirect: 'manual' })
  }
  return current
}

export async function handleCorsProxy(request, { fetch: fetchImpl = fetch, limiter } = {}) {
  const requestUrl = new URL(request.url)
  if (!isSameOriginRequest(request, requestUrl)) return answer(403, 'Forbidden')
  if (request.method === 'OPTIONS') return answer(204, null, { Allow: 'GET, HEAD, POST, OPTIONS' })
  if (!ALLOWED_METHODS.has(request.method)) return answer(405, 'Method not allowed', { Allow: 'GET, HEAD, POST, OPTIONS' })
  // Playground's service worker caches any URL containing this name, ignoring the query
  // string, so a successful answer would be served for every later such proxy request.
  // Playground loads its own wordpress-static.zip from the host, never through the proxy.
  if (requestUrl.href.includes(SERVICE_WORKER_CACHED_NAME)) {
    return answer(400, `Bad request: URLs containing ${SERVICE_WORKER_CACHED_NAME} are not proxied.`)
  }

  // Sec-Fetch-Site keeps other websites out, but any non-browser client can send it,
  // so a per-visitor limit bounds what one such client can do.
  if (limiter && !(await limiter.limit({ key: request.headers.get('CF-Connecting-IP') || 'unknown' })).success) {
    return answer(429, 'Too many requests', { 'Retry-After': '60' })
  }

  let target
  try {
    target = targetFrom(requestUrl)
  } catch (error) {
    return answer(400, `Bad request: ${error.message}`)
  }

  const outgoing = forwardedHeaders(request)
  let upstream
  try {
    upstream = await fetchImpl(target.href, {
      method: request.method,
      headers: outgoing,
      body: request.method === 'POST' ? request.body : undefined,
      redirect: 'manual',
      ...(request.method === 'POST' && request.body ? { duplex: 'half' } : {}),
    })
    if (outgoing.has('Authorization') && isRedirect(upstream)
      && new URL(upstream.headers.get('Location'), target).origin !== target.origin) {
      if (request.method === 'POST') throw new ProxyRefusal(502, 'Bad gateway: an authorized POST was redirected to another origin.')
      upstream = await followWithoutAuthorization(fetchImpl, upstream, target, outgoing, requestUrl, request.method)
    }
  } catch (error) {
    if (error instanceof ProxyRefusal) return answer(error.status, error.message)
    return answer(502, 'Bad gateway: the target could not be reached.')
  }

  const length = Number(upstream.headers.get('Content-Length'))
  if (request.method !== 'HEAD' && length >= MAX_RESPONSE_SIZE) return answer(413, 'Response too large')

  const headers = new Headers()
  for (const [name, value] of upstream.headers) {
    if (!DROPPED_RESPONSE_HEADERS.has(name.toLowerCase())) headers.append(name, value)
  }
  const location = upstream.headers.get('Location')
  if (location) {
    headers.set('Location', `${requestUrl.origin}${CORS_PROXY_PATH}?${new URL(location, target).href}`)
  }
  headers.set('X-Playground-Cors-Proxy', 'true')
  headers.set('Cache-Control', 'no-store')
  const declaredSize = upstream.headers.has('Content-Length')
  const body = request.method === 'HEAD' || !upstream.body ? null : declaredSize ? upstream.body : capped(upstream.body)
  return new Response(body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  })
}
