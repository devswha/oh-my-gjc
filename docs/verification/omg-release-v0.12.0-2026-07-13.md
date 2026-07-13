# v0.12.0 릴리스 준비 — 공개 릴리스 게이트 증거 (2026-07-13)

관제탑 발주·하코 결정으로 스킬 3종(codex-cli-ask·lazycodex·tower) + 짝 커맨드 4종
(codex-ask·lazycodex-setup·lazycodex-work·tower-setup)을 제거해 **12→9 skills / 17→13
commands**로 축소한다. ⚠ **하루 1회 릴리스 규정**: v0.11.0이 오늘(07-13) 발행됐으므로
**발행(tag·main 머지)은 내일 이후** — 이 문서는 준비분(dev)에 대한 Gate 1 증거이며,
Gate 2(extragoal 교차리뷰)·Gate 3(하코 승인) 통과 후에도 발행일만 익일로 잡는다.

## 0. 릴리스 범위

- 기준 태그: `v0.11.0`
- 제거 근거(관제탑 실측): 셋 다 명시 스킬/커맨드 호출 0.
  - **codex-cli-ask**: 로컬 Codex 트래픽 6천여 건은 전량 제품 파이프라인(patina·flask)의
    `codex exec` 직결 — 스킬 미경유.
  - **lazycodex**: `/omg:lazycodex-*` 하니스 발원 세션 7월 0건.
  - **tower**: 실관제탑(horcrux)은 자체 스크립트 구현 — 번들 tower 스킬 미사용.
- 유지(하코 확인): gate-briefing, easy-answer, gajae-app.
- 제거 파일(19):
  - skills: `codex-cli-ask/`, `lazycodex/`, `tower/`
  - templates: `codex-ask.md`, `lazycodex-setup.md`, `lazycodex-work.md`, `tower-setup.md`
  - tower 전용 orphan bin/reference: `bin/session_watch.py`, `bin/tower-notify.sh`,
    `bin/queue_store.py`, `bin/tower`(CLI), `references/tower.config.example.json`
- 매니페스트: `EXPECTED_SKILLS` 9 / `EXPECTED_COMMANDS` 13; `REMOVED_SKILLS`·`REMOVED_COMMANDS`에
  0.11.0+0.12.0 누적(업그레이드 스윕). 버전 0.12.0.
- 문서 동수준 갱신: marketplace/plugin.json(9 skills), AGENTS(3절 REMOVED 묘비 + 카운트
  12→9·17→13·현재 16→12 등), README×2, INSTALLATION, install.sh, templates/omg.md·setup.md.

## 1. Static

| 항목 | 결과 |
|---|---|
| JSON parse (marketplace/plugin/example) | 3/3 OK, 버전 0.12.0 |
| `bash -n` (install-skill.sh, install.sh, ops/bugwatch ×4) | 6/6 OK |
| `py_compile` (pack_and_ask.py, record_provenance.py) | 2/2 OK |

## 2. 단위 테스트 — 44 pass / 0 fail

trigger.test.ts 15 · collect.test.ts 26 · e2e-bridge.test.ts 3 (bun 1.3.14).

## 3. Fresh install smoke (격리 HOME, `--candidate-ref` 로컬 branch)

| 지표 | 값 |
|---|---|
| install.sh rc | **0** |
| plugin install | `✔ Installed oh-my-gjc from oh-my-gjc (0.12.0)` |
| cache | `oh-my-gjc___oh-my-gjc___0.12.0` (1) |
| native_skills | **9** (branch-flow, easy-answer, extragoal, gajae-app, gate-briefing, gjc-bugwatch, insane-review, multivendor-presets, worktree) |
| native_commands | **13** (`omg.md` + 12 `omg:*.md`; codex-ask/lazycodex-*/tower-setup 부재) |

## 4. 업그레이드 sweep (`cleanup_removed`, 0.11.0+0.12.0 누적)

제거된 native 파일 13개(skill dir 6: codex-deepwork/codex-app-launch/codex-app-cdp/
codex-cli-ask/lazycodex/tower + command 7: codex-run/codex-app-launch/codex-app-ask/
codex-ask/lazycodex-setup/lazycodex-work/tower-setup)를 심고 재설치.

- 결과: `✓ cleaned 13 removed-capability file(s)`, rc=0, 13개 전부 sweep
- sweep 후 native_skills=9, native_commands=13 유지

## 5. Fail-closed preflight

payload에서 expected 2개(`skills/insane-review/SKILL.md`, `templates/worktree.md`) 삭제 후
`install-skill.sh all`:

- rc=**1**, `❌ install FAILED — expected files missing` + 누락 2건 열거, 부분 설치 없음

## 6. Gate 1 판정

**PASS.** 발행 보류(익일) 상태로 Gate 2(extragoal 교차리뷰) → Gate 3(하코 승인 큐 적재) 진행.
