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

- [2026-10-31-land-on-dev.md](2026-10-31-land-on-dev.md) — changes land on `dev` and `main` only takes `dev` (`kit pr --release --base main`); the WordPress sync opens its PRs against `dev` once the change is released to `main`.

- [2026-10-31-line-endings.md](2026-10-31-line-endings.md) — `.gitattributes` `* text=auto eol=lf` from the shared Agent Kit; a `core.autocrlf=true` checkout keeps LF (112 CRLF files before, none after).

- [2026-10-30-shared-agent-kit.md](2026-10-30-shared-agent-kit.md) — the project-local kit copy replaced by the shared Agent Kit; `npm test` no longer runs kit tests; the built site is expected unchanged (post-merge check pending).

- [2026-10-17-release-0.8.3-token-retry.md](2026-10-17-release-0.8.3-token-retry.md) — updated token enables successful 0.8.3 deployment; exact-run checks, live assets and production selected-plugin behavior verified.

- [2026-10-17-release-0.8.3-deployment.md](2026-10-17-release-0.8.3-deployment.md) — 0.8.3 pushed; GitHub tests/build pass, Cloudflare rejects token with 10000/9109, and live domain remains 0.8.0.

- [2026-10-17-release-0.8.3-validation.md](2026-10-17-release-0.8.3-validation.md) — immutable release review, CI-wait correction and additional uploaded-plugin/theme-count browser evidence before publication.

- [2026-10-17-ci-wait-sha.md](2026-10-17-ci-wait-sha.md) — explicit CI SHA waits remain pinned after cancellation; branch waits retain superseded-head following, with mocked-GitHub red/green coverage.

- [2026-10-17-release-0.8.3.md](2026-10-17-release-0.8.3.md) — patch release preparation for visible selected plugins, recognizable summary names and accurate selected counts; production verification is pending.

- [2026-10-17-selected-directory-plugins.md](2026-10-17-selected-directory-plugins.md) — selected repository plugins remain visible after clearing search; summary names and selected counts reflect the recipe; runtime hiccup remains independently unconfirmed.

- [2026-10-17-agent-kit-integration.md](2026-10-17-agent-kit-integration.md) — project-local doctor, Node specs, build, wait and read-only review integration; browser evidence remains separate.

- [2026-10-13-vivaldi-comparison-blocked.md](2026-10-13-vivaldi-comparison-blocked.md) — official Vivaldi 8.2.4133.84 extracted for comparison; headless browser startup fails before page navigation, so no Vivaldi Playground result is claimed.

- [2026-10-13-playground-standalone-chromium.md](2026-10-13-playground-standalone-chromium.md) — standalone Chrome 153/155 boot official WordPress 7.1.3; Chrome 155 also verifies a live temporary launcher setup; original T3 download failure's cause remains inconclusive.

- [2026-10-13-playground-firefox-comparison.md](2026-10-13-playground-firefox-comparison.md) — standalone Firefox 157.0 boots official WordPress 7.1.3 and reads worker ZIP bytes; original T3 Chromium failure's cause remains inconclusive.

- [2026-10-13-playground-download-failure.md](2026-10-13-playground-download-failure.md) — WordPress 7.1.3 worker download fails in both the launcher and official Playground; archive availability confirmed, exact cause and local remediation inconclusive.

- [2026-10-11-release-0.8.2-deployment-blocked.md](2026-10-11-release-0.8.2-deployment-blocked.md) — pipeline install/tests/build passed; Cloudflare rejected the API token and production still serves 0.8.0.

- [2026-10-11-release-0.8.2.md](2026-10-11-release-0.8.2.md) — release preparation for WordPress 7.1.3 fallback selection.

- [2026-10-11-wordpress-7.1.3.md](2026-10-11-wordpress-7.1.3.md) — WordPress 7.1.3 fallback selection; live latest resolution and older branches preserved.

- [2026-09-29-release-0.8.1-deployment-blocked.md](2026-09-29-release-0.8.1-deployment-blocked.md) — pipeline tests/build passed; Cloudflare rejected the stored API token.

- [2026-09-29-release-0.8.1.md](2026-09-29-release-0.8.1.md) — release preparation for the Elementor scope fix.

- [2026-09-29-short-playground-scope.md](2026-09-29-short-playground-scope.md) — short random runtime scope so Elementor's IDNA URL encoding no longer fatals at launch.

- [2026-09-16-release-0.8.0-deployed.md](2026-09-16-release-0.8.0-deployed.md) — successful pipeline, matching live assets and Chromium mixed-drop/persistence smoke.

- [2026-09-16-release-0.8.0.md](2026-09-16-release-0.8.0.md) — release preparation and local deployment checks.
- [2026-09-16-page-wide-package-drops.md](2026-09-16-page-wide-package-drops.md) — mixed plugin/theme ZIP drops and upload overlay.

- [2026-09-10-release-0.7.1-deployed.md](2026-09-10-release-0.7.1-deployed.md) — verified GitHub deployment and matching live security-release bundle.

- [2026-09-10-security-fixes.md](2026-09-10-security-fixes.md) — 0.7.1 fixes for credential-bearing recipes, vault cancellation, external setup visibility and vulnerable dependencies.

- [2026-09-10-security-review.md](2026-09-10-security-review.md) — Codex and Claude CLI security assessment, dependency audits and synthetic secret-handling probes.

- [2026-09-09-release-0.7.0-deployed.md](2026-09-09-release-0.7.0-deployed.md) — successful GitHub deployment and live Site/View Ctrl-click verification.

- [2026-09-09-release-0.7.0.md](2026-09-09-release-0.7.0.md) — separate preview tabs and compact reminder release.

- [2026-09-09-wordpress-link-verification.md](2026-09-09-wordpress-link-verification.md) — browser-driven Ctrl-click verification of the WordPress Site and View links; no implementation changes.

- [2026-09-09-preview-tabs.md](2026-09-09-preview-tabs.md) — separate tabs reuse the embedded runtime through launcher-origin preview pages.

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
- [2026-08-28-release-0.6.0-deployed.md](2026-08-28-release-0.6.0-deployed.md) — successful pipeline rerun and live 0.6.0 bundle verification.
