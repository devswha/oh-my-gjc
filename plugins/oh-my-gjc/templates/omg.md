---
description: oh-my-gajaecode 카탈로그 — 한 번의 설치로 들어온 omg 스킬·커맨드를 한눈에 보여준다. omz(oh-my-zsh) 관례의 단일 엔트리. 인자 없이 /omg 만 입력하면 전체 목록.
argument-hint: "(인자 없음 — 전체 카탈로그)"
---

# /omg — oh-my-gajaecode 카탈로그

oh-my-gajaecode 스위트의 단일 진입점(oh-my-zsh의 `omz` 관례 계승). 이 커맨드는 **읽기 전용
안내**다 — 아래 목록을 사용자에게 그대로 정리해 보여주고, 무엇을 쓸지 물어라. 아무것도
설치·실행·변경하지 않는다. **한 번의 설치로 아래가 전부 들어온다.**

## 전체 커맨드 (12)
- `/omg` — 이 카탈로그.
- `/omg:setup` — 셋업(전제조건 확인·상시 토글 안내). 멱등.
- `/omg:gate` (이번 세션) · `/omg:gate-always [on|off|status]` (항상) — 근거 기반 응답 수준 보정 + 승인 게이트 맞춤 브리핑.
- `/omg:no-english [on|off|status]` — 이번 세션의 한국어 우선 표현을 명시적으로 토글.
- `/omg:time-left [ralplan|ultragoal]` — 현재 workflow의 SDK 기반 남은 시간 범위를 명시 조회. · 전제: Linux+Bun 1.3.14+와 현재 GJC SDK endpoint
- `/omg:fable "<대상>"` — Fable 5 안전-크리티컬 적대적 감사. · 전제: Fable 5 모델 접근
- `/omg:insane-review` — GPT-5.6 Sol Pro 웹 코드 리뷰. · 전제: ChatGPT 구독 + 크로미움 로그인
- `/omg:lazycodex-gjc "<작업>"` — 격리된 읽기 전용 Codex+LazyCodex 외부 작업자. · 전제: 설치·로그인된 Codex+호환 OMO+user runtime binding
- `/omg:session-observer --tmux NAME|--session ID [--mode conversation|user-only] [--thinking] [--no-follow] [--history N]` — detached tmux 창에서 JSONL 기반 GJC 대화를 토큰 없이 읽기 전용 관찰. 명시 호출 전용.
- `/omg:deep-onboarding [출력 경로]` — 문서가 부족한 저장소를 분석·인터뷰하고, 경로 재확인 뒤 프로젝트 맵·ADR 제안·인수인계를 생성.
- `/omg:preset-pack [install|status|remove]` — omg 최종 좌석표 프리셋(daily/deep/sec)을 백업 후 models.yml에 명시 병합·확인·제거. · 전제: anthropic+openai-codex+kimi-code 로그인

> `/omg:time-left`, `insane-review`, `lazycodex-gjc`는 필요한 런타임·외부 환경이 없으면 안내하고 안전하게 멈춘다.
> 위의 `/omg:*`가 현재 공개 커맨드 전부다.

## 스킬 (9)
- `adaptive-response`(`/omg:gate*`에서만 명시 호출) · `no-english`(`/omg:no-english`에서만 명시 호출) · `time-left`(`/omg:time-left`에서만 명시 호출) · `extragoal`(외부 최종 리뷰 게이트) · `insane-review` · `lazycodex-gjc`(읽기 전용) · `deep-onboarding`(분석·인터뷰 후 확인된 경로에만 문서 생성) · `session-observer`(`/omg:session-observer`에서만 명시 호출; token-free 읽기 전용) · `preset-pack`(`/omg:preset-pack`에서만 명시 호출; 백업 후 이름 단위 병합)

## 문서
- 설치·자세히: 저장소 README. 원샷 설치: `install.sh`(curl 한 줄) / 에이전트용 `INSTALLATION.md`.
- 가재코드 가이드: https://gjc.vibetip.help/ko/docs
