# Repository instructions

## Deployments

- Every merge into `main` deploys the site through GitHub Actions. What "deploy", "redeploy", "publish" and "release" mean here, and the changelog and version rule, are in the Release section of [docs/agents/kitchen-extras.md](docs/agents/kitchen-extras.md#release) (also printed by `scripts/agents/kit rulebook`).

## Documentation and experiment history

- Read `CONTEXT.md` and `docs/README.md` before making architectural or user-visible changes.
- Keep the current-state documents aligned with the implementation, especially `docs/rebuild-spec.md`, `docs/architecture.md`, `docs/data-contracts.md`, and `docs/testing.md`.
- For every meaningful product experiment, behavior change, architectural decision, regression investigation, or removal, create a dated record in `docs/changes/` from `docs/changes/TEMPLATE.md`.
- Record exact tests and observed results. Distinguish source inspection from executed evidence, and do not claim unrun checks passed.
- Give each completed record one disposition: `kept`, `reworked`, `removed`, `rejected`, or `inconclusive`.
- Do not erase or rewrite old outcomes when behavior changes. Add a new record that links to and supersedes the old one.
- A deployment change must update the user-facing changelog/version as the Release section of `docs/agents/kitchen-extras.md` describes, as well as the relevant current-state documentation and change record.

Kitchen rulebook: `scripts/agents/kit rulebook` (stations, who decides, builder and reviewer pins).
Agent commands: `scripts/agents/kit --help`; `scripts/agents/kit <command> --help` for one.
