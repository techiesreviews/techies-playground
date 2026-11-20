import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

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
    'node scripts/check-playground-advisories.mjs',
    'node scripts/playground-boot-test.mjs',
    'git diff --check',
  ]) {
    assert.ok(verify.includes(`\n          ${check}\n`), `the update runs ${check}`)
  }
  const names = Object.keys(steps)
  assert.ok(names.indexOf('Verify the generated update') < names.indexOf('Open or refresh the update pull request'))
})

test('the Playground sync keeps one update pull request into dev and never goes live', async () => {
  const source = await read('.github/workflows/sync-playground-release.yml')
  const open = readSteps(source)['Open or refresh the update pull request'] ?? ''
  assert.match(open, /if: steps\.sync\.outputs\.changed == 'true'\n/)
  assert.match(open, /branch="automation\/playground-\$\{PLAYGROUND_VERSION\}"/)
  assert.match(open, /gh pr create \\\n\s+--base dev \\/)
  // An older update that is still open is replaced, so only one update PR is ever open.
  assert.match(open, /startswith\(\\"automation\/playground-\\"\)/)
  assert.match(open, /gh pr close "\$number" --delete-branch/)
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
