#!/usr/bin/env bash
# Install the tower SKILL *and* slash COMMANDs as NATIVE gjc capabilities, so they
# actually load in a session. (Same rationale as oh-my-gjc's installer: gjc only
# surfaces native `.gjc` skills, and never registers the marketplace slash-command
# provider — so a plugin's skills/commands are dead until copied natively.)
#
# Native locations:
#   user:    ~/.gjc/agent/skills/<name>/SKILL.md    ~/.gjc/agent/commands/tower:<name>.md
#   project: ./.gjc/skills/<name>/SKILL.md          ./.gjc/commands/tower:<name>.md
#
# Usage:
#   install-skill.sh all                        # every bundled skill + command, user scope
#   install-skill.sh all project                # ... project scope
#   install-skill.sh <name>                     # one skill and/or command, user scope
#   install-skill.sh <name> uninstall [project]
#   install-skill.sh uninstall [project]        # uninstall ALL bundled skills + commands
#
# After installing commands, open a NEW gjc session (or run `/move .`) so the
# session's slash-command palette is rebuilt.
set -euo pipefail

PLUGIN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLUGIN_NAME="tower"

all_skills()   { ls -1 "$PLUGIN_ROOT/skills"   2>/dev/null || true; }
all_commands() { ls -1 "$PLUGIN_ROOT/commands" 2>/dev/null | sed 's/\.md$//' || true; }

skills_dir()   { if [ "$1" = project ]; then echo "$PWD/.gjc/skills";   else echo "$HOME/.gjc/agent/skills";   fi; }
commands_dir() { if [ "$1" = project ]; then echo "$PWD/.gjc/commands"; else echo "$HOME/.gjc/agent/commands"; fi; }

install_skill() { # $1=name $2=scope
  local src dir
  src="$PLUGIN_ROOT/skills/$1/SKILL.md"
  [ -f "$src" ] || { echo "❌ SKILL.md not found: $src"; return 1; }
  dir="$(skills_dir "$2")/$1"
  mkdir -p "$dir"
  cp -f "$src" "$dir/SKILL.md"
  echo "✓ skill   ($2): $dir/SKILL.md"
}
uninstall_skill() { # $1=name $2=scope
  local dir
  dir="$(skills_dir "$2")/$1"
  rm -rf "$dir"
  echo "✓ removed skill: $dir"
}

install_command() { # $1=name $2=scope
  local src dir dest
  src="$PLUGIN_ROOT/commands/$1.md"
  [ -f "$src" ] || { echo "❌ command not found: $src"; return 1; }
  dir="$(commands_dir "$2")"
  mkdir -p "$dir"
  dest="$dir/${PLUGIN_NAME}:$1.md"
  cp -f "$src" "$dest"
  echo "✓ command ($2): $dest  → /${PLUGIN_NAME}:$1"
}
uninstall_command() { # $1=name $2=scope
  local dest
  dest="$(commands_dir "$2")/${PLUGIN_NAME}:$1.md"
  rm -f "$dest"
  echo "✓ removed command: $dest"
}

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
      for s in $(all_skills);   do uninstall_skill   "$s" "$scope"; done
      for c in $(all_commands); do uninstall_command "$c" "$scope"; done
    else
      if [ -d "$PLUGIN_ROOT/skills/$target" ];      then uninstall_skill   "$target" "$scope"; fi
      if [ -f "$PLUGIN_ROOT/commands/$target.md" ]; then uninstall_command "$target" "$scope"; fi
    fi
    ;;
  user|project)
    if [ "$target" = "all" ]; then
      for s in $(all_skills);   do install_skill   "$s" "$mode"; done
      for c in $(all_commands); do install_command "$c" "$mode"; done
    else
      if [ -d "$PLUGIN_ROOT/skills/$target" ];      then install_skill   "$target" "$mode"; fi
      if [ -f "$PLUGIN_ROOT/commands/$target.md" ]; then install_command "$target" "$mode"; fi
    fi
    if [ "$mode" = "user" ]; then
      echo "  → skills auto-activate by trigger words; commands are /${PLUGIN_NAME}:<name>."
      echo "  → open a NEW gjc session (or run /move .) to load newly installed commands. Re-run after plugin upgrades."
    else
      echo "  → installed for this repo. A new gjc session in this dir will pick them up."
    fi
    ;;
  *)
    echo "usage: install-skill.sh [all|<name>] [user|project|uninstall [user|project]]"; exit 2 ;;
esac
