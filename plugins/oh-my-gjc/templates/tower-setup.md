---
description: tower 관제탑 셋업 — 네이티브 스킬+커맨드 설치, bin 경로 해석, 실시간 완료 감시(session_watch) 상주 시작 + 30분 백업 순찰 재등록 안내. 멱등.
argument-hint: "(인자 없음)"
---

# /omg:tower-setup

관제탑(tower)을 이 세션에 셋업한다. **모든 단계 멱등** — 이미 된 것은 건너뛴다.

## Step 0 — 플러그인 루트 해석 (`$TOWER_ROOT`)

```bash
P="$(ls -d ~/.gjc/plugins/cache/plugins/oh-my-gjc___oh-my-gjc___*/bin/session_watch.py 2>/dev/null | sort -V | tail -1)"
TOWER_ROOT="${P:+$(dirname "$(dirname "$P")")/}"
[ -z "$TOWER_ROOT" ] && [ -d plugins/oh-my-gjc ] && TOWER_ROOT="plugins/oh-my-gjc/"
echo "TOWER_ROOT=$TOWER_ROOT"
```
비면 `gjc plugin install oh-my-gjc@oh-my-gjc`(셸)를 안내하고 멈춘다.

## Step 1 — 네이티브 스킬 + 커맨드 설치 (필수)

gjc는 플러그인 스킬을 세션에 로드하지 않고, 커맨드의 canonical 표면은 네이티브 `/omg:*`다. 네이티브로 1회 복사:

```bash
bash "${TOWER_ROOT}bin/install-skill.sh" all
```
- 스킬 `tower` → `~/.gjc/agent/skills/tower/SKILL.md` (트리거 자동활성화)
- 커맨드 → `~/.gjc/agent/commands/omg:tower-setup.md` → `/omg:tower-setup`

⚠ **최초 부트스트랩은 셸에서**(닭-달걀): `bash "$(ls -d ~/.gjc/plugins/cache/plugins/oh-my-gjc___oh-my-gjc___*/bin/install-skill.sh 2>/dev/null | sort -V | tail -1)" all`. 설치 후 **새 세션**을 열거나 `/move .`로 팔레트 재빌드. 플러그인 업그레이드 후 재실행.

## Step 2 — 설정 확인 (관제탑 세션 이름·창 접두어)

- 이 관제탑 세션의 tmux 이름을 확인(`tmux display-message -p '#{session_name}'`) → 감시 제외 대상.
- 감시할 세션의 창 이름 접두어(`TOWER_WINDOW_PREFIX`, 기본 `GJC-`)와 큐 경로(`TOWER_QUEUE_FILE` > `TOWER_HOME/queue.json` > `~/.gjc/tower/queue.json`)를 필요 시 설정. 예시: `${TOWER_ROOT}references/tower.config.example.json`.

## Step 3 — 실시간 완료 감시 상주 시작 (세션 귀속)

이미 떠 있지 않으면(`ps -eo pid,args | grep session_watch.py`로 확인) `monitor` 도구로 상주 실행:

```bash
python3 "${TOWER_ROOT}bin/session_watch.py" --exclude <이 관제탑 세션명> [--config <json>]
```
→ 이후 busy→idle 이벤트가 이 대화로 스트림된다. 이벤트 수신 시 행동은 tower SKILL의 운영 루프(판별→적재→보고→릴레이)를 따른다.

## Step 4 — 백업 순찰 재등록 안내 (선택)

30분 주기 순찰을 gjc cron 예약 프롬프트로 등록(글랜스→새 완료 감지→큐 적재→새 항목만 보고, 빈 순찰 무보고). **감시·순찰은 세션 귀속** — 관제탑 세션을 새로 열면 Step 3~4를 재등록한다.

## Step 5 — 요약

각 Step 결과를 체크리스트 한 줄(✓ 완료 / → 제안 / – 해당없음)로 요약하고 끝낸다. 장황 금지. 큐 조회는 `tower queue`, 전파는 `tower notify <세션|--all> "<메시지>"`, 글랜스는 `tower peek [N]`.
