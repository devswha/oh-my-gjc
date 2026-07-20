#!/usr/bin/env bash
# gjc-bugwatch submission loop — the LAST manual gate.
# A verified draft (PR branch + body already prepared by the agent) is NOT submitted
# automatically. Instead it is enqueued into the horcrux control-tower DECISION queue
# (kind=decision — 하코 승인 필요 건). The operator approves there; only then does a
# human actually push the branch and open the upstream PR (base dev, per the plugin
# contract).
#
# ⚠ Transport: the tower HTTP API (`POST /queue/add`), NOT the `horcrux queue add`
# CLI — the CLI writes the queue file directly and races the running tower server's
# load-save cycle (07-10 실증 사고: 서버가 메모리 상태를 저장하며 CLI 직접 쓰기가
# 유실됨). All writes while the tower is up must go through the server.
#
# Usage: enqueue-pr.sh <draft-path> <one-line-summary>
set -euo pipefail

TOWER_URL="${TOWER_URL:-http://127.0.0.1:3019}"

DRAFT="${1:?usage: enqueue-pr.sh <draft-path> <one-line-summary>}"
SUMMARY="${2:?usage: enqueue-pr.sh <draft-path> <one-line-summary>}"

[ -f "${DRAFT}" ] || { echo "enqueue-pr: draft not found: ${DRAFT}" >&2; exit 1; }

# 고정 /tmp 이름은 선점 심볼릭 링크로 클로버 가능 — mktemp(0600) + EXIT 정리로 대체.
RESP="$(mktemp)"
trap 'rm -f "${RESP}"' EXIT

HTTP_CODE=$(curl -sS -o "${RESP}" -w '%{http_code}' -X POST "${TOWER_URL}/queue/add" \
  --data-urlencode "source=gjc-bugwatch" \
  --data-urlencode "text=${SUMMARY} | draft: ${DRAFT}" \
  --data "kind=decision")

if [ "${HTTP_CODE}" != "200" ]; then
  echo "enqueue-pr: tower rejected (HTTP ${HTTP_CODE}): $(head -c 200 "${RESP}" 2>/dev/null)" >&2
  exit 1
fi
echo "enqueue-pr: queued (kind=decision, source=gjc-bugwatch): ${SUMMARY}"
