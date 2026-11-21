# Updates note: failures stay short and visible on the bar

- Date: 2026-11-21
- Owner: fleet builder (Claude Opus 5.5)
- Status: complete
- Disposition: kept
- Related version: 0.11.0 (not yet released; fixes before the release)
- Related commit/issue: TOOLS-259; follows [Plugins update at start, checks run by themselves, and our own Checks panel](2026-11-20-updates-at-start-and-checks-panel.md)

## Context

The release review of 0.11.0 (`dev` to `main`) found two problems in the bar's Updates button from [the 2026-11-20 record](2026-11-20-updates-at-start-and-checks-panel.md), plus three small ones:

- R1-1: when nothing updated but some updates failed, the button listed every failed name (`Update failed: Plugin update check, Theme update check, …`). Bar buttons do not shrink and the bar clips what does not fit, so on a window about 1100 px wide a long list could push Close off the right edge.
- R1-2: when at least one item updated, failures left no trace on the button (`Updated: X 1.0 → 2.0`). One failure can be "updated, but WordPress could not switch it back on", which means a plugin is now off.
- R1-3: Run again reloads the current page. A page that ran an action from its address (`update.php?action=upgrade-plugin&_wpnonce=…`) ran that action a second time.
- R1-4: the note's rows were keyed by display name, which two items can share; a long name without spaces made the note scroll sideways.
- R1-5: `CONTEXT.md` still named version 0.10.5.

## Hypothesis and success criteria

- Failures shorten like updates: `Update failed: <first name> +N`, the count alone up to 1040 px.
- When something updated and something failed, the button adds an amber warning icon and `N failed` (the icon alone below `sm`).
- A long first name is cut with an ellipsis, while its versions and `+N` stay visible. On a full bar the Updates button shrinks (its name first) instead of pushing Close off the edge.
- Run again and Open in Query Monitor on a page whose address carries a nonce use `/wp-admin/` instead.

## Options considered

- **Leave unchanged.** Close can disappear and a switched-off plugin goes unnoticed.
- **Only truncate the note.** Keeps Close on screen but still hides that something failed when something else updated.
- **First name + count, a failure mark, and a width cap (chosen).** Same pattern as the updated list; the mark reuses the amber warning icon the Checks button already uses.
- For R1-3, the review suggested treating any `action` parameter as an action too. Rejected: `post.php?post=1&action=edit` is a plain edit screen with no side effect, and WordPress protects actions that change data with a nonce, so the nonce is the signal.

## Implementation or prototype

- `src/lib/plugin-updates.js`: `updatesLabel` returns the note in two parts, `note` (the first name) and `noteEnd` (its versions and `+N`), and a new `failed` field (the failure count when something also updated, else empty). Failures shorten the same way as updates. `updatedNote` is gone; the label builds the note.
- `src/UpdatesControl.jsx`: renders the failure mark with a screen-reader separator, cuts only the first name (`max-w-48 truncate`, full name in `title`), keys rows by position and lets long names wrap (`[overflow-wrap:anywhere]`, also on the Already current line). Unlike the other bar buttons, the Updates button and its wrapper may shrink (`min-w-0` instead of `shrink-0`), so on a full bar the name is cut further before Close moves; the count and `N failed` keep to one line. An item without a name still shows its versions and `+N`.
- `src/lib/checks.js`: one helper, `safePageUrl`, gives both `measurePath` and `checkResultsPath` `/wp-admin/` when any query key of the current address ends in `nonce`.
- `CONTEXT.md`: version 0.11.0. `docs/rebuild-spec.md`: the new button texts and the nonce rule. The 0.11.0 changelog line mentions the failure count; no version bump, because 0.11.0 has not been released yet.

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Node 24, worktree off `origin/dev` 5c4054c | `node --test src/lib/plugin-updates.test.js src/lib/checks.test.js src/updates-control.test.js` before the fix | new tests fail | 7 failed, 19 passed | commit 81185a9 |
| Same | `npm test` after review round 2 | all pass | 271 passed, 0 failed (the separate `updatedNote` test was folded into the label test) | local run |
| Headless Chrome, static render | The real `UpdatesControl` and `ChecksButton` rendered with `react-dom/server` into a copy of the bar (title, Licenses `· 3 of 4 active`, Checks `· activate licenses first`, Export snapshot, Updates, the X Close button) styled with the built app CSS, at 1000, 1041, 1100 and 1280 px. Four cases: 6 failed; 1 updated and 2 failed; a 61-character first name with versions 10.4.0 → 10.5.0, 3 updated and 2 failed; networking blocked. A script measured Close against the bar's right edge and the Updates button's height; screenshots were also checked by eye | Close fully inside; button on one line; versions and `+N` visible | Before the round-2 fix, the 61-character case pushed Close 101 px past the edge at 1041 px and 42 px at 1100 px. After it, all 16 combinations kept Close inside and the button on one line (`Updated: WooComm… 10.4.0 → 10.5.0 +2`, amber icon, `2 failed` at 1041 px; `Updated · 3`, icon, `2 failed` at 1000 px) | screenshots kept outside the repo |

The `src/updates-control.test.js` tests read the component source; they do not render it. The static render above copies the bar's markup rather than running the full app, and no launch in a real Playground was run for this change. `kit ux` could not run because this project has no feature list (`docs/agents/features.md`). On the fullest bar the site title gives up its room first, as it did before.

Bar text, before and after (from `updatesLabel`):

| Case | Before | After |
| --- | --- | --- |
| Nothing updated, 6 failed | `Update failed: Plugin update check, Theme update check, C, D, E, F` | `Update failed: Plugin update check +5` |
| 1 updated, 2 failed | `Updated: WP 2FA 3.1 → 3.2` | `Updated: WP 2FA 3.1 → 3.2` then the amber icon and `2 failed` |

## Result

In the static render from 1000 to 1280 px, the bar kept Close on screen for every update result tried, and a failure is visible on the button in every case. Run again and Open in Query Monitor no longer repeat an action. A check in the real app at the preview is still open.

## Disposition and rationale

Kept: it fixes two release-blocking findings with the smallest change and reuses the existing patterns and icon.

## Documentation impact

`CONTEXT.md`, `docs/rebuild-spec.md` and `docs/testing.md` updated; the 0.11.0 changelog lines updated.
