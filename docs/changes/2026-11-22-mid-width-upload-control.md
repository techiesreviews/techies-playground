# Saved uploads on medium-width bars

- Date: 2026-11-22
- Owner: fleet-lead
- Status: complete
- Disposition: kept
- Related version: 0.13.3
- Related commit/issue: TOOLS-403; follow-up to the release review of PR #67

## Context

The release review found that Saved for next start became a long, non-shrinking label at 768 px. On a full runtime bar it pushed Close outside the viewport. The preceding fix only verified 320 and 375 px. Post-install setup/navigation errors also retained an Upload failed headline despite a successful installation. This record supersedes those parts of [the earlier release-review fix record](2026-11-22-release-review-fixes.md).

## Hypothesis and success criteria

Keep the saved state icon-only below the existing 1041 px bar breakpoint. At 768 and 900 px with 100% text, a full licence/checks/updates bar must retain Close completely inside the viewport. Successfully installed plugins with activation or follow-up problems must retain their installed result and show an accurate headline with the reason. A tester-deactivation rejection must stop installation and file writes, and the launcher must report a failed install without navigating.

## Options considered

- Keep the long label: rejected because the 768 px browser reproduction put Close outside the viewport.
- Restore a two-line label or wrap the entire saved-state bar: possible, but changes its height and uses more space for a persistent state.
- Reuse the clock alone below 1041 px: chosen; the full label remains accessible and available in the title.
- Keep setup errors in the upload-failure list: rejected because the headline contradicts the successful installation. Separate post-install problems from upload/installation failures.

## Implementation or prototype

All normal upload-state labels use `max-[1041px]:sr-only`; the upload arrow, spinner, check and clock remain visible. Attention states keep their text and wrap. Upload and installation failures are separate from activation and post-install setup/navigation problems. The latter use Added with problems, an amber icon, and the existing inline reason. The bar can wrap in either attention state. The saved/progress title also retains its detail while startup is unfinished; only an idle unavailable control uses the availability title.

No installer behavior changed for the first tester-deactivation rejection. New tests establish that the lower-level promise rejects before installation/file writes and that the launcher catches it, preserves the failure message, and skips plugin-list navigation. The app version and changelog are 0.13.3. Busy spinners are documented as applying at every width.

## Tests and evidence

Linux, Node 24.22.2, T3 Code Chromium 152.0.7977.169, November 22, 2026. Browser checks staged the actual React runtime bar: 10 of 12 licences active, Checks showing 3 to improve, 12 updated packages, and the upload in Saved for next start. Synthetic state avoids real licence keys; this is rendered layout evidence, not a WordPress boot or licence activation claim.

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Fresh branch from dev | `kit doctor` | Project ready | 17/17 passed | `.scratch/tools-403-mid-doctor.log` |
| Before fix, local 0.13.2 build | Stage full bar at 768 and 900 px, root font 16 px | Reproduce overflow | At 768 px, Close right edge was 876.8125 px, outside the viewport. At 900 px, Close already fit at 877 px | `.scratch/tools-403-mid-browser-proof.json` |
| Tests before implementation | `kit unit src/app-upload.test.js src/lib/uploaded-plugins.test.js` | Post-install headline test fails | 6 passed, 4 failed; the import orchestration still returned `failed` after successful install plus navigation failure. The lower-level tester-rejection coverage already passed because its behavior was unchanged | `.scratch/tools-403-mid-red.log` |
| Focused tests after fix | `kit unit src/app-upload.test.js src/lib/uploaded-plugins.test.js src/lib/package-upload.test.js` | Accurate partial outcome; safe tester rejection | 16/16 passed; active result retained, final upload state `partial`, reason preserved, failed tester install never navigated | `.scratch/unit/20261122T204401-2159593.log` |
| Affected/full suite | `kit unit --affected`; `kit unit` | No regressions | 16/16 affected; 347/347 full suite in 40 files | `.scratch/tools-403-mid-affected.log`, `.scratch/tools-403-mid-full.log` |
| Production build | `kit go tools-403-mid-build -- env VITE_PLAYGROUND_ORIGIN=http://localhost:4194 kit build` | Build succeeds without deploy | Passed; existing bundle-size/externalised Node-module warnings remain | `.scratch/kit-jobs/tools-403-mid-build/log` |
| After fix, 768 px, 100% text | Stage the same full bar and measure Close | Close completely visible | Close spans 717–745 px, upload width 30 px | `.scratch/tools-403-mid-768.png`, `.scratch/tools-403-mid-browser-proof.json` |
| After fix, 900 px, 100% text | Repeat full-bar check | Close completely visible | Close spans 849–877 px, upload width 30 px | `.scratch/tools-403-mid-900.png`, `.scratch/tools-403-mid-browser-proof.json` |
| After fix, 900 px | Stage post-install navigation problem | Accurate headline and reason; Close visible | Added with problems, full reason in title/inline text, Close right edge 161.828125 px after wrapping | `.scratch/tools-403-mid-browser-proof.json` |
| Automatic UX | `kit ux` | Run where integrated | Could not run: the project deliberately has no `docs/agents/features.md` | `.scratch/tools-403-mid-ux.log`; no UX pass claimed |

## Result

Close fits at both requested widths on a full bar. The saved control uses its existing clock and keeps the full accessible name/title. Post-install problems preserve the installed plugin state and their reason without claiming upload failure. The requested tester-deactivation failure path is covered at both the installer and launcher boundaries.

## Disposition and rationale

Keep the compact saved label and separate problem outcome. This fixes the reproduced overflow with one existing breakpoint and gives installation results an accurate headline.

## Documentation impact

Updated the 0.13.3 changelog/version, CONTEXT, runtime-upload architecture, rebuild specification, test inventory and change index. The prior record remains as historical evidence. No stored recipe or vault schema changes.

## Follow-ups and open questions

Dev landing only. The lead checks preview deployment and controls any live release. Other optional release-review nits remain outside this round.

## Review follow-up

The first review found that idle, uploading, installing and Added still used the 768 px label breakpoint. The same full bar reproduced the idle overflow at 768 px: Close ended at 806.125 px. The one breakpoint rule now applies to every non-attention state below 1041 px. The docs explicitly state that any actual upload/install failure in a mixed batch takes headline priority over post-install problems, while both reasons remain visible.

Final full-bar rerun: idle, uploading, installing, Added and Saved for next start were each measured at both 768 and 900 px, root font 16 px. All ten cases passed. Close ended at 745/768 and 877/900 px; every normal upload control was 30 px wide and its hidden label measured 1 px. The captures and `.scratch/tools-403-mid-browser-proof.json` were refreshed for the final build. Full tests again passed 347/347, build passed, and the automatic UX command again reported the absent feature list. The requested saved-state evidence is included in this broader check.
