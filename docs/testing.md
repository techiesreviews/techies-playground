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

The suite uses Node's built-in test runner and contains 63 tests in 14 files in the current working tree.

Use the shared [Agent Kit](agents/agent-scripts.md): `scripts/agents/kit doctor`, `scripts/agents/kit unit` (the same files as `npm test`), and `scripts/agents/kit build`. The unit tests are Node tests only; browser specs and `kit shots` are not integrated. Real browser checks below use T3 separately and must not be inferred from the Node results.

| Test module | Coverage |
| --- | --- |
| `recipe.test.js` | Stable IDs, version hints, labels, default storage, validation, advanced settings, Blueprint output, directory installs, secret-field rejection, credential URL aliases, safe/unsafe persistence boundaries, public URL controls and external setup warnings. |
| `wordpress-versions.test.js` | Live version normalization, exact latest resolution, preserved saved versions, fetch contract. |
| `wordpress-org-plugins.test.js` | Slugs, normalized/sanitized results, entity decoding, artwork host allowlist, search and featured request parameters. |
| `wordpress-org-themes.test.js` | Slugs, HTTPS screenshot normalization, artwork host allowlist, search request. |
| `github-repository.test.js` | Public star-count normalization and the fixed Techies Playground repository API request. |
| `package-upload.test.js` | Plugin/classic/block-theme header classification, misleading filenames, invalid/nested/ambiguous archives, 150-file drop forwarding, text drags, nested drag state, leave reset and listener cleanup. |
| `vault.test.js` | Separate theme storage and IndexedDB transaction completion. |
| `license-vault.test.js` | Authenticated encryption round trip, wrong-password failure, deletion transaction completion, abort during clipboard read/decryption, active-session copy and missing-session rejection. |
| `saved-recipes.test.js` | Upsert, rename-replace, safe round trip, invalid-record dropping. |
| `spinup-history.test.js` | Safe metadata, order/cap, invalid-record dropping, theme metadata, saved-environment deduplication. |
| `plugin-preferences.test.js` | Recency ordering, multi-field search, valid timestamp persistence and deletion. |
| `playground-persistence.test.js` | Unload warning, one-time storage-default migration, site identity/persistence labels. |
| `playground-preview.test.js` | Preview target validation, preserved query/fragment, modified clicks, external/download/ordinary navigation exclusions, direct popup mapping, standalone execution of the generated mu-plugin script. |
| `sync-wordpress-release.test.mjs` | Stable release selection, branch normalization, minor version bump, no-op and generated release edits. |

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
| Snapshot | Export after setup. | A readable `<name>-wp-content.zip` downloads. |
| Update all | Use a package with an available safe test update. | Success/failure summary matches WordPress result and UI returns to Plugins. |
| License vault | Create, wrong-password unlock, add, lock, unlock, copy, delete, reset. | Ciphertext persists; wrong password fails; plaintext appears only in field/clipboard; reset deletes all entries. |
| Failure cleanup | Interrupt or fail runtime/package setup. | Iframe blanks, shell closes, client is invalidated, error remains visible in launcher. |

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
- A local Node 24.15.0 build stalled while importing the Tailwind Vite plugin; CI uses Node 22. Treat this as an environment-specific inconclusive result until reproduced or cleared on the supported CI runtime.

## Security remediation evidence (2026-09-10)

See [0.7.1 remediation and release](changes/2026-09-10-security-fixes.md). Chromium checks used a separate localhost:4174 origin and synthetic data: unsafe drafts were not stored, accepted external imports opened Advanced settings, canceled imports/launches had no execution side effects, WordPress 7.1 launched, normal vault unlock/lock worked, and a delayed unlock after close left its key ref null. UI events and dialog responses were driven programmatically. Firefox/Safari behavior was not rerun. Run `npm audit` alongside the normal deployment checks when changing dependencies.

## Page-wide upload checks (2026-09-16)

`npm test`: 62 passed. `npm run build`: passed with a large-chunk warning. Automated drag checks use Node EventTarget, not rendered browser events. Manual follow-up: drag a mixed batch over header, controls, whitespace and dialogs; verify overlay, cancellation, individual errors, selections, persistence after refresh, and successive batches. Cross-origin iframe-first drags require a separate browser check; the parent cannot receive events originating inside that frame.

### Live release verification

A subsequent isolated Chromium smoke on production passed: synthetic drag events displayed the upload-box; a compressed plugin ZIP, invalid middle file, and two compressed theme ZIPs produced one plugin and two themes in their correct IndexedDB stores. Reload preserved plugin selection and the last theme selection with no directory theme. No page errors occurred. See [deployment evidence](changes/2026-09-16-release-0.8.0-deployed.md). This supplements the earlier unit/build-only evidence; physical OS drag and Firefox/Safari were not tested.
