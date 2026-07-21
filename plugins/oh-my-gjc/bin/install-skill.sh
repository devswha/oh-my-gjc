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
EXPECTED_SKILLS=(adaptive-response no-english extragoal insane-review deep-onboarding preset-pack multi-harness-research)
EXPECTED_COMMANDS=(omg setup gate gate-always no-english insane-review deep-onboarding preset-pack multi-harness)
EXPECTED_RUNTIMES=(bin/multi-harness-research.mjs references/preset-pack.yml)
# Upgrades sweep only native files and dedicated runtime state owned by capabilities
# retired from this suite.
REMOVED_SKILLS=(gate-briefing korean-first workflow-eta time-left codex-deepwork codex-app-launch codex-app-cdp codex-cli-ask lazycodex lazycodex-gjc tower worktree gajae-app multivendor-presets release-gate easy-answer plain-layer branch-flow gjc-bugwatch session-observer)
REMOVED_COMMANDS=(fable time-left codex-run codex-app-launch codex-app-ask codex-ask lazycodex-setup lazycodex-work lazycodex-gjc tower-setup gajae-app presets release easy easy-always plain branchflow-always worktree bugwatch-scan session-observer)
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
prepare_native_surface_paths() { # $1=scope $2=create|verify
  local path
  local -a paths=("$(skills_dir "$1")" "$(commands_dir "$1")")
  for path in "${paths[@]}"; do
    reject_symlinked_components "$path" || return 1
    if [ -e "$path" ] && { [ ! -d "$path" ] || [ -L "$path" ]; }; then
      echo "❌ install FAILED — native surface path is not a directory: $path" >&2
      return 1
    fi
  done
  if [ "$2" = create ]; then
    for path in "${paths[@]}"; do mkdir -p "$path" || return 1; done
    for path in "${paths[@]}"; do reject_symlinked_components "$path" || return 1; done
  fi
}
multi_harness_runtime() { echo "$HOME/.gjc/agent/runtimes/multi-harness-research"; }
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
  if [ -e "$root" ] &&
     { ! multi_harness_private_file "$root" 600 || [ "$(<"$root")" != "$PLUGIN_ROOT" ]; }; then
    echo "❌ uninstall FAILED — suite runtime binding is not owned by this installed suite: $root" >&2
    return 1
  fi
  rm -f "$root"
  echo "✓ removed suite runtime binding ($1): $root"
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'; return; fi
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}'; return; fi
  if command -v openssl >/dev/null 2>&1; then openssl dgst -sha256 "$1" | awk '{print $NF}'; return; fi
  echo "❌ install FAILED — SHA-256 tool unavailable for runtime binding" >&2
  return 1
}
# The multi-harness runner has a private binding with an exact executable and
# credential-leaf contract. Runtime paths are accepted only when every canonical
# component is owned by the invoking user or root, non-symlinked, and not writable by
# group or other users.
multi_harness_trusted_path() { # $1=absolute canonical existing path
  local current="$1" owner mode uid
  uid="$(id -u)"
  case "$current" in
    /*) ;;
    *) echo "❌ multi-harness runtime path is not absolute: $current" >&2; return 1 ;;
  esac
  while :; do
    [ -e "$current" ] && [ ! -L "$current" ] || {
      echo "❌ multi-harness runtime path is missing or symlinked: $current" >&2
      return 1
    }
    owner="$(stat -c '%u' "$current")"
    mode="$(stat -c '%a' "$current")"
    if [ "$owner" != "$uid" ] && [ "$owner" != 0 ]; then
      echo "❌ multi-harness runtime path has an unexpected owner: $current" >&2
      return 1
    fi
    if (( (8#$mode & 8#022) != 0 )) && { [ "$current" != /tmp ] || (( (8#$mode & 8#1000) == 0 )); }; then
      echo "❌ multi-harness runtime path is group/other-writable: $current" >&2
      return 1
    fi
    [ "$current" = / ] && return 0
    current="$(dirname "$current")"
  done
}
multi_harness_private_file() { # $1=path $2=required octal mode
  local owner links mode
  [ -f "$1" ] && [ ! -L "$1" ] || return 1
  owner="$(stat -c '%u' "$1")"
  links="$(stat -c '%h' "$1")"
  mode="$(stat -c '%a' "$1")"
  [ "$owner" = "$(id -u)" ] && [ "$links" = 1 ] && [ "$mode" = "$2" ]
}
multi_harness_private_directory() { # $1=path $2=required octal mode
  local owner mode
  [ -d "$1" ] && [ ! -L "$1" ] || return 1
  owner="$(stat -c '%u' "$1")"
  mode="$(stat -c '%a' "$1")"
  [ "$owner" = "$(id -u)" ] && [ "$mode" = "$2" ]
}
prepare_multi_harness_runtime_parent() {
  local parent="$HOME/.gjc/agent/runtimes"
  reject_symlinked_components "$parent" || return 1
  if ! mkdir -p "$parent" || ! chmod 700 "$parent"; then
    echo "❌ install FAILED — cannot prepare multi-harness runtime parent: $parent" >&2
    return 1
  fi
  reject_symlinked_components "$parent" || return 1
  if ! multi_harness_private_directory "$parent" 700 || ! multi_harness_trusted_path "$parent"; then
    echo "❌ install FAILED — multi-harness runtime parent is not current-user private: $parent" >&2
    return 1
  fi
  printf '%s\n' "$parent"
}
multi_harness_executable() { # $1=command name
  local candidate canonical
  candidate="$(command -v "$1" 2>/dev/null)" || {
    echo "❌ multi-harness requires an existing $1 executable" >&2
    return 1
  }
  canonical="$(readlink -f "$candidate" 2>/dev/null)" || return 1
  if [ ! -f "$canonical" ] || [ -L "$canonical" ] || [ ! -x "$canonical" ]; then
    echo "❌ multi-harness executable is not a non-symlink executable file: $candidate" >&2
    return 1
  fi
  reject_symlinked_components "$canonical" || return 1
  multi_harness_trusted_path "$canonical" || return 1
  printf '%s\n' "$canonical"
}
multi_harness_credential_leaf() { # $1=label $2=literal configured leaf path
  local label="$1" raw="$2" canonical mode links owner
  case "$raw" in
    /*) ;;
    *) echo "❌ multi-harness $label credential path is not absolute" >&2; return 1 ;;
  esac
  case "$raw" in
    *'//'|*/./*|*/../*|*/..)
      echo "❌ multi-harness $label credential path is not canonical" >&2
      return 1 ;;
  esac
  canonical="$(readlink -f "$raw" 2>/dev/null)" || {
    echo "❌ multi-harness $label credential file is missing" >&2
    return 1
  }
  if [ "$canonical" != "$raw" ] || [ ! -f "$canonical" ] || [ -L "$canonical" ]; then
    echo "❌ multi-harness $label credential file is missing or symlinked" >&2
    return 1
  fi
  multi_harness_trusted_path "$canonical" || return 1
  owner="$(stat -c '%u' "$canonical")"
  links="$(stat -c '%h' "$canonical")"
  mode="$(stat -c '%a' "$canonical")"
  if [ "$owner" != "$(id -u)" ] || [ "$links" != 1 ] || (( (8#$mode & 8#077) != 0 )); then
    echo "❌ multi-harness $label credential file must be current-user, single-link, and mode 0600 or stricter" >&2
    return 1
  fi
  printf '%s\n' "$canonical"
}
MULTI_HARNESS_ACCOUNT_HOME="" MULTI_HARNESS_NODE="" MULTI_HARNESS_GJC=""
MULTI_HARNESS_CODEX_CORE="" MULTI_HARNESS_CODEX_ROOT="" MULTI_HARNESS_CLAUDE="" MULTI_HARNESS_BWRAP=""
MULTI_HARNESS_GJC_AUTH="" MULTI_HARNESS_CODEX_AUTH="" MULTI_HARNESS_CLAUDE_AUTH=""
prepare_multi_harness_runtime() {
  local codex details data_home codex_home
  [ "$(uname -s)" = Linux ] || {
    echo "❌ multi-harness requires Linux and bubblewrap" >&2
    return 1
  }
  MULTI_HARNESS_ACCOUNT_HOME="$(readlink -f "$HOME" 2>/dev/null)" || return 1
  if [ "$MULTI_HARNESS_ACCOUNT_HOME" != "$HOME" ] || [ ! -d "$MULTI_HARNESS_ACCOUNT_HOME" ] || [ -L "$MULTI_HARNESS_ACCOUNT_HOME" ]; then
    echo "❌ multi-harness HOME must be an absolute canonical non-symlink directory" >&2
    return 1
  fi
  multi_harness_trusted_path "$MULTI_HARNESS_ACCOUNT_HOME" || return 1
  MULTI_HARNESS_NODE="$(multi_harness_executable node)" || return 1
  MULTI_HARNESS_GJC="$(multi_harness_executable gjc)" || return 1
  codex="$(multi_harness_executable codex)" || return 1
  MULTI_HARNESS_CLAUDE="$(multi_harness_executable claude)" || return 1
  MULTI_HARNESS_BWRAP="$(multi_harness_executable bwrap)" || return 1
  details="$("$MULTI_HARNESS_NODE" - "$codex" <<'NODE'
const { basename, dirname, join, resolve } = require("node:path");
const { readdirSync, realpathSync, statSync } = require("node:fs");
const binary = realpathSync(process.argv[2]);
const packages = { "linux:x64": "codex-linux-x64", "linux:arm64": "codex-linux-arm64" };
let core = binary;
let runtimeRoot = dirname(binary);
if (basename(binary) === "codex.js") {
  const packageName = packages[`${process.platform}:${process.arch}`];
  if (packageName === undefined) process.exit(1);
  const vendor = join(resolve(dirname(binary), ".."), "node_modules/@openai", packageName, "vendor");
  const target = readdirSync(vendor).find((name) => statSync(join(vendor, name)).isDirectory());
  if (target === undefined) process.exit(1);
  core = realpathSync(join(vendor, target, "bin", "codex"));
  runtimeRoot = realpathSync(join(vendor, target, "codex-path"));
}
process.stdout.write(`${core}\n${runtimeRoot}\n`);
NODE
)" || {
    echo "❌ multi-harness requires a compatible native Codex runtime" >&2
    return 1
  }
  mapfile -t details <<<"$details"
  if [ "${#details[@]}" -ne 2 ]; then
    echo "❌ multi-harness Codex runtime metadata is malformed" >&2
    return 1
  fi
  MULTI_HARNESS_CODEX_CORE="${details[0]}"
  MULTI_HARNESS_CODEX_ROOT="${details[1]}"
  if [ ! -f "$MULTI_HARNESS_CODEX_CORE" ] || [ ! -x "$MULTI_HARNESS_CODEX_CORE" ] || [ ! -d "$MULTI_HARNESS_CODEX_ROOT" ]; then
    echo "❌ multi-harness Codex native core/runtime is unavailable" >&2
    return 1
  fi
  reject_symlinked_components "$MULTI_HARNESS_CODEX_CORE" || return 1
  reject_symlinked_components "$MULTI_HARNESS_CODEX_ROOT" || return 1
  multi_harness_trusted_path "$MULTI_HARNESS_CODEX_CORE" || return 1
  multi_harness_trusted_path "$MULTI_HARNESS_CODEX_ROOT" || return 1
  data_home="${XDG_DATA_HOME:-$HOME/.local/share}"
  codex_home="${CODEX_HOME:-$HOME/.codex}"
  MULTI_HARNESS_GJC_AUTH="$(multi_harness_credential_leaf GJC "$data_home/gjc/auth.json")" || return 1
  MULTI_HARNESS_CODEX_AUTH="$(multi_harness_credential_leaf Codex "$codex_home/auth.json")" || return 1
  MULTI_HARNESS_CLAUDE_AUTH="$(multi_harness_credential_leaf Claude "$HOME/.claude/.credentials.json")" || return 1
}
multi_harness_runtime_available() {
  local entry
  [ "$(uname -s)" = Linux ] || return 1
  for entry in node gjc codex claude bwrap; do command -v "$entry" >/dev/null 2>&1 || return 1; done
  [ -f "${XDG_DATA_HOME:-$HOME/.local/share}/gjc/auth.json" ] &&
    [ -f "${CODEX_HOME:-$HOME/.codex}/auth.json" ] &&
    [ -f "$HOME/.claude/.credentials.json" ]
}
multi_harness_owned_runtime() {
  local root binding runner header
  root="$(multi_harness_runtime)"
  binding="$root/binding"
  runner="$root/runner.mjs"
  reject_symlinked_components "$root" || return 1
  multi_harness_private_directory "$root" 700 &&
    multi_harness_private_file "$runner" 700 &&
    multi_harness_private_file "$binding" 600 || return 1
  IFS= read -r header < "$binding" || return 1
  [ "$header" = multi-harness-research-binding-v1 ]
}
remove_multi_harness_authorization() {
  local parent root binding runner
  root="$(multi_harness_runtime)"
  parent="$(dirname "$root")"
  binding="$root/binding"
  runner="$root/runner.mjs"
  reject_symlinked_components "$parent" || return 1
  if [ -L "$root" ]; then
    rm -f "$root"
    echo "✓ removed stale multi-harness runtime authorization"
    return 0
  fi
  [ -d "$root" ] && [ ! -L "$root" ] && [ -O "$root" ] || return 0
  if [ -f "$binding" ] || [ -L "$binding" ]; then rm -f "$binding"; fi
  if [ -f "$runner" ] || [ -L "$runner" ]; then rm -f "$runner"; fi
  rmdir "$root" 2>/dev/null || true
  echo "✓ removed stale multi-harness runtime authorization"
}
install_multi_harness_runtime() {
  local root parent temp runner binding previous="" runner_digest node_digest gjc_digest codex_digest claude_digest bwrap_digest digest
  root="$(multi_harness_runtime)"
  parent="$(prepare_multi_harness_runtime_parent)" || return 1
  reject_symlinked_components "$root" || return 1
  if [ -e "$root" ] || [ -L "$root" ]; then
    if ! multi_harness_owned_runtime; then
      echo "❌ install FAILED — existing multi-harness runtime is not an owned private binding: $root" >&2
      return 1
    fi
  fi
  temp="$(mktemp -d "$parent/.multi-harness-research.XXXXXX")" || return 1
  if ! chmod 700 "$temp" ||
     ! cp "$PLUGIN_ROOT/bin/multi-harness-research.mjs" "$temp/runner.mjs" ||
     ! chmod 700 "$temp/runner.mjs"; then
    rm -rf "$temp"
    echo "❌ install FAILED — multi-harness runtime staging failed" >&2
    return 1
  fi
  runner="$temp/runner.mjs"
  binding="$temp/binding"
  runner_digest="$(sha256_file "$runner")" || { rm -rf "$temp"; return 1; }
  node_digest="$(sha256_file "$MULTI_HARNESS_NODE")" || { rm -rf "$temp"; return 1; }
  gjc_digest="$(sha256_file "$MULTI_HARNESS_GJC")" || { rm -rf "$temp"; return 1; }
  codex_digest="$(sha256_file "$MULTI_HARNESS_CODEX_CORE")" || { rm -rf "$temp"; return 1; }
  claude_digest="$(sha256_file "$MULTI_HARNESS_CLAUDE")" || { rm -rf "$temp"; return 1; }
  bwrap_digest="$(sha256_file "$MULTI_HARNESS_BWRAP")" || { rm -rf "$temp"; return 1; }
  for digest in "$runner_digest" "$node_digest" "$gjc_digest" "$codex_digest" "$claude_digest" "$bwrap_digest"; do
    [[ "$digest" =~ ^[0-9A-Fa-f]{64}$ ]] || {
      rm -rf "$temp"
      echo "❌ install FAILED — invalid SHA-256 digest for multi-harness binding" >&2
      return 1
    }
  done
  if ! printf '%s\n' \
    "multi-harness-research-binding-v1" \
    "$MULTI_HARNESS_ACCOUNT_HOME" \
    "$runner_digest" \
    "$root/runner.mjs" \
    "$node_digest" \
    "$MULTI_HARNESS_NODE" \
    "$gjc_digest" \
    "$MULTI_HARNESS_GJC" \
    "$codex_digest" \
    "$MULTI_HARNESS_CODEX_CORE" \
    "$MULTI_HARNESS_CODEX_ROOT" \
    "$claude_digest" \
    "$MULTI_HARNESS_CLAUDE" \
    "$bwrap_digest" \
    "$MULTI_HARNESS_BWRAP" \
    "multi-harness-credential-schema-v1" \
    "$MULTI_HARNESS_GJC_AUTH" \
    "$MULTI_HARNESS_CODEX_AUTH" \
    "$MULTI_HARNESS_CLAUDE_AUTH" > "$binding" ||
    ! chmod 600 "$binding" ||
    ! multi_harness_private_directory "$temp" 700 ||
    ! multi_harness_private_file "$runner" 700 ||
    ! multi_harness_private_file "$binding" 600; then
    rm -rf "$temp"
    echo "❌ install FAILED — multi-harness runtime binding staging failed" >&2
    return 1
  fi
  if ! multi_harness_trusted_path "$MULTI_HARNESS_NODE" ||
     ! multi_harness_trusted_path "$MULTI_HARNESS_GJC" ||
     ! multi_harness_trusted_path "$MULTI_HARNESS_CODEX_CORE" ||
     ! multi_harness_trusted_path "$MULTI_HARNESS_CODEX_ROOT" ||
     ! multi_harness_trusted_path "$MULTI_HARNESS_CLAUDE" ||
     ! multi_harness_trusted_path "$MULTI_HARNESS_BWRAP" ||
     [ "$(sha256_file "$runner")" != "$runner_digest" ] ||
     [ "$(sha256_file "$MULTI_HARNESS_NODE")" != "$node_digest" ] ||
     [ "$(sha256_file "$MULTI_HARNESS_GJC")" != "$gjc_digest" ] ||
     [ "$(sha256_file "$MULTI_HARNESS_CODEX_CORE")" != "$codex_digest" ] ||
     [ "$(sha256_file "$MULTI_HARNESS_CLAUDE")" != "$claude_digest" ] ||
     [ "$(sha256_file "$MULTI_HARNESS_BWRAP")" != "$bwrap_digest" ]; then
    rm -rf "$temp"
    echo "❌ install FAILED — multi-harness executable chain changed during binding preparation" >&2
    return 1
  fi
  if [ -e "$root" ]; then
    previous="$(mktemp -d "$parent/.multi-harness-research.previous.XXXXXX")" || { rm -rf "$temp"; return 1; }
    rmdir "$previous"
    if ! mv "$root" "$previous"; then
      rm -rf "$temp"
      echo "❌ install FAILED — multi-harness runtime replacement failed" >&2
      return 1
    fi
  fi
  if ! mv "$temp" "$root"; then
    [ -z "$previous" ] || mv "$previous" "$root"
    rm -rf "$temp"
    echo "❌ install FAILED — cannot atomically publish multi-harness runtime binding" >&2
    return 1
  fi
  [ -z "$previous" ] || rm -rf "$previous"
  echo "✓ bound runtime (user): $root"
}
uninstall_multi_harness_runtime() {
  local root parent binding runner
  root="$(multi_harness_runtime)"
  parent="$(dirname "$root")"
  binding="$root/binding"
  runner="$root/runner.mjs"
  reject_symlinked_components "$parent" || return 1
  if [ -L "$root" ]; then
    rm -f "$root"
    echo "✓ removed stale multi-harness runtime authorization"
    return 0
  fi
  [ -d "$root" ] && [ ! -L "$root" ] && [ -O "$root" ] || return 0
  if ! multi_harness_owned_runtime; then
    remove_multi_harness_authorization
    return 0
  fi
  rm -f "$binding" "$runner"
  rmdir "$root" 2>/dev/null || true
  echo "✓ removed runtime binding: multi-harness-research"
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

cleanup_retired_branchflow_marker() {
  local repo file content replacement backup
  repo="$(git -C "$PWD" rev-parse --show-toplevel 2>/dev/null)" || return 0
  file="$repo/AGENTS.md"
  [ -e "$file" ] || [ -L "$file" ] || return 0
  if [ -L "$file" ] || [ ! -f "$file" ]; then
    echo "! retired branchflow marker cleanup skipped (not a regular file): $file" >&2
    return 0
  fi
  grep -q '<!-- BEGIN oh-my-gjc:branchflow -->' "$file" || return 0
  content="$(mktemp "$file.content.XXXXXX")" || {
    echo "! retired branchflow marker cleanup skipped (temporary file failed): $file" >&2
    return 0
  }
  if ! awk '
    $0 == "<!-- BEGIN oh-my-gjc:branchflow -->" {
      seen++
      if (skip || seen > 1) bad=1
      skip=1
      next
    }
    $0 == "<!-- END oh-my-gjc:branchflow -->" {
      if (!skip) bad=1
      skip=0
      next
    }
    !skip { print }
    END {
      if (!seen || skip || bad) exit 1
    }
  ' "$file" > "$content"; then
    rm -f "$content"
    echo "! retired branchflow marker cleanup skipped (malformed markers): $file" >&2
    return 0
  fi
  backup="$(mktemp "$file.bak-$(date +%s).XXXXXX")" || {
    rm -f "$content"
    echo "! retired branchflow marker backup failed: $file" >&2
    return 0
  }
  if ! cp -p "$file" "$backup"; then
    rm -f "$content" "$backup"
    echo "! retired branchflow marker backup failed: $file" >&2
    return 0
  fi
  replacement="$(mktemp "$file.tmp.XXXXXX")" || {
    rm -f "$content"
    echo "! retired branchflow marker cleanup failed; original preserved: $file" >&2
    return 0
  }
  if cp -p "$file" "$replacement" && cp "$content" "$replacement" && mv -f "$replacement" "$file"; then
    rm -f "$content"
    echo "✓ removed retired branchflow marker from current repository: $file (backup: $backup)"
    echo "! docs/WORKFLOW.md is user-owned and was not removed; review it manually if branch-flow created it." >&2
  else
    rm -f "$content" "$replacement"
    echo "! retired branchflow marker cleanup failed; original preserved: $file" >&2
  fi
}

cleanup_legacy_commands() { # $1=scope — drop pre-0.8.1 leftovers (0.8.0 tombstones + old oh-my-gjc:* aliases)
  local d n removed=0
  d="$(commands_dir "$1")"
  if [ -L "$d" ]; then
    echo "❌ cleanup FAILED — native command directory is a symlink: $d" >&2
    return 1
  fi
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
  if [ -L "$d" ] || [ -L "$sd" ]; then
    echo "❌ cleanup FAILED — native skill/command directory is a symlink" >&2
    return 1
  fi
  for n in "${REMOVED_COMMANDS[@]}"; do
    if [ -f "$d/omg:$n.md" ] || [ -L "$d/omg:$n.md" ] || [ -f "$d/oh-my-gjc:$n.md" ] || [ -L "$d/oh-my-gjc:$n.md" ]; then rm -f "$d/omg:$n.md" "$d/oh-my-gjc:$n.md"; removed=$((removed+1)); fi
  done
  for n in "${REMOVED_SKILLS[@]}"; do
    if [ -d "$sd/$n" ] || [ -L "$sd/$n" ]; then rm -rf "$sd/$n"; removed=$((removed+1)); fi
  done
  if [ "$removed" -gt 0 ]; then echo "✓ cleaned $removed removed-capability native file(s)"; fi
}
cleanup_retired_user_runtime_state() {
  local sdk_parent sdk_root sdk_lock lazy_parent lazy_root lazy_binding lazy_runner receipt marker bound_home

  sdk_parent="$HOME/.gjc/agent/runtimes/oh-my-gjc"
  sdk_root="$sdk_parent/sdk-lab"
  sdk_lock="$sdk_parent/.sdk-lab.lock"
  if reject_symlinked_components "$sdk_parent"; then
    if [ -L "$sdk_root" ]; then
      rm -f "$sdk_root"
      echo "✓ removed retired SDK runtime symlink: time-left"
    elif [ -e "$sdk_root" ]; then
      if multi_harness_private_directory "$sdk_root" 700 &&
         multi_harness_private_file "$sdk_root/package.json" 600 &&
         grep -Fq '"name": "@oh-my-gjc/sdk-lab"' "$sdk_root/package.json"; then
        rm -rf "$sdk_root"
        echo "✓ removed retired SDK runtime: time-left"
      else
        echo "! retired time-left SDK runtime cleanup skipped (not a private suite runtime): $sdk_root" >&2
      fi
    fi
    if [ -L "$sdk_lock" ]; then
      rm -f "$sdk_lock"
      echo "✓ removed retired SDK runtime lock symlink: time-left"
    elif [ -e "$sdk_lock" ]; then
      if multi_harness_private_file "$sdk_lock" 600; then
        rm -f "$sdk_lock"
        echo "✓ removed retired SDK runtime lock: time-left"
      else
        echo "! retired time-left SDK runtime lock cleanup skipped (not a private suite lock): $sdk_lock" >&2
      fi
    fi
  else
    echo "! retired time-left SDK runtime cleanup skipped (symlinked suite runtime parent): $sdk_parent" >&2
  fi

  lazy_parent="$HOME/.gjc/agent/runtimes"
  lazy_root="$lazy_parent/lazycodex-gjc"
  lazy_binding="$lazy_root/binding"
  lazy_runner="$lazy_root/runner.mjs"
  receipt="$HOME/.gjc/agent/receipts/lazycodex-gjc-runner.sha256"
  if reject_symlinked_components "$lazy_parent"; then
    if [ -L "$lazy_root" ]; then
      rm -f "$lazy_root"
      echo "✓ removed retired runtime symlink: lazycodex-gjc"
    elif [ -e "$lazy_root" ]; then
      marker="" bound_home=""
      if multi_harness_private_directory "$lazy_root" 700 &&
         multi_harness_private_file "$lazy_binding" 600 &&
         multi_harness_private_file "$lazy_runner" 700 &&
         { IFS= read -r marker && IFS= read -r bound_home; } < "$lazy_binding" &&
         [ "$marker" = "lazycodex-gjc-binding-v1" ] && [ "$bound_home" = "$HOME" ]; then
        rm -rf "$lazy_root"
        echo "✓ removed retired runtime binding: lazycodex-gjc"
      else
        echo "! retired lazycodex-gjc runtime cleanup skipped (not a private suite binding): $lazy_root" >&2
      fi
    fi
  else
    echo "! retired lazycodex-gjc runtime cleanup skipped (symlinked runtime parent): $lazy_parent" >&2
  fi

  if reject_symlinked_components "$(dirname "$receipt")"; then
    if [ -L "$receipt" ]; then
      rm -f "$receipt"
      echo "✓ removed retired runtime receipt symlink: lazycodex-gjc"
    elif [ -e "$receipt" ]; then
      if multi_harness_private_file "$receipt" 600; then
        rm -f "$receipt"
        echo "✓ removed retired runtime receipt: lazycodex-gjc"
      else
        echo "! retired lazycodex-gjc receipt cleanup skipped (not a private suite receipt): $receipt" >&2
      fi
    fi
  else
    echo "! retired lazycodex-gjc receipt cleanup skipped (symlinked receipt parent): $(dirname "$receipt")" >&2
  fi
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
  for r in "${EXPECTED_RUNTIMES[@]}";   do [ -f "$PLUGIN_ROOT/$r" ] && [ ! -L "$PLUGIN_ROOT/$r" ] || MISSING+=("$r"); done
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
    prepare_native_surface_paths "$scope" verify
    if [ "$target" = "all" ]; then
      for s in "${EXPECTED_SKILLS[@]}";     do uninstall_skill     "$s" "$scope"; done
      for c in "${EXPECTED_COMMANDS[@]}";   do uninstall_command   "$c" "$scope"; done
      cleanup_legacy_commands "$scope"
      cleanup_removed "$scope"
      if [ "$scope" = "user" ]; then cleanup_retired_user_runtime_state; uninstall_multi_harness_runtime; fi
      uninstall_suite_root_binding "$scope"
      if [ "$scope" = "user" ]; then cleanup_removed_easy_markers; fi
      cleanup_retired_branchflow_marker
    else
      if [ "$target" = "multi-harness-research" ] || [ "$target" = "multi-harness" ]; then
        uninstall_skill multi-harness-research "$scope"
        uninstall_command multi-harness "$scope"
        if [ "$scope" = "user" ]; then uninstall_multi_harness_runtime; fi
      else
        if [ -d "$PLUGIN_ROOT/skills/$target" ];       then uninstall_skill   "$target" "$scope"; fi
        if [ -f "$PLUGIN_ROOT/templates/$target.md" ]; then uninstall_command "$target" "$scope"; fi
      fi
    fi
    ;;
  user|project)
    [ "$#" -le 1 ] || usage
    prepare_native_surface_paths "$mode" create
    if [ "$target" = "all" ]; then
      preflight_all
      if [ "$mode" = "user" ]; then
        if { [ -e "$(multi_harness_runtime)" ] || [ -L "$(multi_harness_runtime)" ]; } && ! multi_harness_owned_runtime; then
          echo "! removing stale unsafe multi-harness runtime authorization before availability checks" >&2
          remove_multi_harness_authorization || echo "! stale multi-harness authorization could not be removed safely" >&2
        fi
        if multi_harness_runtime_available && prepare_multi_harness_runtime; then
          install_multi_harness_runtime
        else
          echo "! multi-harness runtime not bound (Linux, bwrap, Node, GJC, Codex, Claude, or exact private credential files missing/unsafe) — /omg:multi-harness remains disabled fail-closed; no provider installation or login was attempted." >&2
          remove_multi_harness_authorization || echo "! stale multi-harness authorization could not be removed safely" >&2
        fi
      fi
      install_suite_root_binding "$mode"
      for s in "${EXPECTED_SKILLS[@]}";     do install_skill     "$s" "$mode"; done
      for c in "${EXPECTED_COMMANDS[@]}";   do install_command   "$c" "$mode"; done
      cleanup_legacy_commands "$mode"
      cleanup_removed "$mode"
      if [ "$mode" = "user" ]; then cleanup_retired_user_runtime_state; cleanup_removed_easy_markers; fi
      cleanup_retired_branchflow_marker
      report_missing
    else
      if [ "$target" = "multi-harness-research" ] || [ "$target" = "multi-harness" ]; then
        for r in bin/multi-harness-research.mjs skills/multi-harness-research/SKILL.md templates/multi-harness.md; do
          [ -f "$PLUGIN_ROOT/$r" ] && [ ! -L "$PLUGIN_ROOT/$r" ] || MISSING+=("$r")
        done
        report_missing
        if [ "$mode" = "user" ]; then
          prepare_multi_harness_runtime
          install_multi_harness_runtime
        else
          echo "! project multi-harness surfaces installed; execution remains disabled without the private user-scope runtime binding" >&2
        fi
      fi
      install_suite_root_binding "$mode"
      if [ "$target" = "multi-harness-research" ] || [ "$target" = "multi-harness" ]; then
        install_skill multi-harness-research "$mode"
        install_command multi-harness "$mode"
      else
        if [ -d "$PLUGIN_ROOT/skills/$target" ];       then install_skill   "$target" "$mode"; fi
        if [ -f "$PLUGIN_ROOT/templates/$target.md" ]; then install_command "$target" "$mode"; fi
      fi
      report_missing
    fi
    if [ "$mode" = "user" ]; then
      echo "  → adaptive-response, no-english, and multi-harness-research require their explicit /omg:* commands; other skills keep their documented triggers."
      echo "  → open a NEW gjc session (or run /move .) to load newly installed commands. Re-run after upgrades."
    else
      echo "  → installed for this repo. A new gjc session in this dir will pick them up."
    fi
    ;;
  *)
    usage ;;
esac
