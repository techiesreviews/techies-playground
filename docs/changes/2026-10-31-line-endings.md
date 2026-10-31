# LF line endings in every checkout (`.gitattributes`)

- Date: 2026-10-31
- Owner: ke-81, Claude Opus 5.5 (kitchen-everywhere ticket 81 in native-site-editor)
- Status: in-progress
- Disposition: pending
- Related version: unreleased tooling; application unchanged
- Related commit/issue: branch `kit/init-pieces`, made by `kit init --all` (Agent Kit c862b8d)

## Context

On Windows, git's usual `core.autocrlf=true` turns LF into CRLF in the working copy; in another project (CamFrame v0.6.0) that broke tests that read files. This project has been worked on from Windows (`E:\playground`), so it was exposed to the same risk. The shared Agent Kit's `kit init` now writes `* text=auto eol=lf` into `.gitattributes`, and `kit init --all` brings it to every project set up before.

## Hypothesis and success criteria

With the line, every checkout keeps LF endings whatever the platform's `core.autocrlf`, and tests that read files see the same bytes everywhere. Success: no tracked file changes when the line comes in, and `npm test` passes.

## Options considered

- Leave unchanged: each Windows contributor sets `core.autocrlf=false` by hand; easy to miss.
- `* text=auto eol=lf` (chosen): git detects text files itself, binary files stay as they are.

## Implementation or prototype

`.gitattributes` with the one line, the only piece `kit init --all` found missing here. No tracked file had CRLF endings, so the renormalize step changed nothing. `scripts/configure-cloudflare-deploy.ps1`, the one Windows-run script, is now checked out with LF too; it is unsigned, and PowerShell reads LF scripts, but it has not been run on Windows since (untested path).

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Linux, worktree of `origin/main` | `git add --renormalize .` | no file changes | none | `kit init --all` log |
| Linux, clones with `core.autocrlf=true` (as on Windows) | `git -c core.autocrlf=true clone -b <branch>`, then `git ls-files --eol` counting `w/crlf` | CRLF before, none after | `main` (278dfca): 112 of 112 files CRLF; `kit/init-pieces`: 0 of 114 | command output, 2026-10-31 |
| Linux, worktree with the main checkout's dependencies | `kit pr` runs `npm test` (no workflow runs on pull requests here) | pass | `unit: ok` | `kit pr` log, 2026-10-31 |

## Result

The line is in, and a checkout with `core.autocrlf=true` keeps LF; no other file changed.

## Disposition and rationale

Kept: it is the shared kit's setup for every project.

## Documentation impact

`docs/agents/agent-scripts.md` names `.gitattributes` among the files `kit init` writes; this record is in the index (`docs/changes/README.md`).

## Follow-ups and open questions

- After the merge: the deploy's CI result, then set Status complete and Disposition kept.
- Run `scripts/configure-cloudflare-deploy.ps1 -?` once on Windows (Windows PowerShell 5.1) with the LF checkout.
