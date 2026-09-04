---
description: oh-my-gjc 카탈로그 — 한 번의 설치로 들어온 omg 스킬·커맨드를 한눈에 보여준다. omz(oh-my-zsh) 관례의 단일 엔트리. 인자 없이 /omg 만 입력하면 전체 목록.
argument-hint: "(인자 없음 — 전체 카탈로그)"
---

# /omg — oh-my-gjc 카탈로그

oh-my-gjc 스위트의 단일 진입점(oh-my-zsh의 `omz` 관례 계승). 이 커맨드는 **읽기 전용
안내**다 — 아래 목록을 사용자에게 그대로 정리해 보여주고, 무엇을 쓸지 물어라. 아무것도
설치·실행·변경하지 않는다. **한 번의 설치로 아래가 전부 들어온다.**

## 전체 커맨드 (5)
- `/omg` — 이 카탈로그.
- `/omg:setup` — 셋업 전제조건 확인. 멱등.
- `/omg:no-english [on|off|status]` — 이번 세션의 한국어 우선 표현을 명시적으로 토글.
- `/omg:insane-review` — 검증된 ChatGPT Pro 웹 코드 리뷰. · 전제: ChatGPT 구독 + 크로미움 로그인
- `/omg:gpt-image <prompt>` — 로그인된 ChatGPT Images 웹 UI로 PNG 생성 및 로컬 provenance 저장. · 전제: ChatGPT 로그인 + 크로미움

> `insane-review`는 필요한 외부 환경이 없으면 안내하고 안전하게 멈춘다.
> 위의 `/omg:*`가 현재 공개 커맨드 전부다.

## 스킬 (5)
- `no-english`(`/omg:no-english`에서만 명시 호출) · `extragoal`(외부 최종 리뷰 게이트) · `insane-review`
- `insane-search` — 일반 URL 읽기가 차단된 공개 페이지를 공식 공개 경로와 안전한 대체 전송으로 읽는다. 일반 검색에는 활성화되지 않으며 로그인·CAPTCHA·paywall은 우회하지 않는다.
- `gpt-image` — 로그인된 ChatGPT Images 웹 UI에서 PNG를 생성하고 provenance와 함께 로컬에 저장한다.

## 문서
- 설치·자세히: 저장소 README. 원샷 설치: `install.sh`(curl 한 줄) / 에이전트용 `INSTALLATION.md`.
- 가재코드 가이드: https://gjc.vibetip.help/ko/docs
