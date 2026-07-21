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
#   - Every run is timestamped and logged to $STATE_DIR/autoupdate.log.
#   - `enable` copies THIS script to a STABLE path ($STATE_DIR/omg-autoupdate.sh)
#     and points the timer/cron at that copy, so a version-bumped plugin cache
#     path can never break the scheduled unit.
#   - Update source is the canonical HTTPS installer by default; `--local <dir>`
#     runs that checkout's install.sh instead (offline / air-gapped).
#   - systemd --user timer is preferred; cron is the fallback.
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

ensure_state_dir() {
  [ -d "$STATE_DIR" ] || run_or_echo mkdir -p "$STATE_DIR"
  [ "$DRY_RUN" = 1 ] || chmod 700 "$STATE_DIR" 2>/dev/null || true
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

# ── run: perform one update now ────────────────────────────────────────────────
resolve_installer_cmd() {
  # Emits the command (as a bash -c payload) that performs the actual install.
  if [ -n "$LOCAL_CHECKOUT" ]; then
    local sh="$LOCAL_CHECKOUT/install.sh"
    [ -f "$sh" ] || die "--local checkout has no install.sh: $sh"
    printf 'bash %q' "$sh"
    return
  fi
  if command -v curl >/dev/null 2>&1; then
    printf 'curl -fsSL %q | bash' "$CANONICAL_INSTALLER_URL"
  elif command -v wget >/dev/null 2>&1; then
    printf 'wget -qO- %q | bash' "$CANONICAL_INSTALLER_URL"
  else
    die "no installer source available — need curl, wget, or --local <checkout>."
  fi
}

do_run() {
  guard_not_root
  ensure_state_dir
  command -v gjc >/dev/null 2>&1 || die "gjc not found on PATH — nothing to update."
  local cmd; cmd="$(resolve_installer_cmd)"
  if [ "$DRY_RUN" = 1 ]; then
    log "  [dry-run] flock $LOCK"
    log "  [dry-run] $cmd"
    return 0
  fi
  # Single-flight: skip quietly if a run is already in progress.
  exec 9>"$LOCK"
  if ! flock -n 9; then
    printf '%s  skipped: another auto-update run holds the lock\n' "$(date -Is)" >>"$LOG"
    return 0
  fi
  {
    printf '\n===== %s  omg-autoupdate run =====\n' "$(date -Is)"
    printf 'source: %s\n' "$cmd"
    if bash -c "$cmd"; then
      printf 'result: OK (%s)\n' "$(date -Is)"
    else
      printf 'result: FAILED rc=%s (%s)\n' "$?" "$(date -Is)"
    fi
  } >>"$LOG" 2>&1
  log "auto-update finished — log: $LOG"
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

enable_systemd() {
  local run_flags=""
  [ -z "$LOCAL_CHECKOUT" ] || run_flags=" --local $(printf '%q' "$LOCAL_CHECKOUT")"
  local service="$SYSTEMD_USER_DIR/$UNIT_NAME.service"
  local timer="$SYSTEMD_USER_DIR/$UNIT_NAME.timer"
  run_or_echo mkdir -p "$SYSTEMD_USER_DIR"
  if [ "$DRY_RUN" = 1 ]; then
    log "  [dry-run] write $service (ExecStart=/usr/bin/env bash $STABLE_SELF run$run_flags)"
    log "  [dry-run] write $timer  (OnCalendar=$INTERVAL, Persistent=true)"
    log "  [dry-run] systemctl --user daemon-reload"
    log "  [dry-run] systemctl --user enable --now $UNIT_NAME.timer"
    return 0
  fi
  cat >"$service" <<EOF
[Unit]
Description=oh-my-gajae-code auto-update (re-runs the trusted installer)
Documentation=https://github.com/devswha/oh-my-gajae-code

[Service]
Type=oneshot
ExecStart=/usr/bin/env bash $STABLE_SELF run$run_flags
EOF
  cat >"$timer" <<EOF
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
    *)      echo "$INTERVAL" ;;   # allow a raw 5-field cron spec
  esac
}

enable_cron() {
  local sched line existing
  sched="$(cron_schedule_from_interval)"
  local run_flags=""
  [ -z "$LOCAL_CHECKOUT" ] || run_flags=" --local $(printf '%q' "$LOCAL_CHECKOUT")"
  line="$sched /usr/bin/env bash $STABLE_SELF run$run_flags $CRON_TAG"
  if [ "$DRY_RUN" = 1 ]; then
    log "  [dry-run] crontab line: $line"
    return 0
  fi
  command -v crontab >/dev/null 2>&1 || die "neither systemd --user nor crontab is available — cannot schedule."
  existing="$(crontab -l 2>/dev/null | grep -vF "$CRON_TAG" || true)"
  printf '%s\n%s\n' "$existing" "$line" | grep -v '^$' | crontab -
  log "✓ enabled cron auto-update ($sched)."
}

do_enable() {
  guard_not_root
  ensure_state_dir
  install_stable_self
  if systemd_user_available; then
    enable_systemd
  else
    warn "systemd --user unavailable; falling back to cron."
    enable_cron
  fi
  log "  update source: ${LOCAL_CHECKOUT:-$CANONICAL_INSTALLER_URL}"
  log "  log file:      $LOG"
  log "  disable with:  omg-autoupdate.sh disable"
}

do_disable() {
  guard_not_root
  local removed=0
  # systemd
  if systemd_user_available; then
    if [ "$DRY_RUN" = 1 ]; then
      log "  [dry-run] systemctl --user disable --now $UNIT_NAME.timer"
      log "  [dry-run] rm $SYSTEMD_USER_DIR/$UNIT_NAME.{timer,service}"
    else
      systemctl --user disable --now "$UNIT_NAME.timer" 2>/dev/null || true
      rm -f "$SYSTEMD_USER_DIR/$UNIT_NAME.timer" "$SYSTEMD_USER_DIR/$UNIT_NAME.service"
      systemctl --user daemon-reload 2>/dev/null || true
      removed=1
    fi
  fi
  # cron
  if command -v crontab >/dev/null 2>&1; then
    if [ "$DRY_RUN" = 1 ]; then
      log "  [dry-run] remove crontab line tagged: $CRON_TAG"
    elif crontab -l 2>/dev/null | grep -qF "$CRON_TAG"; then
      crontab -l 2>/dev/null | grep -vF "$CRON_TAG" | grep -v '^$' | crontab - || true
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
      sed -n '2,25p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' ;;
    *) die "unknown action: $action (expected run|enable|disable|status)" ;;
  esac
}

main "$@"
