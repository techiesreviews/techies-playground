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
- The note text on the button has a width cap with an ellipsis as a backstop.
- Run again on a page whose address carries a nonce measures `/wp-admin/` instead.

## Options considered

- **Leave unchanged.** Close can disappear and a switched-off plugin goes unnoticed.
- **Only truncate the note.** Keeps Close on screen but still hides that something failed when something else updated.
- **First name + count, a failure mark, and a width cap (chosen).** Same pattern as the updated list; the mark reuses the amber warning icon the Checks button already uses.
- For R1-3, the review suggested treating any `action` parameter as an action too. Rejected: `post.php?post=1&action=edit` is a plain edit screen with no side effect, and WordPress protects actions that change data with a nonce, so the nonce is the signal.

## Implementation or prototype

- `src/lib/plugin-updates.js`: `updatesLabel` returns a new `failed` field (the failure count when something also updated, else empty) and shortens the failed-only note with the same first-and-count helper as `updatedNote`.
- `src/UpdatesControl.jsx`: renders the failure mark, caps the note at `max-w-64` with `truncate`, keys rows by position and lets long names wrap (`[overflow-wrap:anywhere]`).
- `src/lib/checks.js`: `measurePath` measures `/wp-admin/` when any query key of the current address ends in `nonce`.
- `CONTEXT.md`: version 0.11.0. `docs/rebuild-spec.md`: the new button texts and the nonce rule. The 0.11.0 changelog line mentions the failure count; no version bump, because 0.11.0 has not been released yet.

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Node 24, worktree off `origin/dev` 5c4054c | `node --test src/lib/plugin-updates.test.js src/lib/checks.test.js src/updates-control.test.js` before the fix | new tests fail | 7 failed, 19 passed | commit 81185a9 |
| Same | `npm test` after the fix | all pass | 270 passed, 0 failed | local run |

Bar text, before and after (from `updatesLabel`):

| Case | Before | After |
| --- | --- | --- |
| Nothing updated, 6 failed | `Update failed: Plugin update check, Theme update check, C, D, E, F` | `Update failed: Plugin update check +5` |
| 1 updated, 2 failed | `Updated: WP 2FA 3.1 → 3.2` | `Updated: WP 2FA 3.1 → 3.2` then the amber icon and `2 failed` |

## Result

The bar stays within its width whatever the update result, and a failure is visible on the button in every case. Run again no longer repeats an action.

## Disposition and rationale

Kept: it fixes two release-blocking findings with the smallest change and reuses the existing patterns and icon.

## Documentation impact

`CONTEXT.md` and `docs/rebuild-spec.md` updated; the 0.11.0 changelog line updated.
