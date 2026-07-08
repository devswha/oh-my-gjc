#!/usr/bin/env bash
# oh-my-gjc — one-shot installer (oh-my-zsh style: installs EVERYTHING by default).
#
#   curl -fsSL https://raw.githubusercontent.com/devswha/oh-my-gjc/main/install.sh | bash
#       → core + ALL optional plugins, natively installed. Then just open a new gjc session.
#   … | bash -s -- --core                 → minimal: core only
#   … | bash -s -- tower insane-review     → core + only the named optional plugins
#
# Absorbs everything setup does that needs no user choice: marketplace add, plugin
# installs, and the NATIVE skill/command copy (gjc doesn't load plugin skills/commands
# into a session). What it does NOT do is the user-choice stuff — model presets (need
# your vendor + login) and always-on toggles — those stay opt-in via /omg:setup.
#
# Plugin management is gjc's SHELL CLI only (no /plugin slash). Idempotent.
set -euo pipefail

MARKET="devswha/oh-my-gjc"
CORE="oh-my-gjc"
CACHE="$HOME/.gjc/plugins/cache/plugins"
OPTIONAL=(tower insane-review gjc-bugwatch codex-cli-control codex-deepwork codex-app-control lazycodex)

say()  { printf '\033[1;36m▸ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*" >&2; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# Friendly prerequisite note (printed at install; the plugin's first run self-diagnoses too).
prereq_note() {
  case "$1" in
    insane-review) echo "needs a Chromium browser on CDP :9222 + ChatGPT login — /insane-review:review checks env and walks you through it." ;;
    codex-cli-control|codex-deepwork|codex-app-control) echo "needs the Codex CLI (codex login) — the command self-diagnoses and guides you on first run." ;;
    lazycodex) echo "needs the Codex CLI + LazyCodex harness — /lazycodex:setup doctor guides you." ;;
    *) echo "" ;;
  esac
}

command -v gjc >/dev/null 2>&1 || die "gjc not found on PATH. Install Gajae Code first, then re-run."

# ── parse args ────────────────────────────────────────────────────────────────
CORE_ONLY=0; EXPLICIT=()
for a in "$@"; do
  case "$a" in
    --core) CORE_ONLY=1 ;;
    --*)    warn "unknown flag: $a (ignored)" ;;
    *)      EXPLICIT+=("$a") ;;
  esac
done
if   [ "$CORE_ONLY" = 1 ];          then TARGETS=()
elif [ "${#EXPLICIT[@]}" -gt 0 ];   then TARGETS=("${EXPLICIT[@]}")
else                                     TARGETS=("${OPTIONAL[@]}"); fi

# native install for one plugin, newest cached version, plugin-scoped glob
native() { # $1=plugin
  local sh
  sh="$(ls -d "$CACHE/${MARKET##*/}___$1___"*/bin/install-skill.sh 2>/dev/null | sort -V | tail -1)"
  [ -n "$sh" ] || { warn "  ↳ $1: no native installer bundled — skills/commands may not surface; report this."; return 0; }
  bash "$sh" all
}
install_one() { # $1=plugin
  say "install $1@$CORE"
  gjc plugin install "$1@$CORE"
  native "$1"
  local n; n="$(prereq_note "$1")"; if [ -n "$n" ]; then warn "  ↳ $1: $n"; fi
  return 0
}

# ── run ──────────────────────────────────────────────────────────────────────
say "marketplace add: $MARKET"
gjc plugin marketplace add "$MARKET" 2>&1 | tail -1 || warn "marketplace add non-zero (already added?) — continuing"

install_one "$CORE"
for p in "${TARGETS[@]:-}"; do [ -n "$p" ] || continue; install_one "$p"; done

n_opt="${#TARGETS[@]}"
cat <<DONE

✓ oh-my-gjc installed — core + ${n_opt} optional plugin(s). No further required steps.
  Just open a NEW gjc session (or run /move .). That's it.
    /omg   → catalog of everything you got
  (Optional, only if you want them: /omg:setup merges model presets / turns on always-on modes.)
DONE
