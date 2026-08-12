# Local license companion design

## Goal

Make repeated development activations easier without allowing the launcher, Codex, recipes, source control, URLs, logs, or shell history to receive license keys.

## Recommended order

1. Prefer the plugin vendor's development, staging, or external-key feature.
2. Otherwise use a password manager and activate manually while Codex/browser automation is not controlling the page.
3. Build a local adapter only for plugins that publish a stable activation interface.

## Proposed Windows architecture

```text
Credential Manager entry: wp-playground/<plugin-id>
                     ↓
user launches a signed local helper manually
                     ↓
helper asks for Windows user-presence approval
                     ↓
plugin adapter performs one activation request
                     ↓
plaintext memory is cleared; no value is returned to the launcher
```

The browser launcher may request only a non-secret result such as `activated`, `rejected`, or `network error`. It must never receive the credential value.

## Required controls

- Bind any local listener to `127.0.0.1`, not all interfaces.
- Require a short-lived, single-use challenge created by the helper—not a reusable token embedded in frontend code.
- Allow only an explicit list of plugin IDs and activation destinations.
- Verify the request origin and reject cross-origin browser requests.
- Never put keys in process arguments, environment variables, URLs, JSON responses, exception messages, analytics, or clipboard history.
- Redact request bodies from logs and disable PowerShell transcription for the activation process if organizational policy permits.
- Clear plaintext buffers as far as the runtime allows.
- Require a visible user confirmation for every activation.
- Keep Codex and browser automation disconnected while the activation form or helper is handling a key.

## Why adapters are plugin-specific

Premium plugins use different mechanisms: WordPress options, REST routes, admin AJAX, vendor SDKs, constants, or environment-backed external keys. Guessing an option name or writing directly to the database may appear to work while skipping vendor activation, domain registration, signature checks, or deactivation bookkeeping.

An adapter therefore needs documented details for each plugin:

- credential entry name;
- activation and deactivation interface;
- required site URL or instance identifier;
- development/staging activation behavior;
- update-download authentication behavior;
- non-secret status check.

## Unblock

Unblock's public changelog says its license SDK supports an external key and that update checks use POST to keep keys out of URLs and server logs. The exact external-key constant, hook, or environment name is not publicly documented in the pages reviewed for this project.

Do not guess that integration name. A safe next step is to inspect a key-free Unblock ZIP locally or ask the vendor for the documented external-key configuration. Once confirmed, an Unblock-only adapter can be built without ever sharing the actual key with Codex.
