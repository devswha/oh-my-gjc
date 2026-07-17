---
name: session-observer
description: Explicit /omg:session-observer only — launch the token-free, read-only live GJC session conversation observer. Never activate from natural-language requests.
---

# Session observer

This capability activates **only** through `/omg:session-observer`. It never auto-activates from natural-language requests to watch, inspect, summarize, follow, or monitor a session.

## Safety and token boundary

- The observer engine is `bin/session-observer.ts`. It is token-free: JSONL is its authoritative/default source; optional SDK enrichment is deliberately not used.
- It is strictly read-only. Never inject into, control, write to, or otherwise alter an observed session. It performs no upstream activity and makes no network or LLM calls.
- Direct terminal invocation of the engine is fully token-free.
- The slash command spends only its single launch turn. It **must** use `--launch-window` to open a detached tmux observer window. Observed text must never enter a GJC tool result or this session transcript; ongoing viewing consumes no model tokens.

## Invocation contract

Before launching, resolve the user's requested settings into these safe Bash environment fields; do not interpolate request text into shell source:

- Target only by exact `--tmux NAME` or exact `--session ID`: set `OBSERVER_TARGET_KIND` to `tmux` or `session` and `OBSERVER_TARGET_VALUE` to that exact value.
- `OBSERVER_MODE`: `conversation` (default) or `user-only`.
- `OBSERVER_THINKING`: `0` (default) or `1`; thinking display is opt-in.
- `OBSERVER_FOLLOW`: `1` (default) or `0`.
- `OBSERVER_HISTORY`: a bounded non-negative integer (default `20`; maximum `200`).

Use exactly one GJC Bash call with those fields in `env`. The Bash call must return only the runner's launch receipt or a short launch error — never conversation text.

```bash
set -euo pipefail
[ -n "${TMUX:-}" ] || { printf '%s\n' 'session-observer requires tmux' >&2; exit 1; }
command -v bun >/dev/null 2>&1 || { printf '%s\n' 'session-observer requires Bun' >&2; exit 1; }
: "${OBSERVER_TARGET_KIND:?session-observer target kind is required}"
: "${OBSERVER_TARGET_VALUE:?session-observer target value is required}"
: "${OBSERVER_MODE:=conversation}"
: "${OBSERVER_THINKING:=0}"
: "${OBSERVER_FOLLOW:=1}"
: "${OBSERVER_HISTORY:=20}"
case "$OBSERVER_TARGET_KIND" in tmux|session) ;; *) printf '%s\n' 'invalid session-observer target kind' >&2; exit 2 ;; esac
case "$OBSERVER_MODE" in conversation|user-only) ;; *) printf '%s\n' 'invalid session-observer mode' >&2; exit 2 ;; esac
case "$OBSERVER_THINKING" in 0|1) ;; *) printf '%s\n' 'invalid session-observer thinking setting' >&2; exit 2 ;; esac
case "$OBSERVER_FOLLOW" in 0|1) ;; *) printf '%s\n' 'invalid session-observer follow setting' >&2; exit 2 ;; esac
case "$OBSERVER_HISTORY" in ''|*[!0-9]*) printf '%s\n' 'invalid session-observer history setting' >&2; exit 2 ;; esac
(( 10#$OBSERVER_HISTORY <= 200 )) || { printf '%s\n' 'session-observer history exceeds 200' >&2; exit 2; }

uid="$(id -u)"
project_binding="$PWD/.gjc/runtimes/oh-my-gjc/root"
user_binding="$HOME/.gjc/agent/runtimes/oh-my-gjc/root"
if [ -e "$project_binding" ] || [ -L "$project_binding" ]; then
  binding="$project_binding"
else
  binding="$user_binding"
fi
[ -f "$binding" ] && [ ! -L "$binding" ] || { printf '%s\n' 'trusted oh-my-gjc root binding not found' >&2; exit 1; }
[ "$(stat -c %u -- "$binding")" = "$uid" ] && [ "$(stat -c %a -- "$binding")" = 600 ] || { printf '%s\n' 'oh-my-gjc root binding is unsafe' >&2; exit 1; }
mapfile -t binding_lines < "$binding"
[ "${#binding_lines[@]}" -eq 1 ] && [ -n "${binding_lines[0]}" ] || { printf '%s\n' 'oh-my-gjc root binding is invalid' >&2; exit 1; }
root="$(readlink -f -- "${binding_lines[0]}")"
[ "$root" = "${binding_lines[0]}" ] && [ -d "$root" ] && [ ! -L "$root" ] || { printf '%s\n' 'oh-my-gjc root binding is not canonical' >&2; exit 1; }
runner="$root/bin/session-observer.ts"
[ -f "$runner" ] && [ ! -L "$runner" ] && [ "$(readlink -f -- "$runner")" = "$runner" ] || { printf '%s\n' 'trusted session-observer runner not found' >&2; exit 1; }

argv=("$runner" --launch-window --mode "$OBSERVER_MODE" --history "$OBSERVER_HISTORY")
[ "$OBSERVER_THINKING" = 0 ] || argv+=(--thinking)
[ "$OBSERVER_FOLLOW" = 0 ] || argv+=(--follow)
case "$OBSERVER_TARGET_KIND" in
  tmux) argv+=(--tmux "$OBSERVER_TARGET_VALUE") ;;
  session) argv+=(--session "$OBSERVER_TARGET_VALUE") ;;
esac
exec bun "${argv[@]}"
```

Do not call `tmux capture-pane`, SDK APIs, network tools, LLM tools, or any alternative observer path from this command. Do not poll or relay observer output after the receipt.
