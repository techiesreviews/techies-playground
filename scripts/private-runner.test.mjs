import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, stat, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { enqueue, claim, runOnce, verdict, reportHTML } from './private-runner.mjs'

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'private-runner-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}

test('two workers cannot claim the same queued job; a claimed job stays in running', async (t) => {
  const root = await fixture(t)
  const job = await enqueue(root)
  assert.equal((await stat(path.join(root, 'queued', `${job.id}.json`))).mode & 0o777, 0o600)
  const claims = await Promise.all([claim(root), claim(root)])
  assert.equal(claims.filter(Boolean).length, 1)
  assert.equal(claims.find(Boolean).id, job.id)
  assert.equal(await claim(root), null)
  assert.deepEqual(await readdir(path.join(root, 'running')), [`${job.id}.json`])
})

test('a failed real attempt saves private JSON and escaped HTML, without retrying the job', async (t) => {
  const root = await fixture(t)
  const job = await enqueue(root)
  const result = await runOnce(root, async (report) => {
    report.boot = { status: 'completed' }
    throw new Error('profiler <unsupported>')
  })
  assert.equal(result.verdict, 'no-go')
  assert.equal(result.blocker, 'profiler <unsupported>')
  const dir = path.join(root, 'runs', job.id)
  assert.equal(JSON.parse(await readFile(path.join(dir, 'report.json'))).boot.status, 'completed')
  assert.match(await readFile(path.join(dir, 'report.html'), 'utf8'), /&lt;unsupported&gt;/)
  assert.equal((await stat(dir)).mode & 0o777, 0o700)
  assert.equal((await stat(path.join(dir, 'report.json'))).mode & 0o777, 0o600)
  assert.equal((await stat(path.join(dir, 'report.html'))).mode & 0o777, 0o600)
  assert.equal(await runOnce(root, () => assert.fail('must not retry')), null)
  assert.deepEqual(await readdir(path.join(root, 'running')), [])
  assert.deepEqual(await readdir(path.join(root, 'finished')), [`${job.id}.json`])
  assert.equal((await stat(path.join(root, 'finished', `${job.id}.json`))).mode & 0o777, 0o600)
})

test('go requires real Query Monitor collectors and a completed attributed profiler artifact', () => {
  const report = { boot: { status: 'completed' }, queryMonitor: { status: 'completed', source: 'query-monitor', observations: Array(6).fill({ source: 'query-monitor' }) }, codeProfiler: { status: 'completed', profileId: 'real-id', attribution: [{ name: 'Theme', seconds: 0.1 }] } }
  assert.equal(verdict(report), 'go')
  assert.equal(verdict({ ...report, blocker: 'Browser cleanup failed.' }), 'no-go')
  assert.equal(verdict({ ...report, queryMonitor: { ...report.queryMonitor, source: 'playground' } }), 'no-go')
  assert.equal(verdict({ ...report, codeProfiler: { status: 'completed', profileId: 'timer-only' } }), 'no-go')
  assert.equal(verdict({ ...report, queryMonitor: { ...report.queryMonitor, observations: [] } }), 'no-go')
})

test('the report is self-contained and does not interpret captured markup', () => {
  const html = reportHTML({ blocker: '<script>evil()</script>' })
  assert.doesNotMatch(html, /<script>/)
  assert.match(html, /&lt;script&gt;/)
})
