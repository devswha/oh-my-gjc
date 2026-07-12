# ops/gjc-bugwatch — automation lane (outside the plugin)

Promotes the **manual** gjc-bugwatch lane to an **automatic cadence** without weakening
the plugin's safety contract. The plugin (`plugins/oh-my-gjc`) stays **drafts-only,
read-only, redacted, no-fabrication**. Everything here is glue — systemd/cron/tmux — and
**never submits anything**. It only *injects a triage instruction* into the operator's
tmux session so the agent picks up the work; a human still approves every upstream PR.

## Pieces

| file | role |
|---|---|
| `trigger.ts` | testable core: HIGH-signal detection, dedup cooldown, digest builder, tmux injection (tilde-refusing) |
| `daemon.sh` | `follow.ts --dir ~/.gjc/logs \| trigger.ts` — long-running live tail |
| `gjc-bugwatch.service` | systemd **user** unit for `daemon.sh` (enable + linger) |
| `daily-scan.sh` | cron job: `collect --fresh-only --hide-resolved --json \| trigger.ts --daily` |
| `enqueue-pr.sh` | submission loop: `POST $TOWER_URL/queue/add` (source=gjc-bugwatch, kind=decision) — CLI 직접 쓰기 금지(타워 load-save 경합, 07-10 사고) |
| `install.sh` | idempotent: install/enable unit + register cron |
| `test/trigger.test.ts` | `bun test` (same convention as the plugin's `test/`) |

## Install

```sh
bash /home/devswha/workspace/oh-my-gjc/ops/gjc-bugwatch/install.sh
```

Idempotent. Installs the user unit (enable + `--now` + linger) and adds the daily cron
entry (~08:20) if not already present.

## Cadence

1. **Live** — the daemon tails the newest gjc log. On a HIGH(`gjc-internal`) signal it
   dedupes (30 min cooldown per signature) and injects a triage prompt into the
   tmux session set by env `GJC_BUGWATCH_SESSION` (현재 유닛 설정 `gjc-pr` — PR 전담 세션; 코드 기본값 `omg`). The agent then runs the normal scan pipeline (reproduce,
   source-verify against the `dev` clone) and drafts if it's a real, new bug.
2. **Daily** — cron runs the batch scan; only when there are fresh (non-stale,
   non-resolved) candidates does it inject a digest triage prompt.
3. **Submit loop** — a verified draft (PR branch + body prepared) is enqueued to the
   horcrux control-tower queue, NOT submitted. On operator approval a human pushes the
   fork branch and opens the upstream PR (`--base dev`).

## Rules (do not weaken)

- **No unsupervised external submission.** `gh pr/issue create`, `git push`, commits —
  all remain human-gated via the horcrux queue.
- **tmux send-keys never contains a tilde (`~`).** Injected payloads use absolute paths;
  `injectTmux` throws if a `~` slips in.
- **Automation stays outside the plugin.** `plugins/oh-my-gjc` is untouched; its
  drafts-only / read-only / redaction / no-fabrication contract is intact.

## Configuration (env)

| var | default | used by |
|---|---|---|
| `GJC_BUGWATCH_SESSION` | `omg` | trigger.ts (tmux target) |
| `GJC_BUGWATCH_MIN` | `medium` | daemon.sh (follow.ts `--min`) |
| `GJC_BUGWATCH_COOLDOWN_MS` | `1800000` | trigger.ts dedup window |
| `GJC_BUGWATCH_DRYRUN` | _(unset)_ | trigger.ts — log the tmux command instead of running it |
| `GJC_BUGWATCH_REPO` | `/home/devswha/workspace/oh-my-gjc` | all scripts |
| `HORCRUX_BIN` | `/home/devswha/workspace/horcrux/scripts/horcrux` | enqueue-pr.sh |

## Verify

```sh
systemctl --user status gjc-bugwatch.service          # active (running)
crontab -l | grep gjc-bugwatch                        # daily entry present
printf '🔴 [gjc-internal] (pid 1) boom\n' | GJC_BUGWATCH_DRYRUN=1 bun run trigger.ts   # dryrun inject
bun test ops/gjc-bugwatch/test/trigger.test.ts        # unit tests
```
