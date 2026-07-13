# v0.11.0 릴리스 — 공개 릴리스 게이트 증거 (2026-07-13)

관제탑 발주로 오늘(하루 1회 릴리스 규정상 발행일) v0.11.0을 발행한다.
**Gate 2(extragoal 교차리뷰)·Gate 3(하코 승인)은 이미 통과** — dev의 re-sign 커밋
`8f6e0cb`/`794860f`가 0.11.0 교차리뷰 4건 반영분이고, 하코 승인 게이트도 통과 완료
(재승인 대기 불필요, 관제탑 확인). 이 문서는 **Gate 1(검증 체크리스트)** 을
발행 직전 새로 이행한 증거다.

## 0. 릴리스 범위

- 기준 태그: `v0.10.0` (main HEAD `c53e2d5`)
- 발행 대상: dev tip `303636d`
- 핵심 변경: **codex-deepwork + codex-app 짝(launch/cdp) 제거 → 15→12 capabilities**
  (skill 3개 삭제, command 3개 삭제). 관제탑 발주·하코 승인.
- 릴리스 diff `git diff v0.10.0..dev`: 25 files, +107 / **-514** (대부분 삭제).
- 제거된 파일:
  - skills: `codex-deepwork/SKILL.md`, `codex-app-launch/SKILL.md`, `codex-app-cdp/SKILL.md`
  - templates(commands): `codex-run.md`, `codex-app-launch.md`, `codex-app-ask.md`
- 번들된 커밋(v0.10.0..dev):
  - `ec6cdcf` chore(omg)! — 제거 본체 (15→12)
  - `1d0c8e5` merge chore/remove-codex-app-deepwork → dev
  - `8f6e0cb` re-sign r1 — 교차리뷰 4건 (제거된 codex-app 잔존 안내 정리)
  - `794860f` re-sign r2 — marketplace description 'built Codex App' 제거 + 과거 기록 헤더
  - `21ef2b7`, `303636d` ops/bugwatch 주입표적 재배선 (관제탑 발주, ops 레인 —
    plugin contract 무변경). **주의:** 이 2건은 원 교차리뷰 diff에 없던 operator-ordered
    ops 변경으로 이번 릴리스에 동승한다(완료 보고에 명시).

## 1. Static 검증

| 항목 | 대상 | 결과 |
|---|---|---|
| JSON parse | marketplace.json, plugin.json(oh-my-gjc/example), tower.config.example.json | 4/4 OK |
| `bash -n` | install-skill.sh, install.sh, tower-notify.sh, enqueue-pr.sh, daemon.sh, daily-scan.sh, ops/…/install.sh | 7/7 OK |
| `python3 -m py_compile` | pack_and_ask.py, queue_store.py, session_watch.py, record_provenance.py | 4/4 OK |

## 2. 단위 테스트 — 44 pass / 0 fail

| 파일 | 결과 |
|---|---|
| `ops/gjc-bugwatch/test/trigger.test.ts` | 15 pass, 0 fail (26 expect) |
| `plugins/oh-my-gjc/test/collect.test.ts` | 26 pass, 0 fail (71 expect) |
| `tools/test/e2e-bridge.test.ts` | 3 pass, 0 fail (10 expect) |

`bun test` 1.3.14.

## 3. Fresh install smoke (격리 HOME, `--candidate-ref` 로컬 dev 체크아웃)

`install.sh --candidate-ref /home/devswha/workspace/oh-my-gjc` (fresh `$HOME`,
`GJC_NOTIFICATIONS=0`):

| 지표 | 값 |
|---|---|
| install.sh rc | **0** |
| marketplace add | `✔ Added` |
| plugin install | `✔ Installed oh-my-gjc from oh-my-gjc (0.11.0)` |
| cache_plugin_dirs | 1 (`oh-my-gjc___oh-my-gjc___0.11.0`) |
| native_skills | **12** (codex-deepwork/codex-app 부재 확인) |
| native_commands | **17** (`omg.md` + 16 `omg:*.md`; codex-run/codex-app-* 부재) |

설치된 12 skills: easy-answer, gate-briefing, multivendor-presets, branch-flow,
extragoal, codex-cli-ask, lazycodex, insane-review, gjc-bugwatch, tower, gajae-app,
worktree.

## 4. 업그레이드 sweep (`cleanup_removed`)

≤0.10.0에서 올라오는 사용자 시뮬레이션: 제거된 native 파일 6개(skill dir 3 +
command 3)를 심어두고 `install-skill.sh all` 재실행.

- 결과: `✓ cleaned 6 removed-capability file(s)`, rc=0
- 6개 orphan 전부 sweep 확인(codex-deepwork/codex-app-launch/codex-app-cdp skill dir +
  omg:codex-run/omg:codex-app-launch/omg:codex-app-ask command)
- sweep 후 native_skills=12, native_commands=17 유지

## 5. Fail-closed preflight

cache payload에서 expected 파일 2개(`skills/worktree/SKILL.md`, `templates/fable.md`)
삭제 후 `install-skill.sh all`:

- rc=**1**
- `❌ install FAILED — expected files missing` + 누락 2건 전부 열거
- 부분 설치 없음(skills 디렉토리 미생성) — 전량 실패 확인

## 6. Gate 1 판정

**PASS.** Static·단위테스트·fresh smoke·업그레이드 sweep·fail-closed preflight 전부 통과.
Gate 2/3은 기 통과. 발행(dev→main --no-ff 머지 + tag v0.11.0 + GitHub Release) 진행.
