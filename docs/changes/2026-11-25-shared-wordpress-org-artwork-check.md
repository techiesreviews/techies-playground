# Shared WordPress.org artwork check

- Date: 2026-11-25
- Owner: fleet-lead (builder Claude Opus 5.5)
- Status: complete
- Disposition: kept
- Related version: unreleased (no user-visible change, no version bump)
- Related commit/issue: TOOLS-422

## Context

The 2026-11-23 code audit (TOOLS-418) listed the plugin and theme directory modules as carrying the same private image URL check twice: `src/lib/wordpress-org-plugins.js` and `src/lib/wordpress-org-themes.js` each had a `normalizeImageUrl` that turned a protocol-relative URL into HTTPS and kept it only over HTTPS from one host. The two copies differed only in that host (`ps.w.org` for plugin icons, `ts.w.org` for theme screenshots).

The same audit listed five broad narration-comment candidates without naming them. Re-reading the comments in `src/`, `scripts/` and `playground-host/` on dev at 902ef86 found none that only restate the next line: the short comment lines are continuations of comments that state constraints, browser behaviour or reasons. They were left as they are.

The audit's recovery risks (licence metadata read failure, version fetch failure, saved recipe and history recovery) belong to a separate card and are out of scope here; `docs/changes/2026-11-23-preserve-licence-list-on-read-error.md` and `docs/changes/2026-11-23-preserve-unreadable-saved-lists.md` already cover the first and the last two.

## Hypothesis and success criteria

One shared function, with each caller naming its own allowed host, removes the duplicate without changing which artwork is shown. Success: every existing directory test and new tests that pin the host split (HTTPS only, plugin artwork never from the theme host and the reverse, an unparsable value gives no image) pass before and after the change.

## Options considered

- Leave unchanged: two identical ten-line functions that must be changed together.
- Merge the plugin and theme modules: rejected, they are separate directory APIs with different fields and the card asks for no forced abstraction.
- Also share the identical slug pattern, author tag stripping or request scaffolding: rejected. The slug checks are exported under domain names, sharing them would add one-call wrappers, and the request builders differ in action and fields.
- One shared artwork check that takes the allowed host from its caller: chosen.

## Implementation or prototype

- New `src/lib/wordpress-org-images.js` with `normalizeWordPressOrgImageUrl(value, allowedHostname)`, the former body with the host as a parameter.
- `wordpress-org-plugins.js` passes `PLUGIN_IMAGE_HOST = 'ps.w.org'`; `wordpress-org-themes.js` passes `THEME_IMAGE_HOST = 'ts.w.org'`. Both private copies are deleted.
- New tests in `wordpress-org-plugins.test.js` and `wordpress-org-themes.test.js` pin the HTTPS rule, the per-directory host and the unparsable-value case.

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Local worktree, old code, new tests | `node --test src/lib/wordpress-org-plugins.test.js src/lib/wordpress-org-themes.test.js` | Pinning tests pass on the old code | 12 pass, 0 fail | Executed |
| Local worktree, after change | `scripts/agents/kit unit --affected` | Same tests pass | `RESULT: ok unit 12/12 (2 files)` | Executed |
| Local worktree, after change | `npm test` | Whole suite passes | 429 pass, 0 fail | Executed |
| Local worktree, after change | `scripts/agents/kit build` | Vite build succeeds | `RESULT: ok build finished` | Executed |

The new tests are characterization tests: a refactor with no behaviour change has no failing-first test, so they were run on the old code first to show they describe current behaviour.

## Result

The duplicate check is gone and the two allowed hosts are named at their call sites. No change to what a person sees, to stored data or to request parameters.

## Disposition and rationale

Kept: less duplicated code, same behaviour, and the host split is now covered by tests in both directions.

## Documentation impact

- `docs/architecture.md`: module table lists `wordpress-org-images.js`.
- `docs/testing.md`: directory test rows name the host split.
- No changelog or version change (nothing user-visible).

## Follow-ups and open questions

- None.
