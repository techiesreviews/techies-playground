import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, stat, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { enqueue, claim, runOnce, verdict, reportHTML, measureHomepage } from './private-runner.mjs'
import { MEASURE_MARKER } from '../src/lib/checks.js'

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
    report.queryMonitor = { status: 'running' }
    throw new Error('profiler <unsupported>')
  })
  assert.equal(result.verdict, 'no-go')
  assert.equal(result.blocker, 'profiler <unsupported>')
  const dir = path.join(root, 'runs', job.id)
  assert.equal(JSON.parse(await readFile(path.join(dir, 'report.json'))).boot.status, 'completed')
  assert.equal(JSON.parse(await readFile(path.join(dir, 'report.json'))).queryMonitor.status, 'blocked')
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

test('matches the real Code Profiler 1.9.6 artifact name from run e7783448', async () => {
  const { matchesProfilerArtifact } = await import('./private-runner.mjs')
  const filename = '1795423599.1100.2026-11-23_423597.slugs.profile'
  const stem = path.basename(filename, '.slugs.profile')
  assert.equal(matchesProfilerArtifact('1795423599.1100', stem), true)
  assert.equal(matchesProfilerArtifact('1795423599.9999', stem), false)
  assert.equal(matchesProfilerArtifact('1795423599.11001', stem), false)
  assert.equal(matchesProfilerArtifact(null, stem), false)
  assert.equal(matchesProfilerArtifact('1795423599.1100', '1795423599.1100'), false)
  assert.equal(matchesProfilerArtifact('1795423599', stem), false)
  assert.equal(matchesProfilerArtifact('1795423599.1100', '1795423599.1100.'), false)
})

test('the saved homepage is measured cold then five times warm before screenshot rendering', async () => {
  const events = []
  const report = {}
  await measureHomepage(report, {
    prepare: async () => {
      events.push('save-native-homepage')
      return async () => events.push('render-homepage-and-capture')
    },
    request: async () => {
      events.push('measure-homepage')
      return { status: 200, text: `<!-- ${MEASURE_MARKER}${Buffer.from(JSON.stringify({ source: 'query-monitor', time: 0.1 })).toString('base64')} -->` }
    },
  })
  assert.deepEqual(events, ['save-native-homepage', ...Array(6).fill('measure-homepage'), 'render-homepage-and-capture'])
  assert.deepEqual(report.queryMonitor.observations.map((o) => o.phase), ['cold', ...Array(5).fill('warm')])
  assert.equal(report.queryMonitor.status, 'completed')
})

test('a failed cold measurement never starts screenshots or fabricates completed observations', async () => {
  let captures = 0
  const report = {}
  await assert.rejects(measureHomepage(report, {
    prepare: async () => async () => { captures++ },
    request: async () => ({ status: 503, text: 'unavailable' }),
  }), /HTTP 503/)
  assert.equal(captures, 0)
  assert.equal(report.queryMonitor.status, 'running')
  assert.equal(report.queryMonitor.observations.length, 0)
})
