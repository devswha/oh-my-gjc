#!/usr/bin/env bash
# tower-notify.sh — inject a message into a live TUI-agent tmux session, with the
# control tower's TUI-injection-trap defenses built in.
#
# Generalized from horcrux's g1-notify.sh. Targets tmux sessions whose window
# name starts with a prefix (default "GJC-"; override with $TOWER_WINDOW_PREFIX).
#
#   tower-notify.sh --list                       list matching sessions
#   tower-notify.sh --peek [N]                    last N lines of each session (glance)
#   tower-notify.sh --models                      running model per gjc session (from gjc logs)
#   tower-notify.sh <session> <message>           send to one session
#   tower-notify.sh --all <message>               send to every matching session
#   tower-notify.sh --dry-run <session|--all> <message>   show target/body, no send
#
# TUI injection traps DEFENDED here (see SKILL.md for the field notes):
#   1. '~'  → the TUI's path autocomplete pollutes the input. REJECTED.
#   2. '(X)' paren + ASCII UPPERCASE letter → the TUI substitutes an emoji.
#      REJECTED (use ①②③ numbering instead).
#   3. a relative path token that EXISTS in the target session's cwd → an
#      autocomplete popup eats Enter, so the body is neither sent nor cleared.
#      WARNED, plus a post-send verify + one retry catches most cases.
set -euo pipefail

PREFIX="${TOWER_WINDOW_PREFIX:-GJC-}"

matching_sessions() {
  # exclude the tmux session running this script (the control tower itself)
  local self=""
  if [ -n "${TMUX:-}" ]; then self="$(tmux display-message -p '#{session_name}' 2>/dev/null || true)"; fi
  tmux list-windows -a -F '#{session_name} #{window_name}' 2>/dev/null \
    | awk -v p="$PREFIX" 'index($2, p) == 1 {print $1}' | sort -u \
    | { if [ -n "$self" ]; then grep -vx "$self" || true; else cat; fi; }
}

DRY=0
if [ "${1:-}" = "--dry-run" ]; then DRY=1; shift; fi

case "${1:-}" in
  --list)
    matching_sessions
    exit 0
    ;;
  --peek)
    n="${2:-4}"
    while IFS= read -r s; do
      echo "== $s"
      tmux capture-pane -p -t "$s" 2>/dev/null | grep -v '^\s*$' | grep -vE '^\s*(⬢|╭|╰|│ >)' | tail -"$n"
    done < <(matching_sessions)
    exit 0
    ;;
  --models)
    # Running model per gjc session, from the most-frequent "model" in the session
    # log (~/.gjc/agent/sessions/<cwd-encoded>/*.jsonl). gjc-specific; best-effort.
    while IFS= read -r s; do
      p="$(tmux display-message -p -t "$s" '#{pane_current_path}' 2>/dev/null || true)"
      [ -z "$p" ] && continue
      enc="${p#"$HOME"}"; enc="${enc//\//-}"
      dir="$HOME/.gjc/agent/sessions/$enc"
      f="$(ls -t "$dir"/*.jsonl 2>/dev/null | head -1 || true)"
      if [ -z "$f" ]; then printf '%-14s %s\n' "$s" "(no log: $p)"; continue; fi
      m="$(python3 - "$f" <<'PY'
import json, sys, collections
c = collections.Counter()
with open(sys.argv[1]) as fh:
    for line in fh:
        try: j = json.loads(line)
        except ValueError: continue
        if not isinstance(j, dict): continue
        for src in (j, j.get("message") or {}):
            if isinstance(src, dict) and src.get("model"):
                c[src["model"]] += 1
print(c.most_common(1)[0][0] if c else "?")
PY
)"
      printf '%-14s %s\n' "$s" "$m"
    done < <(matching_sessions)
    exit 0
    ;;
  --all)
    shift
    mapfile -t targets < <(matching_sessions)
    ;;
  ""|--help|-h)
    echo "usage: tower-notify.sh [--dry-run] {--list|--peek [N]|--models|--all <msg>|<session> <msg>}" >&2
    exit 2
    ;;
  *)
    targets=("$1"); shift
    ;;
esac

MSG="${1:-}"
if [ -z "$MSG" ]; then
  echo "tower-notify: message required." >&2
  exit 2
fi

# Trap 1: tilde — path autocomplete pollution.
case "$MSG" in
  *"~"*) echo "tower-notify: '~' is not allowed (TUI path autocomplete pollution). Reword it." >&2; exit 2 ;;
esac

# Trap 2: '(X)' paren + ASCII uppercase → TUI emoji substitution. Use ①②③.
if printf '%s' "$MSG" | grep -qE '\([A-Z]\)'; then
  echo "tower-notify: '(X)' paren+uppercase is not allowed (TUI substitutes an emoji). Use ①②③ numbering." >&2
  exit 2
fi

# Trap 3: relative path token that may exist in the target cwd → autocomplete
# popup swallows Enter. URLs (://) are fine. Warn only; the send-verify+retry
# below is the final line of defense.
if printf '%s' "$MSG" | grep -qE '(^|[[:space:](])[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+' \
   && ! printf '%s' "$MSG" | grep -q '://'; then
  echo "tower-notify: ⚠ path-like token detected — autocomplete-pollution risk. Prefer spelling it out ('the X file under docs')." >&2
fi

for s in "${targets[@]}"; do
  if ! tmux has-session -t "$s" 2>/dev/null; then
    echo "skip: no session — $s" >&2
    continue
  fi
  if [ "$DRY" = 1 ]; then
    echo "[dry-run] → $s: $MSG"
    continue
  fi
  tmux send-keys -t "$s" Escape
  sleep 0.3
  tmux send-keys -t "$s" C-u
  sleep 0.3
  tmux send-keys -t "$s" -l "$MSG"
  sleep 0.5
  tmux send-keys -t "$s" Enter
  # Send verify: if an autocomplete popup ate Enter, the body lingers in the input
  # box. Retry Enter once; if it still lingers, report failure (manual check).
  sent=1
  for _try in 1 2; do
    sleep 1
    tail5="$(tmux capture-pane -p -t "$s" 2>/dev/null | tail -5)"
    if printf '%s' "$tail5" | grep -q '│ > ' \
       && ! printf '%s' "$tail5" | grep -q 'Type your message'; then
      sent=0
      tmux send-keys -t "$s" Enter
    else
      sent=1
      break
    fi
  done
  if [ "$sent" = 1 ]; then
    echo "sent → $s"
  else
    echo "FAIL → $s: body lingering in input — suspected autocomplete pollution, check manually" >&2
  fi
done
