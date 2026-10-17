import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

const originalSha = 'a'.repeat(40)
const newerSha = 'b'.repeat(40)
const root = resolve(import.meta.dirname, '../..')

function waitOnMockCi(mode, flags) {
  const directory = mkdtempSync(join(tmpdir(), 'techies-kit-wait-'))
  try {
    writeFileSync(join(directory, 'gh'), `#!${process.execPath}
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const args = process.argv.slice(2)
const directory = process.env.MOCK_CI_DIRECTORY
const original = '${originalSha}', newer = '${newerSha}'
appendFileSync(join(directory, 'calls.jsonl'), JSON.stringify(args) + '\\n')
let result
if (args[0] === 'api' && args[1].endsWith('/commits/main')) {
  const state = join(directory, 'head-reads')
  const count = existsSync(state) ? Number(readFileSync(state, 'utf8')) : 0
  writeFileSync(state, String(count + 1))
  console.log(process.env.MOCK_CI_MODE === 'branch' && count === 0 ? original : newer)
  process.exit(0)
} else if (args[0] === 'workflow' && args[1] === 'list') {
  result = [{ id: 1, name: 'Deploy', state: 'active' }]
} else if (args[0] === 'run' && args[1] === 'list' && args.includes('headBranch')) {
  result = [{ headBranch: 'main' }]
} else if (args[0] === 'run' && args[1] === 'list' && args.includes('--workflow')) {
  const sha = args[args.indexOf('--commit') + 1]
  if (![original, newer].includes(sha)) throw new Error('Unexpected SHA: ' + sha)
  result = [{ workflowName: 'Deploy', status: 'completed', conclusion: sha === original ? 'cancelled' : 'success', headSha: sha,
    createdAt: '2026-10-17T00:00:00Z', url: 'https://example.invalid/runs/' + (sha === original ? 1 : 2), databaseId: sha === original ? 1 : 2 }]
} else if (args[0] === 'run' && args[1] === 'view' && args[2] === '1') {
  if (args.includes('--log-failed')) {
    console.log('Original commit deployment was cancelled.')
    process.exit(0)
  }
  result = { jobs: [] }
} else {
  throw new Error('Unexpected mock gh call: ' + JSON.stringify(args))
}
console.log(JSON.stringify(result))
`, { mode: 0o755 })
    // The executable fixture handles every gh call; no GitHub connection or credentials are used.
    const { GH_TOKEN, GITHUB_TOKEN, ...environment } = process.env
    const result = spawnSync(join(root, 'scripts/agents/kit'), ['wait', 'ci', ...flags, '--timeout', '5s'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 15_000,
      env: {
        ...environment,
        PATH: `${directory}:${process.env.PATH}`,
        MOCK_CI_DIRECTORY: directory,
        MOCK_CI_MODE: mode,
        KIT_WAIT_POLL_MS: '1',
        KIT_WAIT_STATUS_MS: '1000',
      },
    })
    assert.ifError(result.error)
    const calls = readFileSync(join(directory, 'calls.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line))
    return { ...result, calls }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

test('explicit SHA CI wait fails for its cancelled deployment instead of accepting a newer green commit', () => {
  const result = waitOnMockCi('pinned', ['--sha', originalSha])
  assert.equal(result.status, 1, result.stdout + result.stderr)
  assert.match(result.stdout, /Deploy: cancelled aaaaaaa/)
  assert.match(result.stdout, /Original commit deployment was cancelled\./)
  assert.match(result.stdout, new RegExp(`RESULT: fail ci ${originalSha} aaaaaaa failed: Deploy`))
  assert.doesNotMatch(result.stdout, /superseded|green/)
  assert.ok(!result.calls.some(args => args.includes(newerSha)), 'must not query CI for the newer commit')
})

test('branch CI wait may follow a superseding head after its original deployment is cancelled', () => {
  const result = waitOnMockCi('branch', ['--branch', 'main'])
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.match(result.stdout, /superseded by bbbbbbb/)
  assert.match(result.stdout, /Deploy: success bbbbbbb/)
  assert.match(result.stdout, /RESULT: ok ci main bbbbbbb green/)
  assert.ok(result.calls.some(args => args.includes(originalSha)))
  assert.ok(result.calls.some(args => args.includes(newerSha)))
})
