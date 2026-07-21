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
# One install brings ALL 7 skills + 9 commands (/omg + 8 /omg:*) — there are no separate/optional plugins. Legacy
# args (--core, tower, insane-review, codex-*, lazycodex, gjc-bugwatch) are accepted only
# to print a migration note; they NEVER add extra plugin installs.
#
# Absorbs everything setup does that needs no user choice: marketplace add, the single
# plugin install, and the NATIVE skill/command copy. gjc 0.9.x auto-exposes plugin
# commands as `oh-my-gjc:*` (wrong namespace), so command bodies ship in templates/ and
# install natively as `omg:*`; skills install natively too. Model selection stays entirely
# with GJC defaults/built-ins; the gate always-on toggle is exposed through /omg:setup. Idempotent. Shell CLI only.
set -euo pipefail

MARKET_DEFAULT="devswha/oh-my-gjc"
ENTRY="oh-my-gjc"
PLUGIN_ID="${ENTRY}@${ENTRY}"
CACHE="$HOME/.gjc/plugins/cache/plugins"
INSTALL_STDERR=""
MARKET_STDERR=""

say()  { printf '\033[1;36m▸ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*" >&2; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
cleanup() {
  [ -z "$INSTALL_STDERR" ] || rm -f "$INSTALL_STDERR"
  [ -z "$MARKET_STDERR" ] || rm -f "$MARKET_STDERR"
}
trap cleanup EXIT

command -v gjc >/dev/null 2>&1 || die "gjc not found on PATH. Install Gajae Code first, then re-run."

# ── parse args ────────────────────────────────────────────────────────────────
MARKET="$MARKET_DEFAULT"; CAND_MODE=0; LEGACY=()
while [ $# -gt 0 ]; do
  case "$1" in
    --candidate-ref)
      shift
      [ $# -gt 0 ] || die "--candidate-ref needs a path or ref"
      case "$1" in --*) die "--candidate-ref needs a path or ref" ;; esac
      MARKET="$1"
      CAND_MODE=1
      ;;
    --candidate-ref=*)
      MARKET="${1#*=}"
      [ -n "$MARKET" ] || die "--candidate-ref needs a path or ref"
      case "$MARKET" in --*) die "--candidate-ref needs a path or ref" ;; esac
      CAND_MODE=1
      ;;
    --core|tower|insane-review|codex-*|lazycodex|gjc-bugwatch)
      LEGACY+=("$1")
      ;;
    --*)
      die "unknown option: $1"
      ;;
    *)
      die "unexpected argument: $1"
      ;;
  esac
  shift
done
if [ "${#LEGACY[@]}" -gt 0 ]; then
  warn "single-plugin suite now — these args are legacy and install nothing extra: ${LEGACY[*]}"
  warn "  everything comes from the one plugin; use /omg:<name> after install."
fi

# ── run ────────────────────────────────────────────────────────────────────────
resolve_native_installer() {
  local cache_name cache_physical entry_version home_physical line match_count native native_parent
  local output root root_physical semver_re status_token success_line_re success_prefix_re ansi_sgr

  output="$1"
  semver_re='(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-([0-9A-Za-z-]+)(\.[0-9A-Za-z-]+)*)?(\+([0-9A-Za-z-]+)(\.[0-9A-Za-z-]+)*)?'
  # GJC themes vary the status token (Unicode, Nerd Font, or ASCII) while the
  # machine-relevant suffix is stable. Accept one bounded, printable token and
  # at most one harmless SGR wrapper on either edge; never accept whitespace or
  # control bytes inside the token.
  ansi_sgr=$'\033''\[[0-9;]*m'
  status_token='[^[:space:][:cntrl:]]{1,16}'
  success_line_re="^(${ansi_sgr})?${status_token} Installed oh-my-gjc from oh-my-gjc \\((${semver_re})\\)(${ansi_sgr})?$"
  success_prefix_re="^(${ansi_sgr})?${status_token} Installed oh-my-gjc from oh-my-gjc"
  match_count=0

  while IFS= read -r line || [ -n "$line" ]; do
    if [[ "$line" =~ $success_line_re ]]; then
      match_count=$((match_count + 1))
      [ "$match_count" -eq 1 ] || return 1
      entry_version="${BASH_REMATCH[2]}"
    elif [[ "$line" =~ $success_prefix_re ]]; then
      return 1
    fi
  done <<<"$output"

  [ "$match_count" -eq 1 ] || return 1

  cache_name="oh-my-gjc___oh-my-gjc___${entry_version}"
  root="${CACHE}/${cache_name}"

  # Do not follow cache or native-installer symlinks. Canonical paths must describe the
  # exact derived root and its bin directory; install output cannot redirect native handoff.
  [ -d "$CACHE" ] && [ ! -L "$CACHE" ] && [ ! -L "$root" ] && [ ! -L "$root/bin" ] \
    && [ -f "$root/bin/install-skill.sh" ] && [ ! -L "$root/bin/install-skill.sh" ] || return 1
  home_physical="$(cd "$HOME" && pwd -P)" || return 1
  cache_physical="$(cd "$CACHE" && pwd -P)" || return 1
  root_physical="$(cd "$root" && pwd -P)" || return 1
  native_parent="$(cd "$root/bin" && pwd -P)" || return 1
  [ "$cache_physical" = "$home_physical/.gjc/plugins/cache/plugins" ] \
    && [ "$root_physical" = "$cache_physical/$cache_name" ] \
    && [ "$native_parent" = "$root_physical/bin" ] || return 1

  native="$root/bin/install-skill.sh"
  printf '%s\n' "$native"
}

relay_install_output() {
  [ -z "$1" ] || printf '%s\n' "$1"
}

say "marketplace add: $MARKET"
if [ "$CAND_MODE" = 1 ]; then
  # candidate/provenance mode is fail-closed end-to-end: a fresh HOME is expected, so a
  # marketplace-add failure means the candidate source did NOT register — abort rather than
  # fall through to a previously-registered (possibly stale) marketplace/cache.
  gjc plugin marketplace add "$MARKET" || die "candidate marketplace add failed — aborting (run provenance installs in a fresh HOME)."
else
  MARKET_STDERR="$(mktemp "${TMPDIR:-/tmp}/omg-marketplace.XXXXXX")" \
    || die "could not safely capture the marketplace registration diagnostic."
  if market_output="$(gjc plugin marketplace add "$MARKET" 2>"$MARKET_STDERR")"; then
    relay_install_output "$market_output"
  else
    market_status=$?
    market_stderr="$(<"$MARKET_STDERR")"
    if [[ "$market_stderr" =~ Marketplace[[:space:]]+[\"\']?${ENTRY}[\"\']?[[:space:]]+already[[:space:]]+exists ]]; then
      warn "marketplace name already exists — replacing its source with $MARKET"
      gjc plugin marketplace remove "$ENTRY" \
        || die "could not remove the existing marketplace — refusing an unbound source."
      gjc plugin marketplace add "$MARKET" \
        || die "could not bind marketplace $ENTRY to $MARKET."
    else
      die "marketplace add failed (exit $market_status) — refusing to use an unverified existing source."
    fi
  fi
  say "marketplace update: $ENTRY"
  gjc plugin marketplace update "$ENTRY" \
    || die "marketplace update failed — refusing to install from a possibly-stale catalog."
fi

say "install $PLUGIN_ID"
# mktemp creates this diagnostic capture with mode 600; the EXIT trap removes it.
# Raw install diagnostics remain private; only the exact compatibility diagnostic is inspected.
INSTALL_STDERR="$(mktemp "${TMPDIR:-/tmp}/omg-install.XXXXXX")" \
  || die "could not safely capture the plugin install diagnostic."
if [ "$CAND_MODE" = 1 ]; then
  # Candidate/provenance mode: force reinstall so the cache is the candidate, not a stale copy.
  # Fail closed — never fall through to install a possibly-stale cache as release evidence.
  if INSTALL_OUTPUT="$(gjc plugin install "$PLUGIN_ID" --force 2>"$INSTALL_STDERR")"; then
    relay_install_output "$INSTALL_OUTPUT"
  else
    die "candidate install failed — refusing to proceed with a possibly-stale cache (provenance integrity)."
  fi
else
  # Published reruns are upgrade paths. The marketplace was refreshed above; --force now
  # rebuilds the plugin cache from that current catalog. Only the exact unsupported-option
  # diagnostic permits a compatibility retry; every other failure remains fail-closed.
  if force_output="$(gjc plugin install "$PLUGIN_ID" --force 2>"$INSTALL_STDERR")"; then
    INSTALL_OUTPUT="$force_output"
    relay_install_output "$INSTALL_OUTPUT"
  else
    force_status=$?
    force_stderr="$(<"$INSTALL_STDERR")"
    if [[ "$force_stderr" =~ ^[[:space:]]*([Ee]rror:[[:space:]]*)?[Uu]nknown[[:space:]]+option:?[[:space:]]*[\'\"]?--force[\'\"]?[[:space:]]*[\.\!]?[[:space:]]*$ ]]; then
      warn "installed gjc does not support --force; retrying the published install without it."
      if INSTALL_OUTPUT="$(gjc plugin install "$PLUGIN_ID" 2>"$INSTALL_STDERR")"; then
        relay_install_output "$INSTALL_OUTPUT"
      else
        die "install failed after the proven --force compatibility retry — refusing native handoff."
      fi
    else
      die "forced install failed (exit $force_status); refusing an unforced fallback. Re-run '$0' after resolving the gjc install error."
    fi
  fi
fi

if ! NAT="$(resolve_native_installer "$INSTALL_OUTPUT")"; then
  die "could not identify the just-installed $PLUGIN_ID cache root from its install success output; refusing native handoff."
fi
"${BASH:-bash}" "$NAT" all

cat <<DONE

✓ oh-my-gajaecode installed — one plugin, 7 skills + 9 commands (/omg + 8 /omg:*), all native surfaces installed.
  Open a NEW gjc session (or run /move .).
    /omg   → catalog of everything you got
  (Optional: /omg:setup checks prerequisites / explains the gate always-on mode.)

════════════════ Bridge release v0.27.0 ════════════════
  This GitHub repository will move to oh-my-gajae-code.
  Future canonical installer:
    https://raw.githubusercontent.com/devswha/oh-my-gajae-code/main/install.sh
  After the GitHub rename, this old raw URL is expected to stop working:
    https://raw.githubusercontent.com/devswha/oh-my-gjc/main/install.sh
  All old raw.githubusercontent.com/devswha/oh-my-gjc paths, including docs,
  share this limitation.
  Recovery: use the redirected GitHub repository page or clone URL:
    https://github.com/devswha/oh-my-gjc
    git clone --depth 1 https://github.com/devswha/oh-my-gjc.git oh-my-gjc
══════════════════════════════════════════════════════════
DONE
