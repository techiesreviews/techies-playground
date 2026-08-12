const WORDPRESS_VERSION_API_URL = 'https://api.wordpress.org/core/version-check/1.7/'
const STABLE_RELEASE = /^\d+\.\d+\.\d+$/
const MINIMUM_BRANCH = [6, 3]

export const WORDPRESS_VERSION_FALLBACK_OPTIONS = Object.freeze([
  { value: 'latest', label: 'Latest stable — resolved at launch' },
  { value: '7.0', label: 'WordPress 7.0' },
  { value: '6.9', label: 'WordPress 6.9' },
  { value: '6.8', label: 'WordPress 6.8' },
  { value: '6.7', label: 'WordPress 6.7' },
  { value: '6.6', label: 'WordPress 6.6' },
  { value: '6.5', label: 'WordPress 6.5' },
  { value: '6.4', label: 'WordPress 6.4' },
  { value: '6.3', label: 'WordPress 6.3' },
])

function compareVersionsDescending(left, right) {
  const leftParts = left.split('.').map(Number)
  const rightParts = right.split('.').map(Number)
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (rightParts[index] || 0) - (leftParts[index] || 0)
    if (difference) return difference
  }
  return 0
}

function isIncludedBranch(version) {
  const [major, minor] = version.split('.').map(Number)
  return major > MINIMUM_BRANCH[0] || (major === MINIMUM_BRANCH[0] && minor >= MINIMUM_BRANCH[1])
}

export function createWordPressVersionOptions(payload) {
  if (!payload || !Array.isArray(payload.offers)) throw new Error('WordPress returned an invalid version list.')

  const releases = [...new Set(payload.offers
    .filter((offer) => !offer.locale || offer.locale === 'en_US')
    .map((offer) => offer.current || offer.version)
    .filter((version) => typeof version === 'string' && STABLE_RELEASE.test(version) && isIncludedBranch(version)))]
    .sort(compareVersionsDescending)

  if (!releases.length) throw new Error('WordPress returned no supported stable releases.')

  const latest = payload.offers.find((offer) => (
    offer.response === 'upgrade'
    && (offer.locale === undefined || offer.locale === 'en_US')
    && releases.includes(offer.current || offer.version)
  ))
  const latestVersion = latest ? latest.current || latest.version : releases[0]

  return [
    { value: 'latest', label: `Latest stable — ${latestVersion}` },
    ...releases.map((version) => ({ value: version, label: `WordPress ${version} (pinned)` })),
  ]
}

export function preserveSelectedWordPressVersion(options, selectedVersion) {
  if (!selectedVersion || ['latest', 'beta', 'nightly'].includes(selectedVersion)) return options
  if (options.some(({ value }) => value === selectedVersion)) return options
  return [
    ...options,
    { value: selectedVersion, label: `WordPress ${selectedVersion} (saved recipe)` },
  ]
}

export async function fetchWordPressVersionOptions({ signal, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(WORDPRESS_VERSION_API_URL, {
    signal,
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`WordPress version check failed with status ${response.status}.`)
  return createWordPressVersionOptions(await response.json())
}
