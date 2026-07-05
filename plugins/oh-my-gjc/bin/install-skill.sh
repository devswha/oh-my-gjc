#!/usr/bin/env bash
# Install oh-my-gjc SKILL.md files as NATIVE gjc skills so they auto-activate
# on natural language triggers and show up in the `skill` tool / /skill:<name>.
#
# WHY THIS EXISTS: gjc only surfaces *native* `.gjc` skills. A marketplace
# plugin's skills/<name>/SKILL.md is intentionally ignored by gjc's skill
# registry (`if (provider !== "native") return false`). The plugin still ships
# the /oh-my-gjc:* commands, but the auto-activating *skill* surface requires
# a native install — that's what this does.
#
# NOTE: for "매번 자동, 모든 세션" use the matching *-always command instead
# (writes a rule block into ~/.gjc/agent/AGENTS.md, injected every turn). A native
# skill activates by RELEVANCE (trigger words), not on every turn.
#
# Usage:
#   install-skill.sh all                       # every bundled skill, user scope
#   install-skill.sh all project               # every bundled skill, project scope
#   install-skill.sh gate-briefing             # one skill, user scope
#   install-skill.sh gate-briefing project     # one skill, project scope
#   install-skill.sh gate-briefing uninstall [project]
#   install-skill.sh uninstall [project]       # uninstall ALL bundled skills
set -euo pipefail

PLUGIN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

all_skills() { ls -1 "$PLUGIN_ROOT/skills"; }

# First arg may be a skill name, "all", or a mode.
target="all"
if [ $# -ge 1 ]; then
  if [ "$1" = "all" ]; then
    target="all"; shift
  elif [ -d "$PLUGIN_ROOT/skills/$1" ]; then
    target="$1"; shift
  fi
fi

mode="${1:-user}"

install_one() { # $1=skill $2=scope(user|project)
  local skill="$1" scope="$2" src dir
  src="$PLUGIN_ROOT/skills/$skill/SKILL.md"
  [ -f "$src" ] || { echo "❌ SKILL.md not found at $src"; return 1; }
  dir="$HOME/.gjc/agent/skills/$skill"
  [ "$scope" = "project" ] && dir="$PWD/.gjc/skills/$skill"
  mkdir -p "$dir"
  cp -f "$src" "$dir/SKILL.md"
  echo "✓ installed native skill ($scope): $dir/SKILL.md"
}

uninstall_one() { # $1=skill $2=scope
  local skill="$1" scope="$2" dir
  dir="$HOME/.gjc/agent/skills/$skill"
  [ "$scope" = "project" ] && dir="$PWD/.gjc/skills/$skill"
  rm -rf "$dir"
  echo "✓ removed native skill: $dir"
}

case "$mode" in
  uninstall)
    scope="${2:-user}"
    if [ "$target" = "all" ]; then
      for s in $(all_skills); do uninstall_one "$s" "$scope"; done
    else
      uninstall_one "$target" "$scope"
    fi
    ;;
  user|project)
    if [ "$target" = "all" ]; then
      for s in $(all_skills); do install_one "$s" "$mode"; done
    else
      install_one "$target" "$mode"
    fi
    if [ "$mode" = "user" ]; then
      echo "  → auto-activates in every repo/session on this machine. Re-run after plugin upgrades."
    else
      echo "  → auto-activates in this repo. New gjc session will pick it up."
    fi
    ;;
  *)
    echo "usage: install-skill.sh [all|<skill-name>] [user|project|uninstall [user|project]]"; exit 2 ;;
esac
