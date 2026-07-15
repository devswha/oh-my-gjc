#!/usr/bin/env bash
# oh-my-gajaecode — one-shot installer (single plugin suite).
#
#   curl -fsSL https://raw.githubusercontent.com/devswha/oh-my-gjc/main/install.sh | bash
#       → installs the one oh-my-gjc plugin + native skill/command copy. Then open a new gjc session.
#
#   --candidate-ref <path|ref>   marketplace SOURCE override (a local checkout path or an
#                                explicit dev ref) for release-candidate provenance testing.
#                                Default is the published marketplace (devswha/oh-my-gjc).
#
# One install brings ALL 10 skills + 15 commands (/omg + 14 /omg:*) — there are no separate/optional plugins. Legacy
# args (--core, tower, insane-review, codex-*, lazycodex, gjc-bugwatch) are accepted only
# to print a migration note; they NEVER add extra plugin installs.
#
# Absorbs everything setup does that needs no user choice: marketplace add, the single
# plugin install, and the NATIVE skill/command copy. gjc 0.9.x auto-exposes plugin
# commands as `oh-my-gjc:*` (wrong namespace), so command bodies ship in templates/ and
# install natively as `omg:*`; skills install natively too. User-choice stuff — model presets
# and always-on toggles — stays opt-in via /omg:setup. Idempotent. Shell CLI only.
set -euo pipefail

MARKET_DEFAULT="devswha/oh-my-gjc"
ENTRY="oh-my-gjc"            # marketplace entry name (kept for cache/compat)
CACHE="$HOME/.gjc/plugins/cache/plugins"

say()  { printf '\033[1;36m▸ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*" >&2; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

command -v gjc >/dev/null 2>&1 || die "gjc not found on PATH. Install Gajae Code first, then re-run."

# ── parse args ────────────────────────────────────────────────────────────────
MARKET="$MARKET_DEFAULT"; CAND_MODE=0; LEGACY=()
while [ $# -gt 0 ]; do
  case "$1" in
    --candidate-ref)   shift; [ $# -gt 0 ] || die "--candidate-ref needs a path or ref"; MARKET="$1"; CAND_MODE=1 ;;
    --candidate-ref=*) MARKET="${1#*=}"; CAND_MODE=1 ;;
    --*)               LEGACY+=("$1") ;;
    *)                 LEGACY+=("$1") ;;
  esac
  shift
done
if [ "${#LEGACY[@]}" -gt 0 ]; then
  warn "single-plugin suite now — these args are legacy and install nothing extra: ${LEGACY[*]}"
  warn "  everything comes from the one plugin; use /omg:<name> after install."
fi

# ── run ────────────────────────────────────────────────────────────────────────
say "marketplace add: $MARKET"
if [ "$CAND_MODE" = 1 ]; then
  # candidate/provenance mode is fail-closed end-to-end: a fresh HOME is expected, so a
  # marketplace-add failure means the candidate source did NOT register — abort rather than
  # fall through to a previously-registered (possibly stale) marketplace/cache.
  gjc plugin marketplace add "$MARKET" || die "candidate marketplace add failed — aborting (run provenance installs in a fresh HOME)."
else
  gjc plugin marketplace add "$MARKET" 2>&1 | tail -1 || warn "marketplace already registered — refreshing it"
  say "marketplace update: $ENTRY"
  gjc plugin marketplace update "$ENTRY" \
    || die "marketplace update failed — refusing to install from a possibly-stale catalog."
fi

say "install $ENTRY@$ENTRY"
if [ "$CAND_MODE" = 1 ]; then
  # candidate/provenance mode: force reinstall so the cache is the candidate, not a stale copy.
  # Fail closed — never fall through to install a possibly-stale cache as release evidence.
  gjc plugin install "$ENTRY@$ENTRY" --force || die "candidate install failed — refusing to proceed with a possibly-stale cache (provenance integrity)."
else
  # Published reruns are upgrade paths. The marketplace was refreshed above; --force now
  # rebuilds the plugin cache from that current catalog. Fall back only for older gjc versions
  # that do not accept --force, and fail closed if neither install form succeeds.
  gjc plugin install "$ENTRY@$ENTRY" --force 2>&1 | tail -1 \
    || gjc plugin install "$ENTRY@$ENTRY" 2>&1 | tail -1 \
    || die "install failed — refusing to run a native installer from a possibly-stale cache."
fi

# NATIVE install — newest cached version, plugin-scoped glob (cache is <market>___<entry>___<ver>;
# marketplace name == entry name, so anchor to oh-my-gjc___oh-my-gjc___* — a bare *oh-my-gjc* glob
# would match nothing else now but the anchored form stays correct if more entries ever appear).
NAT="$(ls -d "$CACHE/oh-my-gjc___${ENTRY}___"*/bin/install-skill.sh 2>/dev/null | sort -V | tail -1)"
[ -n "$NAT" ] || die "native installer not found ($CACHE/oh-my-gjc___${ENTRY}___*/bin/install-skill.sh). Plugin install may have failed."
bash "$NAT" all

cat <<DONE

✓ oh-my-gajaecode installed — one plugin, 10 skills + 15 commands (/omg + 14 /omg:*), all native. No further required steps.
  Just open a NEW gjc session (or run /move .). That's it.
    /omg   → catalog of everything you got
  (Optional: /omg:setup merges model presets / turns on always-on modes.)
DONE
