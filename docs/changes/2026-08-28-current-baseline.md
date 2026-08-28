# Current project baseline and documentation system

- Date: 2026-08-28
- Owner: Codex documentation pass
- Status: complete
- Disposition: kept
- Related version: 0.5.0 working tree
- Related commit/issue: baseline is based on `main` at `9f51658` plus the pre-existing uncommitted working-tree changes

## Context

The repository had a detailed README and focused license-helper note, but no single domain context, rebuild specification, full data map, manual verification matrix, or durable format for recording work that was tried and later removed.

The goal of this pass was to make the product reconstructable by an AI and to prevent future experiment history from being lost.

## Inspected scope

- Every source, test, configuration, workflow, script, recipe, and existing Markdown file outside generated/dependency directories.
- The five commits from initial launch through `9f51658`.
- The complete current working-tree diff, including release synchronization and featured plugin discovery.
- Runtime/module flows through source inspection.

Generated `dist`, `node_modules`, `.wrangler`, and `.git` internals were not treated as source documentation.

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Windows, Node 24.15.0, repository working tree | `npm test` | All unit/contract tests pass. | 48 passed, 0 failed, duration about 209 ms. | Terminal output on 2026-08-28. |
| Windows, Node 24.15.0, Vite 7.3.6 | `npm run build` | Vite produces a fresh `dist`. | Inconclusive: command emitted only the npm/Vite invocation and did not complete within 60 seconds; it was stopped. Importing `@tailwindcss/vite` directly also did not complete within 10 seconds. CI is configured for Node 22, which was not available for this local comparison. | Terminal sessions on 2026-08-28. |
| T3 collaborative browser with existing `dist` served locally | Navigate to local port and capture semantic snapshot. | Page loads and snapshot is captured. | Navigation reached the page title, but two snapshot attempts failed in the preview tooling. | Preview tool output on 2026-08-28. |
| In-app browser fallback | Connect to the same local preview after the native snapshot failures. | A second browser surface can capture the page. | Inconclusive: no fallback browser instance was available. | Browser connection output on 2026-08-28. |
| Source and Git inspection | Trace modules, callers, storage, runtime flow, UI strings/states, workflows, and commit chronology. | Documentation matches current working tree and identifies historical evidence limits. | Completed. | Documents created by this record. |

## Result

Created a current-state documentation set, explicit product glossary/invariants, rebuild acceptance criteria, architecture/data maps, testing matrix, evidence-backed history, and reusable change-record template.

The test suite is proven green. A fresh production build and visual browser snapshot are not claimed as successful in this record. Existing `dist` predated this pass and is not evidence that the current source rebuilt during the pass.

## Disposition and rationale

Keep the documentation system. It preserves both current truth and historical outcomes while being explicit about evidence gaps. Future behavior changes should update current-state docs and add a new immutable record.

## Documentation impact

- Added `CONTEXT.md`.
- Added the docs index, rebuild spec, architecture, data contracts, testing, and product history.
- Added this change ledger and template.
- Added future documentation maintenance requirements to `AGENTS.md`.
- Added a documentation entry point to `README.md`.

## Follow-ups and open questions

- Diagnose the local Vite startup/build hang in a separate change record if it reproduces outside this documentation pass.
- Add end-to-end Playground, accessibility, and screenshot regression coverage.
- Capture canonical desktop/mobile screenshots after browser tooling is reliable, tied to a known commit and viewport.
