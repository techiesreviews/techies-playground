# Short Playground runtime scope for Elementor compatibility

- Date: 2026-09-29
- Owner: Claude Code
- Status: complete
- Disposition: kept
- Related version: 0.8.1
- Related commit/issue: user-reported blueprint step #4 failure; supersedes the scope format in [2026-09-09-preview-tabs.md](2026-09-09-preview-tabs.md)

## Context

Launching a recipe with Elementor failed at blueprint step #4 with `WpOrg\Requests\Exception: Provided string is too long` from `IdnaEncoder.php:93`. Since 0.7.0 each launch used the scope `launcher-<site-id>-<UUID>` (up to ~142 characters). Elementor's `Str::encode_idn_url()` passes everything after `https://` to `IdnaEncoder::encode()`, which splits on dots and rejects any ASCII label of 64+ characters. The label `net/scope:<scope>/wp-admin/admin` therefore always exceeded the limit, and the fatal error fired on `elementor/init` (Cloud Library settings build an authorize admin URL).

## Hypothesis and success criteria

A short random scope keeps that label well under 63 characters, so Elementor (and any other plugin that IDNA-encodes full URLs) can initialize. Preview-tab parsing must still accept the scope.

## Options considered

- Leave unchanged: every Elementor launch fails.
- Patch Elementor via an mu-plugin: fragile and plugin-specific.
- Shorten the scope (chosen): `launcher-` plus 12 hex characters from `crypto.randomUUID()`; the site id was only descriptive and is not needed for OPFS identity, which uses its own path.

## Implementation or prototype

`createLauncherScope()` in `src/lib/playground-preview.js`, used by `src/App.jsx` launch. Longest label is now `net/scope:launcher-xxxxxxxxxxxx/wp-admin/admin` (46 characters). `parsePreviewUrl` regex unchanged.

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Local Node | `npm test` | All pass, including new scope label test | 63/63 pass | Terminal output |
| Local | `npm run build` | Build succeeds | Built (existing chunk-size warning only) | Terminal output |
| Browser with Elementor | Launch recipe including Elementor | Blueprint completes | Not run | — |

The label check mirrors Elementor/Requests logic in a unit test (source inspection of the stack trace); no live Elementor launch was executed.

## Result

Scope length no longer depends on recipe name; generated Playground URLs satisfy the IDNA label limit for typical admin paths.

## Disposition and rationale

Kept. Minimal change that removes the failure without plugin-specific workarounds.

## Documentation impact

`docs/architecture.md` and `docs/data-contracts.md` scope format updated. Released in 0.8.1 ([release record](2026-09-29-release-0.8.1.md)).

## Follow-ups and open questions

- Verify an Elementor launch in the browser before/after release.
