# oh-my-gajaecode (plugin)

**Gajae Code(gjc)의 oh-my 단일 플러그인.** 한 번 설치로 스킬 3개 + 커맨드 6개
(`/omg` + `/omg:*` 5개)가 전부 들어오고, 모두 네이티브 `/omg:*` 커맨드와 트리거 스킬로 뜬다.
전제조건은 insane-review의 ChatGPT 구독 + 크로미움 로그인뿐이다.

## Quick Start

```sh
curl -fsSL https://raw.githubusercontent.com/devswha/oh-my-gjc/main/install.sh | bash

# curl|bash가 금지된 환경:
git clone --depth 1 https://github.com/devswha/oh-my-gjc.git
bash oh-my-gjc/install.sh

# 새 gjc 세션을 연 뒤 (또는 /move .):
/omg
```

## 들어있는 것 (스킬 3 · 커맨드 6)

### 스킬 (자연어 트리거 자동활성화)
`gate-briefing` · `extragoal` · `insane-review`

### 커맨드

| 커맨드 | 기능 | 전제 |
|---|---|---|
| `/omg` | 카탈로그 — 설치된 omg 스킬·커맨드 한눈에 | — |
| `/omg:setup` | 셋업 + 전제조건 확인 + 상시 토글 안내 (멱등) | — |
| `/omg:gate [on\|off]` · `/omg:gate-always [on\|off\|status]` | 게이트 브리핑 (이번 세션 / 상시) | — |
| `/omg:fable [대상]` | Fable 5 적대적 안전 감사 (읽기전용, 심각도+파일:라인, 스팟체크) | Fable 5 모델 |
| `/omg:insane-review` | GPT-5.6 Sol Pro 웹 코드 리뷰 (API 비용 0) | ChatGPT 구독 + 크로미움 로그인 |

> 전제가 붙은 커맨드는 필요한 도구가 없으면 실행 시 안내하고 멈춘다.
### 모델 프리셋

omj는 커스텀 모델 프리셋을 설치하지 않고 `models.yml`도 수정하지 않는다. GJC의 기본 모델 구성과 내장 프리셋을 그대로 사용한다.

## 세마포어 구조

`/omg:gate-always`는 `~/.gjc/agent/SYSTEM.md`에 소유 마커 블록
(`<!-- BEGIN oh-my-gjc:gate-always -->` ~ `<!-- END ... -->`)을 넣고 빼는 방식이다.
업그레이드는 제거된 `easy-always` 마커만 백업 후 정리하며, 다른 사용자 내용은 건드리지 않는다.

## 마이그레이션

hardened installer 재실행은 제거된 공개 기능(`multivendor-presets`, `release-gate`,
`easy-answer`, `plain-layer`, `branch-flow`, `gjc-bugwatch`, `lazycodex-gjc`)의 네이티브
스킬·커맨드·런타임 잔재를 정리한다. 기존 `models.yml`은 사용자 설정이므로 자동으로
삭제하거나 수정하지 않는다.
### 가재 앱 마이그레이션 (0.14.0)

`gajae-app` 스킬과 `/omg:gajae-app` 커맨드는 이 번들에서 분리됐다. 이 업그레이드는 기존 셀프호스트 앱 배포를 삭제하지 않는다. 설치·업데이트는 [devswha/claudecodeui SELF-HOST 문서](https://github.com/devswha/claudecodeui/blob/feat/gjc-provider/docs/SELF-HOST.md)를 따른다.

## Non-Goals

- gjc 내장 워크플로(team/ultragoal/ralplan/deep-interview) 중복 구현 — gjc가 네이티브로 잘함.
- 벤더 자동 로그인·자격증명 발급.
