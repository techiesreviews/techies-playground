# Security review with independent Claude CLI assessment

- Date: 2026-09-10
- Owner: Codex, with independent Claude CLI review
- Status: complete
- Disposition: kept
- Related version: 0.7.0
- Related commit/issue: c3a59ba57686b9fc7c06343ed84dbeac329a1c12

## Context

The user requested a security check by Codex and Claude CLI. Scope: tracked application source, dependencies, delivery workflows, vault and preview boundaries, and passive production response headers. No remediation or deployment was requested. Application source and dependency versions are unchanged.

## Hypothesis and success criteria

Identify actionable issues, distinguish executable evidence from source inspection and hypotheses, and compare independent reviews without treating advisory severity as proof of application exploitability.

## Options considered

- Source inspection alone: misses current dependency advisories and observable runtime behavior.
- Source review plus dependency audit, synthetic probes, baseline checks and passive live headers: selected.
- Broad active production penetration testing: outside this review.

## Implementation or prototype

Evidence is retained in [the security evidence directory](../security/2026-09-10/). Probes use synthetic secrets and mock browser storage/clipboard; they do not access a user's vault.

## Findings from Codex

### 1. Known vulnerable dependency versions — prioritize remediation

`package-lock.json:3537` locks fast-uri 3.1.5 via `@wp-playground/blueprints -> ajv`. The current audit flags four URI canonicalization advisories against this single production dependency. Upgrade to a compatible patched release (3.1.6 or newer), regenerate the lockfile and validate Playground startup. [Maintainer advisory](https://github.com/fastify/fast-uri/security/advisories/GHSA-5jgf-p345-68v8).

`package-lock.json:4658` locks sharp 0.35.2 through `wrangler -> miniflare`; the audit also counts those ancestors, giving four high-severity package entries overall, not four independent application exploits. The Sharp advisory identifies versions below 0.35.4. This chain is development tooling; the application's deployed Worker only serves assets and does not call Sharp. Update the tooling chain compatibly. Do not blindly apply the audit's proposed Wrangler downgrade to 4.15.2. [Sharp advisory](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c).

Evidence: executed full and production-only npm audits and `npm ls fast-uri sharp miniflare wrangler`. Production-only audit reports one high entry. No reachable host-policy bypass or image-decoder exploit was demonstrated in this application; advisory severity is upstream severity.

### 2. Recipe URLs retain credentials — medium, confirmed

`src/lib/recipe.js:48` validates only URL scheme, and `src/lib/recipe.js:142` returns normalized URL strings. A URL containing `demo:synthetic-password@` and a URL with `?token=synthetic-token` both survive validation. Saved recipes, draft storage, exports and history serialize recipe fields, so a user who enters a credential-bearing URL can persist or share that credential in plaintext. The forbidden JSON-field scan does not inspect credentials inside string values. WXR URLs also enter Blueprints.

Fix: reject URL username/password; establish a policy for recognizable sensitive query parameters and explain that signed/authenticated URLs cannot be treated as secret-free portable configuration. Arbitrary secrets in arbitrary text cannot be detected reliably. Add validation and serialization regression coverage.

### 3. Lock does not cancel an in-flight clipboard operation — low, confirmed with mock browser APIs

`src/App.jsx:800` clears the key ref on Lock; `src/App.jsx:860` previously passes the key to `copyLicenseToClipboard`. `src/lib/license-vault.js:173` retains that argument across the IndexedDB read and decryption, then writes plaintext without checking whether the vault session is still active. The retained probe starts a copy, clears the ref, resolves the pending read, and observes a subsequent clipboard write. This requires a copy initiated by the user before locking; it is not an unauthenticated vault unlock.

Fix: invalidate operations with a vault-session generation on lock/close and check it immediately before clipboard writes. Apply equivalent stale-operation guards to create/unlock handlers (`src/App.jsx:763` and `:784`), which can assign a key after close has cleared it. That related UI race is source-inspected, not browser-reproduced. Clearing a ref also does not erase plaintext already copied to the OS clipboard.

### Additional hardening and unresolved hypotheses

- `src/lib/recipe.js:106` accepts `//example.com/path` and `/\\example.com/path` as landing paths. Probe confirms acceptance only; external navigation or exfiltration was not demonstrated. Claude traced `pathToInternalUrl` in the installed `@php-wasm/universal/index.js:2909`; Codex independently inspected it and confirmed it concatenates the existing absolute URL with the supplied path. This reduces the open-redirect concern for the current dependency. Resolve against a fixed origin and reject origin changes, backslashes and control characters.
- `worker.js:5` permits all HTTPS connections. Narrowing the launcher allowlist could limit exfiltration after an independent script compromise, but compatibility with URL-based advanced features needs testing. This is defense in depth, not a standalone exploit.
- Live HTTPS response lacks Strict-Transport-Security. Consider an appropriate HSTS policy after checking the domain's HTTPS requirements; no downgrade attack was tested.
- License names and package associations are stored unencrypted by design (`src/lib/license-vault.js:163`). UI hiding is not encryption of metadata.
- Vault initialization checks existence and later overwrites metadata in separate transactions (`src/lib/license-vault.js:118`). Concurrent initialization in two tabs may overwrite key-derivation metadata and strand records. Source hypothesis; no two-tab reproduction. Use an atomic create-if-absent transaction and handle stale keys across reset.

## Independent Claude CLI review and reconciliation

Claude CLI 2.1.267 completed successfully with exit 0. It was run in safe mode with only Read/Glob/Grep tools allowed, no MCP servers, and instructions to review without edits, shell execution, credential access or delegation. The default configured model was used; the text output does not identify the exact model. [Unmodified Claude assessment](../security/2026-09-10/claude-review.md).

Invocation:

```text
claude -p --safe-mode --strict-mcp-config --tools Read,Glob,Grep --allowedTools Read,Glob,Grep --permission-mode dontAsk --output-format text '<read-only security review prompt>'
```

Claude's findings are source-level observations, not executed exploit evidence. The following reconciled assessment takes precedence over severity labels in its raw output:

- **Imported recipe execution settings: medium trust/visibility concern.** Claude correctly observed that import immediately applies/saves the recipe (`src/App.jsx:1616`), while WXR and extension manifest URLs are under collapsed Advanced settings. Launch subsequently consumes them. A malicious shared recipe can select remote extension artifacts without a prominent execution warning. Surface these settings during import and before launch. This requires importing and launching an untrusted recipe; these are existing advanced features, not proof of launcher-origin code execution. Claude's term “SSRF” overstates demonstrated evidence: there is no app backend, and localhost reachability depends on the actual fetch/proxy route, CORS and browser local-network restrictions, none of which was tested. Also, same-origin policy provides storage separation; `frame-src` and `frame-ancestors` are not themselves storage-isolation mechanisms.
- **Floating `latest` dependencies: supply-chain hardening.** Prefer explicit versions and deliberate update review. The committed lockfile and CI's `npm ci` already make current installs reproducible. Plain `npm install` does not necessarily refresh a valid existing lockfile; the risk arises when dependencies are updated or the lockfile is regenerated. This is not a confirmed compromise.
- **Broad `connect-src`: agreement.** Defense in depth only, as documented above.
- **Package ID collisions: acknowledged existing integrity/UX risk.** A user-imported ZIP can replace an existing normalized ID, affecting later launches. Requires accepting the replacement package; no automatic remote overwrite was found. A replacement notice/hash comparison would improve visibility.
- **Landing paths: concern reduced by dependency trace.** See the additional-hardening note above; no current open redirect established.
- **`workers_dev: true`: informational.** Configuration enables another delivery origin; account state and the actual workers.dev endpoint were not checked.

Claude did not report the current dependency advisories or the confirmed copy-after-lock probe result; those come from Codex's executed checks. Neither review established a critical exploit in the launcher.

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Claude CLI | Read-only invocation above | Independent source assessment | Completed, exit 0 | [Raw review](../security/2026-09-10/claude-review.md) |
| Local working tree | `npm test` | Baseline tests pass | 55 passed, 0 failed | Node test runner output |
| Local working tree | `npm run build` | Production build completes | Passed; browser-externalization and large-chunk warnings | Vite 7.3.6 output |
| npm registry | `npm audit --json` | Enumerate advisories | 4 high package entries, 0 critical; exit 1 | [Full audit](../security/2026-09-10/npm-audit.json) |
| npm registry | `npm audit --omit=dev --json` | Separate production dependency risk | 1 high, 0 critical; exit 1 | [Production audit](../security/2026-09-10/npm-audit-production.json) |
| Node, synthetic input | `node docs/security/2026-09-10/recipe-url-probe.mjs` | Identify rejected/retained inputs | All four inputs accepted unchanged | [Probe](../security/2026-09-10/recipe-url-probe.mjs) |
| Node, mocked IDB/clipboard | `node docs/security/2026-09-10/copy-after-lock-probe.mjs` | Check copy completion after ref clearing | Both `keyReferenceCleared` and `clipboardWriteCompletedAfterLock` true | [Probe](../security/2026-09-10/copy-after-lock-probe.mjs) |
| Production, passive request | `curl -sSI --max-time 20 https://play.techies.tools` | Inspect delivered security headers | HTTP 200; CSP, Permissions-Policy, no-referrer, nosniff, SAMEORIGIN present; HSTS absent | Response observed 08:10:57 UTC |
| Tracked working-tree files | Limited Python pattern scan over `git ls-files` | Detect common private-key/GitHub/AWS/API-token shapes without printing values | No matches | Does not cover git history, arbitrary passwords or all token formats |

## Result

Baseline checks pass, but dependency advisories and two concrete secret-handling gaps need follow-up. Strong existing controls include AES-GCM with random IVs, non-exportable PBKDF2-derived keys, authenticated license metadata, React text rendering, exact preview-origin validation, and commit-pinned deployment actions. These checks do not certify the application free of vulnerabilities.

## Disposition and rationale

Kept: retain the assessment and reproducible evidence as the security baseline. Application fixes remain follow-up work; this disposition does not mean the identified risks are accepted permanently.

## Documentation impact

Added this review and evidence only. Runtime behavior is unchanged, so current-state architecture/contracts, changelog and semantic versions are unchanged.

## Follow-ups and open questions

Address findings 1–3, then verify the source-only race and navigation hypotheses in real browsers. No active attacks, real-vault inspection, full git-history secret scan, or Cloudflare/GitHub account configuration audit was performed.
