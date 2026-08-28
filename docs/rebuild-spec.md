# Rebuild specification

This document describes the product independently of its current code layout. A conforming rebuild should satisfy these behaviors and the contracts in [data-contracts.md](data-contracts.md).

## 1. Application shell

The page title is **Techies Playground**. The document description explains that premium plugins and themes are tested privately in the browser on the official WordPress Playground stack.

The minimum supported layout width is 320 px. The page uses a warm off-white background (`#f7f8f6`), white surfaces, neutral text, teal as the primary/action color, amber for trusted-external-input warnings, and red for destructive/error states. Typography uses Inter when available, a system sans-serif fallback, and a compact monospace face for labels and IDs.

Desktop layout is a maximum-width centered two-column grid: setup form at roughly 65% and sticky launch summary at roughly 35%. Mobile and tablet collapse to one column. Controls have visible keyboard focus, touch targets are expanded, and reduced-motion preferences disable nonessential animation.

## 2. Header

The header contains:

- Techies Playground identity linking to `/`.
- “Browser-local vault” security cue on non-small screens.
- A changelog button with an unread teal dot when the newest version has not been viewed in this browser.
- An Import recipe button backed by a hidden JSON file input.

The changelog opens as a keyboard-accessible popover/dialog. The list shows version, title, summary, and date. Selecting a version opens its complete change list. Escape first returns from detail to the list, then closes the popover. Clicking outside closes it. Opening the changelog stores the newest seen version.

## 3. Intro and setup sequence

The hero eyebrow is **PRIVATE, IN-BROWSER PLAYGROUND**. The heading is **Test premium WordPress tools with ease**. Supporting copy explains that premium packages and licenses remain under the user's control.

The setup form has three numbered sections.

### 3.1 Environment

Primary controls:

- WordPress version: runtime stable releases plus `beta` and `nightly` development channels.
- PHP: 8.5, 8.4, 8.3, 8.2, 8.1, 8.0, or 7.4.
- “Save playground in browser”: maps to `browser` storage when checked and `temporary` when unchecked.

The version selector initially uses the source-controlled fallback from 6.3 upward. Page load refreshes it from the WordPress.org core version API. `latest` displays the exact resolved release when available. An exact version from an older saved recipe remains selectable even if the live API omits it.

Advanced settings are collapsed by default and contain:

- Site setup: language, post-launch destination, site title, tagline, and permalink format.
- Runtime features: outbound networking, Multisite, PHP Intl, WP-CLI, WordPress debug mode, debug log, and unminified development scripts.
- External setup: HTTPS WXR import and PHP-Wasm extension-manifest URLs. Localhost HTTP is allowed for development. These controls visibly warn that downloaded content executes inside Playground.

One-time options such as Multisite and WXR import run only for a newly created browser-saved environment, not every resume.

### 3.2 Choose a setup

Four tabs share one recipe:

1. Saved recipes.
2. Choose plugins.
3. Choose themes.
4. Past spin-ups.

If saved recipes exist, that tab is initially active; otherwise plugins is active.

#### Saved recipes

Each row shows name, plugin/theme count, WordPress/PHP versions, and missing local ZIP count. Selecting loads the recipe. Edit loads it and changes the save action to Update recipe. Updating a renamed record removes the old ID so no stale duplicate remains. Removal deletes only the recipe record, not packages or persisted WordPress data.

#### Plugins

The user can upload multiple ZIPs. A valid upload must have a `.zip` filename and a ZIP file signature. Version suffixes are removed from the stable vault ID so a newer ZIP can replace an older file without breaking recipes. The UI shows label, optional version hint, size, browser-local note, and stable ID.

Uploaded plugins can be selected independently, replaced in place, or deleted. Deleting also removes that ID from the current recipe and its recency preference.

The same search field filters uploaded plugins immediately and queries WordPress.org after 350 ms when the trimmed query contains at least two characters. Uploaded results appear first. Directory results show sanitized name, slug, version, author, active installs, tested WordPress version, and official icon when present.

With an empty search, fetch and show eight featured WordPress.org plugins as selectable cards. Failures produce a non-blocking unavailable message. Selected directory slugs remain visible even when they are absent from the latest result set.

Multiple WordPress.org plugins may be selected. They never replace similarly named local packages.

#### Themes

Theme behavior mirrors plugin upload, replacement, deletion, recency, and search, except exactly one theme may be active. The choices are:

- WordPress default theme.
- One local theme ZIP.
- One WordPress.org theme slug.

Choosing a local theme clears the directory theme, and choosing a directory theme clears the local theme. Directory results show official screenshot, name, slug, version, rating, and author.

#### Past spin-ups

Every successful launch records safe metadata: launch date, normalized recipe, plugin labels/versions, and optional theme label/version. It never records ZIP data, site contents, or licenses.

History is newest first and capped at 30. Temporary launches may repeat. Only the newest record for the same browser-saved site identity is kept. A row distinguishes resumable saved environments from setup-only history. Selecting restores configuration; deleting removes only history.

### 3.3 Name and save

The recipe name is required, trimmed, and capped at 80 characters. Actions:

- Launch WordPress or the selected package summary.
- Save recipe or update the record being edited.
- Export pretty-printed `.recipe.json`.

Import validates JSON, loads it, and saves it to the library. Missing local package IDs are allowed in stored recipes but block launch with an actionable message.

## 4. Launch summary

The desktop summary is sticky and shows recipe name, WordPress/PHP, package counts, storage mode, and networking state. It repeats the launch action and three product assurances: browser-local execution, secret-free recipes, and the official Playground runtime.

During launch it shows three ordered stages:

1. Preparing WordPress.
2. Installing selected packages.
3. Ready for license activation.

Errors appear in a red alert surface and do not erase the current setup.

## 5. Runtime launch contract

Launch must perform this sequence:

1. Refuse to proceed if a referenced local ZIP is absent.
2. Validate and normalize the complete recipe.
3. Show the full-screen Playground shell and start progress reporting.
4. If WordPress is `latest`, fetch the WordPress.org version list again. Abort if the exact stable version cannot be confirmed.
5. Resolve the runtime site identity from name, exact WordPress version, and PHP version.
6. Request persistent browser storage when storage is `browser`; failure to grant persistence is non-fatal.
7. Start `startPlaygroundWeb` against `https://playground.wordpress.net/remote.html` with a generated Blueprint.
8. For an existing OPFS site, mount before startup, set `shouldInstallWordPress: false`, and omit one-time setup. For a new saved site, start WordPress, mount OPFS from memory to disk, then remember the site identity.
9. Wait for readiness, execute PHP to read `$wp_version`, and require a usable version marker. For `latest`, require exact equality with the API result.
10. Blueprint steps install and activate WordPress.org packages. Install each local plugin ZIP with overwrite and activation enabled.
11. Install a selected local theme ZIP with overwrite and activation, then execute PHP and verify `get_option('stylesheet')` equals the local theme ID.
12. Navigate to the recipe landing page.
13. Record the successful spin-up. A `latest` recipe is recorded with the exact launched WordPress version for reproducibility.

Any exception invalidates the active client, blanks the iframe, closes the full-screen shell, and surfaces a readable error.

## 6. Playground shell

The runtime occupies the full viewport. Its dark WordPress-like top bar contains the recipe name and:

- Licenses.
- Export snapshot.
- Update all.
- Close.

Snapshot and update actions remain disabled until package setup completes.

Closing a running temporary environment first asks **Discard this temporary site?** with Keep open and Discard and close actions. A running temporary environment also installs a browser `beforeunload` warning. Browser-saved environments close immediately.

Export snapshot downloads `<normalized-recipe-name>-wp-content.zip` using Playground's `zipWpContent` helper.

Update all executes WordPress PHP that refreshes plugin and theme update transients, invokes core upgraders for every available update, reports updated and failed package names, cleans caches, and returns to `/wp-admin/plugins.php`. Vendor updates work only when the plugin supplies an updater and any required license is active inside WordPress.

## 7. Encrypted license manager

The license manager is a small anchored dialog from the Playground header, with a dark header and animated enter/exit unless reduced motion is requested.

States:

1. Detecting whether the vault exists.
2. Creating a vault with a confirmed master password of at least 12 characters.
3. Unlocking an existing vault.
4. Listing unlocked license metadata.
5. Adding a license for an uploaded plugin or theme.

The derived non-exportable AES key exists only in a React ref. Plaintext appears only in the controlled add field or briefly during an explicit copy. Locking/closing clears the key reference, plaintext state, copy status, and timers. Delete uses inline confirmation. Reset uses a destructive browser confirmation and deletes the complete license database; it has no recovery.

The manager does not inject a license into WordPress. The user copies it and activates the package inside WordPress.

## 8. Accessibility and interaction requirements

- Every form control has a programmatic label.
- Icon-only buttons have accessible names.
- Tabs expose `role=tab` and `aria-selected`.
- Toggle cards expose `aria-pressed`.
- Status and error changes use appropriate live regions or alerts.
- Keyboard focus is restored to the launch button after Playground closes and to the changelog button when its dialog closes normally.
- Escape and outside-pointer behavior are preserved for popovers.
- Official artwork is decorative, lazy-loaded, and uses `referrerPolicy=no-referrer`.

## 9. Rebuild acceptance checklist

A rebuild is not equivalent until it passes the automated contracts and manually demonstrates:

- Local ZIP upload, stable ID generation, selection, replacement, deletion, and persistence after refresh.
- Simultaneous uploaded and WordPress.org plugin search, plus empty-query featured plugins.
- Single-theme exclusivity across local and directory sources.
- Recipe draft, save, rename-update, import, export, and missing-package behavior.
- New and resumed OPFS environments with correct one-time setup behavior.
- Exact `latest` WordPress verification and pinned-version relaunch.
- Successful local plugin/theme activation and local theme verification.
- History retention/deduplication and snapshot export.
- Temporary close/unload warnings.
- License vault create, lock, unlock, copy, delete, reset, and incorrect-password handling without secret leakage.
- Responsive and keyboard-accessible UI at 320 px, tablet, and desktop widths.
