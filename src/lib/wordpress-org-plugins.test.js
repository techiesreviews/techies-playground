import assert from 'node:assert/strict'
import test from 'node:test'
import {
  fetchFeaturedWordPressOrgPlugins,
  isWordPressOrgPluginSlug,
  normalizeWordPressOrgPluginResults,
  searchWordPressOrgPlugins,
} from './wordpress-org-plugins.js'

test('validates WordPress.org plugin slugs', () => {
  assert.equal(isWordPressOrgPluginSlug('woocommerce'), true)
  assert.equal(isWordPressOrgPluginSlug('contact-form-7'), true)
  assert.equal(isWordPressOrgPluginSlug('../plugin'), false)
  assert.equal(isWordPressOrgPluginSlug('Plugin Name'), false)
})

test('normalizes safe plugin search results', () => {
  assert.deepEqual(normalizeWordPressOrgPluginResults({ plugins: [{
    slug: 'woocommerce',
    name: 'WooCommerce',
    version: '11.0.1',
    author: '<a href="https://example.com">Automattic</a>',
    active_installs: 7000000,
    tested: '7.0.4',
    icons: { svg: 'https://ps.w.org/woocommerce/assets/icon.svg' },
  }] }), [{
    slug: 'woocommerce',
    name: 'WooCommerce',
    version: '11.0.1',
    author: 'Automattic',
    activeInstalls: 7000000,
    tested: '7.0.4',
    image: 'https://ps.w.org/woocommerce/assets/icon.svg',
  }])
})

test('decodes entities in plugin names from the directory', () => {
  const [plugin] = normalizeWordPressOrgPluginResults({ plugins: [{
    slug: 'example', name: 'Forms &#8211; Surveys &amp; more',
  }] })
  assert.equal(plugin.name, 'Forms – Surveys & more')
})

test('rejects artwork outside the official plugin image host', () => {
  const [plugin] = normalizeWordPressOrgPluginResults({ plugins: [{
    slug: 'example', name: 'Example', icons: { svg: 'https://tracker.example/icon.svg' },
  }] })
  assert.equal(plugin.image, '')
})

test('searches with a compact official-directory request', async () => {
  let requestedUrl = ''
  const results = await searchWordPressOrgPlugins('woo commerce', {
    fetchImpl: async (url) => {
      requestedUrl = url
      return { ok: true, json: async () => ({ plugins: [{ slug: 'woocommerce', name: 'WooCommerce' }] }) }
    },
  })

  assert.match(requestedUrl, /^https:\/\/api\.wordpress\.org\/plugins\/info\/1\.2\//)
  assert.match(requestedUrl, /request%5Bsearch%5D=woo\+commerce/)
  assert.equal(results[0].slug, 'woocommerce')
})

test('requests the featured WordPress.org plugins with icons', async () => {
  let requestedUrl = ''
  await fetchFeaturedWordPressOrgPlugins({
    fetchImpl: async (url) => {
      requestedUrl = url
      return { ok: true, json: async () => ({ plugins: [] }) }
    },
  })

  assert.match(requestedUrl, /request%5Bbrowse%5D=featured/)
  assert.match(requestedUrl, /request%5Bper_page%5D=8/)
  assert.match(requestedUrl, /request%5Bfields%5D%5Bicons%5D=1/)
  assert.doesNotMatch(requestedUrl, /request%5Bsearch%5D/)
})
