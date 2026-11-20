# Deploy: security checks before deploying, Playground build as a same-run artifact

- Date: 2026-11-20
- Owner: Claude Opus 5.5 (fleet builder, TOOLS-111)
- Status: complete
- Disposition: kept
- Related version: unreleased (no visible change, no version bump)
- Related commit/issue: Orbit TOOLS-111 and the TOOLS-237 follow-ups; supersedes the two `deploy-site.yml` follow-ups in [the Playground release sync record](2026-11-20-playground-release-sync-and-security-checks.md); branch `build/tools-111-fix-the-6-high-advisories-in`

## Context

TOOLS-111 asked to fix the high npm advisories the 2026-11-04 audit found on the Playground landing branch (six then, seven on 2026-11-14 with `isomorphic-git`). Since then the `isomorphic-git` override and Playground updates have landed on `dev`.

The Playground release sync record left two follow-ups for `deploy-site.yml`, held back while PRs #43 and #44 changed that file:

1. The security checks ran only in `security-checks.yml`, beside the deploy: a deploy did not wait for them, so a commit with an open high advisory still deployed.
2. The `playground-build` job handed its output to the `playground-host` deploy job through the Actions cache, under a key anyone can predict. Any workflow run on `dev` or `main` that could save a cache entry under that key would have its files deployed to the Playground host.

## Hypothesis and success criteria

- A fresh `npm audit` of `origin/dev` shows no high advisory.
- Neither deploy job starts until the security checks pass.
- The host deploy job deploys only what the build job of the same run produced; no job reads or writes the Actions cache.

## Options considered

- **Call `security-checks.yml` from `deploy-site.yml`** (`workflow_call`). One definition of the checks, but its concurrency group (`security-checks-<ref>`, cancel in progress) would be shared with its own push run on `dev`, so the two runs could cancel each other, and the callers would need `security-events: read`. Not chosen.
- **Add the checks to the `test` job.** Matches the record's first wording, but a slow advisory request would hold up the tests' result. Not chosen.
- **A `security` job in `deploy-site.yml`** with the audit and the advisory check, which both deploy jobs need. Chosen. The Dependabot alert step stays only in `security-checks.yml`: the alerts describe `main`, and that workflow already skips them on pushes.
- **Keep the cache for the build and also upload an artifact.** Faster, but the deploy would still trust whatever the cache held. Not chosen.
- **Same-run artifact, no cache.** Chosen. Every deploy builds Playground afresh; the last uncached preview build took 4 min 50 s (run 44818176834).

## Implementation or prototype

- `.github/workflows/deploy-site.yml`:
  - New `security` job: `npm audit --audit-level=high`, then `node scripts/check-playground-advisories.mjs` (which runs even when the audit fails, so one run reports both). `playground-host` and `launcher` list it in `needs`.
  - `playground-build` no longer restores or saves a cache; it always builds and uploads `.playground-build/wasm-wordpress-net` as the `playground-website` artifact (`actions/upload-artifact` v7.0.2, the pin `sync-playground-release.yml` uses; hidden files kept, empty upload fails, kept one day).
  - `playground-host` downloads that artifact (`actions/download-artifact` v8.0.2) instead of `actions/cache/restore`.
  - The patch hash is no longer part of a cache key; the build still checks the downloaded patch against it.
- `scripts/deploy-workflow.test.mjs`: three new tests (deploy jobs need `security`; the security job's two checks; the artifact hand-off with no `actions/cache` anywhere). The patch test no longer checks a cache key.

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Local, fresh worktree of `origin/dev` at `67e78b7`, Node 24 | `npm ci`, then `npm audit` and `npm audit --omit=dev` | No high advisory | `found 0 vulnerabilities` for both | Command output |
| Local, against GitHub | `node scripts/check-playground-advisories.mjs` | No advisory | "No published advisory covers the 24 Playground packages installed or served by the Playground host (3.1.64)." | Script output |
| Local, Node 24 | `node --test scripts/deploy-workflow.test.mjs` before the workflow change | The three new tests fail | 6 pass, 3 fail (the three new tests) | Test output |
| Local, Node 24 | The same, after the change; `npm test` | All pass | 9/9; 236/236 | Test output |
| Local | `python3 -c 'yaml.safe_load(...)'` over the workflow | Parses; needs as intended | Parses; `playground-host` needs settings, test, security, playground-build; `launcher` needs settings, test, security, playground-host | Script output |
| GitHub Actions, after merge into `dev` | The preview deploy run | Security job passes, build uploads, host downloads and deploys | See the PR and the preview deploy run | Pending at time of writing |

## Result

The audit found nothing left to fix on `dev`. The deploy now waits for the security checks and deploys only the Playground build from its own run.

## Disposition and rationale

Kept. Two small workflow changes that close the open follow-ups; nothing visible changes.

## Documentation impact

- `docs/architecture.md`: the deploy's security job and the artifact hand-off.
- `docs/testing.md`: the `deploy-workflow.test.mjs` row.
- No version bump or changelog entry: nothing visible changes.

## Follow-ups and open questions

- Every deploy, production included, now fails while a high npm advisory or a Playground advisory is open, even one without a fix yet. Shipping through it needs the advisory fixed or overridden first.
