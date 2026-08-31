# AGENTS.md tombstones — full record (archived 2026-09-01)

This file is the verbatim archive of the per-capability `(REMOVED …)` tombstone
sections that lived in `AGENTS.md` until 2026-09-01, when `AGENTS.md` compressed
them into a one-line-per-capability table (rationale + cleanup boundary) that
points here. Nothing was rewritten — sections are reproduced exactly, in their
original order. `AGENTS.md` remains the place where NEW removals get their
tombstone row; when a row grows past one line of rationale/boundary, the prose
moves to this file in the same change.

The archive is documentation only. It is never installed, executed, resolved by
the suite-root binding, or referenced by `install.sh` / `install-skill.sh`.

---

## `codex-cli-control` (REMOVED in 0.12.0)

- 관제탑 발주·하코 승인(2026-07-13)으로 제거: skill `codex-cli-ask` + command `/omg:codex-ask` 명시 호출 0회 — 로컬 Codex 트래픽은 전량 제품 파이프라인(patina·flask)의 `codex exec` 직결로 스킬을 경유하지 않음. 업그레이드 시 `install-skill.sh`의 `cleanup_removed`가 네이티브 잔존물(`omg:codex-ask.md`, skill dir)을 청소한다. 과거 상세·보안계약은 git 히스토리(≤0.11.0)의 skills/codex-cli-ask/SKILL.md 참조.

## `codex-deepwork` (REMOVED in 0.11.0)

- 관제탑 발주·하코 승인(2026-07-12)으로 제거: 실사용 0회(자기시험 제외 전 세션 로그 집계) + `lazycodex`와 기능 중복. 파일-쓰기 자율 위임은 당시 `/omg:lazycodex-work` 소관이었으나 lazycodex도 0.12.0에서 제거됨 — 현재는 gjc 네이티브 워크플로(team/ultragoal) 소관. 업그레이드 시 `install-skill.sh`의 `cleanup_removed`가 네이티브 잔존물(`omg:codex-run.md`, skill dir)을 청소한다.

## `lazycodex` (REMOVED in 0.12.0)

- 관제탑 발주·하코 승인(2026-07-13)으로 제거: `/omg:lazycodex-setup`·`/omg:lazycodex-work` 하니스 발원 세션 7월 0건. 파일-쓰기 자율 위임 수요는 gjc 네이티브 워크플로(team/ultragoal)로 충족. 업그레이드 시 `cleanup_removed`가 네이티브 잔존물(`omg:lazycodex-setup.md`·`omg:lazycodex-work.md`, skill dir)을 청소한다. 과거 상세는 git 히스토리(≤0.11.0)의 skills/lazycodex/SKILL.md 참조.

## `time-left` and `lazycodex-gjc` (REMOVED in 0.25.0)

- **User rationale:** ETA could not provide usable measurement; `lazycodex-gjc` had no usable Codex authentication/tokens, while GJC native workflows cover delegation. The associated `tools/sdk-lab` source is retired with `time-left`.
- **Upgrade boundary:** cleanup removes only the suite-owned native skill, command, runtime, and receipt. It never removes credentials, `~/.codex`, `models.yml`, user LazyCodex/OMO, or other runtimes.

## `codex-app-control` (REMOVED in 0.11.0)

- 관제탑 발주·하코 승인(2026-07-12)으로 제거: 대상 Codex 데스크톱 앱 빌드 트랙이 07-03 아카이브(codex-wrapper-build)로 폐기됐고, GPT Pro 리뷰 용도는 `insane-review`(자체 엔진, codex-app 의존성 없음)가 전담. 업그레이드 시 `cleanup_removed`가 네이티브 잔존물을 청소한다. 과거 라이브 검증 레시피는 git 히스토리(≤0.10.0)의 skills/codex-app-*/SKILL.md 참조.

## `multivendor-presets` (REMOVED after v0.17.1)

- 하코 direct order (2026-07-15): 커스텀 프리셋보다 GJC 기본/내장 프리셋을 사용한다. 스킬, `/omg:presets`, `references/presets.yml`, 설치 시 `sol` 자동 병합을 제거했다.
- 업그레이드 시 `cleanup_removed`가 네이티브 잔존물(`skills/multivendor-presets/`, `omg:presets.md`)만 청소한다. 기존 사용자 `models.yml`과 과거 병합된 `sol` 프로필은 사용자 설정이므로 자동 삭제·수정하지 않는다.
- **하코 direct order (2026-07-19) 부분 번복 → 다시 철회 (2026-07-21):** v0.22.0에서 재도입한 커스텀 프리셋 배포(`preset-pack` 스킬 + `/omg:preset-pack`)는 v0.29.0에서 사용자 직접 지시로 다시 제거됐다. 아래 `preset-pack` 묘비 참조.

## `preset-pack` (REMOVED in v0.29.0)

- Direct user removal: 커스텀 모델 프리셋 배포를 접고 GJC 내장 프리셋만 쓴다. 정본 `references/preset-pack.yml`, 스킬 `skills/preset-pack/`, 커맨드 `/omg:preset-pack`을 제거했다.
- 업그레이드 시 `cleanup_removed`가 네이티브 잔존물(`skills/preset-pack/`, `omg:preset-pack.md`)만 청소한다. 정본 fixture와 파스 동등하든 아니든 사용자 `~/.gjc/agent/models.yml`과 과거 병합된 `daily`/`agent` 프로파일은 사용자 설정이므로 절대 삭제·수정하지 않는다. 클램프로 죽은 세션 복구는 GJC 내장 프리셋(`gjc -r <세션ID> --mpreset <내장 프리셋>`)으로 대체한다. 과거 상세·좌석표는 git 히스토리(≤v0.28.0)의 skills/preset-pack/SKILL.md + references/preset-pack.yml 참조.

## `release-gate` (REMOVED after v0.17.1)

- 하코 direct order (2026-07-15): 공개 플러그인 기능이 아니라 이 저장소의 릴리스 운영 규칙에 가깝고, 검증은 일반 테스트 절차·외부 리뷰는 `extragoal`과 중복되어 제거했다.
- 스킬과 `/omg:release`는 제거하지만 아래 **Release rules**는 이 저장소의 강제 규칙으로 유지한다(2026-07-19 자율화 개편 반영). 업그레이드는 네이티브 잔존물만 청소한다.

## Public capability prune (REMOVED after v0.17.1)

- `easy-answer`, `plain-layer`, and `branch-flow` were removed as redundant UX/policy layers; use concise direct answers and GJC native deep-interview/ralplan/team plus each repository's own `AGENTS.md`.
- The public `gjc-bugwatch` skill and `/omg:bugwatch-scan` were removed; the repository-owned collector and `ops/gjc-bugwatch/` automation remain internal operations tooling.
- Upgrade cleanup removes retired native skills/commands and retired `easy-always` marker blocks after backing up affected user files. It never modifies `models.yml`.

## `session-observer` (REMOVED in 0.23.0)

- 하코 직접 지시(2026-07-19, v0.22.0 출시 당일): "session-observer 삭제해" — 토큰-프리 관찰 수요는 터미널에서 세션 JSONL 직접 tail/tmux로 충분해 전용 스킬을 유지하지 않는다.
- 스킬·커맨드·러너(`bin/session-observer.ts`)·테스트 제거. 업그레이드 시 `cleanup_removed`가 네이티브 잔존물(`skills/session-observer/`, `omg:session-observer.md`)을 청소한다. 과거 상세·경계는 git 히스토리(v0.22.0)의 skills/session-observer/SKILL.md 참조.

## `fable` (REMOVED in v0.26.0)

- Direct user removal: the current Fable audit and its Opus fallback both stalled without a report. Native cross-session review and `insane-review` remain.
- Upgrade cleanup removes only the native `omg:fable.md`; `claude-fable-5` model preset references are unrelated and remain.

## `adaptive-response`, `deep-onboarding`, and `multi-harness-research` (REMOVED in v0.32.0)

- **Direct user request (2026-08-18):** retire `adaptive-response`, `/omg:gate`, `/omg:gate-always`, `deep-onboarding`, `/omg:deep-onboarding`, `multi-harness-research`, and `/omg:multi-harness`. The associated multi-harness private native runtime is retired.
- **Upgrade boundary:** cleanup removes only suite-owned native skills, commands, the private runtime, and well-formed owned `gate-always` marker blocks after backup. It preserves marker-external bytes, malformed markers, multi-harness research artifacts, external and user authentication/configuration, credentials, models, and unrelated state.

## `ouroboros` (REMOVED in v0.33.0)

- **Direct user request (2026-08-18):** remove the OMG wrapper skill and `/omg:ouroboros-setup` command only. Ouroboros is an external upstream package, not an OMG-owned capability.
- **Preservation boundary:** leave the external upstream Ouroboros package 0.51.7, `~/.ouroboros`, its upstream marketplace/plugin, GJC bridge extension and MCP state, Seeds, runs, authentication, and configuration untouched. Do not remove or modify external state.

## `gjc-bugwatch` public surface (REMOVED after v0.17.1)

- The trigger skill and `/omg:bugwatch-scan` command are retired. `bin/collect.ts`, `bin/follow.ts`, their tests, and `ops/gjc-bugwatch/` remain repository-owned operations tooling, not installed public capability.
- Internal automation remains drafts-only/read-only with redaction and no automatic issue/PR creation. Human-directed upstream PRs target `Yeachan-Heo/gajae-code` base `dev`. **의도적 유지(2026-07-19):** 상류 PR의 human 승인 게이트는 제3자 저장소에 하코 명의로 기여하는 외부 신원 경계라, 본 저장소 릴리스 자율화(승인 게이트 폐지)와 별개로 유지한다.

## `gajae-app` (REMOVED in 0.14.0)

- Native upgrade cleanup removes only `~/.gjc/agent/skills/gajae-app/` and `~/.gjc/agent/commands/omg:gajae-app.md`; it does not delete or modify any claudecodeui checkout, build output, data, or user service.
- Target repository and self-host documentation: [devswha/claudecodeui SELF-HOST](https://github.com/devswha/claudecodeui/blob/feat/gjc-provider/docs/SELF-HOST.md). Historical release evidence: the `feat/gjc-provider` v0.2.0 release passed verification, extragoal cross-review, and 하코 approval.

## `tower` (REMOVED in 0.12.0)

- 관제탑 발주·하코 승인(2026-07-13)으로 제거: skill `tower` + command `/omg:tower-setup` 미사용 — 실관제탑(horcrux)은 자체 스크립트 구현으로 돌아 이 번들 tower를 경유하지 않음. skill/command와 함께 전용 orphan 파일(`bin/session_watch.py`·`bin/tower-notify.sh`·`bin/queue_store.py`·`bin/tower` CLI·`references/tower.config.example.json`)도 제거. 업그레이드 시 `cleanup_removed`가 네이티브 잔존물(`omg:tower-setup.md`, skill dir)을 청소한다. 과거 상세·검증 레시피는 git 히스토리(≤0.11.0)의 skills/tower/SKILL.md + bin/tower-notify.sh 참조. (gjc-bugwatch가 쓰는 `TOWER_URL` HTTP 큐는 외부 horcrux 관제탑 서버로 본 번들과 무관.)
