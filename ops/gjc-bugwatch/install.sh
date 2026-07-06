#!/usr/bin/env bash
# Idempotent installer for the gjc-bugwatch automation lane:
#   1. systemd --user unit (live HIGH-signal daemon) — enable + start + linger
#   2. cron entry (daily fresh-candidate batch scan, ~08:20)
# Re-runnable safely; never touches the plugin's safety contract.
set -euo pipefail

REPO="${GJC_BUGWATCH_REPO:-/home/devswha/workspace/oh-my-gjc}"
UNIT_SRC="${REPO}/ops/gjc-bugwatch/gjc-bugwatch.service"
UNIT_DIR="${HOME}/.config/systemd/user"
UNIT_DST="${UNIT_DIR}/gjc-bugwatch.service"

echo "== systemd --user unit =="
mkdir -p "${UNIT_DIR}"
cp "${UNIT_SRC}" "${UNIT_DST}"
systemctl --user daemon-reload
systemctl --user enable --now gjc-bugwatch.service
loginctl enable-linger "${USER}" || true
systemctl --user --no-pager --lines=0 status gjc-bugwatch.service || true

echo "== cron: daily batch scan =="
MARKER="# gjc-bugwatch daily scan (fresh-only, hide-resolved)"
CRON_LINE="20 8 * * * ${REPO}/ops/gjc-bugwatch/daily-scan.sh"
current="$(crontab -l 2>/dev/null || true)"
if printf '%s\n' "${current}" | grep -qF "${MARKER}"; then
	echo "cron: already installed"
else
	{ printf '%s\n' "${current}"; printf '\n%s\n%s\n' "${MARKER}" "${CRON_LINE}"; } | crontab -
	echo "cron: added -> ${CRON_LINE}"
fi

echo "== done =="
echo "verify: systemctl --user status gjc-bugwatch.service ; crontab -l | grep gjc-bugwatch"
