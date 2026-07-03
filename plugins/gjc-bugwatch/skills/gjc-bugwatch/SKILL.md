---
name: gjc-bugwatch
description: gjc를 쓰다 놓친 gjc 자체 버그를 배치 스캔해 upstream 이슈/PR 초안으로 모은다. "버그 스캔 돌려줘 / gjc 버그 찾아줘 / 놓친 버그 있나 / 로그에서 에러 뽑아줘 / bugwatch / PR 낼 버그 정리" 같은 요청에 활성화. ~/.gjc/logs(+선택 세션)에서 런타임 에러/크래시를 추출·중복제거·레닥션하고, gajae-code clone에서 재현·근거 확인 후 .gjc/bugwatch/drafts/에 초안만 저장한다(자동 PR 없음).
---

# gjc-bugwatch — gjc dogfooding 버그 수집기

목적: gjc 세션이 디스크에 남긴 흔적(`~/.gjc/logs`의 구조화 로그 = 핵심, 세션 JSONL =
선택)을 **배치로** 훑어, 사용자가 몰랐던 **gjc 자체 버그**를 뽑아 upstream 제출용
**초안**으로 모은다. 초안만 만든다 — 제출은 사람이.

## 형태 = 배치 스캐너
실시간 감시가 아니라 "그동안 쌓인 로그를 몰아서 읽는" 방식. 로그에 다 남으므로
실시간일 필요가 없고, 몰아 읽어야 같은 버그를 중복 묶고 심각도순 정렬해 깔끔한
초안이 나온다. 상시 감시가 필요하면 별도 라이브 tail(로드맵)로 얹는다.

## 파이프라인 (세부는 `/gjc-bugwatch:scan` 커맨드 본문과 동일)

1. **수집** — `bin/collect.ts`를 `--json`으로 실행. 기본 로그만(고정밀), `--include-sessions`로 세션 추가(노이즈↑, 현재 세션 자동 제외). collector가 노이즈 필터·중복제거·레닥션(이메일/UUID/토큰)을 이미 수행.
2. **트리아지** — `severity` 높은 순으로 각 후보 판정: gjc 버그(`gjc-internal`/크래시) vs 환경/사용자 실수(dismiss). 이미 있는 `fingerprint` 초안은 스킵.
3. **근거 확인** — `/tmp`의 gajae-code clone(없으면 shallow clone)에서 스택 심볼을 `search`로 찾아 원인 파일·라인 특정, 가능하면 최소 수정 방향 제안.
4. **초안 저장** — `.gjc/bugwatch/drafts/<severity>-<slug>-<fp8>.md` + `INDEX.md` 갱신. ⚠ `.gjc/**`는 런타임 소유라 `write`/`edit` 툴로 못 쓴다 → `/tmp`에 `write` 후 `cp`(또는 `bun -e` fs)로 옮기는 **서브프로세스 경로**로 기록한다.
5. **보고** — 수집/초안 수 + 경로만 요약.

초안 형식(제목·fingerprint·severity/count·증상·재현(추정)·원인(소스근거)·제안수정)은
커맨드 본문의 템플릿을 그대로 쓴다.

## 절대 규칙 (약화 금지)

- **초안만.** `gh issue/pr create`·`git push`·커밋·외부 제출 금지. 사람이 검토 후 제출.
- **read-only.** gjc 로그/세션/소스는 읽기만. `~/.gjc` 원본 수정 금지.
- **레닥션 유지.** 초안에 비밀(이메일/토큰/계정ID) 금지.
- **중복 금지.** 같은 fingerprint 초안이 있으면 재생성 안 함.
- **추정과 사실 구분.** 소스로 확인 못 한 원인/수정은 "추정" 표기. 날조 금지.
- 산출물은 전부 `.gjc/`(gitignore) 아래 — 레포에 커밋되지 않는다. `.gjc/**`는 에이전트 mutation 툴로 못 쓰므로 서브프로세스(bun/cp)로 기록.
