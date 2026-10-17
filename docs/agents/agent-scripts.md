# Project Agent Kit

Read this document before coding in this project. Run `scripts/agents/kit --help`, the relevant command's `--help`, then `scripts/agents/kit doctor`. Resolve failed doctor checks before implementation. Use the project-local kit from nested folders as well.

## Validation

- `kit doctor` checks the worktree identity, Node >=22.12, package/lock versions and direct declarations, installed direct dependency versions, `origin/main`, tracked source conflict markers, and every advertised command's help. It does not audit transitive package integrity or certify browser tooling.
- `kit specs` runs all existing `.test.js` and `.test.mjs` files under `src/` and `scripts/` with Node's test runner. Pass relative test paths for a focused run or `--list` to list without execution. Logs live in `.scratch/kit-specs/`.
- `kit build` wraps the existing `npm run build`. It writes `dist/` and does not deploy.
- `kit wait` retains the canonical owned-process, output-log and GitHub CI wait modes; this project's default CI branch is `main`.

**Specs are Node tests only.** Browser specs, `--affected`, screenshots (`shots`), bundle comparisons (`size`), dependency management and deployment commands are not integrated. For a Playground regression, obtain separate real-browser evidence at T3 (the browser runtime and upstream Playground), including the selected versions, packages, persistence mode, observed state and console/network errors. A successful Node test or Vite build cannot establish that an embedded Playground launched successfully. See [testing.md](../testing.md).

The retained canonical bootstrap selects an already installed Node >=24 from PATH, npx cache or nvm. It downloads nothing and changes PATH only for the command. This tooling choice does not raise the application's supported Node floor; doctor checks the project's >=22.12 floor. No editor fixtures, fixed port pools or editor bundle budgets are imported.

## Review

`kit review --base REF` or `kit review --commit SHA` reviews an immutable committed scope. The default base is `origin/main`. The project command pins Codex `gpt-6.1-sol`, `medium` effort and read-only execution, regardless of model/CLI environment overrides. Evidence is saved in `.scratch/reviews/`; inspect the report, effective model and final `RESULT:` line. Uncommitted edits are outside that scope. With no task commit, report that the review has not run rather than presenting a review of unrelated `HEAD` as validation.

The canonical `--pr N` option posts the report to GitHub. Use it only with explicit authorization to post. The runner's temporary isolated Codex home disables personal skills, plugins, apps, memories and MCP configuration. It keeps the canonical authentication refresh handling. Runner build mode is an upstream helper, not a project-integrated implementation workflow.

## Provenance

The dispatcher, shared shell/JavaScript helpers, wait/version commands, `ci-summary.mjs`, `agent-run.mjs`, `sol-run.mjs`, review command and brief generator were copied from `/home/ubulex/Projects/techies-reviews` at commit `7648a472926f4f48a7ac5ff8ae81c82d0ef69d98`. That integration derives from the canonical `/home/ubulex/Projects/native-site-editor` `origin/dev` Agent Kit; its instruction source was inspected at `e760068306bca55f71bb5371fd9729ac0588fb10`.

Local adaptations: main-root default points to this checkout, review base/briefs use `origin/main` and this project's documented checks, review invocation pins model/CLI/effort, and new `project-kit.mjs` supplies doctor/Node-spec adapters. `kit build` is a small project wrapper. `.scratch/` is ignored development evidence. Commands emit one final `RESULT: ok|fail ...` line; help is usage text, not validation.
