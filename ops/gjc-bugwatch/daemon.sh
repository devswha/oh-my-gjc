#!/usr/bin/env bash
# gjc-bugwatch live daemon: tail the newest gjc log via the plugin's follow.ts and
# pipe its output into trigger.ts, which injects a triage instruction into the
# operator's tmux session on every HIGH(gjc-internal) signal. trigger.ts verifies
# arrival before Enter and absence of input residue afterward; failed delivery is
# reported and remains eligible for a later signal instead of being logged as sent.
#
# Runs under a systemd --user unit (see gjc-bugwatch.service). Read-only over
# ~/.gjc/logs; the only side effect is a tmux send-keys into $GJC_BUGWATCH_SESSION.
set -euo pipefail

# systemd user units start with a minimal PATH — make bun/tmux resolvable.
export PATH="/home/devswha/.bun/bin:/usr/local/bin:/usr/bin:/bin:${PATH:-}"

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
DEFAULT_REPO="$(cd -- "${SCRIPT_DIR}/../.." && pwd -P)"
if [[ -n "${GJC_BUGWATCH_REPO:-}" ]]; then
	REPO="$(cd -- "${GJC_BUGWATCH_REPO}" && pwd -P)"
else
	REPO="${DEFAULT_REPO}"
fi
LOGDIR="${GJC_LOG_DIR:-${HOME}/.gjc/logs}"
MIN="${GJC_BUGWATCH_MIN:-medium}"

exec bun run "${REPO}/plugins/oh-my-gajae-code/bin/follow.ts" --dir "${LOGDIR}" --min "${MIN}" \
	| bun run "${REPO}/ops/gjc-bugwatch/trigger.ts"
