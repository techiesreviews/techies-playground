import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { enqueue, runOnce, verdict } from './private-runner.mjs'
import { validateDesign, classifyCodexFailure, codexArguments, designReportHTML, pixelScore, generateDesign, runDesignProof } from './design-runner.mjs'

const tree = [{ name: 'core/group', attributes: {}, innerBlocks: [{ name: 'core/heading', attributes: { content: 'Build something that lasts.', level: 1 }, innerBlocks: [] }] }]

test('native tree rejects HTML escape hatches, executable text, arbitrary attributes and oversized trees', () => {
  assert.equal(validateDesign({ blocks: tree, misses: [] }).blocks.length, 1)
  for (const block of [
    { name: 'core/html', attributes: { content: '<div>fake</div>' }, innerBlocks: [] },
    { name: 'core/paragraph', attributes: { content: '<img src=x onerror=alert(1)>' }, innerBlocks: [] },
    { name: 'core/group', attributes: { className: 'custom' }, innerBlocks: [] },
    { name: 'core/group', attributes: { style: { background: { backgroundImage: { url: '//example.net/x.png' } } } }, innerBlocks: [] },
    { name: 'core/group', attributes: { tagName: 'style' }, innerBlocks: [] },
    { name: 'constructor', attributes: {}, innerBlocks: [] },
  ]) assert.throws(() => validateDesign({ blocks: [block], misses: [] }))
  assert.throws(() => validateDesign({ blocks: Array(61).fill(tree[0]), misses: [] }))
  let nested = tree[0]
  for (let i = 0; i < 9; i++) nested = { name: 'core/group', attributes: {}, innerBlocks: [nested] }
  assert.throws(() => validateDesign({ blocks: [nested], misses: [] }))
})

test('limits pause clearly; login, timeouts and other failures never look like quota or success', () => {
  assert.deepEqual(classifyCodexFailure('You have hit your usage limit. Try again later.'), { status: 'paused', reason: 'Waiting for AI allowance. Run a new attempt after your ChatGPT allowance resets. No paid fallback was used.' })
  assert.equal(classifyCodexFailure('401 unauthorized').status, 'blocked')
  assert.equal(classifyCodexFailure('Timed out').status, 'blocked')
  const args = codexArguments('/private/job')
  assert.ok(args.includes('--ignore-user-config'))
  assert.ok(args.includes('forced_login_method="chatgpt"'))
  assert.ok(args.includes('read-only'))
  assert.ok(args.includes('gpt-6.1-sol'))
  assert.ok(!args.some((value) => value.includes('bypass')))
})

test('pixel score has an independent reference and detects a broken capture', () => {
  const white = new Uint8ClampedArray([255, 255, 255, 255, 255, 255, 255, 255])
  assert.equal(pixelScore(white, white).match, 100)
  assert.equal(pixelScore(white, new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255])).match, 50)
  assert.throws(() => pixelScore(white, new Uint8ClampedArray(4)))
})

test('design page escapes data, exposes both tester outcomes and never invents missing scores', () => {
  const html = designReportHTML({ job: { id: 'test' }, ai: { status: 'paused', reason: '<script>unsafe</script>' }, design: { status: 'not-run' }, queryMonitor: { status: 'not-run' }, codeProfiler: { status: 'not-run' } })
  assert.doesNotMatch(html, /<script>/)
  assert.match(html, /&lt;script&gt;/)
  assert.match(html, /Query Monitor/)
  assert.match(html, /Code Profiler/)
  assert.match(html, /No score/)
})

test('a CLI usage-limit fixture saves a paused report and never starts the browser or a fallback', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'design-runner-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const job = await enqueue(root)
  let invocations = 0
  const run = async (args) => {
    invocations++
    if (args[0] === 'login') return { code: 0, output: 'Logged in using ChatGPT' }
    assert.ok(args.includes('forced_login_method="chatgpt"'))
    return { code: 1, output: 'ERROR: You have hit your usage limit. Try again later.' }
  }
  const report = await runOnce(root, (report, directory) => runDesignProof(report, directory, {
    generate: (report, directory) => generateDesign(report, directory, run),
    browser: () => assert.fail('a paused run must not start WordPress'),
  }), designReportHTML)
  assert.equal(invocations, 2)
  assert.equal(report.ai.status, 'paused')
  assert.equal(report.verdict, 'no-go')
  assert.equal(report.design.status, 'not-run')
  const html = await readFile(path.join(root, 'runs', job.id, 'report.html'), 'utf8')
  assert.match(html, /Paused · AI limit/)
  assert.match(html, /No paid fallback was used/)
  assert.equal(JSON.parse(await readFile(path.join(root, 'runs', job.id, 'report.json'))).ai.status, 'paused')
})

test('a design run cannot pass on the tester results alone', () => {
  const report = { kind: 'design-test', boot: { status: 'completed' }, queryMonitor: { status: 'completed', source: 'query-monitor', observations: Array(6).fill({ source: 'query-monitor' }) }, codeProfiler: { status: 'completed', profileId: 'real', attribution: [{}] } }
  assert.equal(verdict(report), 'no-go')
  assert.equal(verdict({ ...report, ai: { status: 'completed' }, design: { status: 'blocked' } }), 'no-go')
})

test('a generation deadline reports the actual time limit and preserves private output on failure', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'design-timeout-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const report = {}
  await assert.rejects(generateDesign(report, root, async (args) => {
    if (args[0] === 'login') return { code: 0, output: 'Logged in using ChatGPT' }
    const { writeFile } = await import('node:fs/promises')
    await writeFile(path.join(root, 'answer.json'), 'malformed output', { mode: 0o644 })
    return { code: null, expired: true, output: '' }
  }), /180 seconds/)
  assert.equal(report.ai.status, 'blocked')
  assert.match(report.ai.reason, /180 seconds/)
  const { stat } = await import('node:fs/promises')
  assert.equal((await stat(path.join(root, 'answer.json'))).mode & 0o777, 0o600)
})

test('API-key login blocks before generation and completed reports retain escaped capture evidence', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'design-login-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await enqueue(root)
  let invocations = 0
  const report = await runOnce(root, (report, directory) => runDesignProof(report, directory, {
    generate: (report, directory) => generateDesign(report, directory, async () => {
      invocations++
      return { code: 0, output: 'Logged in using an API key' }
    }), browser: () => assert.fail('no browser after rejected login'),
  }), designReportHTML)
  assert.equal(invocations, 1)
  assert.equal(report.verdict, 'no-go')
  assert.equal(report.ai.status, 'blocked')
  const html = designReportHTML({ verdict: 'go', design: { misses: ['Semantic mismatch'], captures: [1440, 390].map((width) => ({ width, height: 1000, match: 99.5, changedPixels: 5, reference: 'sample".png', rebuilt: 'saved".png' })) } })
  assert.match(html, /Completed · misses listed/)
  assert.equal((html.match(/99\.50% match/g) || []).length, 2)
  assert.match(html, /src="sample&quot;\.png"/)
  assert.match(html, /src="saved&quot;\.png"/)
  assert.match(html, /summary\{display:list-item/)
})
