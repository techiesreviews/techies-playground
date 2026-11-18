# Key saved becomes a hover icon; the "did not start within 2 minutes" report checked on the preview

- Date: 2026-11-18
- Owner: fleet-lead (builder: Claude Opus 5.5)
- Status: in-progress
- Disposition: pending
- Related version: 0.10.2
- Related commit/issue: TOOLS-324 (fix round after [2026-11-16-playground-host-no-website-fetch-only-proxy.md](2026-11-16-playground-host-no-website-fetch-only-proxy.md), PR #37)

## Context

Lex tried the preview after PR #37 on 2026-11-17 and asked for two things:

- "Remove the key saved label to hide with the other buttons, only show on hover, make it a icon, sharing space with the other icons." Until now an uploaded plugin with a saved key showed a **Key saved** pill between the plugin name and the Replace and Delete icons, which show only on hover with a mouse.
- At about 09:17 UTC on preview-play.techies.tools, a launch ended with "WordPress Playground did not start within 2 minutes. Check your connection, then launch again." The step he was asked to try was a launch with one of his saved paid plugins and its saved key. The lead's prime suspects were PR #37's two changes: S1 (no public website pages; `remote.html` stops unless a launcher on another origin frames it) and S2 (the CORS proxy answers only `Sec-Fetch-Dest: empty`).

## Hypothesis and success criteria

- Icon: with a saved key, the card shows a key icon as the first item of the Replace and Delete group, the same 28 px box and 4 px gap, with a mouse hidden until hover or while anything in the card has focus, always shown on touch devices; the Key saved pill is gone. The state stays readable to assistive technology.
- Timeout: reproduce the failure on the deployed preview in a real browser before changing anything, then make the smallest fix that keeps both security goals.

## Options considered

- Icon as a non-interactive image in the existing hover group (chosen): matches Lex's words and the group's spacing; no new behaviour.
- Icon as a button that opens the Licenses manager: not asked for.
- Timeout: change the guard or the proxy without a reproduction: rejected; nothing showed either change failing, and both close review findings.

## Implementation or prototype

- `src/App.jsx` (`PluginRow`): the Key saved pill is removed; with a saved key a `KeyIcon` (`role="img"`, name and tooltip "License key saved for <label>", `p-1.5`, `size-4`, teal) is the first child of the hover group. Add key is unchanged.
- `CHANGELOG_ENTRIES` 0.10.2, `package.json` and `package-lock.json` 0.10.2; `docs/rebuild-spec.md` describes the icon.
- No change to the Playground host, `remote.html`'s guard or the CORS proxy (see Result).

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| preview (dev 017c0d6), T3 browser (Electron Chromium 152), default profile | Launch WordPress latest + query-monitor, storage in browser | Starts | Started; wp-admin Plugins, Query Monitor active | Session screenshot |
| same | Close, launch again (resume of the saved site) | Starts | Started | Session screenshot |
| same | Upload WP Activity Log ZIP (free build from WordPress.org), Add key with a fake key, reload, Launch, unlock the vault | Starts, plugin installs, key fill runs | "Ready on WordPress 7.1.4", 16 s after unlock | Session text |
| preview, T3 browser, incognito profile | First visit, Launch WordPress | Starts | Started (cold service worker and caches) | Session screenshot |
| preview, Playwright 1.63 Firefox (headless) | Launch WordPress | Starts | "Ready on WordPress 7.1.4" after 18 s; proxied WordPress 7.1.4 ZIP answered 200 | Script output |
| preview, Playwright 1.63 WebKit (headless WPE) | Launch WordPress | Gets past the guard and boots | Reached wp-admin after 11.5 s; then "The operation failed for an unknown transient reason (e.g. out of memory)" (a browser storage error; likely saving the site in the browser in WPE's headless build, not investigated); not the 2-minute timeout | Script output, screenshot |
| preview, Playwright Chromium, one persistent profile | Launch in tab A, then the same saved site in tab B | Both start | Both "Ready" (15 s, 21 s) | Script output |
| preview, Playwright Chromium | Every `/cors-proxy.php` request answered 403 (what S2 returns to a request without `Sec-Fetch-Dest: empty`) | Shows whether S2 can cause the 2-minute message | The launcher shows "Failed to download WordPress 7.1.4 (HTTP 403)" after 4 s, not the 2-minute message | Script output, screenshot |
| preview-wp | `sw.js` compared with production's (pre-#37 build) | — | Byte-identical (md5 b32c5b03…); the worker calls `skipWaiting()`, so no update can leave a worker waiting | `curl`, `md5sum` |
| GitHub Actions | Deploy runs around 2026-11-17 09:17 UTC | — | None between 2026-11-16 22:27 and 2026-11-17 15:56 (WordPress sync on `main`) | `gh run list` |
| Local, vite dev against preview-wp, Playwright Chromium 1280×900 | Upload the ZIP, save a fake key, move the mouse away, then hover the card | Icon hidden, then shown first in the group | Hidden (group opacity 0), no Key saved text; on hover shown at 695/727/759 px, 28 px boxes, 4 px gaps | [idle](assets/2026-11-18-key-icon-row-idle.png), [hover](assets/2026-11-18-key-icon-row-hover.png) |
| Local, same, 390×844 touch | Same | Icon always shown | Shown, same spacing | [phone](assets/2026-11-18-key-icon-row-phone.png) |
| Local, same, 1280×900 | Save a key; park the mouse and blur; read the icon by role; Tab to the plugin checkbox | Readable while hidden; shown on keyboard focus | Focus lands on `#plugin-<id>` after Save key (group shown); `getByRole('img', { name: 'License key saved for wp security audit log' })` resolves at opacity 0; after Tab to the checkbox the group is at opacity 1 | Script output |
| Local, same, 320×640 touch, 79-character label | Save a key | Icons wrap under the artwork inside the card; label wraps | Icons at 32–124 px inside the card, label wraps. The page is 324 px wide at 320 px both before and after this change (the same check on `017c0d6`), so that overflow is older and not from the icon | [320 px](assets/2026-11-18-key-icon-row-320.png), script output |
| Local | `npm test`; `scripts/agents/kit build` | Pass | 175 passed; build finished | Local run |

## Result

- Icon: works as Lex described in Chromium at desktop and phone sizes. Not yet checked on the deployed preview.
- Timeout: not reproduced. In Chromium, Firefox and WebKit, clean and reused profiles, a resumed saved site, two tabs and Lex's flow (saved ZIP, saved key, vault unlock) all started within 25 s. The 2-minute message means Playground never reached "client connected": either `remote.html` never connected (as when its guard stops it) or the boot hung. S2 is ruled out for the boot: a refused proxy request gives a clear "Failed to download WordPress … (HTTP 403)" error instead. Nothing showed S1's guard stopping inside a launcher frame.

## Disposition and rationale

Pending: the icon waits for the preview check; the timeout stays open until Lex's browser can be checked (see Follow-ups).

## Documentation impact

`docs/rebuild-spec.md` (uploaded plugin card), `CHANGELOG_ENTRIES` 0.10.2, version 0.10.2.

## Follow-ups and open questions

- Questions for Lex to tell the two remaining causes apart: which browser and device he used; whether the Playground area showed a progress bar or stayed blank during the two minutes (blank points to `remote.html` never connecting, a bar to a stalled download); whether it still happens on the preview now, and in a private window.
