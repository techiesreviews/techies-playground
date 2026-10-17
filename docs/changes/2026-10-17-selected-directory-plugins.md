# Keep selected directory plugins visible

- Date: 2026-10-17
- Owner: Codex
- Status: complete
- Disposition: kept
- Related version: unreleased, source version 0.8.2
- Related commit/issue: Working tree based on `f7bf7686cf39e32837ba92747380710a39d0e574`. Supplements [the earlier runtime investigation](2026-10-13-playground-download-failure.md); its outcomes are unchanged.

## Context

The user initially reported the embedded WordPress Playground “hiccup” message in the latest Vivaldi. Their screenshot shows Latest WordPress, PHP 8.3, one plugin, browser storage, and networking enabled. They subsequently clarified that the launcher does not show which WordPress.org plugin is selected.

A basic live launch with no packages reaches `Ready on WordPress 7.1.3. Activate licenses inside WordPress when needed.` in the T3 Chromium context, including a second launch after closing the runtime. This does not reproduce or explain the user's Vivaldi runtime error. The selected-plugin display problem is independently reproducible in both the live launcher and local source.

## Hypothesis and success criteria

Ranked explanations were the empty-search rendering condition hiding directory rows, a count that includes only uploaded ZIPs, and selection state being lost. The browser's saved recipe retains `query-monitor` after clearing search while the selected row disappears, ruling out loss of recipe selection for this reproduction. Source inspection identifies the search-only rendering condition and uploaded-only tab count.

Success requires selected WordPress.org plugins to stay visible and removable after clearing or changing the search, with recognizable names retained during the session. The launch summary must identify selected packages, and tab counts must accurately describe selection. Runtime setup, recipe serialization, and OPFS identity must remain compatible.

## Options considered

- Leave the UI unchanged: rejected because selection survives but cannot be inspected with an empty search.
- Only show plugin counts: insufficient to identify the selected plugin.
- Keep selection visible and retain safe display metadata in memory: chosen; imported or refreshed recipes can fall back to public slugs without changing their schema.
- Change the WordPress runtime or browser settings: not supported by this UI reproduction.

## Implementation or prototype

`src/App.jsx` now renders selected non-featured directory rows even at empty search and keeps rows available during search loading. Selected featured plugins retain their existing cards without duplicate selected rows. An in-memory metadata map retains names across queries; refreshed recipes can show their public slugs until metadata is fetched. The launch summary lists local and directory plugin names below the package count. Plugin and theme tabs explicitly show selected counts. No recipe fields, runtime setup, or OPFS identity changed. Agent Kit integration is recorded separately in [the integration record](2026-10-17-agent-kit-integration.md).

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Live launcher, T3 Chromium user agent `Chrome/154.0.0.0`, 1280 × 800 | Open `https://play.techies.tools`, keep Latest/PHP 8.3/browser storage, select no packages, launch; assert exact ready text with `preview_wait_for` | Determine whether the runtime symptom reproduces in this context | Ready on WordPress 7.1.3; a second launch after closing also reaches the same ready text | Executed T3 browser interactions and page evaluation; Vivaldi and plugins were not exercised by this baseline |
| Live launcher, same tab | Search `query monitor`; click `Add Query Monitor`; clear search; compare the saved draft's `repositoryPlugins` with selected `aria-pressed` controls | Selected plugin remains visible | Fails: `query-monitor` remains in the recipe but its selected row disappears | `preview_evaluate` throws `Reproduced: query-monitor remains selected in recipe but disappears from launcher after clearing search` |
| Local source before fix, `http://localhost:5174` | `npm run dev -- --host 127.0.0.1 --port 5174 --strictPort`; repeat the same browser steps and assertion | Confirm the actual local code has the same defect | Same exact failing assertion | Executed T3 UI interactions; no selection state was injected |
| Local source after fix, same T3 tab | Repeat the original page-context assertion after clearing search; then search Query Monitor again and clear | Selection remains visible; fetched name survives clearing | Passed: selected control `Remove Query Monitor`; summary contains `Query Monitor`; tab says `Choose plugins (1 selected)` | Executed `preview_evaluate` assertions |
| Same | Change query to `akismet`; assert the selected Query Monitor name remains | Selection remains inspectable across query changes | Passed immediately after query change | Executed UI interaction and assertion; a separate guessed `Add Akismet` locator timed out after 15 seconds and is not claimed as search-result verification |
| Same | Clear search; select featured Kanbanz; count selected controls and inspect summary | Two selected plugins, no duplicate featured row | Passed: controls `Kanbanz` and `Remove Query Monitor`; summary `2 plugins` and `Query Monitor, Kanbanz` | Executed page assertions |
| Same, 390 × 844 CSS pixels | Resize with T3; scroll summary into view; assert page width and selected names; save and inspect screenshot | Names visible, no horizontal page overflow | Passed: `scrollWidth` 390; summary x=20, width=350 | Screenshot `/home/ubulex/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mvcv23ey-d169529e.png`; image inspected with `view_image` |
| Same, fresh navigation | Navigate to local page; assert `Remove query-monitor`; remove that control and inspect saved draft/summary/count | Saved selection remains inspectable without cached names; removal updates state | Passed: slug fallback visible after refresh; removal leaves only `kanbanz` and `Choose plugins (1 selected)` | Executed real UI removal and page assertions |
| Local Agent Kit | `scripts/agents/kit doctor` | Prerequisites agree | Passed, 0 failed checks | `RESULT: ok doctor 0 failed checks` |
| Local Agent Kit | `scripts/agents/kit specs` | Existing Node contracts pass | 63/63 tests passed in 14 files | `.scratch/kit-specs/run-2026-10-17T20-39-37-182Z-3261165/run.log`; Node tests do not render React |
| Local Agent Kit | `scripts/agents/kit build` | Production bundle builds | Passed; 591 modules; existing externalization and chunk-size warnings remain | `RESULT: ok build finished`; no deployment |

The initial browser waits for a hiccup message and a guessed `Resumed WordPress` message timed out. Subsequent page inspection and assertions found the exact ready message. Those timeouts are not evidence of either a runtime failure or a verified content-persistence test.

## Result

The exact selected-row reproduction now passes, and the summary identifies selected plugins. Refresh, removal, mixed featured/search selections, and the mobile summary were exercised. No causal link between this display defect and the reported runtime hiccup is established.

The existing automated suite has no React interaction harness. The meaningful regression seam here is the real launcher UI, so red/green T3 checks and a replay procedure in `docs/testing.md` cover this defect. No source-matching test or shallow helper test was added. Browser automation and `kit shots` remain unintegrated; direct T3 evidence is recorded explicitly rather than presented as kit output. No model review ran: the changed files remain uncommitted and the kit reviews immutable commits. The lead inspected the implementation diff and validation evidence.

## Disposition and rationale

Kept. The display fix restores the documented invariant that selected directory plugins stay visible, without changing their launch selection or storage contract.

## Documentation impact

Updated rebuild specification, architecture, data contracts, testing instructions and the change index. No changelog/version bump, commit, push, or deployment was performed.

## Follow-ups and open questions

- The original Vivaldi runtime error still needs the browser's actual Console error and the affected plugin identity to diagnose it independently.
