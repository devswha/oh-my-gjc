# oh-my-gajaecode (plugin)

**Gajae Code(gjc)의 oh-my 단일 플러그인.** 한 번 설치로 스킬 10개 + 커맨드 13개
(`/omg` + `/omg:*` 12개)가 전부 들어온다. `/omg:time-left`는 Linux+Bun 1.3.14+와
현재 top-level GJC SDK endpoint, `insane-review`는 ChatGPT+크로미움,
`lazycodex-gjc`는 이미 설치·로그인된 Codex CLI+LazyCodex/OMO, `session-observer` slash launcher는 Linux+Bun+tmux, `preset-fit`은 Node+`npx`가 필요하다.

## Quick Start

```sh
curl -fsSL https://raw.githubusercontent.com/devswha/oh-my-gjc/main/install.sh | bash

# curl|bash가 금지된 환경:
git clone --depth 1 https://github.com/devswha/oh-my-gjc.git
bash oh-my-gjc/install.sh

# 새 gjc 세션을 연 뒤 (또는 /move .):
/omg
```

## 들어있는 것 (스킬 10 · 커맨드 13)

### 스킬
`adaptive-response` · `no-english` · `time-left` · `extragoal` · `insane-review` · `lazycodex-gjc` · `deep-onboarding` · `session-observer` · `preset-fit` · `preset-pack`

`adaptive-response`, `no-english`, `time-left`는 자연어로 자동 활성화되지 않는다. 각각
`/omg:gate*`, `/omg:no-english`, `/omg:time-left`에서만 명시적으로 불러온다.
`no-english`는 일반 한국어 설명만 다듬으며 `ultragoal`, `ralplan`, `deep-interview`, `team` 같은
GJC 정식 이름과 코드·명령·경로·API 이름은 번역하거나 한글로 음역하지 않는다.

### 커맨드

| 커맨드 | 기능 | 전제 |
|---|---|---|
| `/omg` | 카탈로그 — 설치된 omg 스킬·커맨드 한눈에 | — |
| `/omg:setup` | 셋업 + 전제조건 확인 + 상시 토글 안내 (멱등) | — |
| `/omg:gate [on\|off]` · `/omg:gate-always [on\|off\|status]` | adaptive-response 보정 + 승인 게이트 브리핑 (이번 세션 / 상시) | — |
| `/omg:no-english [on\|off\|status]` | 현재 세션의 한국어 우선 표현 명시 토글 | — |
| `/omg:time-left [ralplan\|ultragoal]` | 현재 workflow의 남은 기계 작업 시간 범위 명시 조회 | Linux + Bun 1.3.14+ + 현재 GJC SDK endpoint |
| `/omg:fable [대상]` | Fable 5 적대적 안전 감사 (읽기전용, 심각도+파일:라인, 스팟체크) | Fable 5 모델 |
| `/omg:insane-review` | GPT-5.6 Sol Pro 웹 코드 리뷰 (API 비용 0) | ChatGPT 구독 + 크로미움 로그인 |
| `/omg:lazycodex-gjc "<작업>"` | 격리된 읽기 전용 `codex exec --ephemeral` 작업자 | 설치·로그인된 Codex + LazyCodex/OMO |
| `/omg:deep-onboarding [출력 경로]` | 저장소 분석·인터뷰 뒤 확인된 경로에 프로젝트 맵·ADR 제안·인수인계 생성 | — |
| `/omg:preset-fit [--repo\|<태스크 설명·글롭>]` | 작업 크기를 repomix로 실측해 빌트인 모델 프리셋 추천 (측정·추천 전용, 설정 무수정) | Node + `npx` |
| `/omg:preset-pack [install\|status\|remove]` | 최종 좌석표 프리셋(daily/deep/sec)을 백업 후 models.yml에 명시 병합·확인·제거 | anthropic + openai-codex + kimi-code 로그인 |
| `/omg:session-observer [--tmux omg | --session <id>]` | 기본은 호출한 현재 tmux 세션, 명시 시 선택한 GJC 세션의 JSONL 대화를 detached viewer로 읽기 전용 관찰 | Linux + Bun + tmux |

> 전제가 붙은 커맨드는 필요한 도구가 없으면 실행 시 안내하고 멈춘다.
### `time-left` SDK 경계

canonical state read로 활성 workflow를 선택하고, 현재 세션의 `session.metadata`, goal, todo,
workflow gate, runtime job을
공식 SDK v3 client로 읽어 `예상 약 N~M분`의 비확률적 남은 시간 범위를 낸다. prompt·reply·control을
보내지 않고, 사람 승인·일시정지·실패·근거 부족 상태에서는 숫자를 내지 않는다. installer가 exact
lockfile로 user-scope 전용 private runtime을 만들며 Bun/패키지 설치/endpoint가 없으면 fail-closed다.

실행 중인 ralplan·ultragoal의 시간을 보려면 workflow와 **같은 세션**에서 `/omg:time-left`를 실행한다.
skill은 session identity 일치를 강제한다. mid-turn에는 그대로 입력하고 Enter를 누르면 기본
`promptWhileBusy`가 다음 turn boundary에 대기 실행하므로 steering은 필요 없고, 활성 turn을 끊어야 할
정도로 긴급할 때만 steering을 쓴다. `/btw`는 tools 금지 contract 때문에 skill을 실행하지 못해 모델이
추측하게 되므로 이 용도에는 쓰지 않는다.

### `lazycodex-gjc` 격리 경계

이미 설치된 Codex CLI+LazyCodex/OMO를 외부 작업자로 한 번 동기 실행한다.
user-scope private SHA-256 runtime binding이 일치해야 하며 child GJC 세션, config·credential
변경, web/MCP/browser egress는 금지한다. 현재는 `read-only`만 허용하고,
동시 편집 안전성이 해결될 때까지 `workspace-write`는 fail-closed다.
선택 `LAZYCODEX_OBSERVE_LOG`로 레닥션된 이벤트 스트림을 리더 소유 로그(mode 0600)에 tee해
실시간 관찰할 수 있고, 완주한 worker의 최종 출력이 1 MiB relay 한도를 넘으면 완료 작업을
폐기하는 대신 고정 bounded summary를 exit 0으로 반환한다(#202 원자성). 발주는 통짜 대신
조각 단위가 표준이며 시각 검수는 리더 browser 몫이다.
### `session-observer` 읽기 전용 경계

`/omg:session-observer`를 인자 없이 실행하면 호출한 현재 tmux 세션을 대상으로 detached viewer를 연다.
다른 대상은 `--tmux omg` 또는 `--session <id>`로 고른다. 기본은 conversation+follow이고,
`--mode user-only`로 사용자 발화만, `--thinking`으로 선택한 thinking도 표시하며,
`--no-follow`는 snapshot으로 끝낸다.

runner는 `$HOME/.gjc/agent/sessions/...jsonl`을 tail하며 user/assistant text와 optional thinking만 출력하고 tool-call noise는 제외한다. JSONL이 안전한 기본값이고 SDK 의존성은 없다. 세션 주입·제어·쓰기와 네트워크·upstream 활동은 하지 않으며, 관찰 텍스트는 절대 GJC tool result로 되돌아가지 않는다. 직접 터미널 runner는 완전 token-free이고 `--follow` 없이 snapshot으로 끝난다. slash command는 detached tmux viewer를 띄우는 한 launch turn만 소비하고 이후 관찰은 token-free다.

저장소 checkout에서 slash launch turn 없이 직접 실행:

```sh
bun plugins/oh-my-gjc/bin/session-observer.ts --tmux omg --follow
```

### 모델 프리셋

omj는 커스텀 모델 프리셋을 설치하지 않고 `models.yml`도 수정하지 않는다. GJC의 기본 모델 구성과 내장 프리셋을 그대로 사용한다.

## 세마포어 구조

`/omg:gate-always`는 `~/.gjc/agent/SYSTEM.md`에 소유 마커 블록
(`<!-- BEGIN oh-my-gjc:gate-always -->` ~ `<!-- END ... -->`)을 넣고 빼는 방식이다.
업그레이드는 제거된 `easy-always` 마커만 백업 후 정리하며, 다른 사용자 내용은 건드리지 않는다.

## 마이그레이션

hardened installer 재실행은 이름이 바뀐 `gate-briefing`과 제거된 공개 기능
(`multivendor-presets`, `release-gate`, `easy-answer`, `plain-layer`, `branch-flow`,
`gjc-bugwatch`)의 네이티브 잔재를 정리한다. `adaptive-response`, `no-english`, `time-left`를 설치하고,
SDK 런타임은 exact lockfile과 shared/exclusive lock으로 직렬 교체한다. `lazycodex-gjc`는 유지되며 런타임 전제조건이
없을 때만 stale binding을 제거해 fail-closed 상태로 둔다. 기존 `models.yml`은 수정하지 않는다.
### 가재 앱 마이그레이션 (0.14.0)

`gajae-app` 스킬과 `/omg:gajae-app` 커맨드는 이 번들에서 분리됐다. 이 업그레이드는 기존 셀프호스트 앱 배포를 삭제하지 않는다. 설치·업데이트는 [devswha/claudecodeui SELF-HOST 문서](https://github.com/devswha/claudecodeui/blob/feat/gjc-provider/docs/SELF-HOST.md)를 따른다.

## Non-Goals

- gjc 내장 워크플로(team/ultragoal/ralplan/deep-interview) 중복 구현 — gjc가 네이티브로 잘함.
- 벤더 자동 로그인·자격증명 발급.
