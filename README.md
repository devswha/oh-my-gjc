# oh-my-gajaecode

가재코드 철학을 거스르는 플러그인입니다

[가재코드 가이드](https://gjc.vibetip.help/ko/docs)

## 1. 설치

**① 터미널에서:**

```
curl -fsSL https://raw.githubusercontent.com/devswha/oh-my-gjc/main/install.sh | bash
```

**② gjc 세션에서:**

```
Install oh-my-gjc by following https://raw.githubusercontent.com/devswha/oh-my-gjc/main/INSTALLATION.md — run the steps, verify, and report.
```

<details>
<summary>설치가 안되요</summary>

원샷이 막히면 아래 세 줄을 수동으로 — 원샷이 대신 해주던 것:

```
gjc plugin marketplace add devswha/oh-my-gjc
gjc plugin install oh-my-gjc@oh-my-gjc
bash "$(ls -d ~/.gjc/plugins/cache/plugins/oh-my-gjc___oh-my-gjc___*/bin/install-skill.sh 2>/dev/null | sort -V | tail -1)" all
```

v0.17.0 한 번 설치로 스킬 10개 + 커맨드 15개(`/omg` + `/omg:*` 14개)가 전부 들어온다(추가 설치 없음). 업그레이드 땐 원샷 한 줄 다시.
원리·글롭 규칙 등 기여자용 상세는 AGENTS.md 참조.

</details>

## 2. 있는것

- `easy-answer` — 쉬운 말로 답 · 상시 온·오프 가능(`/omg:easy-always`)
- `gate-briefing` — 승인 게이트 비전문가 브리핑 · 상시 온·오프 가능(`/omg:gate-always`)
- `plain-layer` — 쉬운 기획: 선택지 설명 + 인터뷰 후 대화로 스펙 다듬기 + 승인 시 gate-briefing 위임 (`/omg:plain`, 세션 한정; always 없음)
- `multivendor-presets` — 커스텀 프리셋 `sol`(전 구간 저지연, 기본 권장) 병합 + 품질/비상/안전 레인은 gjc 빌트인 안내
- `branch-flow` — dev 통합 / main 릴리스 브랜치 규칙 + git worktree 병렬 세션(`/omg:worktree`) · 상시 온·오프 가능(`/omg:branchflow-always`)
- `extragoal` — 외부 최종 리뷰 게이트(무공유·교차패밀리 리뷰 후 머지)
- `release-gate` — 3게이트 릴리스 절차(검증 → 교차리뷰 VERDICT → 인간 승인, 자기 승인 금지) (`/omg:release`)
- `lazycodex-gjc` — 설치된 Codex+LazyCodex/OMO를 격리 외부 작업자로 실행(`/omg:lazycodex-gjc`) · 기본 읽기 전용
- `/omg:fable` — 안전-크리티컬 코드 적대적 감사(돈·데이터·보안 코드) · **Fable 5 모델 필요**
- `insane-review` — GPT-5.6 Sol Pro 웹 코드 리뷰 · **ChatGPT 구독 + 크로미움 로그인 필요**
- `gjc-bugwatch` — gjc 자체 버그 수집

## 3. 자세히

### `easy-answer` — 쉬운 말로 답한다

마지막에 사람한테 하는 답을 전문용어 빼고 쉬운 말로 풀어준다. 지금 이 글처럼.
작업이나 정확성은 안 건드리고 **말투만** 바꾼다. 쉽게 쓰다 뜻 틀어질 것 같으면
원래 용어 그대로 두고 괄호로 뜻 달아준다.

- 형식: ① 한 줄 결론 → ② 쉬운 설명 → ③ (필요할 때만) 자세히 — 명령어·경로는 여기로 던진다.
- 위험·주의는 절대 안 뺀다. 쉬운 말로 꼭 알려준다.
- 켜기: `/omg:easy` (이번만) / `/omg:easy-always on` (항상)
- 원문: [`plugins/oh-my-gjc/skills/easy-answer/SKILL.md`](./plugins/oh-my-gjc/skills/easy-answer/SKILL.md)

### `gate-briefing` — 승인 게이트 비전문가 브리핑

승인/거절을 눌러야 하는 순간, 뭘 승인하는 건지 비전문가도 알게 풀어준다. 전문용어를
일상어로 옮기고 → 이 승인이 허용하는 범위 → 근거 붙은 체크리스트 → 판정까지 낸다.
대신 눌러주진 않는다 — 판단은 사람 몫이다.

- "명시 없음" 항목이 2개 이상이면 자동으로 **보류**로 민다(모르는 채 승인 방지).
- 도메인 안 가린다. 코드든 인프라든 계약이든 같은 틀로 브리핑한다.
- 켜기: `/omg:gate` (이번만) / `/omg:gate-always on` (항상)
- 원문: [`plugins/oh-my-gjc/skills/gate-briefing/SKILL.md`](./plugins/oh-my-gjc/skills/gate-briefing/SKILL.md)

### `plain-layer` — 쉬운 기획

선택지 인터뷰는 그대로 두고, 각 선택지가 **뭘 허용/배제하는지** 쉬운 말로 붙인다.
인터뷰가 끝난 뒤에는 **대화로 스펙을 더 다듬을** 수 있다(강제 객관식 루프 아님).
승인 직전에는 기존 `gate-briefing`에 위임한다(대신 승인/반려 안 함).

- 진입: `/omg:plain "아이디어"` · 끄기: `/omg:plain off`
- 네이티브 deep-interview/ralplan을 대체하지 않음. GJC ≥0.10.1 (`deep-interview --write`).
- 원문: [`plugins/oh-my-gjc/skills/plain-layer/SKILL.md`](./plugins/oh-my-gjc/skills/plain-layer/SKILL.md)

### `multivendor-presets` — 역할별 모델 묶음 프리셋

여러 회사 AI 모델을 역할별로 섞어 쓰게 미리 짜둔 묶음을 설정 파일에 꽂아준다.
(한 놈이 코드 짜고, 다른 놈이 검토하고, 또 다른 놈이 최종 점검하는 식.)

- **`sol` (커스텀, 유일)** — 전 구간 저지연: default `sol:low`, 기획 좌석도 빠름(planner `sol:high` · architect `opus:medium` · critic `opus:high`), executor는 벤치 근거 `terra:xhigh`. 실측(n=1): 신형은 수정 1회(stage 2)로 8:24에 합의 완료·플랜 산출, 구형 xhigh 좌석은 수정 3회(stage 4)를 돌고 17:18 시점에도 합의 미완 — **2배 이상 빠름** ([증거](./docs/verification/sol-v09-ralplan-bench-2026-07-14.md)).
- 나머지 용도는 **gjc 빌트인**을 그대로 쓴다(병합 불필요, gjc 업그레이드 시 자동 최신화): 품질 랄플랜 `opus-codex` · openai-codex 단일 로그인 비상 `codex-medium`/`codex-pro` · 안전-크리티컬 `fable-opus-codex`.
- 기존 설정은 안 건드리고 `sol`만 병합한다(넣기 전 백업). 옛 프리셋 정리는 동의 후.
- 쓰기: **설치 시 `sol`이 자동 병합**된다(백업·검증·실패 시 복구, v0.17.0+). 재병합/정리는 `/omg:presets` → `gjc --mpreset sol --default`(기본 고정 권장). 품질이 필요하면 그 세션만 `gjc --mpreset opus-codex`.
- 원문: [`plugins/oh-my-gjc/skills/multivendor-presets/SKILL.md`](./plugins/oh-my-gjc/skills/multivendor-presets/SKILL.md)

### `extragoal` — 외부 최종 리뷰 게이트

완성한 작업을 머지 전에 **작업 과정을 안 본 다른 모델**이 완성 diff만 보고 재심한다. 자기 세션 안에서
검토하는 게 아니라, 실제 PR 리뷰처럼 무공유·교차패밀리로 판정 → 승인/변경요청 verdict → 발견 정리 →
(최대 2라운드) 고치고 재서명 → 기계적 머지.

- 리뷰어 레인: 네이티브 교차세션 gjc(기본) / `/omg:fable` / `insane-review`(GPT-5.6 Sol Pro 웹) — AND 게이트로 합침.
- fail-closed: verdict 누락·malformed·timeout은 절대 승인으로 안 친다. 시크릿 스캔은 번들이 기기 밖 나가는 레인에서 비타협.
- 켜기: 스킬 트리거로 활성. 옛 `reviewer` mpreset은 v0.4에서 정본 제외(교차 패밀리 원샷 레인으로 충분). 원문: [`plugins/oh-my-gjc/skills/extragoal/SKILL.md`](./plugins/oh-my-gjc/skills/extragoal/SKILL.md)

### `branch-flow` — 저장소 브랜치 규칙

작업은 `dev`에서 하고, 다 되면 릴리스할 때만 `main`으로 넘긴다.
`main`은 직접 안 건드린다. 이 규칙은 저장소 안에 저장돼서 같이 따라다닌다.

- 흐름: 작업 브랜치 → `dev`에 합치기 → (명시적 지시 있을 때만) `dev`를 `main`으로 릴리스.
- 사용자 허락 없이 저장·합치기·릴리스 안 한다. 남의 작업은 안 건드린다.
- 켜기: `/omg:branchflow-always on` (`off` / `status`로 확인)
- 원문: [`plugins/oh-my-gjc/skills/branch-flow/SKILL.md`](./plugins/oh-my-gjc/skills/branch-flow/SKILL.md)

### `lazycodex-gjc` — 격리된 Codex+LazyCodex 외부 작업자

이미 설치·로그인된 **Codex CLI + LazyCodex/OMO**를 외부 `codex exec --ephemeral` 작업자로
한 번 동기 실행하고 결과만 가져온다. 기본은 `read-only`; 사용자가 이번 요청에서 대상 저장소
수정을 명시적으로 허용했을 때만 그 저장소에 `workspace-write`를 쓴다.

- child GJC 세션·task를 만들지 않고, GJC config·자격증명도 변경하거나 외부 작업자에게 복사하지 않는다.
- Codex/LazyCodex/OMO 설치·업데이트·로그인은 자동화하지 않는다. 준비돼 있지 않으면 안내하고 멈춘다.
- native user install의 private SHA-256 receipt와 canonical user cache runner가 일치해야 한다. project install만으로는 이 민감 bridge를 실행하지 않는다.
- 호환 OMO ultrawork를 검증한 뒤 custom permission profile로 대상 저장소, 정확한 Codex runtime helper, private tmp만 노출한다. web/MCP/apps/hooks/browser egress와 child shell 환경 상속은 비활성화하며 raw child stderr를 전달하지 않는다.
- 쓰기: `/omg:lazycodex-gjc "<작업>"`
- 원문: [`plugins/oh-my-gjc/skills/lazycodex-gjc/SKILL.md`](./plugins/oh-my-gjc/skills/lazycodex-gjc/SKILL.md)

### `/omg:fable` — 안전-크리티컬 코드 적대적 감사

돈·데이터·보안 걸린 코드를 Fable 5 모델로 적대적 감사한다. 설계 리뷰가 아니라
"이 안전장치들이 **동시에** 터지는 시나리오가 있나"를 판다. 읽기 전용, 심각도 +
파일:라인 + 재현 시나리오로 보고한다.

- 스코프는 파일 3~6개만. 넘으면 감사가 얕아진다.
- 보고서 상위 발견은 실코드랑 대조(스팟체크)한 뒤에만 브리핑한다. 억지 결함 안 만든다.
- `:max` 금지 — Fable은 조용히 `xhigh`로 깎인다. Fable이 거부하면 `opus-4-8`로 대체한다.
- 쓰기: `/omg:fable "주문 경로와 손절 로직"`
- 원문: [`plugins/oh-my-gjc/templates/fable.md`](./plugins/oh-my-gjc/templates/fable.md)

### `insane-review` — GPT-5.6 Sol Pro 웹 리뷰

GPT-5.6 Sol Pro는 웹 구독에서만 되고 API가 없다. 이 스킬이 구독 ChatGPT 웹을 CDP로
자동화해서 Pro를 gjc 안으로 끌어온다. API 비용 0. 코드를 통째로 넣는 게 아니라
관련 타겟만 골라 repomix로 묶어 넣고 리뷰를 회수한다.

- 전제: ChatGPT 구독 + 크로미움 로그인(설치는 원샷에 포함, 로그인은 자동 안 됨).
- 크로미움 브라우저를 전용 프로필로 디버그포트(9222)에 띄우고, chatgpt.com 로그인 + GPT-5.6 Sol Pro 선택해야 한다. 로그인은 자동 안 된다.
- 결과는 프로젝트의 `.insane-review/`에 저장한다.
- 원문: [`plugins/oh-my-gjc/skills/insane-review/SKILL.md`](./plugins/oh-my-gjc/skills/insane-review/SKILL.md)

### `gjc-bugwatch` — gjc 버그 수집

gjc 쓰다가 로그에 남은 gjc 자체 버그를 긁어모은다. `~/.gjc/logs`를 훑어 런타임
에러·크래시를 뽑고, 중복 묶고, 개인정보 지우고, gajae-code clone에서 재현·근거
확인한 뒤 초안만 만든다. 자동 PR 없다 — 제출은 사람이 한다.

- 전제 없음 — 설치 후 바로 동작.
- 라이브 모니터(뜨는 즉시 알림) + 배치 스캐너(쌓인 로그 몰아 읽기) 두 축이다.
- 이미 고쳐진 버그는 resolved 원장으로 걸러서 다시 안 쫓는다.
- 초안은 프로젝트의 `.gjc/bugwatch/drafts/`에 저장한다.
- 원문: [`plugins/oh-my-gjc/skills/gjc-bugwatch/SKILL.md`](./plugins/oh-my-gjc/skills/gjc-bugwatch/SKILL.md)

### 가재 앱 마이그레이션 (0.14.0)

`gajae-app` 스킬과 `/omg:gajae-app` 커맨드는 이 번들에서 분리됐다. 이 업그레이드는 기존 셀프호스트 앱 배포를 삭제하지 않는다. 설치·업데이트는 [devswha/claudecodeui SELF-HOST 문서](https://github.com/devswha/claudecodeui/blob/feat/gjc-provider/docs/SELF-HOST.md)를 따른다.

## 라이선스

MIT. [LICENSE](./LICENSE) 봐라.
