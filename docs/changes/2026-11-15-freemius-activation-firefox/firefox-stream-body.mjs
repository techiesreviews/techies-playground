// Evidence driver for docs/changes/2026-11-15-freemius-activation-firefox.md, not part of the
// test suite. Needs Playwright (npm i playwright; npx playwright install chromium firefox).
// Usage: node firefox-stream-body.mjs
import { firefox, chromium } from 'playwright'
for (const bt of [firefox, chromium]) {
  const b = await bt.launch(); const p = await b.newPage()
  await p.goto('https://preview-wp.techies.tools/')
  const r = await p.evaluate(async () => {
    const out = {}
    const mk = () => new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{"is_active":true}')); c.close() } })
    try {
      const req = new Request('https://api.freemius.com/x', { method: 'PUT', body: mk(), duplex: 'half', headers: {'content-type':'application/json'} })
      out.bodyIsStream = req.body instanceof ReadableStream
      out.bodyType = String(req.body)
      const c = req.clone()
      out.cloneText = await c.text()
      out.origText = await req.text()
    } catch (e) { out.err = String(e) }
    try {
      await fetch('data:,', { method: 'POST', body: mk(), duplex: 'half' }); out.streamUpload = true
    } catch (e) { out.streamUpload = 'no: ' + e }
    return out
  })
  console.log(bt.name(), JSON.stringify(r))
  await b.close()
}
