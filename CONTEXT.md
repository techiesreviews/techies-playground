# Techies Playground context

This is the first document an AI or new maintainer should read. It describes the current product vocabulary, boundaries, and invariants. Detailed reconstruction instructions are in [docs/rebuild-spec.md](docs/rebuild-spec.md).

## Product in one sentence

Techies Playground is a browser-local control panel that assembles and launches disposable or browser-persisted WordPress Playground environments using local premium ZIPs and packages from WordPress.org.

## Product goals

- Let a user test premium WordPress plugins and themes without provisioning a server.
- Keep uploaded ZIPs and site data inside the current browser profile.
- Keep license keys out of recipes, URLs, source control, logs, prompts, and Blueprints.
- Make test setups reproducible through validated recipe JSON.
- Support both short-lived experiments and resumable browser-saved environments.
- Keep stable WordPress choices current while retaining offline fallback choices.

## Non-goals

- Hosting production WordPress sites.
- Uploading ZIPs, site data, or licenses to a Techies backend. There is no application backend.
- Automatically discovering premium vendor downloads or handling vendor credentials.
- Guaranteeing durable browser storage; browser quotas and eviction still apply.
- Providing password recovery for the encrypted license vault.

## Domain glossary

| Term | Meaning in this repository |
| --- | --- |
| Launcher | The React application rendered by `src/App.jsx`. |
| Playground | The WordPress runtime embedded from `playground.wordpress.net/remote.html`. It runs WordPress in WebAssembly with SQLite. |
| Recipe | Validated, secret-free JSON describing an environment and package references. |
| Blueprint | The runtime instructions derived from a recipe for WordPress Playground. A recipe is the app's durable contract; a Blueprint is generated execution input. |
| Package vault | IndexedDB database containing uploaded plugin and theme ZIP `File` objects and safe metadata. |
| License vault | A separate IndexedDB database containing AES-GCM ciphertext and the PBKDF2 parameters needed to derive an in-memory key. |
| Local package | A premium plugin or theme ZIP stored in the package vault and referenced by a stable local ID. |
| Directory package | A WordPress.org plugin or theme referenced by its validated public slug. |
| Draft | The current in-progress recipe, automatically kept in `localStorage`. |
| Saved recipe | A named, reusable recipe record kept in `localStorage`. |
| Spin-up | One successful launch. Its safe metadata is recorded in history. |
| Browser-saved environment | A Playground WordPress filesystem mounted to OPFS and resumable by recipe identity. |
| Temporary environment | An in-memory Playground whose site changes are discarded when closed. |
| Site identity | Normalized combination of recipe name, resolved WordPress version, and PHP version. It selects the OPFS path. |
| Snapshot | A downloaded ZIP of the running site's `wp-content`, not a full server image. |

## System map

```text
User
  -> React launcher (`src/App.jsx`)
       -> recipe validation and Blueprint generation (`src/lib/recipe.js`)
       -> localStorage: draft, recipes, history, preferences, UI markers
       -> IndexedDB package vault: plugin/theme ZIPs
       -> IndexedDB encrypted license vault
       -> WordPress.org public APIs: versions, plugins, themes
       -> GitHub public API: repository star count
       -> embedded WordPress Playground client
            -> in-memory WordPress + SQLite
            -> optional OPFS `/wordpress` persistence
            -> local ZIP install/activation
            -> WordPress.org Blueprint installs

Git push to `main`
  -> GitHub Actions tests and build
  -> Cloudflare Worker and static assets
  -> `https://play.techies.tools`
```

## Invariants that must survive a rebuild

1. There is no app-owned upload or search proxy. ZIPs, decrypted licenses, and WordPress data never pass through a Techies server.
2. Every recipe is normalized through `validateRecipe` before it is saved, exported, imported, launched, or added to history.
3. Recipes and history never include ZIP contents or license keys.
4. Local plugin/theme IDs remain separate from WordPress.org slugs.
5. A recipe may select many plugins but at most one theme, either local or WordPress.org.
6. `latest` must be resolved from WordPress.org at launch and the launched exact version must be verified before setup continues.
7. New browser-saved sites run one-time setup, then mount OPFS. Resumed sites mount OPFS before startup and skip WordPress installation and one-time setup.
8. Temporary running sites warn before page unload and require confirmation before closing from the Playground header.
9. The license master password and derived `CryptoKey` are never persisted. Locking or closing the manager drops the in-memory key reference.
10. Deployment means updating changelog/version metadata, committing to `main`, and pushing `main`; the GitHub pipeline deploys to Cloudflare.

## Current implementation shape

- React 19, Vite 7, Tailwind CSS 4, Heroicons.
- `src/App.jsx` is deliberately the orchestration and presentation center. Pure data rules live in `src/lib` and are tested with Node's built-in test runner.
- `worker.js` only serves built assets through a Cloudflare Worker and adds security headers.
- There is no router, global state library, server database, analytics client, or authentication layer.
- The source-controlled app version is `0.7.1` in the current working tree.

## Where to look next

- [Documentation index](docs/README.md)
- [Exact product and UI rebuild specification](docs/rebuild-spec.md)
- [Architecture and runtime flows](docs/architecture.md)
- [Data contracts and security boundaries](docs/data-contracts.md)
- [Test inventory and manual verification matrix](docs/testing.md)
- [Product history and superseded behavior](docs/product-history.md)
- [Change/experiment records](docs/changes/README.md)
