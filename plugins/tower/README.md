# tower

**Control-tower orchestration for a standing fleet of TUI-agent (gjc) sessions.**

One supervisor session watches many independent agent sessions, injects direction,
and collects the decisions a human must make into an operator queue. Generalized
from a live control-tower setup (horcrux); the human-specific bits are stripped and
everything runtime-specific is configurable.

## What it is

- **`bin/session_watch.py`** — polls each watched tmux session's pane, classifies
  busy ↔ idle, and emits one event only on a **busy → idle** transition (plus a
  one-time `INIT` for sessions already idle at boot). Anti-flap via a confirm
  streak. Config-driven (window prefix, busy/idle marks, exclude, interval).
- **`bin/tower-notify.sh`** — inject a message into a live session via tmux, with
  **TUI-injection-trap defenses** built in (see below).
- **`bin/queue_store.py`** + **`bin/tower`** — an idempotent operator decision
  queue (JSON) and a CLI over it.
- **`skills/tower/SKILL.md`** — codifies the operational loop.

## Install

```
/plugin marketplace add devswha/oh-my-gjc
/plugin install tower@oh-my-gjc
```

gjc does not load plugin skills/commands into a session, so do a one-time NATIVE
install from the shell, then open a new session:

```
bash "$(ls -d ~/.gjc/plugins/cache/plugins/oh-my-gjc___tower___*/bin/install-skill.sh 2>/dev/null | sort -V | tail -1)" all
# then in a new gjc session:
/tower:setup
```

## Operational loop (in the SKILL)

1. **Boot re-registration** — the watcher + patrol are session-bound; re-register
   them (via `monitor` + a cron patrol) whenever the tower session restarts.
2. **On event** — classify (peek) → enqueue human decisions (idempotent) → report
   a one-line summary → relay follow-ups into the session.
3. **Patrol** (30-min backup sweep) — report only new items; **an empty patrol
   reports nothing.**
4. **Single notification channel** — remote alerts funnel through the tower only.

## TUI injection traps (defended)

`tower-notify.sh` guards the tmux `send-keys` boundary:

1. **`~`** → path autocomplete pollution — **rejected**.
2. **`(X)`** paren + uppercase → the TUI substitutes an emoji — **rejected** (use
   `①②③`).
3. **A real relative-path token** in the message → an autocomplete popup eats
   Enter (non-send + pollution) — **warned**, plus a post-send verify + one retry.
   Spell file references out in words.

## Config

Env / flags (explicit flags win over the config file):

- `TOWER_WINDOW_PREFIX` (default `GJC-`) — tmux window-name prefix to watch.
- `TOWER_QUEUE_FILE` > `TOWER_HOME/queue.json` > `~/.gjc/tower/queue.json` — queue path.
- `session_watch.py --config <json>` — see [`references/tower.config.example.json`](./references/tower.config.example.json).
- Always exclude the tower session itself from watching.

## Not the same as gjc `team`

- **team** — coordinates **work workers** on one task (shared state, mailbox,
  worktrees, verification lanes). Workers receive slices and produce code.
- **tower** — a **standing fleet** of already-running independent sessions:
  observe, inject direction, and queue **human** decisions. It does not divide
  work; it observes state and brokers human decisions. You can even run `team`
  workers and watch those sessions with `tower`.

## Safety

- The tower injects direction and observes; it does **not** decide for the human.
  Real trades/settlement, real payments/fund moves, go-live switches, and
  financial-account login/ops are always the human's own action.
- `tower-notify.sh` only drives tmux `send-keys`; it never bypasses a target
  session's own approval gates.

## CLI quick reference

```
tower queue                 list pending decisions
tower queue add <src> <txt> enqueue (idempotent)
tower queue done <id>       resolve
tower list | peek [N] | models
tower notify <session|--all> "<message>"
tower watch --exclude <tower-session> [--config <json>]
```
