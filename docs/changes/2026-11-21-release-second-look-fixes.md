# Release second look: Close on a narrow bar, network plugins, touch targets, a focusable note

- Date: 2026-11-21
- Owner: fleet builder (Claude Opus 5.5)
- Status: complete
- Disposition: kept
- Related version: 0.11.0 (not yet released; fixes before the release)
- Related commit/issue: TOOLS-259; follows [Updates note: failures stay short and visible on the bar](2026-11-21-updates-note-failures-on-the-bar.md)

## Context

The GPT second look on the 0.11.0 release (`dev` to `main`, PR #53) found four problems:

- P1, the bar: from 641 to about 767 px wide the Licenses, Checks, Export snapshot and Updates buttons still showed their names. With networking blocked (`Updates · networking blocked`), a licence summary and the Checks button, the buttons together were wider than the window and Close was pushed past the right edge. The labels only went icon-only below the `sm` breakpoint (640 px).
- P1, the update code: after an update, a plugin that was on for the whole network of a Multisite test site was switched back on for the current site only (`activate_plugin( $file, '', false, true )`).
- P2, the Checks panel: Run checks only grew to 44 px when the main pointer was coarse (`pointer: coarse`), so on a touchscreen laptop it stayed small; Open in used a 48 px overlay that was hidden whenever the main pointer was fine, so it was small there too.
- P2, the Updates note: the note scrolls when its list is long, but nothing in it could take keyboard focus, so a keyboard user could not scroll it.

## Hypothesis and success criteria

- Up to 767 px the four bar buttons show only their icons (their names stay for screen readers) and the licence summary shows as `N/M`. Close stays inside the bar at 641, 700, 767, 768, 1041 and 1280 px for every update result, and the bar stays one line.
- A plugin that was on for the whole network goes back on for the whole network after its update; a plugin on for one site still goes back on for that site.
- On any device with a touchscreen (`any-pointer: coarse`) Run checks and Open in are at least 44 px tall, their own boxes with no overlay.
- The note takes focus when it opens and shows a focus ring for keyboard users; Escape still closes it and returns focus to Updates.

## Options considered

- **Leave unchanged.** Close can disappear on a narrow window, a network plugin ends up on for one site only, and keyboard and touchscreen-laptop users get worse controls.
- **Bar: hide only the Updates name up to 767 px.** Not enough: with Licenses and Checks labels still showing, a 641 px bar is still too full.
- **Touch targets: always 44 px.** Makes the panel header taller for mouse users with no gain; `any-pointer: coarse` matches what the uploaded plugin and theme controls already do.
- **Note: make only the list focusable.** The whole note is the scrolling box, so the note itself takes focus.

## Implementation or prototype

- `src/App.jsx`, `src/ChecksPanel.jsx`, `src/UpdatesControl.jsx`: the bar labels and the compact paddings use `max-md:` (below 768 px) instead of `max-sm:`, and the compact licence summary uses `md:hidden` (768 px and up), so both sides switch at the same width; the existing icon-only `N failed` rule moved from `max-[767px]:` to `max-md:` too, because Tailwind reads `max-[767px]:` as "narrower than 767 px" and left a 1 px band where neither rule applied. The 1040/1041 pair had the same band (the Updates note and its count both showing, the button unable to shrink, and the Checks waiting note showing at exactly 1040 px), so its hide side moved from `max-[1040px]:` to `max-[1041px]:`. Close keeps its own phone padding and the tap overlays keep their phone geometry.
- `src/lib/plugin-updates.js`: the update code remembers `is_plugin_active_for_network( $file )` before the update and passes it as the network flag to `activate_plugin()`.
- `src/ChecksPanel.jsx`: Run checks uses `any-pointer-coarse:min-h-11`; Open in drops its fine-pointer-hidden overlay and uses the same class.
- `src/UpdatesControl.jsx`: the note (`role=dialog`, named by its heading, so it says **Updates at start** when nothing was updated) has `tabIndex=0`, a teal focus ring and takes focus when it opens.

The bar's own tap overlays (`BarTapTarget`) are unchanged: they already reach 48 px on a phone, and making them show with a mouse on a crowded bar would make the overlays overlap.

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Node 24, before the fix | `node --test src/bar-compact-labels.test.js src/updates-control.test.js src/lib/plugin-updates-php.test.js` on the test commit | The four new tests fail | 4 failed, 7 passed | `bar-compact-labels.test.js` (2), `updates-control.test.js` (note focus), `plugin-updates-php.test.js` (network plugin) |
| Node 24, after the fix | Same command | All pass | 11 passed | Same files |
| Node 24 | `scripts/agents/kit unit --affected`, `scripts/agents/kit build` | Pass | `ok unit 19/19 (4 files)`, `ok build finished` | Kit RESULT lines |
| Headless Chrome, `dev` styles | The bar (real `UpdatesControl` and `ChecksButton`, a copy of the App bar) rendered with `dev`'s built CSS, networking blocked, at 641 and 700 px | Reproduces the finding | Close's right edge at 730 px on a 641 px and a 700 px bar | Render script measurements |
| Headless Chrome, this branch | Six update results (networking blocked, six failures, one update and two failures, a long name, date versions, up to date) at 641, 700, 767, 768, 1041 and 1280 px | Close inside the bar, one line | Close inside the bar in all 36 renders, every bar one line | Render script measurements and screenshots at 700 px |

The headless browser reports a fine pointer as absent, so the bar's 48 px tap overlays show there; at 641, 700 and 767 px the icon-only Updates button's overlay (networking blocked, up to date) is wider than the button. The overlay is invisible and its button keeps one line.

## Result

All four findings are fixed with the smallest change each. The render shows Close inside the bar from 641 px up in every case tried. Below 641 px the existing phone layout is unchanged; the 320 px case with a failed update stays as Lex chose on 2026-11-21.

## Disposition and rationale

Kept. Each change is small, covered by a test that failed before it, and matches patterns already in the app (`any-pointer: coarse` for touch targets, icon-only bar buttons with screen-reader names).

## Documentation impact

- [rebuild-spec.md](../rebuild-spec.md): the bar labels are icon-only up to 767 px, the note takes focus, network plugins go back on for the whole network, and the Checks panel's touch targets.
- [testing.md](../testing.md): the new `bar-compact-labels.test.js` row and the extended Updates note and update code rows.
- No changelog or version change: 0.11.0 is not yet released and its entry already says active plugins stay active.

## Follow-ups and open questions

- None.
