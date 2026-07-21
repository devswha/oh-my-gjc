#!/usr/bin/env bash
# Idempotent installer for the gjc-bugwatch automation lane:
#   1. systemd --user unit (live HIGH-signal daemon) — enable + start + linger
#   2. cron entry (daily fresh-candidate batch scan, ~08:20)
# Re-runnable safely; never touches the plugin's safety contract.
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
DEFAULT_REPO="$(cd -- "${SCRIPT_DIR}/../.." && pwd -P)"
if [[ -n "${GJC_BUGWATCH_REPO:-}" ]]; then
	REPO="$(cd -- "${GJC_BUGWATCH_REPO}" && pwd -P)"
else
	REPO="${DEFAULT_REPO}"
fi

BUGWATCH_DIR="${REPO}/ops/gjc-bugwatch"
DAEMON="${BUGWATCH_DIR}/daemon.sh"
DAILY_SCAN="${BUGWATCH_DIR}/daily-scan.sh"
TRIGGER="${BUGWATCH_DIR}/trigger.ts"
UNIT_SRC="${BUGWATCH_DIR}/gjc-bugwatch.service"
FOLLOW="${REPO}/plugins/oh-my-gajae-code/bin/follow.ts"
COLLECT="${REPO}/plugins/oh-my-gajae-code/bin/collect.ts"
UNIT_DIR="${HOME}/.config/systemd/user"
UNIT_DST="${UNIT_DIR}/gjc-bugwatch.service"

for required in "${DAEMON}" "${DAILY_SCAN}" "${TRIGGER}" "${UNIT_SRC}" "${FOLLOW}" "${COLLECT}"; do
	if [[ ! -f "${required}" ]]; then
		printf 'gjc-bugwatch: required file is missing: %s\n' "${required}" >&2
		exit 1
	fi
done

echo "== systemd --user unit =="
mkdir -p "${UNIT_DIR}"
UNIT_TMP="$(mktemp "${UNIT_DIR}/gjc-bugwatch.service.XXXXXX")"
CRON_TMP=""
trap 'rm -f "${UNIT_TMP}" "${CRON_TMP}"' EXIT

SYSTEMD_DAEMON="${DAEMON//\\/\\\\}"
SYSTEMD_DAEMON="${SYSTEMD_DAEMON//\"/\\\"}"
SYSTEMD_DAEMON="${SYSTEMD_DAEMON//%/%%}"
SYSTEMD_DAEMON="${SYSTEMD_DAEMON//&/\\&}"
SYSTEMD_DAEMON="${SYSTEMD_DAEMON//|/\\|}"
sed "s|@GJC_BUGWATCH_DAEMON@|${SYSTEMD_DAEMON}|g" "${UNIT_SRC}" >"${UNIT_TMP}"
if grep -qF '@GJC_BUGWATCH_DAEMON@' "${UNIT_TMP}"; then
	printf 'gjc-bugwatch: unit template was not rendered\n' >&2
	exit 1
fi
mv "${UNIT_TMP}" "${UNIT_DST}"
systemctl --user daemon-reload
systemctl --user enable --now gjc-bugwatch.service
systemctl --user restart gjc-bugwatch.service
loginctl enable-linger "${USER}" || true
systemctl --user --no-pager --lines=0 status gjc-bugwatch.service || true

echo "== cron: daily batch scan =="
MARKER="# gjc-bugwatch daily scan (fresh-only, hide-resolved)"
CRON_LINE="20 8 * * * $(printf '%q' "${DAILY_SCAN}") ${MARKER}"
current="$(crontab -l 2>/dev/null || true)"
CRON_TMP="$(mktemp)"
if [[ -n "${current}" ]]; then
	skip_legacy_cron=0
	while IFS= read -r line || [[ -n "${line}" ]]; do
		if [[ "${line}" == *"${MARKER}"* ]]; then
			skip_legacy_cron=1
			continue
		fi
		if ((skip_legacy_cron)); then
			skip_legacy_cron=0
			if [[ "${line}" == *"/ops/gjc-bugwatch/daily-scan.sh"* ]]; then
				continue
			fi
		fi
		printf '%s\n' "${line}" >>"${CRON_TMP}"
	done <<<"${current}"
fi
printf '%s\n' "${CRON_LINE}" >>"${CRON_TMP}"
crontab "${CRON_TMP}"
echo "cron: installed -> ${CRON_LINE}"

echo "== done =="
echo "verify: systemctl --user status gjc-bugwatch.service ; crontab -l | grep gjc-bugwatch"
