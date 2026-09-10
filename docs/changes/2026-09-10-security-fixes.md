# Security remediation and 0.7.1 release

- Date: 2026-09-10
- Owner: Codex
- Status: complete
- Disposition: kept
- Related version: 0.7.1
- Related commit/issue: Supersedes the affected findings in [the security assessment](2026-09-10-security-review.md); base c3a59ba57686b9fc7c06343ed84dbeac329a1c12.

## Context

The user authorized fixing the reported findings and deploying through the GitHub pipeline. The earlier assessment remains unchanged as historical evidence.

## Hypothesis and success criteria

Credential-bearing URLs must not enter recipe persistence or portable outputs; canceled vault sessions must not submit clipboard writes or accept late unlock keys; external setup sources must be visible before import/launch; the installed dependency audit must be clean. Public recipes, ordinary vault operations and WordPress launch must continue working.

## Options considered

- Leave unchanged: rejected because confirmed secret-handling gaps and vulnerable dependencies remain.
- Validate only import/export: insufficient because draft autosave directly serialized raw form values.
- Guard only clipboard UI callbacks: insufficient because the actual write happens inside an async library helper.
- Upgrade all runtime packages or accept npm's Wrangler downgrade: unnecessary compatibility risk. Pin current Playground versions, update fast-uri within its existing range, and override only Sharp to its patched release.

## Implementation or prototype

- `src/lib/recipe.js`: shared credential URL/landing-path checks, draft serialization and external-source warning builder. Existing saved/history loaders discard invalid legacy records. Known aliases include auth_key, _wpnonce, JWT, signed URL parameters and encoded variants.
- `src/App.jsx`: only validated drafts are persisted; invalid drafts remove the storage entry. External imports require source confirmation before state/save changes; all launches with external sources ask again. Advanced settings open when sources are present. Vault lifecycle invalidates AbortSignals on lock/close/unmount/reset, discards late keys, and guards UI/metadata continuations.
- `src/lib/license-vault.js`: clipboard helper requires an active signal and rechecks after storage and decryption, immediately before write submission.
- Dependency pins: Playground 3.1.47 unchanged; fast-uri 3.1.7; Sharp override 0.35.4; Wrangler remains 4.122.0. A nested Miniflare override did not replace its prerelease dependency in executed npm installs; a direct Sharp override did and produced a clean audit.
- Focused regression tests exercise malicious inputs, aliases, all recipe serialization paths, benign public controls and clipboard cancellation at two asynchronous boundaries.
- Independent read-only investigation identified raw draft autosave and stale metadata callbacks; candidate review identified three missing parameter aliases. The confirmed aliases were added and focused tests rerun. No other concrete bypass/regression was reported in that review cycle.

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Node 22.22.1 | `node --test src/lib/recipe.test.js src/lib/license-vault.test.js` | Security triggers rejected; legitimate controls work | 19 passed, 0 failed after reviewer aliases | Focused test output |
| Node 22 / npm 10 | `npx --yes npm@10 ci` | Reproducible clean install | Passed | Local install log |
| Node | `npm test` | Full suite passes | 59 passed, 0 failed | Node test output |
| Vite / Wrangler | `npm run deploy:check` | Build and dry-run pass | Passed; existing browser-externalization/chunk warnings | Local dry-run output; no direct deploy |
| npm registry | `npm audit --json` | No reported advisories | 0 vulnerabilities | [Audit evidence](../security/2026-09-10-fixes/npm-audit.json) |
| Chromium, localhost:4174 | Programmatically type a synthetic credential URL, then a public URL | Unsafe draft absent; safe draft saved | Both passed; Advanced opened | Browser evaluate result |
| Chromium | Import synthetic external recipe with confirm=false, then true; cancel its launch | Canceled import unapplied; accepted import saved; launch not started | Passed; hidden iframe retained with no src after canceled launch | Browser evaluate result; initial assertion incorrectly required iframe absence, corrected to inspect its unchanged hidden/no-src state |
| Chromium | Import plain temporary recipe and launch WordPress 7.1 | Runtime ready | Ready on WordPress 7.1 | Browser visible status |
| Chromium | Create synthetic vault; gate WebCrypto deriveKey, start unlock, close, release gate | No late key installation | Manager closed, captured key ref null, reopen locked | Browser evaluate booleans |
| Chromium | Normal password unlock then Lock | Unlock usable; lock returns password form | Both passed | Browser evaluate booleans |

## Result

The reproduced URL and clipboard issues are blocked by regression tests, including alternate aliases and asynchronous boundaries. Ordinary controls and local WordPress startup work. The installed dependency audit is clean.

## Disposition and rationale

Kept: final local tests (59/59), build, Wrangler dry-run, clean audit, version agreement and diff whitespace check passed. Security fixes are scoped to the four actionable findings summarized to the user, plus closely related landing-path validation and dependency pinning. Earlier defense-in-depth suggestions and unverified multi-tab initialization concerns are not claimed resolved.

## Documentation impact

Updated CONTEXT, rebuild specification, architecture, data contracts, testing inventory, changelog, package and lockfile versions, and change index. Retained previous assessment and raw Claude review intact.

## Follow-ups and open questions

- A finite credential-parameter policy cannot identify arbitrary secrets in URL paths or free text. Public, credential-free inputs remain required.
- Cancellation cannot retract OS clipboard operations already submitted before Lock.
- Remove the Sharp override after upstream Miniflare uses a patched version.
- Firefox/Safari and real vendor license/package flows were not tested. No real secrets were used.
- GitHub run and live-domain checks will be recorded in a separate deployment record after pushing.
