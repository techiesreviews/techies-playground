import assert from 'node:assert/strict'
import test from 'node:test'

import { DEFAULT_RECIPE } from '../src/lib/recipe.js'
import {
  BOOT_RESULT_DIRECTORY,
  BOOT_TITLE,
  buildBootTestBlueprint,
  buildCliArguments,
  checkBootResult,
} from './playground-boot-check.mjs'

test('boots the launcher’s own setup with WP-CLI, then reports from inside WordPress', () => {
  const blueprint = buildBootTestBlueprint()
  assert.deepEqual(blueprint.extraLibraries, ['wp-cli'])
  assert.equal(blueprint.preferredVersions.php, DEFAULT_RECIPE.php)
  // The launcher's own steps (such as its Freemius mu-plugin) run first.
  assert.ok(blueprint.steps.some((step) => step.step === 'writeFile' && step.path.includes('mu-plugins/techies-freemius.php')))

  const [wpCli, report] = blueprint.steps.slice(-2)
  assert.deepEqual(wpCli, { step: 'wp-cli', command: `wp option update blogname "${BOOT_TITLE}"` })
  assert.equal(report.step, 'runPHP')
  assert.match(report.code, /require_once '\/wordpress\/wp-load\.php'/)
  assert.ok(report.code.includes(`${BOOT_RESULT_DIRECTORY}/result.json`))
})

test('runs the CLI of the pinned release with the setup’s PHP and WordPress versions', () => {
  assert.deepEqual(buildCliArguments({ version: '3.1.65', php: '8.3', wordpress: 'latest', blueprintFile: '/tmp/b/blueprint.json', resultDirectory: '/tmp/b/result' }), [
    '--yes',
    '@wp-playground/cli@3.1.65',
    'run-blueprint',
    '--php=8.3',
    '--wp=latest',
    '--blueprint=/tmp/b/blueprint.json',
    `--mount=/tmp/b/result:${BOOT_RESULT_DIRECTORY}`,
  ])
})

test('passes only a WordPress that runs the asked PHP and took the WP-CLI change', () => {
  const good = { wordpress: '7.1', php: '8.3.30', blogname: BOOT_TITLE, muPlugins: ['techies-freemius.php'] }
  assert.deepEqual(checkBootResult(good, { php: '8.3' }), [])
  assert.deepEqual(checkBootResult({ ...good, php: '8.2.1', blogname: 'My WordPress Website', wordpress: '' }, { php: '8.3' }), [
    'WordPress reported no version.',
    'PHP 8.2.1 ran instead of 8.3.',
    'WP-CLI did not change the site title (found "My WordPress Website").',
  ])
  assert.deepEqual(checkBootResult({ ...good, muPlugins: [] }, { php: '8.3' }), ['The launcher’s mu-plugin is missing.'])
  assert.deepEqual(checkBootResult(null, { php: '8.3' }), ['WordPress wrote no boot result.'])
})
