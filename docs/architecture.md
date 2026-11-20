# Architecture

## Runtime boundaries

Techies Playground has three important execution zones:

| Zone | Runs where | Responsibilities |
| --- | --- | --- |
| Launcher | Main browser page | UI, recipe validation, local persistence, API discovery, Playground orchestration. |
| Playground runtime | Cross-origin iframe backed by WordPress Playground | WordPress/PHP/SQLite execution, Blueprint setup, plugin/theme install, updates, `wp-content` export. |
| Delivery | GitHub Actions and Cloudflare Worker | Test/build/deploy and static asset security headers. |

There is no application server or shared data store.

## Module map and callers

| Module | Responsibility | Main callers |
| --- | --- | --- |
| `src/main.jsx` | Mount React in strict mode and load global CSS. | `index.html`. |
| `src/Preview.jsx` | Render a second-tab view of the active runtime and monitor its owner through BroadcastChannel. | `src/main.jsx` for `#preview=` URLs. |
| `src/lib/playground-preview.js` | Validate preview URLs, answer session probes, and generate the WordPress mu-plugin that redirects new-tab actions. | App, Preview, regression tests. |
| `src/App.jsx` | Most of the UI, application state, effects and the launch lifecycle. | `src/main.jsx`; calls every `src/lib` module and Playground packages. |
| `src/ChecksPanel.jsx` | The bar's Checks button and the Checks panel (verdict, tiles, check rows, Open in tool). Presentational: App passes the run, the licence gate and the callbacks. | App. |
| `src/UpdatesControl.jsx` | The bar's Updates button and its note of what the update at start changed, plus the shared bar button class, tap target, spinner and clock time. | App, ChecksPanel. |
| `src/lib/plugin-updates.js` | The PHP that updates every plugin and theme at start (and switches updated plugins back on), its result parsing, and the bar's label and announcement. | App launch, UpdatesControl, regression tests (which run the parser on real output shapes). |
| `src/lib/recipe.js` | Recipe defaults, validation, stable package IDs, labels/version hints, Blueprint generation, recipe download. | App, saved recipes, history, persistence tests. |
| `src/lib/freemius-plugin.js` | The PHP source of the Freemius must-use plugin that every Blueprint writes (see Freemius licence calls below). | `recipe.js`, regression tests (which run it in PHP 8.3). |
| `src/lib/wordpress-versions.js` | Runtime WordPress.org version fetch, supported-version normalization, fallback and saved-version preservation. | App; release automation has parallel server-side logic. |
| `src/lib/wordpress-org-plugins.js` | Featured/search requests and safe plugin result normalization. | App. |
| `src/lib/wordpress-org-themes.js` | Search requests and safe theme result normalization. | App. |
| `src/lib/package-upload.js` | ZIP header detection with zip.js and global file-drag listener lifecycle. | App and regression tests. |
| `src/lib/vault.js` | IndexedDB plugin/theme ZIP CRUD and ZIP signature check. | App. |
| `src/lib/license-vault.js` | IndexedDB encrypted license CRUD, PBKDF2 derivation, AES-GCM, clipboard copy, decrypting the newest key per package for the automatic fill. | `LicenseManager`, Add key and launch in App. |
| `src/lib/vault-session.js` | The unlocked vault key for the page session, its listeners, and a launch's wait for an unlock, skip or close. | App, LicenseManager, Add key. |
| `src/lib/license-fill.js` | The PHP that hands saved keys to Freemius-based plugins (keys only in the request body), its request body, result parsing and labels, and the fill run (vault key and key reader passed in); the probe for premium Freemius plugins without a licence and the list of licences the checks wait for. | App launch. |
| `src/lib/checks.js` | Which checks a recipe contains, adding one, where its results open, the checks and measure must-use plugins, reading one page's numbers, `CHECK_LIMITS`, the licence gate, and turning numbers into checks, verdict and announcement. | App, ChecksPanel, regression tests (which run the measure plugin in PHP 8.3). |
| `src/lib/saved-recipes.js` | Parse, validate, upsert, rename-replace, and serialize saved recipes. | App. |
| `src/lib/spinup-history.js` | Safe history normalization, cap, and persisted-environment deduplication. | App. |
| `src/lib/plugin-preferences.js` | Local-package search and recently-selected ordering. | App for plugins and themes. |
| `src/lib/playground-persistence.js` | Unload warning rule, one-time default migration, site ID, history persistence label. | App and history. |
| `src/styles.css` | Tailwind import/theme, body defaults, selection color, license-popover positioning/animation, Checks panel slide-in, reduced motion. | `src/main.jsx`. |
| `worker.js` | Serve `dist` through asset binding and add security headers. | Cloudflare Workers. |
| `scripts/sync-wordpress-release.mjs` | Detect a new WordPress release branch and prepare fallback/version/changelog edits. | npm script and scheduled workflow. |
| `scripts/configure-cloudflare-deploy.ps1` | Securely configure GitHub deployment secret/variables and trigger workflow. | One-time maintainer action. |

All `*.test.js` and `*.test.mjs` files are direct Node tests for their sibling module.

## State ownership

`App` owns the active recipe and orchestration state. Derived views use `useMemo`; persistent data uses narrow library functions. There is no state context or reducer.

Directory-plugin display metadata is cached in an in-memory `Map` as featured and search results arrive. Selected directory rows survive an empty or changed search, and the launch summary resolves selected plugin names from this cache or local vault metadata. Public slugs/IDs are display fallbacks when metadata is unavailable. Featured cards avoid duplicate rows at empty search. This cache is not persisted and does not alter recipes, Blueprint setup, or OPFS site identity. See [the selected-plugin regression record](changes/2026-10-17-selected-directory-plugins.md).

Important refs are intentionally not state:

- `clientRef`: the ready Playground client.
- `launchIdRef`: invalidates stale asynchronous work after close/relaunch.
- `iframeRef`: runtime host and explicit blanking on close/failure. Close and failure also replace the frame element (`playgroundFrameKey`), so a start still running on the old frame cannot attach to the next launch.
- Vault session (`src/lib/vault-session.js`, module state read with `useSyncExternalStore`): the unlocked `CryptoKey` for the page session, excluded from rendering and persistence. Lock clears it; closing the manager does not.
- License manager session ref: AbortController shared by the manager's vault operations; lock starts a fresh one, while close/unmount abort it. Async continuations cannot restore cleared UI state.
- `unlockResolveRef`, `launchAbortRef`, `launchedRecipeRef`: the pending launch unlock, cancellation of the automatic key fill on close, and the recipe the running site was launched from (for Checks).
- File input refs: enable styled buttons to trigger native file selection.

## Launch data flow

```text
Recipe + local package IDs
  -> validateRecipe and confirm external setup sources when present
  -> resolve `latest` to exact WordPress version
  -> persistedSiteId
  -> buildPlaygroundBlueprint
  -> startPlaygroundWeb
       -> verify running WordPress version with PHP
       -> establish/resume OPFS mount
       -> install local plugin ZIPs
       -> install and verify local theme
       -> fill saved licence keys
       -> update plugins and themes (networking allowed only)
       -> navigate to landing page
  -> append safe spin-up metadata
  -> run the checks once when checks are in the setup and every needed licence is active
```

The checks and the updates write only to their own state (`checksRun`, `pluginUpdates`); a result that arrives after the site closed or relaunched is dropped (`launchIdRef` for the updates, the client in `clientRef` for a check run). `licensedPackageIds` keeps which plugins needed a licence at launch (saved-key plugins, then premium Freemius plugins that cannot use their premium code; every uploaded plugin when the probe failed), so the gate stays closed after Start without keys. `siteLicensedIds` keeps which of them WordPress already reports as licensed, so a saved site with an active licence does not wait.

Directory packages are included as Blueprint resource steps. Local packages cannot be embedded in a serializable recipe, so they are installed after the client is ready using their IndexedDB `File` objects.

## Preview tabs

Each launch receives a short random `launcher-<12 hex>` runtime scope (see `createLauncherScope`); the stable OPFS site identity is unchanged and is not part of the scope. Playground places the scope in every WordPress URL, and plugins such as Elementor IDNA-encode whole URLs by splitting on dots, so `net/scope:<scope>/wp-admin/admin` must stay under the 63-character DNS label limit. After readiness, App writes `techies-preview.php` into WordPress's mu-plugins directory on every launch, including resumes. Its admin/frontend script handles Ctrl/Cmd/Shift-click, middle-click, `_blank` links and direct `window.open(scopedUrl)` calls for the current scope. Ordinary navigation, downloads and external links keep their behavior.

### Saved keys filled in at launch

When uploaded plugins of the launched recipe have a saved key, the launch asks for one vault unlock per page session, installs the plugins (recording each installed folder from `installPlugin`'s `assetPath`), decrypts the newest key per plugin and runs `LICENSE_FILL_CODE` once through `client.run` with the keys as the POST body. The PHP loads WordPress as user 1, finds each folder's Freemius instance and calls its public `activate_migrated_license`, which opts the site in with the key or activates it on a registered install; an already active valid licence is left alone, and any message that repeats the key has it replaced with `[key]`. The key leaves the browser only as the SDK's own request to Freemius, through the CORS proxy below when the browser blocks it. Results reach the Licenses button and the manager, never a log or history.

### Freemius licence calls

Every Blueprint writes `techies-freemius.php` into WordPress's mu-plugins directory (a `writeFile` step before any package installs, on new and resumed sites alike). For requests to `api.freemius.com`, `sandbox-api.freemius.com` and `wp.freemius.com` only, its `pre_http_request` filter copies the `Date` header into the `auth_date` query parameter (browsers never send `Date` from `fetch()`, and Freemius signs with it), adds `X-Cors-Proxy-Allowed-Request-Headers: authorization` (the proxy forwards the signature only on that opt-in) and sends the request straight to the CORS proxy, `/cors-proxy.php?<url>` on the site's own scheme, host and port. The proxy is needed: the Freemius SDK rejects any API answer whose `X-API-Server` header it cannot read, which Freemius never exposes to browsers, and a PUT with a body fails the browser's CORS check on `Content-MD5`. Going straight to it, rather than letting Playground retry through it after a failed direct attempt, keeps the request body in Firefox: Playground 3.1.64's retry (`fetchWithCorsProxy` in `@php-wasm/web-service-worker`) resends `Request.body`, which Firefox does not expose, because its streamed-upload probe passes in Firefox (Firefox turns the stream into the text `[object ReadableStream]`). Our build of Playground now fixes that retry for every plugin (`playground-host/playground-core.patch`, applied by the deploy workflow before the build; see [the core patch record](changes/2026-11-20-playground-core-request-body-firefox.md)), but the direct route stays: it skips a failing first attempt and does not depend on the patch. A call to the site's own host succeeds on the first attempt, so the retry never runs. Without a usable site address the plugin still stamps and opts in, and sends to Freemius directly. Licence systems that sign differently, such as WooCommerce.com-style updaters, are not covered. See [the change record](changes/2026-11-14-freemius-licence-activation.md) and [the Firefox follow-up](changes/2026-11-15-freemius-activation-firefox.md).

New tabs open the launcher origin with `#preview=<encoded scoped URL>`. Preview mounts only the scoped content iframe, never another WordPress runtime or OPFS mount. Keeping the same top-level site preserves the remote service worker's storage partition. An origin-local BroadcastChannel probes the original launcher every three seconds; the iframe mounts after a reply. Explicit close/failure removes it immediately; missing replies show an unavailable message after roughly 15–18 seconds, subject to background timer throttling. A later reply can restore a timed-out view.

The original launcher must remain open. Native context-menu navigation and plugins that open an empty window then assign its location are not covered by the click/direct-window interception. See [the investigation and browser evidence](changes/2026-09-09-preview-tabs.md).

## Persistence lifecycle

For a new browser-saved site, the Blueprint performs WordPress installation and one-time setup. After readiness, `mountOpfs` synchronizes `/wordpress` from memory into `private-playground-launcher/sites/<site-id>` and the site ID is remembered.

For a known site, `startPlaygroundWeb` receives the mount with `opfs-to-memfs`, `shouldInstallWordPress: false`, and a Blueprint with one-time Multisite/WXR setup omitted. Normal safe configuration steps and package installation can still run.

The remembered-site list is only an index. Actual WordPress files live in OPFS. If OPFS data disappears while the marker remains, launch may fail; history labels detect only whether the marker exists, not filesystem integrity.

## External integrations

| Integration | URL/host | Purpose | Failure behavior |
| --- | --- | --- | --- |
| WordPress core version API | `api.wordpress.org/core/version-check/1.7/` | Runtime selector and exact latest resolution. | Page load keeps fallback; launch with `latest` fails closed. |
| Plugin directory API | `api.wordpress.org/plugins/info/1.2/` | Featured and searched plugins. | Non-blocking unavailable/empty message. |
| Theme directory API | `api.wordpress.org/themes/info/1.2/` | Searched themes. | Non-blocking unavailable/empty message. |
| Playground host | `wp.techies.tools` (preview: `preview-wp.techies.tools`), `playground-host/` | Our build of Playground's website, without its pages: `client/index.js`, `remote.html` (and the `wordpress-bridge.html` and `wordpress-popup.html` it opens), PHP and WordPress builds. The public website pages (`index.html`, `api.html`, the builder, demos and the other start pages) are left out, because they start a Playground from their URL on the origin that holds saved sites and filled licence keys; CI refuses to deploy a host folder with any other page and checks the host answers 404 for `index.html`. The prepared `remote.html` starts with a small script, ahead of Playground's own: Playground starts only inside a launcher's frame on another origin, so `remote.html` opened as its own window, or framed by a page of the host origin (such as a copy of the old website a browser still has cached, which Playground's service worker would serve until the next Playground release), stops loading and shows nothing (the browser check is in the change record); the script also deletes such cached pages from Playground's caches. The launcher imports the client from here because `startPlaygroundWeb` only accepts a `remote.html` from the client's own origin. | A client that cannot load fails at once with a readable error; a runtime that is not running WordPress within two minutes fails with "WordPress Playground did not start within 2 minutes…". Blueprint steps after that (WordPress.org installs) have no deadline. |
| Playground CORS proxy | `/cors-proxy.php` on the Playground host (`playground-host/cors-proxy.js`; the `.php` ending keeps Playground's service worker from caching proxied answers, which it would otherwise match ignoring the query string; it caches any URL containing `wordpress-static.zip`, so the proxy refuses those) | Exact WordPress releases outside the bundled builds and WordPress's own outgoing requests that browsers block (tried directly first, then retried here). Calls to `api.`, `sandbox-api.` and `wp.freemius.com` come here straight from the Freemius must-use plugin, without a direct attempt (see Freemius licence calls). Authorization is forwarded only on opt-in, HEAD requests ask the target for uncompressed bytes, and a GET range is cut by the proxy from the whole file, so compressed targets give the file's own bytes and size (a range later in an uncompressed file with a strong ETag is taken from the target's own answer when it proves to be exactly those bytes of the same file; see `docs/changes/2026-11-20-cors-proxy-ranges-cut-from-whole-file.md`), answers never carry `Clear-Site-Data`, `NEL`, `Report-To` or `Set-Login` (they would act on the Playground host's own origin, which holds saved sites), and a redirect to another origin is followed inside the Worker without it (an authorized POST, PUT, PATCH or DELETE redirected elsewhere is refused). GET, HEAD and POST pass for any public target; PUT, PATCH and DELETE only for the Freemius licence API hosts (`api.freemius.com`, `sandbox-api.freemius.com`), which Freemius-based plugins use to activate and sync licences. Browsers on other sites are refused (`Sec-Fetch-Site`), and so is anything but a `fetch()` or XHR (`Sec-Fetch-Dest: empty`, what Playground and the Freemius plugin's requests send): an outside file loaded through the proxy as a page, frame, script, worker or image would act with the Playground host's origin, and a service worker registered that way would outlive the site; because any non-browser client can still call it, it is rate-limited per visitor (300 a minute, counted per Cloudflare location), and it keeps no logs. The public `wordpress-playground-cors-proxy.net` only answers `playground.wordpress.net`. | A refused or failed proxy request surfaces as Playground's runtime error. |
| Plugin artwork | `ps.w.org` | Official icons only. | Invalid host becomes no image. |
| Theme artwork | `ts.w.org` | Official screenshots only. | Invalid host becomes no image. |
| GitHub repository API | `api.github.com` and `github.com` | Load the public repository star count and link to the repository's star action. | The site-styled repository link remains usable without a count if the API request fails. |
| User WXR/extension URLs | HTTPS or localhost HTTP | Trusted advanced setup input. | Validation rejects other schemes. |

The WordPress selector fallback includes the exact WordPress 7.1.3 release alongside branches 6.3 through 7.1. Its `latest` option has no resolved version; only the live API resolves it, and a `latest` launch fails closed if that resolution fails. Saved-version preservation and OPFS site identity remain unchanged.

Archive availability and selector support do not establish runtime availability. On 2026-10-13, a WordPress 7.1.3 worker download failed in both the launcher and official Playground while the same archive was readable from a top-level remote page's main thread. No local remediation or precise upstream/browser cause was established. See [the investigation](changes/2026-10-13-playground-download-failure.md).

A later standalone Firefox 157.0 comparison successfully boots official WordPress 7.1.3 and reads the archive from a dedicated worker. The original T3 Chromium failure's cause remains unestablished; identical network paths across those environments were not verified. See [the comparison](changes/2026-10-13-playground-firefox-comparison.md).

Standalone Chrome 155.0.8059.39 subsequently boots the same official release with its sandbox enabled and reads the exact archive in a dedicated worker. The observed failure is therefore not universal across Chromium environments; no launcher remedy has been verified. See [the standalone Chromium comparison](changes/2026-10-13-playground-standalone-chromium.md).

The same comparison also verifies a live temporary launcher environment in a fresh Chrome 155 context: `latest` starts WordPress 7.1.3 and reaches its PHP-verified ready state. This is a working basic setup; it does not identify or repair the original failing environment, and browser-saved persistence or package setup was not tested.

## Build and delivery

Vite produces `dist`. `wrangler.jsonc` binds that directory as `ASSETS`, uses SPA fallback, runs `worker.js` first, keeps observability off (Workers Logs add cost), and maps the custom domain `play.techies.tools`.

The Worker adds:

- CSP restricting frames to Playground, artwork to WordPress.org image hosts, and executable scripts to the app itself.
- `Permissions-Policy` disabling camera, microphone, geolocation, payment, and USB.
- `Referrer-Policy: no-referrer`.
- `X-Content-Type-Options: nosniff`.
- `X-Frame-Options: SAMEORIGIN`.

The production workflow runs only in `techiesreviews/techies-playground`, for actor `techiesreviews`, with repository variable `CLOUDFLARE_DEPLOY_ENABLED` explicitly set to `true`. It requires the `CLOUDFLARE_ACCOUNT_ID` repository variable and a non-empty `CLOUDFLARE_API_TOKEN` Actions secret. It installs with `npm ci` and tests in its own job, runs the security checks (`npm audit --audit-level=high` and the Playground advisory check) in another, alongside the upstream Playground build; the Playground host and launcher deploy jobs both need the test and security jobs, so failing tests or an open high advisory deploy nothing (`scripts/deploy-workflow.test.mjs` checks this). The upstream build reaches the host deploy job as an artifact of the same run (kept one day), never through the Actions cache, so every deploy builds Playground afresh (about five minutes). The deploy jobs then run Wrangler through the pinned Cloudflare action. Keep the deployment gate disabled when credentials are unavailable; a missing token allows tests/build to pass but makes the Cloudflare action fail before upload.

The first 2026-10-17 attempt to publish 0.8.3 passed GitHub installation/tests/build, but Cloudflare rejected the deployment token with codes 10000 and 9109 and production stayed at 0.8.0. See [that failed attempt](changes/2026-10-17-release-0.8.3-deployment.md). After the user replaced the token, [the retry](changes/2026-10-17-release-0.8.3-token-retry.md) deployed commit `2b65d41` successfully. Public assets identify live release 0.8.3, and a fresh production browser session verifies selected-plugin visibility, summary names/counts and removal. This does not establish a repair for the original Vivaldi runtime hiccup.

The daily WordPress release workflow checks the official API. A new release branch causes a minor app-version bump, fallback entry, lockfile update, and changelog entry on a reviewable automation branch. It tests/builds before opening or refreshing a pull request. The workflow tracks major/minor branches, so patch releases within an existing branch do not trigger these edits; exact patch fallbacks such as 7.1.3 are maintained manually.

One WordPress Playground version drives the launcher's `@wp-playground/*` and `@php-wasm/*` packages, the client it loads from the Playground host, and the host itself (`deploy-site.yml` builds it from tag `v<@wp-playground/blueprints pin>`, after applying the hash-checked `playground-host/playground-core.patch`; the build fails if the tag no longer takes the patch). The daily Playground release workflow (`sync-playground-release.yml`, from `dev`) moves all of them at once when npm has every pinned package at the new version and the upstream tag exists: a patch app-version bump, a changelog entry, the lockfile, and dropping package overrides the release no longer needs. Before it opens or refreshes the single `automation/playground-<version>` PR into `dev` (closing any older one), it runs the tests, the build, `npm audit --audit-level=high`, the Playground advisory check and a boot of the new release with the launcher's default setup and WP-CLI (`scripts/playground-boot-check.mjs`), and checks that `playground-host/playground-core.patch` still applies to the new tag (stopping without a PR if it doesn't). That work runs in a job with a read-only token, no git credentials and no cache. It saves the update as a patch before any newly published code runs, and runs that code (tests, build, boot test) only in a throwaway container that sees the working tree but not `.git`, the runner's action files or its tokens, so the new packages cannot plant cache entries or change the artifact. A second job, which runs no package code, applies the patch (only `package.json`, `package-lock.json` and `src/App.jsx`), pushes the branch and opens the PR. It does not reopen an update someone closed, leaves the branch and the PR text alone once someone else has pushed to it or changed the bot's commit, deletes an older update's branch only when the bot made its newest commit (PRs from forks are left alone, even under the update's branch name), and stops rather than push when it cannot read the branch. Its push replaces only the branch tip it checked, so a fix pushed in between makes the push fail instead of being overwritten. Merging updates the previews only; releasing to `main` needs Lex's approval every time. See [the change record](changes/2026-11-20-playground-release-sync-and-security-checks.md).

The daily `security-checks.yml` workflow (also on each push to `dev`; every deploy runs its first two checks too) runs `npm audit --audit-level=high`, checks the installed Playground packages, plus the ones the Playground host ships (`@wp-playground/client`, `@wp-playground/remote`, `@php-wasm/web` with `@php-wasm/fs-journal` and one `@php-wasm/web-<php>` build per PHP version) at the pinned version, against the Playground repository's advisories and the GitHub advisory database, and, outside pushes, fails on open high or critical Dependabot alerts (read with the workflow token, or the `DEPENDABOT_ALERTS_TOKEN` secret if GitHub refuses it). `package.json` overrides `isomorphic-git` above its high advisory until a Playground release needs no override.

WP-CLI comes from the Playground host: the host build points every hosted script that names `playground.wordpress.net/wp-cli.phar` at the host's own `/wp-cli.phar` (and refuses a host that would link to it without shipping it), and the Vite plugin `wpCliFromHostPlugin` does the same for the launcher bundle with its `VITE_PLAYGROUND_ORIGIN`.

## Architectural constraints and known coupling

- `src/App.jsx` contains UI and orchestration in one 2,500-line module. A rebuild may split components, but observable state transitions and focus behavior must remain identical.
- The release sync script edits source text using stable markers. Renaming `CHANGELOG_ENTRIES` or the fallback marker requires updating and testing the script.
- Site identity intentionally excludes most recipe settings. Changing name, exact WordPress version, or PHP creates a different saved site; changing packages/settings reuses the same site.
- WordPress update automation is inline PHP in `src/lib/plugin-updates.js`; it is executed only in the local Playground runtime.
- `@wp-playground/blueprints` is pinned to 3.1.64, the release CI builds the self-hosted Playground from; the client is no longer an npm dependency (it loads from the Playground host). The development-only `@php-wasm/node-8-3` and `@php-wasm/universal` are pinned to the same version so the Freemius plugin's tests run it in real PHP. Other dependencies retain existing semver ranges. The lockfile provides reproducible installed versions and CI uses `npm ci`. fast-uri resolves to patched 3.1.7. A temporary Sharp 0.35.4 override fixes the Miniflare tooling dependency until its upstream pin catches up.

Recipe autosave uses validated serialization; invalid form input removes the stored draft rather than writing raw values. Import confirmation precedes applying/saving external setup recipes, and every launch with external sources asks again. Advanced settings open automatically when those sources are present.

## Page-wide package drops

App registers capture-phase window drag listeners with cleanup and a nested-entry counter. File drags show a fixed upload overlay above launcher dialogs and the runtime frame; text/link drags retain native behavior. Drop copies FileList immediately and queues sequential imports. Each file is independently classified and persisted, then both libraries refresh. Detection inspects root or single-folder PHP/style.css headers, ignores metadata/hidden paths, limits candidate header files to 2 MiB, and rejects unknown or mixed-type archives. ZIP contents stay local; zip.js workers are disabled. A drag that begins directly inside the cross-origin WordPress iframe cannot be observed by the launcher until it crosses the parent page; once visible, the overlay covers that frame.
