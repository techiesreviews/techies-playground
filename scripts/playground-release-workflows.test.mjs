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

  const verify = steps['Verify the generated update in a throwaway container'] ?? ''
  const [, checks = ''] = /bash -ec '([^']+)'/.exec(verify) ?? []
  assert.deepEqual(checks.split('; '), [
    'npm test',
    'npm run build',
    'npm audit --audit-level=high',
    'node scripts/playground-boot-test.mjs',
  ])
  assert.match(steps['Save the update as a patch'] ?? '', /\n {10}git diff --check\n/)
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
  const steps = readSteps(prepare)
  const verifyName = 'Verify the generated update in a throwaway container'
  for (const name of ['Install locked dependencies', 'Synchronize the Playground release', verifyName]) {
    assert.ok(steps[name], `the prepare job has the step "${name}"`)
    assert.doesNotMatch(steps[name], /TOKEN/, `${name} gets no token`)
  }
  // Cache entries are shared with other runs, so the job saves none.
  assert.doesNotMatch(prepare, /\bcache:|actions\/cache/)
  // New package code runs only in the throwaway container, after the patch is saved: it
  // cannot reach the runner's action files (and through them the cache or the artifact),
  // its tokens, .git, the Docker socket or the patch.
  const names = Object.keys(steps)
  assert.ok(names.indexOf('Save the update as a patch') < names.indexOf(verifyName))
  assert.ok(names.indexOf(verifyName) < names.indexOf('Upload the update'))
  for (const [name, step] of Object.entries(steps)) {
    if (name !== verifyName) assert.doesNotMatch(step, /npm (?:test|run build)|playground-boot-test/, `${name} runs no new package code`)
  }
  const verify = steps[verifyName]
  assert.match(verify, /docker run --rm \\\n/)
  assert.match(verify, /--mount type=tmpfs,destination=\/work\/\.git \\\n/)
  assert.match(verify, /\n {12}node:24-bookworm@sha256:[0-9a-f]{64} \\\n/)
  assert.doesNotMatch(verify, /docker\.sock|--privileged|RUNNER_TEMP|ACTIONS_|GITHUB_TOKEN|--env-file/)
  // The job that can write runs no package code: no npm and no node.
  assert.match(pullRequest, /\n {6}contents: write\n/)
  assert.doesNotMatch(pullRequest, /^\s+(?:run: )?(?:npm|npx|node) |setup-node/m)
})

test('the Playground sync reads only the outputs the sync script writes', async () => {
  const source = await read('.github/workflows/sync-playground-release.yml')
  const written = formatSyncOutputs({ changed: false, playgroundVersion: '1.0.0' }, { previousVersion: '1.0.0', appVersion: '1.0.0' })
    .split('\n').filter(Boolean).map((line) => line.split('=')[0])
  const used = new Set([...source.matchAll(/steps\.sync\.outputs\.([a-z_]+)/g)].map((match) => match[1]))
  assert.deepEqual([...used].sort(), [...written].sort())
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
  // The replaced branch is deleted only when the bot made its newest commit.
  assert.match(open, /= "\$bot_email" \]; then\n\s+gh pr close "\$number" --delete-branch /)
  assert.match(open, /else\n\s+gh pr close "\$number" --comment "[^"]*The branch is kept/)
  // A closed update is not opened again.
  assert.match(open, /--state closed[^\n]*\n\s+if \[ -n "\$closed_pr" \]; then\n[^\n]*\n\s+exit 0\n/)
  // A fix someone added to the branch is kept, along with the pull request text, and a
  // failure to read the branch stops the job instead of pushing over it.
  assert.match(open, /if git ls-remote --exit-code --heads origin "refs\/heads\/\$\{branch\}" > \/dev\/null; then\n\s+git fetch --no-tags origin "refs\/heads\/\$\{branch\}"\n\s+tip_author="\$\(git log -1 --format=%ae FETCH_HEAD\)"\n\s+if \[ "\$tip_author" != "\$bot_email" \]; then\n\s+left_alone="yes"\n/)
  assert.match(open, /if \[ "\$status" -ne 2 \]; then\n[^\n]*\n\s+exit 1\n/)
  assert.match(open, /if \[ -z "\$left_alone" \]; then\n\s+git push --force origin "\$branch"\n/)
  assert.match(open, /elif \[ -z "\$left_alone" \]; then\n\s+gh pr edit /)
  assert.doesNotMatch(open, /2>\/dev\/null/)
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
