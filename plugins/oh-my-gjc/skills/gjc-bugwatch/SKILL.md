---
name: gjc-bugwatch
description: gjc를 dogfooding하며 놓친 gjc 자체 버그를 라이브 모니터링 + 배치 스캔으로 잡아 upstream 이슈/PR 초안으로 모은다. "버그 모니터링 시작 / bugwatch 켜줘 / 버그 스캔 돌려줘 / gjc 버그 찾아줘 / 놓친 버그 있나 / 로그에서 에러 뽑아줘 / PR 낼 버그 정리" 같은 요청에 활성화. ~/.gjc/logs(+선택 세션)에서 런타임 에러/크래시를 추출·중복제거·stale표시·레닥션하고, gajae-code clone에서 재현·근거 확인 후 .gjc/bugwatch/drafts/에 초안만 저장한다(자동 PR 없음, 제출은 사람이).
---

# gjc-bugwatch — gjc dogfooding 버그 수집기

목적: gjc 세션이 디스크에 남긴 흔적(`~/.gjc/logs`의 구조화 로그 = 핵심, 세션 JSONL =
선택)을 **배치로** 훑어, 사용자가 몰랐던 **gjc 자체 버그**를 뽑아 upstream 제출용
**초안**으로 모은다. 초안만 만든다 — 제출은 사람이.

## 두 축: 라이브 모니터 + 배치 스캐너
- **라이브 모니터** (`bin/follow.ts --dir`): 최신 `gjc*.log`를 tail해 error/gjc-internal(🔴/🟠)이 뜨는 즉시 알림. 날짜 롤오버(`.log.gz`) 견딤. 세션 단위(persistent).
- **배치 스캐너** (`bin/collect.ts`): 그동안 쌓인 로그(.gz 포함)를 몰아 읽어 중복 묶고 심각도순 정렬, 최근 `--fresh-days`(기본 2) 재발 없는 건 ⏳stale(이미 고쳐졌을 확률)로 표시. 초안 만들 후보는 여기서 나온다.
- **resolved 원장** (`.gjc/bugwatch/resolved.jsonl`): upstream에서 **이미 고쳐진 게 확인된** 버그를 fingerprint로 기록해 둔 목록. collector가 이걸 읽어 매칭 후보를 `✅resolved`로 태깅하고 맨 아래로 가라앉힌다(`--hide-resolved`/`--fresh-only`로 숨김). 죽은 버그를 매 스캔마다 다시 쫓는 혼동 방지. `RESOLVED.md`는 사람용 표.

## 활성화 시 흐름 (매 활성화마다)

경로: 설치 캐시면 `~/.gjc/plugins/cache/plugins/oh-my-gjc___oh-my-gjc___*/bin/`로 glob 해석(`sort -V | tail -1`로 최신 — 마켓플레이스명이 곧 코어 플러그인명이라 반드시 `oh-my-gjc___oh-my-gjc___*`로 앵커). 레포에서 직접 쓰면 `plugins/oh-my-gjc/bin/`.

1. **라이브 모니터 켜기** — `monitor` 도구로 persistent 실행 (이미 떠 있으면 중복 실행 금지, `ps -eo pid,args | grep follow.ts`로 확인 후):
   `bun run <bin>/follow.ts --dir ~/.gjc/logs --min medium`
   → 이후 신호는 이 대화로 뜬다.
2. **초기 배치 스캔** — `bun run <bin>/collect.ts --days 7 --fresh-days 2 --json` → **fresh(비-stale)** 후보만 진지하게 본다. stale은 이미 고쳐졌을 확률이 높으니 기본 스킵.
3. **보고** — fresh 후보 목록(severity/category/count/last-seen)만 요약하고, "뭐부터 팔지" 물어본다. 자동으로 초안·PR 만들지 않는다.
4. 사용자가 고르면 아래 파이프라인(트리아지→근거→초안)으로 진행.

## 파이프라인 (세부는 `/omg:bugwatch-scan` 커맨드 본문과 동일)

1. **수집** — `bin/collect.ts`를 `--json`으로 실행. 기본 로그만(고정밀), `--include-sessions`로 세션 추가(노이즈↑, 현재 세션 자동 제외). collector가 노이즈 필터·중복제거·레닥션(이메일/UUID/토큰)을 이미 수행.
2. **트리아지** — `severity` 높은 순으로 각 후보 판정: gjc 버그(`gjc-internal`/크래시) vs 환경/사용자 실수(dismiss). **`✅resolved`(resolved.jsonl에 있음) 후보는 이미 고쳐진 것이니 스킵** — PR/초안 만들지 않는다. 이미 있는 `fingerprint` 초안도 스킵.
3. **근거 확인 (dev 기준 + upstream 중복)** — 초안 전 **upstream 이슈/PR 트래커를 검색**(`gh search issues/prs --repo Yeachan-Heo/gajae-code --state all`, 없으면 `web_search`)해 이미 보고/수정된 건이면 스킵(중복 PR 방지 — 로컬 dedup은 남의 이슈를 못 막는다). 소스는 **`dev` 브랜치** clone에서 확인한다(fix는 dev에 먼저 머지 → main만 보면 dead-bug 재드래프트). `git clone --depth 1 -b dev …` / 재사용 시 `git fetch origin dev && checkout -B dev origin/dev`. 스택 심볼을 `search`로 찾아 원인 파일·라인 특정, 최소 수정 방향 제안.
4. **초안 저장 · 또는 resolved 기록** — 새 버그면 `.gjc/bugwatch/drafts/<severity>-<slug>-<fp8>.md` + `INDEX.md` 갱신. 반대로 **근거 확인 중 이미 upstream에서 머지/클로즈된 걸 발견하면 초안 대신 `.gjc/bugwatch/resolved.jsonl`에 한 줄 추가**(fingerprint·issue/pr·note) → 다음 스캔부터 `✅resolved`로 자동 제외. ⚠ `.gjc/**`는 런타임 소유라 `write`/`edit` 툴로 못 쓴다 → `/tmp`에 `write` 후 `cp`(또는 `bun -e` fs)로 옮기는 **서브프로세스 경로**로 기록한다.
5. **보고** — 수집/초안 수 + 경로만 요약.

초안 형식(제목·fingerprint·severity/count·증상·재현(추정)·원인(소스근거)·제안수정)은
커맨드 본문의 템플릿을 그대로 쓴다.

## 절대 규칙 (약화 금지)

- **초안만.** `gh issue/pr create`·`git push`·커밋·외부 제출 금지. 사람이 검토 후 제출.
- **⛔ 제출 지시 시 upstream PR은 `dev` 브랜치로만 (`main` 금지).** push 권한 없음 → fork(`devswha/gajae-code`) 브랜치 푸시 후 `gh pr create --repo Yeachan-Heo/gajae-code --base dev --head devswha:<branch>`. 브랜치는 `origin/dev` 기준.
- **read-only.** gjc 로그/세션/소스는 읽기만. `~/.gjc` 원본 수정 금지.
- **레닥션 유지.** 초안에 비밀(이메일/토큰/계정ID) 금지.
- **중복 금지 (로컬 + upstream).** 같은 fingerprint 초안이 있으면 재생성 안 함. 추가로 초안·제출 전 upstream 이슈/PR 트래커를 검색해 이미 보고/수정된 건이면 새로 안 만든다. 소스 근거는 fix가 먼저 들어가는 `dev` 기준.
- **추정과 사실 구분.** 소스로 확인 못 한 원인/수정은 "추정" 표기. 날조 금지.
- 산출물은 전부 `.gjc/`(gitignore) 아래 — 레포에 커밋되지 않는다. `.gjc/**`는 에이전트 mutation 툴로 못 쓰므로 서브프로세스(bun/cp)로 기록.
