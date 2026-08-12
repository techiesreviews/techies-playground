import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isWordPressOrgThemeSlug,
  normalizeWordPressOrgThemeResults,
  searchWordPressOrgThemes,
} from './wordpress-org-themes.js'

test('validates WordPress.org theme slugs', () => {
  assert.equal(isWordPressOrgThemeSlug('twentytwentyfive'), true)
  assert.equal(isWordPressOrgThemeSlug('block-theme'), true)
  assert.equal(isWordPressOrgThemeSlug('../theme'), false)
})

test('normalizes theme screenshots to HTTPS', () => {
  assert.deepEqual(normalizeWordPressOrgThemeResults({ themes: [{
    slug: 'astra', name: 'Astra', version: '4.13.9', author: '<a>Astra Team</a>', rating: 98,
    screenshot_url: '//ts.w.org/wp-content/themes/astra/screenshot.jpg?ver=4.13.9',
  }] }), [{
    slug: 'astra', name: 'Astra', version: '4.13.9', author: 'Astra Team', rating: 98,
    image: 'https://ts.w.org/wp-content/themes/astra/screenshot.jpg?ver=4.13.9',
  }])
})

test('rejects screenshots outside the official theme image host', () => {
  const [theme] = normalizeWordPressOrgThemeResults({ themes: [{
    slug: 'example', name: 'Example', screenshot_url: 'https://tracker.example/theme.jpg',
  }] })
  assert.equal(theme.image, '')
})

test('searches the official theme directory', async () => {
  let requestedUrl = ''
  const results = await searchWordPressOrgThemes('astra', {
    fetchImpl: async (url) => {
      requestedUrl = url
      return { ok: true, json: async () => ({ themes: [{ slug: 'astra', name: 'Astra' }] }) }
    },
  })
  assert.match(requestedUrl, /^https:\/\/api\.wordpress\.org\/themes\/info\/1\.2\//)
  assert.equal(results[0].slug, 'astra')
})
