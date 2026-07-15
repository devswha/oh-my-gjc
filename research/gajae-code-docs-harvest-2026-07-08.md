# gajae-code `docs/` 수확 조사 보고서

> **HISTORICAL v0.9.1 SNAPSHOT — SDK sections superseded by GJC 0.11.0.**
> GJC 0.11 replaces `.gjc/state/notifications/<id>.json` with the canonical, token-authenticated
> `.gjc/state/sdk/<id>.json` external control/view bus. Use `@gajae-code/bridge-client` for
> process-isolated control and `@gajae-code/coding-agent` for in-process embedding. SDK hosting is
> independent of managed notifications; disposable runs require both
> `GJC_NOTIFICATIONS=0 GJC_SDK_DISABLE=1`. OMG's retired webhook-only Discord bridge must not be revived;
> use GJC's managed Discord/Slack adapters. The historical priorities and paths below are preserved only
> as evidence of the 2026-07-08 survey.

- 조사일: 2026-07-08 · 소스: `Yeachan-Heo/gajae-code` `origin/main @ c0581e1a` (v0.9.1), 클론 `/tmp/gajae-code-check/docs`
- 목적: 상류 문서 전수 → 항목별 기능 요약 + 함대 적용처(관제탑/flask/stock/omj) + 도입 난이도 + 우선순위. 즉시 적용 톱5 추천.
- 범위: `docs/*.md` ~115편. 하이라이트 지정 영역(메모리·알림 SDK·멀티벤더·세션 export/fork/resume·computer use·python repl·스킬 템플릿·sdk) 심층, 나머지는 분류.
- ⚠ 보안 공격 관련 문서는 **제목만**(맨 끝 섹션), 상세 인용 없음 — 관제탑 릴레이용 보고서.
- 난이도: 낮음=설정/문서 반영, 중간=플러그인/스킬 신설, 높음=아키텍처/외부프로세스 연동.

---

## 즉시 적용 톱5 (추천)

1. **multi-vendor-profiles.md → omj `multivendor-presets` 프로파일 동기화** (난이도 낮음, 우선순위 P0)
   상류에 큐레이션 프로파일 `daily`/`ultimate`/`eco`/`monorepo`/`reviewer` + 셀렉터 검증법이 정본화됨. omj 프리셋(ideal/escalate-surgical/monorepo)과 겹치되 `reviewer`(리뷰/감사 스탠스: default=Opus 집계 절제, architect+critic 교차패밀리 머지 게이트)는 우리가 이번에 돌린 insane-review/g1 리뷰 레인과 정확히 같은 사상 → 바로 흡수 가치. 셀렉터는 catalog·시점 민감(2026-06 기준)이라 `gjc -p --no-session --no-tools --model <sel> "Reply OK"`로 재검증 후 반영.

2. **extragoal-skill-template.md → omj 스킬로 번들** (난이도 중간, 우선순위 P0)
   ultragoal + **외부 최종 리뷰 게이트**(무공유 컨텍스트·교차패밀리 리뷰어가 완성 diff를 재심 → 머신 파싱 verdict → 바운드 re-sign 루프). 우리가 g1 브리지에서 4라운드 돌린 "리뷰 후 수정 반영 → 재검토" 패턴의 표준화. omj가 이미 리뷰 도구(insane-review) 보유 → 게이트 스킬로 얹으면 시너지. 상류는 "기본 워크플로 스킬 미변경" 방침이라 로컬 템플릿으로 둠 → omj가 번들할 최적 후보.

3. **external-control-readiness.md + bot-integration.md (Coordinator MCP) → flask/tower 제어 평면** (난이도 높음, 우선순위 P1)
   상류가 외부 봇/오케스트레이션의 **권장 표면 = Coordinator MCP**로 정함(세션 발견/시작/tmux 등록/바운드 턴/질의응답/아티팩트 읽기/완료·실패·취소 보고 + `gjc_delegate_plan|execute|team`). 현재 flask 브리지·tower는 `tmux send-keys`로 구동 → Coordinator MCP는 그보다 견고한 정식 계약. tower의 "상주 함대 관측+주입"을 send-keys에서 MCP 제어 평면으로 승격하는 로드맵 근거. 단 도입은 크다(MCP 서버 연동).

4. **notifications-sdk.md → flask 2단계 WS 브리지 하드닝 + tower 알림** (난이도 낮음, 우선순위 P1)
   flask 2단계가 이미 이 SDK(루프백 WS, `<repo>/.gjc/state/notifications/<id>.json` 발견, `?token=` 핸드셰이크 401) 위에 구현됨. 우리가 리뷰한 B2(엔드포인트 URL/토큰)·B3(pid/TTL) 판정이 이 문서의 discovery 계약(pid·startedAt·updatedAt·stale·0600 파일·토큰 로깅 금지)과 정합하는지 대조 검증 = 저비용 하드닝. tower 알림 단일화에도 동일 계약 재사용.

5. **memory.md → 함대 자율 메모리 활성 + omj 헬퍼** (난이도 낮음, 우선순위 P1)
   프로젝트 스코프 자율 메모리(과거 세션에서 기술결정·워크플로·함정 추출 → 세션 시작 시 요약 주입, 시크릿 스캔 후 저장, `smol`/`default` 역할로 파이프라인). 기본 off. 함대 각 레포에 켜면 세션 간 결정이 이어짐(관제탑이 매번 재주입하던 컨텍스트 부담↓). omj가 "권장 memories 설정 + `/memory` 운용" 스킬로 패키징 가능.

---

## 하이라이트 영역 상세

| 문서 | 기능 요약 | 함대 적용처 | 난이도 | 우선순위 |
|---|---|---|---|---|
| `memory.md` | 자율 메모리(세션간 지식 추출·주입, SQLite 큐, 역할기반 모델, 시크릿스캔). 기본 off, `/memory` 명령 | omj(패키징)·전 함대(활성) | 낮음 | P1 |
| `notifications-sdk.md` | 세션당 루프백 WS + 액션 라이프사이클 + discovery 파일. transport-무관, 클라이언트가 다중화 | flask(이미 사용)·tower(알림) | 낮음(대조검증) | P1 |
| `multi-vendor-profiles.md` | 역할5(default/executor/planner/architect/critic)별 큐레이션 프로파일 + 셀렉터 검증 | omj(프리셋 동기화) | 낮음 | **P0** |
| `models.md` | `--mpreset`/프로파일 메커니즘 정본(34KB). 프로파일 병합·역할 매핑 근거 | omj | 낮음 | P0 |
| `session-operations-export-share-fork-resume.md` | `/dump /export /share /fork /resume`, CLI `--export/--fork/--resume/--continue` 매트릭스 | tower(병렬 포크)·omj | 중간 | P2 |
| `session-switching-and-recent-listing.md` | 세션 전환·최근목록 | tower | 중간 | P3 |
| `computer-use/README.md` | macOS 네이티브 computer tool(OpenAI 액션셋, 킬스위치, TCC). **draft, macOS 전용** | (근시일 함대 활용 낮음) | 높음 | P3 |
| `python-repl.md` (eval) | 장수명 python3 서브프로세스 NDJSON 커널, display() MIME, `reset`, 600s cap | stock(분석·백테스트 인세션)·전 함대 | 낮음(사용)·중간(패키징) | P2 |
| `gjc-dogfood-skill-template.md` | GJC-우선 오퍼레이터 워크플로 로컬 스킬 템플릿 | omj(참고/번들 후보) | 중간 | P2 |
| `extragoal-skill-template.md` | ultragoal + 외부 최종 리뷰 게이트(교차패밀리·무공유 컨텍스트·verdict·re-sign) | omj(번들) | 중간 | **P0** |
| `sdk.md` | 인프로세스 SDK(`createAgentSession`/`SessionManager`/`ModelRegistry`/tool factory) | omj/도구 제작 | 중간 | P2 |
| `rpc.md` | JSONL stdio 워커 모드 + `python/gjc-rpc` 타입드 클라이언트 | flask/stock(임베드 워커) | 중간 | P2 |
| `standalone-mcp.md` | 스탠드얼론 TUI의 MCP 상속 경계·워크어라운드 | flask/tower(경계 인지) | 낮음 | P3 |
| `gjc-plugins.md` | 플러그인 저작·마켓플레이스 규약(네이티브 로드 갭 맥락) | omj(정본 대조) | 낮음 | P2 |

---

## 제어 평면·봇 연동 (관제탑·flask 핵심)

| 문서 | 요약 | 적용처 | 난이도 | 우선 |
|---|---|---|---|---|
| `external-control-readiness.md` | 외부 제어 표면 준비도 매트릭스: **Coordinator MCP(권장)** / RPC stdio(안정) / ACP(에디터) / Bridge HTTPS(실험) | tower·flask | 높음 | **P1** |
| `bot-integration.md` | 봇 연동 가이드(Coordinator MCP 중심, delegate_plan/execute/team) | flask·tower | 높음 | P1 |
| `hermes-mcp-bridge.md` | Hermes(디스코드) ↔ MCP 브리지 | flask | 높음 | P2 |
| `bridge.md` | `--mode bridge` 실험적 원격 세션제어(fail-closed) | (실험, 관망) | 높음 | P3 |
| `openclaw-hermes-rpc-integration.md` | OpenClaw/Hermes RPC 통합 | flask | 높음 | P3 |
| `ooo-bridge-extension-contract.md` | OOO 브리지 확장 계약 | flask | 중간 | P3 |
| `telegram-onboarding.md` | 텔레그램 온보딩(알림 단일화 참고) | tower·flask | 낮음 | P2 |

---

## 도구 문서 (`docs/tools/*`) — tower/함대 관련

| 문서 | 적용처 | 메모 |
|---|---|---|
| `tools/monitor.md` | tower | busy→idle 감시 근거(tower가 이미 활용) |
| `tools/cron.md` | tower | 순찰 스케줄 근거(세션 귀속 재등록) |
| `tools/irc.md` | tower/team | 프로세스 내 라이브 에이전트 간 프로즈 메시지(`op:list/send`, awaitReply) — tower 함대 조율 보조 |
| `tools/task.md` | 전 함대 | 서브에이전트 위임 |
| `tools/browser.md` `tools/computer.md` | insane-review/computer-use | CDP 브라우저 / 네이티브 데스크톱 |
| `tools/checkpoint.md` `tools/rewind.md` | omj/전 함대 | 세션 체크포인트·되감기 |
| `tools/ssh.md` `tools/debug.md` `tools/lsp.md` `tools/eval.md` `tools/github.md` 등 | 상황별 | 표준 도구 레퍼런스 |

---

## 나머지 문서 — 낮은 함대 적용도 (내부 엔진/아키텍처/포팅)

주로 gajae-code 자체 구현 문서라 우리 함대 직접 적용도 낮음. 참고용 title 그룹:

- **Natives/Rust**: `natives-architecture.md` `natives-binding-contract.md` `natives-addon-loader-runtime.md` `natives-build-release-debugging.md` `natives-media-system-utils.md` `natives-shell-pty-process.md` `natives-text-search-pipeline.md` `natives-package-split-plan.md` `natives-rust-task-cancellation.md` `native-ffi-optimization-policy.md` `porting-to-natives.md`
- **엔진 내부**: `tui-runtime-internals.md` `ttsr-injection-lifecycle.md`(턴/텍스트 상태리포트 주입 라이프사이클) `compaction.md` `non-compaction-retry-policy.md` `provider-streaming-internals.md` `ai-schema-normalize.md` `fs-scan-cache-architecture.md` `blob-artifact-architecture.md` `resolve-tool-runtime.md` `notebook-tool-runtime.md` `bash-tool-runtime.md` `rulebook-matching-pipeline.md` `handoff-generation-pipeline.md` `codegraph-custom-tool.md` `provider-streaming-internals.md`
- **빌드·성능·포팅**: `codebase-overview.md` `porting-from-pi-mono.md` `perf-profiling-corpus.md` `cpu-hotspot-map*.json` `hotspot-map-successor.md` `geobench.md` `grok-build-provider-design.md` `composer-codex-parity.md` `git-daemon.md` `render-mermaid.md`
- **설정·UX 레퍼런스(낮은 우선, 참고 가치)**: `environment-variables.md`(58KB, 전 함대 설정 사전) `keybindings.md` `theme.md` `lsp-config.md` `research-plan-ledger.md` `session-tree-plan.md` `session.md` `tree.md` `ui-design-visual-qa.md` `analyze-me-with-gjc.md` `brand-assets.md` `REBRANDING_PLAN_260525.md` `ERRATA-GPT5-HARMONY.md` `onboarding-packet.md` `onboarding-receipt.md` `gjc-session-clawhip-routing.md` `aside-integration.md`
- **prompt-architect-reports/**: 시스템/툴/스킬 프롬프트 복원 리포트 — omj가 프롬프트 정본 대조 시 참고.

---

## 보안 인접 문서 — 제목만 (상세 인용 금지, 관제탑 릴레이 규칙 준수)

아래는 보안/인증/시크릿/주입 라이프사이클 관련 문서다. **제목과 한 줄 중립 라벨만 기록**하고 내용·기법은 인용하지 않는다. 필요 시 사람이 직접 원문 확인.

- `secrets.md` — 시크릿 취급/스캔 정책 문서.
- `auth-broker-gateway.md` — 인증 브로커/게이트웨이 인프라 문서.
- `ttsr-injection-lifecycle.md` — 턴 상태리포트 "주입" 라이프사이클(내부 메커니즘; 명칭에 injection 포함).
- (docs 전수에서 공격 플레이북/레드팀 성격의 별도 문서는 발견되지 않음. 위 3편은 방어·인프라 성격이나 규칙에 따라 제목만 표기.)

---

## 종합 판단

- omj 직결(P0): `multi-vendor-profiles`(프리셋 동기화) + `extragoal`(외부 리뷰 게이트 번들) — 둘 다 저·중 난이도, 우리 기존 자산과 정확히 겹침.
- flask/tower 직결(P1): Coordinator MCP 승격 로드맵(`external-control-readiness`/`bot-integration`) + notifications-sdk 대조 하드닝 + memory 활성.
- stock: python-repl(eval)로 인세션 분석·백테스트.
- 내부 엔진/natives/포팅 문서는 함대 적용도 낮음 — 참고 인덱스로만 유지.
