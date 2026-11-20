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

test('the host job refuses to deploy, and checks it does not serve, the public Playground website', async () => {
  const host = readJobs(await readFile(workflowPath, 'utf8'))['playground-host'] ?? ''
  const guard = host.indexOf('test ! -e playground-host/dist/index.html')
  assert.ok(guard !== -1, 'the prepared folder is checked for index.html')
  assert.ok(guard < host.indexOf('cloudflare/wrangler-action'), 'the check runs before the deploy')
  const pages = host.indexOf('"./remote.html ./wordpress-bridge.html ./wordpress-popup.html "')
  assert.ok(pages !== -1 && pages < host.indexOf('cloudflare/wrangler-action'), 'only the launcher pages are deployed')
  assert.match(host, /index_status="\$\(curl [^\n]*"\$PLAYGROUND_ORIGIN\/index\.html"\)"\n\s*test "\$index_status" = 404/, 'the deployed host answers 404 for index.html')
})

const patchPath = 'playground-host/playground-core.patch'

test('the Playground build applies our core patch and keys its cache on the patch hash', async () => {
  const jobs = readJobs(await readFile(workflowPath, 'utf8'))
  const settings = jobs.settings ?? ''
  const build = jobs['playground-build'] ?? ''
  const host = jobs['playground-host'] ?? ''

  assert.ok(settings.includes(`            ${patchPath}\n`), 'the settings job checks out the patch')
  assert.ok(settings.includes(`sha256sum ${patchPath}`), 'the settings job hashes the patch')
  assert.ok(settings.includes('playground_patch_sha256: ${{ steps.patch.outputs.sha256 }}\n'), 'the settings job outputs the hash')

  const key = 'key: playground-website-${{ needs.settings.outputs.playground_version }}-cors-proxy-v2-patch-${{ needs.settings.outputs.playground_patch_sha256 }}\n'
  assert.ok(build.includes(key), 'the build cache key names the patch hash')
  assert.ok(host.includes(key), 'the host job restores the same key')

  // The build job has no token and no checkout of our repository; it downloads the patch
  // by commit, checks it against the hash, and applies it before upstream installs anything.
  assert.match(build, /^ {4}permissions: \{\}$/m)
  assert.doesNotMatch(build, /actions\/checkout/)
  const steps = [
    'git clone --branch "v${PLAYGROUND_VERSION}"',
    `https://raw.githubusercontent.com/\${GITHUB_REPOSITORY}/\${GITHUB_SHA}/${patchPath}`,
    'sha256sum --check --strict',
    'git apply ',
    'npm ci --no-audit --no-fund',
  ].map((text) => [text, build.indexOf(text)])
  for (const [text, index] of steps) assert.ok(index !== -1, `the build runs: ${text}`)
  for (let i = 1; i < steps.length; i++) {
    assert.ok(steps[i - 1][1] < steps[i][1], `${steps[i - 1][0]} runs before ${steps[i][0]}`)
  }
  assert.ok(build.includes('PATCH_SHA256: ${{ needs.settings.outputs.playground_patch_sha256 }}\n'), 'the build gets the expected hash')
})

test('the Playground core patch keeps request bodies when the browser cannot stream them', async () => {
  const patch = await readFile(new URL(`../${patchPath}`, import.meta.url), 'utf8')
  const files = [...patch.matchAll(/^diff --git a\/(\S+)/gm)].map((match) => match[1])
  for (const file of [
    'packages/php-wasm/web-service-worker/src/lib/utils.ts',
    'packages/php-wasm/web-service-worker/src/lib/fetch-with-cors-proxy.ts',
    'packages/php-wasm/web/src/lib/tcp-over-fetch-websocket.ts',
  ]) {
    assert.ok(files.includes(file), `the patch changes ${file}`)
  }
  assert.ok(patch.includes('+\t\t\t\tclonedRequest.body instanceof ReadableStream'), 'the proxy retry reads the body when the clone has no stream')
  assert.ok(patch.includes('+\t\tif (!(request.body instanceof ReadableStream)) {'), 'the stream probe fails when Request.body is missing')
  assert.ok(patch.includes('bodyToBuffer'), 'the TCP fetch buffers the body instead of streaming it')
})
