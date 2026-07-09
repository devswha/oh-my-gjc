#!/usr/bin/env bash
# Install oh-my-gajaecode SKILLs, slash COMMANDs, and deprecation tombstones as
# NATIVE gjc capabilities. WHY: gjc does not load a marketplace plugin's skills or
# commands into a session (skill registry takes native `.gjc` only; the claude-plugins
# slash-command provider is never registered) — verified. A native capability's name
# IS its filename, so we copy them into the native dirs.
#
#   canonical commands : commands/<name>.md  → ~/.gjc/agent/commands/omg:<name>.md → /omg:<name>
#   catalog            : commands/omg.md     → ~/.gjc/agent/commands/omg.md        → /omg
#   deprecated stubs   : tombstones/<old>.md → ~/.gjc/agent/commands/<old>.md      (points at /omg:*)
#   skills             : skills/<name>/SKILL.md → ~/.gjc/agent/skills/<name>/SKILL.md
#
# The old per-plugin commands are NOT reinstalled with their real bodies — only
# one-release tombstone stubs that redirect
# to the new /omg:* name (removed next release). No feature-body duplication.
#
# Installation is driven by the EXPECTED_* manifests below (not a directory scan), so a
# missing expected file fails the WHOLE install with a missing list — never "copy what's there".
#
# Usage:
#   install-skill.sh all [user|project]
#   install-skill.sh all uninstall [user|project]
#   install-skill.sh <name> [user|project|uninstall [user|project]]
#   install-skill.sh uninstall [user|project]        # uninstall everything
#
# After installing, open a NEW gjc session (or run `/move .`) to rebuild the palette.
set -euo pipefail

# Guard: a path-like arg means a glob matched the wrong/multiple plugin folders
# (cache is <marketplace>___<plugin>___<ver>; a bare *marketplace* glob hits every
# plugin). Abort with the correct, plugin-scoped invocation.
for _a in "$@"; do
  case "$_a" in
    */*|*install-skill.sh)
      echo "❌ '$_a' looks like a path, not an argument — a glob likely matched the wrong plugin folder." >&2
      echo "   Use a plugin-scoped, newest-version path:" >&2
      echo "   bash \"\$(ls -d ~/.gjc/plugins/cache/plugins/oh-my-gjc___oh-my-gjc___*/bin/install-skill.sh 2>/dev/null | sort -V | tail -1)\" all" >&2
      exit 2 ;;
  esac
done

PLUGIN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# ── EXPECTED manifest (the single source of truth for a complete install) ────────────
EXPECTED_SKILLS=(easy-answer gate-briefing multivendor-presets branch-flow extragoal \
                 codex-cli-ask codex-deepwork lazycodex codex-app-launch codex-app-cdp \
                 insane-review gjc-bugwatch tower)
EXPECTED_COMMANDS=(omg setup easy easy-always gate gate-always presets fable branchflow-always \
                   codex-ask codex-run lazycodex-setup lazycodex-work codex-app-launch codex-app-ask \
                   insane-review bugwatch-scan tower-setup)
EXPECTED_TOMBSTONES=(tower:setup insane-review:review gjc-bugwatch:scan \
                     codex-cli-control:ask codex-deepwork:run lazycodex:setup lazycodex:work \
                     codex-app-control:launch codex-app-control:ask \
                     oh-my-gjc:setup oh-my-gjc:easy oh-my-gjc:easy-always oh-my-gjc:gate \
                     oh-my-gjc:gate-always oh-my-gjc:presets oh-my-gjc:branchflow-always oh-my-gjc:fable)

skills_dir()   { if [ "$1" = project ]; then echo "$PWD/.gjc/skills";   else echo "$HOME/.gjc/agent/skills";   fi; }
commands_dir() { if [ "$1" = project ]; then echo "$PWD/.gjc/commands"; else echo "$HOME/.gjc/agent/commands"; fi; }

MISSING=()

install_skill() { # $1=name $2=scope
  local src dir
  src="$PLUGIN_ROOT/skills/$1/SKILL.md"
  [ -f "$src" ] || { MISSING+=("skills/$1/SKILL.md"); return 0; }
  dir="$(skills_dir "$2")/$1"; mkdir -p "$dir"; cp -f "$src" "$dir/SKILL.md"
  echo "✓ skill   ($2): $dir/SKILL.md"
}
install_command() { # $1=name $2=scope
  local src dir
  src="$PLUGIN_ROOT/commands/$1.md"
  [ -f "$src" ] || { MISSING+=("commands/$1.md"); return 0; }
  dir="$(commands_dir "$2")"; mkdir -p "$dir"
  if [ "$1" = "omg" ]; then cp -f "$src" "$dir/omg.md"; echo "✓ command ($2): $dir/omg.md  → /omg"; return 0; fi
  cp -f "$src" "$dir/omg:$1.md"
  echo "✓ command ($2): $dir/omg:$1.md  → /omg:$1"
}
install_tombstone() { # $1=old-name(no .md) $2=scope
  local src dir
  src="$PLUGIN_ROOT/tombstones/$1.md"
  [ -f "$src" ] || { MISSING+=("tombstones/$1.md"); return 0; }
  dir="$(commands_dir "$2")"; mkdir -p "$dir"; cp -f "$src" "$dir/$1.md"
  echo "✓ stub    ($2): $dir/$1.md  (deprecated → /omg:*)"
}
uninstall_skill()     { rm -rf "$(skills_dir "$2")/$1"; echo "✓ removed skill: $1"; }
uninstall_command()   { local d; d="$(commands_dir "$2")"; if [ "$1" = "omg" ]; then rm -f "$d/omg.md"; else rm -f "$d/omg:$1.md" "$d/oh-my-gjc:$1.md"; fi; echo "✓ removed command: $1"; }
uninstall_tombstone() { rm -f "$(commands_dir "$2")/$1.md"; echo "✓ removed stub: $1"; }

report_missing() {
  if [ "${#MISSING[@]}" -gt 0 ]; then
    echo "❌ install FAILED — expected files missing (nothing partial is accepted):" >&2
    for m in "${MISSING[@]}"; do echo "   - $m" >&2; done
    exit 1
  fi
}

preflight_all() {  # verify ALL expected files exist BEFORE copying anything (never a partial install)
  MISSING=()
  for s in "${EXPECTED_SKILLS[@]}";     do [ -f "$PLUGIN_ROOT/skills/$s/SKILL.md" ]  || MISSING+=("skills/$s/SKILL.md"); done
  for c in "${EXPECTED_COMMANDS[@]}";   do [ -f "$PLUGIN_ROOT/commands/$c.md" ]       || MISSING+=("commands/$c.md"); done
  for t in "${EXPECTED_TOMBSTONES[@]}"; do [ -f "$PLUGIN_ROOT/tombstones/$t.md" ]     || MISSING+=("tombstones/$t.md"); done
  report_missing
}

# First arg may be "all", a skill/command name, or a mode.
target="all"
if [ $# -ge 1 ]; then
  if [ "$1" = "all" ]; then
    target="all"; shift
  elif [ -d "$PLUGIN_ROOT/skills/$1" ] || [ -f "$PLUGIN_ROOT/commands/$1.md" ]; then
    target="$1"; shift
  fi
fi

mode="${1:-user}"

case "$mode" in
  uninstall)
    scope="${2:-user}"
    if [ "$target" = "all" ]; then
      for s in "${EXPECTED_SKILLS[@]}";     do uninstall_skill     "$s" "$scope"; done
      for c in "${EXPECTED_COMMANDS[@]}";   do uninstall_command   "$c" "$scope"; done
      for t in "${EXPECTED_TOMBSTONES[@]}"; do uninstall_tombstone "$t" "$scope"; done
    else
      if [ -d "$PLUGIN_ROOT/skills/$target" ];      then uninstall_skill   "$target" "$scope"; fi
      if [ -f "$PLUGIN_ROOT/commands/$target.md" ]; then uninstall_command "$target" "$scope"; fi
    fi
    ;;
  user|project)
    if [ "$target" = "all" ]; then
      preflight_all
      for s in "${EXPECTED_SKILLS[@]}";     do install_skill     "$s" "$mode"; done
      for c in "${EXPECTED_COMMANDS[@]}";   do install_command   "$c" "$mode"; done
      for t in "${EXPECTED_TOMBSTONES[@]}"; do install_tombstone "$t" "$mode"; done
      report_missing
    else
      if [ -d "$PLUGIN_ROOT/skills/$target" ];      then install_skill   "$target" "$mode"; fi
      if [ -f "$PLUGIN_ROOT/commands/$target.md" ]; then install_command "$target" "$mode"; fi
      report_missing
    fi
    if [ "$mode" = "user" ]; then
      echo "  → skills auto-activate by trigger words; commands are /omg:<name>. Type /omg for the catalog."
      echo "  → deprecated old command names install as stubs that point you at the new /omg:* name."
      echo "  → open a NEW gjc session (or run /move .) to load newly installed commands. Re-run after upgrades."
    else
      echo "  → installed for this repo. A new gjc session in this dir will pick them up."
    fi
    ;;
  *)
    echo "usage: install-skill.sh [all|<name>] [user|project|uninstall [user|project]]"; exit 2 ;;
esac
