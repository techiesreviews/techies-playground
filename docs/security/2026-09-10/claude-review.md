# Security review — Techies Playground (read-only, source-level)

Reviewed: `CONTEXT.md`, `docs/*.md`, `src/lib/license-vault.js`, `src/lib/vault.js`, `src/lib/recipe.js`, `src/lib/playground-preview.js`, `src/Preview.jsx`, `src/App.jsx` (launch flow, license manager, import handlers), `src/lib/wordpress-*.js`, `src/lib/github-repository.js`, `worker.js`, `wrangler.jsonc`, `package.json`/`package-lock.json`, `.github/workflows/*.yml`, `scripts/sync-wordpress-release.mjs`, and relevant parts of `node_modules/@wp-playground/client` / `@php-wasm/universal` to verify one hypothesis against the pinned dependency's actual code.

Overall the app is well-hardened for a client-only tool: strict CSP with `script-src 'self'` (no inline/eval), no `dangerouslySetInnerHTML`, no secret logging, AAD-bound AES-GCM license encryption with 600k-iteration PBKDF2, strict recipe/URL/slug validation, pinned GitHub Actions by SHA, and gated deploy conditions. Findings below are prioritized; none were exploited/tested, only traced through source.

## 1. (Medium-High, verified) Untrusted recipe import can trigger silent SSRF / arbitrary PHP-Wasm extension loading, hidden in a collapsed UI panel
- `src/lib/recipe.js:40-53` (`normalizeOptionalUrl`) accepts any `https:` URL **or** `http://localhost|127.0.0.1|[::1]` for `wxrUrl` and `phpExtensionManifestUrl`.
- `src/App.jsx:1616-1627` (`handleRecipeImport`) parses an imported `recipe.json`, runs `validateRecipe`, and immediately applies + saves it — no diff/warning is shown for these two fields.
- `src/App.jsx:2075-2133` — the fields live inside a `<details>` "Advanced settings" panel that is **closed by default**, so a user reviewing an imported recipe before clicking Launch is unlikely to notice them.
- `src/App.jsx:1798-1800` — at launch, `phpExtensionManifestUrl` is passed straight to `startPlaygroundWeb` as `extensions: [{ source: { format: 'manifest', manifestUrl: ... } }]`, i.e. code/config is fetched and loaded into the PHP-Wasm runtime **before WordPress starts**, with no scope restriction beyond the URL scheme check above.
- `wxrUrl` similarly becomes an `importWxr` Blueprint step (`recipe.js:176-181`) that fetches and imports arbitrary content into the new site on first setup.

**Prerequisites**: victim imports a `recipe.json` from an untrusted source (shared file, downloaded sample, plugin bundle, forum post) and clicks Launch without expanding Advanced settings.

**Impact**: 
- Browser-local SSRF: the Playground runtime can be made to fetch `http://localhost:<port>/...`, potentially pulling data from the victim's own local dev servers/admin tools into the new site's imported content.
- Arbitrary manifest-driven code loading into the PHP-Wasm sandbox at startup — undermines the product's own stated purpose of safely testing untrusted premium plugins, since a "test setup" recipe can itself carry the payload.
- Blast radius is confined to the `playground.wordpress.net` iframe origin (CSP `frame-ancestors`/`frame-src` prevent it reaching the launcher's own storage), so this is not a full origin-boundary bypass, but it is a real violation of the product's "reproducible, secret-free, inspectable recipe" invariant (`CONTEXT.md:14`).

**Remediation**: surface an explicit warning/confirmation when an imported recipe sets `wxrUrl`/`phpExtensionManifestUrl` (e.g., "this recipe fetches `<url>` at launch"); auto-expand Advanced settings when either is non-default on import; consider dropping `http://localhost` support for imported (vs. locally-authored) recipes.

## 2. (Medium, verified) Runtime-critical dependencies pinned to `"latest"` instead of a version range
- `package.json:17-18`: `"@wp-playground/blueprints": "latest"`, `"@wp-playground/client": "latest"`.
- `package-lock.json:2921-2944` currently resolves both to `3.1.47` with integrity hashes, and CI (`.github/workflows/deploy.yml:36`, `sync-wordpress-release.yml:35`) uses `npm ci`, so production deploys today are reproducible.
- The gap: any maintainer who runs `npm install` (not `npm ci`) to refresh dependencies will silently pick up whatever is published to the `latest` dist-tag at that instant, with no semver ceiling, then commit the resulting lockfile. These two packages constitute the entire embedded WASM PHP/WordPress execution engine, so a compromised publish would have very high impact if pulled in this way. This is already flagged as a process risk in `docs/architecture.md:122`, but the only mitigation is "remember to use npm ci" — not enforced by tooling.

**Remediation**: pin these two packages to an explicit semver range/exact version; optionally add a CI/lint check that fails the build if `package.json` contains a `"latest"` dependency declaration.

## 3. (Low-Medium, verified) CSP `connect-src` is broader than the app's actual needs
`worker.js:5`: `"connect-src 'self' https:"` permits `fetch`/`XHR` to any HTTPS host. The app only ever calls a small, enumerable set of hosts (`api.wordpress.org`, `api.github.com`, `playground.wordpress.net`, plus user-supplied `wxrUrl`/manifest URLs and any host a launched WordPress site's outbound networking feature contacts). Combined with the strict `script-src 'self'` this doesn't enable script injection by itself, but it removes a layer of defense-in-depth against exfiltration if any future DOM/data sink is found. Recommend narrowing to the specific hosts actually needed by the launcher chrome (the embedded Playground iframe's own networking is a separate, expected channel).

## 4. (Low, verified/self-correcting) Local package ID collisions overwrite silently, without a confirmation prompt
- `src/App.jsx:1506-1533` (`handleZipImport`): a newly uploaded ZIP's ID is computed via `normalizePluginId(file.name)` (`src/lib/recipe.js:60-69`); if an existing vault record shares that ID, `savePlugin` (`src/lib/vault.js:64-66`, an IndexedDB `put`) overwrites it in place — the code only reads the existing record to preserve its `label`, not to warn the user.
- This is a documented limitation (`docs/data-contracts.md:59`), not a newly discovered bug, but it is security-relevant: a file that happens to normalize to an existing trusted package's ID (e.g., a co-worker hands you `Acme-Pro-2.0.zip` when you already have `acme-pro` installed) silently replaces what every recipe referencing that ID will install next launch, with no diff/confirmation step.

**Remediation**: warn (not necessarily block) when an upload's normalized ID already exists in the vault and the uploaded file differs meaningfully (e.g. different size/hash) from the existing record.

## 5. (Informational, verified) `landingPage` validation permits protocol-relative strings, but this is not currently exploitable
`src/lib/recipe.js:102-104` only requires `landingPage` to start with `/`, which also matches `//evil.com/x`. I traced this through the pinned `@wp-playground/client`/`@php-wasm/universal` build: `pathToInternalUrl` (`node_modules/@php-wasm/universal/index.js:2909-2911`) does `${this.absoluteUrl}${path}`, so the value is appended *after* the existing origin rather than parsed as a new authority — confirmed **not** an open redirect with the currently pinned dependency version. Flagging only as defense-in-depth: tightening the regex to reject a leading `//` would remove reliance on this specific downstream implementation detail persisting across future `@wp-playground/client` upgrades.

## 6. (Informational) `workers_dev: true` exposes a second public origin
`wrangler.jsonc:6` leaves the default `*.workers.dev` subdomain enabled alongside the custom domain `play.techies.tools`. Same code and security headers apply, so this isn't a vulnerability, but it's an undocumented second public entry point; consider disabling if unintentional.

---

**Not exploitable / explicitly out of scope by design (confirmed, not re-flagged as new)**: license vault key material and plaintext are never persisted or logged (`src/lib/license-vault.js`, `src/App.jsx:690-890`); premium ZIPs run with full WordPress-admin trust inside the sandboxed iframe by design (`docs/data-contracts.md:143` already documents this as accepted threat model); preview-tab origin/scope validation (`src/lib/playground-preview.js:4-14`) correctly restricts to the exact `https://playground.wordpress.net` origin with no credentials and a launcher-scoped path.

**Not tested/executed**: no commands were run and no live requests were made; all findings are from static source review, cross-referenced against the pinned dependency source where noted.
