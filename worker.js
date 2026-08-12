const SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy': [
    "default-src 'self'",
    "base-uri 'self'",
    "connect-src 'self' https:",
    "font-src 'self' data:",
    "form-action 'self'",
    "frame-ancestors 'self'",
    "frame-src https://playground.wordpress.net",
    "img-src 'self' data: blob: https://ps.w.org https://ts.w.org",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self' blob:",
  ].join('; '),
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
})

export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request)
    const secured = new Response(response.body, response)
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      secured.headers.set(name, value)
    }
    return secured
  },
}
