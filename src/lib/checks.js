// Checks are free WordPress plugins that measure a setup. A check counts as part of a
// setup when its plugin is in the recipe, from WordPress.org or as an uploaded ZIP (free
// or paid), and its results are read inside WordPress. Code Profiler profiles by sending
// a request to the site itself, which works inside browser Playground.
export const CHECKS = Object.freeze([
  Object.freeze({
    id: 'query-monitor',
    name: 'Query Monitor',
    summary: 'Database queries, PHP errors and memory.',
    slug: 'query-monitor',
    packageIds: Object.freeze(['query-monitor']),
  }),
  Object.freeze({
    id: 'code-profiler',
    name: 'Code Profiler',
    summary: 'Which plugin slows the site, plugin by plugin.',
    slug: 'code-profiler',
    packageIds: Object.freeze(['code-profiler', 'code-profiler-pro']),
  }),
])

function hasCheck(recipe, check) {
  return recipe.repositoryPlugins.includes(check.slug) || check.packageIds.some((id) => recipe.plugins.includes(id))
}

export function checksInSetup(recipe) {
  return CHECKS.filter((check) => hasCheck(recipe, check))
}

export function addCheckToSetup(recipe, checkId) {
  const check = CHECKS.find((candidate) => candidate.id === checkId)
  if (!check) throw new Error(`Unknown check: ${checkId}`)
  if (hasCheck(recipe, check)) return recipe
  return { ...recipe, repositoryPlugins: [...recipe.repositoryPlugins, check.slug] }
}

export function checkResultsPath(check, recipe, currentPath) {
  if (check.id === 'code-profiler') {
    const proOnly = recipe.plugins.includes('code-profiler-pro') && !recipe.plugins.includes('code-profiler') && !recipe.repositoryPlugins.includes('code-profiler')
    return `/wp-admin/admin.php?page=${proOnly ? 'code-profiler-pro' : 'code-profiler'}`
  }
  const base = 'https://site.invalid'
  let url
  try {
    url = new URL(currentPath || '/wp-admin/', base)
  } catch {
    url = new URL('/wp-admin/', base)
  }
  if (url.origin !== base) url = new URL('/wp-admin/', base)
  url.searchParams.set('techies-check', check.id)
  return `${url.pathname}${url.search}`
}

// Query Monitor opens its panel only from its admin-bar link, so this must-use plugin
// clicks that link on a page the launcher's Checks menu opened.
export const CHECKS_PLUGIN_PATH = '/wordpress/wp-content/mu-plugins/techies-checks.php'

export const CHECKS_PLUGIN = `<?php
/**
 * Plugin Name: Techies Playground: open a check
 * Description: Opens the Query Monitor panel on a page the launcher's Checks menu opened (techies-check=query-monitor).
 */

function techies_playground_open_check() {
	if ( ! isset( $_GET['techies-check'] ) || 'query-monitor' !== $_GET['techies-check'] ) {
		return;
	}
	echo "<script>(function () { var tries = 0; function open() { var link = document.querySelector('#wp-admin-bar-query-monitor > a'); if (link) { link.click(); } else if (tries++ < 20) { setTimeout(open, 250); } } if (document.readyState === 'complete') { open(); } else { window.addEventListener('load', open); } }());</script>";
}
add_action( 'admin_print_footer_scripts', 'techies_playground_open_check' );
add_action( 'wp_print_footer_scripts', 'techies_playground_open_check' );
`
