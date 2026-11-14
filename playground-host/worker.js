// Serves our copy of WordPress Playground. Cloudflare answers every request that matches
// a static asset (with the `_headers` rules) before this Worker runs; the Worker only
// sees the rest. Its one job is to join files that were split to stay under the 25 MiB
// per-file limit (scripts/prepare-playground-host.mjs writes /split-files.json).
const SPLIT_MANIFEST = '/split-files.json'
const CONTENT_TYPES = { zip: 'application/zip', wasm: 'application/wasm' }

let manifestPromise = null

export function resetSplitManifest() {
  manifestPromise = null
}

function readSplitManifest(env, url) {
  manifestPromise ??= env.ASSETS.fetch(new URL(SPLIT_MANIFEST, url)).then(async (response) => {
    if (!response.ok) throw new Error(`Split-file list unavailable (${response.status}).`)
    return response.json()
  }).catch((error) => {
    manifestPromise = null
    throw error
  })
  return manifestPromise
}

function plain(status, message, headers = {}) {
  return new Response(message, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  })
}

async function pumpParts(env, url, parts, writable) {
  try {
    for (const part of parts) {
      const response = await env.ASSETS.fetch(new URL(part, url))
      if (!response.ok || !response.body) throw new Error(`Missing part ${part} (${response.status}).`)
      await response.body.pipeTo(writable, { preventClose: true })
    }
    await writable.close()
  } catch (error) {
    await writable.abort(error).catch(() => {})
  }
}

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return plain(405, 'Method not allowed', { Allow: 'GET, HEAD' })
    }
    const url = new URL(request.url)
    let manifest
    try {
      manifest = await readSplitManifest(env, url)
    } catch {
      return plain(503, 'Temporarily unavailable')
    }
    const entry = Object.hasOwn(manifest, url.pathname) ? manifest[url.pathname] : null
    if (!entry) return plain(404, 'Not found')

    const extension = url.pathname.split('.').pop()
    const headers = {
      'Content-Type': CONTENT_TYPES[extension] || 'application/octet-stream',
      'Content-Length': String(entry.size),
      'Cache-Control': url.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    }
    if (request.method === 'HEAD') return new Response(null, { headers })

    // FixedLengthStream (Workers only) keeps Content-Length instead of chunked encoding.
    const { readable, writable } = typeof FixedLengthStream === 'function'
      ? new FixedLengthStream(entry.size)
      : new TransformStream()
    ctx.waitUntil(pumpParts(env, url, entry.parts, writable))
    return new Response(readable, { headers })
  },
}
