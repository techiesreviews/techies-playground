# Verify Ctrl-click on WordPress Site and View links

- Date: 2026-09-09
- Owner: Codex
- Status: complete
- Disposition: kept
- Related version: unreleased
- Related commit/issue: follows [preview-tabs investigation](2026-09-09-preview-tabs.md)

## Context

The user asked whether the actual WordPress site-name and View links work with Ctrl-click, and requested testing. They also clarified that implementation requires an explicit request. This pass tested the existing local production build without changing application code or deploying it.

## Hypothesis and success criteria

Browser-driven Ctrl-click on the admin-bar site-name link and Pages list View link should open the existing site in a separate launcher-origin preview tab, preserving the owner's admin location. Closing the owner should remove the preview iframe.

## Options considered

- Reuse synthetic event evidence: insufficient to verify native browser popup handling on actual WordPress links.
- Drive Chromium with Playwright against the existing build: selected.

## Implementation or prototype

No implementation changes. Playwright was installed outside the repository at `/tmp/techies-preview-browser`. Node heredoc test commands launched headless Chromium with isolated browser contexts against the existing `npx vite preview --host 0.0.0.0` server at `http://localhost:4173`. Each run used an empty temporary WordPress 7.1 environment and disposed of it afterward.

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Chromium 153 / Playwright | `wp.locator('#wp-admin-bar-site-name > a').click({ modifiers: ['Control'] })`; capture new page | Homepage in separate launcher tab; owner remains in Plugins | Passed; captured `#preview=` URL, owner URL unchanged | First browser test, exit 0 |
| Same | Hover Sample Page row in Pages, then `.view a` `.click({ modifiers: ['Control'] })`; wait for heading Sample Page in preview iframe | Sample Page in separate tab; owner remains in Pages | Passed; heading rendered, owner URL unchanged | `/tmp/techies-preview-browser/view.png` (local, ephemeral screenshot) |
| Same | Close Playground, then Discard and close; wait for unavailable message | Preview iframe removed | Passed; iframe count 0 | First browser test, exit 0 |
| Fresh Chromium context | Repeat site-name Ctrl-click and wait for iframe heading Hello world! | Fully rendered homepage | Passed | Second browser test, exit 0; `/tmp/techies-preview-browser/site.png` |

The first homepage screenshot was captured before its content finished rendering, though the WordPress toolbar appeared. The second run added the explicit Hello world! heading assertion and passed. These were browser mouse clicks with the Control modifier, not JavaScript-dispatched synthetic events. Chromium ran headlessly with automation defaults; this does not establish behavior under every user's popup settings.

## Result

The two requested real WordPress links work with Ctrl-click in the tested Chromium environment. The original admin location remains unchanged. Owner closure gives an explanation instead of retaining an unusable iframe.

## Disposition and rationale

Kept: evidence supports the existing local implementation for these interactions. No new product behavior or deployment was authorized or performed.

## Documentation impact

Added this verification record and indexed it. Earlier synthetic-test evidence remains unchanged; this record supplements it with actual browser-driven clicks.

## Follow-ups and open questions

- Firefox/Safari, macOS Cmd-click, customized popup settings, native context-menu navigation and unusual plugin preview flows remain unverified.
- Future implementation changes require an explicit user request.
