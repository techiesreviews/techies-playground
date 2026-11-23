#!/usr/bin/env node
// Replay a saved, non-secret AI response with an H2 title through the real browser pipeline.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { enqueue, runOnce, runBrowserProof } from './private-runner.mjs'
import { buildAndCapture, designReportHTML, validateDesign } from './design-runner.mjs'

if (process.argv.length !== 4) throw new Error('Usage: node scripts/design-runner-heading-check.mjs <answer.json> <private-output-directory>')
const answer = JSON.parse(await readFile(process.argv[2], 'utf8'))
let changed = 0
const decode = (block) => {
  const attributes = JSON.parse(block.attributes)
  if (block.name === 'core/heading' && attributes.content === 'Build something that lasts.') {
    attributes.level = 2
    changed++
  }
  return { ...block, attributes, innerBlocks: block.innerBlocks.map(decode) }
}
const design = validateDesign({ blocks: answer.blocks.map(decode), misses: [] })
assert.equal(changed, 1, 'The fixture must have exactly one sample title.')
const root = path.resolve(process.argv[3])
await enqueue(root)
const report = await runOnce(root, async (report, directory) => {
  report.kind = 'design-test'
  report.ai = { status: 'completed', route: 'Frozen AI response with an H2 title; browser regression only, no new AI generation.' }
  await runBrowserProof(report, { beforeChecks: (browser) => buildAndCapture(browser, report, directory, design) })
}, designReportHTML)
console.log(`Report: ${path.join(root, 'runs', report.job.id, 'report.html')}`)
assert.equal(report.verdict, 'go', report.blocker)
assert.ok(report.design.misses.some((miss) => miss.includes('H1')))
assert.equal(report.design.native.invalidBlocks, 0)
assert.equal(report.design.captures.length, 2)
assert.equal(report.queryMonitor.status, 'completed')
assert.equal(report.codeProfiler.status, 'completed')
console.log('RESULT: ok design-h2-regression native H2 reported as a miss; captures and both testers completed')
