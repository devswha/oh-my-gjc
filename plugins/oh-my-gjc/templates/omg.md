---
description: oh-my-gajaecode 카탈로그 — 한 번의 설치로 들어온 omg 스킬·커맨드를 한눈에 보여준다. omz(oh-my-zsh) 관례의 단일 엔트리. 인자 없이 /omg 만 입력하면 전체 목록.
argument-hint: "(인자 없음 — 전체 카탈로그)"
---

# /omg — oh-my-gajaecode 카탈로그

oh-my-gajaecode 스위트의 단일 진입점(oh-my-zsh의 `omz` 관례 계승). 이 커맨드는 **읽기 전용
안내**다 — 아래 목록을 사용자에게 그대로 정리해 보여주고, 무엇을 쓸지 물어라. 아무것도
설치·실행·변경하지 않는다. **한 번의 설치로 아래가 전부 들어온다.**

## 커맨드 (14)
- `/omg:setup` — 셋업(프리셋 병합 제안·상시 토글 안내). 멱등.
- `/omg:easy` (이번 세션) · `/omg:easy-always [on|off|status]` (항상) — 쉬운 말 최종답변.
- `/omg:gate` (이번 세션) · `/omg:gate-always [on|off|status]` (항상) — 승인 게이트 비전문가 브리핑.
- `/omg:plain [<아이디어>|off]` — 쉬운 기획(선택지 설명·인터뷰 후 대화로 스펙 다듬기·승인 시 gate 위임). 세션 한정.
- `/omg:branchflow-always [on|off|status]` — 저장소 dev/main 브랜치 규칙(레포별).
- `/omg:worktree [new <slug> [type] | list | clean]` — git worktree 병렬 작업 폴더 생성·목록·정리(branch-flow 규약).
- `/omg:presets [sol|all]` — 커스텀 프리셋 `sol` 병합(세션 기본 권장). 품질/비상/안전 레인은 gjc 빌트인 `opus-codex`/`codex-medium`/`codex-pro`/`fable-opus-codex`.
- `/omg:fable "<대상>"` — Fable 5 안전-크리티컬 적대적 감사. · 전제: Fable 5 모델 접근
- `/omg:insane-review` — GPT-5.6 Sol Pro 웹 코드 리뷰. · 전제: ChatGPT 구독 + 크로미움 로그인
- `/omg:bugwatch-scan` — gjc 자체 버그 수집(초안만).
- `/omg:lazycodex-gjc "<작업>"` — 이미 설치된 Codex+LazyCodex 외부 작업자(기본 read-only, GJC child 세션 없음). · 전제: Codex+호환 OMO+user-scope runner receipt
- `/omg:release [<버전> [<요약>]]` — 3게이트 릴리스: 검증 → fresh-context 교차리뷰(VERDICT, fail-closed) → 인간 승인(자기 승인 금지) → 머지·태그·발행 + 증거 문서.

> **전제**가 붙은 커맨드는 설치는 이미 됐고, 그 도구가 있어야 실제로 동작한다. 없으면
> 실행 시 친절히 안내하고 안전하게 멈춘다(설치를 깨뜨리지 않는다).
> 예전 개별 명령들은 폐기·제거됐다(0.8.1에서 안내 스텁까지 삭제·설치 시 자동 청소) — 지금 있는 이름은 위의 `/omg:*`가 전부다.

## 스킬 (10 · 트리거로 자동 활성)
- `easy-answer` · `gate-briefing` · `plain-layer`(쉬운 기획) · `multivendor-presets` · `branch-flow` · `extragoal`(외부 최종 리뷰 게이트)
- `insane-review` · `gjc-bugwatch` · `lazycodex-gjc` · `release-gate`(3게이트 릴리스)

## 문서
- 설치·자세히: 저장소 README. 원샷 설치: `install.sh`(curl 한 줄) / 에이전트용 `INSTALLATION.md`.
- 가재코드 가이드: https://gjc.vibetip.help/ko/docs
