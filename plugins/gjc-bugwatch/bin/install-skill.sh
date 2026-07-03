#!/usr/bin/env bash
# Install gjc-bugwatch's SKILL.md as a NATIVE gjc skill so it auto-activates on
# natural language ("버그 스캔 돌려줘", "gjc 버그 찾아줘", "bugwatch") and shows up
# in the `skill` tool / `/skill:gjc-bugwatch`.
#
# WHY THIS EXISTS: gjc only surfaces *native* `.gjc` skills. A marketplace
# plugin's skills/<name>/SKILL.md is intentionally ignored by gjc's skill
# registry (`if (provider !== "native") return false`). The plugin still ships
# the /gjc-bugwatch:scan command, but the auto-activating *skill* surface requires
# a native install — that's what this does.
#
# Usage:
#   install-skill.sh              # user scope  -> ~/.gjc/agent/skills/gjc-bugwatch/
#   install-skill.sh project      # project     -> <cwd>/.gjc/skills/gjc-bugwatch/
#   install-skill.sh uninstall    # remove the user-scope native skill
#   install-skill.sh uninstall project
set -euo pipefail

PLUGIN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$PLUGIN_ROOT/skills/gjc-bugwatch/SKILL.md"

mode="${1:-user}"

user_dir="$HOME/.gjc/agent/skills/gjc-bugwatch"
proj_dir="$PWD/.gjc/skills/gjc-bugwatch"

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
