const GITHUB_REPOSITORY_API = 'https://api.github.com/repos/techiesreviews/techies-playground'

export function normalizeGitHubRepositoryStars(payload) {
  const stars = payload?.stargazers_count
  if (!Number.isSafeInteger(stars) || stars < 0) throw new Error('GitHub returned an invalid star count.')
  return stars
}

export async function fetchGitHubRepositoryStars({ signal, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(GITHUB_REPOSITORY_API, {
    signal,
    headers: { Accept: 'application/vnd.github+json' },
  })
  if (!response.ok) throw new Error(`GitHub repository request failed with status ${response.status}.`)
  return normalizeGitHubRepositoryStars(await response.json())
}
