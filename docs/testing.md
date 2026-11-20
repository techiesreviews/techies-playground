# Testing and verification

## Evidence rules

“Tested” means a named command or manual procedure was actually run and its observed result was recorded. Source inspection, expectation, and a passing unit test are different kinds of evidence and must not be conflated.

Each future change record should include:

- environment and date;
- exact command or numbered manual procedure;
- expected result;
- actual result;
- evidence link or captured output;
- disposition: kept, reworked, removed, rejected, or inconclusive.

## Automated commands

```powershell
npm ci
npm test
npm run build
git diff --check
```

For a deployment preparation, also run `npm run deploy:check`. Per the Release section of [the kitchen extras](agents/kitchen-extras.md#release), normal deployment happens only by landing verified changes on `dev` (agent work through a reviewed `scripts/agents/kit pr`, the WordPress sync PRs merged on GitHub) and releasing `dev` to `main` (`scripts/agents/kit pr --release --base main`); do not use direct Wrangler deployment unless explicitly requested.

## Current automated suite

The suite uses Node's built-in test runner and contains 252 tests in 34 files in the current working tree. `npm test` names its files (`src/**/*.test.js`, `scripts/*.test.mjs`), so a locally prepared `playground-host/dist` adds none.

Use the shared [Agent Kit](agents/agent-scripts.md): `scripts/agents/kit doctor`, `scripts/agents/kit unit` (the same files as `npm test`), and `scripts/agents/kit build`. The unit tests are Node tests only; browser specs and `kit shots` are not integrated. Real browser checks below use T3 separately and must not be inferred from the Node results.

| Test module | Coverage |
| --- | --- |
| `freemius-plugin.test.js` | Runs the Freemius must-use plugin in PHP 8.3 (php-wasm) against stubbed WordPress functions: `auth_date` from the `Date` header, the proxy opt-in for Authorization, calls sent straight to `/cors-proxy.php` on the site's scheme, host and port (direct to Freemius without a usable site address), only `api.`, `sandbox-api.` and `wp.freemius.com`, no double stamping, untouched string headers and preempted answers. |
| `recipe.test.js` | Stable IDs, version hints, labels, default storage, validation, advanced settings, Blueprint output (the Freemius plugin written before installs), directory installs, secret-field rejection, credential URL aliases, safe/unsafe persistence boundaries, public URL controls and external setup warnings. |
| `wordpress-versions.test.js` | Live version normalization, exact latest resolution, preserved saved versions, fetch contract. |
| `wordpress-org-plugins.test.js` | Slugs, normalized/sanitized results, entity decoding, artwork host allowlist, search and featured request parameters. |
| `wordpress-org-themes.test.js` | Slugs, HTTPS screenshot normalization, artwork host allowlist, search request. |
| `github-repository.test.js` | Public star-count normalization and the fixed Techies Playground repository API request. |
| `package-upload.test.js` | Plugin/classic/block-theme header classification, misleading filenames, invalid/nested/ambiguous archives, 150-file drop forwarding, text drags, nested drag state, leave reset and listener cleanup. |
| `vault.test.js` | Separate theme storage and IndexedDB transaction completion. |
| `license-vault.test.js` | Authenticated encryption round trip, wrong-password failure, deletion transaction completion, abort during clipboard read/decryption, active-session copy and missing-session rejection, newest key per requested package for the automatic fill, a second vault creation never overwriting the first, a key that no longer opens the vault (reset elsewhere) saving nothing. |
| `checks.test.js` | The two checks, a check counting only when its plugin (WordPress.org or uploaded, free or Pro) is in the setup, adding a check once, where results open, the checks must-use plugin, the page to measure (never another site), reading the measure plugin's numbers, the licence gate for the automatic run, each limit in `CHECK_LIMITS` turning a check amber or red, the verdict, and the screen-reader announcements. |
| `checks-php.test.js` | The checks must-use plugin in real PHP 8.3: each `techies-check` value prints only its own script, and nothing prints without one. The measure plugin reports counts and times but never query text or an address with a key in it, and does nothing on a normal page. |
| `plugin-updates.test.js` | Reading the updates answer (old and new version, failures, already current), a missing or odd answer, one `client.run` per launch, the bar note, label and count for each state, and the screen-reader announcement. |
| `plugin-updates-php.test.js` | The update code in real PHP 8.3 against stub WordPress: each offered plugin is updated, reported with its old and new version, and switched back on when it was active. |
| `license-fill.test.js` | Plugin folder from the install path, the key-only request body, the fill code reading keys from the body, result parsing and unknown statuses, saved-key packages, summary and plain-word labels, the fill run itself (one PHP request, locked vault, no folder, unreported plugin, errors cut to 200 characters, abort, a Lock while keys are read sends nothing, a PHP run that never answers ends when the launch closes, the record id of the key used). |
| `license-fill-php.test.js` | The fill code in real PHP 8.3 against stub WordPress and Freemius: each key reaches only its folder's Freemius instance (no prefix mix-ups), active licences are left alone, refusals and exceptions are reported with the key replaced by `[key]`, non-Freemius plugins are reported. |
| `vault-session.test.js` | The in-memory session key, lock, listeners, a launch's wait for an unlock, skip or close (and that it stops listening), a late unlock after its prompt closed being dropped. |
| `saved-recipes.test.js` | Upsert, rename-replace, safe round trip, invalid-record dropping. |
| `spinup-history.test.js` | Safe metadata, order/cap, invalid-record dropping, theme metadata, saved-environment deduplication. |
| `plugin-preferences.test.js` | Recency ordering, multi-field search, valid timestamp persistence and deletion. |
| `playground-persistence.test.js` | Unload warning, one-time storage-default migration, site identity/persistence labels, asking for persistent storage without waiting (Firefox keeps that request pending until the visitor answers). |
| `playground-preview.test.js` | Preview target validation, preserved query/fragment, modified clicks, external/download/ordinary navigation exclusions, direct popup mapping, standalone execution of the generated mu-plugin script. |
| `sync-wordpress-release.test.mjs` | Stable release selection, branch normalization, minor version bump, no-op and generated release edits. |
| `sync-playground-release.test.mjs` | The pinned Playground version, the patch bump, every Playground pin moving together with one changelog entry, no edits when already current, overrides dropped only when the release itself asks for that version or newer, kept Windows line endings, naming each package or upstream tag of a release that is not published yet, the outputs it writes for the workflow. |
| `check-playground-advisories.test.mjs` | Advisory version ranges (also hand-written ones: a bare version, `*`, pre-release bounds), naming the advisory whose range cannot be read, the installed Playground packages read from the lockfile, plus the packages the Playground host ships (client, remote, `@php-wasm/web` and the browser build of every PHP version the launcher offers) at the Blueprints pin, which advisories affect them (npm only, deduplicated, either patched-version field). |
| `playground-boot-check.test.mjs` | The boot Blueprint (the launcher's default setup with WP-CLI, a WP-CLI title change and the PHP report), the CLI arguments at the pinned version, and the checks on WordPress's answer. |
| `playground-release-workflows.test.mjs` | The Playground sync runs daily from `dev`, runs tests, build, npm audit, the advisory check, the boot test, `git diff --check` and a `git apply --check` of the Playground core patch on the new tag (a sparse clone of only the folders the patch touches; it fails without a PR if the patch no longer applies) before it opens one PR into `dev`; the job that checks the new packages has a read-only token, no git credentials and no cache, saves the patch before any new package code runs and runs that code only in a throwaway container (pinned image, no `.git`, no runner files or tokens), and the job that can write runs no package code; the workflow reads exactly the outputs the sync script writes; it closes older update PRs (deleting a branch only when the bot both wrote and committed its newest commit, and leaving PRs from forks alone, even under the update's branch name), does not reopen a closed one, keeps a fix someone pushed to the update branch along with the PR text, stops when it cannot read the branch, pushes only over the branch tip it checked (and fails with a clear message otherwise), lets only the three synced files through, and never deploys or targets `main`; the security checks run npm audit, the advisory check and (not on pushes) Dependabot alerts; every Playground package follows the Blueprints pin. |
| `playground-host.test.js` | The Playground host setting and its validation, client and remote URLs, loading the client with a readable failure, the two-minute start deadline that ends once WordPress runs. |
| `launcher-worker.test.mjs` | The launcher CSP allows scripts and frames from its own environment's Playground host and the public one, not the other environment's. |
| `prepare-playground-host.test.mjs` | Which Playground build files the host keeps (offered PHP and WordPress builds, offline-cache files, `remote.html` and the two pages it opens) or drops (the public website pages, even when the offline-cache list names them), the guard at the start of `remote.html` (starts only inside a launcher frame on another origin, otherwise stops before Playground's scripts; removes only website pages from Playground's caches, and agrees with the host build on which pages are website pages), the `_headers` rules (including `/wp-cli.phar` for other origins), pointing every hosted script and the launcher bundle at the host's own `wp-cli.phar` instead of `playground.wordpress.net`, refusing a host that links to `wp-cli.phar` without it or a script too large to rewrite that still links to `playground.wordpress.net`, splitting files above the per-file limit, the file-count limit. |
| `playground-host-worker.test.mjs` | Joining split files (GET, HEAD, cache headers, missing parts, manifest retry), 404 and 405 answers, routing to the CORS proxy. |
| `playground-host-cors-proxy.test.mjs` | Same-origin gate, `fetch()`-only gate (`Sec-Fetch-Dest: empty`; pages, frames, scripts, workers and images refused), target validation (schemes, credentials, private and reserved addresses, the host itself with or without a trailing dot), header rules, POST bodies, PUT, PATCH and DELETE for the Freemius licence API hosts only (with their bodies and every other protection), redirects through the proxy, authorized cross-origin redirects followed without Authorization, size cap for declared and streamed sizes, the per-visitor rate limit, unreachable targets, the `.php` proxy path, refusing URLs that contain `wordpress-static.zip`, uncompressed (`identity`) HEAD requests, GET ranges cut from the whole file (gzip-served text and `.gz` files, uncompressed streams of any size that stop reading at the end of the range, open, suffix, unsatisfiable, invalid, multiple and If-Range ranges, empty files, the 32 MiB in-memory limit, short bodies, ranges after a followed redirect), a range later in an uncompressed file with a strong ETag taken from the target's own exact answer (sent with If-Range; answers with another ETag, of another size, compressed, shifted or failed fall back to the whole-file cut; a weak ETag, only Last-Modified or none makes no range request), dropping `Clear-Site-Data`, `NEL`, `Report-To` and `Set-Login` from answers. |
| `deploy-workflow.test.mjs` | Every Cloudflare deploy job in `deploy-site.yml` needs the `test` and `security` jobs, the `test` job runs `npm ci` and `npm test`, the `security` job runs `npm audit --audit-level=high` and the Playground advisory check, the Playground build reaches the host job as an artifact of the same run and no job uses `actions/cache`, and the Playground build's `CORS_PROXY_URL` matches the path the host answers. Before the deploy, the host job refuses a host folder with `index.html` or any page but the three launcher pages; after it, it checks the host answers 404 for `index.html`. The Playground build downloads `playground-host/playground-core.patch` by commit, checks its hash and applies it before `npm ci`, and the patch still changes the request-body code it fixes. |

The suite does not render React components or start WordPress Playground. It proves pure contracts, not full browser behavior.

## Manual smoke matrix

For selected directory plugins, search `query monitor`, select Query Monitor, and clear search. Its selected row and summary name must remain visible; changing the query must retain the name. Select a featured plugin too and verify two selected packages without a duplicate featured row at empty search. Refresh and confirm the non-featured selected slug remains visible/removable even without cached metadata. Remove it and verify the recipe, selected count, and summary update. See [the 2026-10-17 red/green evidence and mobile check](changes/2026-10-17-selected-directory-plugins.md). This UI check does not start WordPress or establish the cause of a runtime hiccup.

Use synthetic ZIPs/test packages and non-production vendor licenses.

| Area | Procedure | Expected result |
| --- | --- | --- |
| Initial state | Clear origin data and load the app. | Browser storage is default, saved library/history are empty, featured plugins load or show a non-blocking failure. |
| Responsive shell | Inspect at 320 px, tablet, and desktop. | No horizontal page overflow; summary stacks then becomes sticky two-column; tabs remain scrollable. |
| GitHub star button | Load the header at mobile and desktop widths, then activate it with pointer and keyboard. | The site-styled control appears immediately before the changelog, targets `techiesreviews/techies-playground`, shows the public count when available, remains a usable link without the count, and does not overflow the header. |
| Keyboard | Traverse header, environment, tabs, rows, and dialogs using keyboard only. | Visible focus, meaningful names, Escape/outside-close behavior, correct focus restoration. |
| Local plugin | Upload valid and invalid ZIP files, select, replace with versioned filename, refresh. | Invalid signature rejected; valid File persists; internal ID stays stable across replacement but is not repeated on the card; metadata starts on a dash-free second line; selected card uses the featured-plugin teal surface/ring and check-circle while replace and delete stay operable. |
| Directory plugin | Search with 0, 1, and 2+ characters and select a result. | Empty query orders featured plugins before uploads; 1 character orders uploads before the hint; 2+ characters orders uploaded matches before debounced official results; selected slug persists in recipe and uses the same teal surface/ring and check-circle in featured and search views. |
| Theme exclusivity | Alternate default, local, and directory themes. | Exactly one source is selected; opposing theme field is cleared. |
| Recipe | Save, rename-update, export, import, remove a required ZIP, launch. | No duplicate old name; JSON is normalized/secret-free; missing ZIP blocks launch with ID. |
| Latest WordPress | Launch `latest` with network available, then simulate version API failure. | Exact version is verified when available; launch fails closed if latest cannot be confirmed. |
| Temporary site | Launch, change WordPress, attempt refresh and close. | Browser unload warning and in-app discard confirmation appear. |
| Saved site | Launch new browser-saved site, change content, close, relaunch same identity. | Content resumes; one-time imports/Multisite are not repeated. |
| Preview tabs | Ctrl/Cmd-click or middle-click an internal link; open a `_blank` preview; close the original runtime. Repeat on a resumed site. | A launcher-origin tab displays the same WordPress site, including preview query parameters; closing the owner replaces the iframe with an explanation. Test Firefox/Safari and native popup behavior separately; the initial Chromium smoke used a synthetic Ctrl-click with intercepted `window.open`, then opened the captured URL through browser tooling. |
| Identity change | Change recipe name, exact WordPress, or PHP and launch. | A distinct OPFS environment is used. |
| Packages | Launch local and directory plugins plus local/directory theme. | Plugins activate; selected theme is active; local theme verification passes. |
| History | Launch temporary and saved configurations repeatedly. | Newest first, max 30, saved identity deduplicated, status labels correct. |
| One-click start, keys, Checks | Upload a free Freemius plugin ZIP, Add key with a fake key, add Query Monitor and Code Profiler in Checks, save the recipe, reload, press Start, unlock once. Open Checks for each tool. Repeat in Firefox with Save playground in browser on. | The stored ZIP installs and activates; Licenses shows `0 of 1 active` and the manager shows Freemius's refusal; Query Monitor's panel opens; Code Profiler's page opens without the Query Monitor panel and profiles. See [the change record](changes/2026-11-14-one-click-start-keys-checks.md). |
| Updates at start, Checks panel | Launch a setup with Query Monitor, Code Profiler and an outdated WordPress.org plugin, networking on. Watch the bar, open Updates, open Checks, press Run again and Open in Code Profiler, press Escape twice. Repeat at 375 px wide. Then launch with a plugin that has a saved key and press Skip at the unlock prompt. | The plugin is updated and still on, and Updates names it with old and new version. The checks run by themselves; the panel shows a verdict and four tiles (2 by 2 at 375 px), Run again remeasures, Open in Code Profiler opens its page, Escape closes the menu before the panel. With the skipped key, the checks do not start and Checks says `0 of 1 active`. See [the change record](changes/2026-11-20-updates-at-start-and-checks-panel.md). |
| Snapshot | Export after setup. | A readable `<name>-wp-content.zip` downloads. |
| License vault | Create, wrong-password unlock, add, lock, unlock, copy, delete, reset. | Ciphertext persists; wrong password fails; plaintext appears only in field/clipboard; reset deletes all entries. |
| Failure cleanup | Interrupt or fail runtime/package setup. | Iframe blanks, shell closes, client is invalidated, error remains visible in launcher. |
| Playground never ready | Point a launcher build at a host whose `remote.html` answers 403 (as the upstream bot check did). | After two minutes the shell closes and the launcher shows "WordPress Playground did not start within 2 minutes. Check your connection, then launch again." |

### Self-hosted Playground host

`node scripts/playground-boot-check.mjs` boots the pinned Playground release once in Node (`@wp-playground/cli` at the same version, the launcher's default setup plus WP-CLI) and checks what WordPress reports; the Playground sync runs it before it opens an update PR. Its name must not end in `-test.mjs`, or a bare `node --test` would run it. `node scripts/check-playground-advisories.mjs` checks the installed Playground packages, and the packages the self-hosted Playground ships at the pinned version, against published advisories. Both need network access; neither is part of `npm test`. The `Security checks` workflow runs `npm audit --audit-level=high`, the advisory check and open high or critical Dependabot alerts daily (see [the change record](changes/2026-11-20-playground-release-sync-and-security-checks.md)).

A local run needs the built Playground website (see [the change record](changes/2026-11-14-self-hosted-playground.md)): prepare it with `node scripts/prepare-playground-host.mjs <build> playground-host/dist --launcher-origin http://127.0.0.1:4173`, serve it with `npx wrangler dev --config playground-host/wrangler.jsonc --env preview --port 8787`, then build the launcher with `VITE_PLAYGROUND_ORIGIN=http://127.0.0.1:8787 npx vite build` and serve it with `npx vite preview`. The Vite dev server reloads the page when Playground starts, so use the built launcher for this check. On the deployed preview, launch plain WordPress, a launch with an uploaded plugin ZIP, and a resumed browser-saved site in Chromium and Firefox. Headless Firefox needs its persistent-storage prompt answered (`dom.storageManager.prompt.testing` and `dom.storageManager.prompt.testing.allow`).

## Deployment verification

Latest verified production release: 0.8.3, GitHub run `39069273010`, deployment commit `2b65d41e31f6871afd9808c3176611f8963ded73`. The run passes 65 tests, build and Cloudflare publication; the public module identifies 0.8.3, and live T3 selection/clear-search/removal assertions pass. See [the token retry and exact evidence](changes/2026-10-17-release-0.8.3-token-retry.md). The retry did not execute a full WordPress boot or the user's Vivaldi profile.

After a release to `main` (its deploy run):

1. Confirm the GitHub `Deploy production` run belongs to the pushed commit.
2. Confirm install, tests, build, and Wrangler steps succeed.
3. Open `https://play.techies.tools` and check title, current changelog version, and a non-destructive launch/search smoke.
4. Inspect response headers for the CSP and other headers defined in `worker.js`.
5. Record the run URL, live check result, and any rollback/follow-up in the change record.

## Runtime download investigation (2026-10-13)

Latest resolves to WordPress 7.1.3, but the isolated browser reproduced `Failed to fetch` at the remote worker's exact core ZIP download in both the live launcher and `https://playground.wordpress.net/?wp=7.1.3`. Terminal HTTP 200 and a successful main-thread archive fetch did not establish worker-readable bytes or successful boot. The reported service-worker 403 was not reproduced: current `sw.js` returned HTTP 200 and its update completed. See [the complete investigation and limitations](changes/2026-10-13-playground-download-failure.md).

To replay the minimized worker probe, open `https://playground.wordpress.net/remote.html` and run this in its page JavaScript context. The investigation used browser automation to evaluate equivalent inline JavaScript; no helper script was retained. The timeout bounds the probe and `finally` releases the worker and Blob URL. It asserts the exact fetch rejection separately from unrelated worker errors. Run an ordinary main-thread fetch of the same URL separately to compare contexts. An opaque `no-cors` response cannot supply a ZIP for boot.

```js
await (async () => {
  const url = 'https://wordpress-playground-cors-proxy.net/?https://wordpress.org/wordpress-7.1.3.zip'
  const source = `onmessage = async ({ data: url }) => {
    try {
      const response = await fetch(url, { cache: 'no-store' })
      const bytes = (await response.arrayBuffer()).byteLength
      postMessage({ origin: self.origin, status: response.status, bytes })
    } catch (error) {
      postMessage({ origin: self.origin, name: error.name, error: error.message })
    }
  }`
  const workerUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
  const worker = new Worker(workerUrl)
  let timeout
  try {
    const result = await new Promise((resolve, reject) => {
      timeout = setTimeout(() => reject(new Error('Worker probe timed out')), 30000)
      worker.onmessage = ({ data }) => resolve(data)
      worker.onerror = (event) => reject(new Error(event.message))
      worker.postMessage(url)
    })
    console.log(result)
    if (result.error === 'Failed to fetch') {
      throw new Error('Reproduced: worker core download rejected with Failed to fetch')
    }
    if (result.error || result.status !== 200 || result.bytes <= 0) {
      throw new Error('Worker probe encountered a different failure')
    }
    return result
  } finally {
    clearTimeout(timeout)
    worker.terminate()
    URL.revokeObjectURL(workerUrl)
  }
})()
```

The documentation snippet is a replay procedure, not an automated regression test or proof that a runtime fix exists. No runtime code changed during this investigation. Its original coverage did not include Firefox, Safari, successful 7.1.3 boot, or OPFS resume.

### Standalone Firefox comparison

In a subsequent fresh-context Playwright 1.64.0 run, Firefox 157.0 boots `https://playground.wordpress.net/?wp=7.1.3`. A second fresh boot confirms the scoped site's generator is `WordPress 7.1.3`; additional About-page navigation times out after 30 seconds. Main-thread and Blob-worker probes both read the full 37,226,383-byte core ZIP with HTTP 200. Cached WebKit could not start because `libevent-2.1.so.7` was missing. No network configuration was changed; identical T3 and standalone-browser network paths were not verified. See [the comparison and exact limitations](changes/2026-10-13-playground-firefox-comparison.md). This verifies the official Playground in Firefox, not the launcher's embedded Firefox flow, OPFS resume, or the cause of the original Chromium failure.

### Standalone Chromium comparison

A subsequent standalone Google Chrome 155.0.8059.39 run through Playwright 1.64.0 also boots the exact official release and verifies `WordPress 7.1.3` in the scoped frontend generator. Its sandbox is enabled; no custom launch arguments or security/network overrides are used. Main-thread and Blob-worker fetches both read 37,226,383 ZIP bytes with HTTP 200. The proxy's allowed origin matches the request origin; a Blob-worker request succeeds without a `Referer`. See [the comparison](changes/2026-10-13-playground-standalone-chromium.md). A universal Chromium failure is not established, and differences between T3 and standalone environments remain unisolated. No application fix is claimed.

Two bounded follow-ups pass: cached standalone Chrome for Testing 153.0.8010.12 boots the same official release, and fresh standalone Chrome 155.0.8059.39 launches `latest` on `play.techies.tools` with browser storage unchecked and no packages selected. The live launcher shows `Ready on WordPress 7.1.3. Activate licenses inside WordPress when needed.` after its PHP version check. Its admin frame has no generator meta value. This demonstrates a working temporary setup, not an OPFS/package test or a proven upgrade/profile repair for the user's original failure. The cached build is not the T3 browser's reported version 154.0.8037.92.

### Vivaldi comparison limitation

The user reports latest Vivaldi with `No blocking` for the launcher and local use on Ubuntu and Windows. The current official Linux asset, Vivaldi 8.2.4133.84, was extracted without system installation for a bounded comparison. Headless Playwright startup never produces a page, including a persistent-profile attempt and a final wrapper-environment correction; native processes exit with `SIGSEGV`. This is a test-environment limitation, not an executed Vivaldi Playground failure. No Vivaldi service-worker response, core ZIP response, user-agent version, shield state, or WordPress readiness result is established. See [the attempted comparison and cleanup](changes/2026-10-13-vivaldi-comparison-blocked.md). The user's exact operating-system versions and normal interactive Vivaldi profiles were not duplicated; VPN/extension status and identical failures on both systems remain unconfirmed.

## Known coverage gaps at the 2026-08-28 baseline

- No component, accessibility automation, screenshot regression, or end-to-end browser tests.
- No automated WordPress Playground launch, OPFS resume, snapshot, or update-all test.
- No automated Cloudflare header assertion.
- IndexedDB tests use focused fakes and do not exercise every browser lifecycle/blocked-upgrade condition.
- The local collaborative-browser snapshot failed during this documentation pass, so visual conformance was inspected from source rather than claimed as a browser-tested result.
- CI moved from Node 22 to Node 24 on 2026-11-07; the build passed on Linux under Node 24.22.2 (see `docs/changes/2026-11-07-ci-node-24.md`). The Windows Node 24.15.0 stall was not re-tested on Windows and is still unexplained.

## Security remediation evidence (2026-09-10)

See [0.7.1 remediation and release](changes/2026-09-10-security-fixes.md). Chromium checks used a separate localhost:4174 origin and synthetic data: unsafe drafts were not stored, accepted external imports opened Advanced settings, canceled imports/launches had no execution side effects, WordPress 7.1 launched, normal vault unlock/lock worked, and a delayed unlock after close left its key ref null. UI events and dialog responses were driven programmatically. Firefox/Safari behavior was not rerun. Run `npm audit` alongside the normal deployment checks when changing dependencies.

## Page-wide upload checks (2026-09-16)

`npm test`: 62 passed. `npm run build`: passed with a large-chunk warning. Automated drag checks use Node EventTarget, not rendered browser events. Manual follow-up: drag a mixed batch over header, controls, whitespace and dialogs; verify overlay, cancellation, individual errors, selections, persistence after refresh, and successive batches. Cross-origin iframe-first drags require a separate browser check; the parent cannot receive events originating inside that frame.

### Live release verification

A subsequent isolated Chromium smoke on production passed: synthetic drag events displayed the upload-box; a compressed plugin ZIP, invalid middle file, and two compressed theme ZIPs produced one plugin and two themes in their correct IndexedDB stores. Reload preserved plugin selection and the last theme selection with no directory theme. No page errors occurred. See [deployment evidence](changes/2026-09-16-release-0.8.0-deployed.md). This supplements the earlier unit/build-only evidence; physical OS drag and Firefox/Safari were not tested.
