#!/usr/bin/env node
// Boots the pinned WordPress Playground release once, in Node, with the launcher's own
// default setup plus WP-CLI, and checks the answer WordPress writes from inside the site.
// It uses @wp-playground/cli at the same version as the launcher's Playground packages,
// so it runs the PHP builds and Blueprint steps of the release under test.
//
// Run by .github/workflows/sync-playground-release.yml before it opens an update PR.
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_RECIPE, buildPlaygroundBlueprint } from '../src/lib/recipe.js'
import { getPinnedPlaygroundVersion } from './sync-playground-release.mjs'

export const BOOT_TITLE = 'Playground boot test'
export const BOOT_RESULT_DIRECTORY = '/boot-result'
const LAUNCHER_MU_PLUGIN = 'techies-freemius.php'
// A first boot downloads PHP and WordPress; the CLI install alone takes a few minutes.
const BOOT_TIMEOUT_MS = 15 * 60 * 1000

export function buildBootTestBlueprint(recipe = DEFAULT_RECIPE) {
  const blueprint = buildPlaygroundBlueprint({ ...recipe, wpCli: true }, { includeOneTimeSetup: true })
  const report = `<?php
require_once '/wordpress/wp-load.php';
file_put_contents('${BOOT_RESULT_DIRECTORY}/result.json', json_encode([
  'wordpress' => get_bloginfo('version'),
  'php' => PHP_VERSION,
  'blogname' => get_option('blogname'),
  'muPlugins' => array_keys(get_mu_plugins()),
]));
`
  return {
    ...blueprint,
    steps: [
      ...blueprint.steps,
      { step: 'wp-cli', command: `wp option update blogname "${BOOT_TITLE}"` },
      { step: 'runPHP', code: report },
    ],
  }
}

export function buildCliArguments({ version, php, wordpress, blueprintFile, resultDirectory }) {
  return [
    '--yes',
    `@wp-playground/cli@${version}`,
    'run-blueprint',
    `--php=${php}`,
    `--wp=${wordpress}`,
    `--blueprint=${blueprintFile}`,
    `--mount=${resultDirectory}:${BOOT_RESULT_DIRECTORY}`,
  ]
}

export function checkBootResult(result, { php }) {
  if (!result) return ['WordPress wrote no boot result.']
  const problems = []
  if (!/^\d+\.\d+/.test(result.wordpress || '')) problems.push('WordPress reported no version.')
  if (result.php !== php && !String(result.php).startsWith(`${php}.`)) problems.push(`PHP ${result.php} ran instead of ${php}.`)
  if (result.blogname !== BOOT_TITLE) problems.push(`WP-CLI did not change the site title (found "${result.blogname}").`)
  if (!result.muPlugins?.includes(LAUNCHER_MU_PLUGIN)) problems.push('The launcher’s mu-plugin is missing.')
  return problems
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', timeout: BOOT_TIMEOUT_MS })
    child.on('error', reject)
    child.on('exit', (code, signal) => (code === 0 ? resolve() : reject(new Error(`${command} ${args.slice(0, 3).join(' ')} stopped (${signal || `exit ${code}`}).`))))
  })
}

async function readResult(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

async function main() {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const version = getPinnedPlaygroundVersion(JSON.parse(await readFile(path.join(repositoryRoot, 'package.json'), 'utf8')))
  const workDirectory = await mkdtemp(path.join(tmpdir(), 'playground-boot-'))
  try {
    const blueprintFile = path.join(workDirectory, 'blueprint.json')
    const resultDirectory = path.join(workDirectory, 'result')
    await mkdir(resultDirectory)
    await writeFile(blueprintFile, JSON.stringify(buildBootTestBlueprint(), null, 2))
    const { php, wordpress } = DEFAULT_RECIPE
    console.log(`Booting Playground ${version} with PHP ${php} and WordPress ${wordpress}…`)
    await run('npx', buildCliArguments({ version, php, wordpress, blueprintFile, resultDirectory }))

    const result = await readResult(path.join(resultDirectory, 'result.json'))
    const problems = checkBootResult(result, { php })
    if (problems.length) throw new Error(`Playground ${version} boot test failed: ${problems.join(' ')}`)
    console.log(`Playground ${version} booted WordPress ${result.wordpress} on PHP ${result.php}; WP-CLI and the launcher's mu-plugin work.`)
  } finally {
    await rm(workDirectory, { recursive: true, force: true })
  }
}

const invokedFilename = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedFilename === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
