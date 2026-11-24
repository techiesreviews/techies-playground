import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { enqueue, runOnce, verdict } from './private-runner.mjs'
import { validateDesign, classifyCodexFailure, codexArguments, designReportHTML, finalizeDesignReport, pixelScore, generateDesign, runDesignProof } from './design-runner.mjs'

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
  }), designReportHTML, finalizeDesignReport)
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
  }), designReportHTML, finalizeDesignReport)
  assert.equal(invocations, 1)
  assert.equal(report.verdict, 'no-go')
  assert.equal(report.ai.status, 'blocked')
  const html = designReportHTML({ verdict: 'go', ai: { status: 'completed' }, queryMonitor: { status: 'completed' }, codeProfiler: { status: 'completed' }, design: { status: 'completed', misses: ['Semantic mismatch'], captures: [1440, 390].map((width) => ({ width, height: 1000, match: 99.5, pixels: width * 1000, changedPixels: 5, reference: 'sample".png', rebuilt: 'saved".png' })) } })
  assert.match(html, /Passed · 1 note/)
  assert.match(html, /99\.5%/)
  assert.match(html, /src="sample&quot;\.png"/)
  assert.match(html, /src="saved&quot;\.png"/)
  assert.match(html, /Show the original technical wording/)
  assert.match(html, /Semantic mismatch/)
})

test('report finalization records real states and visible-first plain misses', () => {
  const report = {
    ai: { status: 'completed' }, design: { status: 'completed', misses: ['The sample title was not rebuilt as an H1 heading.', '390px: 5.40% of pixels differ from the sample; inspect the side-by-side captures.'], captures: [{ width: 1440, match: 100 }, { width: 390, match: 94.6 }] },
    queryMonitor: { status: 'completed' }, codeProfiler: { status: 'completed' },
  }
  finalizeDesignReport(report)
  assert.equal(report.state, 'partial')
  assert.equal(report.design.missDetails[0].visible, true)
  assert.match(report.design.missDetails[0].title, /phone/)
  assert.match(report.design.missDetails[1].raw, /H1/)
  report.design.captures[1].match = 100
  report.design.misses.pop()
  finalizeDesignReport(report)
  assert.equal(report.state, 'passed', 'nonvisual notes remain a pass')
  report.codeProfiler.status = 'blocked'
  finalizeDesignReport(report)
  assert.equal(report.state, 'partial')
  assert.doesNotMatch(report.summary.lead, /0 differences|mostly on the phone/)
  report.ai = { status: 'blocked', reason: 'Login rejected.' }
  finalizeDesignReport(report)
  assert.equal(report.state, 'failed')
  assert.match(report.summary.lead, /Login rejected/)
  assert.doesNotMatch(report.summary.lead, /180|Nothing was charged/)
})

test('the saved JSON gets the same final state and wording as the page, even after failure', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'design-report-state-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const job = await enqueue(root)
  await runOnce(root, async (report) => {
    report.kind = 'design-test'
    report.ai = { status: 'running' }
    report.design = { status: 'not-run' }
    throw new Error('Login unavailable.')
  }, designReportHTML, finalizeDesignReport)
  const saved = JSON.parse(await readFile(path.join(root, 'runs', job.id, 'report.json'), 'utf8'))
  assert.equal(saved.state, 'failed')
  assert.match(saved.summary.lead, /Login unavailable/)
  const html = await readFile(path.join(root, 'runs', job.id, 'report.html'), 'utf8')
  assert.match(html, /Login unavailable/)
  assert.doesNotMatch(html, /NaN|Invalid Date|Nothing charged|fonts.googleapis/)
})

test('standalone report uses local fonts, safe inline data and no preview controls', () => {
  const report = { ai: { status: 'blocked', reason: '</script><script>alert(1)</script>' }, design: { status: 'not-run' } }
  finalizeDesignReport(report)
  const html = designReportHTML(report)
  assert.match(html, /data:font\/woff2;base64,/)
  assert.match(html, /@property --n/)
  assert.match(html, /prefers-reduced-motion/)
  assert.match(html, /&lt;script&gt;alert/)
  assert.doesNotMatch(html, /<script>alert|fetch\(|name="mode"|name="theme"|data-shift/)
})

test('unknown AI notes and heading mistakes never claim to be invisible block limits', () => {
  const report = { ai: { status: 'completed' }, design: { status: 'completed', misses: ['Card hover shadow not supported', 'The sample title was not rebuilt as an H1 heading.'], captures: [1440, 390].map((width) => ({ width, height: 1000, match: 100, pixels: width * 1000, changedPixels: 0, reference: 'reference.png', rebuilt: 'rebuilt.png' })) }, queryMonitor: { status: 'completed' }, codeProfiler: { status: 'completed' } }
  finalizeDesignReport(report)
  assert.equal(report.state, 'passed')
  assert.doesNotMatch(report.summary.lead, /None of them change how it looks|can’t be set with blocks|looks identical/)
  const html = designReportHTML(report)
  assert.match(html, /Noted by the AI/)
  assert.match(html, /Heading structure/)
  assert.doesNotMatch(html, />Not visible</)
})

test('visible margin and viewport defects never become invisible block limits', () => {
  for (const miss of [
    'The body margin is 8px instead of 0px, shifting the whole page.',
    'Missing viewport metadata makes the phone page render at desktop width.',
    'Different box-sizing makes the cards wider than the screen.',
    'Horizontal overflow at 390px because viewport metadata is missing.',
    'Missing article element semantics and a body margin that shifts every card.',
  ]) {
    const report = { ai: { status: 'completed' }, design: { status: 'completed', misses: [miss], captures: [1440, 390].map((width) => ({ width, height: 1000, match: 97, pixels: width * 1000, changedPixels: width * 30, reference: 'reference.png', rebuilt: 'rebuilt.png' })) }, queryMonitor: { status: 'completed' }, codeProfiler: { status: 'completed' } }
    finalizeDesignReport(report)
    assert.equal(report.design.missDetails[0].visible, true, miss)
    assert.equal(report.state, 'partial', miss)
    const html = designReportHTML(report)
    assert.match(html, />You can see it</)
    assert.doesNotMatch(html, />Not visible</)
  }
})

test('unconfirmed layout notes stay neutral when the pictures match', () => {
  for (const [match, changedPerRow, state, visible] of [[100, 0, 'passed', false], [99.5, 5, 'passed', false], [97, 30, 'partial', true]]) {
    const report = { ai: { status: 'completed' }, design: { status: 'completed', misses: ['The body margin cannot be set with blocks.'], captures: [1440, 390].map((width) => ({ width, height: 1000, match, pixels: width * 1000, changedPixels: width * changedPerRow, reference: 'reference.png', rebuilt: 'rebuilt.png' })) }, queryMonitor: { status: 'completed' }, codeProfiler: { status: 'completed' } }
    finalizeDesignReport(report)
    assert.equal(report.state, state)
    assert.equal(report.design.missDetails[0].visible, visible)
    const html = designReportHTML(report)
    assert.doesNotMatch(html, />Not visible</)
    if (visible) assert.equal(report.design.missDetails[0].title, 'The page spacing or phone layout needs checking')
    else {
      assert.match(html, />Noted by the AI</)
      assert.doesNotMatch(html, />You can see it</)
    }
  }
})

test('picture scores below the cutoff never display as 99 percent', () => {
  for (const [match, shown, state] of [[98.96, '98.9', 'partial'], [98.99, '98.9', 'partial'], [99, '99', 'passed'], [100, '100', 'passed']]) {
    const report = { ai: { status: 'completed' }, design: { status: 'completed', misses: [], captures: [1440, 390].map((width) => ({ width, height: 1000, match, pixels: width * 1000, changedPixels: 0, reference: 'reference.png', rebuilt: 'rebuilt.png' })) }, queryMonitor: { status: 'completed' }, codeProfiler: { status: 'completed' } }
    finalizeDesignReport(report)
    assert.equal(report.state, state)
    const html = designReportHTML(report)
    assert.equal(html.match(/class="score-num num">([^<]+)/)[1], shown)
    assert.deepEqual([...html.matchAll(/<dd>([\d.]+%)<\/dd>/g)].map((m) => m[1]), [`${shown}%`, `${shown}%`])
    assert.equal(html.match(/<strong class="num">([\d.]+%)<\/strong> match/)[1], `${shown}%`)
  }
})

test('saved blocks with failed captures keep notes and do not invent zero changed pixels', () => {
  const report = { ai: { status: 'completed' }, design: { status: 'blocked', native: { status: 'completed', invalidBlocks: 0, inventory: { 'core/group': 1 } }, captures: [], misses: ['AI note'] }, blocker: 'Capture calibration failed.' }
  finalizeDesignReport(report)
  const html = designReportHTML(report)
  assert.equal(report.state, 'failed')
  assert.match(html, /page was rebuilt, but picture capture did not finish/)
  assert.doesNotMatch(html, /0 different|before the page was rebuilt|Nothing to report yet/)
  assert.match(html, /AI note/)
})

test('a failed speed tester on a rebuilt page shows its actual reason', () => {
  const report = { ai: { status: 'completed' }, design: { status: 'completed', captures: [], misses: [] }, queryMonitor: { status: 'blocked', reason: 'Collector response was incomplete.' } }
  finalizeDesignReport(report)
  const html = designReportHTML(report)
  assert.match(html, /Collector response was incomplete/)
  assert.doesNotMatch(html, /This test needs the rebuilt page/)
})

test('partial captures never substitute desktop images for the phone', async () => {
  const { runInNewContext } = await import('node:vm')
  const report = { ai: { status: 'completed' }, design: { status: 'blocked', captures: [{ width: 1440, height: 1000, match: 100, pixels: 1440000, changedPixels: 0, reference: 'reference-1440.png', rebuilt: 'rebuilt-1440.png' }], misses: [] } }
  finalizeDesignReport(report)
  const html = designReportHTML(report)
  assert.match(html, /value="phone"[^>]*disabled/)
  const elements = new Map(['#stage', '#foot', '#hint'].map((id) => [id, { innerHTML: '', textContent: '' }]))
  let change
  runInNewContext(html.match(/<script type="module">([\s\S]*?)<\/script>/)[1], {
    document: { querySelector: (id) => elements.get(id), addEventListener: (event, fn) => { if (event === 'change') change = fn } },
  })
  change({ target: { type: 'radio', name: 'view', value: 'phone' } })
  assert.match(elements.get('#stage').innerHTML, /Phone capture did not finish/)
  assert.doesNotMatch(elements.get('#stage').innerHTML, /reference-1440/)
})

test('a later tester explains that it did not run after the real global blocker', () => {
  const report = { ai: { status: 'completed' }, design: { status: 'completed', captures: [], misses: [] }, queryMonitor: { status: 'blocked' }, codeProfiler: { status: 'not-run' }, blocker: 'Query Monitor target returned HTTP 500.' }
  finalizeDesignReport(report)
  const html = designReportHTML(report)
  assert.match(html, /note-box">Did not run because the test stopped: Query Monitor target returned HTTP 500\./)
  const speed = html.slice(html.indexOf('<h3>Page speed</h3>'), html.indexOf('<h3>Which plugins take the time</h3>'))
  assert.match(speed, /note-box">Query Monitor target returned HTTP 500\.<\/p>/)
  assert.doesNotMatch(speed, /note-box">Did not run/)
})


test('phone-only captures select the real phone image and disable desktop', () => {
  const report = { ai: { status: 'completed' }, design: { status: 'blocked', captures: [{ width: 390, height: 1000, match: 100, pixels: 390000, changedPixels: 0, reference: 'reference-390.png', rebuilt: 'rebuilt-390.png' }], misses: [] } }
  finalizeDesignReport(report)
  const html = designReportHTML(report)
  assert.match(html, /value="desktop"[^>]*disabled/)
  assert.match(html, /value="phone"[^>]*checked/)
  assert.match(html, /class="viewer" data-view="phone"[\s\S]*?class="orig" src="reference-390\.png"/)
})
