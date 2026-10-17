# Vivaldi comparison blocked before page startup

- Date: 2026-10-13
- Owner: Codex
- Status: complete
- Disposition: inconclusive
- Related version: local source 0.8.2; no release prepared
- Related commit/issue: Supplements the browser coverage limits in [the standalone Chromium comparison](2026-10-13-playground-standalone-chromium.md); earlier outcomes remain unchanged.

## Context

The user reports using the latest Vivaldi and selecting `No blocking` in its shield for `play.techies.tools`. The earlier successful standalone Firefox and Chrome comparisons did not reproduce the user's browser environment. This comparison attempts to test the current official Vivaldi build without attributing the failure to its blocker setting. The user subsequently reports local use on Ubuntu and Windows. Exact operating-system versions and installed Vivaldi builds, whether the same failure occurs on both systems, and VPN/extension status are not confirmed.

## Hypothesis and success criteria

Use the current official stable Vivaldi release in an isolated profile. Prioritize a temporary `latest` launch with no packages on the live launcher, then compare official Playground only if browser startup permits it. Require PHP-verified WordPress 7.1.3 readiness or exact failing core-download/service-worker response evidence. A browser startup failure before navigation cannot establish Playground incompatibility, a CORS defect, or the user's error cause.

## Options considered

- Download the current official Linux DEB and extract it without system installation: executed.
- Run its native executable directly to avoid further codec-update side effects: attempted, but no page became available.
- Use a persistent temporary profile instead of an incognito context: attempted; browser process exits with `SIGSEGV` before page startup.
- Reproduce the official wrapper's normal startup environment and `argv[0]` without its codec updater: one bounded final attempt; also exits before page startup.
- Disable the sandbox, disable web security, change blocker settings, or alter host dependencies: not used.
- Continue changing launcher code or testing browser variants after startup remains blocked: not implemented.

## Implementation or prototype

On 2026-10-13, the [official download page](https://vivaldi.com/download/) links Linux DEB 64-bit to [vivaldi-stable_8.2.4133.84-1_amd64.deb](https://downloads.vivaldi.com/stable/vivaldi-stable_8.2.4133.84-1_amd64.deb). Downloaded that exact asset into a unique directory created with `mktemp -d /tmp/techies-playground-vivaldi-XXXXXX`. Ran `dpkg-deb -x "$task_tmp/vivaldi.deb" "$task_tmp/extracted"` and installed only temporary `playwright@1.64.0` with `npm install --prefix "$task_tmp" --no-audit --no-fund playwright@1.64.0`. The host is Ubuntu 26.04.1 LTS. No system package installation was performed.

The official `vivaldi --version` wrapper unexpectedly runs its bundled media-codec updater before printing its version. It downloaded a codec under the real user's `.local/lib/vivaldi` and created a marker under `.config/vivaldi`. This side effect was detected immediately. Only the observed task-created codec directory, codec alias, and empty update marker were removed; their now-empty Vivaldi parent directories were removed. The wrapper was not run again.

Subsequent attempts use the extracted executable through Playwright with `headless: true` and `chromiumSandbox: true`, without custom browser arguments or security overrides. The first uses a new incognito context. The second uses a temporary persistent profile. After the persistent attempt exits, source inspection of the official wrapper identifies the omitted `CHROME_WRAPPER`, `HERE`, Vivaldi distribution variables, `CHROME_VERSION_EXTRA`, crash-dialog environment, and `exec -a` behavior. The extracted native executable's resource files are present beside it. This inspection does not establish the cause of its crash.

One final temporary helper copies those normal wrapper exports and `exec -a` while excluding codec/update logic. It uses the previous failed startup's temporary profile, which contains no loaded user page or Playground data; this final profile is therefore not asserted to be completely pristine. The final launch has a 30-second startup timeout. It still exits before any page becomes available. No further browser rounds were performed.

## Tests and evidence

| Environment | Procedure/command | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- |
| Official Vivaldi download page, 2026-10-13 | Inspect Linux DEB 64-bit link; download the linked asset | Obtain the current official stable Linux build | Linked asset is 8.2.4133.84-1; download and extraction complete | Official source links above; executed `curl --fail --location` and `dpkg-deb -x` |
| Extracted official Vivaldi | `"$task_tmp/extracted/opt/vivaldi/vivaldi" --version`; subsequently `vivaldi-bin --version` | Verify the actual downloaded version | Wrapper prints `Vivaldi 8.2.4133.84 stable`; native executable prints `Vivaldi 8.2.4133.84` | Executed version commands; Chromium user agent/protocol version not obtained |
| Temporary Playwright 1.64.0, new incognito context | Launch extracted native executable with sandbox enabled; create context and page | Navigate to live launcher | Page creation does not complete; Node exits 13 with `Detected unsettled top-level await` at `context.newPage()` | Executed startup attempt; no page navigation or Playground fetch |
| Temporary persistent profile | `DEBUG=pw:browser node "$task_tmp/probe.mjs"`; native executable, sandbox enabled | Make a normal browser page available | Native browser process exits with `SIGSEGV` before page startup | Logs report profile `search_engines.json` and `search_engines_prompt.json` cannot be read; those messages are not established crash causes |
| Wrapper-equivalent startup helper | Repeat with official wrapper exports and `exec -a`, excluding codec updater; 30-second startup timeout | Check whether omitted startup environment restores page creation | Native browser process again exits with `SIGSEGV` before page startup; Playwright reports `launchPersistentContext: Timeout 30000ms exceeded`, script exit 1 | Same profile-file messages; additional SSL handshake messages with `net_error -3` have no identified target URL and are not core-download evidence |
| Incidental wrapper file cleanup | Remove the observed generated codec, alias, and marker; remove only their now-empty Vivaldi directories | Restore task-created files outside `/tmp` | Exact observed task-created paths removed before subsequent attempts | Executed targeted cleanup; no installed browser or system package removed |
| Final cleanup | Stop the unresolved earlier startup probe; inspect task process paths; remove validated temporary directory and task-generated crash reports | No task browser, helper, temporary installation, or incidental Vivaldi files remain | Earlier unresolved Node probe terminated with exit 143; no remaining task process paths; temporary directory removed; codec and Vivaldi configuration directories absent | Executed cleanup; crash reports appeared only after the task had removed its newly created configuration directory; no unrelated configuration entries were present |
| Git | `git diff --check` | Documentation changes have no whitespace errors | Passed: exit 0, no output | Executed local check; no tests/build rerun for this documentation-only investigation |

The task-created external paths are `.local/lib/vivaldi/media-codecs-8.3-153-S-20260918`, its `media-codecs-8.2` alias, and `.config/vivaldi/update-ffmpeg-checked-8.2` under the current user's home. The native launch attempts do not run the updater. No actual `sw.js` response, proxy ZIP response, shield-setting assertion, installed WordPress version, or live launcher result was obtained in Vivaldi. The official Playground boot was not attempted after page startup remained unavailable.

The native crashes subsequently recreated `.config/vivaldi` containing only task-generated `Crash Reports`; those reports and the now-empty directory were removed too. The temporary DEB, extraction, profiles, npm modules, and scripts have been deleted. Their temporary script command cannot be replayed directly; the startup options and procedures above describe the attempted setup. Existing browser installations and unrelated configuration were preserved.

## Result

The official current Linux Vivaldi build is identified and downloaded, but this extracted, headless Playwright setup cannot provide a page. Its startup failure is different from the user's reported Playground download failure. The available evidence does not distinguish packaging/startup assumptions, automation support, or host conditions, and does not establish a Vivaldi engine or operating-system compatibility defect. The user's `No blocking` setting is not contradicted or blamed.

## Disposition and rationale

Inconclusive. Record the setup limitation and stop further browser changes. No verified local application fix follows from a browser that never navigated to the application. No runtime source, release version, commit, push, or deployment changed.

## Documentation impact

[Testing](../testing.md) and [the change index](README.md) link the attempted Vivaldi comparison and distinguish browser startup evidence from an executed Playground test. Previous successful and failed browser results remain unchanged.

## Follow-ups and open questions

- Obtain the user's exact Vivaldi build and operating system with a reproducible failing page/network observation.
- A normal interactive Vivaldi environment remains untested; do not infer its behavior from this headless extraction failure.
- The reported service-worker HTTP 403 remains unconfirmed in the user's environment.
