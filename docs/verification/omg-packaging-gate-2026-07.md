# Gate A — omg 단일 플러그인 패키징 게이트 결과 (2026-07)

Phase 0 독립 리뷰 단위. 계획: `/tmp/omg-plan/pending-approval.md` + `stage-05-revision.md`.
**릴리스·main 머지·태그는 수행하지 않았다(하코 전용).** 이 게이트가 통과(교차리뷰 BLOCK 아님)해야 Gate B(13항목 기능 캠페인)로 넘어간다.

## A0 — 기준 commit / 작업 범위

- repo: `/home/devswha/workspace/oh-my-gjc`
- branch: `dev`
- 기준 HEAD(작업 시작): `ec99774`
- provenance 측정 commit: `871fcff` (A7 실행 시점)
- `main`/tag/release: 미수행. 모든 커밋 dev.

## A2 — marketplace 단일화 + 단일 plugin root 병합

- `.claude-plugin/marketplace.json` `plugins.length == 1` (entry `oh-my-gjc`, source `./plugins/oh-my-gjc`). ✅
- 제거된 노출 entry: `codex-cli-control`, `codex-deepwork`, `lazycodex`, `codex-app-control`, `insane-review`, `gjc-bugwatch`, `tower`, `example-plugin`.
- 7개 기능 플러그인의 `skills/ commands/ bin/ references/ tests`를 `plugins/oh-my-gjc/` 단일 root로 `git mv` 병합. per-plugin `plugin.json`/`install-skill.sh`/`README`/중복 LICENSE 제거.
- `example-plugin`은 marketplace 비노출 + 디렉토리는 template로 잔존.
- 명령 파일명을 canonical suffix로: `ask→codex-ask`, `run→codex-run`, `setup/work→lazycodex-*`, `launch/ask→codex-app-*`, `review→insane-review`, `scan→bugwatch-scan`, `setup→tower-setup`.

## A3 — canonical `/omg:*` + 묘비 스텁 (Intent Reconciliation #1,#2)

- plugin entry name = `oh-my-gjc` 유지(설치 `oh-my-gjc@oh-my-gjc`), user-facing surface = `/omg:*` (Option D literal rename 기각).
- canonical 명령 본문의 구 cache glob·폴백 경로·구 슬래시 prefix를 전부 `/omg:*` / `oh-my-gjc___oh-my-gjc___*` / `plugins/oh-my-gjc/`로 치환.
- `omg.md` 카탈로그·`setup.md`를 단일 스위트로 재작성("옵션 플러그인 각자 셸 설치" 제거).
- **묘비 스텁 17개** (`plugins/oh-my-gjc/tombstones/`): 구 명령(`tower:setup`, `insane-review:review`, `codex-*`, `lazycodex:*`, `oh-my-gjc:*` 8종 등)을 안내 전용 스텁으로. 본문은 새 `/omg:*` 이름만 안내, **기능 본문 복제 없음**, 다음 릴리스 삭제 예정.

## A4 — 매니페스트 기반 단일 native installer

- `bin/install-skill.sh`가 `EXPECTED_SKILLS(13)/EXPECTED_COMMANDS(18)/EXPECTED_TOMBSTONES(17)` 명시 매니페스트로 설치(디렉토리 스캔 아님).
- 누락 파일 = "복사 가능한 것만"이 아니라 **전체 FAIL + missing list**. alias 본문복제 제거.
- 검증(격리 HOME): full `rc=0` — skills=13, native command files=35 (`omg.md` 1 + `omg:<name>.md` 17 + 묘비 17).
- 누락 시 FAIL: command/skill/tombstone 3종 삭제 시 `rc=1` + 3개 missing 전부 열거. ✅

## A5 — 확장 금지어·드리프트 스캔

- 대상: `README.md`, `INSTALLATION.md`, `plugins/oh-my-gjc/README.md`, canonical command bodies, skill bodies, native installer.
- 금지 패턴(별도/옵션 플러그인·각자 셸·`/plugin`·`gjc plugin install <feat>@`·구 cache glob·구 슬래시 prefix) 전부 제거.
- **예외(allowlist) 2종:**
  1. `plugins/oh-my-gjc/tombstones/*.md` — 안내 스텁(본문은 새 `/omg:*`만, old 설치단위 안내 없음).
  2. `bin/install-skill.sh` `uninstall_command` — 구 alias 파일(`oh-my-gjc:<name>.md`)도 제거하는 정리 코드(설치 단위 안내 아님).
- frontmatter `description`/`argument-hint`/H1/사용예시/"켜기·쓰기" 문구까지 스캔. canonical 본문에 old prefix drift 없음. ✅

## A6 — install.sh 단순화

- 옵션 배열·개별 install loop 제거 → 단일 plugin install + 단일 native glob(`oh-my-gjc___oh-my-gjc___*`).
- `--candidate-ref <path|ref>`: marketplace source override(로컬 체크아웃/명시 dev ref) — provenance 게이트가 published payload를 피하도록.
- legacy args(`--core`, `tower`, `codex-*`, …)는 마이그레이션 안내만, 추가 설치 없음.
- 전제조건 부재가 install rc를 실패시키지 않음(파일 복사·안내만).
- 재실행 멱등(marketplace add/install already-exists를 실패 허용).

## A7 — 아티팩트 provenance 하드 게이트

- gjc **로컬 체크아웃 marketplace 등록 지원 확인**(`gjc plugin marketplace add /home/devswha/workspace/oh-my-gjc` rc=0) → A7 우선순위 1 충족(escalation 불필요).
- 설치 cache root: `…/oh-my-gjc___oh-my-gjc___0.3.2`.
- `ops/verify/record_provenance.py`로 marker sha256 대조 — 5종 전부 match:
  - `bin/install-skill.sh` `7f082a95…`
  - `.claude-plugin/plugin.json` `fa366533…`
  - `commands/omg.md` `7805b406…`
  - `commands/codex-ask.md` `84004658…`
  - `commands/tower-setup.md` `87cbe2e2…`
- `local_vs_installed_marker_match=true`, `marketplace_plugins_count=1`, `plugin_entry_name=oh-my-gjc`, `plugin_manifest_version=0.5.0`, `marketplace_version=0.7.0`.
- provenance rc=0. 원본: `.gjc/verification/omg-20260709T040428/provenance.json`(비커밋 증거).

## A8 — fresh install smoke + 멱등성

격리 HOME, `--candidate-ref` 로컬 소스:

| 시나리오 | rc | cache_plugin_dirs | native_cmds | native_skills |
|---|---|---|---|---|
| single | 0 | 1 | 35 | 13 |
| legacy `--core` | 0 | 1 | 35 | 13 |
| legacy `tower` | 0 | 1 | 35 | 13 |
| rerun (멱등) | 0 | 1 | 35 | — |

- legacy args가 **추가 plugin 설치를 하지 않음**(cache_plugin_dirs=1 유지). ✅
- 재실행 멱등 rc=0. ✅

## Gate A 수용 기준 대조

- [x] marketplace exposed entry 1개
- [x] 단일 plugin root에 13항목 기능 파일 병합
- [x] install.sh·INSTALLATION manual path가 단일 plugin install + 단일 native glob만
- [x] local checkout으로 설치 + `provenance.json` (marker match true)
- [x] installed cache marker == local candidate
- [x] canonical `/omg:*` command·skill self-doc에 old prefix drift 없음
- [x] legacy alias = 묘비 스텁(안내 전용)으로만 존재
- [x] fresh install smoke + 재실행 멱등 통과
- [ ] Gate A 보고서 교차리뷰 BLOCK 아님 — **관제 리뷰 대기(이 게이트의 유일한 미결)**

## 상태

Gate A 자체 검증 **전부 통과**. 계획 규칙에 따라 Gate B로 자동 진행하지 않고 관제 큐에 완료 보고를 적재하고 리뷰를 기다린다. main/tag/release 미수행.

관련 커밋(dev): `f76e991`(A2) · `d376a79`(A3,A4) · `6b73097`(A5) · `871fcff`(A6) · `c8a8760`(A6멱등,A7,A8).
