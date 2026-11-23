# Data contracts and security boundaries

## Independent private proof jobs

The on-demand runner's local queue is separate from recipes and the browser's stores.
A job contains only a generated UUID `id` and ISO `queuedAt`. There is no arbitrary
recipe, URL, credential or package input. Atomic rename moves a complete job from
`queued` to `running`; completion moves it to `finished`. Interrupted claims remain
in `running` without automatic retry. This is a local claim, not a distributed lease.

`~/.local/share/techies-playground/runs/<id>/report.json` has `schemaVersion: 1`, job,
timestamps, runtime versions, stage statuses, measured data, optional blocker and
`verdict` (`go` or `no-go`). Its escaped, self-contained `report.html` contains the same
data. New directories use 0700; files use 0600. Profiler nonces, cookies and profiling
keys are never copied into reports. See [private-runner.md](private-runner.md).

Design jobs use the same fixed job shape in a separate `design-tests/` subtree.
Their reports add `kind: "design-test"`, `ai` and `design`. AI statuses include
`running`, `completed`, `paused` and `blocked`; a limit is a finished attempt with a
paused result, not an automatic retry. `design` records misses, the saved page ID,
native block inventory, zero-invalid-block readback, and 1440/390 pixel captures.
Each capture records dimensions, reference/rebuild filenames, changed pixels, match,
overflow and repeated/broken-capture calibration. `go` means the pipeline completed;
it does not mean the design has no misses. A completed design can have
`outcome: "needs-work"`. Missing stages never produce passing numbers.
The cold observation is the first frontend request to the saved rebuilt page; five
warm observations precede screenshot navigation. A deferred capture callback runs
only after all six real collector responses have completed. A failed measurement
does not start capture or fabricate observations.

The AI response uses only `core/group`, `core/columns`, `core/column`, `core/heading`
and `core/paragraph`, at most 60 blocks and depth 10. Block attributes are decoded
from the CLI's strict JSON response, allowlisted, and rejected for markup or external
resource references before entering WordPress. The CLI inherits only ordinary process
settings, ignores provider/MCP user configuration for generation, forces ChatGPT login
and the OpenAI provider, and uses a read-only sandbox with shell tools disabled.
There is no API-key input, credential extraction, paid fallback or custom provider.
Exact cash cost is unavailable; the report does not claim an audited zero charge.

## Recipe schema version 1

Recipes are the only supported portable configuration format. Unknown fields may be present on import but are discarded by normalization. Missing known fields receive current defaults.

| Field | Type | Default | Rules and meaning |
| --- | --- | --- | --- |
| `schemaVersion` | number | `1` | Must equal 1. |
| `name` | string | `Untitled playground` | Required, trimmed, max 80 chars. |
| `wordpress` | string | `latest` | `latest`, `beta`, `nightly`, a two/three-part release, or beta/RC release. |
| `php` | string | `8.3` | One of 7.4 or 8.0–8.5. |
| `networking` | boolean | `true` | Playground outbound networking feature. |
| `intl` | boolean | `false` | Enable PHP Intl. |
| `storage` | string | `browser` | `browser` or `temporary`. |
| `language` | string | `en_US` | Locale matching the repository's locale expression. |
| `multisite` | boolean | `false` | Enable Multisite only during first setup. |
| `siteTitle` | string | `My WordPress Website` | Trimmed, max 120 chars. |
| `tagline` | string | empty | Trimmed, max 240 chars. |
| `permalinkStructure` | string | `/%postname%/` | Plain, post name, or month/name. |
| `debug` | boolean | `false` | `WP_DEBUG` and display flag. |
| `debugLog` | boolean | `false` | Effective only with `debug`; controls `WP_DEBUG_LOG`. |
| `scriptDebug` | boolean | `false` | `SCRIPT_DEBUG`. |
| `wpCli` | boolean | `false` | Adds Playground's `wp-cli` extra library. |
| `wxrUrl` | string | empty | Empty, HTTPS, or localhost HTTP; one-time import. |
| `phpExtensionManifestUrl` | string | empty | Empty, HTTPS, or localhost HTTP; passed to Playground startup. |
| `landingPage` | string | `/wp-admin/plugins.php` | Must be an internal `/` path; external authorities, backslashes, whitespace/control characters and recognized credential parameters are rejected. |
| `plugins` | string[] | empty | Unique local plugin vault IDs. |
| `repositoryPlugins` | string[] | empty | Unique valid WordPress.org plugin slugs, max 100 chars each. |
| `theme` | string | empty | Local theme vault ID. Mutually exclusive with `repositoryTheme`. |
| `repositoryTheme` | string | empty | Valid WordPress.org theme slug or empty. |

External URLs and landing paths reject URL userinfo and recognized credential parameters in queries/fragments (including token, API/auth key, signature, password, nonce and JWT aliases). Percent-encoded names are decoded by URLSearchParams; residual percent encodings in names are rejected. Harmless query parameters and loopback HTTP development URLs remain supported. This is not a detector for arbitrary secrets in URL paths or free text. Invalid draft input is never serialized; its localStorage entry is removed. Invalid legacy persisted recipes are dropped by the existing loaders.

Any serialized input containing a field named `licensekey`, `license_key`, `license-key`, `api_key`, `apikey`, or `secret` (case-insensitive) is rejected.

The starter recipe intentionally contains only the original minimal fields. Validation fills all later schema-1 defaults, preserving backward compatibility.

Selected directory-plugin names and artwork are session-only UI metadata. They do not become recipe fields; refreshed or imported recipes can display their public slugs until metadata is available.

## Generated Blueprint

A validated recipe produces:

- `landingPage`.
- `preferredVersions.php` and `.wp`.
- `features.networking` and `.intl`.
- Optional `extraLibraries: ['wp-cli']`.
- Steps in order: WP config constants, site options, a `writeFile` of the Freemius must-use plugin (`/wordpress/wp-content/mu-plugins/techies-freemius.php`, every launch), optional language, optional one-time Multisite, optional one-time WXR import, tester-edition deactivation, directory plugin installs, recording active tester ownership, optional directory theme install, login.

Local ZIPs and the PHP extension manifest are not serialized into these steps. The manifest is passed as a Playground startup extension, and local ZIPs are installed through the ready client.

## Preview tabs

Preview navigation is an ephemeral UI contract, separate from recipes: `#preview=<encodeURIComponent(https://wp.techies.tools/scope:launcher-<12 hex>/<path>?<query>#<fragment>)>`. The target must use the exact HTTPS Playground host origin from `src/lib/playground-host.js` (`https://preview-wp.techies.tools` on the preview), contain no URL credentials, and have a launcher scope. The fragment is not sent to the launcher hosting server. WordPress preview nonces, if present in the original link, remain in this browser URL; it is not a public sharing link.

`BroadcastChannel('techies-preview:<scope>')` carries only `{ type: 'ping' }`, `{ type: 'alive' }`, and `{ type: 'closed' }`. It transports no WordPress data or vault contents. The scope is unique per launch and is not a replacement for WordPress authorization. The preview shares the active site's WordPress permissions and can navigate within it; it is not a read-only sandbox. The generated mu-plugin lives in the site filesystem and is refreshed on launch, so snapshots can include it. No recipe or persisted-site index schema changes.

## Stable local package identity

`normalizePluginId` removes `.zip`, removes a trailing semantic version (including alpha/beta/RC variants), lowercases the result, changes non-alphanumeric runs to `-`, trims dashes, and caps at 64 characters.

Example: `Acme-Pro_v2.4.0-beta.7.zip` becomes `acme-pro`. This is why Replace ZIP can preserve recipe references across updates. Two unrelated packages that normalize to the same ID will overwrite the same vault record.

## localStorage

| Key | Value |
| --- | --- |
| `private-playground-launcher:draft` | One normalized recipe. |
| `private-playground-launcher:saved-recipes` | Array of `{ id, savedAt, recipe }`. |
| `private-playground-launcher:spinup-history` | At most 30 safe spin-up records. |
| `private-playground-launcher:plugin-recency` | Map of local plugin ID to numeric timestamp. |
| `private-playground-launcher:theme-recency` | Map of local theme ID to numeric timestamp. |
| `private-playground-launcher:persisted-sites@<Playground host origin>` | Array of remembered OPFS site IDs for that Playground host (`persistedSitesKey`). OPFS belongs to the host's origin, so a site saved on one host cannot resume on another. |
| `private-playground-launcher:persisted-sites` | The same list for `https://playground.wordpress.net`, the host before self-hosting; used again only if the launcher is switched back. |
| `private-playground-launcher:browser-storage-default-v1` | One-time migration marker `1`. |
| `private-playground-launcher:changelog-seen-version` | Newest version the user opened. |

Missing saved-list keys are empty lists. Invalid JSON (including a present empty string) or a non-array root is an unreadable list, not an empty one. The parsers throw a contextual read error; UI reads return records plus an error notice and leave raw storage intact. Both lists refuse mutations while their current stored value is unreadable. There is no automatic reset or repair. Individually invalid or unsafe records inside a readable array are still dropped while valid siblings remain usable.

History is read without a mount-time write. Only a successful launch append or an explicit row removal reads the latest stored list, validates it and writes history. A history read/write failure shows a non-blocking notice and does not fail an otherwise successful launch. The cap of 30 and browser-site deduplication remain unchanged. History read/modify/write is synchronous within a tab; unlike saved recipes, it does not add Web Locks across tabs.

Readable legacy history rows without an ID get deterministic position-based fallback IDs in memory, avoiding all IDs already present in the array. Repeated reads of unchanged storage give the same identity so the first removal works. The next explicit write serializes these safe IDs; loading alone writes nothing. Newly appended launches still use random UUIDs.

Saved-recipe saves, imports, rename-updates and removals read the latest array immediately before writing, rather than persisting a tab's cached array from an effect. Web Locks serialize these read/modify/write operations across cooperating tabs where supported; browsers without Web Locks still read fresh storage, but simultaneous writes are not atomic. Storage events refresh the displayed library without writing it back. The record schema and normalized-name replacement rule are unchanged.

`recipe-library.js` keeps row identities and per-record operation queues only in page memory. The identity follows successful renames and retains the observed record's serialized value; an older save/remove refuses to mutate a different value now stored at that ID. Selection resolves the resulting record, while external removal/clearing invalidates old identities. None of this adds fields to stored records or changes the draft/history schemas.

## Package vault IndexedDB

- Database: `private-playground-launcher`.
- Version: 2.
- Stores: `plugins` and `themes`, both keyed by `id`.
- Record: `{ id, label, filename, size, file, versionHint, savedAt }`.

Page-wide drops classify archives from WordPress headers before saving into `plugins` or `themes`; filenames still determine stable IDs. There is no schema change or batch-count cap. Invalid/ambiguous archives fail individually. Multiple themes are stored, but only the last successful theme is selected and `repositoryTheme` is cleared. Browser quota failures are reported per file.

The plugin and theme file pickers validate and save each file independently, continue after failures, and refresh their rows once the batch ends. Valid plugins are selected; the last valid theme is selected and clears the directory theme. Errors name failed files; successful rows show what imported. The input resets so the same batch can be retried.

`file` is the uploaded browser `File`/Blob. This database is not encrypted because plugin/theme ZIPs must be supplied directly to Playground. It is origin- and browser-profile-local.

## License vault IndexedDB

- Database: `private-playground-license-vault`.
- Version: 1.
- Stores: `meta` and `licenses`, both keyed by `id`.

Meta record:

```json
{
  "id": "vault",
  "salt": "base64 16-byte random salt",
  "iterations": 600000,
  "verifier": { "iv": "base64", "ciphertext": "base64" }
}
```

License record:

```json
{
  "id": "random UUID",
  "name": "visible after unlock",
  "pluginId": "plugin:<id> or theme:<id>",
  "iv": "base64 12-byte random IV",
  "ciphertext": "base64 AES-GCM output",
  "createdAt": "ISO timestamp"
}
```

Key derivation is PBKDF2-HMAC-SHA-256 with 600,000 iterations and a per-vault salt, producing a non-exportable 256-bit AES-GCM key. Each secret has a unique IV. Authenticated additional data binds ciphertext to `id`, `pluginId`, and `name`, so metadata tampering prevents decryption.

The meta record is written with IndexedDB `add`, so a second vault creation that started before the first finished fails with "The encrypted license vault already exists." instead of replacing the salt and verifier. Before encrypting a new license, `addLicense` checks that the key opens the current vault's verifier, and it writes the license in one transaction with a re-read of the meta record that must still match the checked salt and verifier, so a session that outlived a reset in another tab (before or during the save) cannot write a license nobody can read. The master password, derived key, and plaintext are never stored. The derived key stays in memory for the page session after an unlock (`src/lib/vault-session.js`); Lock or a reload drops it. `readLicenseKeysForPackages` decrypts the newest record per `plugin:<id>` for the automatic fill and requires a session signal; the plaintext goes only into the body of one `client.run` PHP request (`{ "<plugin folder>": "<key>" }`) and is not kept. A per-manager AbortController invalidates pending work on lock, close, unmount and reset. Clipboard copying requires a session signal and checks it before reads, after reads and immediately before submitting the write after decryption. Late create/unlock results and metadata continuations are discarded. Cancellation cannot retract clipboard writes already submitted to the browser. The verifier distinguishes a wrong password without persisting a password hash intended for login.

When the launcher's `listLicenseMetadata()` read fails, encrypted IndexedDB records are not altered or cleared. The launcher keeps its previously loaded in-memory metadata list (or `null` when initial load failed), surfaces a fixed plain-language read error with a retry action without raw browser error text, suppresses misleading missing-key counts while unloaded, and pauses Launch/Start for setups with uploaded plugins until a subsequent read succeeds.

## OPFS WordPress data

- Base path: `private-playground-launcher/sites/`.
- Site path: normalized recipe name + exact WordPress version + PHP version, max 96 chars.
- Mountpoint inside Playground: `/wordpress`.

OPFS contains the WordPress filesystem and SQLite-backed site state. It is distinct from recipe/history metadata. Clearing origin data can remove localStorage, IndexedDB, and OPFS.

## Spin-up record

```json
{
  "id": "random UUID",
  "launchedAt": "ISO timestamp",
  "recipe": "normalized recipe object",
  "plugins": [{ "id": "safe id", "label": "display name", "version": "optional" }],
  "theme": { "id": "safe id", "label": "display name", "version": "optional" }
}
```

`theme` may be `null`. No `file`, ciphertext, plaintext secret, WordPress database, or arbitrary runtime output belongs here.

## Premium plugins without a licence

When checks are in the setup, `FREEMIUS_LICENSES_CODE` (`src/lib/license-fill.js`) runs once per launch after the key fill and prints one line that starts with `TECHIES_FREEMIUS_LICENSES:` followed by JSON with two lists of plugin folder names, for example `{"unlicensed":["wsal-premium"],"licensed":["menu-image"]}`. `unlicensed` names each Freemius plugin whose premium build cannot use its premium code yet; `licensed` names each Freemius plugin whose licence is already active in the site (`can_use_premium_code()`, which includes an expired licence that still unlocks the premium features). It carries no key or licence data. The launcher keeps only names that are valid folder names; the lists live in memory for the launch (`licensedPackageIds`, `siteLicensedIds`) and are not stored. When the probe fails or its line is missing, the status is unknown and every launched uploaded plugin counts as needing a licence, so the checks wait.

## Plugin updates at start

`PLUGIN_UPDATES_CODE` (`src/lib/plugin-updates.js`) runs once per launch through `client.run` and prints one line that starts with `PLAYGROUND_UPDATES:` followed by JSON:

```json
{
  "updated": [{ "name": "Plugin or theme name", "from": "1.0.0", "to": "1.1.0" }],
  "failed": [{ "name": "Plugin or theme name", "message": "WordPress's last message, at most 200 characters" }],
  "current": [{ "name": "Plugin or theme name", "version": "1.1.0" }]
}
```

When WordPress.org does not answer the plugin or theme update check, `failed` holds an entry named `Plugin update check` or `Theme update check` whose message gives the error or HTTP status, and `current` lists nothing for that kind.

The launcher keeps the parsed result only in memory (`pluginUpdates` state: `idle`, `running`, `skipped` when networking is off, `done` with the result, `error` with a message). It is not saved to localStorage, the spin-up record or the recipe.

## Checks measurement

When a page is loaded with `techies-measure=1`, the measure must-use plugin (`techies-measure.php`) appends one HTML comment `<!-- TECHIES_MEASURE:<base64 JSON> -->` with these fields: `title`, `time` (seconds), `memory` and `memoryLimit` (bytes), `queries`, `queryTime`, `slowQueries`, `duplicates`, `errorCounts` (`error`, `warning`, `notice`, `deprecated`), `errors` (`kind`, `message`, `file`, `line`), `calls` and `failedCalls` (every call to another site, and those that failed or answered 400 or higher), `http` (`host`, `code`: the first 20 calls plus up to 20 later failed ones, used only for host names), `plugins` (the five slowest, `name` and `time`), `repeated` (up to three repeated queries, most repeated first: `count` and `caller`, the name of the function that ran it), `source` and `qmVersion`. When Query Monitor is active and collecting (it stops on pages it does not support, such as the Site Editor or a Customizer preview, by firing `qm/cease`), the time, memory, query, slow-query, duplicate, error and call numbers are the ones Query Monitor collected on that page load (`source` is `query-monitor` and `qmVersion` is its version); otherwise the measure plugin counts them itself (`source` is `playground`). The plugin load times are always the measure plugin's own, because Code Profiler only profiles from its own screen. It records no query text, no request bodies or headers, and no full outbound URLs (only the host). An error message keeps at most 200 characters, and any web address in it loses its query (`?…`), where licence checks usually carry the key. A vendor that puts the key in the address's path would still show it in the panel; the message lives only in memory and is never stored. The title is plain text, not HTML. `parseMeasurement` reads only these fields and treats anything else as missing. The result lives only in memory (`checksRun` state) and is replaced by the next run; a run that finishes after the site closed or relaunched is dropped.

## Security boundary

The system protects secrets at rest from casual inspection and keeps them out of normal development artifacts. It does not protect an unlocked key from malicious code already executing in the page, an infected browser, clipboard readers, or a malicious WordPress package after the user pastes a license.

The header requests the repository's public `stargazers_count` from `api.github.com` and links to `github.com`. The application passes no recipe, package, vault, or license data in that request. Normal browser request metadata still reaches GitHub, and a failed request only removes the visible count; it does not disable the repository link.

Do not add secrets to:

- recipe fields;
- localStorage;
- source code or `.env` files;
- URLs, command-line arguments, or logs;
- Blueprint content;
- test fixtures copied from real licenses.

The stronger local-helper concept and its additional constraints are documented in [license-helper.md](license-helper.md), but it is not implemented.

## Uploaded plugin activation state

`pluginInstallResults` is session-only launcher state keyed by local package ID. It contains a fixed status (`active`, `inactive`, `unknown` or `failed`) and safe fixed UI text, never raw PHP/vendor output or licence data. `techies_upload_activation_failed` is a WordPress option containing failed plugin basenames only. The `techies-uploaded-plugins.php` must-use plugin uses it to render an inline error on an inactive plugin row; successful activation verification clears that basename. These site-local records may be included in a site snapshot. Recipe, package-vault and encrypted licence-vault schemas remain unchanged. Free/Pro tester selections use their existing local IDs (`query-monitor[-pro]`, `code-profiler[-pro]`), and only one edition is selected at a time.

### Launcher-owned tester editions

The WordPress option `techies_launcher_testers` stores an array of built-in tester package IDs that the launcher selected and confirmed active. Directory installs record ownership in the Blueprint; uploaded tester installs refresh it after activation. A later launch deactivates competing editions of selected testers and previously owned editions removed from the setup. Testers with no recorded ownership are preserved when absent from the setup. Older sites without this option are not assigned ownership by inference. This is site-local WordPress data and contains no licence keys.
