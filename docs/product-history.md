# Product history and dispositions

This history combines Git commits and the user-facing `CHANGELOG_ENTRIES`. It records only evidence visible in the repository. No separate experiment log existed before this documentation set, so undocumented failures or removed prototypes cannot be reconstructed reliably.

## Timeline

| Date | Evidence | Change | Current disposition |
| --- | --- | --- | --- |
| 2026-08-12 | `60ae82b`, changelog 0.1.0 | Initial browser-local launcher: premium package vaults, encrypted licenses, safe recipes, history, Blueprint launch, snapshot/update controls. | Kept and evolved. |
| 2026-08-12 | `d4d2918` | Renamed product to Techies Playground, added dynamic WordPress version lookup/fallback, Cloudflare Worker delivery and GitHub deployment automation. | Kept. Static version options inside `recipe.js` were superseded by `wordpress-versions.js`. |
| 2026-08-12 | `b7420b9` | Added combined local/WordPress.org plugin and theme discovery using official APIs and Blueprint resources. | Kept. |
| 2026-08-17 | `83395a7`, changelog 0.2.0 | Added OPFS site resume, snapshot controls, temporary-site warnings, and saved-environment history deduplication. | Kept. Default storage changed from temporary to browser; a one-time migration preserves intent for existing drafts. |
| 2026-08-25 | changelog 0.3.0 | Added WordPress 7.1 recognition and two-part release handling. | Kept. |
| 2026-08-25 | `9f51658`, changelog 0.4.0 | Added in-app versioned changelog and reorganized/refined environment and saved-recipe UI. | Kept. Earlier hero copy and layout details were replaced. |
| 2026-08-27/28 | `dc6efb9`, changelog 0.5.0 | Added daily WordPress release-sync PR automation, featured WordPress.org plugins, HTML-entity decoding for plugin names, and the durable documentation/change-record system. | Kept and deployed through the GitHub pipeline. |
| 2026-08-28 | changelog 0.6.0, release commit on `main` | Added a site-styled GitHub Star control, moved featured plugins ahead of uploads in the empty state, unified plugin selection cards/check-circles, and simplified uploaded-plugin metadata. | Kept for publication through the GitHub pipeline. |

## Superseded behavior

These are observable replacements, not necessarily failed experiments:

- **Product name/copy:** “Private Playground Launcher” / “Private Playground” and the original “Build a clean testing site in one click” hero were replaced by the Techies Playground identity and premium-tool testing message.
- **WordPress choices:** a static array in `recipe.js` was replaced with runtime WordPress.org discovery plus an offline fallback module.
- **Default persistence:** new recipes originally used temporary storage. Browser storage became the safer default, with a one-time migration of an existing temporary draft.
- **History behavior:** browser-saved launches originally accumulated like temporary launches. They now keep only the newest row for a site identity.
- **Directory discovery:** WordPress.org results originally appeared only after search. The current working tree shows featured plugins when the search is empty.
- **GitHub star control:** the initial native repository link and the official GitHub Buttons embed were superseded by a site-styled native control that fetches only the public star count.

## Removed or failed work

No commit in the inspected history deletes a complete product feature or records a failed experiment. Existing commit messages do not state that a tested approach failed. The repository therefore cannot honestly name additional removed/failed work.

From now on, use [changes/README.md](changes/README.md) and preserve rejected/inconclusive records so this gap does not recur.

## Release history versus experiment history

The in-app changelog is user-facing and should stay concise. It answers “what changed for users?” Change records answer “what did we try, how did we test it, what happened, and why did we keep/remove it?” A deployed feature normally requires both.
