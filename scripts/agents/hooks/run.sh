#!/usr/bin/env bash
# Usage: run.sh <bash-guard|session-env|agent-cap|context-card> < hook.json; the hook launcher kit init
# writes into each project. Runs the kit's own hooks/run.sh, found as the kit launcher finds it, never through
# the front door (its RESULT: line would become session context). It never blocks a session and never goes
# quiet: without a kit it says the guards are off.
data=${XDG_DATA_HOME:-} cache=${XDG_CACHE_HOME:-}
[[ $data == /* ]] || data=${HOME:-$(cd ~ && pwd -P)}/.local/share
[[ $cache == /* ]] || cache=${HOME:-$(cd ~ && pwd -P)}/.cache
# A whole kit, as kit update and the kit launcher check it, with its hooks.
whole() { [[ -x $1/kit && -f $1/kit-lib.sh && -f $1/hooks/run.sh ]]; }
home=${KIT_HOME:-}
# A KIT_HOME the kit launcher picked (KIT_HOME_PINNED) and kit update has since removed is looked up again.
if [[ -z $home || $home == "${KIT_HOME_DEFAULT:-}" ]] || { [[ $home == "${KIT_HOME_PINNED:-}" ]] && ! whole "$home"; }; then
  home=$(readlink -- "$data/agent-kit/current" 2>/dev/null) || home=''
  [[ -z $home || $home == /* ]] || home=$data/agent-kit/$home
  # The cache clone is the kit launcher's; a hook does not clone (the warning's kit doctor does).
  whole "$home" || home=$cache/agent-kit
fi
! whole "$home" || exec bash "$home/hooks/run.sh" "$@"
warning='Agent Kit not found: guards are off; run `scripts/agents/kit doctor`'
case ${1-} in
  # SessionStart context, once per session (the context card stays silent).
  session-env) printf '%s\n' "$warning" ;;
  context-card) ;;
  *) printf '{"systemMessage":"%s"}\n' "$warning" ;;
esac
exit 0
