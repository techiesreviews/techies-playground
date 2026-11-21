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
- A site-styled GitHub Star link immediately before the changelog control. It targets `techiesreviews/techies-playground`, matches the app's white rounded surfaces and teal focus treatment, and shows the public star count when GitHub's API is available.
- A changelog button with an unread teal dot when the newest version has not been viewed in this browser.
- An Import recipe button backed by a hidden JSON file input.

The changelog opens as a keyboard-accessible popover/dialog. The list shows version, title, summary, and date. Selecting a version opens its complete change list. Escape first returns from detail to the list, then closes the popover. Clicking outside closes it. Opening the changelog stores the newest seen version.

## 3. Intro and setup sequence

The hero eyebrow is **PRIVATE, IN-BROWSER PLAYGROUND**. The heading is **Test premium WordPress tools with ease**. Supporting copy explains that premium packages and licenses remain under the user's control.

The setup form has four numbered sections: Environment, Choose a setup, Checks, Name and save.

### 3.1 Environment

Primary controls:

- WordPress version: runtime stable releases plus `beta` and `nightly` development channels.
- PHP: 8.5, 8.4, 8.3, 8.2, 8.1, 8.0, or 7.4.
- “Save playground in browser”: maps to `browser` storage when checked and `temporary` when unchecked.

The version selector initially uses the source-controlled fallback with WordPress 7.1.3 and release branches from 6.3 through 7.1. Page load refreshes it from the WordPress.org core version API. The fallback leaves `latest` unresolved; `latest` displays the exact resolved release when the API is available and is resolved again at launch. An exact version from an older saved recipe remains selectable even if the live API omits it.

Advanced settings are collapsed by default, but open when either external setup URL is present (including imported, saved, history and restored recipes). They contain:

- Site setup: language, post-launch destination, site title, tagline, and permalink format.
- Runtime features: outbound networking, Multisite, PHP Intl, WP-CLI, WordPress debug mode, debug log, and unminified development scripts.
- External setup: HTTPS WXR import and PHP-Wasm extension-manifest URLs. Localhost HTTP is allowed for development. These controls visibly warn that downloaded content executes inside Playground. Import and launch both require confirmation listing the external sources. Canceling leaves the import unapplied or the runtime unstarted.

One-time options such as Multisite and WXR import run only for a newly created browser-saved environment, not every resume.

### 3.2 Choose a setup

Four tabs share one recipe:

1. Saved recipes.
2. Choose plugins.
3. Choose themes.
4. Past spin-ups.

If saved recipes exist, that tab is initially active; otherwise plugins is active.

#### Saved recipes

Each row shows name, plugin/theme count, WordPress/PHP versions, missing local ZIP count and, when the recipe has uploaded plugins, **keys ready** or **N keys missing** (uploaded plugins without a saved license). A teal **Start** button at the end of the row (below the text when the row is too narrow) loads the recipe and launches it at once with its WordPress/PHP versions and plugins; it is disabled while a launch runs or a local ZIP is missing. Selecting loads the recipe. Edit loads it and changes the save action to Update recipe. Updating a renamed record removes the old ID so no stale duplicate remains. Removal deletes only the recipe record, not packages or persisted WordPress data.

#### Plugins

The user can upload multiple ZIPs. Dragging files over the launcher shows a full-page `upload-box`; dropping anywhere on the launcher accepts mixed plugin/theme ZIP batches with no application file-count cap. WordPress Plugin Name / Theme Name headers identify the destination automatically. Each valid package is saved in its browser-local vault; all imported plugins are selected, and the last successful theme is selected with any directory theme cleared. All other uploaded themes remain available. Batches are queued and processed sequentially; invalid packages report individual errors without stopping later files. A dismissible status shows progress and totals. Existing file pickers and replacement controls remain available. A valid upload must have a `.zip` filename and a ZIP file signature. Version suffixes are removed from the stable vault ID so a newer ZIP can replace an older file without breaking recipes. The stable ID remains an internal recipe/vault reference rather than visible card metadata. The UI shows the label on the first line, then the optional version hint, size, and browser-local note on a second line without a leading dash.

Uploaded plugins can be selected independently, replaced in place, or deleted. Each uploaded plugin card shows an **Add key** button when the license vault holds no key for `plugin:<id>`. When it holds one, a key icon (accessible name and tooltip "License key saved for <label>") sits first in the card's icon group with Replace and Delete, as a 28 px box with the same 4 px gap; with a mouse or trackpad that group shows on hover or while anything in the card has focus, and on any device with a touchscreen (`any-pointer: coarse`, touchscreen laptops included) it is always shown. Replace and Delete are 28 px boxes with a mouse; on any device with a touchscreen their own boxes grow to 44 px (no tap overlay reaching past the box), with the 4 px gap kept, so a touch or a click on one never lands on the other; on a phone-width card the group then wraps onto its own line under the artwork. Add key is 28 px tall with a mouse and at least 44 px tall on any device with a touchscreen, its own box with no tap overlay, so its tap area ends at its edge. Add key opens fields inside the card (no nested form; Enter saves): the master password when the vault session is locked (new password and confirmation when no vault exists yet) and the license key, with Save key and Cancel. Saving unlocks or creates the vault for the session and encrypts the key under the plugin's label. Escape cancels. A session key that no longer opens the vault (reset and recreated in another tab) cannot save: the session locks and the password field returns. Deleting also removes that ID from the current recipe and its recency preference.

The same search field filters uploaded plugins immediately and queries WordPress.org after 350 ms when the trimmed query contains at least two characters. Uploaded results appear first. Directory results show sanitized name, slug, version, author, active installs, tested WordPress version, and official icon when present.

With an empty search, fetch and show eight featured WordPress.org plugins as selectable cards before the uploaded-plugin section. Uploaded plugins and WordPress.org search results use the same card surface, selected teal background/ring, and round teal check-circle as the featured cards, while uploaded-package replacement and deletion remain separate actions. Once the user enters a query, uploaded matches return to the first position and the featured grid is replaced by the directory search state or results. Failures produce a non-blocking unavailable message. Selected directory plugins remain visible and removable when search is cleared or changed, including while a new search loads. At empty search, selected featured plugins remain on their existing cards; other selected directory plugins appear in a selected section. Safe directory metadata is cached in memory during the session so selected names survive query changes; a refreshed or imported slug may appear as its slug until metadata is available. Plugin and theme tabs explicitly count selected packages, including WordPress.org selections.

Multiple WordPress.org plugins may be selected. They never replace similarly named local packages.

#### Themes

Theme behavior mirrors plugin upload, replacement, deletion, recency, and search, except exactly one theme may be active. The choices are:

- WordPress default theme.
- One local theme ZIP.
- One WordPress.org theme slug.

An uploaded theme row's Replace and Delete follow the uploaded plugin card: 28 px boxes 4 px apart that show on hover or focus with a mouse or trackpad; on any device with a touchscreen (`any-pointer: coarse`, touchscreen laptops included) they are always shown and their own boxes grow to 44 px with no tap overlay, and on a phone-width row they wrap onto their own line under the artwork.

Choosing a local theme clears the directory theme, and choosing a directory theme clears the local theme. Directory results show official screenshot, name, slug, version, rating, and author.

#### Past spin-ups

Every successful launch records safe metadata: launch date, normalized recipe, plugin labels/versions, and optional theme label/version. It never records ZIP data, site contents, or licenses.

History is newest first and capped at 30. Temporary launches may repeat. Only the newest record for the same browser-saved site identity is kept. A row distinguishes resumable saved environments from setup-only history. Selecting restores configuration; deleting removes only history.

### 3.3 Checks

Lists Query Monitor and Code Profiler (`src/lib/checks.js`). A check is in the setup when its plugin is in the recipe: the WordPress.org slug (`query-monitor`, `code-profiler`) or an uploaded ZIP whose ID is `query-monitor`, `code-profiler` or `code-profiler-pro`. In-setup cards use the selected teal surface and a **Runs after start** pill; others show **Not in this setup** and an **Add <check>** button that adds the free WordPress.org plugin. Results appear in the launcher's own Checks panel (section 6), and each check opens its plugin's page inside WordPress for the full detail.

### 3.4 Name and save

The recipe name is required, trimmed, and capped at 80 characters. Actions:

- Launch WordPress or the selected package summary.
- Save recipe or update the record being edited.
- Export pretty-printed `.recipe.json`.

Import validates JSON, loads it, and saves it to the library. Missing local package IDs are allowed in stored recipes but block launch with an actionable message.

## 4. Launch summary

The desktop summary is sticky and shows recipe name, WordPress/PHP, package counts and selected plugin names, **Licenses** (`N of M keys saved`, only when uploaded plugins are selected), **Checks** (names joined with +, or None), storage mode, and networking state. Local plugin names come from the vault; directory names come from session metadata, with IDs or public slugs as fallbacks. Long names wrap within the summary. It repeats the launch action and three product assurances: browser-local execution, secret-free recipes, and the official Playground runtime.

During launch it shows four ordered stages:

1. Preparing WordPress.
2. Installing selected packages.
3. Activating licenses.
4. Updating plugins (skipped at once when the setup blocks networking).

Errors appear in a red alert surface and do not erase the current setup.

## 5. Runtime launch contract

Launch must perform this sequence:

1. Refuse to proceed if a referenced local ZIP is absent.
2. Validate and normalize the complete recipe.
3. Show the full-screen Playground shell and start progress reporting. When an uploaded plugin of the recipe has a saved key and the vault session is locked, show **Unlock your license vault** over the frame (master password, **Unlock and start**, **Start without keys**) and wait; an unlock in the Licenses manager also continues the launch, Start without keys launches without the fill, and Escape inside the prompt or closing the shell abandons the launch. The prompt is not modal, so Close in the bar and the Licenses manager stay reachable (Escape in the manager closes only the manager).
4. If WordPress is `latest`, fetch the WordPress.org version list again. Abort if the exact stable version cannot be confirmed.
5. Resolve the runtime site identity from name, exact WordPress version, and PHP version.
6. Request persistent browser storage when storage is `browser` without waiting for the answer (Firefox keeps the request pending until the visitor answers its prompt); failure to grant persistence is non-fatal.
7. Import the Playground client from `<Playground host>/client/index.js` and start `startPlaygroundWeb` against `<Playground host>/remote.html` with a generated Blueprint. The Playground host is `https://wp.techies.tools` (`src/lib/playground-host.js`; preview builds set `VITE_PLAYGROUND_ORIGIN`). Loading the client, booting and starting WordPress (until `onClientConnected`) must finish within two minutes, otherwise launch fails with a readable timeout; the Blueprint steps that follow have no deadline.
8. For an existing OPFS site, mount before startup, set `shouldInstallWordPress: false`, and omit one-time setup. For a new saved site, start WordPress, mount OPFS from memory to disk, then remember the site identity.
9. Wait for readiness, execute PHP to read `$wp_version`, and require a usable version marker. For `latest`, require exact equality with the API result.
10. A Blueprint step writes the Freemius must-use plugin (`src/lib/freemius-plugin.js`) before any package installs, on every launch. Blueprint steps install and activate WordPress.org packages. Install each local plugin ZIP with overwrite and activation enabled.
11. Install a selected local theme ZIP with overwrite and activation, then execute PHP and verify `get_option('stylesheet')` equals the local theme ID.
11a. When checks are in the setup, write the checks must-use plugin and the measure must-use plugin (`MEASURE_PLUGIN`). When uploaded plugins have saved keys, decrypt the newest key per plugin and run `LICENSE_FILL_CODE` once with the keys as the POST body, keyed by installed plugin folder; each Freemius-based plugin activates its key through its own SDK (`activate_migrated_license`), an already active licence is left alone, other plugins report that the key must be entered in WordPress. A failed fill never fails the launch. When checks are in the setup, then run `FREEMIUS_LICENSES_CODE` once: it lists the folders of Freemius plugins whose premium build cannot use its premium code yet (`is_premium()` and not `can_use_premium_code()`; free builds that ship the SDK never count), and the folders of Freemius plugins whose licence is already active (`can_use_premium_code()`). An expired licence that still unlocks the premium features counts as active, so the checks start (Lex, 2026-11-21). A failed probe means unknown: every launched uploaded plugin then counts as needing a licence.
11b. When networking is allowed, run `PLUGIN_UPDATES_CODE` (`src/lib/plugin-updates.js`) after the licence fill, so premium plugins can reach their own update servers. It refreshes the plugin and theme update data, updates every plugin and theme WordPress offers an update for with the core upgraders, switches an updated plugin back on when it was on before (the upgrader turns it off; on Multisite a plugin that was on for the whole network goes back on for the whole network), skips a plugin or theme offer whose `requires_php` or `requires` this site does not meet (named as a failure, `Needs PHP <version> or newer.` or `Needs WordPress <version> or newer.`), and returns each change as old → new version, each failure with WordPress's message (a plugin WordPress will not switch back on after its update counts as a failure), and the active plugins and theme that were already current. The plugin check and the theme check each count only when WordPress.org answered them (HTTP 200, over https or the http retry, seen through `http_api_debug`); a check that got no answer is a failure named `Plugin update check` or `Theme update check` with the error or HTTP status, and its plugins or theme are not listed as already current, because WordPress keeps no update list when the check fails. Offers from a plugin's own update server are still installed. A failed update never fails the launch. When networking is blocked the step is skipped.
12. Navigate to the recipe landing page.
13. Record the successful spin-up. A `latest` recipe is recorded with the exact launched WordPress version for reproducibility.
14. When checks are in the setup and every licence the setup needs is active (`checksGate` over `licensesNeeded`: each launched uploaded plugin that had a saved key when the launch started reports `active` or `activated` or is in the probe's `licensed` list, and no uploaded plugin is in its `unlicensed` list; Start without keys counts the saved-key plugins as not active unless the site already reports their licence as active; a failed probe holds every uploaded plugin), run the checks once on the landing page.

Any exception invalidates the active client, blanks the iframe and replaces it with a new element, closes the full-screen shell, and surfaces a readable error. A launch closed or replaced while the Playground client loads never starts Playground.

## 6. Playground shell

The runtime occupies the full viewport. Its dark WordPress-like top bar contains the recipe name and:

- Licenses, followed after a fill by `· N of M active` (also announced politely to screen readers). Up to 767 px wide the Licenses, Checks, Export snapshot and Updates buttons show only their icons (their names stay for screen readers) and the fill shows as `N/M`, so Close stays on screen on a phone and on a narrow window, even with a long update result. From 768 to 1040 px every name shows, while the notes after Updates and Checks stay short (see below), so a full bar still keeps Close on screen. Below 384 px (the `xs` breakpoint, 24rem) the bar's gap shrinks from 10 to 4 px (the close confirmation keeps 10 px between Keep open and Discard and close); buttons with a count get 6 px side padding and a 4 px inner gap, and every bar button is at least 40 px wide (Close 40 px), with each phone tap area the button plus that 4 px gap (at least 44 × 56 px, neighbours meeting without overlap), so on a full bar from 320 px Close is fully on screen and tappable (at normal text size; like every breakpoint here it is in rem, so larger text tightens the bar sooner).
- Checks (`src/ChecksPanel.jsx`), only when a check is in the launched setup; disabled until setup finishes. It shows a spinner and `running…` while the checks run, `could not run` after an error, `activate licenses first` while the licence gate is closed and no run has finished (with an amber warning icon at every width; the words are screen-reader only at 1040 px and below, like the other notes), and after a run the verdict's short form in its colour (teal `N passed`, amber `N warnings`, red `N failed`; only the icon and number up to 767 px). It toggles the Checks panel (`aria-expanded`, `aria-controls`).
- Export snapshot.
- Updates (`src/UpdatesControl.jsx`): `Updating…` with a spinner while step 11b runs (this spinner, shared with Checks, stands still when reduced motion is requested); then `Updated: <first change> +N` (the count alone up to 1040 px wide; a first name longer than 12rem is cut with an ellipsis while its versions and `+N` stay; from 1041 px, unlike the other bar buttons, Updates may shrink, so on a full bar its name is cut further before Close is pushed off, and only very long versions are clipped as a last resort; when something also failed, an amber warning icon and `N failed` follow, the icon alone up to 1040 px), `Update failed: <first name> +N` (the same shortening; an amber warning icon right after `Update failed` up to 1040 px, where those words are screen-reader only, and the tooltip `Updates failed at start`), `Up to date`, `Updates · networking blocked` or `Updates · failed` (with an amber warning icon right after `Updates` at every width and the tooltip `Updates · networking blocked` or `Updates failed at start`; the words after Updates are screen-reader only at 1040 px and below, like the other notes). Disabled until there is something to show. It opens an anchored note (`role=dialog`, named by its heading: **Updated at start**, **Updates failed at start** when the step ran and every update failed, or **Updates at start** when networking is blocked or the update step failed, and the time): every change as old → new version, each failure with its message, or `No plugin or theme had an update.`, then `Already current:` with names and versions. The note is never taller than the window minus 4rem and scrolls inside when the list is longer; it takes focus when it opens (with a visible focus ring for keyboard users), so the arrow keys scroll a long list. Escape (focus back to Updates), a click outside, or a click inside WordPress (the window loses focus) closes it; below `sm` it is anchored to the viewport.
- Close.

A polite live region on the bar announces the updates (`updatesAnnouncement`) and the checks (`checksAnnouncement`) as they start and finish. The snapshot action remains disabled until package setup completes.

The **Checks panel** is a complementary region over the right edge of the WordPress frame (`min(25rem, 100%)` wide, full width on a phone), focused when it opens. Its header shows **Checks**, the measured page's title and time, **Run checks** / **Run again** / **Running…** (`aria-disabled` while running) and a close button. A verdict box follows (screen readers hear the result once, from the bar's live region): `All N checks passed` / `N checks need a look` / `N checks failed` with `passed · warnings · failed · took 0.42 s`, an error with its message, or, before any run, **Activate licenses first** with `N of M active. Activate them in WordPress, then run the checks.` while the gate is closed (the gate is not re-read after launch, so a licence activated later inside WordPress does not start the checks), else **Not run yet**. Four tiles show page time, memory, database queries and PHP errors (`–` until a run finishes; two columns while the panel is narrower than 25rem and one column below 15rem, container queries, so larger text also switches before a number leaves its tile), coloured by Query Monitor's limits only when Query Monitor is in the setup. Failed and Warnings groups list their checks first; passed checks fold into a **Passed N** line. Each check is a row (status icon, name, value, chevron) that opens to its details, PHP error lines (`Warning: message`, `file, line N`) and **Open in Query Monitor** / **Open in Code Profiler**. Open in reloads the frame at `checkResultsPath`: Query Monitor's current page with `techies-check=query-monitor`, where the checks must-use plugin clicks Query Monitor's admin-bar link to open its panel unless Query Monitor already remembers an open panel (its link is a toggle); Code Profiler's `admin.php?page=code-profiler` (`code-profiler-pro` when only the Pro ZIP is in the setup) with `techies-check=code-profiler`, where the must-use plugin clears Query Monitor's remembered panel so it does not cover the profiler. On any device with a touchscreen (`any-pointer: coarse`, touchscreen laptops included) Run checks and Open in are at least 44 px tall, their own boxes with no tap overlay. Below 640 px the panel closes first so the page is visible. Escape closes the Updates note first, then the panel (focus back to Checks); it does nothing while the Licenses manager is open.

A run loads the frame's current page once more with `techies-measure=1` through the Playground client (it shares the frame's login). When that page's address carries a nonce (any query key ending in `nonce`, such as `update.php?action=upgrade-plugin&_wpnonce=…`), loading it again would repeat the action it ran, so the run measures `/wp-admin/` instead; Open in Query Monitor opens `/wp-admin/` for the same reason. The measure must-use plugin counts that request's queries, slow queries and duplicates, PHP errors (respecting `@`), calls to other sites (every call and every failure counted; host and status only), memory against the limit, page time and each plugin's load time, and appends them as one base64 JSON comment. It never returns SQL, full call addresses or more than 200 characters of an error message, cuts the query from any web address inside an error message (it can hold a licence key), and sends the page title as plain text (WordPress's front-end title comes escaped). `evaluateChecks` turns the numbers into checks against `CHECK_LIMITS`:

| Check | Tool | Warn | Fail |
| --- | --- | --- | --- |
| PHP errors | Query Monitor | any notice or deprecation | any error or warning |
| Slow queries | Query Monitor | any query over 0.05 s | – |
| Calls to other sites | Query Monitor | any call that failed or answered 400+ | – |
| Duplicate queries | Query Monitor | more than 10 | – |
| Database queries | Query Monitor | more than 100 | – |
| Memory | Query Monitor | over 75% of the limit | over 90% |
| Page time | Query Monitor | over 1 s | over 3 s |
| Slowest plugin | Code Profiler | one plugin loading in over 0.5 s | – |

A run that finishes after the site closed or relaunched is dropped.

Internal Ctrl/Cmd-click, middle-click, Shift-click, `_blank` links and direct script-opened scoped URLs open a separate preview tab on the launcher origin. This tab embeds the existing running site and preserves the full path, query and fragment, including preview parameters. It displays a compact reminder to keep the original Playground tab open (4 px vertical padding, 29 px tall when the text fits on one line). Closing the original session replaces the preview with an unavailable message; preview links do not recreate a site or transfer a site to another browser. Native context-menu links and scripts that navigate an initially empty popup remain limitations.

Closing a running temporary environment first asks **Discard this temporary site?** with Keep open and Discard and close actions. A running temporary environment also installs a browser `beforeunload` warning. Browser-saved environments close immediately.

Export snapshot downloads `<normalized-recipe-name>-wp-content.zip` using Playground's `zipWpContent` helper.

Updates at start (step 11b) reach a premium plugin only when it supplies its own updater and its licence is active inside WordPress.

## 7. Encrypted license manager

The license manager is a small anchored dialog from the Playground header, with a dark header and animated enter/exit unless reduced motion is requested.

States:

1. Detecting whether the vault exists.
2. Creating a vault with a confirmed master password of at least 12 characters.
3. Unlocking an existing vault.
4. Listing unlocked license metadata.
5. Adding a license for an uploaded plugin or theme.

The derived non-exportable AES key lives in memory in the vault session (`src/lib/vault-session.js`) for the page session, so one unlock serves the manager, Add key and every launch's automatic fill. Plaintext appears only in the controlled add fields, briefly during an explicit copy, and in the PHP request body of an automatic fill. Lock clears the session key; closing the manager clears plaintext state, copy status and timers but keeps the session unlocked; reloading or closing the tab drops it. With a running site, the record whose key the launch used (its id travels with the result; a fill that failed before any key was read shows on the plugin's newest record) shows that launch's fill result (filled in and active, already active, Freemius's refusal message, or not filled in). Delete uses inline confirmation. Reset uses a destructive browser confirmation and deletes the complete license database; it has no recovery.

Lock, close, unmount and reset invalidate the active vault session. An unlock or vault creation started from the launch prompt or Add key that finishes after its prompt closed is not used to unlock the session (`unlockVaultSessionIfCurrent`), and neither is one that finishes after a Lock or Reset; a vault created that way stays saved. A Lock while a launch reads saved keys stops the fill before any key reaches WordPress (`The license vault was locked.`). Pending clipboard reads/decryption cannot submit a write afterward, and late unlock/create results cannot restore the key or metadata. Already-submitted OS clipboard writes cannot be recalled.

The manager itself does not inject a license. Launches fill saved keys into Freemius-based plugins (see the launch contract); for other vendors the user copies the key and activates the package inside WordPress.

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
- One-click Start of a saved recipe, Add key from Choose plugins, one unlock per session, automatic fill into a Freemius plugin, plugins updated at start with the old → new note, checks that run by themselves only when the licences are active, and the Checks panel opening Query Monitor and Code Profiler results.
- Responsive and keyboard-accessible UI at 320 px, tablet, and desktop widths.

## Recipe URL security (0.7.1)

Recipe URLs reject userinfo and recognized credential/signature query or fragment parameter names, including encoded/case-varied aliases. Public HTTPS URLs, benign query parameters and loopback HTTP remain supported. Landing paths reject external authorities, backslashes and control characters. Invalid form input remains in memory; draft autosave removes the stored draft until validation succeeds. Previously stored invalid draft/library/history recipes are discarded on load. Arbitrary credentials embedded in otherwise ordinary text or URL paths cannot be recognized reliably; users must supply public, credential-free sources.
