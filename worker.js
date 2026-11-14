// The Playground host each launcher embeds (playground-host/): preview-play.techies.tools
// uses the preview host, every other hostname the production one. The public Playground
// stays allowed for the one-line switch back in src/lib/playground-host.js.
const PUBLIC_PLAYGROUND = 'https://playground.wordpress.net'

function playgroundHostFor(hostname) {
  return hostname === 'preview-play.techies.tools' ? 'https://preview-wp.techies.tools' : 'https://wp.techies.tools'
}

function securityHeaders(playgroundHost) {
  return {
    'Content-Security-Policy': [
      "default-src 'self'",
      "base-uri 'self'",
      "connect-src 'self' https:",
      "font-src 'self' data:",
      "form-action 'self'",
      "frame-ancestors 'self'",
      `frame-src ${playgroundHost} ${PUBLIC_PLAYGROUND}`,
      "img-src 'self' data: blob: https://ps.w.org https://ts.w.org",
      "object-src 'none'",
      // The Playground client script comes from the same host as remote.html.
      `script-src 'self' ${playgroundHost} ${PUBLIC_PLAYGROUND}`,
      "style-src 'self' 'unsafe-inline'",
      "worker-src 'self' blob:",
    ].join('; '),
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
  }
}

export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request)
    const secured = new Response(response.body, response)
    for (const [name, value] of Object.entries(securityHeaders(playgroundHostFor(new URL(request.url).hostname)))) {
      secured.headers.set(name, value)
    }
    return secured
  },
}
