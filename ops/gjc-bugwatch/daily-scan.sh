#!/usr/bin/env bash
# gjc-bugwatch daily batch cadence — runs from cron (see install.sh, ~08:20).
# Scans accumulated logs for fresh, non-resolved candidates and, only when there
# are any, injects a digest triage instruction into the operator's tmux session.
# Read-only: no drafts, no submission — that stays an agent/session decision.
set -euo pipefail

export PATH="/home/devswha/.bun/bin:/usr/local/bin:/usr/bin:/bin:${PATH:-}"

# cron은 systemd 유닛 Environment를 상속하지 않는다 — 게이트 미설정이면 trigger.ts가
# 무조건 통과해 관제탑이 닫혀 있어도 주입된다(게이트 우회). live 데몬과 같은 기본값을 강제.
export GJC_BUGWATCH_GATE_SESSION="${GJC_BUGWATCH_GATE_SESSION:-horcrux}"

REPO="${GJC_BUGWATCH_REPO:-/home/devswha/workspace/oh-my-gjc}"
DAYS="${GJC_BUGWATCH_DAYS:-7}"
LOG="${GJC_BUGWATCH_CRON_LOG:-${REPO}/.gjc/bugwatch/daily-scan.log}"

cd "${REPO}"
mkdir -p "$(dirname "${LOG}")"

ts() { date -Iseconds; }

JSON="$(bun run plugins/oh-my-gjc/bin/collect.ts \
	--days "${DAYS}" --fresh-only --hide-resolved --json 2>>"${LOG}" || echo '[]')"

# Pipe the candidate array into trigger.ts --daily; it decides whether to inject.
RESULT="$(printf '%s' "${JSON}" | bun run "${REPO}/ops/gjc-bugwatch/trigger.ts" --daily 2>>"${LOG}")"
printf '%s  %s\n' "$(ts)" "${RESULT}" >>"${LOG}"
