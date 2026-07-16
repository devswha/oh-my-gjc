# oh-my-gajaecode (plugin)

**Gajae Code(gjc)의 oh-my 단일 플러그인.** 한 번 설치로 스킬 6개 + 커맨드 7개
(`/omg` + `/omg:*` 6개)가 전부 들어온다. `workflow-eta`는 Linux+Bun 1.3.14+와
현재 top-level GJC SDK endpoint, `insane-review`는 ChatGPT+크로미움,
`lazycodex-gjc`는 이미 설치·로그인된 Codex CLI+LazyCodex/OMO가 필요하다.

## Quick Start

```sh
curl -fsSL https://raw.githubusercontent.com/devswha/oh-my-gjc/main/install.sh | bash

# curl|bash가 금지된 환경:
git clone --depth 1 https://github.com/devswha/oh-my-gjc.git
bash oh-my-gjc/install.sh

# 새 gjc 세션을 연 뒤 (또는 /move .):
/omg
```

## 들어있는 것 (스킬 6 · 커맨드 7)

### 스킬 (자연어 트리거 자동활성화)
`adaptive-response` · `no-english` · `workflow-eta` · `extragoal` · `insane-review` · `lazycodex-gjc`

`no-english`는 일반 한국어 설명만 다듬으며 `ultragoal`, `ralplan`, `deep-interview`, `team` 같은
GJC 정식 이름과 코드·명령·경로·API 이름은 번역하거나 한글로 음역하지 않는다.

### 커맨드

| 커맨드 | 기능 | 전제 |
|---|---|---|
| `/omg` | 카탈로그 — 설치된 omg 스킬·커맨드 한눈에 | — |
| `/omg:setup` | 셋업 + 전제조건 확인 + 상시 토글 안내 (멱등) | — |
| `/omg:gate [on\|off]` · `/omg:gate-always [on\|off\|status]` | adaptive-response 보정 + 승인 게이트 브리핑 (이번 세션 / 상시) | — |
| `/omg:fable [대상]` | Fable 5 적대적 안전 감사 (읽기전용, 심각도+파일:라인, 스팟체크) | Fable 5 모델 |
| `/omg:insane-review` | GPT-5.6 Sol Pro 웹 코드 리뷰 (API 비용 0) | ChatGPT 구독 + 크로미움 로그인 |
| `/omg:lazycodex-gjc "<작업>"` | 격리된 읽기 전용 `codex exec --ephemeral` 작업자 | 설치·로그인된 Codex + LazyCodex/OMO |

> 전제가 붙은 커맨드는 필요한 도구가 없으면 실행 시 안내하고 멈춘다.
### `workflow-eta` SDK 경계

canonical state read로 활성 workflow를 선택하고, 현재 세션의 `session.metadata`, goal, todo,
workflow gate, runtime job을
공식 SDK v3 client로 읽어 `예상 약 N~M분`의 비확률적 남은 시간 범위를 낸다. prompt·reply·control을
보내지 않고, 사람 승인·일시정지·실패·근거 부족 상태에서는 숫자를 내지 않는다. installer가 exact
lockfile로 user-scope 전용 private runtime을 만들며 Bun/패키지 설치/endpoint가 없으면 fail-closed다.


### `lazycodex-gjc` 격리 경계

이미 설치된 Codex CLI+LazyCodex/OMO를 외부 작업자로 한 번 동기 실행한다.
user-scope private SHA-256 runtime binding이 일치해야 하며 child GJC 세션, config·credential
변경, web/MCP/browser egress는 금지한다. 현재는 `read-only`만 허용하고,
동시 편집 안전성이 해결될 때까지 `workspace-write`는 fail-closed다.
### 모델 프리셋

omj는 커스텀 모델 프리셋을 설치하지 않고 `models.yml`도 수정하지 않는다. GJC의 기본 모델 구성과 내장 프리셋을 그대로 사용한다.

## 세마포어 구조

`/omg:gate-always`는 `~/.gjc/agent/SYSTEM.md`에 소유 마커 블록
(`<!-- BEGIN oh-my-gjc:gate-always -->` ~ `<!-- END ... -->`)을 넣고 빼는 방식이다.
업그레이드는 제거된 `easy-always` 마커만 백업 후 정리하며, 다른 사용자 내용은 건드리지 않는다.

## 마이그레이션

hardened installer 재실행은 이름이 바뀐 `gate-briefing`과 제거된 공개 기능
(`multivendor-presets`, `release-gate`, `easy-answer`, `plain-layer`, `branch-flow`,
`gjc-bugwatch`)의 네이티브 잔재를 정리한다. `adaptive-response`, `no-english`, `workflow-eta`를 설치하고,
SDK 런타임은 exact lockfile과 shared/exclusive lock으로 직렬 교체한다. `lazycodex-gjc`는 유지되며 런타임 전제조건이
없을 때만 stale binding을 제거해 fail-closed 상태로 둔다. 기존 `models.yml`은 수정하지 않는다.
### 가재 앱 마이그레이션 (0.14.0)

`gajae-app` 스킬과 `/omg:gajae-app` 커맨드는 이 번들에서 분리됐다. 이 업그레이드는 기존 셀프호스트 앱 배포를 삭제하지 않는다. 설치·업데이트는 [devswha/claudecodeui SELF-HOST 문서](https://github.com/devswha/claudecodeui/blob/feat/gjc-provider/docs/SELF-HOST.md)를 따른다.

## Non-Goals

- gjc 내장 워크플로(team/ultragoal/ralplan/deep-interview) 중복 구현 — gjc가 네이티브로 잘함.
- 벤더 자동 로그인·자격증명 발급.
