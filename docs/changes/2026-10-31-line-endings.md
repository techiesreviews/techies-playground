# LF line endings in every checkout (`.gitattributes`)

- Date: 2026-10-31
- Owner: ke-81, Claude Opus 5.5 (kitchen-everywhere ticket 81 in native-site-editor)
- Status: complete
- Disposition: kept
- Related version: unreleased tooling; application unchanged
- Related commit/issue: branch `kit/init-pieces`, made by `kit init --all` (Agent Kit c862b8d)

## Context

A Windows checkout turned LF into CRLF in the working copy (this project has been worked on from `E:\playground`), and in another project (CamFrame v0.6.0) that broke tests that read files. The shared Agent Kit's `kit init` now writes `* text=auto eol=lf` into `.gitattributes`, and `kit init --all` brings it to every project set up before.

## Hypothesis and success criteria

With the line, every checkout keeps LF endings whatever the platform's `core.autocrlf`, and tests that read files see the same bytes everywhere. Success: no tracked file changes when the line comes in, and `npm test` passes.

## Options considered

- Leave unchanged: each Windows contributor sets `core.autocrlf=false` by hand; easy to miss.
- `* text=auto eol=lf` (chosen): git detects text files itself, binary files stay as they are.

## Implementation or prototype

`.gitattributes` with the one line, added by `kit init --all` with the kit's other missing pieces. No tracked file had CRLF endings, so the renormalize step changed nothing.

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Linux, worktree of `origin/main` | `git add --renormalize .` | no file changes | none | `kit init --all` log |
| Linux | `kit pr` (`npm test`) | pass | see the PR | PR checks |

## Result

The line is in; nothing else changed.

## Disposition and rationale

Kept: it is the shared kit's setup for every project.

## Documentation impact

`docs/agents/agent-scripts.md` names `.gitattributes` among the files `kit init` writes.

## Follow-ups and open questions

None.
