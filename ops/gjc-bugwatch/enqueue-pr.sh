#!/usr/bin/env bash
# gjc-bugwatch submission loop — the LAST manual gate.
# A verified draft (PR branch + body already prepared by the agent) is NOT submitted
# automatically. Instead it is enqueued into the horcrux control-tower decision queue
# under the `gjc-pr` source. The operator (하코) approves there; only then does a human
# actually push the branch and open the upstream PR (base dev, per the plugin contract).
#
# Usage: enqueue-pr.sh <draft-path> <one-line-summary>
set -euo pipefail

HORCRUX="${HORCRUX_BIN:-/home/devswha/workspace/horcrux/scripts/horcrux}"

DRAFT="${1:?usage: enqueue-pr.sh <draft-path> <one-line-summary>}"
SUMMARY="${2:?usage: enqueue-pr.sh <draft-path> <one-line-summary>}"

[ -f "${DRAFT}" ] || { echo "enqueue-pr: draft not found: ${DRAFT}" >&2; exit 1; }
[ -x "${HORCRUX}" ] || { echo "enqueue-pr: horcrux CLI not found/executable: ${HORCRUX}" >&2; exit 1; }

exec "${HORCRUX}" queue add gjc-pr "${SUMMARY} | draft: ${DRAFT}"
