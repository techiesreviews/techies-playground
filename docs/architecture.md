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
| `src/App.jsx` | Entire UI, application state, effects, launch lifecycle, inline WordPress update PHP. | `src/main.jsx`; calls every `src/lib` module and Playground packages. |
| `src/lib/recipe.js` | Recipe defaults, validation, stable package IDs, labels/version hints, Blueprint generation, recipe download. | App, saved recipes, history, persistence tests. |
| `src/lib/wordpress-versions.js` | Runtime WordPress.org version fetch, supported-version normalization, fallback and saved-version preservation. | App; release automation has parallel server-side logic. |
| `src/lib/wordpress-org-plugins.js` | Featured/search requests and safe plugin result normalization. | App. |
| `src/lib/wordpress-org-themes.js` | Search requests and safe theme result normalization. | App. |
| `src/lib/vault.js` | IndexedDB plugin/theme ZIP CRUD and ZIP signature check. | App. |
| `src/lib/license-vault.js` | IndexedDB encrypted license CRUD, PBKDF2 derivation, AES-GCM, clipboard copy. | `LicenseManager` in App. |
| `src/lib/saved-recipes.js` | Parse, validate, upsert, rename-replace, and serialize saved recipes. | App. |
| `src/lib/spinup-history.js` | Safe history normalization, cap, and persisted-environment deduplication. | App. |
| `src/lib/plugin-preferences.js` | Local-package search and recently-selected ordering. | App for plugins and themes. |
| `src/lib/playground-persistence.js` | Unload warning rule, one-time default migration, site ID, history persistence label. | App and history. |
| `src/styles.css` | Tailwind import/theme, body defaults, selection color, license-popover positioning/animation, reduced motion. | `src/main.jsx`. |
| `worker.js` | Serve `dist` through asset binding and add security headers. | Cloudflare Workers. |
| `scripts/sync-wordpress-release.mjs` | Detect a new WordPress release branch and prepare fallback/version/changelog edits. | npm script and scheduled workflow. |
| `scripts/configure-cloudflare-deploy.ps1` | Securely configure GitHub deployment secret/variables and trigger workflow. | One-time maintainer action. |

All `*.test.js` and `*.test.mjs` files are direct Node tests for their sibling module.

## State ownership

`App` owns the active recipe and orchestration state. Derived views use `useMemo`; persistent data uses narrow library functions. There is no state context or reducer.

Important refs are intentionally not state:

- `clientRef`: the ready Playground client.
- `launchIdRef`: invalidates stale asynchronous work after close/relaunch.
- `iframeRef`: runtime host and explicit blanking on close/failure.
- `license keyRef`: in-memory `CryptoKey`, excluded from rendering and persistence.
- File input refs: enable styled buttons to trigger native file selection.

## Launch data flow

```text
Recipe + local package IDs
  -> validateRecipe
  -> resolve `latest` to exact WordPress version
  -> persistedSiteId
  -> buildPlaygroundBlueprint
  -> startPlaygroundWeb
       -> verify running WordPress version with PHP
       -> establish/resume OPFS mount
       -> install local plugin ZIPs
       -> install and verify local theme
       -> navigate to landing page
  -> append safe spin-up metadata
```

Directory packages are included as Blueprint resource steps. Local packages cannot be embedded in a serializable recipe, so they are installed after the client is ready using their IndexedDB `File` objects.

## Preview tabs

Each launch receives a unique `launcher-<site-id>-<UUID>` runtime scope; the stable OPFS site identity is unchanged. After readiness, App writes `techies-preview.php` into WordPress's mu-plugins directory on every launch, including resumes. Its admin/frontend script handles Ctrl/Cmd/Shift-click, middle-click, `_blank` links and direct `window.open(scopedUrl)` calls for the current scope. Ordinary navigation, downloads and external links keep their behavior.

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
| Playground remote | `playground.wordpress.net/remote.html` | Embedded runtime. | Launch closes and surfaces error. |
| Plugin artwork | `ps.w.org` | Official icons only. | Invalid host becomes no image. |
| Theme artwork | `ts.w.org` | Official screenshots only. | Invalid host becomes no image. |
| GitHub repository API | `api.github.com` and `github.com` | Load the public repository star count and link to the repository's star action. | The site-styled repository link remains usable without a count if the API request fails. |
| User WXR/extension URLs | HTTPS or localhost HTTP | Trusted advanced setup input. | Validation rejects other schemes. |

## Build and delivery

Vite produces `dist`. `wrangler.jsonc` binds that directory as `ASSETS`, uses SPA fallback, runs `worker.js` first, enables observability, and maps the custom domain `play.techies.tools`.

The Worker adds:

- CSP restricting frames to Playground, artwork to WordPress.org image hosts, and executable scripts to the app itself.
- `Permissions-Policy` disabling camera, microphone, geolocation, payment, and USB.
- `Referrer-Policy: no-referrer`.
- `X-Content-Type-Options: nosniff`.
- `X-Frame-Options: SAMEORIGIN`.

The production workflow runs only in `techiesreviews/techies-playground`, for actor `techiesreviews`, with repository variable `CLOUDFLARE_DEPLOY_ENABLED` explicitly set to `true`. It requires the `CLOUDFLARE_ACCOUNT_ID` repository variable and a non-empty `CLOUDFLARE_API_TOKEN` Actions secret. It installs with `npm ci`, tests, builds, then runs Wrangler through the pinned Cloudflare action. Keep the deployment gate disabled when credentials are unavailable; a missing token allows tests/build to pass but makes the Cloudflare action fail before upload.

The daily WordPress release workflow checks the official API. A new release branch causes a minor app-version bump, fallback entry, lockfile update, and changelog entry on a reviewable automation branch. It tests/builds before opening or refreshing a pull request.

## Architectural constraints and known coupling

- `src/App.jsx` contains UI and orchestration in one 2,500-line module. A rebuild may split components, but observable state transitions and focus behavior must remain identical.
- The release sync script edits source text using stable markers. Renaming `CHANGELOG_ENTRIES` or the fallback marker requires updating and testing the script.
- Site identity intentionally excludes most recipe settings. Changing name, exact WordPress version, or PHP creates a different saved site; changing packages/settings reuses the same site.
- WordPress update automation is inline PHP in `App.jsx`; it is executed only in the local Playground runtime.
- Dependencies use broad semver/`latest` declarations while the lockfile provides reproducible installed versions. CI must use `npm ci`.
