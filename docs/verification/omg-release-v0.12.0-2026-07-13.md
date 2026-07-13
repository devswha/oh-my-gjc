# v0.12.0 릴리스 준비 — 공개 릴리스 게이트 증거 (2026-07-13)

관제탑 발주·하코 결정. 한 릴리스에 두 변경을 번들한다:
1. **제거** 스킬 3종(codex-cli-ask·lazycodex·tower) + 짝 커맨드 4종(codex-ask·lazycodex-setup·
   lazycodex-work·tower-setup) + tower 전용 orphan 5.
2. **흡수** worktree 스킬 → branch-flow(중복 트리거·축약복제 드리프트 정리). `/omg:worktree`
   **커맨드는 유지**, 소유 스킬만 branch-flow로 통합.

결과: **12→8 skills / 17→13 commands**. ⚠ **하루 1회 릴리스 규정**: v0.11.0이 오늘(07-13)
발행됐으므로 **발행(tag·main 머지)은 07-14 이후** — 이 문서는 준비분(dev)의 Gate 1 증거이며,
Gate 2(extragoal 교차리뷰)·Gate 3(하코 승인) 통과 후에도 발행일만 익일로 잡는다.

## 0. 릴리스 범위

- 기준 태그: `v0.11.0`
- 제거 근거(관제탑 실측): codex-cli-ask·lazycodex·tower 셋 다 명시 호출 0(Codex 트래픽은
  전량 제품 파이프라인 codex exec 직결로 스킬 미경유, lazycodex 하니스 세션 7월 0건, 실관제탑은
  자체 스크립트라 번들 tower 미사용).
- 흡수 근거: worktree 스킬이 스스로 "branch-flow와 한 몸" 선언 + branch-flow 병렬 절이
  worktree 커맨드를 축약 복제(드리프트 위험) + 트리거 중복. branch-flow 병렬 작업 절을
  worktree 전문 내용(이름 규약·new·list·clean 3조건·강제삭제 금지 규칙 원문)으로 확장 흡수,
  스킬 이름은 branch-flow 유지.
- 유지(하코 확인): gate-briefing, easy-answer, gajae-app.
- 제거 파일(13 = 삭제 skills 4[codex-cli-ask·lazycodex·tower·worktree] + templates 4 + tower orphan 5):
  - skills: `codex-cli-ask/`, `lazycodex/`, `tower/`, `worktree/`
  - templates(commands): `codex-ask.md`, `lazycodex-setup.md`, `lazycodex-work.md`, `tower-setup.md`
    (⚠ `templates/worktree.md` 커맨드는 **유지** — branch-flow 활성화로 리포인트)
  - tower 전용 orphan: `bin/session_watch.py`, `bin/tower-notify.sh`, `bin/queue_store.py`,
    `bin/tower`(CLI), `references/tower.config.example.json`
- 매니페스트: `EXPECTED_SKILLS` **8** / `EXPECTED_COMMANDS` **13**(worktree 커맨드 포함);
  `REMOVED_SKILLS`=0.11.0+0.12.0 누적(codex-deepwork·codex-app-launch·codex-app-cdp·codex-cli-ask·
  lazycodex·tower·**worktree**), `REMOVED_COMMANDS`에 worktree는 **미포함**(커맨드 유지). 버전 0.12.0.
- 문서 동수준 갱신: marketplace/plugin.json(8 skills, worktree를 branch-flow에 융합 서술),
  AGENTS(3절 REMOVED 묘비 + 카운트 12→8 skills·17→13 commands·worktree를 branch-flow core 서술로
  이동), README×2, INSTALLATION, install.sh, templates/omg.md·setup.md, templates/worktree.md
  (스킬 참조 branch-flow로 변경), branch-flow SKILL.md(병렬 작업 절 worktree 흡수).

## 1. Static

| 항목 | 결과 |
|---|---|
| JSON parse (marketplace/plugin/example) | OK, 버전 0.12.0 |
| `bash -n` (install-skill.sh, install.sh, ops/bugwatch ×4) | OK |
| `py_compile` (pack_and_ask.py, record_provenance.py) | OK |
| dangling worktree-skill 참조 스캔(skills/worktree·"worktree 스킬") | 0건(모두 커맨드/흡수 절만) |

## 2. 단위 테스트 — 44 pass / 0 fail

trigger.test.ts 15 · collect.test.ts 26 · e2e-bridge.test.ts 3 (bun 1.3.14).

## 3. Fresh install smoke (격리 HOME, `--candidate-ref` 로컬 dev)

| 지표 | 값 |
|---|---|
| install.sh rc | **0** |
| cache | `oh-my-gjc___oh-my-gjc___0.12.0` |
| native_skills | **8** (branch-flow, easy-answer, extragoal, gajae-app, gate-briefing, gjc-bugwatch, insane-review, multivendor-presets) |
| native_commands | **13** (`omg.md` + 12 `omg:*.md`, **`omg:worktree.md` 포함**) |
| worktree 스킬 | 부재(correct) |
| worktree 커맨드 | 존재(correct) |

## 4. 업그레이드 sweep (`cleanup_removed`)

worktree 스킬 orphan + codex-cli-ask/lazycodex/tower 스킬 orphan 심고 재설치:
- `✓ cleaned 4 removed-capability file(s)`, rc=0
- worktree 스킬 dir **swept**, `omg:worktree.md` 커맨드는 **유지**(REMOVED_COMMANDS 미포함)
- sweep 후 native_skills=8, native_commands=13

## 5. Fail-closed preflight

payload에서 expected 2개(`skills/branch-flow/SKILL.md`, `templates/worktree.md`) 삭제 후
`install-skill.sh all`: rc=**1**, missing list 2건 열거, 부분 설치 없음.

## 6. Gate 1 판정

**PASS.** 발행 보류(익일) 상태로 Gate 2(extragoal 교차리뷰) → Gate 3(하코 승인 큐 적재) 진행.
