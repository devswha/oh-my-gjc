# v0.14.1 릴리스 — 공개 릴리스 게이트 증거 (2026-07-14)

하코 직접 발주("0.14.1로 릴리즈"). ⚠ 하루 1회 규정의 명시 예외 — v0.14.0이 당일(07-14)
발행됐으나 발주자가 직접 지시했고, 게이트 1·2는 규정대로 전부 수행.

## 0. 릴리스 범위 (기준 태그 `v0.14.0`, 4 commits)

- **presets v0.8 — `fable-codex` 신설:** default `anthropic/claude-fable-5:high`(상류 built-in
  fable-opus-codex default 동일, 적대적 감사 성향 본체), 위임 좌석 4개는 `codex` 프리셋과
  동일(테스트로 좌석 동치 고정 — executor terra:xhigh 포함). 교차 패밀리 분리(Fable 지시 /
  codex 실행·비평). 표면 전체 갱신: 정본·스킬·커맨드(`[grok|sol|codex|fable-codex|all]`,
  `all`=넷 다)·omg 카탈로그·README×2·AGENTS.
- **결정 기록:** easy-answer+gate-briefing+plain-layer 통합 검토 **REJECTED** 묘비(AGENTS.md,
  하코 동의) — 재검토는 실사용 데이터 발생 시만.
- **0.14.1 범프 + README 정합:** 프리셋 4종 명시, description에 fable-codex, 헤딩 공백 수정.

## 1. Static

JSON parse(marketplace/plugin, 버전 0.14.1 일치) · `bash -n`(install.sh, install-skill.sh) ·
YAML parse(presets.yml — profiles: grok·sol·codex·fable-codex) 전건 OK.

## 2. 단위 테스트 — 65 pass / 0 fail (bun 1.3.14)

plugins/oh-my-gjc **47**(presets 스냅샷·codex 좌석 동치·executor=terra:xhigh 전 프리셋·
닫힌 은퇴목록 보존 포함) + ops/tools **18**.

## 3. Fresh install smoke (격리 HOME, `--candidate-ref` 로컬 dev)

rc=**0** · cache `0.14.1` · native_skills **8** · native_commands **13**.

## 4. 셀렉터 실호출 (GJC_NOTIFICATIONS=0, 2026-07-14)

`anthropic/claude-fable-5:high` "OK" rc=0 (codex 좌석 4종은 v0.14.0 게이트에서 검증済).
활성화 e2e: `gjc --mpreset fable-codex -p "Reply OK"` → OK rc=0 (라이브 models.yml 병합済).

## 5. Gate 2 — extragoal 교차 리뷰 (cross-family, fresh context)

리뷰어: `openai-codex/gpt-5.6-sol:xhigh` (read/search/find), 입력 = `git diff v0.14.0..HEAD`.

**Round 1 (candidate b3022c2): VERDICT: APPROVE** — "No blocking findings. seats/providers
consistent across every surface; safety contracts intact; no stale three-preset syntax on
active surfaces; version fields consistent at 0.14.1; evidence sufficient."

## 6. 판정

Gate 1 **PASS** · Gate 2 **APPROVE**(round 1) · Gate 3 = 하코 직접 발주 — **발행 진행**:
dev→main 머지 + `v0.14.1` 태그 + GitHub Release. 발행 후 머지완료·클린 브랜치 정리
(`feat/gajae-app-capability`, `feat/webterm` + worktree) — branch-flow clean 3조건 충족 확인済.
