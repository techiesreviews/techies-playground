# Repository instructions

## Deployments

- In this repository, "deploy", "redeploy", "publish", and "release" mean: prepare and verify the changes, commit them to `main`, and push `main` to `origin` so the existing GitHub pipeline deploys the site to Cloudflare.
- Do not run `wrangler deploy` or otherwise publish directly to Cloudflare unless the user explicitly asks for a manual/direct Cloudflare deployment.
- Before pushing for deployment, update the user-facing `CHANGELOG_ENTRIES` in `src/App.jsx`.
- Include all relevant changes since the latest changelog entry and bump the semantic version in `package.json`, `package-lock.json`, and the newest changelog entry as appropriate.
- Verify the changelog is current, the version values agree, and relevant tests/build checks pass before pushing.
- After pushing, verify the GitHub deployment pipeline and the live domain when the available tooling permits it.
