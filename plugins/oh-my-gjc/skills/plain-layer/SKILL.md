---
name: plain-layer
description: deep-interview 선택지를 쉬운 말로 풀고, 인터뷰 끝난 뒤 대화로 스펙을 더 다듬고, 승인 직전에는 gate-briefing에 위임하는 세션 한정 UX 레이어. "선택지 쉽게 설명", "각 선택이 뭘 허용해", "인터뷰 끝나고 대화로 다듬기", "스펙 더 얘기해서 고치기", "승인 전에 쉽게 설명", "/omg:plain" 상황에서 활성화한다. 네이티브 deep-interview/ralplan/ultragoal/team을 재구현하지 않는다.
---

# Plain Layer (쉬운 기획)

목적: 네이티브 워크플로 **위**에 얹는 비전문가 UX 레이어다.  
질문 생성·모호성 점수·합의 계획·실행은 전부 네이티브 스킬 소유다.

한국어 제품명: **쉬운 기획**. 진입: `/omg:plain [<아이디어>|off]`.

## Prerequisites

- **GJC ≥ 0.10.1** (또는 아래 capability probe가 통과하는 설치본).
- 버전 번호만 믿지 말고, 지원 환경에서 한 번 capability를 확인한다:
  - `GJC_NOTIFICATIONS=0 gjc deep-interview --help` → `--write --stage --slug --spec --session-id --json` 존재
  - `GJC_NOTIFICATIONS=0 gjc state deep-interview read --json` 동작
  - isolated session에서 `--write` 후 state의 `spec_path`/`spec_sha256`가 최신 write와 일치
- **Probe 결과 (gjc 0.10.1, 2026-07-14):** latest pointer는 **session-keyed** — 마지막 성공 write가 slug와 무관하게 state latest가 된다. same-slug rewrite 지원. 원본 slug 파일은 디스크에 남는다.
- GJC 버전이 바뀌면 pointer 의미를 **재검증**한다. slug-keyed로 바뀌면 이 스킬의 Escalation으로 올린다(직접 `.gjc` 편집으로 우회 금지).
- capability 불일치 → **중단·architect escalation**. direct `.gjc` write/edit/ast_edit는 fallback이 아니다.

## Non-goals

- deep-interview topology / scoring / closure 재구현
- ralplan / ultragoal / team 내부 루프 재구현
- native Phase 5 네 option 재작성 또는 **두 번째** Phase-5 메뉴
- `plain-always`, SYSTEM.md marker, plain 전용 state 파일
- `gate-briefing` 흡수·삭제·별칭화 (`/omg:gate*` 독립 유지)
- 승인/반려 대행, 자동 handoff, 제품 코드 mutation
- 새 marketplace entry 또는 `plugins/oh-my-gjc/commands/`

## easy-answer와 구분

| | easy-answer | plain-layer |
|---|---|---|
| 언제 | 최종 답변 표현 | interview → spec → 승인 lifecycle |
| 무엇 | 말투·구성 | 선택지 해설·스펙 대화 다듬기·게이트 위임 |

## Session scope

- `/omg:plain <idea>`: **현재 대화 컨텍스트**에서 layer ON → `/skill:deep-interview`에 idea 전달.
- `/omg:plain`: idea 한 번 자유 입력 후 동일.
- 이미 active deep-interview가 있으면 clear/restart하지 않고 layer만 붙인다.
- `/omg:plain off`: layer만 OFF.  
  한 줄: `쉬운 기획 모드: 꺼짐 — 아직 확정하지 않은 대화 내용은 저장되지 않았습니다. 마지막 저장본: <path|없음>.`  
  native state/spec은 삭제하지 않는다.
- activation은 **in-conversation only** — flag/file/marker/`.gjc` 상태 파일을 만들지 않는다.
- 새 세션 자동 적용 없음. 전역 승인 브리핑은 `/omg:gate-always on`.

## 1) 선택지 번역 (interview-time)

option-bearing `ask`마다:

1. **option value와 `deepInterview.*` metadata는 byte-for-byte 유지.**
2. 설명은 option label/value에 붙이지 말고, question body의 `선택지 해설` 블록에만 둔다.
3. 각 선택지(및 Other)마다 1~2문장:
   - **뜻**
   - **선택하면 정해지는 것**
   - **이 선택만으로는 정하지 않는 것** (모르면 “아직 정하지 않음”)
4. 추천이 있으면 의미와 분리해 `현재 근거상 추천`으로만 표시. 다른 option 숨기지 않음.
5. round line, ambiguity 수치, component/dimension id, canonical label은 번역·개명 금지.
6. 사용자가 “이 선택지 뭐야?”면 짧게 설명한 뒤 **같은** native ask를 identity 그대로 재제시.

## 2) 단일 Phase-5 ask + 대화로 더 다듬기

native crystallization + sanctioned final write 이후:

- 사용자에게 도달하는 Phase-5 `ask`는 **정확히 1회**.
- native 네 option의 순서·value·action 유지:
  1. Refine with ralplan consensus (또는 해당 설치본의 동등 문구)
  2. Execute with ultragoal
  3. Execute with team
  4. Refine further (구조화 인터뷰 복귀)
- **같은 ask에만** plugin option 추가(추천): **대화로 더 다듬기**
- 두 번째 wrapper 메뉴 금지. native 네 option을 plain-layer가 다시 쓰지 않는다.
- 추천 문구는 본문 보강으로 두고, option identity를 바꾸지 않는다.

### Conversational polish

1. 최신 write receipt의 실제 `spec_path`를 읽고 시작한다(기억 요약 금지).
2. 점수화·한-question 강제 없음. 자유 대화.
3. 매 턴:
   - 요청을 쉬운 말로 재진술
   - **바뀌는 부분 / 그대로인 부분 / 새로 열린 질문** 구분
   - 위험 경계가 불명확할 때만 질문 1개
   - 확정된 변경만 full spec 재합성 → sanctioned writer
   - receipt/state 검증 후에만 `저장됨`. 실패 시 `저장되지 않음` + handoff 금지
4. native spec 구조·metadata 보존. `## Revision Notes`에 확인된 변경만. metadata에 `Plain-layer polish rounds`, `Last polished at` 추가.
5. `확정`/`이대로`/downstream 선택 시 final write + latest 검증 후 해당 native path 진행.
6. 구조화 인터뷰가 다시 필요하면 native **Refine further**로. plain-layer scoring loop 금지.

### Sanctioned write (session-keyed, gjc 0.10.1)

```sh
# spec 본문은 반드시 bash tool의 `env` 파라미터(GJC_DEEP_INTERVIEW_SPEC)로 주입한다 —
# 셸에 리터럴로 붙여넣지도, 스니펫 안에서 재할당하지도 말 것(주입값을 덮어쓴다).
# ⚠ 커맨드-로컬 할당(VAR=... cmd "$VAR")은 같은 명령줄의 "$VAR" 인자 확장에 적용되지 않아
#   빈 spec이 넘어간다 — env 주입 + 비어있지 않음 가드 후 호출한다.
[ -n "${GJC_DEEP_INTERVIEW_SPEC:-}" ] || { echo "empty spec — abort (write 금지)"; exit 1; }
export GJC_DEEP_INTERVIEW_SPEC
GJC_NOTIFICATIONS=0 gjc deep-interview --write --stage final \
  --session-id "$GJC_SESSION_ID" \
  --slug "$TARGET_SLUG" \
  --spec "$GJC_DEEP_INTERVIEW_SPEC" \
  --json
```

- 최초 polish working slug: `${original_base.slice(0,55)}-polished` (전체 ≤64).
- 충돌 시: `${base.slice(0,53)}-p-${originalSha.slice(0,8)}` → 그래도 충돌하면 `${base.slice(0,49)}-p-${originalSha.slice(0,12)}`. 다른 content 자동 overwrite 금지.
- JSON receipt `path`/`sha256`와 `gjc state deep-interview read --json`의 `spec_path`/`spec_sha256` 교차 확인.
- 불일치·실패 → handoff 금지. **direct `.gjc` edit 금지.**
- ralplan: latest polished 검증 후 `/skill:ralplan` (필요 시 deliberate bridge). 실행 자동 시작 금지.
- ultragoal/team: 4부 게이트 브리핑 + 사용자 명시 승인 후에만 `/skill:ultragoal` 또는 `/skill:team`.
- 사용자 명시 선택 전 어떤 downstream도 호출하지 않는다.

## 3) 승인 게이트 — gate-briefing 위임

plain-layer는 승인 포맷을 새로 만들지 않는다.  
실행 시 설치된 `gate-briefing` 정본(`skills/gate-briefing/SKILL.md`)을 **실제로 읽고** 적용한다.

정본과 **heading text token** 단위로 일치해야 하는 제목(비교 시 `###` 접두 유무는 무시, 본문 토큰 일치):

- `① 비전문가 번역`
- `② 승인의 경계`
- `③ 도메인-무지 체크리스트 (원문 근거 필수)`
- `④ 판정`

하드 불변(정본 문구와 동일 의미·동일 표기):

- 원문 없으면 정확히 `명시 없음 — 승인 전 확인 요망`
- 그 표기가 **2개 이상**이면 추천은 자동 **보류**
- 승인/반려 **실행 대행 금지** — 추천만. 사용자 명시 지시로만 결정

추가:

- pending artifact + 최신 critic/architect 원문 읽기. 실패 → 보류(축약 대체 브리핑 금지).
- ralplan 진입: “지금 승인 = 계획 합의, 실행 아님”을 경계에 명시.
- ultragoal/team: 실행 승인 — 4부 브리핑 + 별도 명시 확인 후 handoff.
- **gate-always de-dup:** 같은 artifact에 대해 이번 턴에 이미 4부 브리핑이 나왔거나 gate-always가 처리 중이면 **한 번만** 출력. heading 이중 출력 금지.
- “알아서 승인/반려해” → 대행하지 말고 확인 질문 제시.

## Status phrases (짧게)

`초안 준비` · `대화로 다듬는 중` · `수정본 저장됨` · `인계 준비` · `게이트 보류`

## Escalation

다음이면 구현/진행 중단:

- writer/state/JSON receipt capability 부재
- option identity 유지한 채 설명 불가 → option string 변조로 우회하지 말 것
- Phase-5를 단일 ask로 유지 불가(소스 변경 필요) → upstream 별도 제안
- latest pointer 의미가 session-keyed가 아님 → 계획의 다른 branch를 architect와 재결정
- gate 정본 읽기/적용 실패

## Verification hooks (구현·회귀)

- 정적: 이 파일에 native-only 경계, 3항목 해설, single Phase-5, writer 경로, exact missing marker, ≥2 보류, no proxy, no plain-always, no direct `.gjc` edit
- gate heading text tokens vs `gate-briefing/SKILL.md` 정본 일치
- installer EXPECTED에 `plain-layer` / `plain` 포함 (8/13)
