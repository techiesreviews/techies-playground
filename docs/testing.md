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

For a deployment preparation, also run `npm run deploy:check`. Per `AGENTS.md`, normal deployment happens only by pushing verified changes to `main`; do not use direct Wrangler deployment unless explicitly requested.

## Current automated suite

The suite uses Node's built-in test runner and contains 50 tests in the current working tree.

| Test module | Coverage |
| --- | --- |
| `recipe.test.js` | Stable IDs, version hints, labels, default storage, validation, advanced settings, Blueprint output, directory installs, secret-field rejection. |
| `wordpress-versions.test.js` | Live version normalization, exact latest resolution, preserved saved versions, fetch contract. |
| `wordpress-org-plugins.test.js` | Slugs, normalized/sanitized results, entity decoding, artwork host allowlist, search and featured request parameters. |
| `wordpress-org-themes.test.js` | Slugs, HTTPS screenshot normalization, artwork host allowlist, search request. |
| `github-repository.test.js` | Public star-count normalization and the fixed Techies Playground repository API request. |
| `vault.test.js` | Separate theme storage and IndexedDB transaction completion. |
| `license-vault.test.js` | Authenticated encryption round trip, wrong-password failure, deletion transaction completion. |
| `saved-recipes.test.js` | Upsert, rename-replace, safe round trip, invalid-record dropping. |
| `spinup-history.test.js` | Safe metadata, order/cap, invalid-record dropping, theme metadata, saved-environment deduplication. |
| `plugin-preferences.test.js` | Recency ordering, multi-field search, valid timestamp persistence and deletion. |
| `playground-persistence.test.js` | Unload warning, one-time storage-default migration, site identity/persistence labels. |
| `sync-wordpress-release.test.mjs` | Stable release selection, branch normalization, minor version bump, no-op and generated release edits. |

The suite does not render React components or start WordPress Playground. It proves pure contracts, not full browser behavior.

## Manual smoke matrix

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
| Identity change | Change recipe name, exact WordPress, or PHP and launch. | A distinct OPFS environment is used. |
| Packages | Launch local and directory plugins plus local/directory theme. | Plugins activate; selected theme is active; local theme verification passes. |
| History | Launch temporary and saved configurations repeatedly. | Newest first, max 30, saved identity deduplicated, status labels correct. |
| Snapshot | Export after setup. | A readable `<name>-wp-content.zip` downloads. |
| Update all | Use a package with an available safe test update. | Success/failure summary matches WordPress result and UI returns to Plugins. |
| License vault | Create, wrong-password unlock, add, lock, unlock, copy, delete, reset. | Ciphertext persists; wrong password fails; plaintext appears only in field/clipboard; reset deletes all entries. |
| Failure cleanup | Interrupt or fail runtime/package setup. | Iframe blanks, shell closes, client is invalidated, error remains visible in launcher. |

## Deployment verification

After pushing `main` for deployment:

1. Confirm the GitHub `Deploy production` run belongs to the pushed commit.
2. Confirm install, tests, build, and Wrangler steps succeed.
3. Open `https://play.techies.tools` and check title, current changelog version, and a non-destructive launch/search smoke.
4. Inspect response headers for the CSP and other headers defined in `worker.js`.
5. Record the run URL, live check result, and any rollback/follow-up in the change record.

## Known coverage gaps at the 2026-08-28 baseline

- No component, accessibility automation, screenshot regression, or end-to-end browser tests.
- No automated WordPress Playground launch, OPFS resume, snapshot, or update-all test.
- No automated Cloudflare header assertion.
- IndexedDB tests use focused fakes and do not exercise every browser lifecycle/blocked-upgrade condition.
- The local collaborative-browser snapshot failed during this documentation pass, so visual conformance was inspected from source rather than claimed as a browser-tested result.
- A local Node 24.15.0 build stalled while importing the Tailwind Vite plugin; CI uses Node 22. Treat this as an environment-specific inconclusive result until reproduced or cleared on the supported CI runtime.
