#!/usr/bin/env bash
# Shared helpers for agent-kit commands. Sourcing this file has no side effects.

kit_root() {
  if [[ -n ${KIT_ROOT:-} ]]; then
    printf '%s\n' "$KIT_ROOT"
  elif ! git rev-parse --show-toplevel 2>/dev/null; then
    (cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)
  fi
}

kit_main_root() {
  printf '%s\n' "${KIT_MAIN_ROOT:-/home/ubulex/Projects/techies-playground}"
}

kit_owner() {
  local root owner='' _timestamp _rest
  local IFS=$' \t\n'
  if [[ -n ${ASE_OWNER:-} ]]; then
    owner=$ASE_OWNER
  else
    root=$(kit_root)
    if [[ -r $root/.scratch/owner ]]; then
      read -r _timestamp owner _rest < "$root/.scratch/owner" || :
    fi
    if [[ -z $owner || $owner == unknown ]]; then
      owner=$(git -C "$root" branch --show-current 2>/dev/null) || owner=''
    fi
  fi
  owner=${owner//$'\n'/ }
  owner=${owner//$'\r'/ }
  printf '%s\n' "${owner:-unknown}"
}

kit_node_find() (
  local candidate version root best='' major=0 minor=0 patch=0
  local next_major next_minor next_patch
  candidate=$(type -P node) || candidate=''
  if [[ -n $candidate ]] && version=$("$candidate" --version 2>/dev/null) &&
    [[ $version =~ ^v([0-9]+)\.([0-9]+)\.([0-9]+)$ ]] && (( 10#${BASH_REMATCH[1]} >= 24 )); then
    printf '%s/%s\n' "$(cd -- "${candidate%/*}" && pwd -P)" "${candidate##*/}"
    return 0
  fi
  root=${CLAUDE_NODE_SEARCH_ROOT:-${HOME:-}}
  [[ -n $root ]] || return 1
  shopt -s nullglob
  for candidate in "$root"/.npm/_npx/*/node_modules/node/bin/node "$root"/.nvm/versions/node/*/bin/node; do
    [[ -f $candidate && -x $candidate ]] || continue
    version=$("$candidate" --version 2>/dev/null) || continue
    [[ $version =~ ^v([0-9]+)\.([0-9]+)\.([0-9]+)$ ]] || continue
    next_major=$((10#${BASH_REMATCH[1]})) next_minor=$((10#${BASH_REMATCH[2]})) next_patch=$((10#${BASH_REMATCH[3]}))
    if (( next_major >= 24 && (next_major > major || (next_major == major && next_minor > minor) || (next_major == major && next_minor == minor && next_patch > patch)) )); then
      best=$candidate major=$next_major minor=$next_minor patch=$next_patch
    fi
  done
  [[ -n $best ]] || return 1
  printf '%s/%s\n' "$(cd -- "${best%/*}" && pwd -P)" "${best##*/}"
)

kit_node() {
  local node directory path=${PATH-}
  if ! node=$(kit_node_find); then
    printf '%s\n' 'kit: no Node >=24 found (system, npx cache or nvm)' >&2
    return 1
  fi
  directory=${node%/*}
  if [[ ${path%%:*} != "$directory" ]]; then
    export PATH="$directory${path:+:$path}"
  fi
  export KIT_NODE=$node
}

kit_result() {
  local status=${1-} text
  local IFS=' '
  if (( $# )); then shift; fi
  case $status in
    ok|fail) text="$*" ;;
    *) text="kit_result: bad status $status"; status=bad ;;
  esac
  text=${text//$'\n'/ }
  text=${text//$'\r'/ }
  if [[ $status == bad ]]; then
    printf 'RESULT: fail %s\n' "$text"
    return 2
  fi
  printf 'RESULT: %s %s\n' "$status" "$text"
}
