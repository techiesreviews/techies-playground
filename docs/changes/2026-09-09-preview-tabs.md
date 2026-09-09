# Separate preview tabs for the embedded WordPress runtime

- Date: 2026-09-09
- Owner: Codex
- Status: complete
- Disposition: kept
- Related version: unreleased (based on 0.6.0)
- Related commit/issue: https://github.com/WordPress/wordpress-playground/issues/2130

## Context

The user reported a white screen when Ctrl-clicking a scoped Sample Page link into a new tab. App embeds `playground.wordpress.net/remote.html` under the launcher origin. A top-level Playground URL has a different storage partition from the embedded runtime; the scope string alone cannot bridge that boundary. The upstream issue reports the same symptom. Source inspection and browser proof support this explanation; the user's particular browser session was not inspected.

## Hypothesis and success criteria

Keep the launcher as the top-level origin in a separate preview tab, embed the existing scoped URL, and reuse the original service worker/runtime. Success: Sample Page renders while the owner remains in admin, preview parameters survive, and closing the owner replaces the preview with an explanation. Do not boot another runtime or mount the saved filesystem twice.

## Options considered

- Leave unchanged: native scoped links can open blank tabs.
- Force previews into the existing iframe: simpler, but loses the user's preferred separate-tab workflow.
- Launcher-origin wrapper: retains separate tabs and browser-local execution with modest link/lifecycle handling. Selected after browser proof.
- Host the runtime ourselves or relay WordPress through a backend: substantially larger scope and unnecessary for this fix.

## Implementation or prototype

`src/Preview.jsx` renders validated scoped URLs after a session probe. `src/lib/playground-preview.js` implements the contract and serializes a standalone script into a WordPress mu-plugin, refreshed on every launch. `src/App.jsx` assigns unique runtime scopes, installs the plugin, and answers/cleans up preview probes. `src/main.jsx` selects the preview screen for fragment URLs. Stable OPFS identity and recipe contracts are unchanged.

The bridge handles Ctrl/Cmd/Shift-click, middle-click, `_blank` links and direct script-opened scoped URLs. External links, downloads and ordinary navigation are excluded. Target validation restricts previews to the exact Playground origin and launcher scopes. The preview has the same WordPress permissions as the running site, not read-only permissions. URLs are ephemeral and may contain normal WordPress preview nonces; they are not public sharing links.

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Source inspection | Inspect App launch and upstream checkout `ced1c35df1546c40e85483c77ed96f23ea6e62fe`, remote service-worker and web-service-worker messaging | Determine how scope routes requests | Upstream broadcasts scoped requests to available service-worker clients | `packages/php-wasm/web-service-worker/src/lib/utils.ts`, `broadcastMessageExpectReply`; [Chromium partition explanation](https://chromium.googlesource.com/chromium/src/+/master/docs/security/service-worker-security-faq.md) |
| Collaborative Chromium, production-origin prototype | Launch an empty temporary site on `https://play.techies.tools`; replace the DOM of a second launcher tab with a scoped Sample Page iframe | Existing site renders in another tab | Screenshot visibly showed Sample Page and authenticated admin toolbar | Browser tabs `tab_2` (owner), `tab_3` (prototype); DOM-only experiment, no deployment |
| Node 22.22.1 / npm 9.2.0 | `npm ci` | Install locked dependencies | Completed; npm emitted engine-version and audit warnings | 269 packages installed; lockfile unchanged |
| Node 22.22.1 | `npm test` | Regression suite passes | 55 tests passed, 0 failures | Includes five new preview tests |
| Vite 7.3.6 | `npm run build` | Production bundle builds | Passed in 2.90 seconds; dependency externalization and large-chunk warnings | Built `dist` |
| Collaborative Chromium, production build at `http://localhost:4173` | Launch a temporary site; read installed mu-plugin through client; write a synthetic PHP page invoking `wp_head`; dispatch a Ctrl-click while intercepting native `window.open`; open captured wrapper URL in a second tab | Generated/minified plugin routes to wrapper; live page renders | Captured launcher `#preview=` URL preserved `?preview=true#content`; screenshot showed Sample Page and wrapper reminder while owner returned to Plugins | `tab_4` owner; `tab_5` preview. Synthetic page existed only in disposable runtime. This is not a physical Ctrl-click/popup-blocker test |
| Same Chromium build | Click Close Playground, then Discard and close in owner | Preview loses iframe and explains closed runtime | Verified unavailable text and zero iframes | Browser evaluation on `tab_5` |
| Working tree | `git diff --check` | No whitespace errors | Passed | Local diff check |

## Result

Both the production-origin wrapper prototype and local production-build integration rendered the existing WordPress Sample Page in a separate tab. The generated script executed within WordPress and produced the expected wrapper URL. Explicit session close removed the preview iframe. The requested separate-tab model is feasible without adding a backend or moving site data.

## Disposition and rationale

Kept: implements the preferred interaction while retaining the browser-local runtime. The implementation is local and has not been deployed.

## Documentation impact

Updated architecture, rebuild specification, preview data contract, test inventory/manual matrix, and change index. No release/version bump because deployment was not requested.

## Follow-ups and open questions

- Physically exercise Ctrl/Cmd-click, middle-click, popup restrictions, and editor-specific preview flows across Chromium, Firefox and Safari; automated event tests do not establish cross-browser behavior.
- Native context-menu “Open link in new tab” bypasses click interception. Plugins that open an empty popup and later set its location can also bypass URL mapping.
- Browser-saved resume is covered by source inspection of unconditional plugin refresh, not an executed resume test in this change.
- Abrupt owner-tab closure relies on the heartbeat timeout; background browser throttling can delay it. Explicit in-app close was tested.
