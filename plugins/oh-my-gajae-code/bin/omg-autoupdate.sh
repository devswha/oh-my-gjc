#!/usr/bin/env bash
# oh-my-gajae-code — OPT-IN auto-updater.
#
# Re-runs the trusted one-shot installer on a schedule so an installed suite
# stays current without a manual `curl | bash`. The main install.sh NEVER
# enables this; the user must opt in explicitly with `omg-autoupdate.sh enable`.
#
# Design / safety:
#   - Never runs as root.
#   - Single-flight lock (flock) so overlapping timers don't collide.
#   - Network updates download to a temp file and check the fetch rc BEFORE
#     executing, so a partial/failed download is never run or logged OK.
#   - The installer's real exit code is propagated: a failed update exits
#     non-zero so systemd/cron surface the failure.
#   - Every run is timestamped and logged to $STATE_DIR/autoupdate.log.
#   - `enable` copies THIS script to a STABLE path ($STATE_DIR/omg-autoupdate.sh)
#     and points the timer/cron at that copy, so a version-bumped plugin cache
#     path can never break the scheduled unit.
#   - Update source is the canonical HTTPS installer by default; `--local <dir>`
#     runs that checkout's install.sh instead (offline / air-gapped).
#   - Schedule/path values are validated against an allowlist and escaped for
#     the systemd/cron syntax they land in.
#   - systemd --user timer is preferred; cron is the fallback. `disable`
#     removes both unconditionally.
#
# Usage:
#   omg-autoupdate.sh run     [--local <checkout>] [--dry-run]
#   omg-autoupdate.sh enable  [--interval <systemd-OnCalendar>] [--local <checkout>] [--dry-run]
#   omg-autoupdate.sh disable [--dry-run]
#   omg-autoupdate.sh status
set -euo pipefail

CANONICAL_INSTALLER_URL="https://raw.githubusercontent.com/devswha/oh-my-gajae-code/main/install.sh"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/oh-my-gajae-code"
STABLE_SELF="$STATE_DIR/omg-autoupdate.sh"
LOG="$STATE_DIR/autoupdate.log"
LOCK="$STATE_DIR/autoupdate.lock"
UNIT_NAME="omg-autoupdate"
SYSTEMD_USER_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
SERVICE_UNIT="$SYSTEMD_USER_DIR/$UNIT_NAME.service"
TIMER_UNIT="$SYSTEMD_USER_DIR/$UNIT_NAME.timer"
CRON_TAG="# oh-my-gajae-code autoupdate (managed by omg-autoupdate.sh)"
DEFAULT_INTERVAL="daily"

DRY_RUN=0
LOCAL_CHECKOUT=""
INTERVAL="$DEFAULT_INTERVAL"

log()   { printf '%s\n' "$*"; }
warn()  { printf '! %s\n' "$*" >&2; }
die()   { printf '✗ %s\n' "$*" >&2; exit 1; }
run_or_echo() { if [ "$DRY_RUN" = 1 ]; then printf '  [dry-run] %s\n' "$*"; else "$@"; fi; }

guard_not_root() {
  [ "$(id -u)" != 0 ] || die "refusing to run as root — auto-update must run as the owning user."
}

# Reject paths that would break systemd/cron quoting (newlines, control chars,
# single quotes). Paths are embedded into scheduler syntax, so keep them plain.
assert_safe_path() { # $1=label $2=path
  case "$2" in
    *[[:cntrl:]]*) die "$1 contains a control character/newline: refusing to schedule." ;;
    *"'"*)         die "$1 contains a single quote: refusing to schedule." ;;
  esac
}

# systemd OnCalendar / cron schedules only need this safe charset. This blocks
# newline, %, ;, $, backtick, quotes — i.e. any scheduler-directive injection.
validate_interval() {
  case "$INTERVAL" in
    "" ) die "--interval must not be empty." ;;
    *[!A-Za-z0-9\ :.,*/_-]* ) die "--interval has disallowed characters: '$INTERVAL' (allowed: letters, digits, space : . , * / _ -)." ;;
  esac
}

parse_flags() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --dry-run) DRY_RUN=1 ;;
      --local)
        shift; [ $# -gt 0 ] || die "--local needs a checkout path"
        LOCAL_CHECKOUT="$1" ;;
      --local=*) LOCAL_CHECKOUT="${1#*=}" ;;
      --interval)
        shift; [ $# -gt 0 ] || die "--interval needs a systemd OnCalendar value (e.g. daily, weekly, '*-*-* 04:00:00')"
        INTERVAL="$1" ;;
      --interval=*) INTERVAL="${1#*=}" ;;
      *) die "unknown flag: $1" ;;
    esac
    shift
  done
}

ensure_state_dir() {
  [ -d "$STATE_DIR" ] || run_or_echo mkdir -p "$STATE_DIR"
  [ "$DRY_RUN" = 1 ] || chmod 700 "$STATE_DIR" 2>/dev/null || true
}

# ── run: perform one update now ────────────────────────────────────────────────
fetch_to() { # $1=dest — download canonical installer, honoring HTTP errors
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$CANONICAL_INSTALLER_URL" -o "$1"
  elif command -v wget >/dev/null 2>&1; then
    wget -q -O "$1" "$CANONICAL_INSTALLER_URL"
  else
    return 127
  fi
}

update_source_label() {
  if [ -n "$LOCAL_CHECKOUT" ]; then printf 'local: %s/install.sh' "$LOCAL_CHECKOUT"
  else printf '%s' "$CANONICAL_INSTALLER_URL"; fi
}

do_run() {
  guard_not_root
  ensure_state_dir
  command -v gjc >/dev/null 2>&1 || die "gjc not found on PATH — nothing to update."
  if [ -n "$LOCAL_CHECKOUT" ]; then
    [ -f "$LOCAL_CHECKOUT/install.sh" ] || die "--local checkout has no install.sh: $LOCAL_CHECKOUT/install.sh"
  elif ! command -v curl >/dev/null 2>&1 && ! command -v wget >/dev/null 2>&1; then
    die "no installer source available — need curl, wget, or --local <checkout>."
  fi

  if [ "$DRY_RUN" = 1 ]; then
    log "  [dry-run] flock $LOCK"
    log "  [dry-run] update from $(update_source_label)"
    return 0
  fi

  # Single-flight: skip quietly if a run is already in progress.
  exec 9>"$LOCK"
  if ! flock -n 9; then
    printf '%s  skipped: another auto-update run holds the lock\n' "$(date -Is)" >>"$LOG"
    return 0
  fi

  local rc tmp=""
  {
    printf '\n===== %s  omg-autoupdate run =====\n' "$(date -Is)"
    printf 'source: %s\n' "$(update_source_label)"
    if [ -n "$LOCAL_CHECKOUT" ]; then
      if bash "$LOCAL_CHECKOUT/install.sh"; then rc=0; else rc=$?; fi
    else
      tmp="$(mktemp "${TMPDIR:-/tmp}/omg-installer.XXXXXX")"
      if fetch_to "$tmp" && [ -s "$tmp" ]; then
        if bash "$tmp"; then rc=0; else rc=$?; fi
      else
        rc=$?
        printf 'download failed (rc=%s) — installer NOT executed\n' "$rc"
        [ "$rc" -ne 0 ] || rc=1
      fi
      rm -f "$tmp"
    fi
    if [ "$rc" -eq 0 ]; then printf 'result: OK (%s)\n' "$(date -Is)"
    else printf 'result: FAILED rc=%s (%s)\n' "$rc" "$(date -Is)"; fi
  } >>"$LOG" 2>&1
  if [ "$rc" -eq 0 ]; then log "auto-update OK — log: $LOG"
  else warn "auto-update FAILED (rc=$rc) — log: $LOG"; fi
  return "$rc"
}

# ── enable / disable via systemd --user (cron fallback) ────────────────────────
systemd_user_available() {
  command -v systemctl >/dev/null 2>&1 || return 1
  [ -n "${XDG_RUNTIME_DIR:-}" ] || return 1
  systemctl --user show-environment >/dev/null 2>&1
}

install_stable_self() {
  local src="${BASH_SOURCE[0]}"
  src="$(cd "$(dirname "$src")" && pwd)/$(basename "$src")"
  if [ "$DRY_RUN" = 1 ]; then
    log "  [dry-run] install stable copy: $src -> $STABLE_SELF"
    return 0
  fi
  cp "$src" "$STABLE_SELF"
  chmod 700 "$STABLE_SELF"
}

# systemd ExecStart honors double-quoted args; a literal % must be doubled.
systemd_escape() { printf '%s' "${1//%/%%}"; }

exec_start_line() {
  local line
  line="/usr/bin/env bash \"$STABLE_SELF\" run"
  [ -z "$LOCAL_CHECKOUT" ] || line="$line --local \"$LOCAL_CHECKOUT\""
  systemd_escape "$line"
}

enable_systemd() {
  run_or_echo mkdir -p "$SYSTEMD_USER_DIR"
  local exec_start; exec_start="$(exec_start_line)"
  if [ "$DRY_RUN" = 1 ]; then
    log "  [dry-run] write $SERVICE_UNIT (ExecStart=$exec_start)"
    log "  [dry-run] write $TIMER_UNIT  (OnCalendar=$INTERVAL, Persistent=true)"
    log "  [dry-run] systemctl --user daemon-reload"
    log "  [dry-run] systemctl --user enable --now $UNIT_NAME.timer"
    return 0
  fi
  cat >"$SERVICE_UNIT" <<EOF
[Unit]
Description=oh-my-gajae-code auto-update (re-runs the trusted installer)
Documentation=https://github.com/devswha/oh-my-gajae-code

[Service]
Type=oneshot
ExecStart=$exec_start
EOF
  cat >"$TIMER_UNIT" <<EOF
[Unit]
Description=oh-my-gajae-code auto-update schedule

[Timer]
OnCalendar=$INTERVAL
Persistent=true

[Install]
WantedBy=timers.target
EOF
  systemctl --user daemon-reload
  systemctl --user enable --now "$UNIT_NAME.timer"
  log "✓ enabled systemd --user timer '$UNIT_NAME.timer' (OnCalendar=$INTERVAL)."
}

cron_schedule_from_interval() {
  case "$INTERVAL" in
    daily)  echo "0 4 * * *" ;;
    weekly) echo "0 4 * * 1" ;;
    hourly) echo "0 * * * *" ;;
    *)      echo "$INTERVAL" ;;   # allow a raw 5-field cron spec (already validated)
  esac
}

# cron treats a literal % as a newline; it must be backslash-escaped.
cron_escape() { printf '%s' "${1//%/\\%}"; }

cron_command() {
  local cmd="/usr/bin/env bash '$STABLE_SELF' run"
  [ -z "$LOCAL_CHECKOUT" ] || cmd="$cmd --local '$LOCAL_CHECKOUT'"
  printf '%s' "$cmd"
}

enable_cron() {
  local sched line existing
  sched="$(cron_schedule_from_interval)"
  line="$(cron_escape "$sched $(cron_command) $CRON_TAG")"
  if [ "$DRY_RUN" = 1 ]; then
    log "  [dry-run] crontab line: $line"
    return 0
  fi
  command -v crontab >/dev/null 2>&1 || die "neither systemd --user nor crontab is available — cannot schedule."
  existing="$(crontab -l 2>/dev/null | grep -vF "$CRON_TAG" || true)"
  printf '%s\n%s\n' "$existing" "$line" | grep -v '^[[:space:]]*$' | crontab -
  log "✓ enabled cron auto-update ($sched)."
}

do_enable() {
  guard_not_root
  validate_interval
  assert_safe_path "state script path" "$STABLE_SELF"
  [ -z "$LOCAL_CHECKOUT" ] || assert_safe_path "--local checkout" "$LOCAL_CHECKOUT"
  ensure_state_dir
  install_stable_self
  if systemd_user_available; then
    enable_systemd
  else
    warn "systemd --user unavailable; falling back to cron."
    enable_cron
  fi
  log "  update source: $(update_source_label)"
  log "  log file:      $LOG"
  log "  disable with:  omg-autoupdate.sh disable"
}

do_disable() {
  guard_not_root
  local removed=0
  # systemd — remove unit files unconditionally; best-effort stop via the bus.
  if [ "$DRY_RUN" = 1 ]; then
    log "  [dry-run] systemctl --user disable --now $UNIT_NAME.timer (best-effort)"
    log "  [dry-run] rm -f $TIMER_UNIT $SERVICE_UNIT"
  else
    if command -v systemctl >/dev/null 2>&1; then
      systemctl --user disable --now "$UNIT_NAME.timer" >/dev/null 2>&1 || true
    fi
    if [ -e "$TIMER_UNIT" ] || [ -e "$SERVICE_UNIT" ]; then
      rm -f "$TIMER_UNIT" "$SERVICE_UNIT"
      systemctl --user daemon-reload >/dev/null 2>&1 || true
      removed=1
    fi
  fi
  # cron
  if command -v crontab >/dev/null 2>&1; then
    if [ "$DRY_RUN" = 1 ]; then
      log "  [dry-run] remove crontab line tagged: $CRON_TAG"
    elif crontab -l 2>/dev/null | grep -qF "$CRON_TAG"; then
      crontab -l 2>/dev/null | grep -vF "$CRON_TAG" | grep -v '^[[:space:]]*$' | crontab - || true
      removed=1
    fi
  fi
  [ "$DRY_RUN" = 1 ] || { [ "$removed" = 1 ] && log "✓ auto-update disabled." || log "auto-update was not enabled — nothing to remove."; }
}

do_status() {
  guard_not_root
  local on=0
  if systemd_user_available && systemctl --user list-unit-files "$UNIT_NAME.timer" 2>/dev/null | grep -q "$UNIT_NAME.timer"; then
    log "systemd --user timer: ENABLED"
    systemctl --user list-timers "$UNIT_NAME.timer" --all 2>/dev/null | sed -n '1,3p' || true
    on=1
  fi
  if command -v crontab >/dev/null 2>&1 && crontab -l 2>/dev/null | grep -qF "$CRON_TAG"; then
    log "cron: ENABLED"
    crontab -l 2>/dev/null | grep -F "$CRON_TAG" || true
    on=1
  fi
  [ "$on" = 1 ] || log "auto-update: DISABLED (not scheduled)."
  [ ! -f "$LOG" ] || { log "--- last log lines ($LOG) ---"; tail -n 5 "$LOG" 2>/dev/null || true; }
}

main() {
  [ $# -ge 1 ] || die "usage: omg-autoupdate.sh {run|enable|disable|status} [flags]"
  local action="$1"; shift
  parse_flags "$@"
  case "$action" in
    run)     do_run ;;
    enable)  do_enable ;;
    disable) do_disable ;;
    status)  do_status ;;
    -h|--help|help)
      sed -n '2,30p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' ;;
    *) die "unknown action: $action (expected run|enable|disable|status)" ;;
  esac
}

main "$@"
