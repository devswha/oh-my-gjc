#!/usr/bin/env bash
# Install insane-review's SKILL.md as a NATIVE gjc skill so it auto-activates
# on natural language ("GPT한테 물어봐", "have Pro review this") and shows up in
# the `skill` tool / `/skill:insane-review`.
#
# WHY THIS EXISTS: gjc only surfaces *native* `.gjc` skills. A marketplace
# plugin's skills/<name>/SKILL.md is intentionally ignored by gjc's skill
# registry (see gajae-code discovery: `if (provider !== "native") return false`).
# The plugin still ships the /insane-review:review command, but the auto-
# activating *skill* surface requires a native install — that's what this does.
#
# Usage:
#   install-skill.sh              # user scope  -> ~/.gjc/agent/skills/insane-review/
#   install-skill.sh project      # project     -> <cwd>/.gjc/skills/insane-review/
#   install-skill.sh uninstall    # remove the user-scope native skill
#   install-skill.sh uninstall project
set -euo pipefail

PLUGIN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$PLUGIN_ROOT/skills/insane-review/SKILL.md"

mode="${1:-user}"

user_dir="$HOME/.gjc/agent/skills/insane-review"
proj_dir="$PWD/.gjc/skills/insane-review"

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
