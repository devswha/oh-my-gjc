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

원샷이 막히면 저장소를 받아 같은 hardened installer를 실행한다:

```
git clone --depth 1 https://github.com/devswha/oh-my-gjc.git
bash oh-my-gjc/install.sh
```

한 번 설치로 스킬 7개 + 커맨드 10개(`/omg` + `/omg:*` 9개)가 전부 들어온다(추가 설치 없음). 업그레이드 땐 원샷 한 줄 다시.
원리·글롭 규칙 등 기여자용 상세는 AGENTS.md 참조.

</details>

## 2. 있는것

### 스킬

- `adaptive-response` — `/omg:gate`·`/omg:gate-always`로 명시 적용하는 응답 수준 보정 + 승인 게이트 브리핑
- `no-english` — 현재 세션의 한국어 우선 표현을 명시적으로 켜기·끄기(`/omg:no-english`)
- `extragoal` — 외부 최종 리뷰 게이트(무공유·교차패밀리 리뷰 후 머지)
- `insane-review` — GPT-5.6 Sol Pro 웹 코드 리뷰 · **ChatGPT 구독 + 크로미움 로그인 필요**
- `deep-onboarding` — 문서가 부족한 저장소를 읽기 전용 분석하고 인터뷰한 뒤, 확인된 경로에 프로젝트 맵·ADR 제안·인수인계를 생성(`/omg:deep-onboarding`)
- `preset-pack` — 확정 프리셋 2개(daily=사람 / agent=무인)를 백업 후 `models.yml`에 명시 병합(`/omg:preset-pack`) · **daily는 anthropic+openai-codex+kimi-code, agent는 anthropic+openai-codex 로그인 필요, 명시 호출 시에만 수정**
- `multi-harness-research` — 같은 조사 과제를 정확한 네 개의 읽기 전용 하니스에 직접 분배하고, 프로젝트 밖 XDG 결과만 보존하는 명시 전용 조사(`/omg:multi-harness`) · **Linux + bwrap + 네 공급자 기존 로그인 필요**

### 커맨드

- `/omg:fable` — 안전-크리티컬 코드 적대적 감사(돈·데이터·보안 코드) · **Fable 5 모델 필요**
- 전체: `/omg`, `/omg:setup`, `/omg:gate`, `/omg:gate-always`, `/omg:no-english`, `/omg:fable`, `/omg:insane-review`, `/omg:deep-onboarding`, `/omg:preset-pack`, `/omg:multi-harness`.

### v0.25 묘비

- `time-left`와 `tools/sdk-lab`: ETA가 사용할 수 있는 측정값을 제공하지 못해 제거했다.
- `lazycodex-gjc`: 사용할 수 있는 Codex 인증/토큰이 없었고 GJC 네이티브 워크플로와 multi-harness가 위임을 충당해 제거했다.
- 업그레이드는 번들이 소유한 native skill, command, runtime, receipt만 제거한다. 자격증명, `~/.codex`, `models.yml`, 사용자 LazyCodex/OMO, 다른 runtime은 절대 제거하지 않는다.

모델 구성은 기본적으로 GJC 내장 프리셋을 쓴다. 설치 스크립트는 `models.yml`을 절대 수정하지 않으며, 커스텀 프리셋(daily/agent)은 사용자가 `/omg:preset-pack`을 명시 호출했을 때만 백업 후 이름 단위로 병합된다.

## 3. 자세히

### `adaptive-response` — 일반 응답 보정 + 승인 게이트 브리핑

현재 대화에서 확인된 도메인 숙련도·설명 밀도·의사결정 역할로 **임시 응답 페르소나**를 만들고,
입문에는 용어 풀이와 예시, 실무에는 계약·흐름·복구, 전문에는 불변식·경계조건·증거를 우선한다.
승인/거절 순간에는 수준 맞춤 번역 → 승인의 경계 → 근거 체크리스트 → 판정까지 낸다.
표현만 조정하며 안전장치·경고·승인 권한은 줄이지 않고, 대신 승인/반려를 실행하지도 않는다.

- "명시 없음" 항목이 2개 이상이면 자동으로 **보류**로 민다(모르는 채 승인 방지).
- 도메인 안 가린다. 코드든 인프라든 계약이든 같은 틀로 브리핑한다.
- 추론한 페르소나 정보는 저장하지 않는다. 현재 세션·현재 작업·사용자가 지정한 파일만 근거로 쓰고, 홈·브라우저·자격증명·private memory는 페르소나 목적으로 탐색하지 않는다.
- 켜기: `/omg:gate` (이번 세션의 모든 응답) / `/omg:gate-always on` (프로젝트 `.gjc/SYSTEM.md`가 우선하지 않는 새 세션의 기본값)
- 원문: [`plugins/oh-my-gjc/skills/adaptive-response/SKILL.md`](./plugins/oh-my-gjc/skills/adaptive-response/SKILL.md)

### `no-english` — 한국어 우선 표현

한국어 대화에서 문장의 뼈대를 한국어로 유지하고, 안정된 번역이 있는 영어 명사는 자연스러운 한국어로
바꾼다. 코드 식별자·명령·경로·파일명·API 이름·오류 원문·정확한 라벨은 그대로 보존하며,
번역이 기술적 의미나 검색 가능성을 해치면 첫 등장에 원어를 병기한다.

- GJC 정식 이름은 번역·음역하지 않는다. `ultragoal`, `ralplan`, `deep-interview`, `team`,
  `adaptive-response`, `/omg:fable`을 그대로 쓴다.
- 따라서 “울트라고울”, “울트라골”, “랄플랜”, “딥 인터뷰”처럼 바꾸지 않는다.

- 원문: [`plugins/oh-my-gjc/skills/no-english/SKILL.md`](./plugins/oh-my-gjc/skills/no-english/SKILL.md)

### `extragoal` — 외부 최종 리뷰 게이트

완성한 작업을 머지 전에 **작업 과정을 안 본 다른 모델**이 완성 diff만 보고 재심한다. 자기 세션 안에서
검토하는 게 아니라, 실제 PR 리뷰처럼 무공유·교차패밀리로 판정 → 승인/변경요청 verdict → 발견 정리 →
고치고 재서명하며 깨끗한 후보가 될 때까지 fix-forward → 기계적 머지.

- 리뷰어 레인: 네이티브 교차세션 gjc(기본) / `/omg:fable` / `insane-review`(GPT-5.6 Sol Pro 웹) — AND 게이트로 합침.
- fail-closed: verdict 누락·malformed·timeout은 절대 승인으로 안 친다. 시크릿 스캔은 번들이 기기 밖 나가는 레인에서 비타협.
- 켜기: 스킬 트리거로 활성. 별도 reviewer 프리셋 없이 GJC 기본 모델 구성의 교차세션 리뷰를 쓴다. 원문: [`plugins/oh-my-gjc/skills/extragoal/SKILL.md`](./plugins/oh-my-gjc/skills/extragoal/SKILL.md)

### `deep-onboarding` — 문서 없는 저장소 온보딩

대상 저장소를 먼저 읽기 전용으로 분석하고, 관찰만으로 확정할 수 없는 의도와 운영 맥락을 한 번에
한 질문씩 인터뷰한다. 프로젝트 맵·ADR 제안·인수인계 초안을 미리 보여준 뒤 사용자가 출력 디렉터리를
명시적으로 확인해야만 세 Markdown 파일을 쓴다. 대상 저장소에 조용히 문서를 만들거나 기존 파일을
덮어쓰지 않는다.

- 쓰기: `/omg:deep-onboarding [출력 경로 제안]`
- 원문: [`plugins/oh-my-gjc/skills/deep-onboarding/SKILL.md`](./plugins/oh-my-gjc/skills/deep-onboarding/SKILL.md)

### `multi-harness-research` — 네 하니스의 동일 과제 읽기 전용 조사

자연어 요청으로는 절대 자동 활성화하지 않으며 `/omg:multi-harness` 또는 명시 스킬 호출에서만 실행한다.
인자가 없으면 현재 GJC 리더가 한 문장 목표·조사 질문·기대 산출물을 먼저 보여 주고 확인을 받는다.
확인된 정규화 과제 바이트와 동일한 안전/출력 suffix 하나를 SHA-256으로 기록해, 다음 순서의 정확한 네
하니스에만 직접 분배한다. `gjc team`은 쓰지 않는다.

1. `gjc-opus` — GJC 0.11.x `anthropic/claude-opus-4-8`, `--thinking max`
2. `gjc-sol` — GJC 0.11.x `openai-codex/gpt-5.6-sol`, `--thinking xhigh`
3. `codex-sol` — Codex CLI `gpt-5.6-sol`, `model_reasoning_effort="xhigh"`, `exec --ephemeral`
4. `claude-ultracode` — Claude Code `-p --no-session-persistence --effort ultracode`

- 전제: Linux user namespace와 `bwrap`, 지원되는 정확한 자격증명 파일 형식, 그리고 네 CLI의 **기존**
  로그인이 모두 필요하다. runner는 설치·업데이트·마이그레이션·로그인을 하지 않으며 모델·effort·하니스를
  대체하거나 fallback하지 않는다. 현재 Codex OAuth live 응답은 **401 pending-environment**이며,
  이를 성공으로 바꾸어 주장하지 않는다.
- target은 bubblewrap으로 읽기 전용이고 target `.gjc`와 mutable Git 상태는 노출하지 않는다. GJC/Claude 레인은 read/search/find 및
  provider-native web만 허용하고 내장 Bash, Write, Edit, Notebook, browser/MCP/hooks/extensions/skills/rules를
  노출하지 않는다. Codex는 별도 read-only profile에서 shell network를 끄고 provider-native web만 쓴다.
- 자격증명은 GJC `${XDG_DATA_HOME:-$HOME/.local/share}/gjc/auth.json`, Codex
  `${CODEX_HOME:-$HOME/.codex}/auth.json`, Claude `$HOME/.claude/.credentials.json`의 검증된 단일 regular
  파일만 각 private sandbox에 read-only bind한다. 넓은 HOME/auth directory bind, token 환경변수, credential
  discovery는 없다.
- orchestrator와 no-model finalizer만 프로젝트 밖
  `${XDG_DATA_HOME:-$HOME/.local/share}/oh-my-gjc/multi-harness/<repo-id>/<run-id>/`에 쓴다
  (디렉터리 `0700`, 파일 `0600`, no-follow/atomic publication). worker는 target과 artifact 모두에 쓰지 못한다.
  uninstall은 이 XDG 조사 산출물이나 auth/config를 지우지 않는다.
- 모든 lane 종료 뒤 1단계가 불변 lane 사실·실패 ledger·`comparison_status: pending`의 factual base summary를
  seal한다. 네 성공이면 `COMPLETE`/exit `0`, 일부 성공이면 `INCOMPLETE`/`10`, 유효 결과 없음 또는 run fatal이면
  `1`이다. 성공한 문서는 다른 lane 실패에도 남는다.
- 그 뒤 **현재 GJC 리더**만 성공 문서를 읽어 비권위적 commonalities/differences와 불확실성을 작성한다.
  2단계 no-model finalizer가 receipt·nonce·digest·불변 lane 사실을 재검증해 비교 placeholder만 원자적으로
  바꾼다. finalizer 실패는 `FINALIZATION_FAILED`/`20`으로 따로 보고하며 lane 결과·exit·artifact를 바꾸지
  않는다. 다섯째 모델, winner/majority/vote/consensus/ranking/recommendation/final verdict는 없다.

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

### 가재 앱 마이그레이션 (0.14.0)

`gajae-app` 스킬과 `/omg:gajae-app` 커맨드는 이 번들에서 분리됐다. 이 업그레이드는 기존 셀프호스트 앱 배포를 삭제하지 않는다. 설치·업데이트는 [devswha/claudecodeui SELF-HOST 문서](https://github.com/devswha/claudecodeui/blob/feat/gjc-provider/docs/SELF-HOST.md)를 따른다.

## 라이선스

MIT. [LICENSE](./LICENSE) 봐라.
