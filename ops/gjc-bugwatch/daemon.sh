#!/usr/bin/env bash
# gjc-bugwatch live daemon: tail the newest gjc log via the plugin's follow.ts and
# pipe its output into trigger.ts, which injects a triage instruction into the
# operator's tmux session on every HIGH(gjc-internal) signal.
#
# Runs under a systemd --user unit (see gjc-bugwatch.service). Read-only over
# ~/.gjc/logs; the only side effect is a tmux send-keys into $GJC_BUGWATCH_SESSION.
set -euo pipefail

# systemd user units start with a minimal PATH — make bun/tmux resolvable.
export PATH="/home/devswha/.bun/bin:/usr/local/bin:/usr/bin:/bin:${PATH:-}"

REPO="${GJC_BUGWATCH_REPO:-/home/devswha/workspace/oh-my-gjc}"
LOGDIR="${GJC_LOG_DIR:-${HOME}/.gjc/logs}"
MIN="${GJC_BUGWATCH_MIN:-medium}"

exec bun run "${REPO}/plugins/oh-my-gjc/bin/follow.ts" --dir "${LOGDIR}" --min "${MIN}" \
	| bun run "${REPO}/ops/gjc-bugwatch/trigger.ts"
