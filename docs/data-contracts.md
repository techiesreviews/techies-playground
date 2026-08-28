# Data contracts and security boundaries

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
| `landingPage` | string | `/wp-admin/plugins.php` | Must begin with `/`. |
| `plugins` | string[] | empty | Unique local plugin vault IDs. |
| `repositoryPlugins` | string[] | empty | Unique valid WordPress.org plugin slugs, max 100 chars each. |
| `theme` | string | empty | Local theme vault ID. Mutually exclusive with `repositoryTheme`. |
| `repositoryTheme` | string | empty | Valid WordPress.org theme slug or empty. |

Any serialized input containing a field named `licensekey`, `license_key`, `license-key`, `api_key`, `apikey`, or `secret` (case-insensitive) is rejected.

The starter recipe intentionally contains only the original minimal fields. Validation fills all later schema-1 defaults, preserving backward compatibility.

## Generated Blueprint

A validated recipe produces:

- `landingPage`.
- `preferredVersions.php` and `.wp`.
- `features.networking` and `.intl`.
- Optional `extraLibraries: ['wp-cli']`.
- Steps in order: WP config constants, site options, optional language, optional one-time Multisite, optional one-time WXR import, directory plugin installs, optional directory theme install, login.

Local ZIPs and the PHP extension manifest are not serialized into these steps. The manifest is passed as a Playground startup extension, and local ZIPs are installed through the ready client.

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
| `private-playground-launcher:persisted-sites` | Array of remembered OPFS site IDs. |
| `private-playground-launcher:browser-storage-default-v1` | One-time migration marker `1`. |
| `private-playground-launcher:changelog-seen-version` | Newest version the user opened. |

Parsers treat malformed records as absent and drop individually invalid saved recipes/history entries.

## Package vault IndexedDB

- Database: `private-playground-launcher`.
- Version: 2.
- Stores: `plugins` and `themes`, both keyed by `id`.
- Record: `{ id, label, filename, size, file, versionHint, savedAt }`.

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

The master password, derived key, and plaintext are never stored. The verifier distinguishes a wrong password without persisting a password hash intended for login.

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

## Security boundary

The system protects secrets at rest from casual inspection and keeps them out of normal development artifacts. It does not protect an unlocked key from malicious code already executing in the page, an infected browser, clipboard readers, or a malicious WordPress package after the user pastes a license.

Do not add secrets to:

- recipe fields;
- localStorage;
- source code or `.env` files;
- URLs, command-line arguments, or logs;
- Blueprint content;
- test fixtures copied from real licenses.

The stronger local-helper concept and its additional constraints are documented in [license-helper.md](license-helper.md), but it is not implemented.
