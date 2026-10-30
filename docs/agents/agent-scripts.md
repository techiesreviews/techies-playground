# Agent Kit in this project

This project runs the shared Agent Kit ([techiesreviews/agent-kit](https://github.com/techiesreviews/agent-kit)); no copy of it lives here. `scripts/agents/kit` is a small launcher that runs the machine's newest kit (`~/.local/share/agent-kit/current`, kept current by `kit update`), or a cached clone where there is none. Start with `scripts/agents/kit --help`, a command's `--help`, then `scripts/agents/kit doctor`; `scripts/agents/kit rulebook` prints the shared rulebook and this project's [extras](kitchen-extras.md).

## What lives here

- `scripts/agents/kit`, `scripts/agents/hooks/run.sh`: the kit launcher and the hook launcher (`.claude/settings.json`, `.codex/hooks.json`), written by `kit init`.
- `scripts/agents/kit.json`: the project's settings: landing branch `main`, `checks.test` (`npm test`), the doctor lines, `unit.run` and `unit.files`, the own-commands folder, maps and the rulebook extras.
- `scripts/agents/project.d/build`: `kit build`, the project's one own command. It runs `npm run build`, writes `dist/` and does not deploy.

## Commands used here

- `kit doctor`: the kit's checks plus this project's (Node 22.12 or newer, the package name, `package.json` agreeing with `package-lock.json`, the installed direct dependencies matching it, and no test file where `npm test` would run it besides the app's). Run `npm ci` in a new worktree first.
- `kit unit`: the app's Node tests (`src/**/*.test.js`, `scripts/*.test.mjs`) with `node --test`; `--list` shows the files, `--affected` the ones a change reaches. Logs go to `.scratch/unit/`. This replaces the old `kit specs`.
- `kit build`: the production build without a deploy.
- `kit review` and `kit pr`: Claude reviews every change, a second look follows, and `kit pr` lands it on `main`, which deploys the site (see the extras).

Browser evidence is not part of the kit here: a Node test or a Vite build cannot show that an embedded Playground started. See [testing.md](../testing.md).

## Before the shared kit

From 2026-10-17 to 2026-10-30 this project carried its own copy of the kit (`kit specs`, a Sol-pinned `kit review`, `kit wait` with its own test); see [the integration record](../changes/2026-10-17-agent-kit-integration.md) and [the move to the shared kit](../changes/2026-10-30-shared-agent-kit.md).
