#!/usr/bin/env bash
# Install oh-my-gajaecode SKILLs and slash COMMANDs as NATIVE gjc capabilities.
#
# WHY native install (and why command files live in templates/, not commands/):
#   gjc 0.9.x auto-exposes a marketplace plugin's convention `commands/*.md` as
#   `<plugin>:<name>` slash commands (claude-plugins provider). For this suite that
#   would surface a second, wrongly-namespaced `oh-my-gjc:*` command set alongside
#   the canonical `/omg:*`. To keep exactly ONE command surface, the command bodies
#   live in `templates/` — a NON-convention dir gjc never auto-registers — and this
#   installer copies them into the native commands dir with the `omg:` prefix.
#   (Plugin SKILLs do not surface as slash commands, so skills/ stays a convention dir.)
#
#   canonical commands : templates/<name>.md  → ~/.gjc/agent/commands/omg:<name>.md → /omg:<name>
#   catalog            : templates/omg.md     → ~/.gjc/agent/commands/omg.md        → /omg
#   skills             : skills/<name>/SKILL.md → ~/.gjc/agent/skills/<name>/SKILL.md
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
      echo "   Repair or upgrade through the hardened suite installer instead:" >&2
      echo "   curl -fsSL https://raw.githubusercontent.com/devswha/oh-my-gjc/main/install.sh | bash" >&2
      exit 2 ;;
  esac
done

PLUGIN_ROOT="$(cd -P "$(dirname "$0")/.." && pwd -P)"

# ── EXPECTED manifest (the single source of truth for a complete install) ────────────
EXPECTED_SKILLS=(gate-briefing extragoal insane-review)
EXPECTED_COMMANDS=(omg setup gate gate-always fable insane-review)
# Capabilities REMOVED (관제탑 발주, 하코 승인). 0.11.0: codex-deepwork(실사용 0회, lazycodex와 중복) +
# codex-app 짝(대상 앱 빌드 트랙 07-03 아카이브; Pro 리뷰는 insane-review 전담). 0.12.0: codex-cli-ask·
# lazycodex·tower(명시 호출 0 — Codex 트래픽은 전량 제품 파이프라인 codex exec 직결로 스킬 미경유,
# lazycodex 하니스 발원 세션 0건, 실관제탑은 자체 스크립트 구현이라 tower 스킬 미사용).
# 0.12.0: obsolete control/worker surfaces; 0.14.0: gajae-app ownership transfer.
# Post-v0.17.1 prune: multivendor-presets, release-gate, easy-answer, plain-layer,
# branch-flow/worktree, public gjc-bugwatch, and lazycodex-gjc.
# Upgrades sweep only their native skill/command files plus explicitly owned retired state.
REMOVED_SKILLS=(codex-deepwork codex-app-launch codex-app-cdp codex-cli-ask lazycodex tower worktree gajae-app multivendor-presets release-gate easy-answer plain-layer branch-flow gjc-bugwatch lazycodex-gjc)
REMOVED_COMMANDS=(codex-run codex-app-launch codex-app-ask codex-ask lazycodex-setup lazycodex-work tower-setup gajae-app presets release easy easy-always plain branchflow-always worktree bugwatch-scan lazycodex-gjc)
# Pre-0.8.1 native files that upgrades must sweep away: the 17 one-release deprecation
# tombstones shipped by 0.8.0 (removed in 0.8.1). Old `oh-my-gjc:<name>.md` aliases are
# covered separately by looping EXPECTED_COMMANDS in cleanup_legacy_commands.
LEGACY_COMMANDS=('codex-app-control:ask' 'codex-app-control:launch' 'codex-cli-control:ask' \
                 'codex-deepwork:run' 'gjc-bugwatch:scan' 'insane-review:review' \
                 'lazycodex:setup' 'lazycodex:work' 'oh-my-gjc:branchflow-always' \
                 'oh-my-gjc:easy-always' 'oh-my-gjc:easy' 'oh-my-gjc:fable' \
                 'oh-my-gjc:gate-always' 'oh-my-gjc:gate' 'oh-my-gjc:presets' \
                 'oh-my-gjc:setup' 'tower:setup')

skills_dir()   { if [ "$1" = project ]; then echo "$PWD/.gjc/skills";   else echo "$HOME/.gjc/agent/skills";   fi; }
commands_dir() { if [ "$1" = project ]; then echo "$PWD/.gjc/commands"; else echo "$HOME/.gjc/agent/commands"; fi; }
suite_runtime_dir() {
  case "$1" in
    user)    printf '%s\n' "$HOME/.gjc/agent/runtimes/oh-my-gjc" ;;
    project) printf '%s\n' "$PWD/.gjc/runtimes/oh-my-gjc" ;;
    *)       return 2 ;;
  esac
}
reject_symlinked_components() { # $1=absolute path — never follow a binding path component
  local path="$1" current="/" component
  local -a components
  case "$path" in
    /*) ;;
    *) echo "❌ install FAILED — suite runtime binding path is not absolute: $path" >&2; return 1 ;;
  esac
  IFS=/ read -r -a components <<<"${path#/}"
  for component in "${components[@]}"; do
    [ -n "$component" ] || continue
    current="${current%/}/$component"
    if [ -L "$current" ]; then
      echo "❌ install FAILED — suite runtime binding path contains a symlink: $current" >&2
      return 1
    fi
  done
}
prepare_suite_runtime_parent() { # $1=scope
  local parent
  parent="$(suite_runtime_dir "$1")" || return 1
  reject_symlinked_components "$parent" || return 1
  if ! mkdir -p "$parent"; then
    echo "❌ install FAILED — cannot create suite runtime binding parent: $parent" >&2
    return 1
  fi
  reject_symlinked_components "$parent" || return 1
  if [ ! -d "$parent" ] || [ -L "$parent" ]; then
    echo "❌ install FAILED — suite runtime binding parent is not a directory: $parent" >&2
    return 1
  fi
  if [ -O "$parent" ] && ! chmod 700 "$parent"; then
    echo "❌ install FAILED — cannot make suite runtime binding parent private: $parent" >&2
    return 1
  fi
  printf '%s\n' "$parent"
}
install_suite_root_binding() { # $1=scope — atomically bind native assets to this exact installed suite root
  local parent root temp
  parent="$(prepare_suite_runtime_parent "$1")" || return 1
  root="$parent/root"
  reject_symlinked_components "$root" || return 1
  if [ -e "$root" ] && { [ ! -f "$root" ] || [ -L "$root" ]; }; then
    echo "❌ install FAILED — suite runtime binding is malformed: $root" >&2
    return 1
  fi
  temp="$(mktemp "$parent/.root.XXXXXX")" || {
    echo "❌ install FAILED — cannot create suite runtime binding temp file: $parent" >&2
    return 1
  }
  if ! printf '%s\n' "$PLUGIN_ROOT" > "$temp" || ! chmod 600 "$temp" || [ "$(<"$temp")" != "$PLUGIN_ROOT" ]; then
    rm -f "$temp"
    echo "❌ install FAILED — cannot write exact suite runtime binding: $root" >&2
    return 1
  fi
  if ! mv -f "$temp" "$root"; then
    rm -f "$temp"
    echo "❌ install FAILED — cannot atomically install suite runtime binding: $root" >&2
    return 1
  fi
  echo "✓ bound suite assets ($1): $root"
}
uninstall_suite_root_binding() { # $1=scope — remove only this suite's root binding
  local parent root
  parent="$(suite_runtime_dir "$1")" || return 1
  root="$parent/root"
  reject_symlinked_components "$root" || return 1
  if [ -L "$root" ] || { [ -e "$root" ] && [ ! -f "$root" ]; }; then
    echo "❌ uninstall FAILED — suite runtime binding is malformed: $root" >&2
    return 1
  fi
  rm -f "$root"
  echo "✓ removed suite runtime binding ($1): $root"
}

cleanup_removed_runtime() {
  local root="$HOME/.gjc/agent/runtimes/lazycodex-gjc"
  local receipt="$HOME/.gjc/agent/receipts/lazycodex-gjc-runner.sha256"
  if [ -e "$root" ] || [ -L "$root" ] || [ -e "$receipt" ] || [ -L "$receipt" ]; then
    rm -rf "$root"
    rm -f "$receipt"
    echo "✓ removed runtime binding: lazycodex-gjc"
  fi
}

cleanup_removed_easy_markers() {
  local file content replacement backup
  for file in "$HOME/.gjc/agent/SYSTEM.md" "$HOME/.gjc/agent/AGENTS.md"; do
    [ -e "$file" ] || [ -L "$file" ] || continue
    if [ -L "$file" ] || [ ! -f "$file" ]; then
      echo "! easy-always marker cleanup skipped (not a regular file): $file" >&2
      continue
    fi
    grep -qE '<!-- BEGIN (oh-my-gjc|my-workflows):easy-always -->' "$file" || continue
    content="$(mktemp "$file.content.XXXXXX")" || {
      echo "! easy-always marker cleanup skipped (temporary file failed): $file" >&2
      continue
    }
    if ! awk '
      $0 == "<!-- BEGIN oh-my-gjc:easy-always -->" {
        seen++
        if (skip || seen > 1) bad=1
        skip=1
        expected="<!-- END oh-my-gjc:easy-always -->"
        next
      }
      $0 == "<!-- BEGIN my-workflows:easy-always -->" {
        seen++
        if (skip || seen > 1) bad=1
        skip=1
        expected="<!-- END my-workflows:easy-always -->"
        next
      }
      $0 == "<!-- END oh-my-gjc:easy-always -->" ||
      $0 == "<!-- END my-workflows:easy-always -->" {
        if (!skip || $0 != expected) bad=1
        skip=0
        expected=""
        next
      }
      !skip { print }
      END {
        if (!seen || skip || bad) exit 1
      }
    ' "$file" > "$content"; then
      rm -f "$content"
      echo "! easy-always marker cleanup skipped (malformed markers): $file" >&2
      continue
    fi
    backup="$(mktemp "$file.bak-$(date +%s).XXXXXX")" || {
      rm -f "$content"
      echo "! easy-always marker backup failed: $file" >&2
      continue
    }
    if ! cp -p "$file" "$backup"; then
      rm -f "$content" "$backup"
      echo "! easy-always marker backup failed: $file" >&2
      continue
    fi
    replacement="$(mktemp "$file.tmp.XXXXXX")" || {
      rm -f "$content"
      echo "! easy-always marker cleanup failed; original preserved: $file" >&2
      continue
    }
    if cp -p "$file" "$replacement" && cp "$content" "$replacement" && mv -f "$replacement" "$file"; then
      rm -f "$content"
      echo "✓ removed retired easy-always marker: $file (backup: $backup)"
    else
      rm -f "$content" "$replacement"
      echo "! easy-always marker cleanup failed; original preserved: $file" >&2
    fi
  done
}

cleanup_legacy_commands() { # $1=scope — drop pre-0.8.1 leftovers (0.8.0 tombstones + old oh-my-gjc:* aliases)
  local d n removed=0
  d="$(commands_dir "$1")"
  for n in "${LEGACY_COMMANDS[@]}"; do
    if [ -f "$d/$n.md" ] || [ -L "$d/$n.md" ]; then rm -f "$d/$n.md"; removed=$((removed+1)); fi
  done
  for n in "${EXPECTED_COMMANDS[@]}"; do
    if [ -f "$d/oh-my-gjc:$n.md" ] || [ -L "$d/oh-my-gjc:$n.md" ]; then rm -f "$d/oh-my-gjc:$n.md"; removed=$((removed+1)); fi
  done
  if [ "$removed" -gt 0 ]; then echo "✓ cleaned $removed legacy command file(s) (pre-0.8.1 tombstones/aliases)"; fi
}

cleanup_removed() { # $1=scope — sweep only native files of capabilities removed from the suite
  local d sd n removed=0
  d="$(commands_dir "$1")"; sd="$(skills_dir "$1")"
  for n in "${REMOVED_COMMANDS[@]}"; do
    if [ -f "$d/omg:$n.md" ] || [ -L "$d/omg:$n.md" ] || [ -f "$d/oh-my-gjc:$n.md" ] || [ -L "$d/oh-my-gjc:$n.md" ]; then rm -f "$d/omg:$n.md" "$d/oh-my-gjc:$n.md"; removed=$((removed+1)); fi
  done
  for n in "${REMOVED_SKILLS[@]}"; do
    if [ -d "$sd/$n" ] || [ -L "$sd/$n" ]; then rm -rf "$sd/$n"; removed=$((removed+1)); fi
  done
  if [ "$removed" -gt 0 ]; then echo "✓ cleaned $removed removed-capability native file(s)"; fi
}


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
  src="$PLUGIN_ROOT/templates/$1.md"
  [ -f "$src" ] || { MISSING+=("templates/$1.md"); return 0; }
  dir="$(commands_dir "$2")"; mkdir -p "$dir"
  if [ "$1" = "omg" ]; then cp -f "$src" "$dir/omg.md"; echo "✓ command ($2): $dir/omg.md  → /omg"; return 0; fi
  cp -f "$src" "$dir/omg:$1.md"
  echo "✓ command ($2): $dir/omg:$1.md  → /omg:$1"
}
uninstall_skill()     { rm -rf "$(skills_dir "$2")/$1"; echo "✓ removed skill: $1"; }
uninstall_command()   { local d; d="$(commands_dir "$2")"; if [ "$1" = "omg" ]; then rm -f "$d/omg.md"; else rm -f "$d/omg:$1.md" "$d/oh-my-gjc:$1.md"; fi; echo "✓ removed command: $1"; }

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
  for c in "${EXPECTED_COMMANDS[@]}";   do [ -f "$PLUGIN_ROOT/templates/$c.md" ]      || MISSING+=("templates/$c.md"); done
  report_missing
}

usage() {
  echo "usage: install-skill.sh [all|<name>] [user|project|uninstall [user|project]]" >&2
  exit 2
}

# First arg may be "all", a skill/command name, or a mode.
target="all"
if [ $# -ge 1 ]; then
  if [ "$1" = "all" ]; then
    target="all"; shift
  elif [ -d "$PLUGIN_ROOT/skills/$1" ] || [ -f "$PLUGIN_ROOT/templates/$1.md" ]; then
    target="$1"; shift
  fi
fi

mode="${1:-user}"

case "$mode" in
  uninstall)
    scope="${2:-user}"
    [ "$#" -le 2 ] || usage
    case "$scope" in user|project) ;; *) usage ;; esac
    if [ "$target" = "all" ]; then
      for s in "${EXPECTED_SKILLS[@]}";     do uninstall_skill     "$s" "$scope"; done
      for c in "${EXPECTED_COMMANDS[@]}";   do uninstall_command   "$c" "$scope"; done
      cleanup_legacy_commands "$scope"
      cleanup_removed "$scope"
      uninstall_suite_root_binding "$scope"
      if [ "$scope" = "user" ]; then cleanup_removed_runtime; cleanup_removed_easy_markers; fi
    else
      if [ -d "$PLUGIN_ROOT/skills/$target" ];       then uninstall_skill   "$target" "$scope"; fi
      if [ -f "$PLUGIN_ROOT/templates/$target.md" ]; then uninstall_command "$target" "$scope"; fi
    fi
    ;;
  user|project)
    [ "$#" -le 1 ] || usage
    if [ "$target" = "all" ]; then
      preflight_all
      install_suite_root_binding "$mode"
      for s in "${EXPECTED_SKILLS[@]}";     do install_skill     "$s" "$mode"; done
      for c in "${EXPECTED_COMMANDS[@]}";   do install_command   "$c" "$mode"; done
      cleanup_legacy_commands "$mode"
      cleanup_removed "$mode"
      if [ "$mode" = "user" ]; then cleanup_removed_runtime; cleanup_removed_easy_markers; fi
      report_missing
    else
      install_suite_root_binding "$mode"
      if [ -d "$PLUGIN_ROOT/skills/$target" ];       then install_skill   "$target" "$mode"; fi
      if [ -f "$PLUGIN_ROOT/templates/$target.md" ]; then install_command "$target" "$mode"; fi
      report_missing
    fi
    if [ "$mode" = "user" ]; then
      echo "  → skills auto-activate by trigger words; commands are /omg:<name>. Type /omg for the catalog."
      echo "  → open a NEW gjc session (or run /move .) to load newly installed commands. Re-run after upgrades."
    else
      echo "  → installed for this repo. A new gjc session in this dir will pick them up."
    fi
    ;;
  *)
    usage ;;
esac
