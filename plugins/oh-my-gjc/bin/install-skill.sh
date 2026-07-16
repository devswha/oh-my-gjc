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
EXPECTED_SKILLS=(adaptive-response no-english time-left extragoal insane-review lazycodex-gjc)
EXPECTED_COMMANDS=(omg setup gate gate-always no-english time-left fable insane-review lazycodex-gjc)
EXPECTED_RUNTIMES=(bin/lazycodex-gjc.mjs tools/sdk-lab/package.json tools/sdk-lab/bun.lock tools/sdk-lab/src/inspect.ts tools/sdk-lab/src/eta.ts)
# Capabilities REMOVED (관제탑 발주, 하코 승인). 0.11.0: codex-deepwork(실사용 0회, lazycodex와 중복) +
# codex-app 짝(대상 앱 빌드 트랙 07-03 아카이브; Pro 리뷰는 insane-review 전담). 0.12.0: codex-cli-ask·
# lazycodex·tower(명시 호출 0 — Codex 트래픽은 전량 제품 파이프라인 codex exec 직결로 스킬 미경유,
# lazycodex 하니스 발원 세션 0건, 실관제탑은 자체 스크립트 구현이라 tower 스킬 미사용).
# 0.12.0: obsolete control/worker surfaces; 0.14.0: gajae-app ownership transfer.
# Post-v0.17.1 prune: multivendor-presets, release-gate, easy-answer, plain-layer,
# branch-flow/worktree, and public gjc-bugwatch. lazycodex-gjc remains supported.
# gate-briefing was renamed to adaptive-response, korean-first to no-english, and workflow-eta to time-left;
# upgrades remove retired native directories.
# Upgrades sweep only their native skill/command files plus explicitly owned retired state.
REMOVED_SKILLS=(gate-briefing korean-first workflow-eta codex-deepwork codex-app-launch codex-app-cdp codex-cli-ask lazycodex tower worktree gajae-app multivendor-presets release-gate easy-answer plain-layer branch-flow gjc-bugwatch)
REMOVED_COMMANDS=(codex-run codex-app-launch codex-app-ask codex-ask lazycodex-setup lazycodex-work tower-setup gajae-app presets release easy easy-always plain branchflow-always worktree bugwatch-scan)
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
runner_runtime() { echo "$HOME/.gjc/agent/runtimes/lazycodex-gjc"; }
sdk_runtime() { printf '%s/sdk-lab\n' "$(suite_runtime_dir "$1")"; }
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
prepare_lazy_runtime_parent() {
  local parent="$HOME/.gjc/agent/runtimes"
  reject_symlinked_components "$parent" || return 1
  mkdir -p "$parent" || {
    echo "❌ install FAILED — cannot create LazyCodex runtime parent: $parent" >&2
    return 1
  }
  reject_symlinked_components "$parent" || return 1
  if [ ! -d "$parent" ] || [ -L "$parent" ]; then
    echo "❌ install FAILED — LazyCodex runtime parent is not a real directory: $parent" >&2
    return 1
  fi
  if [ ! -O "$parent" ]; then
    echo "❌ install FAILED — LazyCodex runtime parent is not owned by the current user: $parent" >&2
    return 1
  fi
  if ! chmod 700 "$parent" || [ -n "$(find "$parent" -maxdepth 0 -perm /077)" ]; then
    echo "❌ install FAILED — LazyCodex runtime parent is not private: $parent" >&2
    return 1
  fi
  printf '%s\n' "$parent"
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

sdk_runtime_requested() {
  local value
  value="${OMG_TIME_LEFT_RUNTIME:-${OMG_WORKFLOW_ETA_RUNTIME:-1}}"
  case "$value" in
    1) return 0 ;;
    0) return 1 ;;
    *) echo "❌ OMG_TIME_LEFT_RUNTIME must be 0 or 1" >&2; exit 2 ;;
  esac
}

sdk_runtime_available() {
  local version major minor patch
  command -v bun >/dev/null 2>&1 || return 1
  command -v flock >/dev/null 2>&1 || return 1
  version="$(bun --version 2>/dev/null)" || return 1
  IFS=. read -r major minor patch <<<"$version"
  case "$major:$minor:$patch" in
    *[!0-9:]*|::*|*::) return 1 ;;
  esac
  [ "$major" -gt 1 ] || {
    [ "$major" -eq 1 ] && { [ "$minor" -gt 3 ] || { [ "$minor" -eq 3 ] && [ "$patch" -ge 14 ]; }; }
  }
}

prepare_sdk_runtime() ( # $1=scope — exact bridge-client lock, scripts disabled, serialized private publication
  local scope="$1" parent root temp previous="" lock
  parent="$(prepare_suite_runtime_parent "$scope")" || return 1
  if [ ! -O "$parent" ] || ! chmod 700 "$parent" || [ -n "$(find "$parent" -maxdepth 0 -perm /077)" ]; then
    echo "❌ time-left SDK runtime parent is not current-user private: $parent" >&2
    return 1
  fi
  root="$(sdk_runtime "$scope")"
  lock="$parent/.sdk-lab.lock"
  if [ -L "$lock" ] || { [ -e "$lock" ] && [ ! -f "$lock" ]; }; then
    echo "❌ time-left SDK runtime lock is malformed: $lock" >&2
    return 1
  fi
  : >>"$lock"
  chmod 600 "$lock"
  [ -O "$lock" ] || { echo "❌ time-left SDK runtime lock is not owned by the current user: $lock" >&2; return 1; }
  exec 9<>"$lock"
  flock -x 9 || return 1
  reject_symlinked_components "$root" || return 1
  if [ -e "$root" ] && { [ ! -d "$root" ] || [ -L "$root" ]; }; then
    echo "❌ time-left SDK runtime is malformed: $root" >&2
    return 1
  fi
  temp="$(mktemp -d "$parent/.sdk-lab.XXXXXX")" || return 1
  chmod 700 "$temp"
  mkdir -p "$temp/src"
  chmod 700 "$temp/src"
  if ! cp "$PLUGIN_ROOT/tools/sdk-lab/package.json" "$PLUGIN_ROOT/tools/sdk-lab/bun.lock" "$temp/" ||
     ! cp "$PLUGIN_ROOT/tools/sdk-lab/src/inspect.ts" "$PLUGIN_ROOT/tools/sdk-lab/src/eta.ts" "$temp/src/" ||
     ! chmod 600 "$temp/package.json" "$temp/bun.lock" "$temp/src/inspect.ts" "$temp/src/eta.ts"; then
    rm -rf "$temp"
    echo "❌ time-left SDK runtime staging failed" >&2
    return 1
  fi
  if ! (cd "$temp" && bun install --frozen-lockfile --production --ignore-scripts >/dev/null); then
    rm -rf "$temp"
    echo "❌ time-left SDK dependency install failed" >&2
    return 1
  fi
  if [ ! -f "$temp/node_modules/@gajae-code/bridge-client/package.json" ] ||
     ! (cd "$temp" && bun -e '
       const pkg = await Bun.file("node_modules/@gajae-code/bridge-client/package.json").json();
       if (pkg.name !== "@gajae-code/bridge-client" || pkg.version !== "0.11.0") process.exit(1);
     '); then
    rm -rf "$temp"
    echo "❌ time-left SDK dependency verification failed" >&2
    return 1
  fi
  if [ -e "$root" ]; then
    previous="$(mktemp -d "$parent/.sdk-lab.previous.XXXXXX")" || { rm -rf "$temp"; return 1; }
    rmdir "$previous"
    if ! mv "$root" "$previous"; then
      rm -rf "$temp"
      echo "❌ time-left SDK runtime replacement failed" >&2
      return 1
    fi
  fi
  if ! mv "$temp" "$root"; then
    [ -z "$previous" ] || mv "$previous" "$root"
    rm -rf "$temp"
    echo "❌ time-left SDK runtime publication failed" >&2
    return 1
  fi
  [ -z "$previous" ] || rm -rf "$previous"
  echo "✓ bound SDK runtime ($scope): $root"
)

uninstall_sdk_runtime() ( # $1=scope
  local parent root lock
  parent="$(prepare_suite_runtime_parent "$1")" || return 1
  if [ ! -O "$parent" ] || ! chmod 700 "$parent" || [ -n "$(find "$parent" -maxdepth 0 -perm /077)" ]; then
    echo "❌ uninstall FAILED — time-left SDK runtime parent is not current-user private: $parent" >&2
    return 1
  fi
  lock="$parent/.sdk-lab.lock"
  if [ -L "$lock" ] || { [ -e "$lock" ] && [ ! -f "$lock" ]; }; then
    echo "❌ uninstall FAILED — time-left SDK runtime lock is malformed: $lock" >&2
    return 1
  fi
  : >>"$lock"
  chmod 600 "$lock"
  [ -O "$lock" ] || { echo "❌ uninstall FAILED — time-left SDK runtime lock is not owned by the current user: $lock" >&2; return 1; }
  exec 9<>"$lock"
  flock -x 9 || return 1
  root="$(sdk_runtime "$1")"
  reject_symlinked_components "$root" || return 1
  if [ -L "$root" ] || { [ -e "$root" ] && [ ! -d "$root" ]; }; then
    echo "❌ uninstall FAILED — time-left SDK runtime is malformed: $root" >&2
    return 1
  fi
  rm -rf "$root"
  echo "✓ removed SDK runtime: time-left ($1)"
)

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'; return; fi
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}'; return; fi
  if command -v openssl >/dev/null 2>&1; then openssl dgst -sha256 "$1" | awk '{print $NF}'; return; fi
  echo "❌ install FAILED — SHA-256 tool unavailable for lazycodex-gjc receipt" >&2
  return 1
}

# The runner's trust walk (trustedFile/trustedDirectory in bin/lazycodex-gjc.mjs) rejects any
# group/other-writable component on a binding-pinned path. A default umask of 002 (Ubuntu UPG)
# leaves self-owned npm/Codex dirs 0775, so a fresh install would fail closed at runtime
# (exit 78: trusted runtime binding mismatch). Normalize self-owned components at install time
# and fail the install with the offending path when normalization is impossible.
# This lane is Linux-only (systemd containment is mandatory), so GNU `find -perm /NNN` is safe.
normalize_trusted_path() { # $1=absolute canonical path pinned by the runtime binding
  local current="$1"
  while :; do
    if [ -n "$(find "$current" -maxdepth 0 -perm /022 2>/dev/null)" ]; then
      if [ -O "$current" ]; then
        chmod g-w,o-w "$current"
        echo "✓ normalized trusted runtime path mode: $current"
      fi
      if [ -n "$(find "$current" -maxdepth 0 -perm /022 2>/dev/null)" ]; then
        echo "❌ install FAILED — group/other-writable trusted runtime path for lazycodex-gjc: $current (fix: chmod g-w,o-w '$current')" >&2
        exit 1
      fi
    fi
    # Mirror the runner's walk: stop at the first self-owned private directory, else climb to /.
    if [ -d "$current" ] && [ -O "$current" ] && [ -z "$(find "$current" -maxdepth 0 -perm /077 2>/dev/null)" ]; then break; fi
    if [ "$current" = "/" ]; then break; fi
    current="$(dirname "$current")"
  done
}

# Non-fatal availability probe for the `all` path: the suite must install for users
# WITHOUT Codex (the other capabilities have no external prerequisites). When any
# lazycodex-gjc runtime prerequisite is ABSENT, `all` skips the binding — the runner
# fails closed without a binding, so the bridge stays dead-until-bound. A PRESENT but
# broken runtime still hard-fails inside prepare_runtime_binding (real error, surface it).
# A targeted lazycodex-gjc install remains hard-failing; user repair runs the hardened root install.sh.
lazycodex_runtime_available() {
  local entry
  for entry in node codex systemd-run systemctl env; do command -v "$entry" >/dev/null 2>&1 || return 1; done
  [ -d "$(readlink -f "${CODEX_HOME:-$HOME/.codex}" 2>/dev/null)" ] || return 1
}

RUNTIME_NODE="" RUNTIME_CORE="" RUNTIME_CODEX_PATH="" RUNTIME_CODEX_HOME=""
RUNTIME_SYSTEMD_RUN="" RUNTIME_SYSTEMCTL="" RUNTIME_ENV=""
prepare_runtime_binding() {
  local codex entry details
  command -v node >/dev/null 2>&1 || { echo "❌ install FAILED — node is required for lazycodex-gjc" >&2; exit 1; }
  command -v codex >/dev/null 2>&1 || { echo "❌ install FAILED — an existing Codex CLI is required for lazycodex-gjc" >&2; exit 1; }
  for entry in systemd-run systemctl env; do command -v "$entry" >/dev/null 2>&1 || { echo "❌ install FAILED — $entry is required for lazycodex-gjc containment" >&2; exit 1; }; done
  RUNTIME_NODE="$(readlink -f "$(command -v node)")"
  codex="$(readlink -f "$(command -v codex)")"
  details="$("$RUNTIME_NODE" - "$codex" <<'NODE'
const { basename, dirname, join, resolve } = require("node:path");
const { readdirSync, realpathSync, statSync } = require("node:fs");
const binary = realpathSync(process.argv[2]);
const packages = { "linux:x64": "codex-linux-x64", "linux:arm64": "codex-linux-arm64", "darwin:x64": "codex-darwin-x64", "darwin:arm64": "codex-darwin-arm64", "win32:x64": "codex-win32-x64", "win32:arm64": "codex-win32-arm64" };
let core = binary;
let codexPath = dirname(binary);
if (basename(binary) === "codex.js") {
  const packageName = packages[`${process.platform}:${process.arch}`];
  if (packageName === undefined) process.exit(1);
  const vendor = join(resolve(dirname(binary), ".."), "node_modules/@openai", packageName, "vendor");
  const target = readdirSync(vendor).find((name) => statSync(join(vendor, name)).isDirectory());
  if (target === undefined) process.exit(1);
  core = realpathSync(join(vendor, target, "bin", process.platform === "win32" ? "codex.exe" : "codex"));
  codexPath = realpathSync(join(vendor, target, "codex-path"));
}
process.stdout.write(`${core}\n${codexPath}\n`);
NODE
)" || { echo "❌ install FAILED — compatible native Codex runtime not found" >&2; exit 1; }
  RUNTIME_CORE="$(printf '%s\n' "$details" | sed -n '1p')"
  RUNTIME_CODEX_PATH="$(printf '%s\n' "$details" | sed -n '2p')"
  RUNTIME_CODEX_HOME="$(readlink -f "${CODEX_HOME:-$HOME/.codex}")"
  RUNTIME_SYSTEMD_RUN="$(readlink -f "$(command -v systemd-run)")"
  RUNTIME_SYSTEMCTL="$(readlink -f "$(command -v systemctl)")"
  RUNTIME_ENV="$(readlink -f "$(command -v env)")"
  for entry in "$RUNTIME_NODE" "$RUNTIME_CORE" "$RUNTIME_SYSTEMD_RUN" "$RUNTIME_SYSTEMCTL" "$RUNTIME_ENV"; do [ -f "$entry" ] && [ ! -L "$entry" ] || { echo "❌ install FAILED — trusted runtime file unavailable: $entry" >&2; exit 1; }; done
  [ -d "$RUNTIME_CODEX_PATH" ] && [ -d "$RUNTIME_CODEX_HOME" ] || { echo "❌ install FAILED — Codex runtime/home unavailable" >&2; exit 1; }
  for entry in "$RUNTIME_NODE" "$RUNTIME_CORE" "$RUNTIME_CODEX_PATH" "$RUNTIME_CODEX_HOME" "$RUNTIME_SYSTEMD_RUN" "$RUNTIME_SYSTEMCTL" "$RUNTIME_ENV"; do normalize_trusted_path "$entry"; done
  if [ -f "$RUNTIME_CODEX_HOME/auth.json" ] && [ -O "$RUNTIME_CODEX_HOME/auth.json" ]; then chmod 600 "$RUNTIME_CODEX_HOME/auth.json"; fi
}

install_runtime_binding() {
  local root parent temp runner binding runner_digest node_digest core_digest systemd_run_digest systemctl_digest env_digest digest previous receipt receipt_parent
  root="$(runner_runtime)"
  parent="$(prepare_lazy_runtime_parent)" || return 1
  reject_symlinked_components "$root" || return 1
  receipt="$HOME/.gjc/agent/receipts/lazycodex-gjc-runner.sha256"
  receipt_parent="$(dirname "$receipt")"
  reject_symlinked_components "$receipt_parent" || return 1
  if [ -e "$receipt" ] && [ ! -f "$receipt" ] && [ ! -L "$receipt" ]; then
    echo "❌ install FAILED — LazyCodex legacy receipt is not a file: $receipt" >&2
    return 1
  fi
  temp="$(mktemp -d "$parent/.lazycodex-gjc.XXXXXX")"; chmod 700 "$temp"
  runner="$temp/runner.mjs"; cp "$PLUGIN_ROOT/bin/lazycodex-gjc.mjs" "$runner"; chmod 700 "$runner"
  binding="$temp/binding"
  runner_digest="$(sha256_file "$runner")" || { rm -rf "$temp"; return 1; }
  node_digest="$(sha256_file "$RUNTIME_NODE")" || { rm -rf "$temp"; return 1; }
  core_digest="$(sha256_file "$RUNTIME_CORE")" || { rm -rf "$temp"; return 1; }
  systemd_run_digest="$(sha256_file "$RUNTIME_SYSTEMD_RUN")" || { rm -rf "$temp"; return 1; }
  systemctl_digest="$(sha256_file "$RUNTIME_SYSTEMCTL")" || { rm -rf "$temp"; return 1; }
  env_digest="$(sha256_file "$RUNTIME_ENV")" || { rm -rf "$temp"; return 1; }
  for digest in "$runner_digest" "$node_digest" "$core_digest" "$systemd_run_digest" "$systemctl_digest" "$env_digest"; do
    [[ "$digest" =~ ^[0-9A-Fa-f]{64}$ ]] || {
      rm -rf "$temp"
      echo "❌ install FAILED — invalid SHA-256 digest for lazycodex-gjc binding" >&2
      return 1
    }
  done
  if ! printf '%s\n' \
    "lazycodex-gjc-binding-v1" \
    "$HOME" \
    "$runner_digest" \
    "$root/runner.mjs" \
    "$node_digest" \
    "$RUNTIME_NODE" \
    "$core_digest" \
    "$RUNTIME_CORE" \
    "$RUNTIME_CODEX_PATH" \
    "$RUNTIME_CODEX_HOME" \
    "$systemd_run_digest" \
    "$RUNTIME_SYSTEMD_RUN" \
    "$systemctl_digest" \
    "$RUNTIME_SYSTEMCTL" \
    "$env_digest" \
    "$RUNTIME_ENV" > "$binding"; then
    rm -rf "$temp"
    echo "❌ install FAILED — cannot write lazycodex-gjc binding" >&2
    return 1
  fi
  chmod 600 "$binding"
  previous=""
  if [ -e "$root" ] || [ -L "$root" ]; then
    previous="$(mktemp -d "$parent/.lazycodex-gjc.previous.XXXXXX")"
    rmdir "$previous"
    mv "$root" "$previous"
  fi
  if mv "$temp" "$root"; then
    [ -z "$previous" ] || rm -rf "$previous"
  else
    [ -z "$previous" ] || mv "$previous" "$root"
    rm -rf "$temp"
    echo "❌ install FAILED — cannot atomically install lazycodex-gjc binding" >&2
    return 1
  fi
  rm -f "$receipt"
  echo "✓ bound runtime (user): $root"
}

uninstall_runtime_binding() {
  local root receipt receipt_parent
  root="$(runner_runtime)"
  reject_symlinked_components "$root" || return 1
  receipt="$HOME/.gjc/agent/receipts/lazycodex-gjc-runner.sha256"
  receipt_parent="$(dirname "$receipt")"
  reject_symlinked_components "$receipt_parent" || return 1
  if [ -e "$receipt" ] && [ ! -f "$receipt" ] && [ ! -L "$receipt" ]; then
    echo "❌ uninstall FAILED — LazyCodex legacy receipt is not a file: $receipt" >&2
    return 1
  fi
  rm -rf "$root"
  rm -f "$receipt"
  echo "✓ removed runtime binding: lazycodex-gjc"
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
    if [ "$target" = "all" ]; then
      for s in "${EXPECTED_SKILLS[@]}";     do uninstall_skill     "$s" "$scope"; done
      for c in "${EXPECTED_COMMANDS[@]}";   do uninstall_command   "$c" "$scope"; done
      cleanup_legacy_commands "$scope"
      cleanup_removed "$scope"
      if [ "$scope" = "user" ]; then uninstall_sdk_runtime user; fi
      uninstall_suite_root_binding "$scope"
      if [ "$scope" = "user" ]; then uninstall_runtime_binding; cleanup_removed_easy_markers; fi
      cleanup_retired_branchflow_marker
    else
      if [ -d "$PLUGIN_ROOT/skills/$target" ];       then uninstall_skill   "$target" "$scope"; fi
      if [ -f "$PLUGIN_ROOT/templates/$target.md" ]; then uninstall_command "$target" "$scope"; fi
      if [ "$target" = "lazycodex-gjc" ] && [ "$scope" = "user" ]; then uninstall_runtime_binding; fi
      if [ "$target" = "time-left" ] && [ "$scope" = "user" ]; then uninstall_sdk_runtime user; fi
    fi
    ;;
  user|project)
    [ "$#" -le 1 ] || usage
    if [ "$target" = "all" ]; then
      preflight_all
      LAZYCODEX_BIND=0

      if [ "$mode" = "user" ]; then
        if lazycodex_runtime_available; then
          prepare_runtime_binding
          LAZYCODEX_BIND=1
        else
          echo "! lazycodex-gjc runtime not bound (Codex CLI / systemd / Codex home missing) — bridge disabled fail-closed. After installing and logging in to Codex, rerun the hardened root installer." >&2
          if [ -e "$(runner_runtime)" ] || [ -L "$(runner_runtime)" ]; then uninstall_runtime_binding; fi
        fi
      fi
      if [ "$mode" = "user" ]; then
        if ! sdk_runtime_requested; then
          echo "! time-left SDK runtime disabled by OMG_TIME_LEFT_RUNTIME=0 — skill remains installed but fails closed." >&2
          if [ -e "$(sdk_runtime user)" ] || [ -L "$(sdk_runtime user)" ]; then uninstall_sdk_runtime user; fi
        elif sdk_runtime_available; then
          if ! prepare_sdk_runtime user; then
            if [ -e "$(sdk_runtime user)" ]; then
              echo "❌ time-left SDK refresh failed; prior runtime and native surfaces were preserved" >&2
              exit 1
            fi
            echo "! time-left SDK runtime not bound — skill remains installed but fails closed. Rerun the hardened installer with Bun >=1.3.14 and npm access." >&2
          fi
        else
          echo "! time-left SDK runtime not bound (Bun >=1.3.14 or flock missing) — skill remains installed but fails closed." >&2
          if [ -e "$(sdk_runtime user)" ] || [ -L "$(sdk_runtime user)" ]; then uninstall_sdk_runtime user; fi
        fi
      fi
      install_suite_root_binding "$mode"
      for s in "${EXPECTED_SKILLS[@]}";     do install_skill     "$s" "$mode"; done
      for c in "${EXPECTED_COMMANDS[@]}";   do install_command   "$c" "$mode"; done
      if [ "$LAZYCODEX_BIND" = 1 ]; then install_runtime_binding; fi
      cleanup_legacy_commands "$mode"
      cleanup_removed "$mode"
      if [ "$mode" = "user" ]; then cleanup_removed_easy_markers; fi
      cleanup_retired_branchflow_marker
      report_missing
    else
      if [ "$target" = "lazycodex-gjc" ]; then
        [ -f "$PLUGIN_ROOT/bin/lazycodex-gjc.mjs" ] && [ ! -L "$PLUGIN_ROOT/bin/lazycodex-gjc.mjs" ] || MISSING+=("bin/lazycodex-gjc.mjs")
        report_missing
        if [ "$mode" = "user" ]; then prepare_runtime_binding; fi
      fi
      if [ "$target" = "time-left" ]; then
        for r in tools/sdk-lab/package.json tools/sdk-lab/bun.lock tools/sdk-lab/src/inspect.ts tools/sdk-lab/src/eta.ts; do
          [ -f "$PLUGIN_ROOT/$r" ] && [ ! -L "$PLUGIN_ROOT/$r" ] || MISSING+=("$r")
        done
        report_missing
        if [ "$mode" = "user" ]; then
          sdk_runtime_requested || { echo "❌ targeted time-left install cannot disable its SDK runtime" >&2; exit 1; }
          sdk_runtime_available || { echo "❌ time-left requires Bun >=1.3.14 and flock" >&2; exit 1; }
          prepare_sdk_runtime user
        else
          echo "! project time-left skill installed; its executable SDK runtime is user-scope only" >&2
        fi
        old_skill="$(skills_dir "$mode")/workflow-eta"
        if [ -e "$old_skill" ] || [ -L "$old_skill" ]; then
          uninstall_skill workflow-eta "$mode"
        fi
      fi
      install_suite_root_binding "$mode"
      if [ -d "$PLUGIN_ROOT/skills/$target" ];       then install_skill   "$target" "$mode"; fi
      if [ -f "$PLUGIN_ROOT/templates/$target.md" ]; then install_command "$target" "$mode"; fi
      if [ "$target" = "lazycodex-gjc" ] && [ "$mode" = "user" ]; then install_runtime_binding; fi
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
