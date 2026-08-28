# Repository instructions

## Deployments

- In this repository, "deploy", "redeploy", "publish", and "release" mean: prepare and verify the changes, commit them to `main`, and push `main` to `origin` so the existing GitHub pipeline deploys the site to Cloudflare.
- Do not run `wrangler deploy` or otherwise publish directly to Cloudflare unless the user explicitly asks for a manual/direct Cloudflare deployment.
- Before pushing for deployment, update the user-facing `CHANGELOG_ENTRIES` in `src/App.jsx`.
- Include all relevant changes since the latest changelog entry and bump the semantic version in `package.json`, `package-lock.json`, and the newest changelog entry as appropriate.
- Verify the changelog is current, the version values agree, and relevant tests/build checks pass before pushing.
- After pushing, verify the GitHub deployment pipeline and the live domain when the available tooling permits it.

## Documentation and experiment history

- Read `CONTEXT.md` and `docs/README.md` before making architectural or user-visible changes.
- Keep the current-state documents aligned with the implementation, especially `docs/rebuild-spec.md`, `docs/architecture.md`, `docs/data-contracts.md`, and `docs/testing.md`.
- For every meaningful product experiment, behavior change, architectural decision, regression investigation, or removal, create a dated record in `docs/changes/` from `docs/changes/TEMPLATE.md`.
- Record exact tests and observed results. Distinguish source inspection from executed evidence, and do not claim unrun checks passed.
- Give each completed record one disposition: `kept`, `reworked`, `removed`, `rejected`, or `inconclusive`.
- Do not erase or rewrite old outcomes when behavior changes. Add a new record that links to and supersedes the old one.
- A deployment change must update the user-facing changelog/version as described above as well as the relevant current-state documentation and change record.
