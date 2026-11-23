#!/usr/bin/env node
// A deliberately fixed, secret-free proof. No listener, recipe input or browser vault.
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { homedir, hostname } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MEASURE_PLUGIN, MEASURE_PLUGIN_PATH, parseMeasurement } from '../src/lib/checks.js'

export const DATA_DIRECTORY = path.join(homedir(), '.local/share/techies-playground')
const CONTROL_PAGE = 'https://play.techies.tools/__private-runner__'
const PLAYGROUND = 'https://wp.techies.tools'
const DEADLINE_MS = 180_000

async function directories(root) {
  for (const name of ['', 'queued', 'running', 'finished', 'runs']) {
    await mkdir(path.join(root, name), { recursive: true, mode: 0o700 })
  }
}

async function json(file, value) {
  await writeFile(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
}

export async function enqueue(root = DATA_DIRECTORY) {
  await directories(root)
  const job = { id: randomUUID(), queuedAt: new Date().toISOString() }
  const pending = path.join(root, 'queued', `${job.id}.pending`)
  await json(pending, job)
  await rename(pending, path.join(root, 'queued', `${job.id}.json`))
  return job
}

export async function claim(root = DATA_DIRECTORY) {
  await directories(root)
  for (const name of (await readdir(path.join(root, 'queued'))).sort()) {
    if (!/^[a-f0-9-]{36}\.json$/.test(name)) continue
    try {
      // Atomic rename: only one worker can move this queued file.
      await rename(path.join(root, 'queued', name), path.join(root, 'running', name))
    } catch (error) {
      if (error.code === 'ENOENT') continue
      throw error
    }
    const job = JSON.parse(await readFile(path.join(root, 'running', name), 'utf8'))
    if (job.id !== name.slice(0, -5) || Object.keys(job).sort().join(',') !== 'id,queuedAt') {
      throw new Error('Invalid fixed proof job; retained in running for inspection.')
    }
    return job
  }
  return null
}

export function verdict(report) {
  return !report.blocker && report.boot?.status === 'completed'
    && report.queryMonitor?.status === 'completed'
    && report.queryMonitor.source === 'query-monitor'
    && report.queryMonitor.observations?.length === 6
    && report.queryMonitor.observations.every((value) => value.source === 'query-monitor')
    && report.codeProfiler?.status === 'completed'
    && report.codeProfiler.profileId
    && report.codeProfiler.attribution?.length > 0 ? 'go' : 'no-go'
}

export function reportHTML(report) {
  const escaped = JSON.stringify(report, null, 2).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Private runner proof</title><h1>Private runner: ${report.verdict === 'go' ? 'go' : 'no-go'}</h1><p>Playground / WebAssembly / SQLite sandbox diagnostics. No production hosting comparison.</p><pre>${escaped}</pre>\n`
}

export async function runOnce(root = DATA_DIRECTORY, execute = runBrowserProof) {
  const job = await claim(root)
  if (!job) return null
  const directory = path.join(root, 'runs', job.id)
  await mkdir(directory, { mode: 0o700 })
  const report = {
    schemaVersion: 1, job, startedAt: new Date().toISOString(),
    environment: { runtime: 'browser-playground', host: hostname(), platform: process.platform, architecture: process.arch, node: process.version, target: '/' },
    boot: { status: 'not-run' }, queryMonitor: { status: 'not-run' }, codeProfiler: { status: 'not-run' },
  }
  try {
    await execute(report)
  } catch (error) {
    report.blocker = error.message
    for (const stage of ['boot', 'queryMonitor', 'codeProfiler']) {
      if (report[stage].status === 'running') report[stage].status = 'blocked'
    }
  }
  report.finishedAt = new Date().toISOString()
  report.verdict = verdict(report)
  await json(path.join(directory, 'report.json'), report)
  await writeFile(path.join(directory, 'report.html'), reportHTML(report), { mode: 0o600, flag: 'wx' })
  await rename(path.join(root, 'running', `${job.id}.json`), path.join(root, 'finished', `${job.id}.json`))
  return report
}

async function runBrowserProof(report) {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true })
  let timeout
  try {
    report.environment.chromium = browser.version()
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 })
    const page = await context.newPage()
    report.environment.failedRequests = []
    page.on('requestfailed', (request) => {
      if (report.environment.failedRequests.length >= 10) return
      const url = new URL(request.url())
      report.environment.failedRequests.push({ resource: url.origin + url.pathname, error: request.failure()?.errorText })
    })
    page.setDefaultTimeout(30_000)
    // This one synthetic response exists only in this fresh browser. No server is
    // started and no content is written to either hosted site.
    await context.route(CONTROL_PAGE, (route) => route.fulfill({
      contentType: 'text/html', body: '<!doctype html><title>Private runner</title><iframe id="site"></iframe>',
    }))
    const work = (async () => {
      await page.goto(CONTROL_PAGE)
      report.boot = { status: 'running' }
      console.log('Starting a fresh browser Playground…')
      await page.evaluate(async ({ host, measure, measurePath }) => {
        const { startPlaygroundWeb } = await import(`${host}/client/index.js`)
        window.proofClient = await startPlaygroundWeb({
          iframe: document.querySelector('#site'), remoteUrl: `${host}/remote.html`,
          blueprint: {
            preferredVersions: { php: '8.3', wp: 'latest' }, login: true,
            features: { networking: true },
            steps: [
              { step: 'mkdir', path: '/wordpress/wp-content/mu-plugins' },
              { step: 'writeFile', path: measurePath, data: measure },
              { step: 'installPlugin', pluginData: { resource: 'wordpress.org/plugins', slug: 'query-monitor' } },
              { step: 'installPlugin', pluginData: { resource: 'wordpress.org/plugins', slug: 'code-profiler' } },
            ],
          },
        })
        await window.proofClient.isReady()
      }, { host: PLAYGROUND, measure: MEASURE_PLUGIN, measurePath: MEASURE_PLUGIN_PATH })
      const php = async (code) => page.evaluate(async (code) => (await window.proofClient.run({ code })).text, code)
      report.boot = { status: 'completed', ...JSON.parse(await php(`<?php require '/wordpress/wp-load.php'; require_once ABSPATH.'wp-admin/includes/plugin.php'; echo json_encode(['wordpress'=>get_bloginfo('version'),'php'=>PHP_VERSION,'plugins'=>array_map(fn($p)=>$p['Version'],get_plugins()),'active'=>get_option('active_plugins')]);`)) }
      console.log(`Booted WordPress ${report.boot.wordpress}, PHP ${report.boot.php}.`)
      report.queryMonitor = { status: 'running', source: 'query-monitor', observations: [] }
      for (let index = 0; index < 6; index++) {
        const response = await page.evaluate(async () => {
          const response = await window.proofClient.request({ url: '/?techies-measure=1', method: 'GET' })
          return { status: response.httpStatusCode, text: response.text }
        })
        if (response.status !== 200) throw new Error(`Query Monitor target returned HTTP ${response.status}.`)
        const observation = parseMeasurement(response.text)
        report.queryMonitor.observations.push({ phase: index === 0 ? 'cold' : 'warm', ...observation })
        if (observation.source !== 'query-monitor') throw new Error('Query Monitor collectors missing; launcher fallback is not proof.')
      }
      const times = report.queryMonitor.observations.slice(1).map((value) => value.time).sort((a, b) => a - b)
      Object.assign(report.queryMonitor, { status: 'completed', warmSeconds: { median: times[2], min: times[0], max: times[4] } })
      console.log('Query Monitor: one cold + five warm collector observations saved.')
      report.codeProfiler = { status: 'running', tier: 'free', target: '/' }
      await page.evaluate(() => window.proofClient.goTo('/wp-admin/admin.php?page=code-profiler'))
      const frame = page.frameLocator('#site').frameLocator('iframe')
      await frame.locator('#start-profile').waitFor()
      const target = new URL(await frame.locator('#id-frontend').inputValue())
      if (await frame.locator('input[name="x_end"]:checked').inputValue() !== 'frontend' || target.search || target.hash || target.pathname.replace(/^\/scope:[^/]+/, '') !== '/') {
        throw new Error('Code Profiler is not configured for the homepage; refusing another target.')
      }
      await frame.locator('#start-profile').click()
      // A client URL read is asynchronous. Wait for the native result chart in
      // the actual WordPress frame, so a pending call cannot count as success.
      const outcome = await Promise.race([
        frame.locator('#code-profiler-error').waitFor({ state: 'visible', timeout: 90_000 }).then(async () => ({ error: await frame.locator('#code-profiler-error').innerText() })),
        frame.locator('#myChart').waitFor({ state: 'visible', timeout: 90_000 }).then(() => ({ completed: true })),
      ]).catch(() => { throw new Error('Code Profiler showed neither a result nor an error within 90 seconds.') })
      if (outcome.error) {
        Object.assign(report.codeProfiler, { status: 'blocked', error: outcome.error })
        throw new Error(`Free Code Profiler failed: ${outcome.error}`)
      }
      const nativeProfileId = await page.evaluate(async () => new URL(await window.proofClient.getCurrentURL(), location.origin).searchParams.get('id'))
      const profile = JSON.parse(await php(`<?php require '/wordpress/wp-load.php'; $files=code_profiler_glob(CODE_PROFILER_UPLOAD_DIR,'[.]slugs[.]profile$',true); $f=end($files); if (!$f || !is_file(str_replace('.slugs.profile','.summary.profile',$f))) { echo '{}'; return; } $rows=[]; foreach(file($f,FILE_IGNORE_NEW_LINES) as $line) { $v=explode("\t",$line); if(count($v)!==4) { echo '{}'; return; } $rows[]=['slug'=>$v[0],'seconds'=>(float)$v[1],'name'=>$v[2],'type'=>$v[3]]; } echo json_encode(['artifact'=>basename($f,'.slugs.profile'),'attribution'=>$rows]);`))
      if (!nativeProfileId || !profile.artifact?.startsWith(nativeProfileId + '.') || !profile.attribution?.length) throw new Error('Profiler returned no matching saved summary and plugin/theme attribution.')
      Object.assign(report.codeProfiler, { profileId: nativeProfileId, attribution: profile.attribution, status: 'completed', export: 'Parsed native .slugs.profile; matching .summary.profile verified. No Pro export requested.' })
    })()
    await Promise.race([work, new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error('Browser proof exceeded 180 seconds; unfinished stages are not completed.')), DEADLINE_MS)
    })])
  } finally {
    clearTimeout(timeout)
    await browser.close()
  }
}

async function main() {
  const command = process.argv[2]
  if (process.argv.length !== 3 || !['enqueue', 'once'].includes(command)) {
    console.error('Usage: node scripts/private-runner.mjs enqueue|once')
    process.exitCode = 2
    return
  }
  if (command === 'enqueue') {
    console.log(`Queued ${ (await enqueue()).id }`)
    return
  }
  const report = await runOnce()
  if (!report) { console.log('No queued proof jobs.'); return }
  console.log(`Report: ${path.join(DATA_DIRECTORY, 'runs', report.job.id, 'report.json')}`)
  console.log(`RESULT: ${report.verdict === 'go' ? 'ok' : 'fail'} private-runner ${report.verdict}${report.blocker ? `: ${report.blocker}` : ''}`)
  process.exitCode = report.verdict === 'go' ? 0 : 1
}

const calledDirectly = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (calledDirectly) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1 })
}
