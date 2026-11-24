#!/usr/bin/env node
import { designReportHTML, finalizeDesignReport } from './design-report.mjs'
export { designReportHTML, finalizeDesignReport } from './design-report.mjs'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DATA_DIRECTORY, enqueue, runOnce, runBrowserProof } from './private-runner.mjs'

export const DESIGN_DIRECTORY = path.join(DATA_DIRECTORY, 'design-tests')
const SAMPLE = {
  name: 'THE LONG VIEW', title: 'Build something that lasts.',
  intro: 'Thoughtful places. A lighter footprint.',
  cards: [
    ['Places with purpose', 'Spaces that make everyday life better.', '#d7dfcf'],
    ['Less, but better', 'Simple choices. Lasting value.', '#d8c8af'],
    ['Built to endure', 'Good design for the long term.', '#c4d0c6'],
  ], footer: 'The Long View Studio',
}
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

export function sampleHTML() {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Sample page</title><style>
*{box-sizing:border-box}body{margin:0;background:#f2f0e8;color:#213d30;font:16px/1.5 Arial,sans-serif}.sample{max-width:1120px;margin-inline:auto}header{padding:24px 32px;border-bottom:1px solid #cad0c5;font-size:22px;font-weight:700}section{padding:64px 32px}h1{font-size:52px;line-height:1.1;font-weight:700;margin:0}p{margin:16px 0 0}.cards{display:flex;gap:24px;padding:0 32px 64px}.card{flex:1;min-width:0;padding:24px}h2{font-size:24px;line-height:1.2;font-weight:700;margin:0}footer{padding:24px 32px;border-top:1px solid #cad0c5}@media(max-width:781px){.cards{flex-direction:column}}
</style><div class="sample"><header>${SAMPLE.name}</header><section><h1>${SAMPLE.title}</h1><p>${SAMPLE.intro}</p></section><div class="cards">${SAMPLE.cards.map(([title, text, color]) => `<article class="card" style="background:${color}"><h2>${title}</h2><p>${text}</p></article>`).join('')}</div><footer>${SAMPLE.footer}</footer></div></html>`
}

const allowed = {
  'core/group': ['tagName', 'layout'], 'core/columns': ['isStackedOnMobile'],
  'core/column': ['width'], 'core/heading': ['content', 'level', 'textAlign'],
  'core/paragraph': ['content', 'align'],
}
export function validateDesign(value) {
  if (!Array.isArray(value?.blocks) || !value.blocks.length || !Array.isArray(value.misses) || value.misses.length > 50 || value.misses.some((v) => typeof v !== 'string' || v.length > 1000)) throw new Error('Invalid AI design response.')
  let count = 0
  const visit = (block, depth) => {
    if (++count > 60 || depth > 10 || !Object.hasOwn(allowed, block.name) || !Array.isArray(block.innerBlocks) || !block.attributes || typeof block.attributes !== 'object' || Array.isArray(block.attributes)) throw new Error('Only a bounded tree of supported Gutenberg core blocks is allowed.')
    for (const [key, data] of Object.entries(block.attributes)) {
      if (![...allowed[block.name], 'style', 'anchor'].includes(key)) throw new Error(`Unsupported block attribute: ${key}`)
      if (JSON.stringify(data).length > 4000 || /[<>]|url\s*\(|expression\s*\(|javascript:|https?:|data:|file:|\/\/|@import/i.test(JSON.stringify(data))) throw new Error('Executable markup or external resources are not allowed in blocks.')
      if (key === 'tagName' && !['div', 'header', 'main', 'section', 'article', 'aside', 'footer'].includes(data)) throw new Error('Unsupported group tag.')
      if (key === 'style' && (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).some((name) => !['spacing', 'border', 'color', 'typography'].includes(name)))) throw new Error('Only native spacing, border, color and typography styles are allowed.')
    }
    block.innerBlocks.forEach((child) => visit(child, depth + 1))
  }
  value.blocks.forEach((block) => visit(block, 1))
  return value
}

export function classifyCodexFailure(output) {
  return /usage limit|quota exceeded|insufficient_quota|usage_limit_reached|allowance.*exhausted/i.test(output)
    ? { status: 'paused', reason: 'Waiting for AI allowance. Run a new attempt after your ChatGPT allowance resets. No paid fallback was used.' }
    : { status: 'blocked', reason: 'Codex could not finish with the signed-in ChatGPT account. Check login or runner access, then start a new attempt. No paid fallback was used.' }
}

export function codexArguments(directory) {
  return ['exec', '--ignore-user-config', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'read-only',
    '-c', 'forced_login_method="chatgpt"', '-c', 'model_provider="openai"',
    '-c', 'model_reasoning_effort="high"', '-c', 'features.shell_tool=false',
    '-m', 'gpt-6.1-sol', '-C', directory, '--output-schema', path.join(directory, 'schema.json'),
    '--output-last-message', path.join(directory, 'answer.json'), '-']
}

function command(args, prompt, directory, deadline = 180_000) {
  return new Promise((resolve, reject) => {
    // Only ordinary process settings are inherited. No API-key fallback or custom provider config.
    const env = Object.fromEntries(['PATH', 'HOME', 'USER', 'LANG', 'LC_ALL', 'XDG_RUNTIME_DIR', 'DBUS_SESSION_BUS_ADDRESS', 'CODEX_HOME', 'TMPDIR'].filter((key) => process.env[key]).map((key) => [key, process.env[key]]))
    const child = spawn('codex', args, { cwd: directory, env, stdio: ['pipe', 'pipe', 'pipe'] })
    let output = '', expired = false, hardStop
    child.stdout.on('data', (chunk) => { output = (output + chunk).slice(-32000) })
    child.stderr.on('data', (chunk) => { output = (output + chunk).slice(-32000) })
    child.on('error', reject)
    const timer = setTimeout(() => {
      expired = true; child.kill('SIGTERM')
      hardStop = setTimeout(() => child.kill('SIGKILL'), 1000)
    }, deadline)
    child.on('close', (code) => { clearTimeout(timer); clearTimeout(hardStop); resolve({ code, output, expired }) })
    child.stdin.on('error', () => {})
    child.stdin.end(prompt)
  })
}

export async function generateDesign(report, directory, run = command) {
  report.ai = { status: 'running', route: 'signed-in Codex CLI / ChatGPT', model: 'gpt-6.1-sol', paidFallback: false, cost: 'Included allowance used; exact cash cost unavailable.' }
  const login = await run(['login', 'status'], '', directory, 15_000)
  if (login.code !== 0 || !/Logged in using ChatGPT/.test(login.output)) throw new Error('Codex must already be signed in using ChatGPT. API-key login is not accepted.')
  const schema = { type: 'object', additionalProperties: false, required: ['blocks', 'misses'], properties: {
    blocks: { type: 'array', items: { $ref: '#/$defs/block' } }, misses: { type: 'array', items: { type: 'string' } },
  }, $defs: { block: { type: 'object', additionalProperties: false, required: ['name', 'attributes', 'innerBlocks'], properties: {
    name: { type: 'string', enum: Object.keys(allowed) }, attributes: { type: 'string', description: 'JSON object of registered Gutenberg block attributes.' }, innerBlocks: { type: 'array', items: { $ref: '#/$defs/block' } },
  } } } }
  await writeFile(path.join(directory, 'schema.json'), JSON.stringify(schema), { mode: 0o600 })
  await writeFile(path.join(directory, 'sample.html'), sampleHTML(), { mode: 0o600 })
  const prompt = `Return only the requested JSON. Rebuild this fixed sample as an editable Gutenberg core block tree, no tools or file changes. Use core/group, columns, column, heading, paragraph only. Attributes are a JSON string per node. Use native style attributes, no classes, HTML, custom CSS, external resources or shortcodes. Preserve all text. List every unsupported detail in misses. The supplied theme sets Arial 16px/1.5, text #213d30, background #f2f0e8, zero block gap, heading weight 700. Give the outer group a constrained layout contentSize 1120px; its children must fill that width. Use native padding, borders, margins, typography and background style attributes to match the reference, columns gap24px and mobile stacking. Header and footer are groups with paragraph children, hero a group with heading and paragraph; cards use columns with three columns each with background, padding and heading/paragraph. Do not use any other attributes than style, tagName, layout, isStackedOnMobile, width, content, level, textAlign, align, anchor. Set heading margins to zero; paragraphs top margin16px except header/footer zero. Put header fontSize22px/fontWeight700 on its paragraph. Use border.top/bottom objects for individual edges. Keep h1 fontSize52px/lineHeight1.1, h2 fontSize24px/lineHeight1.2.\nReference HTML:\n${sampleHTML()}`
  console.log('Generating native Gutenberg blocks with signed-in Codex…')
  const result = await run(codexArguments(directory), prompt, directory)
  await chmod(path.join(directory, 'answer.json'), 0o600).catch((error) => { if (error.code !== 'ENOENT') throw error })
  if (result.code !== 0 || result.expired) {
    Object.assign(report.ai, result.expired
      ? { status: 'blocked', reason: 'Codex did not answer within 180 seconds. Start a new attempt. No paid fallback was used.' }
      : classifyCodexFailure(result.output))
    throw new Error(report.ai.reason)
  }
  const answer = JSON.parse(await readFile(path.join(directory, 'answer.json'), 'utf8'))
  const decode = (block) => ({ ...block, attributes: JSON.parse(block.attributes), innerBlocks: block.innerBlocks.map(decode) })
  const design = validateDesign({ ...answer, blocks: answer.blocks.map(decode) })
  report.ai.status = 'completed'
  return design
}

// Pixels count as changed when an RGB channel differs by more than 10%.
// This transparent match score is not SSIM or an assertion of design correctness.
export function pixelScore(a, b) {
  if (!a.length || a.length !== b.length || a.length % 4) throw new Error('Capture dimensions differ.')
  let changed = 0
  for (let i = 0; i < a.length; i += 4) if (Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])) > 25.5) changed++
  return { match: 100 * (1 - changed / (a.length / 4)), changedPixels: changed, pixels: a.length / 4 }
}

const theme = {
  version: 3, settings: { appearanceTools: true, layout: { contentSize: '1120px', wideSize: '1120px' } },
  styles: { color: { background: '#f2f0e8', text: '#213d30' }, spacing: { blockGap: '0px', padding: { top: '0px', right: '0px', bottom: '0px', left: '0px' } }, typography: { fontFamily: 'Arial, sans-serif', fontSize: '16px', lineHeight: '1.5' }, elements: { heading: { typography: { fontWeight: '700', fontFamily: 'Arial, sans-serif' } } } },
}

export async function buildAndCapture({ page, context, php }, report, directory, design) {
  report.design = { status: 'running', sample: 'The Long View / fixed sample v1', misses: design.misses, captures: [] }
  await php(`<?php require '/wordpress/wp-load.php'; $d=WP_CONTENT_DIR.'/themes/design-sample'; wp_mkdir_p($d.'/templates'); file_put_contents($d.'/style.css', "/*\nTheme Name: Design Sample\nVersion: 1.0\n*/"); file_put_contents($d.'/theme.json', ${JSON.stringify(JSON.stringify(theme))}); file_put_contents($d.'/templates/index.html', '<!-- wp:post-content /-->'); switch_theme('design-sample');`)
  await page.evaluate(() => window.proofClient.goTo('/wp-admin/post-new.php?post_type=page'))
  const frame = page.frameLocator('#site').frameLocator('iframe')
  await frame.locator('body').evaluate(async () => {
    const start = Date.now()
    while (!window.wp?.blocks?.serialize || !window.wp?.apiFetch) {
      if (Date.now() - start > 30000) throw new Error('Gutenberg serializer did not load.')
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  })
  const saved = await frame.locator('body').evaluate(async (_, blocks) => {
    const create = (node) => wp.blocks.createBlock(node.name, node.attributes, node.innerBlocks.map(create))
    const content = wp.blocks.serialize(blocks.map(create))
    const invalid = (nodes) => nodes.some((b) => !b.isValid || b.name === 'core/freeform' || invalid(b.innerBlocks))
    if (invalid(wp.blocks.parse(content))) throw new Error('Generated Gutenberg blocks failed editor validation.')
    const saved = await wp.apiFetch({ path: '/wp/v2/pages', method: 'POST', data: { title: 'The Long View', status: 'publish', content } })
    const readback = await wp.apiFetch({ path: `/wp/v2/pages/${saved.id}?context=edit` })
    const parsed = wp.blocks.parse(readback.content.raw)
    if (invalid(parsed)) throw new Error('Saved Gutenberg blocks failed readback validation.')
    const inventory = {}
    const count = (nodes) => nodes.forEach((b) => { inventory[b.name] = (inventory[b.name] || 0) + 1; count(b.innerBlocks) })
    count(parsed)
    return { id: saved.id, inventory, content: readback.content.raw }
  }, design.blocks)
  await writeFile(path.join(directory, 'blocks.html'), saved.content, { mode: 0o600 })
  report.design.native = { status: 'completed', invalidBlocks: 0, inventory: saved.inventory, savedPage: saved.id }
  await php(`<?php require '/wordpress/wp-load.php'; update_option('show_on_front','page'); update_option('page_on_front',${Number(saved.id)});`)
  // Query Monitor owns the first frontend request; screenshot navigation stays deferred.
  return () => captureDesign({ page, context }, report, directory)
}

async function captureDesign({ page, context }, report, directory) {
  const frame = page.frameLocator('#site').frameLocator('iframe')
  report.design.step = 'open saved homepage'
  await page.evaluate(() => window.proofClient.goTo('/'))
  await frame.locator('.wp-block-post-content').waitFor()
  const titles = await frame.locator('h1').allTextContents()
  if (!titles.some((title) => title.trim() === SAMPLE.title)) report.design.misses.push('The sample title was not rebuilt as an H1 heading.')
  const texts = [SAMPLE.name, SAMPLE.title, SAMPLE.intro, SAMPLE.footer, ...SAMPLE.cards.flatMap(([title, text]) => [title, text])]
  const actual = await frame.locator('body').innerText()
  for (const text of texts) if (!actual.includes(text)) report.design.misses.push(`Missing required text: ${text}`)
  const reference = await context.newPage()
  try {
    report.design.step = 'render independent sample'
    await reference.setContent(sampleHTML())
    const render = async (target) => target.evaluate(async () => {
      await document.fonts.ready
      document.querySelector('#wpadminbar')?.remove()
      document.documentElement.style.setProperty('margin-top', '0px', 'important')
      for (const image of document.images) await image.decode().catch(() => {})
    })
    for (const width of [1440, 390]) {
      report.design.step = `capture ${width}px`
      await page.setViewportSize({ width, height: 1000 })
      await reference.setViewportSize({ width, height: 1000 })
      await page.locator('#site').evaluate((element) => { element.style.cssText = 'border:0;width:100vw;height:1000px;display:block'; document.body.style.margin = '0' })
      await render(reference)
      await frame.locator('body').evaluate(async () => { await document.fonts.ready; document.querySelector('#wpadminbar')?.remove(); document.documentElement.style.setProperty('margin-top','0px','important') })
      const height = Math.max(1000, await reference.evaluate(() => document.documentElement.scrollHeight), await frame.locator('body').evaluate(() => document.documentElement.scrollHeight))
      await page.setViewportSize({ width, height })
      await reference.setViewportSize({ width, height })
      await page.locator('#site').evaluate((element, height) => { element.style.height = `${height}px` }, height)
      const referenceBuffer = await reference.screenshot({ type: 'png' })
      const rebuiltBuffer = await page.locator('#site').screenshot({ type: 'png' })
      const repeatBuffer = await reference.screenshot({ type: 'png' })
      const filenames = { reference: `reference-${width}.png`, rebuilt: `rebuilt-${width}.png` }
      for (const [name, buffer] of [[filenames.reference, referenceBuffer], [filenames.rebuilt, rebuiltBuffer]]) await writeFile(path.join(directory, name), buffer, { mode: 0o600 })
      // Decode both PNGs through the same Chromium canvas. No image-processing dependency or server.
      const score = await reference.evaluate(async ({ images, scoreSource }) => {
        const out = [], dimensions = []
        for (const base64 of images) {
          const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode()
          dimensions.push(`${image.width}x${image.height}`)
          const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height
          const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0); out.push(ctx.getImageData(0, 0, image.width, image.height).data)
        }
        if (new Set(dimensions).size !== 1) throw new Error('Capture dimensions differ.')
        const compare = new Function(`return (${scoreSource})`)()
        const repeat = compare(out[0], out[2])
        const broken = out[0].slice(); broken.fill(0, 0, 40000)
        const brokenMatch = compare(out[0], broken).match
        if (repeat.match !== 100 || brokenMatch === 100) throw new Error('Visual score calibration failed.')
        return { ...compare(out[0], out[1]), calibration: { repeatMatch: repeat.match, brokenMatch } }
      }, { images: [referenceBuffer.toString('base64'), rebuiltBuffer.toString('base64'), repeatBuffer.toString('base64')], scoreSource: pixelScore.toString() })
      const overflow = await frame.locator('body').evaluate(() => document.documentElement.scrollWidth > innerWidth)
      if (overflow) report.design.misses.push(`Horizontal overflow at ${width}px.`)
      if (score.match < 99) report.design.misses.push(`${width}px: ${(100 - score.match).toFixed(2)}% of pixels differ from the sample; inspect the side-by-side captures.`)
      report.design.captures.push({ width, height, ...filenames, ...score, overflow })
    }
  } finally { await reference.close() }
  report.design.status = 'completed'
  report.design.outcome = report.design.misses.length ? 'needs-work' : 'passed'
  delete report.design.step
  console.log(`Gutenberg readback valid; ${report.design.captures.map((c) => `${c.width}px ${c.match.toFixed(2)}%`).join(', ')}.`)
}

export async function runDesignProof(report, directory, { generate = generateDesign, browser = runBrowserProof } = {}) {
  report.kind = 'design-test'
  report.design = { status: 'not-run' }
  const design = await generate(report, directory)
  await browser(report, { beforeChecks: (browser) => buildAndCapture(browser, report, directory, design) })
}

async function main() {
  if (process.argv.length !== 3 || !['enqueue', 'once'].includes(process.argv[2])) throw new Error('Usage: node scripts/design-runner.mjs enqueue|once')
  if (process.argv[2] === 'enqueue') { console.log(`Queued design test ${(await enqueue(DESIGN_DIRECTORY)).id}`); return }
  const report = await runOnce(DESIGN_DIRECTORY, runDesignProof, designReportHTML, finalizeDesignReport)
  if (!report) { console.log('No queued design tests.'); return }
  console.log(`Report: ${path.join(DESIGN_DIRECTORY, 'runs', report.job.id, 'report.html')}`)
  console.log(`RESULT: ${report.verdict === 'go' ? 'ok' : 'fail'} design-runner ${report.verdict}${report.blocker ? `: ${report.blocker}` : ''}`)
  process.exitCode = report.verdict === 'go' ? 0 : 1
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((error) => { console.error(error.message); process.exitCode = 1 })
