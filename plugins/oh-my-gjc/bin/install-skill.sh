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
EXPECTED_SKILLS=(easy-answer gate-briefing multivendor-presets branch-flow extragoal \
                 insane-review gjc-bugwatch plain-layer lazycodex-gjc release-gate)
EXPECTED_COMMANDS=(omg setup easy easy-always gate gate-always presets fable branchflow-always \
                   insane-review bugwatch-scan worktree plain lazycodex-gjc release)
EXPECTED_RUNTIMES=(bin/lazycodex-gjc.mjs)
# Capabilities REMOVED (관제탑 발주, 하코 승인). 0.11.0: codex-deepwork(실사용 0회, lazycodex와 중복) +
# codex-app 짝(대상 앱 빌드 트랙 07-03 아카이브; Pro 리뷰는 insane-review 전담). 0.12.0: codex-cli-ask·
# lazycodex·tower(명시 호출 0 — Codex 트래픽은 전량 제품 파이프라인 codex exec 직결로 스킬 미경유,
# lazycodex 하니스 발원 세션 0건, 실관제탑은 자체 스크립트 구현이라 tower 스킬 미사용).
# 0.12.0 추가: worktree 스킬은 branch-flow로 흡수(중복 트리거·축약복제 드리프트 정리) —
# /omg:worktree 커맨드는 유지(EXPECTED_COMMANDS 그대로), skill dir만 REMOVED_SKILLS로 스윕.
# 0.14.0: gajae-app ownership transferred to the separate claudecodeui repository. Upgrades
# remove only its native skill and command entries; app checkout, service, data, env, logs,
# and Tailscale/network state are outside this installer and remain untouched.
# Upgrades sweep their native files so no orphan surface remains.
REMOVED_SKILLS=(codex-deepwork codex-app-launch codex-app-cdp codex-cli-ask lazycodex tower worktree gajae-app)
REMOVED_COMMANDS=(codex-run codex-app-launch codex-app-ask codex-ask lazycodex-setup lazycodex-work tower-setup gajae-app)
# lazycodex-gjc is a distinct isolated bridge; it does not restore the removed lazycodex setup/work surface.
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
  local root parent temp runner binding
  root="$(runner_runtime)"; parent="$(dirname "$root")"
  mkdir -p "$parent"; chmod 700 "$parent"
  temp="$(mktemp -d "$parent/.lazycodex-gjc.XXXXXX")"; chmod 700 "$temp"
  runner="$temp/runner.mjs"; cp "$PLUGIN_ROOT/bin/lazycodex-gjc.mjs" "$runner"; chmod 700 "$runner"
  binding="$temp/binding"
  printf '%s\n' \
    "lazycodex-gjc-binding-v1" \
    "$HOME" \
    "$(sha256_file "$runner")" \
    "$root/runner.mjs" \
    "$(sha256_file "$RUNTIME_NODE")" \
    "$RUNTIME_NODE" \
    "$(sha256_file "$RUNTIME_CORE")" \
    "$RUNTIME_CORE" \
    "$RUNTIME_CODEX_PATH" \
    "$RUNTIME_CODEX_HOME" \
    "$(sha256_file "$RUNTIME_SYSTEMD_RUN")" \
    "$RUNTIME_SYSTEMD_RUN" \
    "$(sha256_file "$RUNTIME_SYSTEMCTL")" \
    "$RUNTIME_SYSTEMCTL" \
    "$(sha256_file "$RUNTIME_ENV")" \
    "$RUNTIME_ENV" > "$binding"
  chmod 600 "$binding"
  rm -rf "$root"; mv "$temp" "$root"
  rm -f "$HOME/.gjc/agent/receipts/lazycodex-gjc-runner.sha256"
  echo "✓ bound runtime (user): $root"
}

uninstall_runtime_binding() {
  rm -rf "$(runner_runtime)"
  rm -f "$HOME/.gjc/agent/receipts/lazycodex-gjc-runner.sha256"
  echo "✓ removed runtime binding: lazycodex-gjc"
}

cleanup_legacy_commands() { # $1=scope — drop pre-0.8.1 leftovers (0.8.0 tombstones + old oh-my-gjc:* aliases)
  local d n removed=0
  d="$(commands_dir "$1")"
  for n in "${LEGACY_COMMANDS[@]}"; do
    if [ -f "$d/$n.md" ]; then rm -f "$d/$n.md"; removed=$((removed+1)); fi
  done
  for n in "${EXPECTED_COMMANDS[@]}"; do
    if [ -f "$d/oh-my-gjc:$n.md" ]; then rm -f "$d/oh-my-gjc:$n.md"; removed=$((removed+1)); fi
  done
  if [ "$removed" -gt 0 ]; then echo "✓ cleaned $removed legacy command file(s) (pre-0.8.1 tombstones/aliases)"; fi
}

cleanup_removed() { # $1=scope — sweep only native files of capabilities removed from the suite (through 0.14.0)
  local d sd n removed=0
  d="$(commands_dir "$1")"; sd="$(skills_dir "$1")"
  for n in "${REMOVED_COMMANDS[@]}"; do
    if [ -f "$d/omg:$n.md" ] || [ -f "$d/oh-my-gjc:$n.md" ]; then rm -f "$d/omg:$n.md" "$d/oh-my-gjc:$n.md"; removed=$((removed+1)); fi
  done
  for n in "${REMOVED_SKILLS[@]}"; do
    if [ -d "$sd/$n" ]; then rm -rf "$sd/$n"; removed=$((removed+1)); fi
  done
  if [ "$removed" -gt 0 ]; then echo "✓ cleaned $removed removed-capability native file(s) (0.11.0–0.12.0 removals; gajae-app ownership transfer 0.14.0)"; fi
}

# ── Install-time preset merge (v0.17.0, 하코 지시 2026-07-14) ──────────────────────────
# A fresh machine must see the custom `sol` profile in the model-preset picker right after
# install — without running /omg:presets first. Same merge safety contract as the command:
# name-scoped (ONLY the `sol` block), backup first, never touch other profiles or top-level
# keys, validate against the live gjc profile registry, restore the backup on ANY failure.
# NON-FATAL by construction (v0.17.0 cross-review r1): the whole body runs in a SUBSHELL
# with errexit/pipefail disabled, every step self-checks, the merged result is built in a
# temp file and moved into place in one write, and the registry probe is time-bounded —
# no failure in here may abort or hang the installer (the suite install is already
# complete when this runs). Consent-gated retired-preset cleanup stays in /omg:presets
# ONLY — this function never deletes anything.
merge_sol_preset() ( # user scope only — models.yml is user-global; body = subshell
  set +e +u +o pipefail
  warn() { echo "! $*" >&2; }
  src="$PLUGIN_ROOT/references/presets.yml"
  dst="$HOME/.gjc/agent/models.yml"
  [ -f "$src" ] || { warn "preset merge skipped: references/presets.yml missing — run /omg:presets later"; return 0; }
  command -v gjc >/dev/null 2>&1 || { warn "preset merge skipped: gjc not on PATH — run /omg:presets later"; return 0; }
  # canonical sol block = everything below `profiles:` (the canonical source is sol-only since v0.10)
  block="$(awk 'f; /^profiles:$/ {f=1}' "$src" 2>/dev/null)"
  extract_rc=$?
  [ "$extract_rc" -eq 0 ] && [ -n "$block" ] || { warn "preset merge skipped: could not extract sol block — run /omg:presets later"; return 0; }
  mkdir -p "$(dirname "$dst")" 2>/dev/null || { warn "preset merge skipped: cannot create $(dirname "$dst")"; return 0; }
  # temp lives NEXT TO the target so the final `mv` is a same-filesystem atomic rename —
  # the live file is either the old content or the complete new content, never partial.
  tmp="$(mktemp "$(dirname "$dst")/.models.yml.omg.XXXXXX" 2>/dev/null)" || { warn "preset merge skipped: mktemp failed in $(dirname "$dst")"; return 0; }
  bak=""
  if [ -f "$dst" ]; then
    bak="$dst.bak-$(date +%s).$$"    # PID suffix: same-second reruns must not clobber a backup
    cp "$dst" "$bak" 2>/dev/null || { warn "preset merge skipped: backup failed"; rm -f "$tmp"; return 0; }
    if awk 'BEGIN{f=0} /^[^ \t#]/{inprof = ($0 ~ /^profiles:[ \t]*(#.*)?$/)} inprof && /^  sol:[ \t]*(#.*)?$/{f=1} END{exit !f}' "$dst" 2>/dev/null; then
      # REPLACE the FIRST sol block INSIDE the `profiles:` section only (r3 finding 1 —
      # a `sol:` key nested under another top-level section like modelBindings must pass
      # through untouched). Boundary rules (r2 finding 2):
      # - comments contiguously ABOVE `  sol:` document sol by YAML convention → replaced
      #   with the canonical block (which carries its own docs);
      # - INSIDE the block, 2-space comments and blank lines are held in a pending buffer:
      #   if 4+-space body follows they were internal (dropped with the old block); if a
      #   key/top-level line follows they belong to the NEXT section and are flushed intact.
      # Other profiles, their comments, and top-level keys pass through untouched.
      OMG_SOL_BLOCK="$block" awk '
        function flushpend() { for (j = 1; j <= p; j++) print pend[j]; p = 0 }
        function flushbuf()  { for (j = 1; j <= n; j++) print buf[j];  n = 0 }
        BEGIN { n = 0; p = 0; insol = 0; inprof = 0; done = 0 }
        {
          if (insol) {
            if ($0 ~ /^    /)                     { p = 0; next }
            if ($0 ~ /^[ \t]*$/ || $0 ~ /^  #/)   { pend[++p] = $0; next }
            insol = 0; flushpend()
          }
          if ($0 ~ /^[^ \t#]/) { inprof = ($0 ~ /^profiles:[ \t]*(#.*)?$/) }
          if (inprof && $0 ~ /^  #/) { buf[++n] = $0; next }
          if (inprof && !done && $0 ~ /^  sol:[ \t]*(#.*)?$/) { n = 0; print ENVIRON["OMG_SOL_BLOCK"]; insol = 1; done = 1; next }
          flushbuf(); print
        }
        END { if (insol) insol = 0; flushpend(); flushbuf() }
      ' "$dst" > "$tmp" 2>/dev/null || { warn "preset merge skipped: block replace failed"; rm -f "$tmp"; return 0; }
    elif grep -q '^profiles:' "$dst"; then
      # APPEND: insert the sol block right AFTER the `profiles:` line, so a later
      # top-level key (modelBindings, providers, …) can never swallow it.
      OMG_SOL_BLOCK="$block" awk '
        { print }
        /^profiles:[ \t]*(#.*)?$/ && !done { print ""; print ENVIRON["OMG_SOL_BLOCK"]; done = 1 }
      ' "$dst" > "$tmp" 2>/dev/null || { warn "preset merge skipped: append failed"; rm -f "$tmp"; return 0; }
    else
      { cat "$dst" && printf '\nprofiles:\n\n%s\n' "$block"; } > "$tmp" 2>/dev/null || { warn "preset merge skipped: build failed"; rm -f "$tmp"; return 0; }
    fi
  else
    printf 'profiles:\n\n%s\n' "$block" > "$tmp" 2>/dev/null || { warn "preset merge skipped: build failed"; rm -f "$tmp"; return 0; }
  fi
  grep -Eq '^  sol:' "$tmp" 2>/dev/null || { warn "preset merge skipped: merge produced no sol block"; rm -f "$tmp"; return 0; }
  # single atomic write — no cp fallback: if rename fails the live file stays untouched
  mv "$tmp" "$dst" 2>/dev/null || { warn "preset merge skipped: cannot write $dst"; rm -f "$tmp"; return 0; }
  # Validate against the live registry, ALWAYS time-bounded (r2 finding 1): prefer
  # coreutils `timeout`; otherwise a bash watchdog kills the probe after the budget.
  # The probe fails fast (no auth/network) and its error lists every registered profile —
  # `sol` must be among them, meaning the file parses AND the profile registered.
  # (word-safe match: avoid `fable-sol` false hits)
  probe_budget="${OMG_PROBE_TIMEOUT:-60}"
  case "$probe_budget" in ''|0|*[!0-9]*) probe_budget=60 ;; esac   # positive integer only — 0/garbage must not disable the bound
  probe_out="$(mktemp 2>/dev/null)" || probe_out="$tmp.probe"
  if command -v timeout >/dev/null 2>&1 && timeout -k 5 1 true 2>/dev/null; then
    # -k: a probe that ignores TERM still gets KILL 5s later
    timeout -k 5 "$probe_budget" env GJC_NOTIFICATIONS=0 gjc --mpreset __omg_probe__ -p --no-session --no-tools "x" > "$probe_out" 2>&1
  elif command -v timeout >/dev/null 2>&1; then
    timeout "$probe_budget" env GJC_NOTIFICATIONS=0 gjc --mpreset __omg_probe__ -p --no-session --no-tools "x" > "$probe_out" 2>&1
  else
    GJC_NOTIFICATIONS=0 gjc --mpreset __omg_probe__ -p --no-session --no-tools "x" > "$probe_out" 2>&1 &
    probe_pid=$!
    waited=0
    while kill -0 "$probe_pid" 2>/dev/null && [ "$waited" -lt "$probe_budget" ]; do sleep 1; waited=$((waited+1)); done
    kill -9 "$probe_pid" 2>/dev/null
    wait "$probe_pid" 2>/dev/null
  fi
  if grep -qE '[:,] sol(,|$)' "$probe_out" 2>/dev/null; then
    rm -f "$probe_out"
    echo "✓ preset  (user): merged \`sol\` into $dst${bak:+ (backup: $bak)}"
  else
    rm -f "$probe_out"
    if [ -n "$bak" ]; then
      cp "$bak" "$dst" 2>/dev/null || { warn "preset merge ROLLBACK FAILED — restore manually: cp $bak $dst"; return 0; }
    else
      rm -f "$dst" 2>/dev/null || warn "preset merge cleanup failed — remove $dst manually"
    fi
    warn "preset merge rolled back (registry validation failed or probe timed out) — run /omg:presets manually"
  fi
  return 0
)

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
    if [ "$target" = "all" ]; then
      for s in "${EXPECTED_SKILLS[@]}";     do uninstall_skill     "$s" "$scope"; done
      for c in "${EXPECTED_COMMANDS[@]}";   do uninstall_command   "$c" "$scope"; done
      cleanup_legacy_commands "$scope"
      cleanup_removed "$scope"
      uninstall_suite_root_binding "$scope"
      if [ "$scope" = "user" ]; then uninstall_runtime_binding; fi
    else
      if [ -d "$PLUGIN_ROOT/skills/$target" ];       then uninstall_skill   "$target" "$scope"; fi
      if [ -f "$PLUGIN_ROOT/templates/$target.md" ]; then uninstall_command "$target" "$scope"; fi
      if [ "$target" = "lazycodex-gjc" ] && [ "$scope" = "user" ]; then uninstall_runtime_binding; fi
    fi
    ;;
  user|project)
    if [ "$target" = "all" ]; then
      preflight_all
      LAZYCODEX_BIND=0
      if [ "$mode" = "user" ]; then
        if lazycodex_runtime_available; then prepare_runtime_binding; LAZYCODEX_BIND=1
        else
          echo "! lazycodex-gjc runtime not bound (Codex CLI / systemd / Codex home missing) — the bridge stays disabled (fail-closed). After installing+logging in Codex, re-run the hardened root installer: curl -fsSL https://raw.githubusercontent.com/devswha/oh-my-gjc/main/install.sh | bash" >&2
          # A stale binding from a previous install must not stay executable across upgrades.
          if [ -d "$(runner_runtime)" ]; then uninstall_runtime_binding; fi
        fi
      fi
      install_suite_root_binding "$mode"
      for s in "${EXPECTED_SKILLS[@]}";     do install_skill     "$s" "$mode"; done
      for c in "${EXPECTED_COMMANDS[@]}";   do install_command   "$c" "$mode"; done
      if [ "$LAZYCODEX_BIND" = 1 ]; then install_runtime_binding; fi
      cleanup_legacy_commands "$mode"
      cleanup_removed "$mode"
      report_missing
      if [ "$mode" = "user" ]; then merge_sol_preset; fi
    else
      if [ "$target" = "lazycodex-gjc" ]; then
        [ -f "$PLUGIN_ROOT/bin/lazycodex-gjc.mjs" ] && [ ! -L "$PLUGIN_ROOT/bin/lazycodex-gjc.mjs" ] || MISSING+=("bin/lazycodex-gjc.mjs")
        report_missing
        if [ "$mode" = "user" ]; then prepare_runtime_binding; fi
      fi
      install_suite_root_binding "$mode"
      if [ -d "$PLUGIN_ROOT/skills/$target" ];       then install_skill   "$target" "$mode"; fi
      if [ -f "$PLUGIN_ROOT/templates/$target.md" ]; then install_command "$target" "$mode"; fi
      if [ "$target" = "lazycodex-gjc" ] && [ "$mode" = "user" ]; then install_runtime_binding; fi
      report_missing
      if [ "$target" = "multivendor-presets" ] && [ "$mode" = "user" ]; then merge_sol_preset; fi
    fi
    if [ "$mode" = "user" ]; then
      echo "  → skills auto-activate by trigger words; commands are /omg:<name>. Type /omg for the catalog."
      echo "  → open a NEW gjc session (or run /move .) to load newly installed commands. Re-run after upgrades."
    else
      echo "  → installed for this repo. A new gjc session in this dir will pick them up."
    fi
    ;;
  *)
    echo "usage: install-skill.sh [all|<name>] [user|project|uninstall [user|project]]"; exit 2 ;;
esac
