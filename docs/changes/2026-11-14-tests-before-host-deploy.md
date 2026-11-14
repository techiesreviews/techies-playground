# Tests run before any deploy, the Playground host included

- Date: 2026-11-14
- Owner: fleet-lead build agent (Claude Opus 5.5)
- Status: complete (the first CI run is recorded in the release PR)
- Disposition: kept
- Related version: 0.9.0 (no user-visible change, no bump)
- Related commit/issue: Orbit TOOLS-236; release review finding R1-1 on PR #22; follows [2026-11-14-self-hosted-playground.md](2026-11-14-self-hosted-playground.md)

## Context

`deploy-site.yml` (used by both `deploy.yml` for production and `deploy-preview.yml` for the preview) ran `npm test` only in the launcher job. The Playground host job (wp.techies.tools and its CORS proxy) runs before the launcher job, so a commit with failing tests could still put a new Playground host live. The old single-job `deploy.yml` always tested before any deploy.

## Hypothesis and success criteria

A separate test job that both deploy jobs need restores "no deploy without passing tests" for production and preview. Success: in the parsed workflow, `playground-host` and `launcher` both list `test` in `needs`, and the `test` job runs `npm ci` and `npm test`.

## Options considered

- `npm test` as a step in the host job before Wrangler: works, but the tests would run twice (host and launcher) and the launcher would still depend on the host's copy.
- A `test` job that both deploy jobs need (chosen): one test run, it runs alongside the slow upstream build, and any later deploy job only needs to add `test` to `needs`.
- Leave unchanged: rejected; failing tests could ship a new host.

## Implementation or prototype

`.github/workflows/deploy-site.yml`: new `test` job (checkout, Node 24, `npm ci`, `npm test`); `playground-host` needs `[settings, test, playground-build]`; `launcher` needs `[settings, test, playground-host]` and no longer runs the tests itself (renamed "Deploy launcher"). The preview workflow uses the same file, so it gets the same order. `scripts/deploy-workflow.test.mjs` guards the order.

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Local, Python `yaml.safe_load` | Parse `deploy-site.yml` and print each job's `needs` | `test` in both deploy jobs | `playground-host: [settings, test, playground-build]`, `launcher: [settings, test, playground-host]` | Executed |
| Local, Node 24.22.2 | `node --test scripts/deploy-workflow.test.mjs` | Pass | 2 passed, 0 failed | Executed |
| Local, Node 24.22.2 | Same test with `test` removed from `playground-host`'s `needs` (reverted after) | Fail | Failed: "playground-host must list test in needs" | Executed |
| Local, Node 24.22.2 | `scripts/agents/kit unit` (same files as `npm test`) | Pass | 119 passed, 0 failed, 20 files | Executed through the kit |
| GitHub Actions | First preview run on `dev` after landing | `test` job before both deploy jobs | Not run at writing; the release PR links the run | Pending |

`scripts/deploy-workflow.test.mjs` reads `deploy-site.yml` without a YAML parser: it checks that every job using `cloudflare/wrangler-action` lists `test` in `needs`, and that the `test` job runs `npm ci` and `npm test`.

## Result

Both deploy jobs wait for the tests.

## Disposition and rationale

Kept: smallest change that closes R1-1 for production and preview.

## Documentation impact

`docs/agents/kitchen-extras.md` (After a release), `docs/architecture.md` (Delivery) and `docs/testing.md` (test count) describe the new order. Changelog and version unchanged: users see no difference.

## Follow-ups and open questions

- None.
