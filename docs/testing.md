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

The [Gutenberg design proof](design-runner.md) adds native-tree rejection, score,
escaping, persisted display states, plain-word misses, design-completion gates and quota handling in `scripts/design-runner.test.mjs`.
The quota test injects a CLI usage-limit response into the real generation flow, checks
the saved paused HTML/JSON, and forbids browser execution. It does not exhaust a live
subscription. `node scripts/design-runner.mjs enqueue`, then `once`, runs the real
signed-in AI, Gutenberg serializer/REST/readback, captures and both testers without
an open user tab. The 2026-11-23 proof and exact evidence are in
`changes/2026-11-23-gutenberg-design-test.md`.
`scripts/private-runner.test.mjs` also executes the actual measurement orchestration
with injected requests: native save first, cold/five warm requests next, screenshot
render last. A failed measurement must never start capture. The committed
`scripts/design-runner-heading-check.mjs` exercises the real H2 browser regression
with a saved AI response; see the run guide for its two private path arguments.

`node scripts/design-report-check.mjs .scratch/design-report-check` runs a separate
Chromium report check: 12 theme/width/state combinations, real fixture PNG differences,
keyboard/pointer comparisons, disclosures, offline assets, JavaScript-disabled image access, 200% phone text and motion preferences.
Home/End checks at both widths and themes verify a 44 px hit-testable handle and an
unclipped focus ring, with endpoint screenshots and `slider-ends.json`.
`scripts/design-runner.test.mjs` also covers visible layout notes (including mixed
semantic/layout notes), neutral notes when captures meet the 99% threshold, and
98.96/98.99/99/100% display boundaries in all score locations. The browser check
also verifies that switching to the phone keeps the footer never above its measured score.
It uses injected tester observations and no private run data, AI or WordPress. The
before/prototype/after comparison evidence is in
`changes/2026-11-24-design-report-look.md`.
The endpoint and score regression evidence is in
`changes/2026-11-24-design-report-review-fixes.md`.

The independent [private runner proof](private-runner.md) has queue-concurrency,
partial-failure, permission, HTML-escaping and real-collector/artifact gate coverage in
`scripts/private-runner.test.mjs`. These unit checks do not prove hosted Playground or
Code Profiler compatibility. Run `node scripts/private-runner.mjs enqueue`, then
`node scripts/private-runner.mjs once` for the separate, real headless attempt; retain
its private reports and distinguish a completed profile from a no-go.

The suite uses Node's built-in test runner and contains 423 tests in 43 files in the current working tree. `npm test` names its files (`src/**/*.test.js`, `scripts/*.test.mjs`), so a locally prepared `playground-host/dist` adds none.

Use the shared [Agent Kit](agents/agent-scripts.md): `scripts/agents/kit doctor`, `scripts/agents/kit unit` (the same files as `npm test`), and `scripts/agents/kit build`. The unit tests are Node tests only; browser specs and `kit shots` are not integrated. Real browser checks below use T3 separately and must not be inferred from the Node results.

| Test module | Coverage |
| --- | --- |
| `private-runner.test.mjs` | Fixed queue claims, partial-failure reports, private file permissions, escaped HTML, go/no-go gates and the real Code Profiler 1.9.6 artifact filename. |
| `freemius-plugin.test.js` | Runs the Freemius must-use plugin in PHP 8.3 (php-wasm) against stubbed WordPress functions: `auth_date` from the `Date` header, the proxy opt-in for Authorization, calls sent straight to `/cors-proxy.php` on the site's scheme, host and port (direct to Freemius without a usable site address), only `api.`, `sandbox-api.` and `wp.freemius.com`, no double stamping, untouched string headers and preempted answers. |
| `recipe.test.js` | Stable IDs, version hints, labels, default storage, validation, advanced settings, Blueprint output (the Freemius plugin written before installs), directory installs, secret-field rejection, credential URL aliases, safe/unsafe persistence boundaries, public URL controls and external setup warnings. |
| `wordpress-versions.test.js` | Live version normalization, exact latest resolution, preserved saved versions, fetch contract. |
| `wordpress-org-plugins.test.js` | Slugs, normalized/sanitized results, entity decoding, artwork host allowlist (HTTPS from `ps.w.org` only, never the theme host), search and featured request parameters. |
| `wordpress-org-themes.test.js` | Slugs, HTTPS screenshot normalization, artwork host allowlist (HTTPS from `ts.w.org` only, never the plugin host), search request. |
| `github-repository.test.js` | Public star-count normalization and the fixed Techies Playground repository API request. |
| `package-upload.test.js` | Plugin/classic/block-theme header classification, misleading filenames, invalid/nested/ambiguous archives, 150-file drop forwarding, text drags, nested drag state, leave reset and listener cleanup. |
| `vault.test.js` | Separate theme storage and IndexedDB transaction completion. |
| `license-vault.test.js` | Authenticated encryption round trip, wrong-password failure, deletion transaction completion, abort during clipboard read/decryption, active-session copy and missing-session rejection, newest key per requested package for the automatic fill, a second vault creation never overwriting the first, a key that no longer opens the vault (reset elsewhere) saving nothing. |
| `checks.test.js` | The two checks, a check counting only when its plugin (WordPress.org or uploaded, free or Pro) is in the setup, adding a check once, the checks must-use plugin, the page to measure and where results open (never another site, never a page whose address ran an action), reading the measure plugin's numbers, the licence gate for the automatic run, each limit in `CHECK_LIMITS` turning a check amber or red, where each number came from, what each check found, the i table built from the same limits, what needs fixing first, the verdict, the screen-reader announcements with the page's title, and the page queue (a page opened during a run is checked next, only the latest waits, going back cancels it, a page is checked again by itself only after another page, a new site starts at once, and the page checked drops the Playground's own parameters), the page watcher (it waits for the page to settle, skips a check opened in its tool, and runs only for the current site), and a run on a page change staying quiet unless the panel is open or the verdict changed. |
| `checks-panel.test.js` | Source inspection of the Checks panel: the i's role, Good, Medium and Bad columns, `never` for an empty cell and the More information link (44 px, new tab); an overview with one check open at a time and no previous or next; the words Passed, Warning and Improve; the page checked and its path; the open check surviving a new run; the numbers rolling only for new results and never with reduced motion; the delayed spinner; at 320 px with 200% text the title wrapping above Run again and Close, row names wrapping, the i dropping below the headline and the i table wrapping; Keep open and Discard and close with 44 px tap areas; the launcher's column shrinking with the page (no 4 px sideways scroll at 320 px); the checks running on every page that opens; a run on a page change keeping the last result for 0.6 s; a failed run going back to the overview, with focus on the row or, when no rows show, on the panel; Run again joining a run on the same page or starting a waiting page as Run again; the licence wait telling you to run the checks; the i closing on a click inside WordPress; numbers rolling from the old number; and cut titles and paths readable whole. |
| `checks-php.test.js` | The checks must-use plugin in real PHP 8.3: each `techies-check` value prints only its own script, and nothing prints without one. With Query Monitor active, the numbers are the ones Query Monitor collected on the page, with its version and the functions that repeated a query, and failed calls after its first 40 still name their site; on a page where Query Monitor stopped collecting, the numbers are the Playground's own. The measure plugin reports counts and times but never query text or an address with a key in it (also inside an error message), sends a front-end title as plain text, counts every call to another site and every failed one (a failed call after the first 20 keeps its host name), and does nothing on a normal page. |
| `plugin-updates.test.js` | Reading the updates answer (old and new version, failures, already current), a missing or odd answer, one `client.run` per launch, the bar note, label and count for each state, the "only failed" rule (the step ran, nothing updated, something failed) shared by the button and the note heading, the note heading for each state (`Updates failed at start` when every update failed), and the screen-reader announcement. |
| `updates-control.test.js` | Source inspection of the bar's Updates button and note markup (the Node runner cannot render JSX): the failure mark with its screen-reader separator, only the first name cut short so its versions and `+N` stay (also for an item without a name), the button shrinking on a full bar from 1041 px while its label, count and `N failed` keep to one line, note rows keyed by position with long names wrapping, the note taking focus when it opens, with a visible focus ring, and the words after Updates (`networking blocked`, `failed`, `N failed`) staying for screen readers only up to 1040 px, while a failed or blocked update keeps an amber warning icon right after `Updates` at every width (`Update failed`, where the step ran and only failures came back, up to 1040 px) and a tooltip that names it; the note heading comes from `updatesNoteHeading`, and the spinner stands still with reduced motion. |
| `bar-compact-labels.test.js` | Source inspection of the bar, the launcher and the Checks panel: the Licenses, Checks, Export snapshot and Updates names hide up to 767 px (screen readers still hear them) and the fill shows as `N/M` there, so Close stays on the bar; each pixel breakpoint hides and shows at the same width; below 384 px (`xs`) the bar's gap, button padding and tap areas tighten so Close fits a full bar from 320 px, while every button stays at least 40 px wide, so each tap area is at least 44 px, and the close confirmation keeps its 10 px gap; below 20 rem of shell width (320 px with 200% text) the bar and close confirmation wrap without overflowing or overlapping tap areas; the launcher has no `20rem` body minimum width or unwrapping rows that cause sideways scroll at 320 px with 200% text; the limits under one check stack below 15rem of the panel's width (a container query), not by a pixel width; Run checks and Open in are 44 px tall on any device with a touchscreen, with no tap overlay. |
| `plugin-updates-php.test.js` | The update code in real PHP 8.3 against stub WordPress: each offered plugin is updated, reported with its old and new version, and switched back on when it was active (for the whole network when it was on for the whole network of a Multisite site); a plugin or theme offer the site's PHP or WordPress cannot run is skipped and named (the theme upgrader is never called for it, while a theme offer it can run still reaches the upgrader), and a plugin WordPress will not switch back on is reported as a failure; a plugin or theme update check WordPress.org did not answer is named as failed with its error or status and lists nothing as already current, while a check that answers on the http retry still counts. |
| `license-fill.test.js` | Plugin folder from the install path, the key-only request body, the fill code reading keys from the body, result parsing and unknown statuses, saved-key packages, summary and plain-word labels, the fill run itself (one PHP request, locked vault, no folder, unreported plugin, errors cut to 200 characters, abort, a Lock while keys are read sends nothing, a PHP run that never answers ends when the launch closes, the record id of the key used), the licence probe's answer and run (a failed run is unknown), which licences the checks wait for (saved-key plugins plus premium plugins without a licence; every uploaded plugin when unknown), and which licences the site already reports as active, chained with the gate for Start without keys (an active site licence opens it, an unknown status keeps it closed). |
| `license-fill-php.test.js` | The fill code in real PHP 8.3 against stub WordPress and Freemius: each key reaches only its folder's Freemius instance (no prefix mix-ups), active licences are left alone, refusals and exceptions are reported with the key replaced by `[key]`, non-Freemius plugins are reported; the licence probe lists as unlicensed only premium builds that cannot use their premium code (not free builds, licensed builds, themes or an SDK without `is_premium()`), lists licensed plugins (premium or free build, and an expired licence that still unlocks the premium code), and nothing on a site without Freemius. |
| `vault-session.test.js` | The in-memory session key, lock, listeners, a launch's wait for an unlock, skip or close (and that it stops listening), a late unlock after its prompt closed being dropped. |
| `launcher-actions.test.js` | Executes actual App handlers and the recipe library with in-memory state/storage: stale tabs with Web Locks and explicit `locks = null`; deferred saves, fresh-save carry-over, renames, removals, selection, editing, starting, imports and draft export; external replacement/deletion/clearing; removal followed by a queued save; write failure/retry; real mixed ZIP archives; license-list read failures executing App's `refreshLicenseRecords`, `launch`, `startSavedRecipe`, `keyCountsFor`, `licenseListUnavailable`, and `keysBlockLaunch` (initial failure keeps `null`, refresh failure preserves previous records, failed retry updates wording, hung reads time out, uploaded-plugin launch blocked while plain setups still launch, in-flight loading and queued-React deferred-Start race blocked, retry focus restoration to the active setup tab only when **Try again** owns focus, locked-vault unlock request after refreshing a newly saved key, out-of-order reads ignored, recovery clears error), plus source assertions for button wiring and retry touch target. The real launch handler with a stub runtime proves a newer main Launch cancels deferred Start/Select, with exactly one runtime-start call and an unaborted signal. Executes the actual storage listener and cleanup with simulated events. It does not render React or start WordPress. |
| `saved-recipes.test.js` | Upsert, rename-replace, safe round trip, invalid-record dropping, unreadable whole-list errors and refused overwrites. |
| `spinup-history.test.js` | Safe metadata, order/cap, invalid-record dropping, theme metadata, saved-environment deduplication, unreadable whole-list notices and refused append/removal writes. |
| `plugin-preferences.test.js` | Recency ordering, multi-field search, valid timestamp persistence and deletion. |
| `playground-persistence.test.js` | Unload warning, one-time storage-default migration, site identity/persistence labels, asking for persistent storage without waiting (Firefox keeps that request pending until the visitor answers). |
| `playground-preview.test.js` | Preview target validation, preserved query/fragment, modified clicks, external/download/ordinary navigation exclusions, direct popup mapping, standalone execution of the generated mu-plugin script. |
| `sync-wordpress-release.test.mjs` | Stable release selection, branch normalization, minor version bump, no-op and generated release edits. |
| `sync-playground-release.test.mjs` | The pinned Playground version, the patch bump, every Playground pin moving together with one changelog entry, no edits when already current, overrides dropped only when the release itself asks for that version or newer, kept Windows line endings, naming each package or upstream tag of a release that is not published yet, the outputs it writes for the workflow. |
| `check-playground-advisories.test.mjs` | Advisory version ranges (also hand-written ones: a bare version, `*`, pre-release bounds), naming the advisory whose range cannot be read, the installed Playground packages read from the lockfile, plus the packages the Playground host ships (client, remote, `@php-wasm/web` and the browser build of every PHP version the launcher offers) at the Blueprints pin, which advisories affect them (npm only, deduplicated, either patched-version field). |
| `playground-boot-check.test.mjs` | The boot Blueprint (the launcher's default setup with WP-CLI, a WP-CLI title change and the PHP report), the CLI arguments at the pinned version, and the checks on WordPress's answer. |
| `playground-release-workflows.test.mjs` | The Playground sync has a daily schedule, checks out `dev`, runs tests, build, npm audit, the advisory check, the boot test, `git diff --check` and a `git apply --check` of the Playground core patch on the new tag (a sparse clone of only the folders the patch touches; it fails without a PR if the patch no longer applies) before it opens one PR into `dev`; the job that checks the new packages has a read-only token, no git credentials and no cache, saves the patch before any new package code runs and runs that code only in a throwaway container (pinned image, no `.git`, no runner files or tokens), and the job that can write runs no package code; the workflow reads exactly the outputs the sync script writes; it closes older update PRs (deleting a branch only when the bot both wrote and committed its newest commit, and leaving PRs from forks alone, even under the update's branch name), does not reopen a closed one, keeps a fix someone pushed to the update branch along with the PR text, stops when it cannot read the branch, pushes only over the branch tip it checked (and fails with a clear message otherwise), lets only the three synced files through, and never deploys or targets `main`; the security checks run npm audit, the advisory check and (not on pushes) Dependabot alerts; every Playground package follows the Blueprints pin. |
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
| Recipe | Save distinct recipes in two already open tabs; rename and delete while the other tab saves; refresh both. Also save, rename-update, export, import, remove a required ZIP, launch. | Both tab saves survive; deletion stays deleted; no duplicate old name; JSON is normalized/secret-free; missing ZIP blocks launch with ID. |
| Latest WordPress | Launch `latest` with network available, then simulate version API failure. | Exact version is verified when available; launch fails closed if latest cannot be confirmed. |
| Temporary site | Launch, change WordPress, attempt refresh and close. | Browser unload warning and in-app discard confirmation appear. |
| Saved site | Launch new browser-saved site, change content, close, relaunch same identity. | Content resumes; one-time imports/Multisite are not repeated. |
| Preview tabs | Ctrl/Cmd-click or middle-click an internal link; open a `_blank` preview; close the original runtime. Repeat on a resumed site. | A launcher-origin tab displays the same WordPress site, including preview query parameters; closing the owner replaces the iframe with an explanation. Test Firefox/Safari and native popup behavior separately; the initial Chromium smoke used a synthetic Ctrl-click with intercepted `window.open`, then opened the captured URL through browser tooling. |
| Identity change | Change recipe name, exact WordPress, or PHP and launch. | A distinct OPFS environment is used. |
| Packages | Launch local and directory plugins plus local/directory theme. | Plugins activate; selected theme is active; local theme verification passes. |
| History | Launch temporary and saved configurations repeatedly. | Newest first, max 30, saved identity deduplicated, status labels correct. |
| Unreadable saved lists | In an isolated browser profile, seed each saved-list key with invalid JSON or a non-array root, reload, then try Save/import; inspect raw storage. Repeat at 1440/390 px with light/dark preferences. | Short notices replace misleading empty states and unknown counts; raw values remain unchanged. Save/import failures explicitly say the recipe was not saved. History failure does not prevent a launch. Readable arrays still keep valid siblings while dropping invalid entries. Launcher tests execute the actual history initializer without writing; source assertions confine history persistence to the explicit mutation helper. |
| Unreadable license list | In an isolated browser profile with a synthetic local plugin and saved recipe, fail `indexedDB.open('private-playground-license-vault')` on reload at 1440/390 px in light and dark preferences; also test a plain setup without uploaded plugins, and a later refresh failure after initial load followed by **Try again** recovery. | Launch and Start stay disabled for setups with uploaded plugins while plain setups remain enabled; a plain-language error with **Try again** appears in the setup notice block and a short pause alert appears in the Launch summary; Licenses shows `Could not be read` instead of `0 of 1 keys saved`; saved rows omit `1 key missing`. On a later refresh failure, previously loaded saved-key state stays intact while uploaded-plugin launches pause, and clicking **Try again** once IndexedDB recovers clears the error and re-enables Launch/Start. |
| One-click start, keys, Checks | Upload a free Freemius plugin ZIP, Add key with a fake key, add Query Monitor and Code Profiler in Checks, save the recipe, reload, press Start, unlock once. Open Checks for each tool. Repeat in Firefox with Save playground in browser on. | The stored ZIP installs and activates; Licenses shows `0 of 1 active` and the manager shows Freemius's refusal; Query Monitor's panel opens; Code Profiler's page opens without the Query Monitor panel and profiles. See [the change record](changes/2026-11-14-one-click-start-keys-checks.md). |
| Updates at start, Checks panel | Launch a setup with Query Monitor, Code Profiler and an outdated WordPress.org plugin, networking on. Watch the bar, open Updates, open Checks, press Run again and Open in Code Profiler, press Escape twice. Repeat at 375 px wide. Then launch with a plugin that has a saved key and press **Start without keys** at the unlock prompt. | The plugin is updated and still on, and Updates names it with old and new version. The checks run by themselves; the panel shows a verdict and the overview of the checks, Run again remeasures, Open in Code Profiler opens its page, Escape closes the Updates note first, then the panel. With the skipped key, the checks do not start, the Checks button shows an amber warning (and `activate licenses first` above 1040 px), and the panel says `0 of 1 active`. See [the change record](changes/2026-11-20-updates-at-start-and-checks-panel.md). |
| Checks on the open page | Launch with Query Monitor and Code Profiler. Open Checks, press the i, then More information; press Escape. Open PHP errors, then go to the Dashboard inside WordPress. Close the panel and go to General Settings. Repeat at 390 px, and at 320 px with 200% text. | The i lists Good, Medium and Bad for each check and More information opens the check score article in a new tab; Escape closes the i. PHP errors stays open and refreshes for the Dashboard, and the page line names it. With the panel closed, the bar's Checks button updates for General Settings. At 320 px with 200% text, Close is on screen, the title is not covered and nothing scrolls sideways inside the panel. See [the change record](changes/2026-11-21-checks-panel-overview-and-open-page.md). |
| Snapshot | Export after setup. | A readable `<name>-wp-content.zip` downloads. |
| License vault | Create, wrong-password unlock, add, lock, unlock, copy, delete, reset. | Ciphertext persists; wrong password fails; plaintext appears only in field/clipboard; reset deletes all entries. |
| Failure cleanup | Interrupt or fail runtime/package setup. | Iframe blanks, shell closes, client is invalidated, error remains visible in launcher. |
| Playground never ready | Point a launcher build at a host whose `remote.html` answers 403 (as the upstream bot check did). | After two minutes the shell closes and the launcher shows "WordPress Playground did not start within 2 minutes. Check your connection, then launch again." |

### Self-hosted Playground host

`node scripts/playground-boot-check.mjs` boots the pinned Playground release once in Node (`@wp-playground/cli` at the same version, the launcher's default setup plus WP-CLI) and checks what WordPress reports; the Playground sync runs it before it opens an update PR. Its name must not end in `-test.mjs`, or a bare `node --test` would run it. `node scripts/check-playground-advisories.mjs` checks the installed Playground packages, and the packages the self-hosted Playground ships at the pinned version, against published advisories. Both need network access; neither is part of `npm test`. The `Security checks` workflow runs `npm audit --audit-level=high`, the advisory check and open high or critical Dependabot alerts daily (see [the change record](changes/2026-11-20-playground-release-sync-and-security-checks.md)).

A local run needs the built Playground website (see [the change record](changes/2026-11-14-self-hosted-playground.md)): prepare it with `node scripts/prepare-playground-host.mjs <build> playground-host/dist --launcher-origin http://127.0.0.1:4173`, serve it with `npx wrangler dev --config playground-host/wrangler.jsonc --env preview --port 8787`, then build the launcher with `VITE_PLAYGROUND_ORIGIN=http://127.0.0.1:8787 npx vite build` and serve it with `npx vite preview`. The Vite dev server reloads the page when Playground starts, so use the built launcher for this check. On the deployed preview, launch plain WordPress, a launch with an uploaded plugin ZIP, and a resumed browser-saved site in Chromium and Firefox. Headless Firefox needs its persistent-storage prompt answered (`dom.storageManager.prompt.testing` and `dom.storageManager.prompt.testing.allow`).

## Checking the daily Playground sync

GitHub runs scheduled workflows from the default branch (`main`); the sync checks out `dev` and opens its update PR there. GitHub can delay or drop scheduled runs. To exercise the same workflow manually, run `gh workflow run sync-playground-release.yml --ref main`, then inspect its run logs. The [November 22 investigation](changes/2026-11-22-playground-3-1-65-and-daily-check.md) records the initial schedule evidence.

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

## Checks spinner reveal

The Checks spinner regression test verifies separate reveal wrappers for the bar, overview and detail spinners, so the spin animation cannot override the 200 ms reveal animation. This is source inspection, not browser timing evidence.

## TOOLS-402 uploaded plugins and tester editions

`src/lib/uploaded-plugins.test.js` covers install/activate/verify ordering, safe failed activation, rejection before installation when tester deactivation fails, and stale-client cancellation. `src/lib/uploaded-plugins-php.test.js` executes the activation and tester synchronisation PHP with a focused WordPress stub, including activation redirects, failures, and preserving testers outside the setup and turning off only launcher-owned testers on resume. `src/app-upload.test.js` executes the picker and live-install orchestration with focused adapters to cover mixed ZIP queueing, accurate post-install problem headlines, handling a tester-deactivation rejection without navigation, reporting unreadable or still-loading license keys once per upload batch without probing Freemius (keeping checks waiting), and filling newly refreshed license metadata from `licenseStorageRef.current`. `src/lib/checks.test.js` covers Query Monitor Pro, turning testers off, and free/Pro selection replacement.

Browser acceptance: upload a synthetic plugin, check the key-plus icon, save a fake licence in the existing encrypted vault, turn each tester on then off, upload Pro fixtures and confirm only Pro is selected. Start a temporary site, drop another plugin onto the running site, and check WordPress's row shows Deactivate. Drop a plugin that refuses activation and check its row shows the inline activation failure. Resume a browser-saved site with a Pro tester selected and confirm only its competing free edition is inactive. Testers activated inside WordPress but absent from the setup must stay active. Paid vendor binaries and real licence activation require Lex's own preview test; fixtures prove installation behavior, not vendor licence validity.
