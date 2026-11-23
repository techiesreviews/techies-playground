import test from 'node:test'
import assert from 'node:assert/strict'
import { validateDesign, classifyCodexFailure, codexArguments, designReportHTML, pixelScore } from './design-runner.mjs'

const tree = [{ name: 'core/group', attributes: {}, innerBlocks: [{ name: 'core/heading', attributes: { content: 'Build something that lasts.', level: 1 }, innerBlocks: [] }] }]

test('native tree rejects HTML escape hatches, executable text, arbitrary attributes and oversized trees', () => {
  assert.equal(validateDesign({ blocks: tree, misses: [] }).blocks.length, 1)
  for (const block of [
    { name: 'core/html', attributes: { content: '<div>fake</div>' }, innerBlocks: [] },
    { name: 'core/paragraph', attributes: { content: '<img src=x onerror=alert(1)>' }, innerBlocks: [] },
    { name: 'core/group', attributes: { className: 'custom' }, innerBlocks: [] },
  ]) assert.throws(() => validateDesign({ blocks: [block], misses: [] }))
  assert.throws(() => validateDesign({ blocks: Array(61).fill(tree[0]), misses: [] }))
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
