import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { buildPreviewPlugin, installPreviewLinks, parsePreviewUrl } from './playground-preview.js'

const scope = 'launcher-test-123'
const site = `https://playground.wordpress.net/scope:${scope}/`
const base = 'https://play.techies.tools/#preview='

function browser() {
  const listeners = {}
  const opened = []
  const win = {
    location: new URL(site + 'wp-admin/edit.php'),
    open: (...args) => { opened.push(args); return 'window' },
    document: { addEventListener: (name, listener) => { listeners[name] = listener } },
  }
  return { win, listeners, opened }
}

function click(listeners, { href = site + 'sample-page/?preview=true#content', target = '', type = 'click', button = 0, ctrlKey = false, metaKey = false, download = false, defaultPrevented = false } = {}) {
  const event = { type, button, ctrlKey, metaKey, defaultPrevented,
    target: { closest: () => ({ href, target, hasAttribute: () => download }) },
    preventDefault() { this.defaultPrevented = true },
  }
  listeners[type](event)
  return event
}

test('preview URL preserves path, query and fragment, and rejects other origins/scopes', () => {
  const url = site + 'sample-page/?preview=true&preview_nonce=abc#content'
  assert.deepEqual(parsePreviewUrl('#preview=' + encodeURIComponent(url)), { url, scope })
  for (const value of ['https://evil.test/' , 'https://playground.wordpress.net.evil.test/scope:launcher-test/', 'https://user@playground.wordpress.net/scope:launcher-test/', 'https://playground.wordpress.net/remote.html', 'javascript:alert(1)']) {
    assert.equal(parsePreviewUrl('#preview=' + encodeURIComponent(value)), null)
  }
  assert.equal(parsePreviewUrl('#preview=%'), null)
})

test('Ctrl/Cmd-click, middle-click and target blank open the scoped page in the launcher wrapper', () => {
  for (const options of [{ ctrlKey: true }, { metaKey: true }, { type: 'auxclick', button: 1 }, { target: '_blank' }]) {
    const { win, listeners, opened } = browser()
    installPreviewLinks(base, scope, win)
    assert.equal(click(listeners, options).defaultPrevented, true)
    assert.equal(opened.length, 1)
    assert.equal(opened[0][0], base + encodeURIComponent(site + 'sample-page/?preview=true#content'))
    assert.deepEqual(opened[0].slice(1), ['_blank', 'noopener'])
  }
})

test('ordinary navigation, downloads, external links, other sites and handled clicks are preserved', () => {
  for (const options of [{}, { ctrlKey: true, download: true }, { ctrlKey: true, href: 'https://wordpress.org/' }, { ctrlKey: true, href: 'https://playground.wordpress.net/scope:launcher-another/' }, { ctrlKey: true, defaultPrevented: true }]) {
    const { win, listeners, opened } = browser()
    installPreviewLinks(base, scope, win)
    click(listeners, options)
    assert.equal(opened.length, 0)
  }
})

test('script-opened previews are wrapped without changing self-navigation or external windows', () => {
  const { win, opened } = browser()
  installPreviewLinks(base, scope, win)
  assert.equal(win.open(site + '?p=2&preview=true', '_blank'), 'window')
  assert.equal(opened[0][0], base + encodeURIComponent(site + '?p=2&preview=true'))
  win.open(site, '_self')
  win.open('https://wordpress.org/', '_blank')
  assert.equal(opened[1][0], site)
  assert.equal(opened[2][0], 'https://wordpress.org/')
})

test('the generated mu-plugin script executes independently of module scope', () => {
  const plugin = buildPreviewPlugin('https://play.techies.tools/?ignored=1#ignored', scope)
  const script = plugin.match(/<script>([\s\S]*)<\/script>/)[1]
  const { win, listeners, opened } = browser()
  vm.runInNewContext(script, { window: win, URL })
  click(listeners, { ctrlKey: true })
  assert.equal(opened[0][0], base + encodeURIComponent(site + 'sample-page/?preview=true#content'))
  assert.match(plugin, /add_action\('admin_head'/)
  assert.match(plugin, /add_action\('wp_head'/)
})
