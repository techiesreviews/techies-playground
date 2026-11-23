# Private Gutenberg sample rebuild and layout-A report

- Date: 2026-11-23
- Owner: fleet-lead
- Status: complete
- Disposition: kept
- Related version: 0.14.0
- Related commit/issue: TOOLS-417; extends TOOLS-411 / PR #70

## Context

The private runner could boot a disposable browser Playground and run both free
testers, but did not build a page or compare it with a reference. Lex selected
Gutenberg, a fleet-made sample and the existing Codex ChatGPT login. The lead
confirmed a standalone private report; hosted pairing is outside this card.

## Hypothesis and success criteria

A local run with no user tab can use signed-in Codex to rebuild header, title,
three cards and footer with native blocks, verify saved content, show a measured
sample/rebuild comparison and complete both testers. Limits must pause clearly.

## Options considered

- Keep the compatibility proof unchanged: no design evidence.
- Add hosted worker pairing: a separate security and transport feature, outside scope.
- Extend the existing private lifecycle with a fixed Gutenberg adapter and local report: selected.

## Implementation or prototype

`scripts/design-runner.mjs` uses the fixed queue and browser/tester lifecycle from
`scripts/private-runner.mjs`. It adds strict signed-in CLI generation, registered
Gutenberg serialization, REST save/readback, independent captures and a private
layout-A HTML report. See [the run guide](../design-runner.md).

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| ubulex / Node 24.22.2 | `kit doctor` before install | Missing worktree dependencies reported | Failed for missing @heroicons/react; `npm ci --ignore-scripts` installed 267 packages, no vulnerabilities; doctor then passed 17/17 | Command output in build thread |
| Node | `kit unit scripts/design-runner.test.mjs` before implementation | Red | Missing module/exports failed before code; affected suite later passed 11/11 | `.scratch/unit/20261123T124331-3408620.log`, `.scratch/unit/20261123T125344-3610208.log`, `.scratch/unit/20261123T125402-3614311.log` |
| Real signed-in CLI + browser | `kit go tools-417-proof-2 -- node scripts/design-runner.mjs once` | Native save then captures | 18 valid saved blocks; capture failed when returning millions of pixel values over the browser bridge | Private run `687f93c9-9419-427f-a9b5-5af25c989b21` |
| Real browser, frozen AI response | Capture replay | Completed pipeline | Pixel comparison stays inside Chromium; static homepage initially gave HTTP 301; using canonical `home_url('/')` then completed Query Monitor and Code Profiler | `.scratch/kit-jobs/tools-417-capture-replay-4/log` |
| Real signed-in CLI + Chromium 159.0.8154.6 / WP 7.1.4 / PHP 8.3.36 | `kit go tools-417-proof-3 -- node scripts/design-runner.mjs once` | Full unattended run | `RESULT: ok design-runner go`; 18 valid blocks; 100.00% at 1440 and 390; both testers completed | Private run `a0c710a0-d35b-4d98-988d-e89295823f83` |
| Injected CLI usage-limit response | `kit unit --affected` | Pause persisted; no browser/fallback | Paused HTML/JSON saved, browser callback forbidden; 11/11 affected checks passed | `.scratch/unit/20261123T125402-3614311.log` |
| Local report / sandboxed Chromium | `kit go tools-417-report-shots -- node .scratch/tools-417-shots.mjs` | Readable report at 1440/390; working tester links and images | Passed at both widths, no overflow at 100%/200% text and no page errors | `.scratch/tools-417-shots/result-1440.png`, `.scratch/tools-417-shots/result-390.png` |
| Node | `kit unit` | Full suite passes | 388/388 passed in 43 files | `.scratch/unit/20261123T125638-3642028.log` |
| Vite | `kit build` | Production bundle builds | `RESULT: ok build finished`; existing externalized-module and chunk-size warnings | Build command output |
| Kit UX | `kit ux` | Report missing project integration | `RESULT: fail ux ENOENT` for absent `docs/agents/features.md`; repository extras explicitly declare no feature list | Build thread; real browser checks above |

Private evidence root: `~/.local/share/techies-playground/design-tests/runs/a0c710a0-d35b-4d98-988d-e89295823f83/`.
Query Monitor 4.1.1 returned six real collector observations, 18 queries, no PHP
errors, and warm PHP median 0.104 s (0.103–0.107 s). Code Profiler 1.9.6 completed
profile `1795438449.0710` with three native plugin attribution rows and a matching
summary artifact. Reference repeat calibration scored 100%; altered fixtures scored
99.3056% / 97.4359%. Both widths had no horizontal overflow.

## Result

The complete AI-to-testers pipeline ran without an open user tab. The report lists
two semantic limits: columns use div rather than article, and document metadata/base
CSS belong to the host theme. The pixel score is explicitly a simple channel-tolerance
comparison, not SSIM. Live subscription exhaustion was not induced; pause behavior
was exercised using an injected CLI response. No API key, paid fallback, new service,
Cloudflare action or production release was used.

## Disposition and rationale

Kept: the fixed local pipeline completes with real native readback, capture calibration
and both testers. The remaining limitations are explicit in the report and run guide.

## Documentation impact

Updated context, documentation index, architecture, rebuild specification, data
contracts, testing, private run guide, changelog and version.

## Follow-ups and open questions

- Suggest a separate card for hosted report navigation and secure worker pairing.
- No automatic retention, restart recovery, repair loop or live billing audit is claimed.
