import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { formatSyncOutputs } from './sync-playground-release.mjs'

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8')

// Splits a job's `steps:` list into { name: step text }.
function readSteps(source) {
  const steps = {}
  for (const block of source.split(/\n(?= {6}- name: )/).slice(1)) {
    steps[/^ {6}- name: (.+)$/m.exec(block)[1]] = block
  }
  return steps
}

test('the Playground sync runs daily from dev and checks an update fully before it opens a pull request', async () => {
  const source = await read('.github/workflows/sync-playground-release.yml')
  assert.match(source, /\n {2}schedule:\n {4}- cron: '[^']+'\n {2}workflow_dispatch:\n/)
  assert.match(source, /\n {10}ref: dev\n/)
  const steps = readSteps(source)
  assert.match(steps['Synchronize the Playground release'] ?? '', /run: node scripts\/sync-playground-release\.mjs\n/)

  const verify = steps['Verify the generated update'] ?? ''
  for (const check of [
    'npm test',
    'npm run build',
    'npm audit --audit-level=high',
    'node scripts/playground-boot-test.mjs',
    'git diff --check',
  ]) {
    assert.ok(verify.includes(`\n          ${check}\n`), `the update runs ${check}`)
  }
  assert.match(steps['Check Playground security advisories'] ?? '', /run: node scripts\/check-playground-advisories\.mjs\n/)
  // The pull request job needs every check of the prepare job to have passed.
  assert.match(source, /\n {2}pull-request:\n(?: {4}.*\n)*? {4}needs: prepare\n/)
})

test('the Playground sync runs the new packages without a token that can write', async () => {
  const source = await read('.github/workflows/sync-playground-release.yml')
  const [, prepare = '', pullRequest = ''] = source.split(/\n {2}(?:prepare|pull-request):\n/)
  assert.match(source, /\npermissions: \{\}\n/)
  assert.match(prepare, /\n {4}permissions:\n {6}contents: read\n {4}outputs:/)
  assert.match(prepare, /\n {10}persist-credentials: false\n/)
  const steps = readSteps(source)
  for (const name of ['Install locked dependencies', 'Synchronize the Playground release', 'Verify the generated update']) {
    assert.doesNotMatch(steps[name] ?? '', /TOKEN/, `${name} gets no token`)
  }
  // The job that can write runs no package code: no npm and no node.
  assert.match(pullRequest, /\n {6}contents: write\n/)
  assert.doesNotMatch(pullRequest, /^\s+(?:run: )?(?:npm|npx|node) |setup-node/m)
})

test('the Playground sync reads only the outputs the sync script writes', async () => {
  const source = await read('.github/workflows/sync-playground-release.yml')
  const written = formatSyncOutputs({ changed: false, playgroundVersion: '1.0.0' }, { previousVersion: '1.0.0', appVersion: '1.0.0' })
    .split('\n').filter(Boolean).map((line) => line.split('=')[0])
  const used = [...source.matchAll(/steps\.sync\.outputs\.([a-z_]+)/g)].map((match) => match[1])
  assert.ok(used.length >= written.length)
  for (const name of used) assert.ok(written.includes(name), `the sync script writes ${name}`)
  // Every output the pull request job reads is passed on by the prepare job.
  for (const [, name] of source.matchAll(/needs\.prepare\.outputs\.([a-z_]+)/g)) {
    assert.match(source, new RegExp(`\\n {6}${name}: \\$\\{\\{ steps\\.(?:sync|base)\\.outputs\\.`), `prepare passes on ${name}`)
  }
})

test('the Playground sync keeps one update pull request into dev and never goes live', async () => {
  const source = await read('.github/workflows/sync-playground-release.yml')
  const open = readSteps(source)['Open or refresh the update pull request'] ?? ''
  assert.match(open, /branch="automation\/playground-\$\{PLAYGROUND_VERSION\}"/)
  assert.match(open, /gh pr create \\\n\s+--base dev \\/)
  // An older update that is still open is replaced, so only one update PR is ever open.
  assert.match(open, /startswith\(\\"automation\/playground-\\"\)/)
  assert.match(open, /gh pr close "\$number" --delete-branch/)
  // A closed update is not opened again, and a fix someone added to the branch is kept.
  assert.match(open, /--state closed[^\n]*\n\s+if \[ -n "\$closed_pr" \]; then\n[^\n]*\n\s+exit 0\n/)
  assert.match(open, /\[ "\$tip_author" != "\$bot_email" \]; then\n[^\n]*left as it is/)
  // Only the three files the sync edits reach the branch.
  assert.match(open, /changes files other than package\.json, package-lock\.json and src\/App\.jsx/)
  // Merging into dev updates the previews only; main needs Lex's approval each time.
  assert.match(open, /needs Lex's approval every time/)
  assert.doesNotMatch(source, /--base main|wrangler|secrets\./)
})

test('the security checks cover npm audit, Dependabot alerts and Playground advisories', async () => {
  const source = await read('.github/workflows/security-checks.yml')
  assert.match(source, /\n {2}schedule:\n/)
  assert.match(source, /\n {2}push:\n {4}branches: \[dev\]\n/)
  assert.match(source, /\npermissions:\n {2}contents: read\n {2}security-events: read\n/)
  const steps = readSteps(source)
  assert.match(steps['Audit the npm dependencies'] ?? '', /run: npm audit --audit-level=high\n/)
  assert.match(steps['Check Playground security advisories'] ?? '', /run: node scripts\/check-playground-advisories\.mjs\n/)
  const dependabot = steps['Check open Dependabot alerts'] ?? ''
  assert.match(dependabot, /dependabot\/alerts\?state=open&severity=high,critical/)
  // Dependabot alerts describe the default branch, so a push to dev does not read them.
  assert.match(dependabot, /if: github\.event_name != 'push' && /)
  assert.doesNotMatch(source, /wrangler/)
})

test('every Playground package is pinned to the one release the host is built from', async () => {
  const document = JSON.parse(await read('package.json'))
  const pinned = document.dependencies['@wp-playground/blueprints']
  const playground = Object.entries({ ...document.dependencies, ...document.devDependencies })
    .filter(([name]) => /^@(wp-playground|php-wasm)\//.test(name))
  assert.ok(playground.length >= 3)
  for (const [name, version] of playground) assert.equal(version, pinned, `${name} follows the blueprints pin`)
})
