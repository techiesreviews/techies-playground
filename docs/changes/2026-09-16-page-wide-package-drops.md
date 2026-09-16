# Page-wide plugin and theme ZIP drops

- Date: 2026-09-16
- Owner: Codex
- Status: complete
- Disposition: kept
- Related version: unreleased
- Related commit/issue: working tree

## Context

Users previously had to choose a plugin or theme file picker. They requested mixed, multiple ZIP drops anywhere on the page with an upload-box indicator.

## Hypothesis and success criteria

A file-drag overlay and archive header detection should route mixed batches to the correct local vault without a file-count cap. Individual failures should not prevent subsequent imports. Theme selection must remain exclusive.

## Options considered

- Leave file pickers unchanged: fails the requested interaction.
- Guess type from ZIP filename: unreliable for vendor downloads.
- Inspect WordPress package headers: chosen; rejects unknown or ambiguous archives.

## Implementation or prototype

Added `src/lib/package-upload.js` for ZIP classification and global drag listener lifecycle. App displays an upload-box overlay, queues batches, stores each package independently and reports progress/totals/errors. Every successful plugin is selected; the last successful theme clears the directory theme. Existing theme file-picker uploads also clear the opposing theme selection. Added zip.js as an explicit dependency at its already-installed version. No persistence schema or release version changes.

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Node 22.22.1 | `npm test` | All regression tests pass | 62 passed, 0 failed | `src/lib/package-upload.test.js`; `/tmp/techies-upload-tests.log` |
| Node 22.22.1 / Vite | `npm run build` | Production build succeeds | Passed; large-chunk warning | `/tmp/techies-upload-build.log` |
| Workspace | `git diff --check` | No whitespace errors | Passed | Command exit 0 |
| npm install | `npm install --save-exact @zip.js/zip.js@2.7.57 --ignore-scripts` | Dependency available | Already installed; audit reported 0 vulnerabilities; npm-version engine warnings | Install output |
| Source inspection | Inspect import loop and state updates | Per-file catches, sequential queue, theme exclusivity | Confirmed in source; no rendered UI assertion | `src/App.jsx` |

## Result

Automated checks cover compressed plugin/theme fixtures, invalid and ambiguous archives, misleading filenames and drag lifecycle including a 150-file batch. No browser visual or IndexedDB end-to-end smoke was run. An initial Node EventTarget cleanup test exposed boolean capture-option behavior; explicit capture option objects resolved it and all tests passed.

## Disposition and rationale

Kept: implements mixed drops using package content and preserves independent failures and existing vault contracts.

## Documentation impact

Updated rebuild specification, architecture, data contracts and testing inventory. Deployment was not requested; changelog and version remain unchanged.

## Follow-ups and open questions

- Run the documented manual browser matrix, including cancellation and persistence.
- The cross-origin runtime iframe does not forward drag events to the parent. The overlay covers it after a drag enters the launcher, but a drag entering directly inside the iframe is outside the launcher's event boundary.
