// Evidence driver for docs/changes/2026-11-14-freemius-licence-activation.md, not part of
// the test suite. Needs Playwright (npm i playwright; npx playwright install chromium firefox)
// and the probe plugin zipped as techies-freemius-probe/techies-freemius-probe.php.
// Usage: node launch-probe.mjs <chromium|firefox> <launcher URL> <probe|plain|zip> <probe ZIP> <work folder>
//   probe: a temporary site with the probe ZIP and FooGallery (Freemius SDK) from WordPress.org;
//          prints what the probe's signed GET and PUT with a fake key got back.
//   plain: a temporary site with no packages.   zip: a temporary site with the probe ZIP only.
import { chromium, firefox } from 'playwright'
import { writeFileSync } from 'node:fs'
const [browserName = 'chromium', base = 'https://preview-play.techies.tools', mode = 'probe', zip, work = '.'] = process.argv.slice(2)
const S = `${work}/`
const recipes = {
  probe: { schemaVersion: 1, name: 'Freemius probe', storage: 'temporary', plugins: ['techies-freemius-probe'], repositoryPlugins: ['foogallery'] },
  plain: { schemaVersion: 1, name: 'Plain launch', storage: 'temporary', plugins: [], repositoryPlugins: [] },
  zip: { schemaVersion: 1, name: 'Zip launch', storage: 'temporary', plugins: ['techies-freemius-probe'], repositoryPlugins: [] },
}
const recipeFile = `${S}recipe-${mode}.json`
writeFileSync(recipeFile, JSON.stringify(recipes[mode]))
const browser = await (browserName === 'firefox' ? firefox : chromium).launch()
const page = await browser.newPage()
const problems = []
page.on('dialog', (d) => d.accept())
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text().slice(0, 200)}`) })
page.on('requestfailed', (r) => problems.push(`failed: ${r.method()} ${r.url().slice(0, 160)} ${r.failure()?.errorText}`))
page.on('response', (r) => { if (r.status() >= 400) problems.push(`http ${r.status()}: ${r.request().method()} ${r.url().slice(0, 160)}`) })
const t0 = Date.now()
await page.goto(base, { waitUntil: 'networkidle' })
if (mode !== 'plain') await page.setInputFiles('input[name="plugin-zips"]', zip)
await page.waitForTimeout(1500)
await page.setInputFiles('input[name="recipe"]', recipeFile)
await page.waitForTimeout(1500)
await page.getByRole('button', { name: /^Launch / }).first().click()
const isWpAdmin = (f) => /\/scope:[^/]+\/wp-admin\//.test(f.url())
let wp
for (let i = 0; i < 240 && !wp; i++) {
  wp = page.frames().find(isWpAdmin)
  if (!wp) await page.waitForTimeout(1000)
}
if (!wp) { console.log(JSON.stringify({ ok: false, reason: 'no wp-admin frame', problems }, null, 1)); await browser.close(); process.exit(1) }
// Wait for the launcher to finish installing local packages.
await page.waitForFunction(() => !document.body.innerText.includes('Installing '), null, { timeout: 180000 }).catch(() => {})
await page.waitForTimeout(3000)
const result = { browser: browserName, base, mode, seconds: Math.round((Date.now() - t0) / 1000), wpUrl: wp.url() }
const plugins = await wp.evaluate(async () => { const r = await fetch(location.href.replace(/wp-admin\/.*/, 'wp-admin/plugins.php')); const t = await r.text(); return [...t.matchAll(/<tr class="(active|inactive)[^"]*"[^>]*data-plugin="([^"]+)"/g)].map((m) => `${m[2]}:${m[1]}`) })
result.plugins = plugins
if (mode === 'probe') {
  const text = await wp.evaluate(async () => { const r = await fetch(location.href.replace(/wp-admin\/.*/, 'wp-admin/?techies_freemius_probe=1')); return r.text() })
  const at = text.indexOf('TECHIES_PROBE:')
  result.probe = at >= 0 ? JSON.parse(text.slice(at + 14)) : text.slice(0, 500)
}
result.problems = problems
console.log(JSON.stringify(result, null, 1))
await browser.close()
