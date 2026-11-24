#!/usr/bin/env node
// Browser evidence for the report renderer, using public fixtures and no AI or WordPress run.
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { enqueue, runOnce } from './private-runner.mjs'
import { designReportHTML, finalizeDesignReport, pixelScore, sampleHTML } from './design-runner.mjs'

if (process.argv.length !== 3) throw new Error('Usage: node scripts/design-report-check.mjs <evidence-directory>')
const root = path.resolve(process.argv[2])
await mkdir(root, { recursive: true })
const browser = await chromium.launch({ headless: true, chromiumSandbox: true })
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, hasTouch: true })
  const page = await context.newPage()
  const captures = []
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    const images = []
    for (const [name, html] of [['reference', sampleHTML()], ['rebuilt', sampleHTML().replace('font-size:52px', 'font-size:38px')]]) {
      await page.setContent(html)
      images.push((await page.screenshot({ path: path.join(root, `${name}-${width}.png`) })).toString('base64'))
    }
    const score = await page.evaluate(async ({ images, scoreSource }) => {
      const arrays = []
      for (const base64 of images) {
        const image = new Image()
        image.src = `data:image/png;base64,${base64}`
        await image.decode()
        const canvas = document.createElement('canvas')
        canvas.width = image.width
        canvas.height = image.height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(image, 0, 0)
        arrays.push(ctx.getImageData(0, 0, image.width, image.height).data)
      }
      return new Function(`return (${scoreSource})`)()(...arrays)
    }, { images, scoreSource: pixelScore.toString() })
    assert.ok(score.match < 99, 'The public fixture must have real image differences')
    captures.push({ width, height: 1000, reference: `reference-${width}.png`, rebuilt: `rebuilt-${width}.png`, ...score, overflow: false })
  }
  await enqueue(root)
  const report = await runOnce(root, async (report, directory) => {
    Object.assign(report, {
      kind: 'design-test',
      ai: { status: 'completed', model: 'Public fixture', route: 'Report renderer check; no AI or WordPress execution', cost: 'No generation performed.' },
      design: { status: 'completed', sample: 'The Long View / fixed sample v1', native: { status: 'completed', invalidBlocks: 0, inventory: { 'core/group': 4, 'core/paragraph': 6, 'core/heading': 4, 'core/columns': 1, 'core/column': 3 } }, captures,
        misses: captures.map((c) => `${c.width}px: ${(100 - c.match).toFixed(2)}% of pixels differ from the sample; inspect the side-by-side captures.`) },
      queryMonitor: { status: 'completed', source: 'query-monitor', warmSeconds: { median: .042, min: .04, max: .045 },
        observations: [.09, .04, .042, .045, .043, .041].map((time, index) => ({ source: 'query-monitor', phase: index ? 'warm' : 'cold', time, queries: 18, slowQueries: 0, memory: 20971520, memoryLimit: 134217728, errorCounts: { warning: 0 } })) },
      codeProfiler: { status: 'completed', profileId: 'public-fixture', tier: 'free', attribution: [{ name: 'Query Monitor', type: 'plugin', seconds: .011 }, { name: 'Code Profiler', type: 'plugin', seconds: .003 }] },
    })
    for (const c of captures) for (const name of [c.reference, c.rebuilt]) await copyFile(path.join(root, name), path.join(directory, name))
  }, designReportHTML, finalizeDesignReport)
  const directory = path.join(root, 'runs', report.job.id)
  const saved = JSON.parse(await readFile(path.join(directory, 'report.json'), 'utf8'))
  assert.equal(saved.state, 'partial')
  const passed = structuredClone(saved)
  passed.design.misses = []
  passed.design.captures.forEach((c) => { c.match = 100; c.changedPixels = 0; c.rebuilt = c.reference })
  finalizeDesignReport(passed)
  const failed = { ...saved, ai: { status: 'blocked', reason: 'Fixture timeout: no AI call was made.' }, design: { status: 'not-run' }, queryMonitor: { status: 'not-run' }, codeProfiler: { status: 'not-run' } }
  finalizeDesignReport(failed)
  await writeFile(path.join(directory, 'passed.html'), designReportHTML(passed))
  await writeFile(path.join(directory, 'failed.html'), designReportHTML(failed))
  const errors = [], network = [], matrix = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => { if (/^https?:/.test(request.url())) network.push(request.url()) })
  for (const width of [1440, 390]) for (const colorScheme of ['light', 'dark']) for (const state of ['partial', 'passed', 'failed']) {
    await page.setViewportSize({ width, height: 1000 })
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
    await page.goto(pathToFileURL(path.join(directory, state === 'partial' ? 'report.html' : `${state}.html`)).href)
    await page.evaluate(() => document.fonts.ready)
    const dimensions = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }))
    assert.equal(dimensions.width, width)
    assert.equal(dimensions.scrollWidth, width)
    assert.equal(await page.locator('.stat').count(), 8)
    assert.ok(await page.evaluate(() => [...document.querySelectorAll('.tally')].every((el) => getComputedStyle(el).animationName === 'none')))
    assert.ok(await page.evaluate(() => [...document.querySelectorAll('input[type=radio]')].every((el) => el.getBoundingClientRect().height >= 44)))
    await page.screenshot({ path: path.join(root, `${state}-${width}-${colorScheme}.png`), fullPage: true })
    if (state === 'partial') {
      assert.ok(await page.locator('.runs .col').first().evaluate((el) => el.getBoundingClientRect().height > 0), 'Speed bars must be visible')
      const slider = page.getByRole('slider')
      await slider.focus()
      for (const [key, value] of [['Home', '0'], ['ArrowRight', '2'], ['Shift+ArrowRight', '12'], ['End', '100'], ['ArrowLeft', '98']]) {
        await page.keyboard.press(key)
        assert.equal(await slider.getAttribute('aria-valuenow'), value)
      }
      const beforeScroll = await slider.getAttribute('aria-valuenow')
      const scrollBox = await page.locator('#viewer').boundingBox()
      const session = await context.newCDPSession(page)
      const point = { x: scrollBox.x + scrollBox.width * .25, y: scrollBox.y + Math.min(80, scrollBox.height * .2) }
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] })
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x, y: point.y + 60 }] })
      await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
      await session.detach()
      assert.equal(await slider.getAttribute('aria-valuenow'), beforeScroll, 'Touch scroll must not move the divider')
      const box = await page.locator('#viewer').boundingBox()
      await page.mouse.move(box.x + box.width * .25, box.y + box.height * .4)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width * .75, box.y + box.height * .4)
      await page.mouse.up()
      assert.ok(Math.abs(Number(await slider.getAttribute('aria-valuenow')) - 75) <= 1)
      await page.getByRole('radio', { name: 'Phone 390' }).check()
      assert.ok((await page.locator('#viewer .orig').getAttribute('src')).includes('390'))
      await page.getByRole('radio', { name: 'Side by side' }).check()
      assert.equal(await page.locator('.side figure').count(), 2)
      await page.getByText('Show the original technical wording', { exact: true }).click()
      assert.equal(await page.locator('.tech code').count(), 2)
      await page.getByText('More about this run', { exact: true }).click()
      await page.getByText('All recorded evidence', { exact: true }).click()
      assert.ok((await page.locator('.raw').textContent()).includes('public-fixture'))
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width)
    }
    matrix.push({ state, width, colorScheme, overflow: false })
  }
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto(pathToFileURL(path.join(directory, 'report.html')).href)
  assert.equal(await page.locator('.tally').first().evaluate((el) => getComputedStyle(el).animationName), 'count-up')
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.tally')).getPropertyValue('--n').trim() === '18')
  const offlineContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 1000 } })
  const offlinePage = await offlineContext.newPage()
  await offlinePage.goto(pathToFileURL(path.join(directory, 'report.html')).href)
  const fallbackImages = await offlinePage.locator('.static-comparison img').count()
  const fallbackLinks = await offlinePage.locator('.static-comparison a').count()
  const fallbackLoaded = await offlinePage.locator('.static-comparison img').evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0))
  await offlineContext.close()
  await page.setViewportSize({ width: 390, height: 1000 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(pathToFileURL(path.join(directory, 'report.html')).href)
  await page.addStyleTag({ content: 'html { font-size: 200%; }' })
  const enlargedWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  console.log(JSON.stringify({ fallbackImages, fallbackLinks, enlargedWidth }))
  assert.equal(fallbackImages, 4, 'Without JavaScript, both original/copy images at both widths remain visible')
  assert.equal(fallbackLinks, 4, 'Every complete comparison image has a direct link')
  assert.ok(fallbackLoaded, 'All no-JavaScript images loaded from the adjacent PNG files')
  assert.equal(enlargedWidth, 390, '200% text must fit a phone')
  assert.ok(await page.locator('input[type=radio]').evaluateAll((inputs) => inputs.every((input) => { const box = input.getBoundingClientRect(); return box.x >= 0 && box.right <= innerWidth && box.height >= 44 })), 'Enlarged-text controls remain reachable')
  assert.equal(errors.length, 0, errors.join('\n'))
  assert.equal(network.length, 0, 'Saved reports must work offline without HTTP requests')
  await writeFile(path.join(root, 'browser-evidence.json'), JSON.stringify({ matrix, errors, network, captures, noJavaScript: { fallbackImages, fallbackLinks, fallbackLoaded }, enlargedText: { width: 390, percent: 200, scrollWidth: enlargedWidth }, controls: 'keyboard, pointer drag, touch scroll cancellation, device and comparison radios, disclosures', report: path.relative(root, path.join(directory, 'report.html')) }, null, 2))
  console.log(`RESULT: ok design-report-browser 12 layouts; offline fonts/images; controls; counters; evidence ${root}`)
} finally {
  await browser.close()
}
