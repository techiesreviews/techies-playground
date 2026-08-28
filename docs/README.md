# Project documentation

These documents are designed so an AI can understand, maintain, or rebuild Techies Playground without reverse-engineering intent from the source alone.

## Reading order

1. [../CONTEXT.md](../CONTEXT.md) — product language, goals, boundaries, and invariants.
2. [rebuild-spec.md](rebuild-spec.md) — complete user-visible behavior and acceptance criteria.
3. [architecture.md](architecture.md) — modules, callers, runtime sequence, integrations, and deployment.
4. [data-contracts.md](data-contracts.md) — recipes, local storage, IndexedDB, OPFS, and security-sensitive data.
5. [testing.md](testing.md) — automated coverage, manual test matrix, and evidence rules.
6. [product-history.md](product-history.md) — evidence-backed product evolution and superseded behavior.
7. [changes/README.md](changes/README.md) — how to record experiments and changes from now on.

`license-helper.md` is a focused design note for a possible native Windows license companion. It is not part of the current application.

## Sources of truth

When documentation and implementation disagree, resolve the mismatch instead of silently picking one:

- Current user behavior: `src/App.jsx` and `src/lib`.
- Recipe defaults and validation: `src/lib/recipe.js`.
- Persistence schemas: `src/lib/vault.js`, `src/lib/license-vault.js`, and the `localStorage` constants.
- User-facing release notes: `CHANGELOG_ENTRIES` in `src/App.jsx`.
- Version: `package.json` and `package-lock.json`.
- Deployment contract: `AGENTS.md` and `.github/workflows/deploy.yml`.
- Historical experiment evidence: immutable records in `docs/changes` plus Git history.

## Documentation maintenance

For any user-visible or architectural change:

1. Update the relevant current-state document.
2. Add a dated record under `docs/changes` using `TEMPLATE.md`.
3. State what was tested, the actual result, and the disposition: `kept`, `reworked`, `removed`, `rejected`, or `inconclusive`.
4. Link concrete evidence such as tests, a commit, screenshots, or a reproducible manual procedure.
5. Update `CHANGELOG_ENTRIES` and versions when preparing a deployment.

Never rewrite old experiment outcomes to match the current implementation. Add a newer record that supersedes the old one.
