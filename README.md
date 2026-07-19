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

한 번 설치로 스킬 9개 + 커맨드 12개(`/omg` + `/omg:*` 11개)가 전부 들어온다(추가 설치 없음). 업그레이드 땐 원샷 한 줄 다시.
원리·글롭 규칙 등 기여자용 상세는 AGENTS.md 참조.

</details>

## 2. 있는것

- `adaptive-response` — `/omg:gate`·`/omg:gate-always`로 명시 적용하는 응답 수준 보정 + 승인 게이트 브리핑
- `/omg:no-english` — 현재 세션의 한국어 우선 표현을 명시적으로 켜기·끄기
- `/omg:time-left` — GJC SDK v3로 실행 중인 ralplan·ultragoal의 남은 시간 범위를 명시 조회 · **Bun 1.3.14+ 필요**
- `extragoal` — 외부 최종 리뷰 게이트(무공유·교차패밀리 리뷰 후 머지)
- `/omg:fable` — 안전-크리티컬 코드 적대적 감사(돈·데이터·보안 코드) · **Fable 5 모델 필요**
- `insane-review` — GPT-5.6 Sol Pro 웹 코드 리뷰 · **ChatGPT 구독 + 크로미움 로그인 필요**
- `lazycodex-gjc` — 설치된 Codex+LazyCodex/OMO를 격리 읽기 전용 외부 작업자로 실행(`/omg:lazycodex-gjc`)
- `deep-onboarding` — 문서가 부족한 저장소를 읽기 전용 분석하고 인터뷰한 뒤, 확인된 경로에 프로젝트 맵·ADR 제안·인수인계를 생성(`/omg:deep-onboarding`)
- `session-observer` — 다른 GJC 세션의 JSONL 대화를 읽기 전용으로 실시간 관찰(`/omg:session-observer`)
- `preset-fit` — 작업의 관련 파일 집합을 repomix로 토큰 실측해 GJC 빌트인 모델 프리셋을 추천(`/omg:preset-fit`) · **Node+`npx` 필요, 설정 무수정**

커맨드 전체: `/omg`, `/omg:setup`, `/omg:gate`, `/omg:gate-always`, `/omg:no-english`, `/omg:time-left`, `/omg:fable`, `/omg:insane-review`, `/omg:lazycodex-gjc`, `/omg:deep-onboarding`, `/omg:session-observer`, `/omg:preset-fit`.

모델 구성은 GJC 기본값과 내장 프리셋을 그대로 쓴다. omj는 커스텀 모델 프리셋을 설치하거나 `models.yml`을 수정하지 않는다.

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
  `time-left`, `adaptive-response`, `/omg:fable`을 그대로 쓴다.
- 따라서 “울트라고울”, “울트라골”, “랄플랜”, “딥 인터뷰”처럼 바꾸지 않는다.

- 원문: [`plugins/oh-my-gjc/skills/no-english/SKILL.md`](./plugins/oh-my-gjc/skills/no-english/SKILL.md)

### `extragoal` — 외부 최종 리뷰 게이트

완성한 작업을 머지 전에 **작업 과정을 안 본 다른 모델**이 완성 diff만 보고 재심한다. 자기 세션 안에서
검토하는 게 아니라, 실제 PR 리뷰처럼 무공유·교차패밀리로 판정 → 승인/변경요청 verdict → 발견 정리 →
고치고 재서명하며 깨끗한 후보가 될 때까지 fix-forward → 기계적 머지.

- 리뷰어 레인: 네이티브 교차세션 gjc(기본) / `/omg:fable` / `insane-review`(GPT-5.6 Sol Pro 웹) — AND 게이트로 합침.
- fail-closed: verdict 누락·malformed·timeout은 절대 승인으로 안 친다. 시크릿 스캔은 번들이 기기 밖 나가는 레인에서 비타협.
- 켜기: 스킬 트리거로 활성. 별도 reviewer 프리셋 없이 GJC 기본 모델 구성의 교차세션 리뷰를 쓴다. 원문: [`plugins/oh-my-gjc/skills/extragoal/SKILL.md`](./plugins/oh-my-gjc/skills/extragoal/SKILL.md)

### `lazycodex-gjc` — 격리된 읽기 전용 Codex+LazyCodex 작업자

이미 설치·로그인된 **Codex CLI + LazyCodex/OMO**를 외부 `codex exec --ephemeral`
작업자로 한 번 동기 실행하고 결과만 가져온다.

- `read-only`만 허용한다. 동시 편집 안전성이 해결될 때까지 `workspace-write`는 fail-closed다.
- child GJC 세션·task를 만들지 않고 GJC config·자격증명을 복사하거나 변경하지 않는다.
- user-scope native install의 private SHA-256 runtime binding과 runner가 일치해야 실행한다.
- 쓰기: `/omg:lazycodex-gjc "읽기 전용 조사·리뷰 작업"`
- 원문: [`plugins/oh-my-gjc/skills/lazycodex-gjc/SKILL.md`](./plugins/oh-my-gjc/skills/lazycodex-gjc/SKILL.md)

### `deep-onboarding` — 문서 없는 저장소 온보딩

대상 저장소를 먼저 읽기 전용으로 분석하고, 관찰만으로 확정할 수 없는 의도와 운영 맥락을 한 번에
한 질문씩 인터뷰한다. 프로젝트 맵·ADR 제안·인수인계 초안을 미리 보여준 뒤 사용자가 출력 디렉터리를
명시적으로 확인해야만 세 Markdown 파일을 쓴다. 대상 저장소에 조용히 문서를 만들거나 기존 파일을
덮어쓰지 않는다.

- 쓰기: `/omg:deep-onboarding [출력 경로 제안]`
- 원문: [`plugins/oh-my-gjc/skills/deep-onboarding/SKILL.md`](./plugins/oh-my-gjc/skills/deep-onboarding/SKILL.md)

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

### `/omg:time-left` — ralplan·ultragoal 남은 시간

canonical `gjc state ... read --json`에서 활성 workflow를 선택한 뒤, 실행 중인 top-level GJC 세션의
SDK v3 bus에서 todo·goal·job·gate 상태를 읽고,
남은 시간을 `예상 약 N~M분`의 비확률적 휴리스틱 범위로 추정한다. 완료 시각을 보장하지 않으며 사람 승인,
일시정지, 실패·차단, 근거 부족 상태에서는 숫자 대신 재산정 조건을 보여준다.
일반 자연어 ETA 질문에는 자동 발동하지 않으며 `/omg:time-left`를 명시적으로 실행해야 한다.

실행 중인 ralplan 또는 ultragoal을 조회하려면 그 workflow를 돌리는 **같은 세션**에서 `/omg:time-left`를
실행한다. skill은 session identity 일치를 강제한다. 세션이 mid-turn이어도 명령을 입력하고 Enter를 누르면
GJC 기본 `promptWhileBusy`가 다음 turn boundary에 실행하도록 대기열에 넣으므로 steering은 필요 없다.
steering은 활성 turn을 중단하므로 정말 긴급할 때만 쓴다. `/btw`는 tools를 금지하는 contract라 skill을
실행할 수 없고 모델이 추측하게 되므로 이 용도에 적합하지 않다.

- 읽기 전용 query만 사용하며 prompt/reply/control/config를 보내지 않는다.
- transcript나 다른 세션을 읽지 않고 실행 기록을 사용자 속도 프로필로 저장하지 않는다.
- 전제: Linux, Bun 1.3.14+, GJC SDK hosting이 켜진 현재 top-level 세션.
- 원문: [`plugins/oh-my-gjc/skills/time-left/SKILL.md`](./plugins/oh-my-gjc/skills/time-left/SKILL.md)
### `session-observer` — GJC 세션 대화 읽기 전용 관찰

`/omg:session-observer`를 인자 없이 실행하면 호출한 현재 tmux 세션을 관찰하며, 다른 대상은
`--tmux omg` 또는 `--session <id>`로 고른다. 기본은 conversation 보기와 follow이며,
`--mode user-only`는 사용자 발화만, `--thinking`은 선택한 thinking도 보인다. `--no-follow`는
detached viewer를 snapshot으로 끝낸다.

runner는 `$HOME/.gjc/agent/sessions/...jsonl`을 tail해 user/assistant 텍스트와 선택한 thinking만 출력하고 tool-call noise는 출력하지 않는다. JSONL이 안전한 기본 경로이며 SDK 의존성이 없다. slash launcher에는 Linux, Bun, tmux가 필요하다.

관찰자는 읽기 전용이다. 세션에 주입·제어·쓰기하지 않고, 네트워크·upstream 활동도 하지 않으며, 관찰한 텍스트를 GJC tool result로 되돌려 보내지 않는다. 터미널에서 runner를 직접 실행하면 완전히 token-free다. slash command의 `--no-follow`와 터미널 runner의 `--follow` 생략은 snapshot으로 끝난다. slash command는 viewer를 detached tmux window에 넣는 한 번의 launch turn만 쓰며, 그 뒤의 관찰은 token-free이고 관찰 텍스트가 GJC로 돌아오지 않는다.

저장소 checkout에서 완전히 token-free로 직접 실행할 때는 다음처럼 쓴다.

```sh
bun plugins/oh-my-gjc/bin/session-observer.ts --tmux omg --follow
```

### GJC 0.11 SDK lab

`time-left`의 공식 `@gajae-code/bridge-client` 기반 읽기 전용 런타임이자 개발자용 검사 도구다.
hardened installer는 exact lockfile과 scripts-disabled 설치로 user-scope private runtime을 준비하며, 실패하면
스킬을 fail-closed로 둔다. 설치 중 Bun은 설정된 패키지 registry에 접속할 수 있고
`OMG_TIME_LEFT_RUNTIME=0`으로 런타임 설치를 끌 수 있다.

- 소스·사용법·SDK 경계: [`plugins/oh-my-gjc/tools/sdk-lab/README.md`](./plugins/oh-my-gjc/tools/sdk-lab/README.md)
- GJC 소스는 포크하거나 vendoring하지 않고 v0.11.0 SHA에 고정한 `/tmp` checkout으로 확인한다.
- upstream 수정이 실제로 필요할 때만 별도 fork에서 `dev` 대상 PR을 만든다.

### 가재 앱 마이그레이션 (0.14.0)

`gajae-app` 스킬과 `/omg:gajae-app` 커맨드는 이 번들에서 분리됐다. 이 업그레이드는 기존 셀프호스트 앱 배포를 삭제하지 않는다. 설치·업데이트는 [devswha/claudecodeui SELF-HOST 문서](https://github.com/devswha/claudecodeui/blob/feat/gjc-provider/docs/SELF-HOST.md)를 따른다.

## 라이선스

MIT. [LICENSE](./LICENSE) 봐라.
