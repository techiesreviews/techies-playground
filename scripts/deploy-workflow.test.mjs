import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { CORS_PROXY_PATH } from '../playground-host/cors-proxy.js'

const workflowPath = new URL('../.github/workflows/deploy-site.yml', import.meta.url)

// Splits the top-level `jobs:` map into { name: block text } by its two-space keys, without comments.
function readJobs(source) {
  const jobsSection = source.slice(source.indexOf('\njobs:\n'))
  const jobs = {}
  let current = null
  for (const line of jobsSection.split('\n').slice(2)) {
    if (/^\s*#/.test(line)) continue
    const key = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line)
    if (key) {
      current = key[1]
      jobs[current] = ''
    } else if (current) {
      jobs[current] += `${line}\n`
    }
  }
  return jobs
}

function readNeeds(block) {
  const match = /^ {4}needs:\s*(.+)$/m.exec(block)
  if (!match) return []
  return match[1].replace(/[[\]]/g, '').split(',').map((name) => name.trim()).filter(Boolean)
}

test('every job that deploys to Cloudflare needs the test job', async () => {
  const jobs = readJobs(await readFile(workflowPath, 'utf8'))
  const deployJobs = Object.keys(jobs).filter((name) => jobs[name].includes('cloudflare/wrangler-action'))
  assert.deepEqual(deployJobs.sort(), ['launcher', 'playground-host'])
  for (const name of deployJobs) {
    assert.ok(readNeeds(jobs[name]).includes('test'), `${name} must list test in needs`)
  }
})

test('the test job installs the locked dependencies and runs the tests', async () => {
  const jobs = readJobs(await readFile(workflowPath, 'utf8'))
  assert.match(jobs.test ?? '', /run: npm ci\n/)
  assert.match(jobs.test ?? '', /run: npm test\n/)
  assert.doesNotMatch(jobs.test ?? '', /wrangler-action|secrets\./)
})

test('the Playground build points its CORS proxy at the path the host answers', async () => {
  const jobs = readJobs(await readFile(workflowPath, 'utf8'))
  assert.ok((jobs['playground-build'] ?? '').includes(`CORS_PROXY_URL: ${CORS_PROXY_PATH}?\n`), 'the build uses the proxy path')
  assert.ok((jobs['playground-host'] ?? '').includes(`'"${CORS_PROXY_PATH}?"'`), 'the host job checks the build uses the proxy path')
})
