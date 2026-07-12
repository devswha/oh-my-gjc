> ⚠ ARCHIVED (2026-07-12): 이 문서는 통합 캠페인 당시의 검증 기록이다. codex-deepwork·codex-app-launch·codex-app-cdp는 **0.11.0에서 제거**됐다(관제탑 발주·하코 승인) — 해당 절은 히스토리로만 읽을 것.

# Gate B — omg 13항목 기능 캠페인 결과 (2026-07)

Gate A(단일 패키징) 리뷰 통과 후, **Gate A와 동일 provenance payload** 기준 기능 캠페인.
**릴리스·main 머지·태그 미수행(하코 전용).**

## B1 — 환경 고정 + provenance 재확인

- candidate: `/home/devswha/workspace/oh-my-gjc`, branch `dev`, commit `c72785f`.
- Gate A payload 동일성: 로컬 candidate-ref 재설치 → cache `oh-my-gjc___oh-my-gjc___0.3.2`, marker 5종 sha256 재대조 `local_vs_installed_marker_match=true`, `marketplace_plugins_count=1`. (Gate A `omg-20260709T040428/provenance.json`와 동일 payload.)
- 격리 HOME 신규 설치 rc=0 + 멱등(Gate A A8 재확인).
- 전제조건 스캔(실측): gjc✓ codex✓(**ChatGPT 로그인됨**) npx✓ node✓ bun✓ python3✓ tmux✓ chrome/chromium✓. CDP :9222 + ChatGPT 로그인 **실재**(insane-review --check-env 6 OK).

## B2 — guide / live 분리 규칙

- `no_prereq_guide`: 전제 미충족 시 친절 안내·안전 중단.
- `live_feature`: 전제 충족 시 실제 가치 경로.
- **집계 규칙:** guide PASS는 live PASS로 합산하지 않는다. `live DEFERRED-ENV`는 release readiness 조건부 위험으로 남긴다.

## B3 — 13항목 매트릭스

| 항목 | canonical | no-prereq guide | live | release impact | 증거 |
|---|---|---|---|---|---|
| easy-answer | `/omg:easy` `/omg:easy-always` | N/A | **PASS** | 충족 | `gjc -p easy-always on` → SYSTEM.md `BEGIN/END oh-my-gjc:easy-always` 실삽입 |
| gate-briefing | `/omg:gate` `/omg:gate-always` | N/A | **PASS** | 충족(1st-run 세션 flake→재시도 PASS) | `gjc -p gate-always on` 재시도 → 마커 삽입 |
| multivendor-presets | `/omg:presets` | PASS(로그인없음 안내) | **PASS** | provider login 시 활성 | 격리 models.yml: `mine` 프로필 보존 + `ideal` 병합, yaml valid |
| branch-flow | `/omg:branchflow-always` | N/A | **DEFERRED-ENV** | 조건부 | `gjc -p` 2회 기본모델 `gemini-1.5-flash` 404(툴헤비 세션). 커맨드 로직 easy/gate 동형·`references/WORKFLOW.md` 존재 |
| extragoal | skill trigger | PASS(reviewer 없음 안내) | **PARTIAL** | 조건부 | insane-review 레인 live 가능(check-env OK); reviewer preset 레인 DEFERRED. SKILL fail-closed·시크릿스캔·다중레인 |
| fable | `/omg:fable` | PASS(provider 없음+opus fallback) | **DEFERRED-ENV** | safety audit 미검증 | fable.md refusal 2종+fallback+스팟체크 정적; anthropic 크레덴셜 없음 |
| codex-cli-control | `/omg:codex-ask` | PASS(codex 없음 안내) | **PASS** | 충족 | `codex exec --sandbox read-only` → OUT=`PONG` rc=0 |
| codex-deepwork | `/omg:codex-run` | PASS(codex 없음 안내) | **PASS** | 충족 | `codex exec --sandbox workspace-write` → `hello.txt=HELLO` rc=0 |
| lazycodex | `/omg:lazycodex-setup` `-work` | PASS(codex/npx 없음 안내) | **PASS** | 충족 | `npx lazycodex-ai doctor` → System OK (omo 4.11.0) |
| codex-app-control | `/omg:codex-app-launch` `-ask` | PASS(start_sh/cdp_url 없음 안내) | **DEFERRED-ENV** | 조건부 | launch/ask.md required-arg 안내·injection 검증 정적; 빌드된 앱 없음 |
| insane-review | `/omg:insane-review` | PASS(deps/browser/login 온보딩) | **PASS(env+pack)** | 충족(env+pack) | `--check-env` 6 OK(CDP+Pro 로그인 실재); `--pack-only` repomix 3파일 rc=0 chmod600. 실 Pro harvest는 선택(외부 웹) |
| gjc-bugwatch | `/omg:bugwatch-scan` | PASS(로그없음 안내) | **PASS** | 충족 | `bun test collect.test.ts` 26 pass; redaction/dedupe/draft-only |
| tower | `/omg:tower-setup` | PASS(tmux fleet 없음 안내) | **PASS(partial live)** | 충족 | queue add/dedupe/done, `session_watch --once` rc0, notify traps 2종 reject; 라이브 fleet event는 partial |

### 집계 (guide≠live)

- **live PASS: 9** — easy-answer, gate-briefing, multivendor-presets, codex-cli-control, codex-deepwork, lazycodex, insane-review(env+pack), gjc-bugwatch, tower.
- **live PARTIAL: 1** — extragoal (insane-review 레인 live).
- **live DEFERRED-ENV: 3** — branch-flow(기본모델 환경), fable(Fable 크레덴셜), codex-app-control(빌드된 앱).
- guide PASS(전제조건 기능 8종) 전부 확인 — live로 합산하지 않음.

## B4 — 플랫폼

- **Linux local: 필수 — 전부 실측**(설치·13항목·provenance·멱등).
- **Docker Linux**: `ubuntu:22.04`에서 `install.sh` `bash -n` OK + precondition guard 동작(gjc 없음 → `✗ gjc not found` die rc=1). 전체 install E2E는 gjc 바이너리 반입 필요 → 정적+precondition까지.
- **macOS/Windows: DEFERRED-ENV**(실기기 없음). ⚠ 알려진 이식성 리스크: `ls -d … | sort -V`의 `sort -V`가 BSD/macOS 기본 sort 미지원 가능 — mac 재검증 시 확인 필요.

## B5 — 폐기 심사

| 라벨 | 항목 | 근거 |
|---|---|---|
| KEEP | easy-answer, gate-briefing, multivendor-presets, codex-cli-control, codex-deepwork, lazycodex, insane-review, gjc-bugwatch, tower | live PASS, canonical surface 노출, guide 친절 |
| KEEP | extragoal | insane-review 레인 live + fail-closed 설계 완비 |
| DEFER | branch-flow | 커맨드 로직 정상(easy/gate 동형)·대상 파일 존재. live는 이 검증 환경 기본모델(gemini-1.5-flash 404) 제약 — 안정 모델 환경서 재검증 권장 |
| DEFER | fable | guide·fallback·안전 로직 완비. live는 Fable/anthropic 크레덴셜 필요 |
| DEFER | codex-app-control | guide·injection 검증 완비. live는 빌드된 Codex 앱 필요 |
| FIX / DEPRECATE / REMOVE | (없음) | — |
| MIGRATE | (Gate A서 완료) | 구 다중 플러그인 packaging → 단일 omg 통합 |

폐기 기준 6항 대조: ①canonical surface 미노출 ②guide 불친절/무한대기 ③live fail-open ④old self-doc drift ⑤문서-동작 불일치(문서수정 불가) — **모두 해당 없음**. 단일 packaging은 MIGRATE 대상이었고 Gate A서 완료.

## release readiness

**CONDITIONAL** — canonical 단일 표면·guide·핵심 live(9 PASS)는 충족. 조건부 위험: live DEFERRED-ENV 3종(branch-flow는 안정 모델, fable은 Fable 크레덴셜, codex-app은 빌드된 앱 환경서 재검증). **publish 금지(하코 전용).**

## 산출물

- matrix(raw): `.gjc/verification/omg-gateB-20260709T105056/matrix.json`
- provenance: `.gjc/verification/omg-gateB-20260709T105056/`(B1) · Gate A `omg-20260709T040428/provenance.json`
- dev HEAD `c72785f`. Gate A/B 파일 payload 불변(동일 provenance).
