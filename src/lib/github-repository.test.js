import assert from 'node:assert/strict'
import test from 'node:test'
import {
  fetchGitHubRepositoryStars,
  normalizeGitHubRepositoryStars,
} from './github-repository.js'

test('normalizes a public GitHub repository star count', () => {
  assert.equal(normalizeGitHubRepositoryStars({ stargazers_count: 42 }), 42)
  assert.throws(() => normalizeGitHubRepositoryStars({ stargazers_count: -1 }), /invalid star count/)
  assert.throws(() => normalizeGitHubRepositoryStars({}), /invalid star count/)
})

test('fetches stars for the Techies Playground repository', async () => {
  let requestedUrl = ''
  const stars = await fetchGitHubRepositoryStars({
    fetchImpl: async (url) => {
      requestedUrl = url
      return { ok: true, json: async () => ({ stargazers_count: 7 }) }
    },
  })

  assert.equal(requestedUrl, 'https://api.github.com/repos/techiesreviews/techies-playground')
  assert.equal(stars, 7)
})
