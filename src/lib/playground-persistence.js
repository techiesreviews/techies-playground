export function shouldWarnBeforeUnload({ playgroundOpen, running, storage }) {
  return Boolean(playgroundOpen && running && storage === 'temporary')
}

export function migrateStorageDefault(recipe, migrationComplete) {
  return !migrationComplete && recipe.storage === 'temporary'
    ? { ...recipe, storage: 'browser' }
    : recipe
}

export function persistedSiteId(recipe) {
  return `${recipe.name}-${recipe.wordpress}-${recipe.php}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 96) || 'playground'
}

export function spinupPersistenceLabel(record, persistedSiteIds) {
  if (record.recipe.storage !== 'browser') {
    return 'Setup only — site changes were temporary'
  }

  return persistedSiteIds.has(persistedSiteId(record.recipe))
    ? 'Saved environment — launch to resume in this browser'
    : 'Setup only — saved site is unavailable in this browser'
}

const LEGACY_PERSISTED_SITES_KEY = 'private-playground-launcher:persisted-sites'

// Saved sites live in the Playground host's own browser storage (OPFS), so a site saved
// on one host cannot resume on another. The public host keeps the original key.
export function persistedSitesKey(playgroundOrigin) {
  return playgroundOrigin === 'https://playground.wordpress.net'
    ? LEGACY_PERSISTED_SITES_KEY
    : `${LEGACY_PERSISTED_SITES_KEY}@${playgroundOrigin}`
}
