# Change and experiment records

Create one immutable Markdown file per meaningful product experiment, behavior change, architectural decision, regression investigation, or removal.

## Naming

Use:

```text
YYYY-MM-DD-short-descriptive-name.md
```

If multiple records share a date, make the slug unique. Copy `TEMPLATE.md`; do not edit the template in place.

## Lifecycle

1. Start the record before or with implementation and mark it `proposed` or `in-progress`.
2. Describe the current behavior and hypothesis before testing.
3. Record exact test evidence and observed results, including failures.
4. Set one final disposition: `kept`, `reworked`, `removed`, `rejected`, or `inconclusive`.
5. Link follow-up records instead of rewriting history.

## Evidence quality

Prefer, in order:

- repeatable automated test and commit;
- numbered manual procedure with environment and captured result;
- screenshot/recording tied to a commit and viewport;
- source inspection, explicitly labeled as inspection rather than execution.

“Looks good” is not enough. Record what was expected, what occurred, and any untested paths.

## Index

- [2026-08-28-current-baseline.md](2026-08-28-current-baseline.md) — reconstructed baseline and documentation pass.
- [2026-08-28-release-0.5.0.md](2026-08-28-release-0.5.0.md) — publication of release 0.5.0 through the GitHub deployment pipeline.
- [2026-08-28-featured-plugins-first.md](2026-08-28-featured-plugins-first.md) — featured WordPress.org plugins before uploads in the empty state.
- [2026-08-28-github-star-link.md](2026-08-28-github-star-link.md) — initial GitHub repository link experiment.
- [2026-08-28-official-github-star-button.md](2026-08-28-official-github-star-button.md) — official GitHub Buttons embed experiment.
- [2026-08-28-site-styled-github-stars.md](2026-08-28-site-styled-github-stars.md) — final site-styled GitHub Star control and public count.
- [2026-08-28-unified-plugin-selection.md](2026-08-28-unified-plugin-selection.md) — shared selection surfaces for every plugin source.
- [2026-08-28-unified-plugin-checkmarks.md](2026-08-28-unified-plugin-checkmarks.md) — shared round plugin selection indicators.
- [2026-08-28-uploaded-plugin-metadata-layout.md](2026-08-28-uploaded-plugin-metadata-layout.md) — two-line uploaded-plugin metadata with internal IDs hidden.
- [2026-08-28-release-0.6.0.md](2026-08-28-release-0.6.0.md) — publication of release 0.6.0 through the GitHub deployment pipeline.
- [2026-08-28-release-0.6.0-deployment-blocked.md](2026-08-28-release-0.6.0-deployment-blocked.md) — deployment investigation showing the missing Cloudflare API token and unchanged live bundle.
