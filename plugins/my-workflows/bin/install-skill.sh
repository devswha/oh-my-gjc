#!/usr/bin/env bash
# Install my-workflows' easy-answer SKILL.md as a NATIVE gjc skill so it
# auto-activates on natural language ("쉽게 말해줘", "이게 무슨 뜻이야", "풀어서
#말해줘") and shows up in the `skill` tool / `/skill:easy-answer`.
#
# WHY THIS EXISTS: gjc only surfaces *native* `.gjc` skills. A marketplace
# plugin's skills/<name>/SKILL.md is intentionally ignored by gjc's skill
# registry (`if (provider !== "native") return false`). The plugin still ships
# the /my-workflows:easy and /my-workflows:easy-always commands, but the auto-
# activating *skill* surface requires a native install — that's what this does.
#
# NOTE: for "매번 자동, 모든 세션" use `/my-workflows:easy-always on` instead
# (writes a rule block into ~/.gjc/agent/AGENTS.md, injected every turn). A native
# skill activates by RELEVANCE (trigger words), not on every turn.
#
# Usage:
#   install-skill.sh              # user scope  -> ~/.gjc/agent/skills/easy-answer/
#   install-skill.sh project      # project     -> <cwd>/.gjc/skills/easy-answer/
#   install-skill.sh uninstall    # remove the user-scope native skill
#   install-skill.sh uninstall project
set -euo pipefail

PLUGIN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$PLUGIN_ROOT/skills/easy-answer/SKILL.md"

mode="${1:-user}"

user_dir="$HOME/.gjc/agent/skills/easy-answer"
proj_dir="$PWD/.gjc/skills/easy-answer"

case "$mode" in
  uninstall)
    scope="${2:-user}"
    dir="$user_dir"; [ "$scope" = "project" ] && dir="$proj_dir"
    rm -rf "$dir"
    echo "✓ removed native skill: $dir"
    ;;
  project)
    [ -f "$SRC" ] || { echo "❌ SKILL.md not found at $SRC"; exit 1; }
    mkdir -p "$proj_dir"
    cp -f "$SRC" "$proj_dir/SKILL.md"
    echo "✓ installed native skill (project): $proj_dir/SKILL.md"
    echo "  → auto-activates in this repo. New gjc session will pick it up."
    ;;
  user)
    [ -f "$SRC" ] || { echo "❌ SKILL.md not found at $SRC"; exit 1; }
    mkdir -p "$user_dir"
    cp -f "$SRC" "$user_dir/SKILL.md"
    echo "✓ installed native skill (user): $user_dir/SKILL.md"
    echo "  → auto-activates in every repo/session on this machine."
    echo "  → re-run after a plugin upgrade to refresh the copy."
    ;;
  *)
    echo "usage: install-skill.sh [user|project|uninstall [user|project]]"; exit 2 ;;
esac
