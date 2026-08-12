# Techies Playground

A browser-local control panel for starting WordPress Playground with premium plugin ZIPs you own.

The WordPress selector refreshes stable versions from the official WordPress.org update API at runtime. The `latest` option is resolved by WordPress Playground at launch, while exact patch versions remain available for reproducible compatibility tests. A built-in list keeps the launcher usable offline.

## Security boundary

- Plugin ZIPs are stored in IndexedDB in the current browser profile.
- ZIPs are passed directly to WordPress Playground in the browser. The launcher has no upload endpoint.
- The environment picker supports the current WordPress release plus historical version lines from 6.3 onward. A version line such as `6.8` resolves to Playground's newest available `6.8.x` build.
- Recipes contain environment settings and local plugin IDs only.
- License keys may be stored only in the optional encrypted license vault. Plaintext keys are never added to recipes, logs, URLs, source control, or a Blueprint.
- The vault derives a non-exportable AES-256-GCM key from a master password with PBKDF2-SHA-256. The master password and derived key are never persisted.
- Outbound networking is opt-in per recipe, but most vendor activation servers require it.

This keeps plaintext keys out of normal Codex workflows, source control, recipe files, and launcher logs. It is encryption at rest, not a hard security boundary against compromised code running in the unlocked page. Closing or locking the manager removes its decryption key from application memory. Copy is always user-triggered; clipboard contents can still be read by other local applications. The selected premium plugin may send a pasted key to its vendor, as expected. Use the vendor's staging/development-license policy where available; Playground URLs can change between sessions.

### Storage choices

Use these options in preference order:

1. **Windows Credential Manager or user-scoped DPAPI through a local helper.** The launcher stores only an opaque credential ID. A narrowly scoped helper retrieves one named key after an explicit local action, uses it once, and clears plaintext memory. Microsoft recommends Credential Manager first and DPAPI for locally persisted secrets.
2. **Passkey-bound browser encryption.** A future WebAuthn PRF mode can derive a wrapping key from a passkey after user verification, making encrypted licenses inaccessible without that credential. Support and credential-recovery behavior must be feature-detected before this can replace the password flow.
3. **The current password-encrypted browser vault.** AES-256-GCM with a unique IV and authenticated metadata protects stored ciphertext. PBKDF2-HMAC-SHA-256 at 600,000 iterations follows the documented fallback work factor where a memory-hard browser KDF is unavailable.

Never store a license in plaintext `localStorage`, a recipe, URL, command-line argument, environment variable, Blueprint, or log. IndexedDB and OPFS are persistence mechanisms, not secret managers unless the value is encrypted with a key stored elsewhere.

## Run locally

```powershell
cd playground-launcher
npm install
npm run dev
```

Open the local URL printed by Vite, add your plugin ZIPs, choose a setup, and launch WordPress.

## Deploy to Cloudflare Workers

The production build is served by the `playground` Worker and mapped to `play.techies.tools` as a Cloudflare Custom Domain. The Worker adds a restrictive Content Security Policy and other browser security headers before serving the Vite assets.

```powershell
npm run deploy:check
npm run deploy
```

Deployment requires an authenticated Wrangler session and the `techies.tools` zone in the same Cloudflare account. Cloudflare creates the Custom Domain DNS record and certificate during deployment; an existing CNAME at `play.techies.tools` must be removed first.

### Automatic production deployment

`.github/workflows/deploy.yml` tests, builds, and deploys every push to `main`, but only when the push actor is `techiesreviews` and production deployment has been explicitly enabled. The workflow has read-only repository permissions and uses immutable action revisions.

Create a Cloudflare API token scoped to this account and Worker deployment, then configure it without printing or committing it:

```powershell
.\scripts\configure-cloudflare-deploy.ps1
```

The script verifies the active GitHub account, prompts securely for the token, stores it as the encrypted `CLOUDFLARE_API_TOKEN` GitHub secret, records the account ID as a repository variable, enables production, and starts the first workflow run. Never add the token to this repository or an `.env` file.

## Advanced environment settings

Expand **Advanced settings** under Environment to configure the WordPress language, landing page, site title and tagline, permalink structure, Multisite, PHP Intl, WP-CLI, WordPress debugging, a trusted WXR import URL, and an optional PHP-Wasm extension manifest.

Storage can remain temporary or persist the WordPress filesystem in browser OPFS. Browser-saved sites resume by recipe name plus WordPress/PHP version. External WXR and extension URLs must use HTTPS (localhost HTTP is permitted for development) and should be treated as executable input. After a successful launch, **Export snapshot** downloads the site's `wp-content` archive, including its SQLite-backed content.

## Saved recipes

- The current draft is saved into the browser recipe library on first load.
- Use **Save recipe** to add or replace a named setup.
- Saved recipes appear as an alternative to choosing individual plugins.
- Importing a recipe also saves it to the local library.
- Saved recipes contain only environment settings and local vault IDs.
- Hover a saved recipe and choose **Edit** to load it into the form. **Update recipe** replaces that record even when you rename it, so the old copy is not left behind.

## WordPress.org plugins and themes

- Search the **Choose plugins** or **Choose themes** list to search uploaded packages and the official WordPress.org directory at the same time.
- Browser-uploaded premium ZIPs appear first. Directory results follow and include artwork served only from WordPress.org's plugin icon and theme screenshot hosts.
- Search results come directly from the public WordPress.org APIs; Techies Playground has no search proxy or credential.
- Recipes store only validated directory slugs. At launch, official Playground Blueprint resources download and activate the current directory releases.
- Premium ZIP IDs and WordPress.org slugs remain separate, so a public result cannot replace a browser-local premium package.

## Past spin-ups

- Every successful launch adds a browser-local history entry.
- History records the safe recipe, launch time, and plugin names and versions—not ZIP contents, WordPress data, or license keys.
- Choose **Past spin-ups** and select a row to restore an earlier launch configuration.
- The newest 30 launches are retained in the current browser profile.

## Keeping premium plugins current

An uploaded ZIP is a snapshot; the launcher cannot discover a protected vendor download without handling vendor credentials.

Use either of these safe paths:

1. Choose **Replace ZIP** beside a vault plugin. Version suffixes such as `1.0.0-beta.7` are removed from new vault IDs, so importing a newer package replaces the old package without breaking recipes.
2. Launch WordPress, activate the license in the plugin, then choose **Update all** in the Playground header. This asks WordPress and each vendor updater for available releases and installs every available plugin update in one run.

The second path works only when the premium plugin registers updates through WordPress and the license permits downloads. It never exposes the license to the launcher.

The plugin chooser searches names, vault IDs, filenames, and versions. Newly imported or selected plugins move to the top; this recency order is retained in the current browser profile.

## Ask Codex for an environment

Export a recipe from the UI, then ask Codex to adjust that JSON. Recipes use this safe shape:

```json
{
  "schemaVersion": 1,
  "name": "My test stack",
  "wordpress": "latest",
  "php": "8.3",
  "networking": true,
  "landingPage": "/wp-admin/plugins.php",
  "plugins": ["plugin-id-from-your-local-vault"]
}
```

Import the adjusted recipe in the UI. If a referenced ZIP is not present locally, the launcher tells you which plugin ID is missing.

## Important limitations

- Playground is SQLite-backed and remains for development and testing, not production. Temporary launches are discarded; browser-persisted launches remain subject to browser storage quotas and eviction.
- Some vendors count Playground as a real activation or reject its temporary URL. Follow the vendor's license terms and deactivate licenses before discarding a site when required.
- IndexedDB belongs to one browser profile and origin. Clearing site data removes the local ZIP and encrypted license vaults.
- The encrypted license vault has no password recovery. Resetting it permanently deletes every stored license.
- Encryption at rest does not protect a key while it is visible, copied to the clipboard, or decrypted in an unlocked compromised page.
- Do not put plugin ZIPs, `.env` files, or exported secrets in this repository.

## Local license assistance

The encrypted browser vault is designed for local convenience and keeps keys opaque at rest. A native, plugin-specific helper backed by Windows Credential Manager can provide a stronger operating-system boundary:

```text
Windows Credential Manager
        ↓ user approval
local native helper
        ↓ one activation only
plugin-specific WordPress endpoint or form
```

The helper must never accept keys in command-line arguments, environment variables, recipes, URLs, or logs. It should read one named credential only after an interactive user action, call a documented plugin-specific activation interface, then discard the plaintext value.

See [docs/license-helper.md](docs/license-helper.md) for the proposed boundary and why it is not safe to make this generic.
