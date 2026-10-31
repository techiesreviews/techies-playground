# Kitchen extras: techies-playground

`scripts/agents/kit rulebook` prints the shared rulebook, then this file. Where they differ, this
file wins.

## Branches, checks and the shared file

- **Landing branch `dev`, release branch `main`** (`branches` in `scripts/agents/kit.json`). Every
  change lands on `dev` through `scripts/agents/kit pr`; `main` only takes `dev`, through
  `scripts/agents/kit pr --release --base main`, and every push to `main` deploys the site (see Release).
- **Checks:** `npm test` (`checks.test`, Node's test runner over the app's tests) before every
  `kit pr`; there is no `check` or `lint` command. `kit unit` runs the same tests through the kit
  (`unit.files`: `src/**/*.test.js` and `scripts/*.test.mjs`); `kit unit --affected` while building.
- **`kit doctor`** adds this project's lines (`checks.doctor`): Node 22.12 or newer, the package
  name, `package.json` agreeing with `package-lock.json`, the installed direct dependencies matching
  the lockfile, and no test file outside `src/**/*.test.js` and `scripts/*.test.mjs` (`npm test`
  searches the whole repository). A new worktree needs `npm ci` before `kit doctor` passes; there is
  no shared `node_modules`.
- **Own check commands** (`scripts/agents/project.d/`): `kit build` runs `npm run build` and writes
  `dist/` without deploying; run it for any change under `src/`, `public/`, `index.html`,
  `vite.config.js` or `worker.js`.
- **Shared file:** none.
- **Docs the shared rulebook names:** no runner guide, issue tracker guide or UX rulebook of its own;
  maps and tickets go in `docs/wayfinder/`. The product docs start at `docs/README.md` and
  `CONTEXT.md`; `AGENTS.md` holds the documentation and change-record rules.

## Visible changes

- **Feature list:** none; the user-facing changelog is `CHANGELOG_ENTRIES` in `src/App.jsx`.
- **Browser evidence:** Node tests and `kit build` never prove that an embedded Playground starts.
  A Playground change gets real-browser evidence through T3 (selected versions, packages,
  persistence mode, what was seen, console and network errors), as `docs/testing.md` describes.

## After a release

- GitHub Actions (`.github/workflows/deploy.yml`) runs `npm ci`, `npm test` and `npm run build` on
  a push to `main` (or a manual run), then deploys to <https://play.techies.tools>, but only in
  `techiesreviews/techies-playground`, when the push comes from the `techiesreviews` account and the
  repository variable `CLOUDFLARE_DEPLOY_ENABLED` is `true`; otherwise the job is skipped, and a
  skipped run is not a green one. No workflow runs on pull requests or on `dev`, so `kit pr` has no
  checks to wait for: a change's CI result is the deploy run on `main` after its release. The lead
  checks that run and, for a visible change, the live site.

## Release

"Deploy", "redeploy", "publish" and "release" mean prepare and verify the changes, land them on
`dev`, release `dev` to `main` (`scripts/agents/kit pr --release --base main`), and let the GitHub pipeline
deploy the site to Cloudflare.

- Do not run `wrangler deploy` or publish to Cloudflare directly unless Lex asks for a manual
  deployment.
- A change users can see updates the user-facing `CHANGELOG_ENTRIES` in `src/App.jsx` first: every
  relevant change since the newest entry, and the semantic version bumped in `package.json`,
  `package-lock.json` and the newest entry. Check the changelog is current, the versions agree and
  the tests and build pass before landing.
- A change users cannot see (agent setup, docs, tests) lands without a changelog entry or version
  bump; its deploy rebuilds the same site.
- After the release, check the deploy run and the live domain where the tools allow it. The live
  version is the newest changelog entry and `version` in `package.json`; each release gets its
  record in `docs/changes/`.

## Other

- **Change records:** every meaningful experiment, behaviour change, architectural decision,
  regression investigation or removal gets a dated record in `docs/changes/` (`AGENTS.md`).
- **WordPress sync:** `.github/workflows/sync-wordpress-release.yml` opens a daily
  `automation/wordpress-<version>` PR into `dev` when WordPress.org ships a new stable release; it
  goes live with the next release.
